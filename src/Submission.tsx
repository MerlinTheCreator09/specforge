// Saves the three things the portal's Submit page takes into the project's outputs/ folder, and downloads them.
import { useState } from "react";
import { call, download } from "./api";
import { Icon } from "./ui";

type Result = { files: { slot: string; points: string; path: string; bytes: number }[]; checks: { ok: boolean; text: string }[] };
const ICON: Record<string, string> = { "Output file": "data_object", "Spec document": "description", "Your code (.zip)": "folder_zip" };

export default function Submission({ body, disabled }: { body: { spec_id: string } | { source: "scorer" }; disabled?: boolean }) {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setError("");
    try { setResult(await call<Result>("/submission", { method: "POST", body: JSON.stringify(body) })); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function get(path: string) {
    const name = path.replace(/\\/g, "/").split("/").pop()!;
    try { await download(`/submission/files/${encodeURIComponent(name)}`, name); } catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="min-w-0">
      <button className="btn-primary w-full justify-center" disabled={disabled || busy} onClick={save}>
        <Icon name="inventory_2" />{busy ? "Saving..." : result ? "Save again" : "Save submission files"}
      </button>
      {error && <p className="text-error text-body-sm mt-2 break-words">{error}</p>}
      {result && (
        <>
          <div className="mt-4 flex flex-col gap-2">
            {result.files.map((f) => (
              <div key={f.path} className="flex items-center gap-3 rounded-lg border border-outline-variant bg-surface-container-high p-3 min-w-0">
                <div className="w-9 h-9 shrink-0 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center text-primary"><Icon name={ICON[f.slot] ?? "draft"} /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-label-lg text-white flex items-center gap-2 flex-wrap">{f.slot}<span className="chip !py-0">{f.points === "final run" ? "final run" : `${f.points} pts`}</span></p>
                  <p className="font-mono text-label-md text-on-surface-variant truncate" title={f.path}>{f.path.replace(/\\/g, "/")} · {(f.bytes / 1024).toFixed(1)} KB</p>
                </div>
                <button className="btn h-8 shrink-0" onClick={() => get(f.path)} aria-label={`Download ${f.slot}`}><Icon name="download" />Download</button>
              </div>
            ))}
          </div>
          <ul className="mt-4 space-y-1.5">{result.checks.map((c, i) => (
            <li key={i} className={`text-body-sm flex items-start gap-1.5 ${c.ok ? "text-tertiary" : "text-error"}`}><Icon name={c.ok ? "check_circle" : "cancel"} className="text-[16px] mt-0.5 shrink-0" /><span>{c.text}</span></li>
          ))}</ul>
          <div className="mt-4 rounded-lg border border-outline-variant p-3 text-body-sm text-on-surface-variant">
            <p className="text-label-sm uppercase tracking-wider text-on-surface mb-1">On the portal's Submit page</p>
            Put <b className="text-on-surface">specforge_output.json</b> in Output file and <b className="text-on-surface">spec.html</b> in Spec document,
            or upload only <b className="text-on-surface">specforge.zip</b> (it already has outputs/ inside).
          </div>
        </>
      )}
    </div>
  );
}
