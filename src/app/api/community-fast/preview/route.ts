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
    console.log('[Region Check] VERCEL_REGION:', process.env.VERCEL_REGION);

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
            // 루리웹은 Vercel 환경에서 직접 접근 시 차단되므로 GitHub Actions 릴레이가 수집을 전담합니다.
            return NextResponse.json({
                isRelay: true,
                message: '루리웹은 Vercel IP 차단 우회를 위해 GitHub Actions 릴레이를 통해 30분마다 자동 수집됩니다. GitHub 저장소의 Actions 탭에서 수동 실행(Run workflow)하여 즉시 테스트할 수 있습니다.'
            });
        }

        return NextResponse.json(posts);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
