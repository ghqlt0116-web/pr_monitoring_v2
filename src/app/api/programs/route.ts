import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = "force-dynamic";

export async function GET() {
    try {
        let programs = await prisma.program.findMany({
            orderBy: { createdAt: 'desc' }
        });

        // 자동 복원 패치 (channel 또는 url 값이 비어있는 옛날 데이터용)
        for (const p of programs) {
            let needsUpdate = false;
            let ch = p.channel;
            let link = p.url;

            if (!ch) {
                ch = 'TV';
                if (p.title.includes('알고싶다') || p.title.includes('이야기 Y')) ch = 'SBS';
                else if (p.title.includes('수첩') || p.title.includes('스트레이트')) ch = 'MBC';
                else if (p.title.includes('시사기획') || p.title.includes('더 보다')) ch = 'KBS';
                needsUpdate = true;
            }

            if (!link || link.includes('boards/55075') || link.includes('boards/54659')) {
                if (p.title.includes('알고싶다')) link = 'https://programs.sbs.co.kr/culture/unansweredquestions/clips/55073';
                else if (p.title.includes('이야기 Y')) link = 'https://programs.sbs.co.kr/culture/cube/clips/54885';
                else if (p.title.includes('수첩')) link = 'https://program.imbc.com/board/pdnote/6182';
                else if (p.title.includes('스트레이트')) link = 'https://program.imbc.com/straight';
                else if (p.title.includes('시사기획')) link = 'https://program.kbs.co.kr/1tv/culture/window/pc/board.html?smenu=c8144b';
                else if (p.title.includes('더 보다')) link = 'https://program.kbs.co.kr/1tv/culture/theboda/pc/board.html?smenu=a9d602';
                else link = '#';
                needsUpdate = true;
            }

            if (needsUpdate) {
                await (prisma.program.update as any)({
                    where: { id: p.id },
                    data: { channel: ch, url: link }
                });
                p.channel = ch;
                p.url = link;
            }
        }
        return NextResponse.json(programs);
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
