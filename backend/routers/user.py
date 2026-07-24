"""로그인한 유저 자신의 프로필(꿈 페르소나 닉네임) 조회/수정."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database import get_db
from models import User
from routers.auth import get_current_user
from schemas import ProfileUpdateInput, UserResponse

router = APIRouter(prefix="/api/user", tags=["user"])


@router.patch("/profile", response_model=UserResponse)
def update_profile(
    payload: ProfileUpdateInput,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    # 자기 자신의 현재 닉네임을 그대로 다시 제출하는 경우(무변경 저장)는 중복으로 치지 않는다.
    existing = (
        db.query(User)
        .filter(User.nickname == payload.nickname, User.id != current_user.id)
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="이미 사용 중인 닉네임입니다.")

    current_user.nickname = payload.nickname
    db.commit()
    db.refresh(current_user)
    return current_user
