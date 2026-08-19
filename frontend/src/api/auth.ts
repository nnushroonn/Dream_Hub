import { isAxiosError } from "axios";

import api from "./axios";

export type AuraPreference = "good" | "lucid" | "calm";

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  is_verified?: boolean;
  aura_preference?: AuraPreference | null;
  // 커뮤니티 닉네임 호버 카드(무의식 은하 프로필) 공개 여부 - 기본은 비공개.
  is_galaxy_public?: boolean;
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

// 커뮤니티 닉네임 호버 카드 공개 토글 - 켜는 순간부터만 다른 유저가 씨앗 비율/뱃지 집계를 볼 수 있다.
export async function updateGalaxyVisibility(isGalaxyPublic: boolean): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>("/api/user/galaxy-visibility", { is_galaxy_public: isGalaxyPublic });
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
  // 9단계 우주 티어 시스템(lib/levels.ts) - level은 total_xp에서 파생되는 세밀한 진행도,
  // tier_index(1~9)/tier_title/tier_color는 level을 10개씩 묶은 굵은 단계다.
  level: number;
  tier_index: number;
  tier_title: string;
  tier_color: string;
  total_xp: number;
  xp_into_level: number;
  xp_for_next_level: number;
  badges: BadgeInfo[];
  // Daily XP Cap - 게시글/댓글 "작성"으로 번 XP만 하루 합산 상한이 있다(도배 방지). 좋아요/댓글을
  // "받는" XP는 상한이 없어 여기 집계되지 않는다.
  daily_xp_cap: number;
  daily_capped_xp_earned: number;
  daily_cap_reached: boolean;
  diary_streak: number;
}

export async function getUserStats(): Promise<UserStats> {
  const { data } = await api.get<UserStats>("/api/user/stats");
  return data;
}

// 로그인 성공 시 서버가 httpOnly 쿠키(access_token)를 Set-Cookie로 내려준다 - 토큰 자체는
// 응답 바디에 실리지 않는다(JS가 읽을 이유도, 읽을 수단도 없다). 바디에는 화면 표시용
// 사용자 정보만 담겨 온다.
export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>("/auth/login", { email, password });
  return data;
}

// 서버에 Set-Cookie(만료된 값)를 요청해 httpOnly 쿠키를 실제로 지운다 - JS는 httpOnly
// 쿠키를 직접 삭제할 수 없으므로, "로그아웃"은 이제 반드시 이 API 호출을 거쳐야 한다.
export async function logoutUser(): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/logout");
  return data;
}

// 로그인 상태를 확인하는 유일한 방법 - httpOnly 쿠키는 JS로 직접 읽을 수 없어서, "지금
// 로그인돼 있는지"는 항상 이 엔드포인트에 물어봐야 한다(앱 로드/새로고침마다 호출됨,
// components/AuthHydrator.tsx 참고). 인증 안 된 상태면 401이 떨어진다 - 호출부가 캐치해서
// "비로그인"으로 처리한다.
export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>("/auth/me");
  return data;
}

export async function verifyEmail(token: string): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/verify-email", { token });
  return data;
}

// 가입 여부와 무관하게 항상 같은 메시지를 돌려준다(백엔드 auth.py의 의도적 설계) - 화면은
// 이 응답을 그대로 보여주기만 하면 된다.
export async function forgotPassword(email: string): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/forgot-password", { email });
  return data;
}

export async function resetPassword(
  token: string,
  newPassword: string,
  newPasswordConfirm: string
): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/reset-password", {
    token,
    new_password: newPassword,
    new_password_confirm: newPasswordConfirm,
  });
  return data;
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
