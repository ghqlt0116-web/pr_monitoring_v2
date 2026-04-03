import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import { containsKeyword } from '@/lib/creatorAnalyze';

export async function GET(req: Request) { return POST(req); }

export async function POST(req?: Request) {
    try {
        const body = req ? await req.json().catch(() => ({})) : {};
        const force = body.force === true;

        if (!force) {
            const recentCh = await (prisma as any).creatorChannel.findFirst({
                orderBy: { lastScrapedAt: 'desc' },
                where: { lastScrapeStatus: 'SUCCESS' }
            });

            if (recentCh && recentCh.lastScrapedAt) {
                const diffMs = new Date().getTime() - new Date(recentCh.lastScrapedAt).getTime();
                if (diffMs < 5 * 60 * 60 * 1000) {
                    return NextResponse.json({ success: true, message: 'Recently scraped. Throttled.' });
                }
            }
        }

        const channels = await prisma.creatorChannel.findMany();
        const dbKeywords = await prisma.creatorKeyword.findMany({ where: { isActive: true } });
        const keywordStrings = dbKeywords.map((k: any) => k.keyword);

        // Default keywords if DB is empty
        if (keywordStrings.length === 0) {
            keywordStrings.push('망 사용료', 'cp사', '트래픽', '통신사', 'skb', '망이용대가');
        }

        // Promise.all 대신 순차적(for...of) 실행으로 변경하여 YouTube의 429 Too Many Requests (동시 접속 차단) 에러를 방지합니다.
        const processed = [];

        for (const channel of channels) {
            // 사용자의 요청: 재수집 시 기존 데이터(과거 잔여물)를 먼저 깔끔하게 비워줌 (에러가 나도 비워지도록 먼저 실행)
            await ((prisma as any).creatorVideo.deleteMany as any)({ where: { channelId: channel.id } });

            try {
                const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.youtubeId}`;
                const res = await fetch(feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 0 } });

                if (!res.ok) {
                    console.error(`Failed to fetch RSS for ${channel.title}: ${res.status}`);
                    await ((prisma as any).creatorChannel.update as any)({
                        where: { id: channel.id },
                        data: {
                            lastScrapedAt: new Date(),
                            lastScrapeStatus: 'ERROR',
                            lastScrapeError: `HTTP ${res.status}`
                        }
                    });
                    continue;
                }

                const xmlText = await res.text();
                const $ = cheerio.load(xmlText, { xmlMode: true });

                const authorName = $('author > name').first().text();
                if (authorName && authorName !== channel.title) {
                    await ((prisma as any).creatorChannel.update as any)({
                        where: { id: channel.id },
                        data: { title: authorName }
                    });
                }

                const entries = $('entry').toArray();
                let newCount = 0;
                let processedCount = 0;

                for (const entry of entries) {
                    if (processedCount >= 2) break;

                    const $entry = $(entry);
                    const videoId = $entry.find('yt\\:videoId').text();

                    try {
                        const shortCheckRes = await fetch(`https://www.youtube.com/shorts/${videoId}`, { method: 'HEAD', redirect: 'manual' });
                        if (shortCheckRes.status === 200) continue;
                    } catch (e) { }

                    processedCount++;

                    const title = $entry.find('title').text();
                    const url = $entry.find('link').attr('href') || `https://www.youtube.com/watch?v=${videoId}`;
                    const publishedAtRaw = $entry.find('published').text();
                    const publishedAt = new Date(publishedAtRaw);
                    const description = $entry.find('media\\:group > media\\:description').text();
                    const thumbnail = $entry.find('media\\:group > media\\:thumbnail').attr('url');

                    const isRecommended = containsKeyword(title, keywordStrings) || containsKeyword(description, keywordStrings);

                    await ((prisma as any).creatorVideo.create as any)({
                        data: {
                            channelId: channel.id,
                            videoId,
                            title,
                            description: description.substring(0, 4000),
                            url,
                            thumbnail,
                            publishedAt,
                            isAiRecommended: isRecommended
                        }
                    });
                    newCount++;
                }

                await ((prisma as any).creatorChannel.update as any)({
                    where: { id: channel.id },
                    data: {
                        lastScrapedAt: new Date(),
                        lastScrapeStatus: 'SUCCESS',
                        lastScrapeError: null
                    }
                });

                processed.push({ channel: channel.title, newVideos: newCount });

                // 유튜브 서버에 대한 부하를 줄이기 위해 루프 사이에 약간의 딜레이(0.5초)를 줍니다.
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (err: any) {
                console.error(`Error processing channel ${channel.youtubeId}:`, err);
                await ((prisma as any).creatorChannel.update as any)({
                    where: { id: channel.id },
                    data: {
                        lastScrapedAt: new Date(),
                        lastScrapeStatus: 'ERROR',
                        lastScrapeError: err.message || 'Unknown error'
                    }
                });
            }
        }

        return NextResponse.json({ success: true, processed });

    } catch (error: any) {
        console.error('YouTube Scraper API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
