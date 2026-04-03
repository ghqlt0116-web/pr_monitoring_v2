require('dotenv').config()
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
    const programs = [
        { channel: 'SBS', title: '그것이 알고싶다', url: 'https://programs.sbs.co.kr/culture/unansweredquestions/clips/55073' },
        { channel: 'SBS', title: '궁금한 이야기 Y', url: 'https://programs.sbs.co.kr/culture/cube/clips/54885' },
        { channel: 'MBC', title: 'PD수첩', url: 'https://m.imbc.com/VOD/PreVodList/1000836100000100000' },
        { channel: 'MBC', title: '탐사기획 스트레이트', url: 'https://m.imbc.com/VOD/PreVodList/1003647100340100000' },
        { channel: 'KBS', title: '시사기획 창', url: 'https://program.kbs.co.kr/1tv/culture/window/pc/board.html?smenu=c8144b' },
        { channel: 'KBS', title: '더 보다', url: 'https://program.kbs.co.kr/1tv/culture/theboda/pc/board.html?smenu=a9d602' }
    ];

    for (const prog of programs) {
        const exists = await prisma.program.findFirst({ where: { title: prog.title } });
        if (!exists) {
            await prisma.program.create({ data: prog });
            console.log(`Created: ${prog.title}`);
        } else {
            await prisma.program.update({ where: { id: exists.id }, data: { url: prog.url } });
            console.log(`Updated: ${prog.title} -> ${prog.url}`);
        }
    }
}

main()
    .catch(e => {
        console.error(e)
        process.exit(1)
    })
    .finally(async () => {
        await prisma.$disconnect()
    })
