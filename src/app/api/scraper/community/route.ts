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
                // 3. 네이버 검색 파싱 (통합검색, 블로그검색 모두 지원)
                else if (target.url.includes('search.naver.com')) {
                    // 네이버의 다양한 검색 UI 컨테이너 지원
                    const items = $('.bx, .view_wrap, li[class^="sh_"]');
                    if (items.length > 0) {
                        items.each((i, el) => {
                            if (extracted.length >= 10) return false;
                            const titleEl = $(el).find('.api_txt_lines.total_tit, .title_link, .title_area, a.sh_blog_title');
                            const descEl = $(el).find('.api_txt_lines.desc, .dsc_txt, .sh_blog_passage');
                            const authorEl = $(el).find('.sub_txt.sub_name, .name, .txt84');
                            const title = titleEl.text().trim();
                            const link = titleEl.attr('href') || '#';
                            if (title) extracted.push({ postId: link, title, url: link, content: descEl.text().trim() || title, author: authorEl.text().trim() || '블로거' });
                        });
                    } else {
                        // 엘리먼트를 못 찾으면 a태그 텍스트 기반 브루트포스 추출
                        $('a').each((i, el) => {
                            if (extracted.length >= 10) return false;
                            const title = $(el).text().trim();
                            if (title.length > 15 && ($(el).attr('href')?.includes('blog.naver.com') || $(el).hasClass('title_link'))) {
                                const link = $(el).attr('href') || '#';
                                if (!extracted.find(e => e.title === title)) extracted.push({ postId: link, title, url: link, content: title, author: '네이버 블로그' });
                            }
                        });
                    }
                }
                // 4. 특정 파워블로거 개인 주소 타겟팅 및 기타 일반 커뮤니티 (Fallback)
                else {
                    $('a').each((i, el) => {
                        if (extracted.length >= 10) return false;
                        const title = $(el).text().trim();
                        // 파워블로거나 일반 게시판의 경우 본문/제목 링크는 텍스트가 상대적으로 김
                        if (title.length > 12 && !title.includes('로그인') && !title.includes('회원가입') && !title.includes('더보기')) {
                            let link = $(el).attr('href') || '#';
                            if (link === '#' || link.startsWith('javascript')) return; // 무효한 링크 무시
                            if (link.startsWith('/')) {
                                const urlObj = new URL(target.url);
                                link = `${urlObj.origin}${link}`;
                            }
                            // 중복 방지
                            if (!extracted.find(e => e.title === title)) {
                                extracted.push({ postId: link, title, url: link, content: title, author: site || '파워블로거/커뮤니티' });
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
