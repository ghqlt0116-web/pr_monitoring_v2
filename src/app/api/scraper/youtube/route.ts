import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import { containsKeyword } from '@/lib/creatorAnalyze';
import { sendTelegramAlert } from '@/lib/telegram';

export async function GET(req: Request) { return POST(req); }

function parseRelativeTime(text: string) {
    if (!text) return new Date();
    const now = new Date();
    const num = parseInt(text.replace(/[^0-9]/g, ''), 10) || 1;

    if (text.includes('분') || text.includes('minute')) now.setMinutes(now.getMinutes() - num);
    else if (text.includes('시간') || text.includes('hour')) now.setHours(now.getHours() - num);
    else if (text.includes('일') || text.includes('day')) now.setDate(now.getDate() - num);
    else if (text.includes('주') || text.includes('week')) now.setDate(now.getDate() - (num * 7));
    else if (text.includes('달') || text.includes('개월') || text.includes('month')) now.setMonth(now.getMonth() - num);
    else if (text.includes('년') || text.includes('year')) now.setFullYear(now.getFullYear() - num);

    return now;
}

function parseRelativeDate(text: string): Date {
    if (!text) return new Date();
    const now = new Date();
    const val = parseInt(text.replace(/[^0-9]/g, '')) || 1;
    if (text.includes('상영') || text.includes('스트리밍') || text.includes('live')) return now; // Live case
    if (text.includes('분') || text.includes('minute')) now.setMinutes(now.getMinutes() - val);
    else if (text.includes('시간') || text.includes('hour')) now.setHours(now.getHours() - val);
    else if (text.includes('일') || text.includes('day')) now.setDate(now.getDate() - val);
    else if (text.includes('주') || text.includes('week')) now.setDate(now.getDate() - (val * 7));
    else if (text.includes('개월') || text.includes('month')) now.setMonth(now.getMonth() - val);
    else if (text.includes('년') || text.includes('year')) now.setFullYear(now.getFullYear() - val);
    return now;
}

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
        let successCount = 0;
        let errorCount = 0;
        let newVideosCount = 0;
        const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://pr-monitoring-v2.vercel.app';

        for (const channel of channels) {
            try {
                let validVideos: any[] = [];
                let rawId = channel.youtubeId.trim();

                // 1. Extract pure ID/Handle if user inputted a full URL
                if (rawId.includes('youtube.com/')) {
                    const match = rawId.match(/youtube\.com\/(?:channel\/|@)?([^/?&#]+)/);
                    if (match && match[1]) {
                        rawId = match[1];
                    }
                }
                if (rawId.startsWith('uc') && rawId.length === 24) {
                    rawId = 'UC' + rawId.substring(2); // Auto-fix lowercase 'uc' just in case
                }

                let effectiveId = rawId.startsWith('@') ? rawId : (rawId.startsWith('UC') ? rawId : '@' + rawId);

                // 2. Auto-resolve Handles (@) to UC IDs for RSS compatibility
                if (effectiveId.startsWith('@')) {
                    try {
                        const profileUrl = effectiveId.startsWith('@') ? `https://www.youtube.com/${effectiveId}` : `https://www.youtube.com/@${effectiveId}`;
                        const profileRes = await fetch(profileUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }});
                        if (profileRes.ok) {
                            const profileHtml = await profileRes.text();
                            const ucMatch = profileHtml.match(/"channelId":"(UC[^"]+)"/) || profileHtml.match(/channel\/([A-Za-z0-9_-]{24})/);
                            if (ucMatch && ucMatch[1]) {
                                effectiveId = ucMatch[1];
                                await ((prisma as any).creatorChannel.update as any)({
                                    where: { id: channel.id },
                                    data: { youtubeId: effectiveId }
                                });
                            }
                        }
                    } catch (e) {
                        console.error(`Failed to resolve handle for ${channel.title}:`, e);
                    }
                }

                // 1. YouTube Data API v3 (최우선 순위 - IP 차단 면역)
                if (process.env.YOUTUBE_API_KEY && effectiveId.startsWith('UC')) {
                    try {
                        const playlistId = 'UU' + effectiveId.substring(2);
                        const apiUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=10&key=${process.env.YOUTUBE_API_KEY}`;
                        const apiRes = await fetch(apiUrl, { next: { revalidate: 0 } });
                        if (apiRes.ok) {
                            const apiData = await apiRes.json();
                            if (apiData.items && apiData.items.length > 0) {
                                for (const item of apiData.items) {
                                    const snippet = item.snippet;
                                    const videoId = snippet.resourceId.videoId;
                                    validVideos.push({
                                        videoId,
                                        title: snippet.title,
                                        url: `https://www.youtube.com/watch?v=${videoId}`,
                                        publishedAt: new Date(snippet.publishedAt),
                                        description: snippet.description || snippet.title,
                                        thumbnail: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
                                    });
                                }
                            }
                        } else {
                            console.error(`YouTube API Error: ${apiRes.status}`);
                        }
                    } catch (e) {
                        console.error('YouTube API fetch failed:', e);
                    }
                }

                // 2. RSS Feed Fallback (API 실패 시)
                if (validVideos.length === 0) {
                    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${effectiveId}`;
                    try {
                        const rssRes = await fetch(rssUrl, {
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                            next: { revalidate: 0 }
                        });
                        
                        if (rssRes.ok) {
                            const xmlText = await rssRes.text();
                            const entries = xmlText.match(/<entry>([\s\S]*?)<\/entry>/g) || [];
                            
                            for (const entry of entries) {
                                if (validVideos.length >= 10) break;
                                const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
                                const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
                                const descMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/);
                                const pubMatch = entry.match(/<published>([^<]+)<\/published>/);

                                if (videoIdMatch && titleMatch) {
                                    const videoId = videoIdMatch[1];
                                    const rawTitle = titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
                                    const rawDesc = descMatch ? descMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'") : rawTitle;

                                    validVideos.push({
                                        videoId,
                                        title: rawTitle,
                                        url: `https://www.youtube.com/watch?v=${videoId}`,
                                        publishedAt: pubMatch ? new Date(pubMatch[1]) : new Date(),
                                        description: rawDesc,
                                        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
                                    });
                                }
                            }
                        }
                    } catch (rssError) {
                        console.error(`RSS fetch failed for ${channel.title}, falling back to HTML...`);
                    }
                }

                // 2. If RSS failed (or channel uses a handle not compatible with RSS), fallback to HTML parsing
                if (validVideos.length === 0) {
                    const feedUrl = effectiveId.startsWith('UC') ? `https://www.youtube.com/channel/${effectiveId}/videos` : `https://www.youtube.com/${effectiveId.startsWith('@') ? effectiveId : '@' + effectiveId}/videos`;
                    const res = await fetch(feedUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                            'Cookie': 'SOCS=CAI'
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
                        continue;
                    }

                    const html = await res.text();

                    try {
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

                            const tabs = data.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
                            const videosTab = tabs.find((t: any) => t.tabRenderer?.title === 'Videos' || t.tabRenderer?.title === '동영상');
                            const items = videosTab?.tabRenderer?.content?.richGridRenderer?.contents || [];

                            for (const item of items) {
                                if (validVideos.length >= 10) break;
                                const video = item.richItemRenderer?.content?.videoRenderer;

                                if (video && video.videoId) {
                                    const videoId = video.videoId;
                                    const title = video.title?.runs?.[0]?.text || '';
                                    const description = video.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || title;
                                    const thumbnail = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
                                    const publishedTimeText = video.publishedTimeText?.simpleText || '';
                                    const publishedAt = parseRelativeTime(publishedTimeText);

                                    validVideos.push({
                                        videoId, title, url: `https://www.youtube.com/watch?v=${videoId}`, publishedAt, description, thumbnail
                                    });
                                }
                            }
                        }
                    } catch (parseError) {
                        console.error("JSON parsing failed, regex fallback: ", parseError);
                        const regex = /"videoId":"([^"]+)","title":\{"runs":\[\{"text":"([^"]+)"\}\]\}/g;
                        let m: RegExpExecArray | null;
                        let count = 0;
                        while ((m = regex.exec(html)) !== null && count < 10) {
                            if (!validVideos.find(v => v.videoId === m![1])) {
                                validVideos.push({
                                    videoId: m![1], title: m![2], url: `https://www.youtube.com/watch?v=${m![1]}`,
                                    publishedAt: new Date(), description: m![2], thumbnail: `https://i.ytimg.com/vi/${m![1]}/maxresdefault.jpg`
                                });
                                count++;
                            }
                        }
                    }
                }

                if (validVideos.length === 0) {
                    throw new Error("No videos found (YouTube blocked IP or empty channel)");
                }

                const filteredVideos = [];
                for (const v of validVideos) {
                    try {
                        const checkShorts = await fetch(`https://www.youtube.com/shorts/${v.videoId}`, {
                            method: 'HEAD',
                            redirect: 'manual',
                            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
                        });
                        if (checkShorts.status !== 200) {
                            filteredVideos.push(v);
                        }
                    } catch (e) {
                        filteredVideos.push(v);
                    }
                }
                
                const finalVideos = filteredVideos.slice(0, 2);
                if (finalVideos.length === 0) {
                    throw new Error("Only shorts found or filtering failed.");
                }

                const validVideoIds = finalVideos.map(v => v.videoId);

                // 사용자의 요청: 최신 2개 영상에 해당하는 기록은 살려두고(AI 정보 보존), 나머지만 삭제!
                await ((prisma as any).creatorVideo.deleteMany as any)({
                    where: {
                        channelId: channel.id,
                        videoId: { notIn: validVideoIds } // 이번에 수집된 최신 2개는 삭제 대상에서 제외!
                    }
                });

                let newCount = 0;
                // 살아남은(또는 신규) 2개 영상 DB 처리
                for (const video of finalVideos) {
                    const existing = await ((prisma as any).creatorVideo.findUnique as any)({ where: { videoId: video.videoId } });

                    if (!existing) {
                        const isRecommended = containsKeyword(video.title, keywordStrings) || containsKeyword(video.description, keywordStrings);

                        await ((prisma as any).creatorVideo.create as any)({
                            data: {
                                channelId: channel.id,
                                videoId: video.videoId,
                                title: video.title,
                                description: video.description.substring(0, 1500), // 토큰 낭비 방지 (광고/스펙 컷)
                                url: video.url,
                                thumbnail: video.thumbnail,
                                publishedAt: video.publishedAt,
                                isAiRecommended: isRecommended
                            }
                        });
                        newCount++;
                        newVideosCount++;

                        if (isRecommended) {
                            const msg = `🚨 [키워드 감지]\n📹 분류: 유튜브 채널 (${channel.title})\n📝 제목: ${video.title}\n🔗 원문 링크: ${video.url}\n🖥️ 시스템 확인: ${siteUrl}`;
                            await sendTelegramAlert(msg);
                        }
                    } else if (existing.thumbnail !== video.thumbnail) {
                        // 기존 영상이라도 썸네일 고화질(maxresdefault.jpg)로 강제 업데이트 처리
                        await ((prisma as any).creatorVideo.update as any)({
                            where: { videoId: video.videoId },
                            data: { thumbnail: video.thumbnail }
                        });
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
                successCount++;

                processed.push({ channel: channel.title, newVideos: newCount });

                // 유튜브 404 차단을 우회하기 위해 한 채널 파싱이 끝날 때마다 안전한 휴식(1.5초) 부여
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
                errorCount++;
            }
        }

        const summaryMsg = `✅ [모니터링 완료] 유튜브\n- 정상 작동: ${successCount}개 채널\n- 접속 에러: ${errorCount}개 채널\n- 새로 업데이트: ${newVideosCount}개 영상\n🖥️ 시스템 대시보드: ${siteUrl}`;
        await sendTelegramAlert(summaryMsg);

        return NextResponse.json({ success: true, processed });

    } catch (error: any) {
        console.error('YouTube Scraper API Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
