from contextlib import asynccontextmanager
from dataclasses import asdict
from datetime import date
from typing import Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from .auth import create_access_token, get_current_user, hash_password, verify_password
from .database import get_session, init_db
from .models import Invoice, Token, User, UserCreate, UserRead
from .parser import InvoiceParseError, extract_invoices
from .reports import build_excel, monthly_summary, top_suppliers

MAX_UPLOAD_BYTES = 10 * 1024 * 1024


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="e-Factura Hub API", version="0.2.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------- Autentificare ----------
@app.post("/api/auth/register", response_model=Token, status_code=201)
def register(data: UserCreate, session: Session = Depends(get_session)):
    email = data.email.lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=409, detail="Există deja un cont cu acest email.")

    user = User(email=email, password_hash=hash_password(data.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return Token(access_token=create_access_token(user.id))


@app.post("/api/auth/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), session: Session = Depends(get_session)):
    # OAuth2 folosește câmpul "username"; la noi conține email-ul
    user = session.exec(select(User).where(User.email == form.username.lower())).first()
    if not user or not verify_password(form.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email sau parolă greșită.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return Token(access_token=create_access_token(user.id))


@app.get("/api/auth/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


# ---------- Facturi ----------
def query_invoices(
    session: Session,
    owner_id: int,
    supplier_cui: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
) -> list[Invoice]:
    query = select(Invoice).where(Invoice.owner_id == owner_id).order_by(Invoice.issue_date.desc())
    if supplier_cui:
        query = query.where(Invoice.supplier_cui == supplier_cui.upper().removeprefix("RO"))
    if date_from:
        query = query.where(Invoice.issue_date >= date_from)
    if date_to:
        query = query.where(Invoice.issue_date <= date_to)
    return list(session.exec(query).all())


def get_own_invoice(session: Session, invoice_id: int, user: User) -> Invoice:
    invoice = session.get(Invoice, invoice_id)
    # 404 și pentru facturile altcuiva, ca să nu dezvăluim că există
    if not invoice or invoice.owner_id != user.id:
        raise HTTPException(status_code=404, detail="Factura nu există")
    return invoice


@app.post("/api/invoices/upload")
async def upload_invoices(
    files: list[UploadFile] = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    results = []
    for upload in files:
        filename = upload.filename or "fara_nume"
        content = await upload.read()

        if len(content) > MAX_UPLOAD_BYTES:
            results.append({"file": filename, "status": "error", "detail": "Fișier prea mare (max 10 MB)"})
            continue

        try:
            items = extract_invoices(filename, content)
        except InvoiceParseError as e:
            results.append({"file": filename, "status": "error", "detail": str(e)})
            continue

        for source, parsed in items:
            if isinstance(parsed, InvoiceParseError):
                results.append({"file": source, "status": "error", "detail": str(parsed)})
                continue

            existing = session.exec(
                select(Invoice).where(
                    Invoice.owner_id == user.id,
                    Invoice.supplier_cui == parsed.supplier_cui,
                    Invoice.number == parsed.number,
                    Invoice.document_type == parsed.document_type,
                )
            ).first()
            if existing:
                results.append({"file": source, "status": "duplicate", "invoice_id": existing.id})
                continue

            invoice = Invoice(**asdict(parsed), source_file=source, owner_id=user.id)
            session.add(invoice)
            session.commit()
            session.refresh(invoice)
            results.append({"file": source, "status": "saved",
                            "invoice_id": invoice.id, "number": invoice.number})

    return {"results": results}


@app.get("/api/invoices", response_model=list[Invoice])
def list_invoices(
    supplier_cui: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return query_invoices(session, user.id, supplier_cui, date_from, date_to)


@app.get("/api/invoices/{invoice_id}", response_model=Invoice)
def get_invoice(
    invoice_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return get_own_invoice(session, invoice_id, user)


@app.delete("/api/invoices/{invoice_id}", status_code=204)
def delete_invoice(
    invoice_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    session.delete(get_own_invoice(session, invoice_id, user))
    session.commit()


# ---------- Rapoarte ----------
@app.get("/api/reports/monthly")
def report_monthly(
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return monthly_summary(query_invoices(session, user.id, date_from=date_from, date_to=date_to))


@app.get("/api/reports/suppliers")
def report_suppliers(
    limit: int = 10,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    return top_suppliers(query_invoices(session, user.id), limit=limit)


@app.get("/api/export/excel")
def export_excel(
    supplier_cui: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    data = build_excel(query_invoices(session, user.id, supplier_cui, date_from, date_to))
    return Response(
        content=data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="facturi.xlsx"'},
    )