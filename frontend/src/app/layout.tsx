import type { Metadata } from "next";
import { Geist, Geist_Mono, Nanum_Myeongjo } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 나만의 일기장(/journal) 본문에 쓰는 감성 명조체 - font-serif 유틸리티가 이 변수를 참조한다.
// 이 Next.js 버전이 번들한 구글 폰트 타입은 subsets을 latin으로만 제한한다 - 한글 글리프가
// 없는 문자는 브라우저가 자동으로 OS 명조 계열 폴백 폰트(예: 바탕)를 골라 렌더링한다.
const nanumMyeongjo = Nanum_Myeongjo({
  variable: "--font-nanum-myeongjo",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dream Hub",
  description: "꿈 일기 및 해몽 커뮤니티 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} ${nanumMyeongjo.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
