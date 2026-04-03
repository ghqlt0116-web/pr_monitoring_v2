import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const targets = await (prisma as any).communityTarget.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(targets);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { siteName, url } = await req.json();
        if (!siteName || !url) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

        const target = await (prisma as any).communityTarget.create({
            data: { siteName, url }
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

        // First delete associated posts to avoid foreign key constraints
        await (prisma as any).communityPost.deleteMany({ where: { targetId: id } });

        await (prisma as any).communityTarget.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
