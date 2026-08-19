import Link from "next/link";

import NavBar from "@/components/NavBar";

const FEATURES = [
  {
    icon: "✨",
    title: "AI 꿈 해몽",
    description:
      "잠에서 깬 순간의 기억이 흐려지기 전에, 꿈을 적기만 하면 30초 만에 AI가 상징과 감정을 읽어 당신만의 해몽을 들려줍니다.",
  },
  {
    icon: "🌌",
    title: "꿈 기록소 · 나만의 일기장",
    description:
      "매일 밤의 꿈을 별자리처럼 쌓아가는 프라이빗한 아카이브. 시간이 흐를수록 나조차 몰랐던 무의식의 패턴이 드러납니다.",
  },
  {
    icon: "📖",
    title: "꿈해몽 사전",
    description: "뱀, 이빨, 물, 죽음… 수천 가지 상징의 전통적·심리학적 의미를 언제든 검색해 찾아볼 수 있습니다.",
  },
  {
    icon: "💬",
    title: "무의식 광장",
    description: "같은 밤, 다른 꿈을 꾼 사람들이 모이는 공간. 익명으로 안전하게 나누고, 서로의 무의식에 공감합니다.",
  },
];

export default function AboutPage() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      {/* 홈과 같은 오로라 톤이되, 정적인 블러만 남겨 랜딩 페이지다운 차분함을 준다. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-violet-700/20 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-fuchsia-700/15 blur-[120px]" />
      </div>

      <NavBar />

      <main className="mx-auto max-w-3xl px-6 py-24 sm:py-32">
        <p className="text-xs font-semibold tracking-[0.3em] text-indigo-300/70 uppercase">About Dream Hub</p>

        <h1 className="mt-6 font-serif text-4xl leading-tight text-white sm:text-5xl">
          당신의 밤은,
          <br />
          또 하나의 세계입니다
        </h1>

        <p className="mt-8 text-lg leading-relaxed text-slate-300">
          우리는 하루의 3분의 1을 잠으로 보내지만, 그 안에서 무슨 일이 일어났는지는 대부분 아침 햇살과 함께
          흩어져 버립니다. Dream Hub는 그 사라지기 쉬운 밤의 기억을 붙잡아, 상징과 감정을 읽어내고, 나만의
          무의식 지도를 그려가는 공간입니다.
        </p>

        <p className="mt-6 text-lg leading-relaxed text-slate-300">
          정신분석부터 현대 심리학까지, 꿈을 해석해 온 여러 시선을 AI가 대신 빌려와 당신의 언어로 풀어드립니다.
          기록이 쌓일수록 캘린더 위의 별자리는 짙어지고, 그 궤적 속에서 스스로도 몰랐던 감정의 흐름을
          발견하게 됩니다.
        </p>

        <div className="mt-16 h-px w-full bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

        <h2 className="mt-16 font-serif text-2xl text-white sm:text-3xl">무엇을 할 수 있나요</h2>

        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm"
            >
              <span className="text-2xl">{feature.icon}</span>
              <h3 className="mt-3 text-base font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 h-px w-full bg-gradient-to-r from-transparent via-indigo-400/30 to-transparent" />

        <h2 className="mt-16 font-serif text-2xl text-white sm:text-3xl">우리가 믿는 것</h2>
        <p className="mt-6 text-lg leading-relaxed text-slate-300">
          꿈은 지극히 사적인 이야기입니다. 그래서 모든 기록은 기본적으로 비공개이며, 공유 여부는 언제나 당신이
          직접 선택합니다. 익명으로 남기든, 무의식 광장에서 다른 탐험가들과 나누든 — 그 결정의 주도권은 항상
          기록을 남긴 사람에게 있습니다.
        </p>

        <div className="mt-20 flex flex-col items-center text-center">
          <p className="text-sm text-slate-400">지금, 지난밤 꿈을 떠올려 보세요</p>
          <Link
            href="/"
            className="mt-5 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-violet-600 to-indigo-500 px-10 py-4 text-base font-semibold text-white shadow-[0_0_40px_rgba(139,92,246,0.35)] transition-transform hover:-translate-y-0.5"
          >
            ✨ AI 해몽 시작하기
          </Link>
        </div>
      </main>
    </div>
  );
}
