// Test frontend for the backend. One screen per level's checks:
// L0 header/roles/settings, L1 upload, L2 template, L3 map + exports, L4 report, L5 workflow.
import { useEffect, useState } from "react";
import { call, download, saveText, setUser } from "./api";
import Settings from "./Settings";

type User = { email: string; name: string; role: "author" | "reviewer" | "hod" };
type Cell = { level: 1 | 2 | 3; justification: string };
type Spec = any; // full view from GET /specs/:id
const COLUMNS = ["PO-1", "PO-2", "PO-3", "PO-4", "PO-5", "PO-6", "PO-7", "PO-8", "PO-9", "PO-10", "PO-11", "PSO-1", "PSO-2"];
const STATES = ["Draft", "Submitted", "Under Review", "Pending HOD", "Approved"];
const SHADE = ["", "#dbe7fb", "#8fb3ee", "#1a3d7c"];
const SEV: Record<string, string> = { high: "#b3261e", medium: "#c77700", low: "#6b7280" };

export default function App() {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState("checking...");
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [scorer, setScorer] = useState<any>(null);

  useEffect(() => {
    call<{ status: string }>("/health").then((d) => setHealth(d.status)).catch(() => setHealth("server not reachable"));
    call<User[]>("/users").then((u) => { setUsers(u); pick(u[0]); }).catch((e) => setError(e.message));
  }, []);

  function pick(u: User) { setUser(u.email); setMe(u); refreshList(); if (spec) load(spec.id); }
  async function run<T>(label: string, fn: () => Promise<T>) {
    setBusy(label); setError("");
    try { return await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(""); }
  }
  const refreshList = () => call<any[]>("/specs").then(setList).catch(() => {});
  const load = (id: string) => run("Loading", async () => setSpec(await call(`/specs/${id}`)));
  const post = (path: string, body: unknown) => run("Saving", async () => { setSpec(await call(path, { method: "POST", body: JSON.stringify(body) })); refreshList(); });
  const patch = (body: unknown) => run("Saving", async () => setSpec(await call(`/specs/${spec.id}`, { method: "PATCH", body: JSON.stringify(body) })));

  async function upload(e: React.FormEvent<HTMLFormElement>, scorerRoute: boolean) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (!(form.get("blueprint") as File)?.size) form.delete("blueprint");
    await run(scorerRoute ? "Running POST /generate (1-3 min)" : "Generating spec (1-3 min)", async () => {
      if (scorerRoute) setScorer(await call("/generate", { method: "POST", body: form }));
      else { setSpec(await call("/specs", { method: "POST", body: form })); refreshList(); }
    });
  }

  return (
    <>
      <header className="bar">
        <h1>SpecForge - Course Specification Builder</h1>
        <span className="pill">Server: {health}</span>
        <select value={me?.email ?? ""} onChange={(e) => pick(users.find((u) => u.email === e.target.value)!)} aria-label="Role">
          {users.map((u) => <option key={u.email} value={u.email}>{u.role.toUpperCase()} - {u.name}</option>)}
        </select>
        <button className="ghost" onClick={() => setOpen(true)} aria-label="Settings">Settings (gear)</button>
      </header>
      <main>
        {busy && <p className="pill">{busy}...</p>}
        {error && <p className="err">{error}</p>}

        <section className="card">
          <h2>Upload (Author)</h2>
          <form onSubmit={(e) => upload(e, (e.nativeEvent as SubmitEvent).submitter?.getAttribute("name") === "scorer")}>
            <label>Existing course spec (required) <input type="file" name="spec" required accept=".docx,.doc,.pdf,.html" /></label>
            <label>Question-paper blueprint (optional) <input type="file" name="blueprint" accept=".docx,.doc,.pdf,.html" /></label>
            <div className="row">
              <button disabled={!!busy || me?.role !== "author"}>Generate spec (workflow)</button>
              <button name="scorer" disabled={!!busy}>Test POST /generate (scorer call)</button>
            </div>
          </form>
          {scorer && (
            <div className="row">
              <span>Scorer call OK: {scorer.output.course_outcomes.length} COs, {scorer.output.defects.length} defects, template {scorer.output.template}</span>
              <button onClick={() => saveText(JSON.stringify(scorer.output, null, 2), "specforge_output.json")}>Save specforge_output.json</button>
              <button onClick={() => saveText(scorer.html, "spec.html", "text/html")}>Save spec.html</button>
            </div>
          )}
        </section>

        <section className="card">
          <h2>Specs</h2>
          {list.length === 0 ? <p>None yet.</p> : (
            <table><tbody>{list.map((s) => (
              <tr key={s.id}><td>{s.code}</td><td>{s.title}</td><td>{s.status}</td><td>{s.defects} defects</td><td><button onClick={() => load(s.id)}>Open</button></td></tr>
            ))}</tbody></table>
          )}
        </section>

        {spec && <SpecView spec={spec} me={me!} post={post} patch={patch} />}
      </main>
      {open && <Settings onClose={() => setOpen(false)} />}
    </>
  );
}

function SpecView({ spec, me, post, patch }: { spec: Spec; me: User; post: (p: string, b: unknown) => void; patch: (b: unknown) => void }) {
  const m = spec.model;
  const [comment, setComment] = useState("");
  const [section, setSection] = useState("");
  const [tpl, setTpl] = useState(m.template);
  const [reason, setReason] = useState(m.template_override_reason ?? "");
  const [summary, setSummary] = useState(m.summary);
  useEffect(() => { setTpl(m.template); setReason(m.template_override_reason ?? ""); setSummary(m.summary); }, [spec.id, spec.version]);

  const setCell = (co: string, col: string, v: string) => {
    const map = structuredClone(m.map) as Record<string, Record<string, Cell>>;
    if (!v) delete map[co][col];
    else map[co][col] = { level: Number(v) as 1 | 2 | 3, justification: map[co][col]?.justification || "Set by the Author." };
    patch({ map });
  };
  const step = STATES.indexOf(spec.status === "Returned" ? "Draft" : spec.status);

  return (
    <>
      <section className="card">
        <h2>{m.header.code} {m.header.title}</h2>
        <div className="row">{STATES.map((s, i) => <span key={s} className="pill" style={{ background: i <= step ? "#1a3d7c" : "#eee", color: i <= step ? "#fff" : "#333" }}>{s}</span>)}
          {spec.status === "Returned" && <span className="pill" style={{ background: "#b3261e", color: "#fff" }}>Returned</span>}</div>
        <div className="row">
          <input placeholder="Comment (required to return)" value={comment} onChange={(e) => setComment(e.target.value)} style={{ flex: 1 }} />
          {spec.allowed_actions.map((a: string) => <button key={a} onClick={() => { post(`/specs/${spec.id}/transitions`, { action: a, comment }); setComment(""); }}>{a.replace("_", " ")}</button>)}
          {!spec.allowed_actions.length && <span>No actions for {me.role} while {spec.status}.</span>}
        </div>
        <div className="row">
          <button onClick={() => download(`/specs/${spec.id}/export/spec.html`, "spec.html")}>Export spec</button>
          <button onClick={() => download(`/specs/${spec.id}/export/specforge_output.json`, "specforge_output.json")}>Export output</button>
          <button onClick={() => download(`/specs/${spec.id}/export/validation_report.html`, "validation_report.html")}>Validation report</button>
        </div>
      </section>

      <section className="card">
        <h2>Template</h2>
        <p>Detected: <b>{m.template_detected === "integrated" ? "Integrated" : "Non-Lab"}</b>, using <b>{m.template === "integrated" ? "Integrated" : "Non-Lab"}</b>. Signals: {m.template_signals.join("; ")}</p>
        {spec.can_edit && <div className="row">
          <select value={tpl} onChange={(e) => setTpl(e.target.value)}><option value="integrated">Integrated</option><option value="non_lab">Non-Lab</option></select>
          <input placeholder="Reason for override" value={reason} onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} />
          <button onClick={() => post(`/specs/${spec.id}/template`, { template: tpl, reason })}>Apply</button>
        </div>}
      </section>

      <section className="card">
        <h2>Summary and course outcomes</h2>
        <textarea value={summary} onChange={(e) => setSummary(e.target.value)} readOnly={!spec.can_edit} rows={4} style={{ width: "100%" }} />
        {spec.can_edit && <button onClick={() => patch({ summary })}>Save summary</button>}
        <ul>{m.course_outcomes.map((c: any) => <li key={c.id}><b>{c.id}</b> <span className="pill">L{c.bloom_level}</span> {c.statement}</li>)}</ul>
        <ol>{m.units.map((u: any) => <li key={u.number}><b>{u.title}</b>{u.lab ? <em> (lab: {u.lab.slice(0, 80)}...)</em> : null}</li>)}</ol>
      </section>

      <section className="card">
        <h2>CO-PO-PSO map</h2>
        <p>Legend: <span className="pill" style={{ background: SHADE[3], color: "#fff" }}>3 very strong</span> <span className="pill" style={{ background: SHADE[2] }}>2 strong</span> <span className="pill" style={{ background: SHADE[1] }}>1 moderate</span> Hover a cell for its justification.</p>
        <div style={{ overflowX: "auto" }}><table className="map"><thead><tr><th>CO</th>{COLUMNS.map((c) => <th key={c}>{c}</th>)}</tr></thead><tbody>
          {m.course_outcomes.map((co: any) => <tr key={co.id}><th>{co.id}</th>{COLUMNS.map((col) => {
            const cell: Cell | undefined = m.map[co.id]?.[col];
            return <td key={col} title={cell?.justification ?? ""} style={{ background: SHADE[cell?.level ?? 0], color: cell?.level === 3 ? "#fff" : undefined }}>
              {spec.can_edit ? <select value={cell?.level ?? ""} onChange={(e) => setCell(co.id, col, e.target.value)}><option value=""></option><option>1</option><option>2</option><option>3</option></select> : cell?.level ?? ""}
            </td>;
          })}</tr>)}
        </tbody></table></div>
      </section>

      <section className="card">
        <h2>Validation report ({spec.report.summary.passed} passed, {spec.report.summary.failed} failed) and defects ({spec.output.defects.length})</h2>
        <ul>{spec.report.checks.map((c: any) => <li key={c.id} style={{ color: c.ok ? "#1b7f3b" : SEV[c.severity] }}>{c.ok ? "PASS" : "FAIL"} {c.id} {c.rule}{c.details.length ? `: ${c.details.join("; ")}` : ""}</li>)}</ul>
        <table><thead><tr><th>Code</th><th>Where</th><th>Problem</th><th>Fix</th></tr></thead><tbody>
          {spec.output.defects.map((d: any, i: number) => <tr key={i}><td>{d.code}</td><td>{d.location.source} s{d.location.section ?? "-"} {d.location.refs.join(", ")}</td><td>{d.description}</td><td>{d.fix}</td></tr>)}
        </tbody></table>
        {spec.report.notes.length > 0 && <details><summary>Changes and conflicts ({spec.report.notes.length})</summary><ul>{spec.report.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul></details>}
      </section>

      <section className="card">
        <h2>Comments and log</h2>
        <div className="row">
          <select value={section} onChange={(e) => setSection(e.target.value)}><option value="">General</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>Section {n}</option>)}</select>
          <input id="c" placeholder="Add a comment" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) { post(`/specs/${spec.id}/comments`, { section: section ? Number(section) : null, text: e.currentTarget.value }); e.currentTarget.value = ""; } }} />
        </div>
        <ul>{spec.comments.map((c: any) => <li key={c.id}>[{c.section ? `Section ${c.section}` : "General"}] <b>{c.role}</b> {c.text} <small>{new Date(c.at).toLocaleString()}</small></li>)}</ul>
        <table><tbody>{spec.log.map((l: any, i: number) => <tr key={i}><td>{new Date(l.at).toLocaleString()}</td><td>{l.user} ({l.role})</td><td>{l.action}</td><td>{l.from ?? "-"} → {l.to}</td><td>{l.comment}</td></tr>)}</tbody></table>
      </section>

      <section className="card">
        <h2>Preview {spec.status !== "Approved" && "(DRAFT watermark until approved)"}</h2>
        <iframe title="Spec preview" srcDoc={spec.html} sandbox="allow-scripts allow-modals" style={{ width: "100%", height: 800, border: "1px solid #ccc" }} />
      </section>
    </>
  );
}
