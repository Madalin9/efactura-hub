import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { formatDate, formatMoney, toNumber } from "../lib/format";
import ErrorBox from "../components/ErrorBox";
import type { Invoice, InvoiceFilters } from "../types";

export default function InvoicesPage() {
  const [form, setForm] = useState<InvoiceFilters>({});
  const [filters, setFilters] = useState<InvoiceFilters>({});
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .listInvoices(filters)
      .then((data) => !cancelled && setInvoices(data))
      .catch((err: Error) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [filters]);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setFilters({ ...form });
  }

  function resetFilters() {
    setForm({});
    setLoading(true);
    setError(null);
    setFilters({});
  }

  async function handleDelete(invoice: Invoice) {
    if (!confirm(`Ștergi factura ${invoice.number} de la ${invoice.supplier_name}?`)) return;
    try {
      await api.deleteInvoice(invoice.id);
      setInvoices((prev) => prev.filter((i) => i.id !== invoice.id));
    } catch (err) {
      alert((err as Error).message);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      await api.downloadExcel(filters);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const totalRon = invoices
    .filter((i) => i.currency === "RON")
    .reduce((sum, i) => sum + toNumber(i.total_amount), 0);

  const inputClass = "rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Facturi</h1>
        <button onClick={handleExport} disabled={exporting || invoices.length === 0}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
          {exporting ? "Se generează..." : "Export Excel"}
        </button>
      </div>

      <form onSubmit={applyFilters} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          CUI furnizor
          <input className={inputClass} placeholder="ex: 12345678" value={form.supplier_cui ?? ""}
            onChange={(e) => setForm({ ...form, supplier_cui: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          De la
          <input type="date" className={inputClass} value={form.date_from ?? ""}
            onChange={(e) => setForm({ ...form, date_from: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-500">
          Până la
          <input type="date" className={inputClass} value={form.date_to ?? ""}
            onChange={(e) => setForm({ ...form, date_to: e.target.value })} />
        </label>
        <button type="submit" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          Filtrează
        </button>
        <button type="button" onClick={resetFilters} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Resetează
        </button>
      </form>

      {error && <ErrorBox message={error} />}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Număr</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Furnizor</th>
              <th className="px-4 py-3 text-right">Fără TVA</th>
              <th className="px-4 py-3 text-right">TVA</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Se încarcă...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Nicio factură găsită.</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">
                    {inv.number}
                    {inv.document_type === "credit_note" && (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">storno</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{formatDate(inv.issue_date)}</td>
                  <td className="px-4 py-3">
                    <p>{inv.supplier_name}</p>
                    <p className="text-xs text-slate-500">CUI {inv.supplier_cui}</p>
                  </td>
                  <td className="px-4 py-3 text-right">{formatMoney(inv.net_amount, inv.currency)}</td>
                  <td className="px-4 py-3 text-right">{formatMoney(inv.vat_amount, inv.currency)}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${toNumber(inv.total_amount) < 0 ? "text-red-600" : ""}`}>
                    {formatMoney(inv.total_amount, inv.currency)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(inv)} className="text-xs text-red-600 hover:underline">
                      Șterge
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && invoices.length > 0 && (
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td colSpan={5} className="px-4 py-3 text-right">Total RON ({invoices.length} documente)</td>
                <td className="px-4 py-3 text-right">{formatMoney(totalRon)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}