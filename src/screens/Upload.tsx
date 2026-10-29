// Step 1: upload the existing spec (+ optional blueprint), generate a Draft, or run the scorer's call directly.
import { useEffect, useRef, useState } from "react";
import { call } from "../api";
import Submission from "../Submission";
import { CardHead, Icon, PageHead, type Spec, type User } from "../ui";

type Props = { me: User | null; busy: boolean; current: Spec | null; run: (label: string, fn: () => Promise<void>) => Promise<void>; open: (id: string, step?: number) => void; onSettings: () => void };

function Drop({ label, sub, icon, required, file, setFile }: { label: string; sub: string; icon: string; required?: boolean; file: File | null; setFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="card flex flex-col">
      <CardHead icon={icon} title={label} sub={sub} right={<span className={`chip ${required ? "!bg-primary-container text-white" : ""}`}>{required ? "Required" : "Optional"}</span>} />
      <div onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
        className={`flex-grow rounded-lg bg-surface-container-high p-4 min-h-[170px] border border-dashed cursor-pointer flex flex-col justify-between ${over ? "border-primary" : "border-outline-variant"}`}>
        {file ? (
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-container border border-outline-variant flex items-center justify-center text-primary"><Icon name="article" /></div>
              <div>
                <div className="flex items-center gap-2"><span className="text-label-lg text-white break-all">{file.name}</span><span className="px-1.5 rounded text-[10px] font-mono font-bold bg-secondary-fixed text-primary">READY</span></div>
                <span className="font-mono text-label-md text-on-surface-variant">{(file.size / 1024).toFixed(0)} KB</span>
              </div>
            </div>
            <button className="w-7 h-7 flex items-center justify-center rounded-md text-outline hover:text-error" aria-label="Remove file" onClick={(e) => { e.stopPropagation(); setFile(null); if (input.current) input.current.value = ""; }}><Icon name="delete" /></button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Icon name="upload_file" className="text-[32px] text-outline mb-2" />
            <p className="text-label-md text-primary">Drop the file here, or click to browse</p>
          </div>
        )}
        <p className="mt-4 pt-3 border-t border-outline-variant text-body-sm text-outline">Supported: .docx, .doc, .pdf, .html</p>
      </div>
      <input ref={input} type="file" hidden accept=".docx,.doc,.pdf,.html,.htm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

export default function Upload({ me, busy, current, run, open, onSettings }: Props) {
  const [spec, setSpec] = useState<File | null>(null);
  const [blueprint, setBlueprint] = useState<File | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [scorer, setScorer] = useState<any>(null);
  const refresh = () => call<any[]>("/specs").then(setList).catch(() => {});
  useEffect(() => { refresh(); }, [me?.email, current?.id, current?.status]);

  const form = () => { const f = new FormData(); f.append("spec", spec!); if (blueprint) f.append("blueprint", blueprint); return f; };
  const generate = () => run("Generating the corrected spec (about 1-3 minutes)", async () => { const s = await call<Spec>("/specs", { method: "POST", body: form() }); refresh(); open(s.id); });
  const scorerRun = () => run("Running POST /api/v1/generate exactly like the scorer", async () => setScorer(await call("/generate", { method: "POST", body: form() })));

  return (
    <>
      <PageHead stage="01" label="New Specification Run" title="Upload Course Materials for Specification Correction" />
      <p className="text-body-md text-on-surface-variant -mt-4 mb-6 max-w-3xl">SpecForge reads the existing course specification, takes the Course Outcomes and units from the question-paper blueprint, rebuilds the CO-PO-PSO map and reports every defect it finds.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Drop label="Course Specification" sub="Existing spec: summary, credits, COs, syllabus, map, assessment" icon="description" required file={spec} setFile={setSpec} />
        <Drop label="Question-Paper Blueprint" sub="Source of truth for the Course Outcomes and units" icon="quiz" file={blueprint} setFile={setBlueprint} />
      </div>
      <div className="card mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary h-11 px-6" disabled={!spec || busy || me?.role !== "author"} onClick={generate}><Icon name="auto_fix_high" />Generate Corrected Spec</button>
          <button className="btn h-11" disabled={!spec || busy} onClick={scorerRun}><Icon name="science" />Test scorer call (POST /generate)</button>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-high rounded-lg border border-outline-variant text-body-sm text-on-surface-variant">
          <Icon name="vpn_key" className="text-primary" />{me?.role !== "author" ? "Only the Author can generate. " : ""}Your AI key is set in <button className="text-primary underline" onClick={onSettings}>Settings</button>
        </div>
      </div>

      {scorer && (
        <div className="card mt-6">
          <CardHead icon="task_alt" title="Scorer call succeeded" sub={`${scorer.output.course_outcomes.length} COs, ${scorer.output.units.length} units, ${scorer.output.defects.length} defects, template ${scorer.output.template}, input_id ${scorer.output.input_id}`} />
          <Submission body={{ source: "scorer" }} disabled={me?.role !== "author"} />
        </div>
      )}

      <div className="card mt-6">
        <CardHead icon="folder_open" title="Specification runs" sub="Open a spec to review, map, check, approve and export it" />
        {list.length === 0 ? <p className="text-body-md text-on-surface-variant">No runs yet.</p> : (
          <table className="tbl"><thead><tr><th>Code</th><th>Title</th><th>Status</th><th>Defects</th><th>Updated</th><th /></tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id}><td className="font-mono text-primary">{s.code}</td><td>{s.title}</td><td><span className="chip">{s.status}</span></td><td>{s.defects}</td>
                <td className="text-on-surface-variant">{new Date(s.updated_at).toLocaleString()}</td><td><button className="btn h-8" onClick={() => open(s.id)}>Open</button></td></tr>
            ))}</tbody></table>
        )}
      </div>
    </>
  );
}
