import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";
import { formatMoney, formatMonth, toNumber } from "../lib/format";
import ErrorBox from "../components/ErrorBox";
import type { Invoice, MonthlyRow, SupplierRow } from "../types";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listInvoices(), api.monthly(), api.suppliers(5)])
      .then(([inv, mon, sup]) => {
        if (cancelled) return;
        setInvoices(inv);
        setMonthly(mon);
        setSuppliers(sup);
      })
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const ron = invoices.filter((i) => i.currency === "RON");
    return {
      count: invoices.length,
      total: ron.reduce((sum, i) => sum + toNumber(i.total_amount), 0),
      vat: ron.reduce((sum, i) => sum + toNumber(i.vat_amount), 0),
      suppliers: new Set(invoices.map((i) => i.supplier_cui)).size,
    };
  }, [invoices]);

  const chartData = useMemo(
    () =>
      monthly
        .filter((r) => r.currency === "RON")
        .map((r) => ({ label: formatMonth(r.month), net: toNumber(r.net), vat: toNumber(r.vat) })),
    [monthly]
  );

  if (loading) return <p className="text-slate-500">Se încarcă...</p>;
  if (error) return <ErrorBox message={error} />;

  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <h2 className="text-lg font-semibold">Nu ai încă nicio factură</h2>
        <p className="mt-1 text-sm text-slate-500">Încarcă fișiere XML sau arhive ZIP din SPV ca să vezi rapoartele.</p>
        <Link to="/incarca" className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Încarcă facturi
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Facturi înregistrate" value={String(stats.count)} />
        <StatCard label="Total cheltuieli (RON)" value={formatMoney(stats.total)} />
        <StatCard label="TVA de dedus (RON)" value={formatMoney(stats.vat)} />
        <StatCard label="Furnizori" value={String(stats.suppliers)} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 xl:col-span-2">
          <h2 className="mb-4 font-semibold">Cheltuieli lunare (RON)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis fontSize={12}
                tickFormatter={(v) => new Intl.NumberFormat("ro-RO", { notation: "compact" }).format(Number(v))} />
              <Tooltip formatter={(v) => formatMoney(Number(v))} />
              <Legend />
              <Bar dataKey="net" name="Fără TVA" stackId="a" fill="#2563eb" />
              <Bar dataKey="vat" name="TVA" stackId="a" fill="#93c5fd" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 font-semibold">Top furnizori</h2>
          <ul className="space-y-3">
            {suppliers.map((s) => (
              <li key={`${s.cui}-${s.currency}`} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-slate-500">CUI {s.cui} · {s.count} facturi</p>
                </div>
                <p className="shrink-0 text-sm font-semibold">{formatMoney(s.total, s.currency)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}