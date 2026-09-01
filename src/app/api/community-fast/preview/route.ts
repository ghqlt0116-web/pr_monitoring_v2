import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { getLatestRuliwebPosts, setLatestRuliwebPosts } from '@/lib/ruliwebCache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
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
            return NextResponse.json(posts);

        } else if (siteType === 'RULIWEB') {
            // 1순위: 루리웹 직접 실시간 파싱 시도
            try {
                const ruliwebUrl = 'https://bbs.ruliweb.com/community/board/300143?view=default';
                const res = await fetch(ruliwebUrl, {
                    headers: BROWSER_HEADERS,
                    cache: 'no-store',
                    signal: AbortSignal.timeout(5000)
                });

                if (res.ok) {
                    const html = await res.text();
                    const $ = cheerio.load(html);

                    const selectors = [
                        'table.board_list_table tr.table_body td.subject a.subject_link',
                        'table.board_list_table tr.table_body td.subject a.text_over',
                        'table.board_list_table td.subject a',
                        '.list_body a.subject',
                        '.list_body a.title',
                        'a.subject_link',
                        'a[href*="/read/"]'
                    ];

                    $(selectors.join(', ')).each((i, el) => {
                        if (posts.length >= 10) return;
                        const href = $(el).attr('href') || '';
                        const noMatch = href.match(/read\/(\d+)/);
                        let title = $(el).clone().children().remove().end().text().trim();
                        if (!title) {
                            title = $(el).text().trim();
                        }

                        if (noMatch && title && title.length > 1) {
                            const postId = noMatch[1];
                            if (!posts.some(p => p.id === postId)) {
                                const cleanTitle = title.replace(/\s+/g, ' ').replace(/\[\d+\]$/, '').replace(/\(\d+\)$/, '').trim();
                                const fullUrl = href.startsWith('http')
                                    ? href
                                    : (href.startsWith('/') ? `https://bbs.ruliweb.com${href}` : `https://bbs.ruliweb.com/${href}`);
                                posts.push({ id: postId, title: cleanTitle, url: fullUrl });
                            }
                        }
                    });

                    if (posts.length > 0) {
                        setLatestRuliwebPosts(posts);
                        return NextResponse.json(posts);
                    }
                }
            } catch (e) {
                console.error("Direct Ruliweb fetch failed or blocked:", e);
            }

            // 2순위: 캐시된 릴레이 데이터가 있는 경우 반환
            const { posts: cachedPosts } = getLatestRuliwebPosts();
            if (cachedPosts && cachedPosts.length > 0) {
                return NextResponse.json(cachedPosts.slice(0, 10));
            }

            // 3순위: 직접 파싱도 안 되고 릴레이 캐시도 없는 경우 안내 반환
            return NextResponse.json({
                isRelay: true,
                message: '루리웹 서버가 외부 IP를 차단할 경우 GitHub Actions 릴레이를 통해 안전하게 백그라운드 수집됩니다. GitHub Actions에서 [Run workflow]를 1회 실행하시면 즉시 최신 게시글 10건이 동기화됩니다.'
            });
        }

        return NextResponse.json(posts);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
