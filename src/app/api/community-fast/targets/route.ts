import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const targets = await (prisma as any).realtimeCommunityTarget.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(targets);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        let { siteName, siteType } = await req.json();
        if (!siteType) return NextResponse.json({ error: "Missing siteType" }, { status: 400 });

        if (!siteName || siteName.trim() === '') {
            siteName = siteType === 'PPOMPPU' ? '뽐뿌 (자유게시판)' : siteType === 'RULIWEB' ? '루리웹 (유머게시판)' : '커뮤니티';
        }

        const target = await (prisma as any).realtimeCommunityTarget.create({
            data: { siteName, siteType }
        });
        return NextResponse.json(target);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        await (prisma as any).realtimeCommunityTarget.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
