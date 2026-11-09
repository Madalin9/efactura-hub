"""
Parser pentru facturi e-Factura (format UBL 2.1, standard RO_CIUS).
Acceptă un XML individual sau arhiva ZIP descărcată din SPV
(care conține factura + un fișier separat cu semnătura ANAF).
"""
import zipfile
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from io import BytesIO
from typing import Optional, Union
from xml.etree.ElementTree import Element, ParseError

import defusedxml.ElementTree as ET
from defusedxml import DefusedXmlException

NS = {
    "cac": "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
    "cbc": "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
}

DOCUMENT_TYPES = {
    "{urn:oasis:names:specification:ubl:schema:xsd:Invoice-2}Invoice": "invoice",
    "{urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2}CreditNote": "credit_note",
}

MAX_XML_BYTES = 5 * 1024 * 1024


class InvoiceParseError(Exception):
    pass


class NotAnInvoiceError(InvoiceParseError):
    """XML valid, dar nu e factură (ex: fișierul de semnătură din ZIP-ul ANAF)."""


@dataclass
class ParsedInvoice:
    document_type: str
    number: str
    issue_date: date
    due_date: Optional[date]
    currency: str
    supplier_name: str
    supplier_cui: str
    customer_name: str
    customer_cui: str
    net_amount: Decimal
    vat_amount: Decimal
    total_amount: Decimal


# ---------- helpers ----------
def _text(el: Element, path: str, required: bool = True) -> Optional[str]:
    node = el.find(path, NS)
    if node is None or node.text is None or not node.text.strip():
        if required:
            raise InvoiceParseError(f"Lipsește câmpul obligatoriu: {path}")
        return None
    return node.text.strip()


def _decimal(value: str, field: str) -> Decimal:
    try:
        return Decimal(value)
    except InvalidOperation:
        raise InvoiceParseError(f"Valoare numerică invalidă pentru {field}: {value}")


def _date(value: Optional[str]) -> Optional[date]:
    if value is None:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise InvoiceParseError(f"Dată invalidă: {value}")


def normalize_cui(raw: str) -> str:
    """'RO 12345678' și '12345678' devin același CUI."""
    return raw.upper().replace(" ", "").removeprefix("RO")


def _party(root: Element, role: str) -> tuple[str, str]:
    party = root.find(f"cac:{role}/cac:Party", NS)
    if party is None:
        raise InvoiceParseError(f"Lipsește secțiunea {role}")

    name = (
        _text(party, "cac:PartyLegalEntity/cbc:RegistrationName", required=False)
        or _text(party, "cac:PartyName/cbc:Name", required=False)
    )
    cui = (
        _text(party, "cac:PartyTaxScheme/cbc:CompanyID", required=False)
        or _text(party, "cac:PartyLegalEntity/cbc:CompanyID", required=False)
    )
    if not name or not cui:
        raise InvoiceParseError(f"Nume sau CUI lipsă în {role}")
    return name, normalize_cui(cui)


def _vat_amount(root: Element, currency: str) -> Decimal:
    # pot exista mai multe TaxTotal (unul în moneda facturii, altul în RON)
    totals = root.findall("cac:TaxTotal/cbc:TaxAmount", NS)
    for node in totals:
        if node.get("currencyID") == currency and node.text:
            return _decimal(node.text.strip(), "TaxAmount")
    if totals and totals[0].text:
        return _decimal(totals[0].text.strip(), "TaxAmount")
    return Decimal("0")


# ---------- API public ----------
def parse_invoice_xml(content: bytes) -> ParsedInvoice:
    try:
        root = ET.fromstring(content)
    except (ParseError, DefusedXmlException) as e:
        raise InvoiceParseError(f"XML invalid: {e}")

    document_type = DOCUMENT_TYPES.get(root.tag)
    if document_type is None:
        raise NotAnInvoiceError("Fișierul nu este o factură UBL")

    currency = _text(root, "cbc:DocumentCurrencyCode")
    supplier_name, supplier_cui = _party(root, "AccountingSupplierParty")
    customer_name, customer_cui = _party(root, "AccountingCustomerParty")

    net = _decimal(_text(root, "cac:LegalMonetaryTotal/cbc:TaxExclusiveAmount"), "TaxExclusiveAmount")
    total = _decimal(_text(root, "cac:LegalMonetaryTotal/cbc:TaxInclusiveAmount"), "TaxInclusiveAmount")
    vat = _vat_amount(root, currency)

    # notele de credit scad din totaluri, deci le salvăm cu minus
    sign = Decimal("-1") if document_type == "credit_note" else Decimal("1")

    return ParsedInvoice(
        document_type=document_type,
        number=_text(root, "cbc:ID"),
        issue_date=_date(_text(root, "cbc:IssueDate")),
        due_date=_date(_text(root, "cbc:DueDate", required=False)),
        currency=currency,
        supplier_name=supplier_name,
        supplier_cui=supplier_cui,
        customer_name=customer_name,
        customer_cui=customer_cui,
        net_amount=net * sign,
        vat_amount=vat * sign,
        total_amount=total * sign,
    )


ParseResult = Union[ParsedInvoice, InvoiceParseError]


def extract_invoices(filename: str, content: bytes) -> list[tuple[str, ParseResult]]:
    """Returnează o listă de (nume_fișier, factură sau eroare)."""
    name = filename.lower()
    if name.endswith(".zip"):
        return _from_zip(content)
    if name.endswith(".xml"):
        try:
            return [(filename, parse_invoice_xml(content))]
        except InvoiceParseError as e:
            return [(filename, e)]
    raise InvoiceParseError("Format nesuportat. Încarcă .xml sau .zip.")


def _from_zip(content: bytes) -> list[tuple[str, ParseResult]]:
    try:
        archive = zipfile.ZipFile(BytesIO(content))
    except zipfile.BadZipFile:
        raise InvoiceParseError("Arhiva ZIP este coruptă")

    results: list[tuple[str, ParseResult]] = []
    with archive:
        for info in archive.infolist():
            if info.is_dir() or not info.filename.lower().endswith(".xml"):
                continue
            if info.file_size > MAX_XML_BYTES:  # protecție împotriva arhivelor-bombă
                results.append((info.filename, InvoiceParseError("Fișier XML prea mare")))
                continue
            try:
                results.append((info.filename, parse_invoice_xml(archive.read(info))))
            except NotAnInvoiceError:
                continue  # semnătura ANAF, o ignorăm
            except InvoiceParseError as e:
                results.append((info.filename, e))

    if not results:
        raise InvoiceParseError("Arhiva nu conține nicio factură XML")
    return results