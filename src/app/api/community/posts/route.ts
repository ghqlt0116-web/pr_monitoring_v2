import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const posts = await (prisma as any).communityPost.findMany({
            orderBy: { publishedAt: 'desc' },
            take: 200,
            include: { target: true }
        });
        return NextResponse.json(posts);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
