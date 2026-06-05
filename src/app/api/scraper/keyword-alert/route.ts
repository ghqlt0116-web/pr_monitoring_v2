import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import { sendTelegramAlert } from '@/lib/telegram';
import iconv from 'iconv-lite';

export async function POST() {
    try {
        const targets = await (prisma as any).realtimeCommunityTarget.findMany({ where: { isActive: true } });
        const keywords = await (prisma as any).realtimeKeyword.findMany({ where: { isActive: true } });

        if (targets.length === 0 || keywords.length === 0) {
            return NextResponse.json({ success: true, message: 'No active targets or keywords' });
        }

        let totalNewAlerts = 0;

        for (const target of targets) {
            let maxScrapedId = target.lastScrapedPostId || '0';
            let newMaxId = maxScrapedId;
            let posts: any[] = [];

            if (target.siteType === 'PPOMPPU') {
                const url = `https://www.ppomppu.co.kr/zboard/zboard.php?id=freeboard`;
                const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
                const htmlBuffer = await res.arrayBuffer();
                const decodedHtml = iconv.decode(Buffer.from(htmlBuffer), 'euc-kr');
                const $ = cheerio.load(decodedHtml);

                $('tr.list1, tr.list0').each((i, el) => {
                    const aTag = $(el).find('a').filter((i, a) => $(a).attr('href')?.includes('view.php?id=freeboard'));
                    if(aTag.length > 0) {
                        const title = aTag.text().trim();
                        const href = aTag.attr('href')!;
                        const noMatch = href.match(/no=(\d+)/);
                        if(noMatch) {
                            posts.push({ id: noMatch[1], title, url: 'https://www.ppomppu.co.kr/zboard/' + href });
                        }
                    }
                });
            } else if (target.siteType === 'RULIWEB') {
                const url = `https://bbs.ruliweb.com/community/board/300143`;
                const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, cache: 'no-store' });
                const html = await res.text();
                const $ = cheerio.load(html);

                $('tr.table_body:not(.notice)').each((i, el) => {
                    const aTag = $(el).find('a.subject_link');
                    const title = aTag.text().trim();
                    const href = aTag.attr('href');
                    if(href) {
                        const noMatch = href.match(/read\/(\d+)/);
                        if(noMatch) {
                            posts.push({ id: noMatch[1], title, url: href });
                        }
                    }
                });
            }

            // Check posts
            for (const post of posts) {
                if (parseInt(post.id) > parseInt(maxScrapedId)) {
                    // Check against all keywords
                    let matchedKeywords: string[] = [];
                    for (const kwObj of keywords) {
                        if (checkKeywordMatch(post.title, kwObj.keyword)) {
                            matchedKeywords.push(kwObj.keyword);
                        }
                    }

                    if (matchedKeywords.length > 0) {
                        const keywordDisplay = matchedKeywords.map(k => k.replace(/\+/g, ' + ').replace(/-/g, ' (제외: ').replace(/(\(제외: .*)$/, '$1)')).join(' | ');
                        const alertMsg = `🚨 [키워드 감지] ${target.siteName}\n- 키워드: ${keywordDisplay}\n- 제목: ${post.title}\n- 링크: ${post.url}`;
                        await sendTelegramAlert(alertMsg);
                        totalNewAlerts++;
                    }

                    if (parseInt(post.id) > parseInt(newMaxId)) {
                        newMaxId = post.id;
                    }
                }
            }

            if (newMaxId !== maxScrapedId) {
                await (prisma as any).realtimeCommunityTarget.update({
                    where: { id: target.id },
                    data: { lastScrapedPostId: newMaxId }
                });
            }
        }

        return NextResponse.json({ success: true, processed: totalNewAlerts });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

function checkKeywordMatch(text: string, keywordRule: string) {
    const spacelessText = text.toLowerCase().replace(/\s+/g, '');
    const parts = keywordRule.split('-');
    const reqParts = parts[0].split('+');
    const exclParts = parts.slice(1);
    
    const hasAllReq = reqParts.every(req => spacelessText.includes(req.toLowerCase().replace(/\s+/g, '')));
    if (!hasAllReq) return false;
    
    if (exclParts.length > 0) {
        const hasExcluded = exclParts.some(ex => ex.length > 0 && spacelessText.includes(ex.toLowerCase().replace(/\s+/g, '')));
        if (hasExcluded) return false;
    }
    
    return true;
}
