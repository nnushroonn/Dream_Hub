import { api } from "@/api/axios";
import type { MagazineArticleDetail, MagazineListResponse } from "@/api/magazine";

// 관리자 전용 API - 전부 백엔드 get_current_admin_user(is_admin)가 다시 검증한다. 이 파일의
// 함수들은 오직 /admin 화면에서만 호출된다.

export interface MessageResponse {
  message: string;
}

// --- 📊 통계 대시보드 ---------------------------------------------------------

export interface DailySignupCount {
  date: string;
  count: number;
}

export interface AdminStats {
  total_users: number;
  total_community_posts: number;
  total_public_dreams: number;
  total_comments: number;
  total_ai_interpretations: number;
  pending_reports: number;
  signups_last_7_days: DailySignupCount[];
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get<AdminStats>("/api/admin/stats");
  return data;
}

// --- 🚨 신고 큐 ---------------------------------------------------------------

export type ReportTargetType = "POST" | "DREAM";
export type ReportStatusFilter = "PENDING" | "RESOLVED" | "DISMISSED" | "ALL";

export interface ReportItem {
  id: number;
  target_type: ReportTargetType;
  target_id: number;
  reporter_nickname: string | null;
  reason: string | null;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  created_at: string;
  target_title: string | null;
  target_preview: string | null;
  target_deleted: boolean;
}

export interface ReportListResponse {
  items: ReportItem[];
  total_count: number;
  total_pages: number;
  page: number;
}

export async function getAdminReports(status: ReportStatusFilter = "PENDING", page = 1): Promise<ReportListResponse> {
  const { data } = await api.get<ReportListResponse>("/api/admin/reports", { params: { status, page } });
  return data;
}

export async function resolveReport(reportId: number, action: "dismiss" | "delete_content"): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>(`/api/admin/reports/${reportId}/resolve`, { action });
  return data;
}

// --- 👤 유저 관리 --------------------------------------------------------------

export interface AdminUserItem {
  id: number;
  email: string;
  nickname: string;
  is_verified: boolean;
  is_admin: boolean;
  is_suspended: boolean;
  created_at: string;
}

export interface AdminUserListResponse {
  items: AdminUserItem[];
  total_count: number;
  total_pages: number;
  page: number;
}

export async function getAdminUsers(search: string, page = 1): Promise<AdminUserListResponse> {
  const { data } = await api.get<AdminUserListResponse>("/api/admin/users", { params: { search: search || undefined, page } });
  return data;
}

export async function toggleSuspendUser(userId: number): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>(`/api/admin/users/${userId}/suspend`);
  return data;
}

export async function forceChangeNickname(userId: number, nickname: string): Promise<MessageResponse> {
  const { data } = await api.patch<MessageResponse>(`/api/admin/users/${userId}/nickname`, { nickname });
  return data;
}

export async function deleteAdminUser(userId: number): Promise<MessageResponse> {
  const { data } = await api.delete<MessageResponse>(`/api/admin/users/${userId}`);
  return data;
}

// --- 📰 매거진 관리 ------------------------------------------------------------
// 목록/상세 응답 모양은 공개 매거진 API와 완전히 같다 - 타입을 새로 정의하지 않고 그대로 가져다 쓴다.

export interface MagazineWriteInput {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
}

export async function getAdminMagazineList(page = 1): Promise<MagazineListResponse> {
  const { data } = await api.get<MagazineListResponse>("/api/admin/magazine", { params: { page, limit: 50 } });
  return data;
}

export async function getAdminMagazineArticle(id: number): Promise<MagazineArticleDetail> {
  const { data } = await api.get<MagazineArticleDetail>(`/api/admin/magazine/${id}`);
  return data;
}

export async function createMagazineArticle(payload: MagazineWriteInput): Promise<MagazineArticleDetail> {
  const { data } = await api.post<MagazineArticleDetail>("/api/admin/magazine", payload);
  return data;
}

export async function updateMagazineArticle(id: number, payload: MagazineWriteInput): Promise<MagazineArticleDetail> {
  const { data } = await api.patch<MagazineArticleDetail>(`/api/admin/magazine/${id}`, payload);
  return data;
}

export async function deleteMagazineArticle(id: number): Promise<MessageResponse> {
  const { data } = await api.delete<MessageResponse>(`/api/admin/magazine/${id}`);
  return data;
}
