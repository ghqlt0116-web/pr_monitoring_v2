import { prisma } from '@/lib/prisma';

export function containsKeyword(text: string, keywords: string[]) {
    const spacelessText = text.toLowerCase().replace(/\s+/g, '');
    return keywords.some(k => {
        const subKws = k.split('+');
        return subKws.every(sub => spacelessText.includes(sub.toLowerCase().replace(/\s+/g, '')));
    });
}

export async function reevaluateAllCreatorVideos() {
    const dbKeywords = await prisma.creatorKeyword.findMany({ where: { isActive: true } });
    const keywordStrings = dbKeywords.map(k => k.keyword);

    // Default keywords if DB is empty
    if (keywordStrings.length === 0) {
        keywordStrings.push('망 사용료', 'cp사', '트래픽', '통신사', 'skb', '망이용대가');
    }

    const videos = await prisma.creatorVideo.findMany();

    for (const vid of videos) {
        const isRecommended = containsKeyword(vid.title, keywordStrings) || containsKeyword(vid.description || '', keywordStrings);

        if (vid.isAiRecommended !== isRecommended) {
            await prisma.creatorVideo.update({
                where: { id: vid.id },
                data: { isAiRecommended: isRecommended }
            });
        }
    }
}
