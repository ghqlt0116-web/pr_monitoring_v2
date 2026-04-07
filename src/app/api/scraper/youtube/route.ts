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
                orderBy: { lastScrapedAt: 'desc' }
            });

            if (recentCh && recentCh.lastScrapedAt) {
                const diffMs = new Date().getTime() - new Date(recentCh.lastScrapedAt).getTime();
                if (diffMs < 5 * 60 * 60 * 1000) {
                    return NextResponse.json({ success: true, message: 'Recently scraped. Throttled.' });
                }
            }
        }

        const channels = await (prisma as any).creatorChannel.findMany();
        const dbKeywords = await (prisma as any).creatorKeyword.findMany({ where: { isActive: true } });
        const keywordStrings = dbKeywords.map((k: any) => k.keyword);

        // Default keywords if DB is empty
        if (keywordStrings.length === 0) {
            keywordStrings.push('망 사용료', 'cp사', '트래픽', '통신사', 'skb', '망이용대가');
        }

        // Promise.all 대신 순차적(for...of) 실행으로 변경하여 YouTube의 429 Too Many Requests (동시 접속 차단) 에러를 방지합니다.
        const processed = [];


        for (const channel of channels) {
            try {
                const feedUrl = `https://www.youtube.com/channel/${channel.youtubeId}/videos`;
                const res = await fetch(feedUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
                    },
                    next: { revalidate: 0 }
                });

                if (!res.ok) {
                    console.error(`Failed to fetch HTML for ${channel.title}: ${res.status}`);
                    await ((prisma as any).creatorChannel.update as any)({
                        where: { id: channel.id },
                        data: {
                            lastScrapedAt: new Date(),
                            lastScrapeStatus: 'ERROR',
                            lastScrapeError: `HTTP ${res.status}`
                        }
                    });
                    // 에러 시 기존 화면을 갑자기 빈 화면으로 만들지 않도록 삭제 로직(deleteMany) 제거! (회복 탄력성)
                    continue;
                }

                const html = await res.text();
                let validVideos: any[] = [];

                try {
                    // ytInitialData 파싱 (글로벌 변수에서 JSON 추출)
                    const dataStrMatch = html.match(/ytInitialData[ \n\r=]+(\{.*?\});/);
                    if (dataStrMatch && dataStrMatch[1]) {
                        const data = JSON.parse(dataStrMatch[1]);

                        const authorName = data?.metadata?.channelMetadataRenderer?.title;
                        if (authorName && authorName !== channel.title) {
                            await ((prisma as any).creatorChannel.update as any)({
                                where: { id: channel.id },
                                data: { title: authorName }
                            });
                        }

                        // 비디오 탭 탐색 (쇼츠 제외)
                        const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
                        const videosTab = tabs.find((t: any) => t.tabRenderer?.title === 'Videos' || t.tabRenderer?.title === '동영상');
                        const items = videosTab?.tabRenderer?.content?.richGridRenderer?.contents || [];

                        for (const item of items) {
                            if (validVideos.length >= 2) break;
                            const video = item.richItemRenderer?.content?.videoRenderer;

                            if (video && video.videoId) {
                                const videoId = video.videoId;
                                const title = video.title?.runs?.[0]?.text || '';
                                const description = video.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || title;
                                const thumbnail = video.thumbnail?.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

                                validVideos.push({
                                    videoId,
                                    title,
                                    url: `https://www.youtube.com/watch?v=${videoId}`,
                                    publishedAt: new Date(),
                                    description,
                                    thumbnail
                                });
                            }
                        }
                    }
                } catch (parseError) {
                    console.error("JSON parsing failed, regex fallback: ", parseError);
                    // 최후의 수단: 문자열 정규식 추출
                    const regex = /"videoId":"([^"]+)","title":\{"runs":\[\{"text":"([^"]+)"\}\]\}/g;
                    let m: RegExpExecArray | null;
                    let count = 0;
                    while ((m = regex.exec(html)) !== null && count < 2) {
                        const m1 = m![1];
                        const m2 = m![2];
                        if (!validVideos.find(v => v.videoId === m1)) {
                            validVideos.push({
                                videoId: m1,
                                title: m2,
                                url: `https://www.youtube.com/watch?v=${m1}`,
                                publishedAt: new Date(),
                                description: m2,
                                thumbnail: `https://i.ytimg.com/vi/${m1}/hqdefault.jpg`
                            });
                            count++;
                        }
                    }
                }

                if (validVideos.length === 0) {
                    throw new Error("No videos found (YouTube blocked IP or empty channel)");
                }

                const validVideoIds = validVideos.map(v => v.videoId);

                // 사용자의 요청: 최신 2개 영상에 해당하는 기록은 살려두고(AI 정보 보존), 나머지만 삭제!
                await ((prisma as any).creatorVideo.deleteMany as any)({
                    where: {
                        channelId: channel.id,
                        videoId: { notIn: validVideoIds } // 이번에 수집된 최신 2개는 삭제 대상에서 제외!
                    }
                });

                let newCount = 0;
                // 살아남은(또는 신규) 2개 영상 DB 처리
                for (const video of validVideos) {
                    const existing = await ((prisma as any).creatorVideo.findUnique as any)({ where: { videoId: video.videoId } });

                    if (!existing) {
                        const isRecommended = containsKeyword(video.title, keywordStrings) || containsKeyword(video.description, keywordStrings);

                        await ((prisma as any).creatorVideo.create as any)({
                            data: {
                                channelId: channel.id,
                                videoId: video.videoId,
                                title: video.title,
                                description: video.description.substring(0, 4000),
                                url: video.url,
                                thumbnail: video.thumbnail,
                                publishedAt: video.publishedAt,
                                isAiRecommended: isRecommended
                            }
                        });
                        newCount++;
                    }
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

                // 유튜브 404 차단을 우회하기 위해 한 채널 파싱이 끝날 때마다 충분한 휴식(1.5초)을 부여
                // Vercel 타임아웃을 고려하여 지나치게 길게는 주지 않음
                await new Promise(resolve => setTimeout(resolve, 1500));

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
