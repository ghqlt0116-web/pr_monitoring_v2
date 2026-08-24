import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
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

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const siteType = searchParams.get('siteType');

    if (!siteType) return NextResponse.json({ error: 'Missing siteType' }, { status: 400 });

    try {
        let posts: any[] = [];

        if (siteType === 'PPOMPPU') {
            // 1차: 모바일 URL (가장 가볍고 봇 차단 없음)
            try {
                const mobileUrl = `https://m.ppomppu.co.kr/new/bbs_list.php?id=freeboard`;
                const res = await fetch(mobileUrl, {
                    headers: { ...BROWSER_HEADERS, 'Referer': 'https://m.ppomppu.co.kr/' },
                    cache: 'no-store',
                    signal: AbortSignal.timeout(6000)
                });
                if (res.ok) {
                    const buf = await res.arrayBuffer();
                    const html = iconv.decode(Buffer.from(buf), 'euc-kr');
                    const $ = cheerio.load(html);

                    $('.bbsList li a, .list_title a, a.title, .bbs_list li a, ul.bbsList a').each((i, el) => {
                        if (posts.length >= 10) return;
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
                console.error("Ppomppu mobile preview failed:", e);
            }

            // 2차 폴백: PC URL
            if (posts.length === 0) {
                const url = `https://www.ppomppu.co.kr/zboard/zboard.php?id=freeboard`;
                const res = await fetch(url, {
                    headers: { ...BROWSER_HEADERS, 'Referer': 'https://www.ppomppu.co.kr/' },
                    cache: 'no-store',
                    signal: AbortSignal.timeout(6000)
                });
                if (res.ok) {
                    const htmlBuffer = await res.arrayBuffer();
                    const decodedHtml = iconv.decode(Buffer.from(htmlBuffer), 'euc-kr');
                    const $ = cheerio.load(decodedHtml);

                    $('tr').each((i, el) => {
                        if (posts.length >= 10) return;
                        const classAttr = $(el).attr('class') || '';
                        if (classAttr.includes('list') || classAttr.includes('item') || classAttr.includes('baseList')) {
                            const aTag = $(el).find('a').filter((_, a) => $(a).attr('href')?.includes('view.php?id=freeboard') ?? false);
                            if (aTag.length > 0) {
                                const title = aTag.first().text().trim();
                                const href = aTag.first().attr('href')!;
                                const noMatch = href.match(/no=(\d+)/);
                                if (noMatch && title) {
                                    posts.push({ id: noMatch[1], title, url: 'https://www.ppomppu.co.kr/zboard/' + href });
                                }
                            }
                        }
                    });
                }
            }
        } else if (siteType === 'RULIWEB') {
            // 1차: 모바일 URL (Cloudflare 봇 차단 우회 및 경량화)
            try {
                const mobileUrl = `https://m.ruliweb.com/community/board/300143`;
                const res = await fetch(mobileUrl, {
                    headers: { ...BROWSER_HEADERS, 'Referer': 'https://m.ruliweb.com/' },
                    cache: 'no-store',
                    signal: AbortSignal.timeout(6000)
                });
                if (res.ok) {
                    const html = await res.text();
                    const $ = cheerio.load(html);

                    $('a[href*="/read/"]').each((i, el) => {
                        if (posts.length >= 10) return;
                        const href = $(el).attr('href') || '';
                        const noMatch = href.match(/read\/(\d+)/);
                        const title = $(el).text().trim();
                        if (noMatch && title && title.length > 2) {
                            if (!posts.some(p => p.id === noMatch[1])) {
                                posts.push({ id: noMatch[1], title, url: href.startsWith('http') ? href : `https://m.ruliweb.com${href}` });
                            }
                        }
                    });
                }
            } catch (e) {
                console.error("Ruliweb mobile preview failed:", e);
            }

            // 2차 폴백: PC URL
            if (posts.length === 0) {
                const url = `https://bbs.ruliweb.com/community/board/300143`;
                const res = await fetch(url, {
                    headers: { ...BROWSER_HEADERS, 'Referer': 'https://bbs.ruliweb.com/' },
                    cache: 'no-store',
                    signal: AbortSignal.timeout(6000)
                });
                if (res.ok) {
                    const html = await res.text();
                    const $ = cheerio.load(html);

                    $('tr.table_body:not(.notice):not(.best):not(.inside)').each((i, el) => {
                        if (posts.length >= 10) return;
                        
                        const category = $(el).find('.divsn').text().trim();
                        if (category && category !== '유머' && category !== '장작') return;

                        const aTag = $(el).find('a.subject_link');
                        const title = aTag.text().trim();
                        const href = aTag.attr('href');
                        if (href) {
                            const noMatch = href.match(/read\/(\d+)/);
                            if (noMatch && !posts.some(p => p.id === noMatch[1])) {
                                posts.push({ id: noMatch[1], title, url: href.startsWith('http') ? href : `https://bbs.ruliweb.com${href}` });
                            }
                        }
                    });
                }
            }
        }

        return NextResponse.json(posts);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
