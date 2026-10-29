// Step 5: approval workflow. Timeline, the actions this role may take (checked again on the server),
// section comments and the audit trail.
import { useState } from "react";
import { CardHead, Empty, Icon, PageHead, type Act } from "../ui";

const STATES = ["Draft", "Submitted", "Under Review", "Pending HOD", "Approved"];
const LABEL: Record<string, [string, string]> = {
  submit: ["Submit for Review", "send"], start_review: ["Start Review", "rate_review"], forward: ["Forward to HOD", "forward"],
  return: ["Return to Author", "undo"], approve: ["Approve & Seal Specification", "verified"],
};
const SECTIONS = ["Course Summary", "Size and Credits", "Course Outcomes", "Course Contents", "CO-PO-PSO Map", "Teaching and Learning", "Assessment", "Achieving COs", "Resources"];

export default function Workflow({ spec, me, post, go }: Act) {
  const [comment, setComment] = useState("");
  const [note, setNote] = useState("");
  const [section, setSection] = useState("");
  if (!spec) return <Empty go={go} />;
  const at = STATES.indexOf(spec.status);

  return (
    <>
      <PageHead stage="05" label="Governance" title="Course Specification Approval Workflow" />
      <div className="card mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {STATES.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span className={`chip !py-1 ${i < at || spec.status === "Approved" ? "text-tertiary" : i === at ? "!bg-primary-container text-white" : "text-outline"}`}>
                <Icon name={i < at || spec.status === "Approved" ? "check_circle" : i === at ? "radio_button_checked" : "radio_button_unchecked"} className="text-[14px]" />{s}
              </span>
              {i < STATES.length - 1 && <span className="w-6 h-px bg-outline-variant" />}
            </div>
          ))}
          {spec.status === "Returned" && <span className="chip !py-1 text-error"><Icon name="undo" className="text-[14px]" />Returned to Author</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <CardHead icon="admin_panel_settings" title="Role Action Console" sub={`Acting as ${me?.name} (${me?.role.toUpperCase()}). Switch roles in the top bar.`} />
          <textarea className="input w-full mb-3" rows={3} placeholder="Comment (required when returning)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {spec.allowed_actions.map((a: string) => (
              <button key={a} className={a === "return" ? "btn text-error" : "btn-primary"} onClick={async () => { await post(`/specs/${spec.id}/transitions`, { action: a, comment }); setComment(""); }}>
                <Icon name={LABEL[a][1]} />{LABEL[a][0]}
              </button>
            ))}
          </div>
          {spec.allowed_actions.length === 0 && <p className="text-body-sm text-on-surface-variant flex items-center gap-1"><Icon name="lock" />No actions for a {me?.role} while the spec is {spec.status}.</p>}
          <p className="text-body-sm text-outline mt-4">{spec.status === "Approved" ? "Approved: the DRAFT watermark is removed from the exports." : "Until approval, the spec and PDF carry a DRAFT watermark."}</p>
        </div>

        <div className="card">
          <CardHead icon="forum" title="Section comments" sub="Reviewer and HOD remarks; the Author responds here" />
          {spec.status !== "Approved" && (
            <div className="flex gap-2 mb-3">
              <select className="input" value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section"><option value="">General</option>{SECTIONS.map((s, i) => <option key={s} value={i + 1}>{i + 1}. {s}</option>)}</select>
              <input className="input flex-1" placeholder="Add a comment" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn" disabled={!note.trim()} onClick={async () => { await post(`/specs/${spec.id}/comments`, { section: section ? Number(section) : null, text: note }); setNote(""); }}>Post</button>
            </div>
          )}
          <ul className="space-y-2 max-h-72 overflow-y-auto">
            {spec.comments.length === 0 && <li className="text-body-sm text-on-surface-variant">No comments yet.</li>}
            {spec.comments.map((c: any) => (
              <li key={c.id} className="bg-surface-container-high rounded-lg p-3 border border-outline-variant">
                <p className="text-label-sm text-on-surface-variant"><span className="text-primary uppercase">{c.role}</span> · {c.section ? `§${c.section} ${SECTIONS[c.section - 1]}` : "General"} · {new Date(c.at).toLocaleString()}</p>
                <p className="text-body-md mt-1">{c.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <CardHead icon="history" title="Governance History & Audit Trail" sub="Every change with user, role, time and comment" />
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Time</th><th>User</th><th>Role</th><th>Action</th><th>State</th><th>Comment</th></tr></thead>
          <tbody>{[...spec.log].reverse().map((l: any, i: number) => (
            <tr key={i}><td className="font-mono whitespace-nowrap">{new Date(l.at).toLocaleString()}</td><td>{l.user}</td><td className="uppercase text-label-sm text-primary">{l.role}</td>
              <td>{l.action.replace("_", " ")}</td><td className="whitespace-nowrap">{l.from ?? "-"} → {l.to}</td><td className="text-on-surface-variant">{l.comment}</td></tr>
          ))}</tbody></table></div>
      </div>
    </>
  );
}
