import { NextResponse } from 'next/server';

// [더미 파일] 
// 이 파일은 깃허브 웹 업로드 시 과거에 존재했던 잔재 파일(communityPost 에러 유발)을 
// 정상적인 빈 파일로 덮어쓰기(Overwrite) 하여 Vercel 빌드 에러를 방지하기 위한 안전장치입니다.

export async function GET() {
    return NextResponse.json({ success: true, posts: [] });
}

export async function POST() {
    return NextResponse.json({ success: true, posts: [] });
}
