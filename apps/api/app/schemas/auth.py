from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field

class SignUpRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: Optional[str] = Field(None, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    company_name: Optional[str] = Field(None, max_length=200)

class SignInRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class TokenRefreshRequest(BaseModel):
    refresh_token: str

class AuthTokens(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

class UserResponse(BaseModel):
    id: str
    email: str
    first_name: Optional[str]
    last_name: Optional[str]
    is_verified: bool
    created_at: datetime
    class Config: from_attributes = True

class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    plan_tier: str
    role: str
    created_at: datetime
    class Config: from_attributes = True

class AuthResponse(BaseModel):
    user: UserResponse
    tokens: AuthTokens
    tenant: TenantResponse
