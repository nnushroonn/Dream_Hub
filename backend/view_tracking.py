"""게시글/꿈 기록 상세 조회수 어뷰징 방지.

새로고침을 반복하거나 브라우저 뒤로가기·다시가기를 오갈 때마다 조회수가 무한정
올라가지 않도록, 로그인 유저는 user_id로 비로그인 방문자는 IP로 식별해 같은 글을
24시간 안에 다시 봐도 최초 1회만 집계한다. Redis SET ... NX EX는 "키가 아직 없을
때만 설정하고 TTL도 함께 건다"를 원자적으로 처리해, 동시 요청에도 두 번 세는 일이 없다.
"""

import redis

VIEW_DEDUP_TTL_SECONDS = 60 * 60 * 24  # 24시간


def should_count_view(redis_client: redis.Redis, target_type: str, target_id: int, identity: str) -> bool:
    key = f"view:{target_type}:{target_id}:{identity}"
    return bool(redis_client.set(key, "1", nx=True, ex=VIEW_DEDUP_TTL_SECONDS))
