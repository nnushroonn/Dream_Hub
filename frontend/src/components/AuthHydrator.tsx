"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { getCurrentUser } from "@/api/auth";
import { consumePendingRedirect } from "@/lib/pendingRedirect";
import { useAuthStore } from "@/store/useAuthStore";

// 앱이 로드될 때마다(새로고침 포함) 딱 한 번, 실제로 로그인돼 있는지(httpOnly 쿠키가
// 유효한지)를 서버에 물어 클라이언트 인증 상태를 채운다 - 토큰을 더 이상 localStorage에
// 두지 않으므로, "로그인돼 있는지"를 클라이언트가 스스로 판단할 방법이 이 API 호출 말고는
// 없다. 루트 레이아웃에 한 번만 렌더링한다(페이지 이동할 때마다 다시 부를 필요는 없다 -
// 로그인/로그아웃 시점의 상태 변경은 각 화면이 스토어를 직접 갱신한다).
//
// 구글 OAuth 콜백도 이제 ?token=...을 붙이지 않고 그냥 "/"로 돌아온다(백엔드가 쿠키를
// 직접 심는다) - 그래서 예전에 홈 페이지 전용 useEffect가 담당하던 "로그인 직전에 하려던
// 동작으로 이어서 보내기"(구글 로그인 전 setPendingRedirect로 남겨 둔 목적지)도 여기 한
// 곳으로 옮겼다. pendingRedirect는 구글 로그인 버튼을 누르기 직전에만 남으므로, 인증
// 확인이 성공할 때마다 함께 소비해도(=거의 항상 비어 있다가, 방금 OAuth를 마치고 돌아온
// 순간에만 값이 있다) 실질적으로 "OAuth 복귀 시점에만" 동작하는 것과 같다.
export default function AuthHydrator() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    getCurrentUser()
      .then((user) => {
        login(user);
        const pendingRedirect = consumePendingRedirect();
        if (pendingRedirect) router.push(pendingRedirect);
      })
      .catch(() => logout());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
