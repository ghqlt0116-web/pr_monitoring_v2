import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';

const PROGRAMS = [
    { channel: 'SBS', title: '그것이 알고싶다', url: 'https://programs.sbs.co.kr/culture/unansweredquestions/boards/55075' },
    { channel: 'SBS', title: '궁금한 이야기 Y', url: 'https://programs.sbs.co.kr/culture/cube/boards/54659' },
    { channel: 'MBC', title: 'PD수첩', url: 'https://program.imbc.com/board/pdnote/6182' },
    { channel: 'MBC', title: '탐사기획 스트레이트', url: 'https://program.imbc.com/straight' },
    { channel: 'KBS', title: '시사기획 창', url: 'https://program.kbs.co.kr/1tv/culture/window/pc/board.html?smenu=c8144b' },
    { channel: 'KBS', title: '더 보다', url: 'https://program.kbs.co.kr/1tv/culture/theboda/pc/board.html?smenu=a9d602' }
];

async function ensureSeed() {
    for (const prog of PROGRAMS) {
        const exists = await prisma.program.findFirst({ where: { title: prog.title } });
        if (!exists) {
            await prisma.program.create({ data: prog });
        }
    }
}

export async function GET(request: Request) {
    try {
        // 1. 초기 데이터 점검
        await ensureSeed();

        const sbsProgram = await prisma.program.findFirst({
            where: { title: '그것이 알고싶다' }
        });

        if (!sbsProgram) {
            return NextResponse.json({ error: 'Program not found' }, { status: 404 });
        }

        // 2. SBS '그것이 알고싶다' 예고편 게시판 파싱 (예시)
        // 실제 HTML 구조에 따라 DOM 셀렉터 수정 필요
        const response = await fetch(sbsProgram.url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        const html = await response.text();
        const $ = cheerio.load(html);

        // TODO: SBS 게시판 목록의 실제 CSS 셀렉터를 확인해야 합니다.
        const results: any[] = [];

        // 임시로 응답 반환
        return NextResponse.json({
            success: true,
            message: '시딩 및 기본 크롤러 구조 준비 완료',
            sampleHtmlLength: html.length
        });

    } catch (error: any) {
        console.error(error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
