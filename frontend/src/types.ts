// Backend-ul trimite sumele fie ca string ("1210.00"), fie ca număr
export type Money = string | number;

export interface Invoice {
  id: number;
  document_type: "invoice" | "credit_note";
  number: string;
  issue_date: string;
  due_date: string | null;
  currency: string;
  supplier_name: string;
  supplier_cui: string;
  customer_name: string;
  customer_cui: string;
  net_amount: Money;
  vat_amount: Money;
  total_amount: Money;
  source_file: string;
  uploaded_at: string;
}

export interface MonthlyRow {
  month: string;
  currency: string;
  count: number;
  net: Money;
  vat: Money;
  total: Money;
}

export interface SupplierRow {
  cui: string;
  currency: string;
  name: string;
  count: number;
  total: Money;
}

export type UploadStatus = "saved" | "duplicate" | "error";

export interface UploadResult {
  file: string;
  status: UploadStatus;
  detail?: string;
  invoice_id?: number;
  number?: string;
}

export interface InvoiceFilters {
  supplier_cui?: string;
  date_from?: string;
  date_to?: string;
}

export interface User {
  id: number;
  email: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}