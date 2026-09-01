import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req?: Request) {
  try {
    const { searchParams } = new URL(req?.url || 'http://localhost/api/episodes');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    const episodes = await (prisma.episode.findMany as any)({
      where: includeInactive ? undefined : {
        program: {
          isActive: true
        }
      },
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
