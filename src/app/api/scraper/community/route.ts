import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import { containsKeyword } from '@/lib/creatorAnalyze';

export async function POST() {
    try {
        const targets = await (prisma as any).communityTarget.findMany();
        const dbKeywords = await (prisma as any).communityKeyword.findMany({ where: { isActive: true } });
        const keywordStrings = dbKeywords.map((k: any) => k.keyword);

        const processed = [];

        for (const target of targets) {
            // 깔끔한 최신 상태 유지를 위해 스크래핑마다 과거 이력 삭제
            await (prisma as any).communityPost.deleteMany({ where: { targetId: target.id } });

            try {
                const res = await fetch(target.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
                    next: { revalidate: 0 }
                });

                if (!res.ok) {
                    await (prisma as any).communityTarget.update({
                        where: { id: target.id },
                        data: { lastScrapedAt: new Date(), lastScrapeStatus: 'ERROR', lastScrapeError: `HTTP ${res.status}` }
                    });
                    continue;
                }

                const html = await res.text();
                const $ = cheerio.load(html);
                const extracted: any[] = [];
                const site = target.siteName.toLowerCase();

                // 1. 디시인사이드 파싱
                if (site.includes('디시') || target.url.includes('dcinside.com')) {
                    $('tr.us-post').each((i, el) => {
                        if (extracted.length >= 10) return false;
                        const titleEl = $(el).find('td.gall_tit a:not(.reply_numbox)');
                        const authorEl = $(el).find('td.gall_writer');
                        const title = titleEl.text().trim();
                        let link = titleEl.attr('href') || '#';
                        if (link.startsWith('/')) link = 'https://gall.dcinside.com' + link;
                        const author = authorEl.attr('data-nick') || authorEl.text().trim();
                        if (title) extracted.push({ postId: link, title, url: link, content: title, author });
                    });
                }
                // 2. 루리웹 파싱
                else if (site.includes('루리웹') || target.url.includes('ruliweb.com')) {
                    $('tr.table_body').each((i, el) => {
                        if (extracted.length >= 10) return false;
                        const titleEl = $(el).find('a.subject_link');
                        const authorEl = $(el).find('.writer');
                        const title = titleEl.text().trim();
                        let link = titleEl.attr('href') || '#';
                        const author = authorEl.text().trim();
                        if (title) extracted.push({ postId: link, title, url: link, content: title, author });
                    });
                }
                // 3. 네이버 블로그 검색 파싱
                else if (site.includes('네이버') || target.url.includes('naver.com')) {
                    $('li.bx').each((i, el) => {
                        if (extracted.length >= 10) return false;
                        const titleEl = $(el).find('a.api_txt_lines.total_tit, a.title_link'); // 신/구 버전 클래스 대응
                        const descEl = $(el).find('div.api_txt_lines.desc, div.dsc_txt, div.api_txt_lines.dsc_txt');
                        const authorEl = $(el).find('a.sub_txt.sub_name, a.name');
                        const title = titleEl.text().trim();
                        const link = titleEl.attr('href') || '#';
                        const content = descEl.text().trim();
                        const author = authorEl.text().trim();
                        if (title) extracted.push({ postId: link, title, url: link, content, author });
                    });
                }
                // 4. 일반적인 a 태그 무차별 파싱 (Fallback)
                else {
                    $('a').each((i, el) => {
                        if (extracted.length >= 10) return false;
                        const title = $(el).text().trim();
                        if (title.length > 10) { // 제목 길이 필터 (너무 짧으면 메뉴 버튼으로 간주)
                            let link = $(el).attr('href') || '#';
                            if (link.startsWith('/')) {
                                const urlObj = new URL(target.url);
                                link = `${urlObj.origin}${link}`;
                            }
                            // 중복 추가 방지
                            if (!extracted.find(e => e.title === title)) {
                                extracted.push({ postId: link, title, url: link, content: title, author: '익명' });
                            }
                        }
                    });
                }

                let newCount = 0;
                for (const post of extracted) {
                    const isRecommended = containsKeyword(post.title, keywordStrings) || containsKeyword(post.content, keywordStrings);

                    await (prisma as any).communityPost.create({
                        data: {
                            targetId: target.id,
                            postId: post.postId,
                            title: post.title,
                            content: post.content.substring(0, 4000),
                            url: post.url,
                            author: post.author || '알 수 없음',
                            publishedAt: new Date(),
                            isAiRecommended: isRecommended
                        }
                    });
                    newCount++;
                }

                await (prisma as any).communityTarget.update({
                    where: { id: target.id },
                    data: { lastScrapedAt: new Date(), lastScrapeStatus: 'SUCCESS', lastScrapeError: null }
                });

                processed.push({ target: target.siteName, newPosts: newCount });

                // Vercel / Target 서버 부하 제어
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (err: any) {
                console.error(`Error processing target ${target.url}:`, err);
                await (prisma as any).communityTarget.update({
                    where: { id: target.id },
                    data: { lastScrapedAt: new Date(), lastScrapeStatus: 'ERROR', lastScrapeError: err.message || 'Unknown error' }
                });
            }
        }

        return NextResponse.json({ success: true, processed });

    } catch (error: any) {
        console.error('Community Scraper API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
