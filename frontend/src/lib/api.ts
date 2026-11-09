import type {
  Invoice, InvoiceFilters, MonthlyRow, SupplierRow, TokenResponse, UploadResult, User,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "efactura_token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

function extractDetail(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown })?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // erorile de validare FastAPI vin ca listă
    return detail.map((d: { msg?: string }) => d.msg).filter(Boolean).join(", ") || fallback;
  }
  return fallback;
}

async function rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new Error("Nu mă pot conecta la server. Verifică dacă backend-ul rulează.");
  }

  if (res.status === 401 && token) {
    tokenStore.clear();
    window.dispatchEvent(new Event("auth:expired"));
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // răspunsul nu e JSON
    }
    throw new Error(extractDetail(body, `Eroare ${res.status}`));
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await rawRequest(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function toQuery(filters: InvoiceFilters = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const api = {
  // ---------- autentificare ----------
  login: (email: string, password: string) =>
    request<TokenResponse>("/api/auth/login", {
      method: "POST",
      body: new URLSearchParams({ username: email, password }),
    }),

  register: (email: string, password: string) =>
    request<TokenResponse>("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),

  me: () => request<User>("/api/auth/me"),

  // ---------- facturi ----------
  listInvoices: (filters?: InvoiceFilters) => request<Invoice[]>(`/api/invoices${toQuery(filters)}`),

  deleteInvoice: (id: number) => request<void>(`/api/invoices/${id}`, { method: "DELETE" }),

  monthly: () => request<MonthlyRow[]>("/api/reports/monthly"),

  suppliers: (limit = 5) => request<SupplierRow[]>(`/api/reports/suppliers?limit=${limit}`),

  upload: (files: File[]) => {
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    return request<{ results: UploadResult[] }>("/api/invoices/upload", { method: "POST", body: form });
  },

  downloadExcel: async (filters?: InvoiceFilters) => {
    const res = await rawRequest(`/api/export/excel${toQuery(filters)}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "facturi.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  },
};