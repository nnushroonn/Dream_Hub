/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare Pages에 정적 배포하기 위한 설정 (Next.js 서버 기능을 쓰지 않고
  // 전부 클라이언트에서 FastAPI 백엔드를 호출하는 구조라 static export로 충분함)
  output: "export",
};

export default nextConfig;
