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
1. 만약 위 핵심 키워드와 상관없는 일반글(유머, 게임 등)이라면, 짧게 2줄 요약만 제공하세요. (riskLevel은 "하", isRelated는 false)
   - 📌 게시글 내용: (진짜 내용 1줄 요약)
   - 💬 확인된 반응: (게시글 성격 요약)

2. 만약 관련 이슈를 다루고 있다면, 임원진에게 보고할 수 있는 [경영진 리포트] 형식으로 엄격하게 작성하세요.
   - ■ 게시글 주장 요약
   - ■ 민심 및 여론 파급력
   - ■ SKB 리스크 진단 및 대응 필요성

[결과 포맷 (엄격히 JSON 형태 준수)]
{
  "summary": "마크다운 양식의 본문 (\\n 줄바꿈 포함)",
  "riskLevel": "상, 중, 하 중 택 1",
  "isRelated": true 또는 false
}`;

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
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
