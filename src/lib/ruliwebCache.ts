// 루리웹 최근 파싱 데이터 캐시 모듈 (대시보드 미리보기 및 연동 상태 확인용)

export interface RuliwebPost {
    id: string;
    title: string;
    url: string;
}

let cachedPosts: RuliwebPost[] = [];
let lastIngestedAt: string | null = null;

export function setLatestRuliwebPosts(posts: RuliwebPost[]) {
    cachedPosts = posts;
    lastIngestedAt = new Date().toISOString();
}

export function getLatestRuliwebPosts(): { posts: RuliwebPost[]; lastIngestedAt: string | null } {
    return {
        posts: cachedPosts,
        lastIngestedAt
    };
}
