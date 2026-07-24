"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { API_BASE_URL } from "@/api/axios";
import { checkNicknameAvailability, getAuthErrorMessage, loginUser, registerUser } from "@/api/auth";
import { useAuthStore } from "@/store/useAuthStore";

type AuthMode = "login" | "register";
type NicknameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 20;
const NICKNAME_CHECK_DEBOUNCE_MS = 400;

// 🎲 랜덤 꿈 페르소나 닉네임 생성기 - 백엔드의 자동 배정(구글 로그인용) 생성기와 같은 컨셉의 조합.
const PERSONA_ADJECTIVES = ["보랏빛", "자각몽을 꾸는", "달빛 아래", "새벽녘의"];
const PERSONA_NOUNS = ["탐험가", "몽상가", "추적자", "나비"];

function randomPersonaNickname(): string {
  const adjective = PERSONA_ADJECTIVES[Math.floor(Math.random() * PERSONA_ADJECTIVES.length)];
  const noun = PERSONA_NOUNS[Math.floor(Math.random() * PERSONA_NOUNS.length)];
  return `${adjective} ${noun}`;
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.87c2.27-2.09 3.55-5.17 3.55-8.65z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.24 21.3 7.29 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.88 12c0-.79.14-1.56.39-2.28V6.63H1.27A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.27 5.37l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.2 15.23 0 12 0 7.29 0 3.24 2.7 1.27 6.63l4 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, login } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [nicknameStatus, setNicknameStatus] = useState<NicknameStatus>("idle");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 이미 로그인된 상태로 /login에 접근하면 홈으로 보낸다.
  useEffect(() => {
    if (isAuthenticated) {
      router.replace("/");
    }
  }, [isAuthenticated, router]);

  // 닉네임 실시간 유효성 검사: 길이 검증 후, 잠시 타이핑이 멈추면(디바운스) 서버에 중복 여부를 묻는다.
  useEffect(() => {
    if (mode !== "register") return;
    const trimmed = nickname.trim();
    if (!trimmed) {
      setNicknameStatus("idle");
      return;
    }
    if (trimmed.length < NICKNAME_MIN_LENGTH || trimmed.length > NICKNAME_MAX_LENGTH) {
      setNicknameStatus("invalid");
      return;
    }
    setNicknameStatus("checking");
    const timer = window.setTimeout(() => {
      checkNicknameAvailability(trimmed)
        .then((available) => setNicknameStatus(available ? "available" : "taken"))
        .catch(() => setNicknameStatus("idle"));
    }, NICKNAME_CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [nickname, mode]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setConfirmPassword("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (mode === "register") {
      if (password !== confirmPassword) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
      }
      if (nicknameStatus !== "available") {
        setError("사용할 수 있는 꿈 페르소나 닉네임을 입력해 주세요.");
        return;
      }
    }

    setIsSubmitting(true);

    try {
      if (mode === "login") {
        const auth = await loginUser(email, password);
        login(auth.user, auth.access_token);
        router.push("/");
      } else {
        const res = await registerUser(email, nickname.trim(), password, confirmPassword);
        setNotice(res.message);
      }
      setEmail("");
      setNickname("");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const nicknameHelperClass =
    nicknameStatus === "available"
      ? "text-emerald-400"
      : nicknameStatus === "taken" || nicknameStatus === "invalid"
        ? "text-rose-400"
        : "text-slate-500";

  const nicknameHelperText = (() => {
    const length = nickname.trim().length;
    switch (nicknameStatus) {
      case "checking":
        return "확인 중...";
      case "available":
        return "✓ 사용할 수 있는 닉네임이에요";
      case "taken":
        return "이미 사용 중인 닉네임이에요";
      case "invalid":
        return `닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자로 입력해 주세요 (${length}자)`;
      default:
        return "";
    }
  })();

  if (notice) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-950 px-4 text-slate-100">
        <div className="w-full max-w-sm rounded-3xl border border-violet-400/30 bg-white/10 p-8 text-center shadow-[0_0_60px_rgba(139,92,246,0.25)] backdrop-blur-2xl">
          <h1 className="text-lg font-semibold text-white">메일함을 확인해 주세요</h1>
          <p className="mt-2 text-sm text-slate-400">{notice}</p>
          <button
            type="button"
            onClick={() => switchMode("login")}
            className="mt-6 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
          >
            로그인 화면으로
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-sm rounded-3xl border border-violet-400/30 bg-white/10 p-8 shadow-[0_0_60px_rgba(139,92,246,0.25)] backdrop-blur-2xl">
        <h1 className="text-xl font-semibold text-white">🌌 Dream Hub</h1>
        <p className="mt-1 text-sm text-slate-400">꿈 일기 및 해몽 커뮤니티에 오신 것을 환영합니다.</p>

        <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`rounded-xl py-2 text-sm font-medium transition-all duration-200 ${
              mode === "login" ? "bg-violet-500/30 text-white shadow-[0_0_12px_rgba(167,139,250,0.3)]" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`rounded-xl py-2 text-sm font-medium transition-all duration-200 ${
              mode === "register" ? "bg-violet-500/30 text-white shadow-[0_0_12px_rgba(167,139,250,0.3)]" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            회원가입
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="text-xs text-indigo-300/70">
              이메일
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
            />
          </div>

          {mode === "register" && (
            <div>
              <label htmlFor="nickname" className="text-sm leading-relaxed text-violet-200">
                무의식의 세계를 탐험할 당신의 &lsquo;꿈 페르소나(닉네임)&rsquo;를 정해 주세요
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="nickname"
                  type="text"
                  required
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  placeholder="예: 보랏빛 나비"
                  maxLength={NICKNAME_MAX_LENGTH}
                  className="w-full min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-purple-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setNickname(randomPersonaNickname())}
                  aria-label="랜덤 닉네임 생성"
                  title="랜덤 닉네임 생성"
                  className="shrink-0 rounded-lg bg-purple-600/20 px-3 text-lg text-purple-300 transition-colors hover:bg-purple-600/40"
                >
                  🎲
                </button>
              </div>
              {nicknameHelperText && (
                <p className={`mt-1.5 text-xs transition-colors duration-200 ${nicknameHelperClass}`}>{nicknameHelperText}</p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="password" className="text-xs text-indigo-300/70">
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "register" ? "영문+숫자 포함 8자 이상" : "••••••••"}
              className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
            />
          </div>

          {mode === "register" && (
            <div>
              <label htmlFor="confirmPassword" className="text-xs text-indigo-300/70">
                비밀번호 확인
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="비밀번호를 한 번 더 입력해 주세요"
                className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
              />
            </div>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}
          </button>
        </form>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-slate-500">또는</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        <a
          href={`${API_BASE_URL}/auth/login/google`}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:border-violet-400/40 hover:bg-white/10"
        >
          <GoogleIcon />
          Google 계정으로 로그인
        </a>
      </div>
    </div>
  );
}
