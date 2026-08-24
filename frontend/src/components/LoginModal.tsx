"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { API_BASE_URL } from "@/api/axios";
import { checkNicknameAvailability, forgotPassword, getAuthErrorMessage, loginUser, registerUser } from "@/api/auth";
import { setPendingRedirect } from "@/lib/pendingRedirect";
import { randomPersonaNickname } from "@/lib/personaNickname";
import { useAuthStore } from "@/store/useAuthStore";
import { useLoginModalStore, type LoginModalTriggerSource } from "@/store/useLoginModalStore";

// "forgot"은 탭이 아니라 로그인 폼 안의 링크로만 진입한다 - 아래 결과 화면은 회원가입
// 성공 화면(notice)과 같은 셸을 재사용한다(둘 다 "메일함을 확인해 주세요" 패턴이라
// 화면을 새로 만들 이유가 없다).
type AuthMode = "login" | "register" | "forgot";
type NicknameStatus = "idle" | "checking" | "available" | "taken" | "invalid";

const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 20;
const NICKNAME_CHECK_DEBOUNCE_MS = 400;

// 진입점(어떤 잠긴 기능을 누르다 모달을 열었는지)에 따라 헤더 카피를 다르게 보여줘서,
// "왜 가입해야 하는지"를 그 자리의 맥락에 맞게 설득한다.
const TRIGGER_COPY: Record<LoginModalTriggerSource, { title: string; subtitle: string }> = {
  diary: {
    title: "나만의 꿈 일기장을 펼쳐볼까요?",
    subtitle: "가입하고 잊고 싶지 않은 꿈을 안전하게 보관하세요.",
  },
  calendar: {
    title: "꿈 별자리 캘린더를 열어볼까요?",
    subtitle: "가입하고 나의 무의식이 그려온 패턴을 한눈에 확인하세요.",
  },
  result: {
    title: "심층 분석 결과가 준비됐어요",
    subtitle: "가입하고 3초 만에 전체 해몽 결과를 확인하세요.",
  },
  community: {
    title: "다른 사람들은 지난밤 어떤 무의식을 만났을까요?",
    subtitle: "다른 탐험가의 꿈 이야기를 확인하고 대화에 참여하려면 로그인이 필요해요 ✨",
  },
  mypage: {
    title: "나의 무의식 기록, 한눈에 확인해보세요",
    subtitle: "로그인하면 지금까지 기록한 꿈을 바탕으로 나만의 통계와 레벨을 확인할 수 있어요.",
  },
  journal: {
    title: "나만의 꿈 일기, 기록하고 모아보세요",
    subtitle: "로그인하면 매일 꾼 꿈을 나만 볼 수 있는 공간에 저장하고, 날짜별로 다시 찾아볼 수 있어요.",
  },
  save: {
    title: "이 소중한 꿈, 안전하게 저장할까요?",
    subtitle: "소중한 꿈 해몽 결과를 잃지 않도록, 로그인하고 안전하게 저장하세요.",
  },
  garden: {
    title: "당신만의 정원을 가꿔보세요",
    subtitle: "로그인하면 밤마다 심은 씨앗이 피워낸 식물들을 모아보고, 다른 이의 정원에도 방문할 수 있어요.",
  },
  ai_limit: {
    title: "오늘의 무료 AI 해몽을 다 썼어요",
    subtitle: "로그인하면 하루 3회까지 이용할 수 있어요. 지금 가입하고 이어서 확인해보세요.",
  },
};
const DEFAULT_TRIGGER_COPY = { title: "🌌 Dream Hub", subtitle: "로그인하고 이어서 진행해 주세요." };

const BENEFIT_ITEMS = [
  { icon: "🔒", label: "나만의 프라이빗 일기장" },
  { icon: "✨", label: "7단계 심층 AI 해몽" },
  { icon: "🌌", label: "꿈 별자리 캘린더" },
];

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

// 로그인이 필요한 액션(저장/가져오기/7단계 전환 등)을 어디서든 가로막지 않고, 그 자리에서
// 바로 뜨는 글래스모피즘 로그인 모달 - /login 페이지의 폼을 그대로 재사용하되, 이메일/비밀번호
// 로그인은 페이지 이동 없이 onSuccess 콜백으로 원래 하려던 동작을 즉시 이어간다.
export default function LoginModal() {
  const { isOpen, onSuccess, redirectPath, triggerSource, close } = useLoginModalStore();
  const login = useAuthStore((state) => state.login);
  const headerCopy = triggerSource ? TRIGGER_COPY[triggerSource] : DEFAULT_TRIGGER_COPY;

  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  // 어떤 값에 대한 원격 확인이 끝났는지(value)와 그 결과만 상태로 들고, "idle"/"invalid"/
  // "checking"은 전부 nickname/mode/이 결과에서 바로 계산되는 파생 값이라(아래 nicknameStatus
  // 참고) 별도 state로 두지 않는다 - "checking"을 effect 안에서 직접 setState할 필요가 없어진다.
  const [nicknameRemoteCheck, setNicknameRemoteCheck] = useState<{
    value: string;
    result: "idle" | "available" | "taken";
  } | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // 뜨는 순간 opacity-0/translate-y-4에서 시작해 다음 프레임에 최종 상태로 전환되도록 트리거하는
  // 플래그 - isOpen과 같은 렌더에서 최종 클래스를 바로 주면 트랜지션 없이 즉시 나타나 버린다.
  const [entered, setEntered] = useState(false);

  // 모달을 새로 열 때마다 이전 세션의 입력값/에러가 남아있지 않게 초기화한다 - 렌더 중 ref
  // 접근/수정은 이 프로젝트의 react-hooks/refs 규칙이 막아서(React 문서의 "렌더 중 조정"
  // 패턴을 못 쓴다), isOpen 변경에 반응하는 effect로 처리한다. 진입 트랜지션도 브라우저
  // 페인트 타이밍(requestAnimationFrame)에 맞춰야 해서 어차피 effect가 필요해, 같이 묶는다.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- isOpen(외부 이벤트) 변경에 반응, ref 사용이 금지돼 effect로 처리
    setMode("login");
    setEmail("");
    setNickname("");
    setNicknameRemoteCheck(null);
    setPassword("");
    setConfirmPassword("");
    setError(null);
    setNotice(null);
    setEntered(false);
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, close]);

  const trimmedNickname = nickname.trim();
  const nicknameNeedsRemoteCheck =
    mode === "register" &&
    trimmedNickname !== "" &&
    trimmedNickname.length >= NICKNAME_MIN_LENGTH &&
    trimmedNickname.length <= NICKNAME_MAX_LENGTH;

  // 닉네임 실시간 유효성 검사: 길이 검증은 렌더 중 바로 판정하고(파생 상태), 실제로 서버에
  // 물어야 하는 경우엔 "지금 입력값에 대한 결과가 이미 와 있는가"로 checking 여부까지 파생시킨다.
  const nicknameStatus: NicknameStatus =
    mode !== "register" || trimmedNickname === ""
      ? "idle"
      : trimmedNickname.length < NICKNAME_MIN_LENGTH || trimmedNickname.length > NICKNAME_MAX_LENGTH
        ? "invalid"
        : nicknameRemoteCheck?.value === trimmedNickname
          ? nicknameRemoteCheck.result
          : "checking";

  useEffect(() => {
    if (!nicknameNeedsRemoteCheck) return;
    const timer = window.setTimeout(() => {
      checkNicknameAvailability(trimmedNickname)
        .then((available) => setNicknameRemoteCheck({ value: trimmedNickname, result: available ? "available" : "taken" }))
        .catch(() => setNicknameRemoteCheck({ value: trimmedNickname, result: "idle" }));
    }, NICKNAME_CHECK_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [nicknameNeedsRemoteCheck, trimmedNickname]);

  if (!isOpen) return null;

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
        const user = await loginUser(email, password);
        login(user);
        // 페이지 이동이 없으므로 원래 하려던 동작을 이 자리에서 곧장 이어간다.
        const resume = onSuccess;
        close();
        resume?.();
      } else if (mode === "forgot") {
        const res = await forgotPassword(email);
        setNotice(res.message);
      } else {
        const res = await registerUser(email, nickname.trim(), password, confirmPassword);
        setNotice(res.message);
      }
    } catch (err) {
      setError(getAuthErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleClick = () => {
    // 구글 OAuth는 전체 페이지 리다이렉트를 거치며 이 모달과 onSuccess 콜백이 함께 사라지므로,
    // 돌아왔을 때 이어갈 목적지를 localStorage에 남겨둔다. <a> 태그 기본 이동은 막지 않는다.
    if (redirectPath) setPendingRedirect(redirectPath);
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

  // NavBar가 sticky + z-index로 자체 스태킹 컨텍스트를 만들기 때문에, 그 안에서 fixed로
  // 띄우면 다른 z-index 요소에 가리거나 잘릴 수 있다 - document.body에 직접 포탈로 꽂아
  // 부모의 스태킹 컨텍스트/overflow 제약을 완전히 벗어난다.
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#050509]/70 backdrop-blur-md" onClick={close} />

      <div
        className={`relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-purple-500/30 bg-slate-900 p-8 shadow-[0_0_40px_rgba(168,85,247,0.15)] transition-all duration-300 ease-out ${
          entered ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
        }`}
      >
        <button
          type="button"
          onClick={close}
          aria-label="닫기"
          className="absolute right-5 top-5 text-slate-400 transition-colors hover:text-white"
        >
          ✕
        </button>

        {notice ? (
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white">메일함을 확인해 주세요</h1>
            <p className="mt-2 text-sm text-slate-400">{notice}</p>
            <button
              type="button"
              onClick={() => switchMode("login")}
              className="mt-6 w-full rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5"
            >
              로그인 화면으로
            </button>
            <button
              type="button"
              onClick={close}
              className="mt-4 w-full cursor-pointer text-center text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-200"
            >
              이전 화면으로 돌아가기
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-white">{headerCopy.title}</h1>
            <p className="mt-1 text-sm text-slate-400">{headerCopy.subtitle}</p>

            <ul className="mb-6 mt-5 flex flex-col gap-2 text-sm text-slate-300">
              {BENEFIT_ITEMS.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </li>
              ))}
            </ul>

            {mode === "forgot" ? (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-medium text-white">비밀번호를 잊으셨나요?</p>
                <p className="mt-1 text-xs text-slate-400">가입하신 이메일을 입력하시면 비밀번호 재설정 링크를 보내드려요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-1.5">
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
            )}

            <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="login-modal-email" className="text-xs text-indigo-300/70">
                  이메일
                </label>
                <input
                  id="login-modal-email"
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
                  <label htmlFor="login-modal-nickname" className="text-sm leading-relaxed text-violet-200">
                    무의식의 세계를 탐험할 당신의 &lsquo;꿈 페르소나(닉네임)&rsquo;를 정해 주세요
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="login-modal-nickname"
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

              {mode !== "forgot" && (
                <div>
                  <label htmlFor="login-modal-password" className="text-xs text-indigo-300/70">
                    비밀번호
                  </label>
                  <input
                    id="login-modal-password"
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={mode === "register" ? "영문+숫자 포함 8자 이상" : "••••••••"}
                    className="mt-1.5 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none"
                  />
                  {mode === "login" && (
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="mt-1.5 text-xs text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-200"
                    >
                      비밀번호를 잊으셨나요?
                    </button>
                  )}
                </div>
              )}

              {mode === "register" && (
                <div>
                  <label htmlFor="login-modal-confirm-password" className="text-xs text-indigo-300/70">
                    비밀번호 확인
                  </label>
                  <input
                    id="login-modal-confirm-password"
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
                {isSubmitting ? "처리 중..." : mode === "login" ? "로그인" : mode === "forgot" ? "재설정 메일 보내기" : "회원가입"}
              </button>
            </form>

            {mode === "forgot" ? (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="mt-6 w-full cursor-pointer text-center text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-200"
              >
                로그인 화면으로 돌아가기
              </button>
            ) : (
              <>
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-xs text-slate-500">또는</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <a
                  href={`${API_BASE_URL}/auth/login/google`}
                  onClick={handleGoogleClick}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
                >
                  <GoogleIcon />
                  Google 계정으로 시작하기
                </a>

                <button
                  type="button"
                  onClick={close}
                  className="mt-6 w-full cursor-pointer text-center text-sm text-slate-400 underline underline-offset-4 transition-colors hover:text-slate-200"
                >
                  이전 화면으로 돌아가기
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
