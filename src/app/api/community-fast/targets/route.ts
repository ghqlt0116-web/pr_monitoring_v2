import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        let targets = await (prisma as any).realtimeCommunityTarget.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // Auto-seed default targets if missing
        if (targets.length === 0) {
            await (prisma as any).realtimeCommunityTarget.createMany({
                data: [
                    { siteName: '뽐뿌 (자유게시판)', siteType: 'PPOMPPU' },
                    { siteName: '루리웹 (유머게시판)', siteType: 'RULIWEB' }
                ]
            });
            targets = await (prisma as any).realtimeCommunityTarget.findMany({
                orderBy: { createdAt: 'desc' }
            });
        } else if (targets.length === 1) {
            // In case only one exists, ensure both exist
            const existingTypes = targets.map((t: any) => t.siteType);
            const defaults = [
                { siteName: '뽐뿌 (자유게시판)', siteType: 'PPOMPPU' },
                { siteName: '루리웹 (유머게시판)', siteType: 'RULIWEB' }
            ];
            for (const def of defaults) {
                if (!existingTypes.includes(def.siteType)) {
                    await (prisma as any).realtimeCommunityTarget.create({ data: def });
                }
            }
            targets = await (prisma as any).realtimeCommunityTarget.findMany({
                orderBy: { createdAt: 'desc' }
            });
        }

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

        let target = await (prisma as any).realtimeCommunityTarget.findUnique({ where: { siteType } });
        if (!target) {
            target = await (prisma as any).realtimeCommunityTarget.create({
                data: { siteName, siteType }
            });
        }
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
