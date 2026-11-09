import type { Money } from "../types";

export const toNumber = (value: Money): number => (typeof value === "number" ? value : Number(value));

export function formatMoney(value: Money, currency = "RON"): string {
  return new Intl.NumberFormat("ro-RO", { style: "currency", currency }).format(toNumber(value));
}

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-");
  return `${day}.${month}.${year}`;
}

export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("ro-RO", { month: "short", year: "numeric" });
}