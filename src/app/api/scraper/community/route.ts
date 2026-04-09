import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { containsKeyword } from '@/lib/creatorAnalyze';

export async function POST() {
    try {
        const targets = await (prisma as any).communityTarget.findMany();
        const dbKeywords = await (prisma as any).communityKeyword.findMany({ where: { isActive: true } });
        const keywordStrings = dbKeywords.map((k: any) => k.keyword);

        const processed = [];

        for (const target of targets) {
            try {
                let parsedUrl = target.url.trim();

                // 1. URL 자동 변환 로직 (네이버/티스토리 등 대표 블로그 RSS 백도어 지원)
                if (parsedUrl.includes('in.naver.com')) {
                    try {
                        const inRes = await fetch(parsedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                        if (inRes.ok) {
                            const html = await inRes.text();
                            const spyMatch = html.match(/blog\.naver\.com\/([a-zA-Z0-9_\-]+)/);
                            if (spyMatch) {
                                parsedUrl = `https://rss.blog.naver.com/${spyMatch[1]}.xml`;
                            }
                        }
                    } catch (e) {
                        console.error('Influencer parsing error:', e);
                    }
                } else if (parsedUrl.includes('blog.naver.com') && !parsedUrl.includes('rss')) {
                    const parts = parsedUrl.split('/');
                    const blogId = parts[parts.length - 1]?.split('?')[0];
                    if (blogId) parsedUrl = `https://rss.blog.naver.com/${blogId}.xml`;
                } else if (parsedUrl.includes('tistory.com') && !parsedUrl.endsWith('/rss')) {
                    parsedUrl = parsedUrl.replace(/\/$/, '') + '/rss';
                }

                // RSS 데이터 긁어오기 (iframe 렌더링, 봇 차단을 모두 완벽히 회피)
                const res = await fetch(parsedUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0.0.0 Safari/537.36' },
                    next: { revalidate: 0 }
                });

                if (!res.ok) {
                    await (prisma as any).communityTarget.update({
                        where: { id: target.id },
                        data: { lastScrapedAt: new Date(), lastScrapeStatus: 'ERROR', lastScrapeError: `HTTP ${res.status}` }
                    });
                    continue;
                }

                const xmlText = await res.text();
                // 무거운 Cheerio 파싱 대신 압도적으로 빠른 정규식으로 RSS item 추출
                const itemsMatch = xmlText.match(/<item>([\s\S]*?)<\/item>/g) || [];
                const extracted: any[] = [];

                // 2. 유튜버 스크래퍼처럼 가장 따끈따끈한 최신글 2개(max)만 가져오기
                for (let i = 0; i < Math.min(itemsMatch.length, 2); i++) {
                    const itemXml = itemsMatch[i];

                    const titleMatch = itemXml.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || itemXml.match(/<title>(.*?)<\/title>/);
                    const linkMatch = itemXml.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/) || itemXml.match(/<link>(.*?)<\/link>/);
                    let descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || itemXml.match(/<description>([\s\S]*?)<\/description>/);
                    const pubDateMatch = itemXml.match(/<pubDate>(.*?)<\/pubDate>/);

                    let title = titleMatch ? titleMatch[1].trim() : '이름 없는 글';
                    let link = linkMatch ? linkMatch[1].replace(/&amp;/g, '&').trim() : '#';
                    let descObj = descMatch ? descMatch[1].replace(/<[^>]*>?/gm, '').trim() : title; // HTML 태그 찌꺼기 완벽 제거

                    let pubDateStr = new Date().toISOString();
                    if (pubDateMatch && pubDateMatch[1]) {
                        try { pubDateStr = new Date(pubDateMatch[1]).toISOString(); } catch (e) { }
                    }

                    extracted.push({
                        postId: link,
                        title,
                        url: link,
                        content: descObj,
                        author: target.siteName || '블로거',
                        publishedAt: new Date(pubDateStr)
                    });
                }

                // 3. 게시물을 전혀 추출하지 못하면 확정된 에러 반환! (거짓 초록불 버그 해결)
                if (extracted.length === 0) {
                    throw new Error('추출된 게시글이 0개입니다. (지원되지 않는 URL이거나 구조 변경)');
                }

                const validPostIds = extracted.map(p => p.postId);

                // 최신 2개 제외 과거 데이터 완전 삭제 (데이터베이스 용량 청소 및 최신성 유지)
                await (prisma as any).communityPost.deleteMany({
                    where: {
                        targetId: target.id,
                        postId: { notIn: validPostIds }
                    }
                });

                let newCount = 0;
                for (const post of extracted) {
                    const existing = await (prisma as any).communityPost.findUnique({ where: { postId: post.postId } });

                    if (!existing) {
                        const isRecommended = containsKeyword(post.title, keywordStrings) || containsKeyword(post.content, keywordStrings);

                        await (prisma as any).communityPost.create({
                            data: {
                                targetId: target.id,
                                postId: post.postId,
                                title: post.title,
                                content: post.content.substring(0, 1500), // AI 토큰 비용 최적화 (광고 컷)
                                url: post.url,
                                author: post.author,
                                publishedAt: post.publishedAt,
                                isAiRecommended: isRecommended
                            }
                        });
                        newCount++;
                    } else {
                        // 이미 존재하는 게시글 제목이라도 최신 제목으로 덮어쓰기 (썸네일 누락 패치와 동일 원리)
                        await (prisma as any).communityPost.update({
                            where: { postId: post.postId },
                            data: { title: post.title }
                        });
                    }
                }

                await (prisma as any).communityTarget.update({
                    where: { id: target.id },
                    data: { lastScrapedAt: new Date(), lastScrapeStatus: 'SUCCESS', lastScrapeError: null }
                });

                processed.push({ target: target.siteName, newPosts: newCount });

                // Vercel 차단 지연 (Timeout 안전 수치 0.3초)
            } catch (err: any) {
                console.error(`Error processing target ${target.url}:`, err);
                await (prisma as any).communityTarget.update({
                    where: { id: target.id },
                    data: { lastScrapedAt: new Date(), lastScrapeStatus: 'ERROR', lastScrapeError: err.message || 'Unknown error' }
                });
            }

            // [IP 차단 방지] 각 블로그/커뮤니티 타겟을 긁은 후, 무조건 1.5초(1500ms) 대기하여 호스트 서버 과부하 및 Vercel Timeout 방어
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        return NextResponse.json({ success: true, processed: processed.length });

    } catch (error: any) {
        console.error('Community Scraper API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
