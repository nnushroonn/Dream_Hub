import { isAxiosError } from "axios";

import api from "./axios";

export type AuraPreference = "good" | "lucid" | "calm";

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  is_verified?: boolean;
  aura_preference?: AuraPreference | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface MessageResponse {
  message: string;
}

export interface NicknameAvailability {
  available: boolean;
}

export async function registerUser(
  email: string,
  nickname: string,
  password: string,
  passwordConfirm: string
): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/register", {
    email,
    nickname,
    password,
    password_confirm: passwordConfirm,
  });
  return data;
}

// 회원가입 폼이 입력 중 실시간으로 호출하는 닉네임 중복 체크.
export async function checkNicknameAvailability(nickname: string): Promise<boolean> {
  const { data } = await api.get<NicknameAvailability>("/auth/check-nickname", { params: { nickname } });
  return data.available;
}

// 마이페이지에서 꿈 페르소나 닉네임을 바꿀 때 호출한다.
export async function updateNickname(nickname: string): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>("/api/user/profile", { nickname });
  return data;
}

// 마이페이지 아바타 오라 토글 - 유저가 직접 고르는 시각적 정체성.
export async function updateAuraPreference(auraPreference: AuraPreference): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>("/api/user/aura", { aura_preference: auraPreference });
  return data;
}

// 마이페이지 레벨 바 + 업적 뱃지 보드 - 전부 실제 활동 데이터에서 매 요청마다 다시 계산된 값
// (저장된 값이 아니라 항상 최신 상태).
export interface BadgeInfo {
  code: string;
  label: string;
  emoji: string;
  earned: boolean;
}

export interface UserStats {
  dream_count: number;
  public_dream_count: number;
  lucid_count: number;
  post_count: number;
  comment_count: number;
  empathy_received: number;
  level: number;
  level_title: string;
  // 레벨 게이지에 "2,450 / 3,000 XP"처럼 실제 수치를 보여주기 위한 값. next_level_threshold가
  // null이면 이미 최고 레벨(만렙)이라 게이지는 항상 꽉 찬 상태로 그린다.
  points: number;
  next_level_threshold: number | null;
  badges: BadgeInfo[];
}

export async function getUserStats(): Promise<UserStats> {
  const { data } = await api.get<UserStats>("/api/user/stats");
  return data;
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>("/auth/login", { email, password });
  return data;
}

export async function verifyEmail(token: string): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/verify-email", { token });
  return data;
}

/**
 * JWT의 payload는 서명 검증 없이도 base64 디코딩만으로 읽을 수 있다.
 * 여기서는 서버가 이미 서명한 access_token에서 화면 표시용 사용자 정보만 꺼내 쓰는 용도로,
 * 실제 인가(authorization)는 항상 백엔드가 서명을 검증해 처리한다.
 */
export function decodeAccessToken(token: string): { sub: string; email?: string; nickname?: string } | null {
  try {
    const payloadSegment = token.split(".")[1];
    const normalized = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    return null;
  }
}

/**
 * FastAPI가 던지는 에러는 두 가지 형태다:
 * - HTTPException: { detail: string }
 * - Pydantic 검증 실패(422): { detail: [{ msg: string, ... }, ...] }
 * 두 경우 모두 화면에 바로 렌더링할 수 있는 문자열로 정규화한다.
 */
export function getAuthErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const detail = error.response?.data?.detail;

    if (typeof detail === "string") {
      return detail;
    }

    if (Array.isArray(detail) && detail.length > 0) {
      return detail.map((item) => item.msg ?? String(item)).join(" ");
    }

    if (error.response?.status === 500) {
      return "서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.";
    }

    if (!error.response) {
      return "서버에 연결할 수 없습니다. 네트워크 상태를 확인해 주세요.";
    }
  }

  return "알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.";
}
