export const COOKIE_CONSENT_STORAGE_KEY = "dreamhub_cookie_consent";
// 동의/거부 상태가 바뀔 때마다 같은 탭 안의 다른 컴포넌트(AdsenseScript 등)에 즉시 알리는 이벤트명 -
// localStorage 변경은 다른 탭에서만 storage 이벤트가 발생해, 같은 탭에서는 직접 dispatch해야 한다.
export const COOKIE_CONSENT_CHANGED_EVENT = "dreamhub-cookie-consent-changed";

export type CookieConsentStatus = "accepted" | "declined";

export function getStoredCookieConsent(): CookieConsentStatus | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
  return value === "accepted" || value === "declined" ? value : null;
}

export function setStoredCookieConsent(status: CookieConsentStatus): void {
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, status);
  window.dispatchEvent(new Event(COOKIE_CONSENT_CHANGED_EVENT));
}
