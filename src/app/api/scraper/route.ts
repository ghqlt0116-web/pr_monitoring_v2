import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { analyzeWithKeywords } from '@/lib/analyze';

// 프로그램 기본 설정 맵핑
const CONFIG: Record<string, { type: 'SBS_API' | 'KBS_API' | 'MBC_HTML', id?: string }> = {
  '그것이 알고싶다': { type: 'SBS_API', id: 'S01_V0000010101' },
  '궁금한 이야기 Y': { type: 'SBS_API', id: 'S01_V0000339666' },
  '시사기획 창': { type: 'KBS_API', id: 'T2011-1097-04-428648' },
  '더 보다': { type: 'KBS_API', id: 'T2024-0017-02-480685' },
  'PD수첩': { type: 'MBC_HTML', id: '1000836100000100000' },
  '탐사기획 스트레이트': { type: 'MBC_HTML', id: '1003647100000100000' },
};

export async function GET() { return POST(); }

export async function POST(req?: Request) {
  try {
    const body = req ? await req.json().catch(() => ({})) : {};
    const force = body.force === true;

    const programs = await prisma.program.findMany();

    // 5시간(18000000ms) 이내에 성공한 모니터링 기록이 있으면 무시 (무한 갱신 방어 - 강제 갱신은 예외)
    if (!force) {
      const recentProg = await (prisma.program.findFirst as any)({
        orderBy: { lastScrapedAt: 'desc' },
        where: { lastScrapeStatus: 'SUCCESS' }
      });
      if (recentProg && recentProg.lastScrapedAt) {
        const diffMs = new Date().getTime() - new Date(recentProg.lastScrapedAt).getTime();
        if (diffMs < 5 * 60 * 60 * 1000) {
          return NextResponse.json({ success: true, message: 'Recently scraped. Throttled.' });
        }
      }
    }

    // DB에서 키워드 로드
    const dbKeywords = await prisma.programKeyword.findMany({ where: { isActive: true } });
    let highKeywords = dbKeywords.filter((k: any) => k.level === 'HIGH').map((k: any) => k.keyword);
    let midKeywords = dbKeywords.filter((k: any) => k.level === 'MID').map((k: any) => k.keyword);

    if (highKeywords.length === 0 && midKeywords.length === 0) {
      highKeywords = ['통신', '망사용료', 'sk', '브로드밴드', '에스케이', '파업', '노조', '방통위', "과기부", "망이용대가", "갑질", "개인정보 유출"];
      midKeywords = ['인터넷', '플랫폼', 'ott', "넷플릭스", "유튜브", "디지털", "해킹", "개인정보", "iptv", "케이블방송", " ai ", "인공지능"];
    }

    const results = [];

    for (const prog of programs) {
      const conf = CONFIG[prog.title];
      if (!conf) continue;

      let extracted: { title: string, content: string, url: string, thumb?: string, date?: string }[] = [];

      try {
        if (conf.type === 'SBS_API') {
          const res = await fetch(`https://static.apis.sbs.co.kr/play-api/1.0/clip/sbs_vodall/${conf.id}?limit=1`);
          const data = await res.json();
          for (const item of data) {
            extracted.push({
              title: item.title,
              content: item.synopsis || item.title,
              url: prog.url, // 사용자가 요청한 예고편 메인 게시판 URL로 연결
              thumb: item.thumb?.large || item.thumb?.medium,
              date: item.broaddate
            });
          }
        }
        else if (conf.type === 'KBS_API') {
          const res = await fetch(`https://cfpbbsapi.kbs.co.kr/board/v1/list?bbs_id=${conf.id}&page=1&page_size=1`);
          const data = await res.json();
          if (data.data) {
            for (const item of data.data) {
              // Extract text from HTML
              const $ = cheerio.load(item.post_contents || '');
              const textContent = $.text().trim();
              const imgUrl = $('img').attr('src');
              extracted.push({
                title: item.post_title,
                content: textContent || item.post_title,
                url: item.target_url || prog.url,
                thumb: imgUrl,
                date: item.date_created
              });
            }
          }
        }
        else if (conf.type === 'MBC_HTML') {
          try {
            // Extract program ID (bid) from config or URL
            let progId = conf.id;
            if (!progId) {
              const match = prog.url.match(/([0-9]{15,})/);
              if (!match) throw new Error("Cannot extract program ID from URL: " + prog.url);
              progId = match[1];
            }

            // Fetch list of latest PreVods (preview) or Vods via AJAX
            const listRes = await fetch("https://m.imbc.com/VOD/PartialPreVodList", {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              },
              body: `page=1&pageSize=3&programBroadcastID=${progId}&layout=List`
            });

            const listHtml = await listRes.text();
            const $list = cheerio.load(listHtml);

            const items = $list('.sec-vod a').toArray();
            let limit = Math.min(items.length, 1);

            for (let i = 0; i < limit; i++) {
              const el = $list(items[i]);
              const link = "https://m.imbc.com" + el.attr('href');
              const thumb = el.find('img').attr('src');

              let titleText = el.find('.txt-box').text().trim();
              const countText = el.find('.count').text().trim();
              const fullTitle = countText ? `${countText} ${titleText}` : titleText;

              let dateRaw = el.find('.date2').clone().children().remove().end().text().trim();
              const date = dateRaw ? dateRaw.replace(/\./g, '-') : new Date().toISOString();

              // Fetch details for full text
              const detailRes = await fetch(link, {
                headers: {
                  "User-Agent": "Mozilla/5.0"
                }
              });
              const arrayBuffer = await detailRes.arrayBuffer();
              const html = new TextDecoder('utf-8').decode(arrayBuffer);
              const $detail = cheerio.load(html);

              let desc = $detail('.view-text').text().trim();
              if (!desc) {
                desc = $detail('meta[property="og:description"]').attr('content') || titleText;
              }

              if (fullTitle) {
                extracted.push({
                  title: fullTitle,
                  content: desc,
                  url: link,
                  thumb: thumb,
                  date: date
                });
              }
            }

            if (extracted.length === 0) {
              results.push({ program: prog.title, newEpisode: 'Failed to extract items from list', rawUrl: prog.url });
              console.error('Extraction failed for', prog.title);
            }
          } catch (e: any) {
            console.error('MBC Scraping failed:', e);
            results.push({ program: prog.title, newEpisode: 'MBC Error: ' + e.message });
          }
        }

        // DB Save & Analyze
        for (const ep of extracted) {
          const exists = await prisma.episode.findFirst({ where: { title: ep.title, programId: prog.id } });
          if (!exists) {
            const analysisResult = analyzeWithKeywords(ep.title, ep.content, highKeywords, midKeywords);
            const saved = await prisma.episode.create({
              data: {
                programId: prog.id,
                title: ep.title,
                content: ep.content.substring(0, 1000), // Max 1000 chars
                originalUrl: ep.url,
                thumbnail: ep.thumb,
                broadcastDate: ep.date,
                category: analysisResult.category,
                riskLevel: analysisResult.riskLevel,
                summary: analysisResult.summary,
              }
            });
            results.push({ program: prog.title, newEpisode: saved.title });
          }
        }

      } catch (err: any) {
        console.error(`Error scraping ${prog.title}:`, err);
        await (prisma.program.update as any)({
          where: { id: prog.id },
          data: {
            lastScrapedAt: new Date(),
            lastScrapeStatus: 'ERROR',
            lastScrapeError: err.message || 'Unknown error'
          }
        });
        continue;
      }

      await (prisma.program.update as any)({
        where: { id: prog.id },
        data: {
          lastScrapedAt: new Date(),
          lastScrapeStatus: 'SUCCESS',
          lastScrapeError: null
        }
      });
    }

    return NextResponse.json({ success: true, processed: results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
