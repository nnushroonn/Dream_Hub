import { api } from "@/api/axios";

// 드림허브 매거진 - Dream Hub 에디터가 직접 쓴 꿈 심리학/상징 해설 롱폼 콘텐츠.
// 익명 커뮤니티 UGC와는 출처가 다른 1st-party 아티클이라 별도 API로 분리했다.
export interface MagazineArticleSummary {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  view_count: number;
  created_at: string;
}

export interface MagazineArticleDetail extends MagazineArticleSummary {
  content: string;
}

export interface MagazineListResponse {
  items: MagazineArticleSummary[];
  total_count: number;
  total_pages: number;
  page: number;
}

export interface MagazineListParams {
  page?: number;
  limit?: number;
}

export async function getMagazineArticles(params: MagazineListParams = {}): Promise<MagazineListResponse> {
  const { page = 1, limit = 12 } = params;
  const { data } = await api.get<MagazineListResponse>("/api/magazine", { params: { page, limit } });
  return data;
}

export async function getMagazineArticle(slug: string): Promise<MagazineArticleDetail> {
  const { data } = await api.get<MagazineArticleDetail>(`/api/magazine/${encodeURIComponent(slug)}`);
  return data;
}
