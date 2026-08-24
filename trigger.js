const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function containsKeyword(text, keywords) {
    if (!text) return false;
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

async function run() {
    console.log("Reevaluating Creators...");
    const creatorKeywordsObj = await prisma.creatorKeyword.findMany({ where: { isActive: true } });
    const creatorKeywords = creatorKeywordsObj.map(k => k.keyword);

    const videos = await prisma.creatorVideo.findMany();
    for (const vid of videos) {
        const isRec = containsKeyword(vid.title, creatorKeywords) || containsKeyword(vid.description || '', creatorKeywords);
        if (vid.isAiRecommended !== isRec) {
            await prisma.creatorVideo.update({ where: { id: vid.id }, data: { isAiRecommended: isRec } });
        }
    }

    console.log("Reevaluating Community...");
    const commKeywordsObj = await prisma.communityKeyword.findMany({ where: { isActive: true } });
    const commKeywords = commKeywordsObj.map(k => k.keyword);

    const posts = await prisma.communityPost.findMany();
    for (const post of posts) {
        const isRec = containsKeyword(post.title, commKeywords) || containsKeyword(post.content, commKeywords);
        if (post.isAiRecommended !== isRec) {
            await prisma.communityPost.update({ where: { id: post.id }, data: { isAiRecommended: isRec } });
        }
    }

    console.log("Done syncing DB.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
