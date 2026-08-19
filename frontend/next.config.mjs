/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cloudflare Pages에 정적 배포하기 위한 설정 (Next.js 서버 기능을 쓰지 않고
  // 전부 클라이언트에서 FastAPI 백엔드를 호출하는 구조라 static export로 충분함)
  output: "export",
  // 같은 와이파이의 다른 기기(LAN IP)로 접속했을 때 개발 서버의 핫 리로드(webpack-hmr)가
  // 기본적으로 차단된다 - 허용해 두지 않으면 코드를 고쳐도 그 기기 브라우저에는 자동으로
  // 반영되지 않고 예전 번들이 계속 캐시된 채로 남는다.
  allowedDevOrigins: ["192.168.0.164"],
};

export default nextConfig;
