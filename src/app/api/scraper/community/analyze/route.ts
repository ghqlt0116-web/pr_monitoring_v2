import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
    try {
        const { id } = await req.json();

        if (!id) return NextResponse.json({ error: 'Post ID is required' }, { status: 400 });
        if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'GEMINI_API_KEY is not set' }, { status: 500 });

        const post = await (prisma as any).communityPost.findUnique({ where: { id } });
        if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

        const videoContext = `게시글 제목: ${post.title}\n게시글 본문(요약): ${post.content}`;

        const prompt = `당신은 대한민국 최고 수준의 기업 PR(홍보실) 위기관리 전문가입니다.
다음은 익명 커뮤니티(디시, 블라인드 등) 또는 블로그에 올라온 게시글입니다.

이 게시글이 아래의 [당사 핵심 모니터링 키워드] 중 하나라도 관련된 리스크 이슈를 다루고 있는지 판별하세요.

[당사 핵심 모니터링 키워드]
- 통신사 동향: SKB, SK브로드밴드, KT, LG유플러스, 독과점
- 망 사용료 분쟁: 망이용대가, 무임승차, 글로벌 CP사 파워게임
- 소비자 불만: 속도 저하, 인터넷 끊김, 요금 인상
- 규제/정책: 방통위 제재, 망중립성

[게시글 데이터]
${videoContext}

[지시사항]
1. 팩트 기반 추론(Reasoning): 게시글에 명시된 사실만을 바탕으로 논리적으로 분석하세요. 없는 사실을 지어내거나(Fabrication), 억지스러운 인과관계를 만들어내지 마세요.
2. 출력 양식 엄수: 해당 커뮤니티 글이 통신사/플랫폼 이슈와 관련이 있든, 전혀 무관한 단순 유머/게임 글(관련성 극히 낮음)이든 상관없이 **무조건 아래 3가지 카테고리(■) 양식을 예외 없이 고정하여 작성하세요.**
   - ■ 게시글 주요 사실관계 요약 (실제 내용 및 원문 분위기 요약)
   - ■ 당사 연관성 (관련이 있다면 팩트 기반 영향력 설명 / 관련이 없다면 "해당 사항 없음" 또는 "무관함" 등으로 매우 짧게 명시)
   - ■ SKB 진단 및 제언 (구체적 대응 방향 / 관련이 없다면 "대응 불필요" 로 짧게 명시)
3. 무관한 일반글 내용 시 리스크 레벨: 당사와 무관한 단순 잡담 등으로 판별될 경우, riskLevel은 무조건 "하", isRelated는 false로 반환하고, 위 양식 중 2, 3번 항목은 1줄 이내로 극히 짧게 끊어내세요.

[결과 포맷 (엄격히 JSON 형태 준수)]
{
  "summary": "마크다운 양식의 본문 (\\n 줄바꿈 포함)",
  "riskLevel": "상, 중, 하 중 택 1",
  "isRelated": true 또는 false
}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                temperature: 0.2
            }
        });

        const resultText = response.text;
        if (!resultText) throw new Error("Empty AI response");

        const parsed = JSON.parse(resultText);

        const updated = await (prisma as any).communityPost.update({
            where: { id },
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
