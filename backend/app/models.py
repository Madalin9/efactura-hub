from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Optional

from pydantic import EmailStr
from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


# ---------- Utilizatori ----------
class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    created_at: datetime = Field(default_factory=utc_now)


class UserCreate(SQLModel):
    email: EmailStr
    password: str = Field(min_length=8)


class UserRead(SQLModel):
    id: int
    email: str


class Token(SQLModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Facturi ----------
class Invoice(SQLModel, table=True):
    # același utilizator nu poate salva aceeași factură de două ori
    __table_args__ = (UniqueConstraint("owner_id", "supplier_cui", "number", "document_type"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_id: int = Field(foreign_key="user.id", index=True)

    document_type: str  # invoice | credit_note
    number: str = Field(index=True)
    issue_date: date = Field(index=True)
    due_date: Optional[date] = None
    currency: str

    supplier_name: str
    supplier_cui: str = Field(index=True)
    customer_name: str
    customer_cui: str

    net_amount: Decimal = Field(max_digits=14, decimal_places=2)
    vat_amount: Decimal = Field(max_digits=14, decimal_places=2)
    total_amount: Decimal = Field(max_digits=14, decimal_places=2)

    source_file: str
    uploaded_at: datetime = Field(default_factory=utc_now)