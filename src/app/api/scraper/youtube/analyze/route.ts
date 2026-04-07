import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GoogleGenAI } from '@google/genai';
import { YoutubeTranscript } from 'youtube-transcript';

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

        // 3.5. Fetch Transcript (자막 전문 수집 - 팩트 정확도 향상용)
        let transcriptText = "";
        try {
            const transcriptRes = await YoutubeTranscript.fetchTranscript(videoId);
            transcriptText = transcriptRes.map((t: any) => t.text).join(' ');
        } catch (e) {
            console.warn("Transcript extraction failed for video: ", videoId);
        }

        const transcriptContext = transcriptText
            ? `[유튜버 실제 발언 자막 전문]\n${transcriptText.substring(0, 8000)}\n\n`
            : `[자막 추출 불가 - 메타데이터와 댓글만으로 분석 진행]\n\n`;

        // 4. Analyze with Gemini (Upgraded PR Expert Prompt)
        const prompt = `당신은 대한민국 최고 수준의 기업 PR(홍보실) 위기관리 전문가입니다.
다음은 IT/테크 유튜버 영상의 메타데이터(제목/설명), 실제 영상의 발언 자막(Transcript), 그리고 영상에 가장 많은 공감을 받은 베스트 시청자 댓글 상위 50개입니다.

이 영상이 아래의 [당사 핵심 모니터링 키워드] 중 하나라도 관련된 리스크 이슈를 다루고 있는지 판별하세요.

[당사 핵심 모니터링 키워드]
- 통신사 동향: SKB, SK브로드밴드, KT, LG유플러스, 통신 3사 독과점 등
- 망 사용료 분쟁: 망이용대가, 트래픽 호발, 무임승차, 글로벌 CP사 파워게임, 넷플릭스/유튜브 망 무임승차
- 소비자 불만: 인터넷 속도 저하, 핑/끊김, 해상도 화질 저하 문제, 요금 인상 통보, 해지 방어 갑질
- 규제/정책: 망중립성 훼손, 방통위/과기부 제재, 소비자 역차별, 거대 플랫폼 규제

[영상 메타데이터]
${videoContext}

${transcriptContext}
[댓글 여론 목록]
${sampledComments.length > 0 ? sampledComments : "댓글 없음"}

[지시사항]
1. 팩트 기반 추론(Reasoning): 영상과 댓글에 명시된 사실만을 바탕으로 논리적으로 분석하세요. 없는 사실을 지어내거나(Fabrication), 억지스러운 인과관계를 만들어내지 마세요.
2. 출력 양식 엄수: 대상 영상이 당사와 관련이 깊든, 전혀 무관한 단순 유머/기기 리뷰든 상관없이 **무조건 아래 3가지 카테고리(■) 양식을 예외 없이 고정하여 작성하세요.**
   - ■ 영상 내용 및 핵심 여론 (주요 사실관계 및 댓글 민심 요약)
   - ■ 당사 연관성 (관련이 있다면 팩트 기반 영향력 설명 / 관련이 전혀 없다면 "해당 사항 없음" 또는 "무관함" 등으로 매우 짧게 명시)
   - ■ SKB 진단 및 제언 (구체적 대응 방향 / 관련이 없다면 "대응 불필요" 로 짧게 명시)
3. 무관한 영상 내용 시 리스크 레벨: 당사와 전혀 관계가 없는 내용으로 판명될 경우, riskLevel은 무조건 "하", isRelated는 false로 반환하고, 위 양식의 2, 3번 항목은 1줄 이내로 극히 짧게 끊어내세요.

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
