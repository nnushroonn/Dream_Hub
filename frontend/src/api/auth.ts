import { isAxiosError } from "axios";

import api from "./axios";

export interface AuthUser {
  id: number;
  email: string;
  is_verified?: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface MessageResponse {
  message: string;
}

export async function registerUser(
  email: string,
  password: string,
  passwordConfirm: string
): Promise<MessageResponse> {
  const { data } = await api.post<MessageResponse>("/auth/register", {
    email,
    password,
    password_confirm: passwordConfirm,
  });
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
export function decodeAccessToken(token: string): { sub: string; email?: string } | null {
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
