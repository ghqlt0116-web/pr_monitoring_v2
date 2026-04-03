import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const rawVideos = await prisma.creatorVideo.findMany({
            include: { channel: true },
            orderBy: { publishedAt: 'desc' },
            take: 100
        });

        // 각 채널별로 최신 2개씩만 필터링하여 화면에 표시
        const channelCounts: Record<string, number> = {};
        const filteredVideos = [];

        for (const video of rawVideos) {
            // 커뮤니티 게시물은 버림
            if (video.title.startsWith('[커뮤니티]')) continue;

            const chId = video.channelId;
            if (!channelCounts[chId]) channelCounts[chId] = 0;

            if (channelCounts[chId] < 2) {
                filteredVideos.push(video);
                channelCounts[chId]++;
            }
        }

        return NextResponse.json(filteredVideos);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE() {
    try {
        await prisma.creatorVideo.deleteMany({});
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
