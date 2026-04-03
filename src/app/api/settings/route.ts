import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { reevaluateAllEpisodes } from '@/lib/analyze';

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keywords = await prisma.programKeyword.findMany({ where: { isActive: true } });

    if (keywords.length === 0) {
      // Seed default keywords if empty
      const defaultHigh = ["통신", "망사용료", "sk", "브로드밴드", "에스케이", "파업", "노조", "방통위", "과기부", "망이용대가", "갑질", "개인정보 유출"];
      const defaultMid = ["인터넷", "플랫폼", "ott", "넷플릭스", "유튜브", "디지털", "해킹", "개인정보", "iptv", "케이블방송", " ai ", "인공지능"];

      await prisma.programKeyword.createMany({
        data: [
          ...defaultHigh.map(k => ({ keyword: k, level: 'HIGH' })),
          ...defaultMid.map(k => ({ keyword: k, level: 'MID' }))
        ],
        skipDuplicates: true
      });
      return NextResponse.json({ highKeywords: defaultHigh, midKeywords: defaultMid });
    }

    const highKeywords = keywords.filter(k => k.level === 'HIGH').map(k => k.keyword);
    const midKeywords = keywords.filter(k => k.level === 'MID').map(k => k.keyword);

    return NextResponse.json({ highKeywords, midKeywords });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    await prisma.$transaction([
      prisma.programKeyword.deleteMany({}),
      prisma.programKeyword.createMany({
        data: [
          ...body.highKeywords.map((k: string) => ({ keyword: k, level: 'HIGH' })),
          ...body.midKeywords.map((k: string) => ({ keyword: k, level: 'MID' }))
        ],
        skipDuplicates: true
      })
    ]);

    await reevaluateAllEpisodes();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
