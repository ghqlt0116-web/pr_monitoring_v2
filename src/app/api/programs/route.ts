import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        let programs = await (prisma.program.findMany as any)({
            include: {
                episodes: {
                    orderBy: { broadcastDate: 'desc' },
                    take: 1
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        const now = new Date();
        const enrichedPrograms = [];

        for (const p of programs) {
            let needsUpdate = false;
            let ch = p.channel;
            let link = p.url;

            // '더 보다'가 여전히 활성화되어 있다면 자동 비활성화(제외)
            let isActive = p.isActive !== undefined ? p.isActive : true;
            if (p.title.includes('더 보다') || p.title.includes('더보다')) {
                isActive = false;
                needsUpdate = true;
            }

            if (!ch) {
                ch = 'TV';
                if (p.title.includes('알고싶다') || p.title.includes('이야기 Y')) ch = 'SBS';
                else if (p.title.includes('수첩') || p.title.includes('스트레이트')) ch = 'MBC';
                else if (p.title.includes('시사기획')) ch = 'KBS';
                needsUpdate = true;
            }

            if (!link || link.includes('boards/55075') || link.includes('boards/54659')) {
                if (p.title.includes('알고싶다')) link = 'https://programs.sbs.co.kr/culture/unansweredquestions/clips/55073';
                else if (p.title.includes('이야기 Y')) link = 'https://programs.sbs.co.kr/culture/cube/clips/54885';
                else if (p.title.includes('수첩')) link = 'https://program.imbc.com/board/pdnote/6182';
                else if (p.title.includes('스트레이트')) link = 'https://program.imbc.com/straight';
                else if (p.title.includes('시사기획')) link = 'https://program.kbs.co.kr/1tv/culture/window/pc/board.html?smenu=c8144b';
                else link = '#';
                needsUpdate = true;
            }

            if (needsUpdate) {
                await (prisma.program.update as any)({
                    where: { id: p.id },
                    data: { channel: ch, url: link, isActive }
                });
                p.channel = ch;
                p.url = link;
                p.isActive = isActive;
            }

            // 최신 에피소드 날짜 및 미갱신 경과일(staleDays) 계산
            const latestEp = p.episodes?.[0];
            let latestEpisodeDate: string | null = null;
            let staleDays = 0;
            let isStaleCandidate = false; // 30일 이상 미갱신 시 종영/휴방 의심

            if (latestEp) {
                const dateStr = latestEp.broadcastDate || latestEp.scrapedAt;
                if (dateStr) {
                    const epDate = new Date(dateStr);
                    if (!isNaN(epDate.getTime())) {
                        latestEpisodeDate = epDate.toISOString();
                        const diffTime = Math.max(0, now.getTime() - epDate.getTime());
                        staleDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                        // 30일 이상 새 에피소드가 갱신되지 않았으면 종영 의심
                        if (staleDays >= 30) {
                            isStaleCandidate = true;
                        }
                    }
                }
            } else if (p.lastScrapedAt) {
                const diffTime = Math.max(0, now.getTime() - new Date(p.lastScrapedAt).getTime());
                staleDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                if (staleDays >= 30) {
                    isStaleCandidate = true;
                }
            }

            enrichedPrograms.push({
                ...p,
                latestEpisode: latestEp || null,
                latestEpisodeDate,
                staleDays,
                isStaleCandidate: isActive && isStaleCandidate
            });
        }

        return NextResponse.json(enrichedPrograms);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const body = await req.json();
        const { id, isActive } = body;

        if (!id || typeof isActive !== 'boolean') {
            return NextResponse.json({ error: 'id and isActive(boolean) are required' }, { status: 400 });
        }

        const updated = await (prisma.program.update as any)({
            where: { id },
            data: { isActive }
        });

        return NextResponse.json({ success: true, program: updated });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
