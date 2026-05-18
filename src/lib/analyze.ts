import { prisma } from '@/lib/prisma';

export function analyzeWithKeywords(title: string, text: string, highKeywords: string[], midKeywords: string[]) {
    const content = (title + ' ' + text).toLowerCase();
    const spacelessContent = content.replace(/\s+/g, '');

    let matchedKeywords: string[] = [];

    for (const kw of highKeywords) {
        if (!kw || !kw.trim()) continue;
        const parts = kw.split('-');
        const reqParts = parts[0].split('+');
        const exclParts = parts.slice(1);

        const allMatch = reqParts.every(sub => spacelessContent.includes(sub.toLowerCase().replace(/\s+/g, '')));
        if (allMatch) {
            const hasExclude = exclParts.some(ex => ex.length > 0 && spacelessContent.includes(ex.toLowerCase().replace(/\s+/g, '')));
            if (!hasExclude) matchedKeywords.push(kw);
        }
    }
    if (matchedKeywords.length > 0) {
        return { category: '통신/IT 핵심', riskLevel: '상', summary: `주요 키워드 감지: ${matchedKeywords.join(', ').replace(/\+/g, ' ').replace(/-/g, ' (제외: ').replace(/(\(제외: .*)$/, '$1)')}` };
    }

    for (const kw of midKeywords) {
        if (!kw || !kw.trim()) continue;
        const parts = kw.split('-');
        const reqParts = parts[0].split('+');
        const exclParts = parts.slice(1);

        const allMatch = reqParts.every(sub => spacelessContent.includes(sub.toLowerCase().replace(/\s+/g, '')));
        if (allMatch) {
            const hasExclude = exclParts.some(ex => ex.length > 0 && spacelessContent.includes(ex.toLowerCase().replace(/\s+/g, '')));
            if (!hasExclude) matchedKeywords.push(kw);
        }
    }
    if (matchedKeywords.length > 0) {
        return { category: '미디어/플랫폼', riskLevel: '중', summary: `관련 키워드 감지: ${matchedKeywords.join(', ')}` };
    }

    return { category: '일반시사', riskLevel: '하', summary: '특이 키워드 없음' };
}

export async function reevaluateAllEpisodes() {
    const dbKeywords = await (prisma as any).programKeyword.findMany({ where: { isActive: true } });
    let highKeywords = dbKeywords.filter((k: any) => k.level === 'HIGH').map((k: any) => k.keyword);
    let midKeywords = dbKeywords.filter((k: any) => k.level === 'MID').map((k: any) => k.keyword);

    if (highKeywords.length === 0 && midKeywords.length === 0) {
        highKeywords = ['통신', '망사용료', 'sk', '브로드밴드', '에스케이', '파업', '노조', '방통위', "과기부", "망이용대가", "갑질", "개인정보 유출"];
        midKeywords = ['인터넷', '플랫폼', 'ott', "넷플릭스", "유튜브", "디지털", "해킹", "개인정보", "iptv", "케이블방송", " ai ", "인공지능"];
    }

    const episodes = await prisma.episode.findMany();

    const updatePromises: any[] = [];

    for (const episode of episodes) {
        const analysisResult = analyzeWithKeywords(episode.title, episode.content, highKeywords, midKeywords);

        // Only update if changed visually
        if (episode.riskLevel !== analysisResult.riskLevel || episode.summary !== analysisResult.summary) {
            updatePromises.push(
                prisma.episode.update({
                    where: { id: episode.id },
                    data: {
                        category: analysisResult.category,
                        riskLevel: analysisResult.riskLevel,
                        summary: analysisResult.summary,
                    }
                })
            );
        }
    }

    if (updatePromises.length > 0) {
        // 단일 DB 커넥션으로 수십~수백 개의 쿼리를 일괄(Batch) 처리하여 속도 10배 향상 및 트래픽 절약
        await prisma.$transaction(updatePromises);
    }
}
