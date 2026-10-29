// Saves the three things the portal's Submit page takes into the project's outputs/ folder (no browser downloads).
import { useState } from "react";
import { call } from "./api";
import { Icon } from "./ui";

type Result = { files: { slot: string; points: string; path: string; bytes: number }[]; checks: { ok: boolean; text: string }[] };

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

  return (
    <div>
      <button className="btn-primary" disabled={disabled || busy} onClick={save}><Icon name="inventory_2" />{busy ? "Saving..." : "Save submission files to outputs/"}</button>
      {error && <p className="text-error text-body-sm mt-2">{error}</p>}
      {result && (
        <div className="mt-4">
          <table className="tbl"><thead><tr><th>Submit-page slot</th><th>Points</th><th>File in your project</th><th>Size</th></tr></thead>
            <tbody>{result.files.map((f) => (
              <tr key={f.path}><td>{f.slot}</td><td className="font-mono">{f.points}</td><td className="font-mono text-primary">{f.path.replace(/\\/g, "/")}</td><td className="font-mono">{(f.bytes / 1024).toFixed(1)} KB</td></tr>
            ))}</tbody></table>
          <ul className="mt-3 space-y-1">{result.checks.map((c, i) => (
            <li key={i} className={`text-body-sm flex items-center gap-1.5 ${c.ok ? "text-tertiary" : "text-error"}`}><Icon name={c.ok ? "check_circle" : "cancel"} className="text-[16px]" />{c.text}</li>
          ))}</ul>
          <p className="text-body-sm text-on-surface-variant mt-3">
            On the portal's Submit page: drop <b>specforge_output.json</b> in Output file and <b>spec.html</b> in Spec document,
            or upload just <b>specforge.zip</b> (it already has outputs/ inside). All three are in the project's <span className="font-mono">outputs</span> folder.
          </p>
        </div>
      )}
    </div>
  );
}
