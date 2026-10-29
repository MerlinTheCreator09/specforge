// Step 3: the CO-PO-PSO matrix. Cells coloured by strength, justification on hover/select, Author can edit.
import { useEffect, useState } from "react";
import { call } from "../api";
import { CardHead, cellStyle, Empty, Icon, PageHead, type Act, type Cell } from "../ui";

type Reference = { pos: { id: string; title: string; statement: string }[]; psos: { id: string; statement: string }[]; blooms: { level: string; name: string; verbs: string }[] };

export default function MapScreen({ spec, patch, go }: Act) {
  const [ref, setRef] = useState<Record<string, string>>({});
  const [sel, setSel] = useState<{ co: string; col: string } | null>(null);
  const [showOld, setShowOld] = useState(false);
  const [annex, setAnnex] = useState<Reference | null>(null);
  const [drawer, setDrawer] = useState(false);
  // Columns, statements and Bloom's levels all come from config/po_pso.json (Annexure A) via the API.
  useEffect(() => {
    call<Reference>("/reference").then((r) => { setAnnex(r); setRef(Object.fromEntries([...r.pos.map((p) => [p.id, `${p.title}: ${p.statement}`]), ...r.psos.map((p) => [p.id, p.statement])])); }).catch(() => {});
  }, []);
  const COLUMNS = annex ? [...annex.pos.map((p) => p.id), ...annex.psos.map((p) => p.id)] : [];
  if (!spec) return <Empty go={go} />;
  const m = spec.model;
  const map = m.map as Record<string, Record<string, Cell>>;

  const setCell = (co: string, col: string, v: string) => {
    const next = structuredClone(map);
    if (!v) delete next[co][col];
    else next[co][col] = { level: Number(v) as 1 | 2 | 3, justification: next[co][col]?.justification || "Set by the Author." };
    patch({ map: next });
  };
  const selCell = sel ? map[sel.co]?.[sel.col] : undefined;
  const filled = Object.values(map).reduce((a, r) => a + Object.keys(r).length, 0);
  const old = spec.original.old_map;

  return (
    <>
      <PageHead title="CO-PO-PSO map" sub="How strongly each course outcome supports each programme outcome. Select a cell to see the reason.">
        <div className="flex gap-2 items-center text-label-sm flex-wrap">
          <button className="btn h-8" onClick={() => setDrawer(!drawer)}><Icon name="menu_book" />PO / PSO reference</button>
          <span className="chip"><span className="w-3 h-3 rounded-sm bg-primary-container" />3 very strong</span>
          <span className="chip"><span className="w-3 h-3 rounded-sm bg-[#5b3fb5]" />2 strong</span>
          <span className="chip"><span className="w-3 h-3 rounded-sm bg-secondary-fixed" />1 moderate</span>
        </div>
      </PageHead>
      {drawer && annex && (
        <div className="fixed right-0 top-14 bottom-0 w-[380px] max-w-full bg-surface-container border-l border-outline-variant z-40 overflow-y-auto p-5">
          <div className="flex items-center justify-between mb-3"><h2 className="text-headline-sm">Annexure A: POs, PSOs, Bloom's</h2><button className="btn h-8" onClick={() => setDrawer(false)} aria-label="Close reference"><Icon name="close" /></button></div>
          {annex.pos.map((p) => <p key={p.id} className="text-body-sm mb-2"><span className="font-mono text-primary">{p.id}</span> <b>{p.title}.</b> <span className="text-on-surface-variant">{p.statement}</span></p>)}
          {annex.psos.map((p) => <p key={p.id} className="text-body-sm mb-2"><span className="font-mono text-tertiary">{p.id}</span> <span className="text-on-surface-variant">{p.statement}</span></p>)}
          <p className="text-label-sm uppercase tracking-wider text-on-surface-variant mt-4 mb-2">Bloom's levels</p>
          {annex.blooms.map((b) => <p key={b.level} className="text-body-sm mb-1"><span className="font-mono text-primary">{b.level}</span> <b>{b.name}:</b> <span className="text-on-surface-variant">{b.verbs}</span></p>)}
        </div>
      )}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <div className="card overflow-x-auto">
          <CardHead icon="grid_on" title="Map" sub={`${filled} links across ${m.course_outcomes.length} course outcomes`}
            right={<button className="btn h-8" onClick={() => setShowOld(!showOld)}>{showOld ? "Hide" : "Show"} original map</button>} />
          <table className="w-full text-center border-collapse">
            <thead><tr><th className="p-2 text-left text-label-sm text-on-surface-variant">CO</th><th className="p-2 text-label-sm text-on-surface-variant">Bloom</th>
              {COLUMNS.map((c) => <th key={c} title={ref[c]} className={`p-2 text-label-sm font-mono cursor-help ${c.startsWith("PSO") ? "text-tertiary" : "text-on-surface-variant"}`}>{c}</th>)}</tr></thead>
            <tbody>{m.course_outcomes.map((co: any) => (
              <tr key={co.id} className="border-t border-outline-variant">
                <th className="p-2 text-left font-mono text-primary text-label-lg" title={co.statement}>{co.id}</th>
                <td className="p-1"><span className="chip">L{co.bloom_level}</span></td>
                {COLUMNS.map((col) => {
                  const cell = map[co.id]?.[col];
                  const active = sel?.co === co.id && sel?.col === col;
                  return (
                    <td key={col} className="p-0.5">
                      <div onClick={() => setSel({ co: co.id, col })} title={cell?.justification ?? "No link"}
                        className={`h-9 min-w-[38px] rounded-md flex items-center justify-center font-mono text-label-lg cursor-pointer ${cellStyle(cell?.level)} ${active ? "ring-2 ring-primary" : "border border-outline-variant"}`}>
                        {cell?.level ?? "·"}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
          {showOld && (
            <div className="mt-6">
              <p className="text-label-sm uppercase tracking-wider text-on-surface-variant mb-2">Map in the uploaded specification (for comparison)</p>
              <table className="tbl text-center"><thead><tr><th>CO</th>{old.columns.map((c: string) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{old.rows.map((r: any) => <tr key={r.co}><td className="font-mono">{r.co}</td>{r.values.map((v: any, i: number) => <td key={i}>{v ?? ""}</td>)}</tr>)}</tbody></table>
            </div>
          )}
        </div>

        <div className="card h-fit">
          <CardHead icon="info" title={sel ? `${sel.co} → ${sel.col}` : "Cell details"} sub={sel ? undefined : "Select a cell to see its justification"} />
          {sel && (
            <>
              <p className="text-body-sm text-on-surface-variant mb-2">{m.course_outcomes.find((c: any) => c.id === sel.co)?.statement}</p>
              <p className="text-body-sm text-outline mb-4">{ref[sel.col]}</p>
              <p className="text-label-sm uppercase tracking-wider text-on-surface-variant">Strength</p>
              {spec.can_edit ? (
                <div className="flex gap-1 my-2">{["", "1", "2", "3"].map((v) => (
                  <button key={v} onClick={() => setCell(sel.co, sel.col, v)} className={`flex-1 h-9 rounded-md font-mono ${String(selCell?.level ?? "") === v ? "ring-2 ring-primary" : ""} ${cellStyle(Number(v))} border border-outline-variant`}>{v || "—"}</button>
                ))}</div>
              ) : <p className="text-headline-md font-mono my-2">{selCell?.level ?? "—"}</p>}
              <p className="text-label-sm uppercase tracking-wider text-on-surface-variant mt-3">Justification</p>
              <p className="text-body-md mt-1">{selCell?.justification ?? "No link between this CO and outcome."}</p>
              {!spec.can_edit && <p className="text-body-sm text-outline mt-4 flex items-center gap-1"><Icon name="lock" />Only the Author can edit, in Draft or Returned.</p>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
