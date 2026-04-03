import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const channels = await prisma.creatorChannel.findMany({
            orderBy: [{ tier: 'asc' }, { title: 'asc' }]
        });
        return NextResponse.json(channels);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { youtubeId, tier } = await req.json();
        if (!youtubeId) return NextResponse.json({ error: 'youtubeId required' }, { status: 400 });

        let title = "알 수 없는 채널";
        let thumbnail = null;

        // 1. 100% 정확한 유튜브 공식 API 사용 (키가 있는 경우)
        if (process.env.YOUTUBE_API_KEY) {
            const ytApiRes = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${youtubeId}&key=${process.env.YOUTUBE_API_KEY}`);
            const ytData = await ytApiRes.json();
            if (ytData.items && ytData.items.length > 0) {
                title = ytData.items[0].snippet.title;
                thumbnail = ytData.items[0].snippet.thumbnails?.default?.url || null;
            }
        }

        // 2. 만약 API 연동 실패 시 기본 RSS 크롤링으로 Fallback (비상 대책)
        if (title === "알 수 없는 채널") {
            const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeId}`);
            if (rssRes.ok) {
                const xmlText = await rssRes.text();
                const $ = cheerio.load(xmlText, { xmlMode: true });
                const extractedName = $('author > name').first().text();
                if (extractedName) title = extractedName;
            }
        }

        const channel = await prisma.creatorChannel.create({
            data: { youtubeId, title, tier: tier ? parseInt(tier) : 3, thumbnail }
        });
        return NextResponse.json(channel);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        await prisma.creatorChannel.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(req: Request) {
    try {
        const { id, tier } = await req.json();
        if (!id || !tier) return NextResponse.json({ error: 'id and tier required' }, { status: 400 });

        const updated = await prisma.creatorChannel.update({
            where: { id },
            data: { tier: parseInt(tier) }
        });
        return NextResponse.json(updated);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
