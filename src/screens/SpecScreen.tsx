// Step 2: the corrected specification, section by section, with the template choice and Author edits.
import { useEffect, useState, type ReactNode } from "react";
import { CardHead, Empty, Icon, PageHead, type Act } from "../ui";

function Section({ n, title, children, open = false }: { n: number; title: string; children: ReactNode; open?: boolean }) {
  const [show, setShow] = useState(open);
  return (
    <div className="card !p-0 overflow-hidden">
      <button className="w-full flex items-center justify-between p-4 text-left hover:bg-surface-container-high" onClick={() => setShow(!show)} aria-expanded={show}>
        <span className="flex items-center gap-2 text-headline-sm"><span className="font-mono text-primary text-label-lg">{n}.</span>{title}</span>
        <Icon name={show ? "expand_less" : "expand_more"} className="text-on-surface-variant" />
      </button>
      {show && <div className="px-4 pb-4 border-t border-outline-variant pt-4 text-body-md">{children}</div>}
    </div>
  );
}

export default function SpecScreen({ spec, patch, post, go }: Act) {
  const m = spec?.model;
  const [tab, setTab] = useState<"corrected" | "original">("corrected");
  const [summary, setSummary] = useState("");
  const [cos, setCos] = useState<string[]>([]);
  const [tpl, setTpl] = useState("integrated");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (!m) return;
    setSummary(m.summary); setCos(m.course_outcomes.map((c: any) => c.statement)); setTpl(m.template); setReason(m.template_override_reason ?? "");
  }, [spec?.id, spec?.version]);
  if (!spec) return <Empty go={go} />;
  const edit = spec.can_edit;
  const t = m.teaching;

  return (
    <>
      <PageHead stage="02" label="Corrected Specification" title={`${m.header.code} ${m.header.title}`}>
        {!edit && <span className="chip"><Icon name="lock" />Read-only for this role or status</span>}
      </PageHead>

      <div className="card mb-6">
        <CardHead icon="dashboard_customize" title={`Template: ${m.template === "integrated" ? "Integrated (theory + lab)" : "Non-Lab"}`}
          sub={`Detected ${m.template_detected === "integrated" ? "Integrated" : "Non-Lab"} from: ${m.template_signals.join("; ")}`}
          right={m.template !== m.template_detected ? <span className="chip text-warning">Overridden</span> : <span className="chip text-tertiary">Auto-detected</span>} />
        {m.template_override_reason && <p className="text-body-sm text-on-surface-variant mb-3">Override reason: {m.template_override_reason}</p>}
        {edit && (
          <div className="flex flex-wrap gap-3">
            <select className="input" value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Template"><option value="integrated">Integrated</option><option value="non_lab">Non-Lab</option></select>
            <input className="input flex-1 min-w-[220px]" placeholder="Reason (required to override)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn" onClick={() => post(`/specs/${spec.id}/template`, { template: tpl, reason })}>Apply template</button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="card !p-0">
          <div className="p-4 text-headline-sm"><span className="text-primary font-mono text-label-lg">Header</span></div>
          <table className="tbl"><tbody>
            {[["Course Title", m.header.title], ["Course Code", m.header.code], ["Course Type", m.header.course_type], ["Department", m.header.department], ["Faculty", m.header.faculty]].map(([k, v]) => <tr key={k}><td className="w-1/3 text-on-surface-variant">{k}</td><td>{v}</td></tr>)}
          </tbody></table>
        </div>

        <Section n={1} title="Course Summary" open>
          <div className="flex gap-1 mb-3">
            {(["corrected", "original"] as const).map((k) => <button key={k} className={`px-3 py-1.5 rounded-lg text-label-sm ${tab === k ? "bg-primary-container text-white" : "text-on-surface-variant border border-outline-variant"}`} onClick={() => setTab(k)}>{k === "corrected" ? "Corrected (SpecForge)" : "Original upload"}</button>)}
          </div>
          {tab === "original" ? <p className="text-on-surface-variant">{spec.original.summary}</p> : edit ? (
            <><textarea className="input w-full" rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} />
              <button className="btn mt-2" onClick={() => patch({ summary })}><Icon name="save" />Save summary</button></>
          ) : <p>{m.summary}</p>}
        </Section>

        <Section n={2} title="Course Size and Credits">
          <table className="tbl"><tbody>
            {[["Number of Credits", m.credits.number_of_credits], ["Credit Structure (L:T:P)", m.credits.ltp], ["Total Hours of Interaction", m.credits.total_hours_of_interaction], ["Weeks in a Semester", m.credits.weeks], ["Department Responsible", m.credits.department_responsible], ["Total Course Marks", m.credits.total_course_marks], ["Pass Criterion", m.credits.pass_criterion], ["Attendance Requirement", m.credits.attendance_requirement]].map(([k, v]) => <tr key={String(k)}><td className="w-1/3 text-on-surface-variant">{k}</td><td className="font-mono">{v ?? "-"}</td></tr>)}
          </tbody></table>
        </Section>

        <Section n={3} title="Course Outcomes (COs)" open>
          <table className="tbl"><thead><tr><th>CO</th><th>Statement</th><th>Bloom</th></tr></thead><tbody>
            {m.course_outcomes.map((c: any, i: number) => (
              <tr key={c.id}><td className="font-mono text-primary">{c.id}</td>
                <td>{edit ? <input className="input w-full" value={cos[i] ?? ""} onChange={(e) => setCos(cos.map((x, j) => (j === i ? e.target.value : x)))} /> : c.statement}</td>
                <td><span className="chip">L{c.bloom_level}</span></td></tr>
            ))}
          </tbody></table>
          {edit && <button className="btn mt-3" onClick={() => patch({ course_outcomes: m.course_outcomes.map((c: any, i: number) => ({ ...c, statement: cos[i], bloom_level: cos[i] === c.statement ? c.bloom_level : 0 })) })}><Icon name="save" />Save COs</button>}
        </Section>

        <Section n={4} title="Course Contents">
          {m.units.map((u: any) => (
            <div key={u.number} className="mb-3">
              <p><span className="font-semibold text-primary">Unit {u.number}: {u.title}</span> <span className="text-on-surface-variant">{u.content}</span></p>
              {m.template === "integrated" && u.lab && <p className="text-body-sm mt-1"><span className="text-tertiary">Lab Exercises:</span> {u.lab}</p>}
            </div>
          ))}
        </Section>

        <Section n={5} title="Course Map (CO-PO-PSO)"><button className="btn" onClick={() => go(2)}><Icon name="grid_on" />Open the mapping matrix</button></Section>

        <Section n={6} title="Teaching and Learning Methods">
          <table className="tbl"><tbody>
            <tr><td>Face to Face Lectures</td><td className="font-mono">{t.lectures ?? 0}</td></tr>
            <tr><td>Practical work (laboratory)</td><td className="font-mono">{Object.values(t.practicals).reduce((a: number, b: any) => a + (b ?? 0), 0)}</td></tr>
            <tr><td>{t.tests_exams_label || "Tests and examinations"}</td><td className="font-mono">{t.tests_exams ?? 0}</td></tr>
            <tr><td className="font-semibold">Total Duration in Hours (recomputed)</td><td className="font-mono font-semibold text-primary">{m.teaching_total}</td></tr>
          </tbody></table>
        </Section>

        <Section n={7} title="Assessment and Reassessment">
          <table className="tbl"><thead><tr><th>CO</th>{m.assessment.groups.flatMap((g: any) => g.components.map((c: any) => <th key={g.name + c.name}>{g.name}: {c.name}<br /><span className="font-mono normal-case">{c.weight_percent ?? "-"}%</span></th>))}</tr></thead>
            <tbody>{m.course_outcomes.map((co: any) => <tr key={co.id}><td className="font-mono text-primary">{co.id}</td>{m.assessment.groups.flatMap((g: any) => g.components.map((c: any) => <td key={g.name + c.name} className="text-center">{m.assessment.coverage[co.id]?.includes(c.name) ? "X" : ""}</td>))}</tr>)}</tbody></table>
        </Section>

        <Section n={8} title="Achieving COs">
          <table className="tbl"><tbody>{m.achieving.map((a: any, i: number) => <tr key={i}><td className="w-8 text-on-surface-variant">{i + 1}.</td><td>{a.skill}</td><td className="text-on-surface-variant">{a.how}</td></tr>)}</tbody></table>
        </Section>

        <Section n={9} title="Course Resources">
          {(["essential", "recommended", "magazines", "websites", "other"] as const).map((k) => m.resources[k].length > 0 && (
            <div key={k} className="mb-3"><p className="text-label-sm uppercase tracking-wider text-on-surface-variant mb-1">{k}</p><ol className="list-decimal pl-5">{m.resources[k].map((r: string, i: number) => <li key={i}>{r}</li>)}</ol></div>
          ))}
        </Section>
      </div>
    </>
  );
}
