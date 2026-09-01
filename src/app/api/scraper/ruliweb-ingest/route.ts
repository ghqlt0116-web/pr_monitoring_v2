import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import { sendTelegramAlert } from '@/lib/telegram';
import { setLatestRuliwebPosts } from '@/lib/ruliwebCache';

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
        const { html, testAlert } = body;

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
                parsedCount: 0,
                posts: []
            });
        }

        // 최신 파싱 데이터 캐시에 저장 (대시보드 미리보기용)
        setLatestRuliwebPosts(posts);

        // 3. 타겟 및 키워드 조회
        const targets = await (prisma as any).realtimeCommunityTarget.findMany({ 
            where: { siteType: 'RULIWEB', isActive: true } 
        });
        const keywords = await (prisma as any).realtimeKeyword.findMany({ 
            where: { isActive: true } 
        });

        let totalNewAlerts = 0;
        const matchedAlertLogs: string[] = [];

        // 수동 테스트 알림 요청이 있는 경우 (testAlert === true)
        if (testAlert && posts.length > 0) {
            const samplePost = posts[0];
            const testMsg = `🧪 [루리웹 텔레그램 연동 테스트 성공]\n- 제목: ${samplePost.title}\n- 링크: ${samplePost.url}\n- 상태: GitHub Actions ➔ Vercel ➔ 텔레그램 연동 정상 작동`;
            await sendTelegramAlert(testMsg);
            matchedAlertLogs.push(`[테스트 알림 발송 완료] ${samplePost.title}`);
            totalNewAlerts++;
        }

        if (targets.length > 0 && keywords.length > 0) {
            for (const target of targets) {
                const maxScrapedId = target.lastScrapedPostId || '0';
                const parsedMaxId = parseInt(maxScrapedId, 10) || 0;
                let newMaxId = maxScrapedId;

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
                            matchedAlertLogs.push(`[키워드 매칭: ${keywordDisplay}] ${post.title}`);
                            totalNewAlerts++;
                        }

                        const currentNewMax = parseInt(newMaxId, 10) || 0;
                        if (currentPostId > currentNewMax) {
                            newMaxId = post.id;
                        }
                    }
                }

                // 최근 스크랩 ID 및 최신 10건 포스트 JSON 캐시 갱신
                await (prisma as any).realtimeCommunityTarget.update({
                    where: { id: target.id },
                    data: {
                        lastScrapedPostId: newMaxId !== maxScrapedId ? newMaxId : target.lastScrapedPostId,
                        lastPostsJson: JSON.stringify(posts.slice(0, 10)),
                        lastScrapedAt: new Date()
                    }
                });
            }
        }

        return NextResponse.json({
            success: true,
            parsedCount: posts.length,
            alertsSent: totalNewAlerts,
            alertLogs: matchedAlertLogs,
            posts: posts.slice(0, 10) // 최신 파싱된 10건 반환 (로그 및 미리보기용)
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
