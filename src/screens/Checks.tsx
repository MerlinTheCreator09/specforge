// Step 4: rule checks V1-V10 and the defect log, filterable by severity.
import { useState } from "react";
import { download } from "../api";
import { CardHead, Empty, Icon, PageHead, SEVERITY_COLOR, type Act } from "../ui";

const DEFECT_SEVERITY: Record<string, "high" | "medium" | "low"> = {
  CO_MISSING_IN_TABLE: "high", CO_EXTRA_IN_TABLE: "high", CO_ASSESSMENT_MISMATCH: "high", PSO_COLUMN_MISMATCH: "high",
  MAPPING_BLOOM_MISMATCH: "high", MAPPING_UNSUPPORTED: "high", WRONG_TEMPLATE: "high", PLACEHOLDER_TEXT: "high",
  SUMMARY_SYLLABUS_MISMATCH: "medium", LABEL_OR_TITLE_MISMATCH: "medium", HOURS_INCONSISTENT: "medium", WEIGHTAGE_INCONSISTENT: "medium",
  MARKS_INCONSISTENT: "medium", SECTION_NOT_IN_TEMPLATE: "medium", TYPO_OR_FORMAT: "low", OTHER: "low",
};

export default function Checks({ spec, go }: Act) {
  const [filter, setFilter] = useState<"all" | "high" | "medium" | "low">("all");
  if (!spec) return <Empty go={go} />;
  const { report, output } = spec;
  const defects = output.defects.filter((d: any) => filter === "all" || DEFECT_SEVERITY[d.code] === filter);
  const count = (s: string) => output.defects.filter((d: any) => DEFECT_SEVERITY[d.code] === s).length;

  return (
    <>
      <PageHead title="Checks and issues" sub="Rule checks on the corrected specification, and the problems found in the uploaded documents.">
        <button className="btn" onClick={() => download(`/specs/${spec.id}/export/validation_report.html`, "validation_report.html")}><Icon name="download" />Validation report</button>
      </PageHead>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[["Rules passed", report.summary.passed, "text-tertiary"], ["Rules failed", report.summary.failed, report.summary.failed ? "text-error" : "text-tertiary"], ["Issues found", output.defects.length, "text-primary"], ["High severity", count("high"), "text-error"]].map(([k, v, c]) => (
          <div key={String(k)} className="card !p-4"><p className="text-label-sm uppercase tracking-wider text-on-surface-variant">{k}</p><p className={`text-headline-lg font-mono ${c}`}>{v}</p></div>
        ))}
      </div>

      <div className="card mb-6">
        <CardHead icon="rule" title="Rule checks" sub="Re-run after every change" />
        <ul className="divide-y divide-outline-variant">
          {report.checks.map((c: any) => (
            <li key={c.id} className="py-2 flex items-start gap-3">
              <Icon name={c.ok ? "check_circle" : "cancel"} className={c.ok ? "text-tertiary" : SEVERITY_COLOR[c.severity]} />
              <div><p className="text-body-md">{c.rule}</p>
                {c.details.map((d: string, i: number) => <p key={i} className="text-body-sm text-on-surface-variant">{d}</p>)}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card mb-6">
        <CardHead icon="bug_report" title="Issues in the uploaded documents" sub="Each one with where it was found and how it was fixed"
          right={<div className="flex gap-1">{(["all", "high", "medium", "low"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-2.5 py-1 rounded-md text-[11px] font-semibold ${filter === f ? "bg-primary text-on-primary" : "text-on-surface-variant border border-outline-variant"}`}>{f[0].toUpperCase() + f.slice(1)} ({f === "all" ? output.defects.length : count(f)})</button>
          ))}</div>} />
        <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Severity</th><th>Code</th><th>Where</th><th>Problem</th><th>Fix applied</th></tr></thead>
          <tbody>{defects.map((d: any, i: number) => (
            <tr key={i}><td className={`uppercase text-label-sm ${SEVERITY_COLOR[DEFECT_SEVERITY[d.code]]}`}>{DEFECT_SEVERITY[d.code]}</td><td className="font-mono text-label-md">{d.code}</td>
              <td className="whitespace-nowrap">{d.location.source}{d.location.section ? ` · §${d.location.section}` : ""}<br /><span className="text-on-surface-variant font-mono">{d.location.refs.join(", ")}</span></td>
              <td>{d.description}</td><td className="text-on-surface-variant">{d.fix}</td></tr>
          ))}</tbody></table></div>
      </div>

      {(report.notes.length > 0 || report.dropped_sections.length > 0) && (
        <div className="card">
          <CardHead icon="sync_alt" title="Changes and conflicts resolved" sub="What Curricula changed and why" />
          {report.dropped_sections.length > 0 && <p className="text-body-md mb-2">Sections not in the template (left out): <span className="text-warning">{report.dropped_sections.join(", ")}</span></p>}
          <ul className="list-disc pl-5 text-body-sm text-on-surface-variant space-y-1">{report.notes.map((n: string, i: number) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </>
  );
}
