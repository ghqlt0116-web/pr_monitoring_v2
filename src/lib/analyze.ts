import { prisma } from '@/lib/prisma';

export function analyzeWithKeywords(title: string, text: string, highKeywords: string[], midKeywords: string[]) {
    const content = (title + ' ' + text).toLowerCase();
    const spacelessContent = content.replace(/\s+/g, '');

    let matchedKeywords: string[] = [];

    for (const kw of highKeywords) {
        const subKws = kw.split('+');
        const allMatch = subKws.every(sub => spacelessContent.includes(sub.toLowerCase().replace(/\s+/g, '')));
        if (allMatch) matchedKeywords.push(kw);
    }
    if (matchedKeywords.length > 0) {
        return { category: '통신/IT 핵심', riskLevel: '상', summary: `주요 키워드 감지: ${matchedKeywords.join(', ')}` };
    }

    for (const kw of midKeywords) {
        const subKws = kw.split('+');
        const allMatch = subKws.every(sub => spacelessContent.includes(sub.toLowerCase().replace(/\s+/g, '')));
        if (allMatch) matchedKeywords.push(kw);
    }
    if (matchedKeywords.length > 0) {
        return { category: '미디어/플랫폼', riskLevel: '중', summary: `관련 키워드 감지: ${matchedKeywords.join(', ')}` };
    }

    return { category: '일반시사', riskLevel: '하', summary: '특이 키워드 없음' };
}

export async function reevaluateAllEpisodes() {
    const dbKeywords = await prisma.programKeyword.findMany({ where: { isActive: true } });
    let highKeywords = dbKeywords.filter(k => k.level === 'HIGH').map(k => k.keyword);
    let midKeywords = dbKeywords.filter(k => k.level === 'MID').map(k => k.keyword);

    if (highKeywords.length === 0 && midKeywords.length === 0) {
        highKeywords = ['통신', '망사용료', 'sk', '브로드밴드', '에스케이', '파업', '노조', '방통위', "과기부", "망이용대가", "갑질", "개인정보 유출"];
        midKeywords = ['인터넷', '플랫폼', 'ott', "넷플릭스", "유튜브", "디지털", "해킹", "개인정보", "iptv", "케이블방송", " ai ", "인공지능"];
    }

    const episodes = await prisma.episode.findMany();

    for (const episode of episodes) {
        const analysisResult = analyzeWithKeywords(episode.title, episode.content, highKeywords, midKeywords);

        // Only update if changed visually
        if (episode.riskLevel !== analysisResult.riskLevel || episode.summary !== analysisResult.summary) {
            await prisma.episode.update({
                where: { id: episode.id },
                data: {
                    category: analysisResult.category,
                    riskLevel: analysisResult.riskLevel,
                    summary: analysisResult.summary,
                }
            });
        }
    }
}
