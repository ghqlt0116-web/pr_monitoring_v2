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
1. 단순 기기 리뷰나 타사 게임 규제 등 겉보기에 당사 핵심 키워드와 무관해 보이는 영상이라도, 절대 짧게 넘기지 마세요.
2. PR 위기관리 전문가로서, 해당 영상의 이슈(예: 게임물관리위원회 검열, 해외 플랫폼 정책 등)가 향후 '망 사용료', '통신사 규제', '망 중립성', '트래픽 증가' 등 당사 비즈니스에 불똥이 튈 수 있는 **[나비효과 시나리오]**를 한 가지 이상 무조건 도출해서 보고해야 합니다.
3. 임원진에게 즉각 보고할 수 있는 [전문가용 경영진 리포트] 형식으로 아래 3가지 항목을 Markdown 기호(■, -, 1. 등)를 사용해 줄바꿈을 포함하여 엄격하게 작성하세요.
   - ■ 영상 내용 및 핵심 여론 (유튜버의 주장과 베스트 댓글들의 일치된 분노/공감 포인트 요약)
   - ■ 당사 연관성 및 나비효과 (이 현상이 통신사/플랫폼 업계나 SKB의 정책, 규제, 이미지에 미칠 수 있는 잠재적 영향)
   - ■ SKB 리스크 진단 및 제언 (당사에 미칠 긍정적/부정적 타격 점검 및 위기관리팀 차원의 선제적 대응 방향 제언)

[결과 포맷 (반드시 아래 JSON 포맷을 준수)]
{
  "summary": "마크다운(Markdown) 양식의 상세 보고서 본문 (반드시 줄바꿈 기호 \\n 포함하여 작성)",
  "riskLevel": "상, 중, 하 중 택 1",
  "isRelated": true 또는 false (간접적 영향이라도 있으면 true)
}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                temperature: 0.2, // 일관성 있는 리포트 출력을 위해 낮춤
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
                aiRiskLevel: parsed.riskLevel
            }
        });

        return NextResponse.json({ success: true, result: updated });

    } catch (error: any) {
        console.error('AI Analysis Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
