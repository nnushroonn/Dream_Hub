"""GNB 종 아이콘 알림: 내 자유 광장 글/무의식 피드 꿈에 달린 댓글과 좋아요를 알려주는
단일 리스트(탭 분리 없음) 알림함.

읽음 처리는 항목별이 아니라 "드롭다운을 열면 그 시점의 안 읽은 알림을 한 번에 읽음 처리"
방식이다 - 목록 조회(list_notifications) 응답은 그 순간의 is_read 값을 그대로 보여주므로,
방금 도착한 알림은 이번 열람에서는 강조 스타일로 보이고 다음 열람부터 일반 스타일이 된다.

좋아요(LIKE)는 투표 자체에 익명 선택지가 없어 항상 행위자 이름을 감춘다. 댓글(COMMENT)은
그 댓글을 쓸 때 고른 is_anonymous를 그대로 따른다. 베스트 피드(BEST) 진입 알림은 이를
자동으로 만들어 줄 스케줄러가 없어 타입만 정의해 뒀고 실제로 생성되지는 않는다. 이슬(DEW)은
정원 자체가 닉네임 기반 공개 페이지라 신원을 감출 이유가 없어 항상 actor_is_anonymous=False로
생성된다."""

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import Notification, NotificationTargetType, NotificationType, User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

NOTIFICATION_LIST_LIMIT = 30


def create_notification(
    db: Session,
    *,
    user_id: int,
    actor_id: int,
    actor_is_anonymous: bool,
    type_: NotificationType,
    target_type: NotificationTargetType,
    target_id: int,
    preview_text: str,
    comment_id: int | None = None,
) -> None:
    """자기 글/꿈에 자기가 좋아요·댓글을 남긴 경우(self-interaction)는 알림을 만들지 않는다."""
    if user_id == actor_id:
        return
    db.add(
        Notification(
            user_id=user_id,
            actor_id=actor_id,
            actor_is_anonymous=actor_is_anonymous,
            type=type_,
            target_type=target_type,
            target_id=target_id,
            comment_id=comment_id,
            preview_text=preview_text[:300],
        )
    )
    db.commit()


class NotificationResponse(BaseModel):
    id: int
    type: Literal["COMMENT", "LIKE", "BEST", "DEW"]
    target_type: Literal["POST", "DREAM", "GARDEN"]
    target_id: int
    comment_id: int | None
    preview_text: str
    # LIKE는 항상 None(투표엔 익명 개념이 없어 아예 이름을 안 밝힘). COMMENT는 그 댓글의
    # is_anonymous 선택을 그대로 따른다. actor가 탈퇴했으면 실명이어도 None.
    actor_display_name: str | None
    is_read: bool
    created_at: str


def _to_response(notification: Notification) -> dict:
    actor_display_name = None
    if (
        notification.type != NotificationType.LIKE
        and not notification.actor_is_anonymous
        and notification.actor is not None
    ):
        actor_display_name = notification.actor.nickname
    return {
        "id": notification.id,
        "type": notification.type.value,
        "target_type": notification.target_type.value,
        "target_id": notification.target_id,
        "comment_id": notification.comment_id,
        "preview_text": notification.preview_text,
        "actor_display_name": actor_display_name,
        "is_read": notification.is_read,
        "created_at": notification.created_at.isoformat(),
    }


@router.get("", response_model=list[NotificationResponse])
def list_notifications(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(NOTIFICATION_LIST_LIMIT)
        .all()
    )
    return [_to_response(notification) for notification in rows]


@router.get("/unread-count")
def get_unread_count(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    count = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .count()
    )
    return {"count": count}


@router.post("/mark-all-read", status_code=204)
def mark_all_read(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    db.query(Notification).filter(
        Notification.user_id == current_user.id, Notification.is_read.is_(False)
    ).update({"is_read": True}, synchronize_session=False)
    db.commit()
