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
        let { siteName, url } = await req.json();
        if (!url) return NextResponse.json({ error: "Missing URL" }, { status: 400 });

        if (!siteName || siteName.trim() === '') {
            try {
                const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
                if (res.ok) {
                    const html = await res.text();
                    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
                    siteName = titleMatch ? titleMatch[1].trim() : '수집 대상';
                    // 네이버 블로그 등 특수문자 클리닝
                    siteName = siteName.replace(/ : 네이버 블로그$/, '').replace(/ : 네이버 포스트$/, '');
                } else {
                    siteName = '수집 대상';
                }
            } catch (e) {
                siteName = '수집 대상';
            }
        }

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
