// Step 1: upload the existing course specification (and the blueprint, if there is one), then generate a corrected draft.
import { useEffect, useRef, useState } from "react";
import { call } from "../api";
import { CardHead, Icon, PageHead, type Spec, type User } from "../ui";

type Props = { me: User | null; busy: boolean; current: Spec | null; run: (label: string, fn: () => Promise<void>) => Promise<void>; open: (id: string, step?: number) => void; onSettings: () => void };

function Drop({ label, sub, icon, required, file, setFile }: { label: string; sub: string; icon: string; required?: boolean; file: File | null; setFile: (f: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div className="card flex flex-col">
      <CardHead icon={icon} title={label} sub={sub} right={<span className="text-label-sm text-on-surface-variant">{required ? "Required" : "Optional"}</span>} />
      <div onClick={() => input.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]); }}
        className={`flex-grow rounded-lg bg-surface-container-high p-4 min-h-[150px] border border-dashed cursor-pointer flex flex-col justify-between ${over ? "border-primary" : "border-outline-variant"}`}>
        {file ? (
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <Icon name="article" className="text-primary mt-0.5" />
              <div className="min-w-0">
                <p className="text-label-lg text-white break-all">{file.name}</p>
                <p className="text-body-sm text-on-surface-variant">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
            </div>
            <button className="text-body-sm text-on-surface-variant hover:text-error" onClick={(e) => { e.stopPropagation(); setFile(null); if (input.current) input.current.value = ""; }}>Remove</button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <Icon name="upload_file" className="text-[28px] text-outline mb-2" />
            <p className="text-body-md text-on-surface">Drop the file here or <span className="text-primary">browse</span></p>
          </div>
        )}
        <p className="mt-4 pt-3 border-t border-outline-variant text-body-sm text-outline">Word (.docx, .doc), PDF, HTML or plain text</p>
      </div>
      <input ref={input} type="file" hidden accept=".docx,.doc,.pdf,.html,.htm,.md,.txt" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
    </div>
  );
}

export default function Upload({ me, busy, current, run, open, onSettings }: Props) {
  const [spec, setSpec] = useState<File | null>(null);
  const [blueprint, setBlueprint] = useState<File | null>(null);
  const [list, setList] = useState<any[]>([]);
  const refresh = () => call<any[]>("/specs").then(setList).catch(() => {});
  useEffect(() => { refresh(); }, [me?.email, current?.id, current?.status]);

  const generate = () => run("Preparing the corrected specification. This takes a minute or two", async () => {
    const form = new FormData();
    form.append("spec", spec!);
    if (blueprint) form.append("blueprint", blueprint);
    const s = await call<Spec>("/specs", { method: "POST", body: form });
    refresh();
    open(s.id);
  });
  const author = me?.role === "author";

  return (
    <>
      <PageHead title="New course specification" sub="Upload the current course specification. If you have the question-paper blueprint, add it too: the course outcomes and units are taken from it." />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Drop label="Course specification" sub="The existing document to be corrected" icon="description" required file={spec} setFile={setSpec} />
        <Drop label="Question-paper blueprint" sub="Course outcomes and unit-wise syllabus" icon="quiz" file={blueprint} setFile={setBlueprint} />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button className="btn-primary h-11 px-6" disabled={!spec || busy || !author} onClick={generate}>Generate corrected specification</button>
        <p className="text-body-sm text-on-surface-variant">
          {author ? "Uses the AI provider set in " : "Only the Author can start a new specification. AI provider: "}
          <button className="text-primary underline" onClick={onSettings}>Settings</button>
        </p>
      </div>

      <div className="card mt-8">
        <CardHead icon="folder_open" title="Course specifications" sub="Open one to review, correct, approve or export it" />
        {list.length === 0 ? <p className="text-body-md text-on-surface-variant">None yet.</p> : (
          <table className="tbl"><thead><tr><th>Code</th><th>Title</th><th>Status</th><th>Issues found</th><th>Last updated</th><th /></tr></thead>
            <tbody>{list.map((s) => (
              <tr key={s.id}><td className="font-mono text-primary">{s.code}</td><td>{s.title}</td><td>{s.status}</td><td>{s.defects}</td>
                <td className="text-on-surface-variant">{new Date(s.updated_at).toLocaleString()}</td><td><button className="btn h-8" onClick={() => open(s.id)}>Open</button></td></tr>
            ))}</tbody></table>
        )}
      </div>
    </>
  );
}
