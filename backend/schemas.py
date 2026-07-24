from pydantic import BaseModel, EmailStr, field_validator, model_validator

NICKNAME_MIN_LENGTH = 2
NICKNAME_MAX_LENGTH = 20


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

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class MessageResponse(BaseModel):
    message: str


class NicknameAvailability(BaseModel):
    available: bool
