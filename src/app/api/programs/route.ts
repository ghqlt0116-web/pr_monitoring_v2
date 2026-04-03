import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const programs = await prisma.program.findMany({
            orderBy: { createdAt: 'desc' }
        });
        return NextResponse.json(programs);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
