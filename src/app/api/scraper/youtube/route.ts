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

        // Promise.all을 활용하여 모든 채널의 RSS 피드를 병렬(동시) 수집. (대기열 병목 소거)
        const processPromises = channels.map(async (channel: any) => {
            try {
                const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.youtubeId}`;
                const res = await fetch(feedUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, next: { revalidate: 0 } });

                if (!res.ok) {
                    console.error(`Failed to fetch RSS for ${channel.title}: ${res.status}`);
                    await prisma.creatorChannel.update({
                        where: { id: channel.id },
                        data: {
                            lastScrapedAt: new Date(),
                            lastScrapeStatus: 'ERROR',
                            lastScrapeError: `HTTP Status ${res.status}`
                        }
                    });
                    return null;
                }

                const xmlText = await res.text();
                const $ = cheerio.load(xmlText, { xmlMode: true });

                // Update channel name if changed
                const authorName = $('author > name').first().text();
                if (authorName && authorName !== channel.title) {
                    await prisma.creatorChannel.update({
                        where: { id: channel.id },
                        data: { title: authorName }
                    });
                }

                // 1. 영상 가져오기 (RSS 방식 - 빠르고 안정적이며 무료)
                const entries = $('entry').toArray();
                let newCount = 0;
                let processedCount = 0;

                for (const entry of entries) {
                    if (processedCount >= 2) break; // 쇼츠를 제외한 순수 일반 영상 2개까지만 탐색

                    const $entry = $(entry);
                    const videoId = $entry.find('yt\\:videoId').text();

                    // 🚨 쇼츠(Shorts) 필터링: /shorts/ URL로 HEAD 요청을 보내어 200 OK(리다이렉트 없음)면 쇼츠로 간주하고 스킵
                    try {
                        const shortCheckRes = await fetch(`https://www.youtube.com/shorts/${videoId}`, { method: 'HEAD', redirect: 'manual' });
                        if (shortCheckRes.status === 200) {
                            continue; // 쇼츠 영상이므로 수집하지 않고 다음 영상으로 넘어감
                        }
                    } catch (e) {
                        // 확인 불가 시 그냥 넘어감
                    }

                    processedCount++;

                    const title = $entry.find('title').text();
                    const url = $entry.find('link').attr('href') || `https://www.youtube.com/watch?v=${videoId}`;
                    const publishedAtRaw = $entry.find('published').text();
                    const publishedAt = new Date(publishedAtRaw);
                    const description = $entry.find('media\\:group > media\\:description').text();
                    const thumbnail = $entry.find('media\\:group > media\\:thumbnail').attr('url');

                    const existing = await prisma.creatorVideo.findUnique({ where: { videoId } });

                    if (!existing) {
                        const isRecommended = containsKeyword(title, keywordStrings) || containsKeyword(description, keywordStrings);

                        await prisma.creatorVideo.create({
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
                }

                await prisma.creatorChannel.update({
                    where: { id: channel.id },
                    data: {
                        lastScrapedAt: new Date(),
                        lastScrapeStatus: 'SUCCESS',
                        lastScrapeError: null
                    }
                });

                return { channel: channel.title, newVideos: newCount };
            } catch (err: any) {
                console.error(`Error processing channel ${channel.youtubeId}:`, err);
                await prisma.creatorChannel.update({
                    where: { id: channel.id },
                    data: {
                        lastScrapedAt: new Date(),
                        lastScrapeStatus: 'ERROR',
                        lastScrapeError: err.message || 'Unknown error'
                    }
                });
                return null;
            }
        });

        const results = await Promise.all(processPromises);
        const processed = results.filter((r: any) => r !== null);

        return NextResponse.json({ success: true, processed });

    } catch (error: any) {
        console.error('YouTube Scraper API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
