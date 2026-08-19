import type { Metadata } from "next";
import { Geist, Geist_Mono, Nanum_Myeongjo } from "next/font/google";
import Script from "next/script";
import "./globals.css";

import AdsenseScript from "@/components/AdsenseScript";
import AuthHydrator from "@/components/AuthHydrator";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import Footer from "@/components/Footer";

// 구글 애드센스 승인 코드 - 발급받으면 NEXT_PUBLIC_ADSENSE_CLIENT_ID(.env)에 "ca-pub-XXXXXXXXXXXXXXXX"
// 형태로 채워 넣기만 하면 AdsenseScript가 자동으로 로드된다. 쿠키 배너 응답과 무관하게 항상
// 로드하되(값이 비어 있을 때만 아예 렌더링하지 않는다), "거부"/미응답 유저에게는 비맞춤형
// 광고만 요청하도록 아래 NPA 인라인 스크립트 + AdsenseScript 내부의 재동기화로 가른다.
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

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
      <body className="min-h-full flex flex-col">
        {ADSENSE_CLIENT_ID && (
          <>
            {/* adsbygoogle.js 본문이 실행되기 전에 NPA(비맞춤형 광고) 플래그부터 큐에 실어
                둬야 한다 - 순서가 바뀌면 첫 광고 요청이 이미 "맞춤형" 기본값으로 나간 뒤라
                의미가 없다. App Router에서 beforeInteractive는 반드시 루트 레이아웃 파일
                안에 있어야 하이드레이션 이전 <head> 삽입이 보장돼, 자식 컴포넌트가 아니라
                여기 직접 둔다. "거부"뿐 아니라 아직 응답하지 않은 상태(null)도 개인정보
                보호 기본값으로 비맞춤형 취급한다.
                내용은 public/adsense-npa-init.js 참고 - CSP script-src에 'unsafe-inline'/
                해시 허용 없이도(더 엄격하게) 통과되도록 인라인 대신 정적 파일 src=로 둔다. */}
            <Script id="adsbygoogle-npa-init" src="/adsense-npa-init.js" strategy="beforeInteractive" />
            <AdsenseScript clientId={ADSENSE_CLIENT_ID} />
          </>
        )}
        <AuthHydrator />
        {children}
        <Footer />
        <CookieConsentBanner />
      </body>
    </html>
  );
}
