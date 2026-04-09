import { prisma } from '@/lib/prisma';

export function containsKeyword(text: string, keywords: string[]) {
    const spacelessText = text.toLowerCase().replace(/\s+/g, '');
    return keywords.some(k => {
        const parts = k.split('-');
        const reqParts = parts[0].split('+');
        const exclParts = parts.slice(1);

        const hasAllReq = reqParts.every(req => spacelessText.includes(req.toLowerCase().replace(/\s+/g, '')));
        if (!hasAllReq) return false;

        if (exclParts.length > 0) {
            const hasExcluded = exclParts.some(ex => ex.length > 0 && spacelessText.includes(ex.toLowerCase().replace(/\s+/g, '')));
            if (hasExcluded) return false;
        }

        return true;
    });
}

export async function reevaluateAllCreatorVideos() {
    const dbKeywords = await (prisma as any).creatorKeyword.findMany({ where: { isActive: true } });
    const keywordStrings = dbKeywords.map((k: any) => k.keyword);

    // Default keywords if DB is empty
    if (keywordStrings.length === 0) {
        keywordStrings.push('망 사용료', 'cp사', '트래픽', '통신사', 'skb', '망이용대가');
    }

    const videos = await (prisma as any).creatorVideo.findMany();

    for (const vid of videos) {
        const isRecommended = containsKeyword(vid.title, keywordStrings) || containsKeyword(vid.description || '', keywordStrings);

        if (vid.isAiRecommended !== isRecommended) {
            await (prisma as any).creatorVideo.update({
                where: { id: vid.id },
                data: { isAiRecommended: isRecommended }
            });
        }
    }
}
