"""꿈 기록소: 꿈 작성 폼 관련 라우터.

꿈 별자리 캘린더와 출석 스트릭은 더 이상 더미 데이터를 반환하는 백엔드 엔드포인트에 의존하지 않는다 —
프론트엔드가 유저의 실제 저장 기록(savedDreams)에서 직접 계산한다 (frontend/src/lib/dreamCalendar.ts 참고).

AI 해몽 요청은 routers/ai_interpretation.py의 POST /api/dream-interpretation에서 처리한다.
"""

from fastapi import APIRouter

router = APIRouter(prefix="/diary", tags=["diary"])
