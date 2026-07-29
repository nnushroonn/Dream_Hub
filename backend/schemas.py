from pydantic import BaseModel, EmailStr, field_validator, model_validator

NICKNAME_MIN_LENGTH = 2
NICKNAME_MAX_LENGTH = 20
AURA_OPTIONS = {"good", "lucid", "calm"}


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
        if len(value) < 8:
            raise ValueError("비밀번호는 최소 8자 이상이어야 합니다.")
        if not any(char.isalpha() for char in value) or not any(char.isdigit() for char in value):
            raise ValueError("비밀번호는 영문과 숫자를 모두 포함해야 합니다.")
        return value

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


class UserResponse(BaseModel):
    id: int
    email: str
    nickname: str
    is_verified: bool
    aura_preference: str | None = None
    is_galaxy_public: bool = False

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


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
    level: int
    level_title: str
    # 마이페이지 레벨 게이지가 "2,450 / 3,000 XP"처럼 실제 수치를 보여줄 수 있도록 노출한다.
    # next_level_threshold가 None이면 이미 최고 레벨(만렙) 상태.
    points: int
    next_level_threshold: int | None
    badges: list[BadgeInfo]
