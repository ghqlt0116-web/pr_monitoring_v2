import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import { sendTelegramAlert } from '@/lib/telegram';
import iconv from 'iconv-lite';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
};

export async function GET() {
    return POST();
}

export async function POST() {
    try {
        const targets = await (prisma as any).realtimeCommunityTarget.findMany({ where: { isActive: true } });
        const keywords = await (prisma as any).realtimeKeyword.findMany({ where: { isActive: true } });

        if (targets.length === 0 || keywords.length === 0) {
            return NextResponse.json({ success: true, message: 'No active targets or keywords' });
        }

        let totalNewAlerts = 0;

        for (const target of targets) {
            try {
                let maxScrapedId = target.lastScrapedPostId || '0';
                let newMaxId = maxScrapedId;
                let posts: any[] = [];

                if (target.siteType === 'PPOMPPU') {
                    // 1순위: 공식 RSS 피드 (Cloudflare/봇 차단 완벽 면역 + UTF-8 지원)
                    try {
                        const rssUrl = 'https://www.ppomppu.co.kr/rss.php?id=freeboard';
                        const res = await fetch(rssUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                            cache: 'no-store',
                            signal: AbortSignal.timeout(5000)
                        });
                        if (res.ok) {
                            const xmlText = await res.text();
                            const $ = cheerio.load(xmlText, { xmlMode: true });
                            $('item').each((i, el) => {
                                const title = $(el).find('title').text().trim();
                                const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
                                const noMatch = link.match(/no=(\d+)/);
                                if (title && noMatch) {
                                    posts.push({ id: noMatch[1], title, url: link });
                                }
                            });
                        }
                    } catch (e) {
                        console.error("Ppomppu RSS scrape failed:", e);
                    }

                    // 2순위 폴백: 모바일 웹 파싱
                    if (posts.length === 0) {
                        try {
                            const mobileUrl = `https://m.ppomppu.co.kr/new/bbs_list.php?id=freeboard`;
                            const res = await fetch(mobileUrl, {
                                headers: { ...BROWSER_HEADERS, 'Referer': 'https://m.ppomppu.co.kr/' },
                                cache: 'no-store',
                                signal: AbortSignal.timeout(4000)
                            });
                            if (res.ok) {
                                const buf = await res.arrayBuffer();
                                const html = iconv.decode(Buffer.from(buf), 'euc-kr');
                                const $ = cheerio.load(html);
                                $('.bbsList li a, .list_title a, a.title, .bbs_list li a, ul.bbsList a').each((i, el) => {
                                    const href = $(el).attr('href') || '';
                                    const noMatch = href.match(/no=(\d+)/);
                                    const title = $(el).find('.title, span.title').text().trim() || $(el).text().trim();
                                    if (noMatch && title) {
                                        const cleanTitle = title.split('\n')[0].trim();
                                        if (cleanTitle) {
                                            posts.push({ id: noMatch[1], title: cleanTitle, url: 'https://m.ppomppu.co.kr/new/' + href.replace(/^\/new\//, '') });
                                        }
                                    }
                                });
                            }
                        } catch (e) {
                            console.error("Ppomppu mobile fallback failed:", e);
                        }
                    }
                } else if (target.siteType === 'RULIWEB') {
                    const ruliwebUrls = [
                        'https://bbs.ruliweb.com/community/board/300143/rss',
                        'https://m.ruliweb.com/community/board/300143',
                        'https://m.ruliweb.com/best/humor_only/now'
                    ];

                    for (const url of ruliwebUrls) {
                        if (posts.length >= 10) break;
                        try {
                            const res = await fetch(url, {
                                headers: { ...BROWSER_HEADERS, 'Referer': 'https://m.ruliweb.com/' },
                                cache: 'no-store',
                                signal: AbortSignal.timeout(5000)
                            });
                            if (!res.ok) continue;

                            const text = await res.text();

                            // Case 1: RSS XML
                            if (text.includes('<rss') || text.includes('<item>')) {
                                const $ = cheerio.load(text, { xmlMode: true });
                                $('item').each((i, el) => {
                                    const title = $(el).find('title').text().trim();
                                    const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
                                    const noMatch = link.match(/read\/(\d+)/);
                                    if (title && noMatch && !posts.some(p => p.id === noMatch[1])) {
                                        posts.push({ id: noMatch[1], title: title.replace(/\s+/g, ' '), url: link });
                                    }
                                });
                            }

                            // Case 2: HTML Page
                            if (posts.length === 0) {
                                const $ = cheerio.load(text);
                                $('a.subject_link, a.subject, a.title, .list_body a, tr.table_body a.subject_link, a[href*="/read/"]').each((i, el) => {
                                    const href = $(el).attr('href') || '';
                                    const noMatch = href.match(/read\/(\d+)/);
                                    const title = $(el).text().trim();
                                    if (noMatch && title && title.length > 1 && !posts.some(p => p.id === noMatch[1])) {
                                        const cleanTitle = title.replace(/\s+/g, ' ').replace(/\(\d+\)$/, '').trim();
                                        posts.push({ id: noMatch[1], title: cleanTitle, url: href.startsWith('http') ? href : `https://m.ruliweb.com${href}` });
                                    }
                                });
                            }

                            if (posts.length > 0) break;
                        } catch (e) {
                            console.error(`Ruliweb scrape failed for ${url}:`, e);
                        }
                    }
                }

                // Check posts
                const parsedMaxId = parseInt(maxScrapedId, 10) || 0;
                for (const post of posts) {
                    const currentPostId = parseInt(post.id, 10) || 0;
                    if (currentPostId > parsedMaxId) {
                        // Check against all keywords
                        let matchedKeywords: string[] = [];
                        for (const kwObj of keywords) {
                            if (checkKeywordMatch(post.title, kwObj.keyword)) {
                                matchedKeywords.push(kwObj.keyword);
                            }
                        }

                        if (matchedKeywords.length > 0) {
                            const keywordDisplay = matchedKeywords.map(k => k.replace(/\+/g, ' + ').replace(/-/g, ' (제외: ').replace(/(\(제외: .*)$/, '$1)')).join(' | ');
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

                if (newMaxId !== maxScrapedId) {
                    await (prisma as any).realtimeCommunityTarget.update({
                        where: { id: target.id },
                        data: { lastScrapedPostId: newMaxId }
                    });
                }
            } catch (targetErr) {
                console.error(`Error scraping realtime target ${target.siteName}:`, targetErr);
            }
        }

        return NextResponse.json({ success: true, processed: totalNewAlerts });

    } catch (error: any) {
        console.error('Keyword Alert Scraper Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
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
