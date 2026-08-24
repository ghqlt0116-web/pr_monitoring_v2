import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import { sendTelegramAlert } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
    // 1. 보안 헤더 검증 (X-Ingest-Secret)
    const ingestSecret = req.headers.get('x-ingest-secret') || req.headers.get('X-Ingest-Secret');
    const expectedSecret = process.env.INGEST_SECRET;

    if (!expectedSecret || ingestSecret !== expectedSecret) {
        console.warn('[Ruliweb Ingest] Unauthorized request attempt');
        return NextResponse.json({ error: 'Unauthorized: Invalid or missing secret' }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { html } = body;

        if (!html || typeof html !== 'string') {
            return NextResponse.json({ error: 'Invalid body: "html" string is required' }, { status: 400 });
        }

        // 2. HTML 파싱 (루리웹 PC / 모바일 / RSS 호환)
        const posts: { id: string; title: string; url: string }[] = [];
        const $ = cheerio.load(html);

        // PC 게시판 및 모바일 목록 셀렉터 전체 대응
        const selectors = [
            'table.board_list_table tr.table_body td.subject a.subject_link',
            'table.board_list_table tr.table_body td.subject a.text_over',
            'table.board_list_table td.subject a',
            '.list_body a.subject',
            '.list_body a.title',
            'a.subject',
            'a.title',
            'a.subject_link',
            'a[href*="/read/"]'
        ];

        $(selectors.join(', ')).each((i, el) => {
            const href = $(el).attr('href') || '';
            const noMatch = href.match(/read\/(\d+)/);
            let title = $(el).clone().children().remove().end().text().trim(); // 자식 태그(댓글수 등) 제외한 순수 텍스트
            if (!title) {
                title = $(el).text().trim();
            }

            if (noMatch && title && title.length > 1) {
                const postId = noMatch[1];
                if (!posts.some(p => p.id === postId)) {
                    // 댓글 수 및 공백 정리
                    const cleanTitle = title.replace(/\s+/g, ' ').replace(/\[\d+\]$/, '').replace(/\(\d+\)$/, '').trim();
                    const fullUrl = href.startsWith('http') 
                        ? href 
                        : (href.startsWith('/') ? `https://bbs.ruliweb.com${href}` : `https://bbs.ruliweb.com/${href}`);
                    posts.push({ id: postId, title: cleanTitle, url: fullUrl });
                }
            }
        });

        console.log(`[Ruliweb Ingest] Successfully parsed ${posts.length} posts from ingested HTML`);

        if (posts.length === 0) {
            return NextResponse.json({ 
                success: true, 
                message: 'HTML parsed, but no posts found (Check if Cloudflare block page was sent)',
                parsedCount: 0 
            });
        }

        // 3. 타겟 및 키워드 조회
        const targets = await (prisma as any).realtimeCommunityTarget.findMany({ 
            where: { siteType: 'RULIWEB', isActive: true } 
        });
        const keywords = await (prisma as any).realtimeKeyword.findMany({ 
            where: { isActive: true } 
        });

        if (targets.length === 0 || keywords.length === 0) {
            return NextResponse.json({ 
                success: true, 
                message: 'Parsed successfully, but no active RULIWEB target or keywords configured',
                parsedCount: posts.length 
            });
        }

        let totalNewAlerts = 0;

        for (const target of targets) {
            const maxScrapedId = target.lastScrapedPostId || '0';
            const parsedMaxId = parseInt(maxScrapedId, 10) || 0;
            let newMaxId = maxScrapedId;

            // 최신 글부터 검사 (ID 기준 오름차순/내림차순 정렬 대응)
            for (const post of posts) {
                const currentPostId = parseInt(post.id, 10) || 0;
                if (currentPostId > parsedMaxId) {
                    // 키워드 매칭 검사
                    let matchedKeywords: string[] = [];
                    for (const kwObj of keywords) {
                        if (checkKeywordMatch(post.title, kwObj.keyword)) {
                            matchedKeywords.push(kwObj.keyword);
                        }
                    }

                    if (matchedKeywords.length > 0) {
                        const keywordDisplay = matchedKeywords.map(k => 
                            k.replace(/\+/g, ' + ').replace(/-/g, ' (제외: ').replace(/(\(제외: .*)$/, '$1)')
                        ).join(' | ');
                        const alertMsg = `🚨 [키워드 감지] ${target.siteName}\n- 키워드: ${keywordDisplay}\n- 제목: ${post.title}\n- 링크: ${post.url}`;
                        await sendTelegramAlert(alertMsg);
                        totalNewAlerts++;
                    }

                    const currentNewMax = parseInt(newMaxId, 10) || 0;
                    if (currentPostId > currentNewMax) {
                        newMaxId = post.id;
                    }
                }
            }

            // 최근 스크랩 ID 갱신
            if (newMaxId !== maxScrapedId) {
                await (prisma as any).realtimeCommunityTarget.update({
                    where: { id: target.id },
                    data: { lastScrapedPostId: newMaxId }
                });
            }
        }

        return NextResponse.json({
            success: true,
            parsedCount: posts.length,
            alertsSent: totalNewAlerts
        });

    } catch (error: any) {
        console.error('[Ruliweb Ingest Error]:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}

function checkKeywordMatch(text: string, keywordRule: string) {
    const spacelessText = text.toLowerCase().replace(/\s+/g, '');
    const parts = keywordRule.split('-');
    const reqParts = parts[0].split('+');
    const exclParts = parts.slice(1);

    const hasAllReq = reqParts.every(req => spacelessText.includes(req.toLowerCase().replace(/\s+/g, '')));
    if (!hasAllReq) return false;

    if (exclParts.length > 0) {
        const hasExcluded = exclParts.some(ex => ex.length > 0 && spacelessText.includes(ex.toLowerCase().replace(/\s+/g, '')));
        if (hasExcluded) return false;
    }

    return true;
}
