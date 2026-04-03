import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const keywords = await (prisma as any).communityKeyword.findMany({
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
        if (!keyword) return NextResponse.json({ error: "Missing keyword" }, { status: 400 });

        const newKeyword = await (prisma as any).communityKeyword.create({
            data: { keyword }
        });
        return NextResponse.json(newKeyword);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { id } = await req.json();
        if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

        await (prisma as any).communityKeyword.delete({ where: { id } });
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
