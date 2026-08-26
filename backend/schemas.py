from pydantic import BaseModel, EmailStr, field_validator, model_validator

NICKNAME_MIN_LENGTH = 2
NICKNAME_MAX_LENGTH = 20
AURA_OPTIONS = {"good", "lucid", "calm"}


def _validate_password_strength(value: str) -> str:
    """가입/비밀번호 재설정 양쪽이 공유하는 비밀번호 강도 규칙 - 한쪽만 고쳐서 두 경로의
    기준이 갈라지는 일이 없도록 로직을 한 곳에 둔다."""
    if len(value) < 8:
        raise ValueError("비밀번호는 최소 8자 이상이어야 합니다.")
    if not any(char.isalpha() for char in value) or not any(char.isdigit() for char in value):
        raise ValueError("비밀번호는 영문과 숫자를 모두 포함해야 합니다.")
    return value


class UserCreate(BaseModel):
    email: EmailStr
    nickname: str
    password: str
    password_confirm: str

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < NICKNAME_MIN_LENGTH or len(trimmed) > NICKNAME_MAX_LENGTH:
            raise ValueError(f"닉네임은 {NICKNAME_MIN_LENGTH}~{NICKNAME_MAX_LENGTH}자로 입력해 주세요.")
        return trimmed

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)

    @model_validator(mode="after")
    def validate_passwords_match(self) -> "UserCreate":
        if self.password != self.password_confirm:
            raise ValueError("비밀번호가 일치하지 않습니다.")
        return self


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VerifyEmailRequest(BaseModel):
    token: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
    new_password_confirm: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)

    @model_validator(mode="after")
    def validate_new_passwords_match(self) -> "ResetPasswordRequest":
        if self.new_password != self.new_password_confirm:
            raise ValueError("비밀번호가 일치하지 않습니다.")
        return self


class UserResponse(BaseModel):
    id: int
    email: str
    nickname: str
    is_verified: bool
    aura_preference: str | None = None
    is_galaxy_public: bool = False
    # 프론트가 이 값 하나로 "관리자" 내비게이션 링크/​/admin 접근 여부를 결정한다 - 실제 권한
    # 검증은 항상 백엔드(get_current_admin_user)가 다시 하므로, 이건 순수 UI 분기용이다.
    is_admin: bool = False
    # 신규 가입 온보딩 투어를 이미 봤는지(끝까지 보거나 건너뛰기 포함) - 프론트가 이 값 하나로
    # 홈 화면 진입 시 투어를 자동으로 띄울지 판단한다(models.py의 User.has_completed_onboarding).
    has_completed_onboarding: bool
    # 더블 서브밋 CSRF 패턴의 헤더 값 - 프론트/백엔드가 서로 다른 등록 도메인(교차 사이트)이면
    # document.cookie로는 백엔드 도메인의 csrf_token 쿠키를 애초에 읽을 수 없어(쿠키는 그걸
    # 심은 도메인에서만 JS로 보인다 - HttpOnly 여부와 무관), 응답 바디로 직접 건네줘야 한다.
    # /auth/login·/auth/me만 채운다(로그인 상태를 새로 확립/재확인하는 지점) - /api/user/*
    # 프로필 수정 응답 등은 굳이 다시 실을 필요가 없어 None으로 둔다.
    csrf_token: str | None = None

    model_config = {"from_attributes": True}


class MessageResponse(BaseModel):
    message: str


class NicknameAvailability(BaseModel):
    available: bool


class ProfileUpdateInput(BaseModel):
    nickname: str

    @field_validator("nickname")
    @classmethod
    def validate_nickname(cls, value: str) -> str:
        trimmed = value.strip()
        if len(trimmed) < NICKNAME_MIN_LENGTH or len(trimmed) > NICKNAME_MAX_LENGTH:
            raise ValueError(f"닉네임은 {NICKNAME_MIN_LENGTH}~{NICKNAME_MAX_LENGTH}자로 입력해 주세요.")
        return trimmed


class AuraUpdateInput(BaseModel):
    aura_preference: str

    @field_validator("aura_preference")
    @classmethod
    def validate_aura(cls, value: str) -> str:
        if value not in AURA_OPTIONS:
            raise ValueError(f"오라 옵션은 {sorted(AURA_OPTIONS)} 중 하나여야 합니다.")
        return value


class GalaxyVisibilityUpdateInput(BaseModel):
    is_galaxy_public: bool


class BadgeInfo(BaseModel):
    code: str
    label: str
    emoji: str
    earned: bool


class UserStatsResponse(BaseModel):
    dream_count: int
    public_dream_count: int
    lucid_count: int
    post_count: int
    comment_count: int
    empathy_received: int
    # 9단계 우주 티어 시스템(leveling.py) - level은 total_xp에서 항상 파생되는 세밀한 진행도이고,
    # tier_index(1~9)/tier_title/tier_color는 level을 10개씩 묶은 굵은 단계다.
    level: int
    tier_index: int
    tier_title: str
    tier_color: str
    total_xp: int
    xp_into_level: int
    xp_for_next_level: int
    badges: list[BadgeInfo]
    # Daily XP Cap - 게시글/댓글 "작성"으로 번 XP만 하루 합산 상한이 있다(도배 방지). 좋아요/댓글을
    # "받는" XP는 상한이 없어 여기 집계되지 않는다. daily_cap_reached가 true면 오늘 작성 활동으로는
    # 더 이상 XP가 붙지 않는다는 뜻.
    daily_xp_cap: int
    daily_capped_xp_earned: int
    daily_cap_reached: bool
    diary_streak: int
