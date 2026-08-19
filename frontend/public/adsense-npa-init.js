// adsbygoogle.js 본문이 실행되기 전에 NPA(비맞춤형 광고) 플래그부터 큐에 실어 둔다 - 순서가
// 바뀌면 첫 광고 요청이 이미 "맞춤형" 기본값으로 나간 뒤라 의미가 없다.
//
// 원래 app/layout.tsx 안에 dangerouslySetInnerHTML 인라인 스크립트로 있었는데, CSP에서
// script-src에 'unsafe-inline'이나 해시를 넣지 않고도(=더 엄격하게) 실행되도록 정적 파일로
// 옮겼다 - 외부 스크립트(src=)는 별도 허용 없이 이미 script-src 'self'만으로 통과된다.
//
// 아래 문자열 리터럴은 src/lib/cookieConsent.ts의 COOKIE_CONSENT_STORAGE_KEY와 반드시
// 같아야 한다 - 정적 파일이라 그 상수를 import할 수 없어 값을 그대로 옮겨 적었다. 그 상수를
// 바꾸면 이 파일도 함께 고쳐야 한다.
(function () {
  try {
    var c = window.localStorage.getItem("dreamhub_cookie_consent");
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = c === "accepted" ? 0 : 1;
  } catch (e) {}
})();
