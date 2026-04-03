import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
    try {
        const { videoId } = await req.json();

        if (!videoId) {
            return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
        }

        if (!process.env.YOUTUBE_API_KEY) {
            return NextResponse.json({ error: 'YOUTUBE_API_KEY is not set in environment variables.' }, { status: 500 });
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json({ error: 'GEMINI_API_KEY is not set in environment variables.' }, { status: 500 });
        }

        // 1. Fetch Video Info from DB to understand context better
        const video = await (prisma as any).creatorVideo.findUnique({ where: { videoId } });
        const videoContext = video ? `영상 제목: ${video.title}\n영상 설명: ${video.description}` : '';

        // 2. Fetch comments from YouTube Data API (Top 100 comments by relevance)
        const ytRes = await fetch(`https://www.googleapis.com/youtube/v3/commentThreads?part=snippet&videoId=${videoId}&maxResults=100&order=relevance&key=${process.env.YOUTUBE_API_KEY}`);
        const ytData = await ytRes.json();

        if (ytData.error) {
            return NextResponse.json({ error: ytData.error.message }, { status: 500 });
        }

        const comments = ytData.items?.map((item: any) => item.snippet.topLevelComment.snippet.textDisplay) || [];

        // 3. Sample comments
        const sampledComments = comments.slice(0, 50).join('\n---\n');

        // 4. Analyze with Gemini (Upgraded PR Expert Prompt)
        const prompt = `당신은 대한민국 최고 수준의 기업 PR(홍보실) 위기관리 전문가입니다.
다음은 IT/테크 유튜버 영상의 메타데이터(제목, 설명)와 이 영상에 가장 많은 공감을 받은 베스트 시청자 댓글 상위 50개입니다.

이 영상이 아래의 [당사 핵심 모니터링 키워드] 중 하나라도 관련된 리스크 이슈를 다루고 있는지 판별하세요.

[당사 핵심 모니터링 키워드]
- 통신사 동향: SKB, SK브로드밴드, KT, LG유플러스, 통신 3사 독과점 등
- 망 사용료 분쟁: 망이용대가, 트래픽 호발, 무임승차, 글로벌 CP사 파워게임, 넷플릭스/유튜브 망 무임승차
- 소비자 불만: 인터넷 속도 저하, 핑/끊김, 해상도 화질 저하 문제, 요금 인상 통보, 해지 방어 갑질
- 규제/정책: 망중립성 훼손, 방통위/과기부 제재, 소비자 역차별, 거대 플랫폼 규제

[영상 데이터]
${videoContext}

[댓글 여론 목록]
${sampledComments.length > 0 ? sampledComments : "댓글 없음"}

[지시사항]
1. 만약 위 핵심 키워드와 전혀 무관한 일상/기기 리뷰 영상 등 일반 영상이라면, 무조건 무시하지 말고 사용자가 AI 정상 작동을 인지할 수 있도록 아래 형식으로 아주 짧게 2줄 요약만 제공하세요. (riskLevel은 "하", isRelated는 false로 반환)
   - 📌 영상 내용: (영상의 대략적인 진짜 내용 1줄 요약)
   - 💬 확인된 민심: (가장 공감을 많이 받은 베스트 댓글의 주요 내용 1줄 요약)

2. 만약 관련 이슈를 다루고 있다면, 임원진에게 즉각 보고할 수 있는 [전문가용 경영진 리포트] 형식으로 아래 3가지 항목을 Markdown 기호(■, -, 1. 등)를 사용해 줄바꿈을 포함하여 엄격하게 작성하세요.
   - ■ 영상 내용 요약 (유튜버가 주장하는 핵심 의도)
   - ■ 시청자 민심 및 여론 (베스트 댓글들에서 나타나는 시청자들의 일치된 목소리나 분노 포인트)
   - ■ SKB 리스크 진단 (당사에 미칠 긍정적/부정적 타격, 무시 가능성, 또는 대응/개입 필요성 제언)

[결과 포맷 (반드시 아래 JSON 포맷을 준수)]
{
  "summary": "마크다운(Markdown) 양식의 상세 보고서 본문 (반드시 줄바꿈 기호 \\n 포함하여 작성)",
  "riskLevel": "상, 중, 하 중 택 1",
  "isRelated": true 또는 false
}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
            }
        });

        const resultText = response.text;
        if (!resultText) throw new Error("Empty AI response");

        const parsed = JSON.parse(resultText);

        // 5. Save analysis result to DB
        const updated = await (prisma as any).creatorVideo.update({
            where: { videoId },
            data: {
                aiAnalyzedAt: new Date(),
                aiSummary: parsed.summary,
                aiRiskLevel: parsed.riskLevel,
                isAiRecommended: parsed.isRelated ? true : false
            }
        });

        return NextResponse.json({ success: true, result: updated });

    } catch (error: any) {
        console.error('AI Analysis Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
