import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import ErrorBox from "../components/ErrorBox";
import type { UploadResult, UploadStatus } from "../types";

const statusStyle: Record<UploadStatus, { label: string; className: string }> = {
  saved: { label: "Salvată", className: "bg-emerald-100 text-emerald-700" },
  duplicate: { label: "Duplicat", className: "bg-amber-100 text-amber-700" },
  error: { label: "Eroare", className: "bg-red-100 text-red-700" },
};

export default function UploadPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const valid = Array.from(list).filter((f) => /\.(xml|zip)$/i.test(f.name));
    setFiles((prev) => [...prev, ...valid]);
  }

  async function handleUpload() {
    setUploading(true);
    setError(null);
    try {
      const res = await api.upload(files);
      setResults(res.results);
      setFiles([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const savedCount = results?.filter((r) => r.status === "saved").length ?? 0;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Încarcă facturi</h1>
        <p className="text-sm text-slate-500">Fișiere XML e-Factura sau arhivele ZIP descărcate din SPV.</p>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
        className={`cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition ${
          dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white hover:border-blue-400"
        }`}
      >
        <p className="font-medium">Trage fișierele aici sau dă click pentru a le alege</p>
        <p className="mt-1 text-sm text-slate-500">.xml sau .zip, maxim 10 MB pe fișier</p>
        <input ref={inputRef} type="file" multiple accept=".xml,.zip" hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
      </div>

      {files.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <ul className="mb-4 space-y-1 text-sm">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center justify-between">
                <span className="truncate">{file.name}</span>
                <button onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  className="text-xs text-slate-500 hover:text-red-600">
                  elimină
                </button>
              </li>
            ))}
          </ul>
          <button onClick={handleUpload} disabled={uploading}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {uploading ? "Se procesează..." : `Încarcă ${files.length} fișier(e)`}
          </button>
        </div>
      )}

      {error && <ErrorBox message={error} />}

      {results && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Rezultat: {savedCount} din {results.length} salvate</h2>
            {savedCount > 0 && (
              <Link to="/facturi" className="text-sm font-medium text-blue-600 hover:underline">Vezi facturile →</Link>
            )}
          </div>
          <ul className="divide-y divide-slate-100 text-sm">
            {results.map((r, index) => (
              <li key={`${r.file}-${index}`} className="flex items-start justify-between gap-4 py-2">
                <div className="min-w-0">
                  <p className="truncate">{r.file}</p>
                  {r.detail && <p className="text-xs text-red-600">{r.detail}</p>}
                  {r.number && <p className="text-xs text-slate-500">Factura {r.number}</p>}
                </div>
                <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${statusStyle[r.status].className}`}>
                  {statusStyle[r.status].label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}