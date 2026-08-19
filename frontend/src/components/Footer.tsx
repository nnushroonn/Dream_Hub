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

        <nav className="flex items-center gap-5 text-sm text-gray-400">
          {FOOTER_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-gray-200">
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
