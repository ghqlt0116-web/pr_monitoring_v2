import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reevaluateAllCreatorVideos } from '@/lib/creatorAnalyze';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const keywords = await prisma.creatorKeyword.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(keywords);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { keyword } = await req.json();
        if (!keyword) return NextResponse.json({ error: 'keyword required' }, { status: 400 });

        const kw = await prisma.creatorKeyword.create({
            data: { keyword, isActive: true }
        });

        await reevaluateAllCreatorVideos();

        return NextResponse.json(kw);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

        await prisma.creatorKeyword.delete({ where: { id } });

        await reevaluateAllCreatorVideos();

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
