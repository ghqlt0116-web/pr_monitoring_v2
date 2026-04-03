import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const episodes = await prisma.episode.findMany({
      orderBy: { broadcastDate: 'desc' },
      include: {
        program: true
      }
    });
    return NextResponse.json(episodes);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
