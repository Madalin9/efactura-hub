from collections import defaultdict
from decimal import Decimal
from io import BytesIO
from typing import Iterable

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from .models import Invoice

ZERO = Decimal("0")
DOC_LABELS = {"invoice": "Factură", "credit_note": "Notă de credit"}


def monthly_summary(invoices: Iterable[Invoice]) -> list[dict]:
    buckets = defaultdict(lambda: {"count": 0, "net": ZERO, "vat": ZERO, "total": ZERO})
    for inv in invoices:
        b = buckets[(inv.issue_date.strftime("%Y-%m"), inv.currency)]
        b["count"] += 1
        b["net"] += inv.net_amount
        b["vat"] += inv.vat_amount
        b["total"] += inv.total_amount
    return [{"month": m, "currency": c, **v} for (m, c), v in sorted(buckets.items())]


def top_suppliers(invoices: Iterable[Invoice], limit: int = 10) -> list[dict]:
    buckets = defaultdict(lambda: {"name": "", "count": 0, "total": ZERO})
    for inv in invoices:
        b = buckets[(inv.supplier_cui, inv.currency)]
        b["name"] = inv.supplier_name
        b["count"] += 1
        b["total"] += inv.total_amount
    rows = [{"cui": cui, "currency": cur, **v} for (cui, cur), v in buckets.items()]
    return sorted(rows, key=lambda r: r["total"], reverse=True)[:limit]


def _style_sheet(ws, money_cols: tuple, date_cols: tuple) -> None:
    header_fill = PatternFill("solid", fgColor="1F4E78")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
    ws.freeze_panes = "A2"

    for row in ws.iter_rows(min_row=2):
        for cell in row:
            if cell.column in money_cols:
                cell.number_format = "#,##0.00"
            elif cell.column in date_cols:
                cell.number_format = "DD.MM.YYYY"

    for idx, column in enumerate(ws.columns, start=1):
        width = max(len(str(c.value)) if c.value is not None else 0 for c in column)
        ws.column_dimensions[get_column_letter(idx)].width = min(width + 3, 50)


def build_excel(invoices: list[Invoice]) -> bytes:
    wb = Workbook()

    ws = wb.active
    ws.title = "Facturi"
    ws.append(["Tip", "Număr", "Data", "Scadență", "Furnizor", "CUI furnizor",
               "Client", "CUI client", "Monedă", "Fără TVA", "TVA", "Total"])
    for inv in invoices:
        ws.append([
            DOC_LABELS.get(inv.document_type, inv.document_type), inv.number,
            inv.issue_date, inv.due_date, inv.supplier_name, inv.supplier_cui,
            inv.customer_name, inv.customer_cui, inv.currency,
            inv.net_amount, inv.vat_amount, inv.total_amount,
        ])
    _style_sheet(ws, money_cols=(10, 11, 12), date_cols=(3, 4))

    summary = wb.create_sheet("Rezumat lunar")
    summary.append(["Lună", "Monedă", "Nr. facturi", "Fără TVA", "TVA", "Total"])
    for row in monthly_summary(invoices):
        summary.append([row["month"], row["currency"], row["count"],
                        row["net"], row["vat"], row["total"]])
    _style_sheet(summary, money_cols=(4, 5, 6), date_cols=())

    buffer = BytesIO()
    wb.save(buffer)
    return buffer.getvalue()