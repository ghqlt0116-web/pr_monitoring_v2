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
                        if (posts.length >= 10) return;
                        const title = $(el).find('title').text().trim();
                        const link = $(el).find('link').text().trim() || $(el).find('guid').text().trim();
                        const noMatch = link.match(/no=(\d+)/);
                        if (title && noMatch) {
                            posts.push({ id: noMatch[1], title, url: link });
                        }
                    });
                }
            } catch (e) {
                console.error("Ppomppu RSS preview failed:", e);
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
                    console.error("Ppomppu mobile preview fallback failed:", e);
                }
            }
        } else if (siteType === 'RULIWEB') {
            const ruliwebConfigs: { url: string; headers: Record<string, string> }[] = [
                {
                    url: 'https://m.ruliweb.com/community/board/300143/list',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S928N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 RuliwebApp',
                        'X-Requested-With': 'com.ruliweb.app',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ko-KR,ko;q=0.9',
                        'Referer': 'https://m.ruliweb.com/'
                    }
                },
                {
                    url: 'https://m.ruliweb.com/best/humor_only/now',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.179 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ko-KR,ko;q=0.9'
                    }
                },
                {
                    url: 'https://bbs.ruliweb.com/community/board/300143/rss',
                    headers: {
                        'User-Agent': 'Daumoa 4.0; Mobile (compatible; Daumoa/4.0; +http://top.daum.net/cgi-bin/bottom/bottom.cgi?top_sub=etc&bottom_sub=oa)',
                        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
                    }
                }
            ];

            for (const conf of ruliwebConfigs) {
                if (posts.length >= 10) break;
                try {
                    const res = await fetch(conf.url, {
                        headers: conf.headers,
                        cache: 'no-store',
                        signal: AbortSignal.timeout(4000)
                    });

                    const cfRay = res.headers.get('cf-ray') || 'none';
                    const cfMitigated = res.headers.get('cf-mitigated') || 'none';
                    const contentType = res.headers.get('content-type') || 'none';

                    console.log(`[Ruliweb Preview] URL: ${conf.url} | Status: ${res.status} ${res.statusText} | cf-ray: ${cfRay} | cf-mitigated: ${cfMitigated} | content-type: ${contentType}`);

                    const text = await res.text();
                    const snippet = text.substring(0, 200).replace(/\s+/g, ' ');
                    console.log(`[Ruliweb Preview] Body snippet (200 chars): ${snippet}`);

                    if (!res.ok) {
                        console.warn(`[Ruliweb Preview] Non-200 status for ${conf.url}: ${res.status}`);
                        continue;
                    }

                    // Case 1: HTML Page (모바일 전용 최신 목록 파싱)
                    const $ = cheerio.load(text);
                    $('.list_body a.subject, .list_body a.title, a.subject, a.title, .board_list a, a.subject_link, a[href*="/read/"]').each((i, el) => {
                        if (posts.length >= 10) return;
                        const href = $(el).attr('href') || '';
                        const noMatch = href.match(/read\/(\d+)/);
                        const title = $(el).text().trim();
                        if (noMatch && title && title.length > 1 && !posts.some(p => p.id === noMatch[1])) {
                            const cleanTitle = title.replace(/\s+/g, ' ').replace(/\(\d+\)$/, '').trim();
                            posts.push({ id: noMatch[1], title: cleanTitle, url: href.startsWith('http') ? href : `https://m.ruliweb.com${href}` });
                        }
                    });

                    // Case 2: RSS XML Fallback
                    if (posts.length === 0 && (text.includes('<rss') || text.includes('<item>')) ) {
                        const $xml = cheerio.load(text, { xmlMode: true });
                        $xml('item').each((i, el) => {
                            if (posts.length >= 10) return;
                            const title = $xml(el).find('title').text().trim();
                            const link = $xml(el).find('link').text().trim() || $xml(el).find('guid').text().trim();
                            const noMatch = link.match(/read\/(\d+)/);
                            if (title && noMatch && !posts.some(p => p.id === noMatch[1])) {
                                posts.push({ id: noMatch[1], title: title.replace(/\s+/g, ' '), url: link });
                            }
                        });
                    }

                    console.log(`[Ruliweb Preview] Extracted ${posts.length} posts from ${conf.url}`);
                    if (posts.length > 0) break;
                } catch (e: any) {
                    console.error(`[Ruliweb Preview] Fetch exception for ${conf.url}:`, e?.message || e);
                }
            }
        }

        return NextResponse.json(posts);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
