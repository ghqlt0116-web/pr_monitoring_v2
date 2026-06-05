import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const siteType = searchParams.get('siteType');

    if (!siteType) return NextResponse.json({ error: 'Missing siteType' }, { status: 400 });

    try {
        let posts: any[] = [];

        if (siteType === 'PPOMPPU') {
            const url = `https://www.ppomppu.co.kr/zboard/zboard.php?id=freeboard`;
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
            const htmlBuffer = await res.arrayBuffer();
            const decodedHtml = iconv.decode(Buffer.from(htmlBuffer), 'euc-kr');
            const $ = cheerio.load(decodedHtml);

            $('tr').each((i, el) => {
                if (posts.length >= 10) return; // limit to 10 for preview
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
        } else if (siteType === 'RULIWEB') {
            const url = `https://bbs.ruliweb.com/community/board/300143`;
            const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
            const html = await res.text();
            const $ = cheerio.load(html);

            $('tr.table_body:not(.notice):not(.best):not(.inside)').each((i, el) => {
                if (posts.length >= 10) return; // limit to 10 for preview
                
                const category = $(el).find('.divsn').text().trim();
                if (category && category !== '유머' && category !== '장작') return;

                const aTag = $(el).find('a.subject_link');
                const title = aTag.text().trim();
                const href = aTag.attr('href');
                if (href) {
                    const noMatch = href.match(/read\/(\d+)/);
                    if (noMatch) {
                        posts.push({ id: noMatch[1], title, url: href });
                    }
                }
            });
        }

        return NextResponse.json(posts);
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
