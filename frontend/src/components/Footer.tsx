import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/about", label: "드림허브 소개" },
  { href: "/magazine", label: "매거진" },
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
  { href: "/contact", label: "문의하기" },
];

// 모든 페이지 최하단에 렌더링되는 전역 푸터 - 상단 GNB에 있던 '드림허브 소개' 진입점이
// 여기로 옮겨왔다. 루트 레이아웃(layout.tsx)에서 한 번만 렌더링해 모든 페이지가 공유한다.
export default function Footer() {
  return (
    <footer className="border-t border-white/5 bg-slate-950/60 py-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <p className="text-sm text-gray-500">
          <span className="text-gray-400">🌙 Dream Hub</span> · © 2026 Dream Hub.
        </p>

        {/* word-break: keep-all(전역)이 어절 중간 줄바꿈은 막아주지만, 그 대신 한 줄에 억지로
            욱여넣으면 뷰포트 밖으로 넘칠 수 있다 - flex-wrap으로 안 맞으면 항목째로(단어를
            끊지 않고) 다음 줄로 넘어가게 한다. */}
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-gray-400">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="-mx-2 -my-3.5 px-2 py-3.5 transition-colors hover:text-gray-200"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
