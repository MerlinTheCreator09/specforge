// validation_report.html: a standalone page listing V1-V10, the defects found in the inputs and the fixes applied.
import type { PipelineResult } from "./pipeline.js";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const DEFECT_SEVERITY: Record<string, "High" | "Medium" | "Low"> = {
  CO_MISSING_IN_TABLE: "High", CO_EXTRA_IN_TABLE: "High", CO_ASSESSMENT_MISMATCH: "High", PSO_COLUMN_MISMATCH: "High",
  MAPPING_BLOOM_MISMATCH: "High", MAPPING_UNSUPPORTED: "High", WRONG_TEMPLATE: "High", PLACEHOLDER_TEXT: "High",
  SUMMARY_SYLLABUS_MISMATCH: "Medium", LABEL_OR_TITLE_MISMATCH: "Medium", HOURS_INCONSISTENT: "Medium",
  WEIGHTAGE_INCONSISTENT: "Medium", MARKS_INCONSISTENT: "Medium", SECTION_NOT_IN_TEMPLATE: "Medium",
  TYPO_OR_FORMAT: "Low", OTHER: "Low",
};

export function defectSeverity(code: string) {
  return DEFECT_SEVERITY[code] ?? "Low";
}

export function renderReport(r: PipelineResult): string {
  const { model, report, output } = r;
  const groups = (["High", "Medium", "Low"] as const).map((sev) => ({ sev, items: output.defects.filter((x) => defectSeverity(x.code) === sev) }));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Validation report</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:960px;margin:24px auto;padding:0 16px;color:#1d1d1f}h1{font-size:22px}h2{font-size:17px;margin-top:28px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left;vertical-align:top}.ok{color:#1b7f3b}.bad{color:#b3261e}
.High{border-left:4px solid #b3261e}.Medium{border-left:4px solid #c77700}.Low{border-left:4px solid #6b7280}</style></head><body>
<h1>Validation report: ${esc(model.header.code)} ${esc(model.header.title)}</h1>
<p>Template: <b>${model.template === "integrated" ? "Integrated (theory + lab)" : "Non-Lab"}</b>${model.template_override_reason ? ` (override: ${esc(model.template_override_reason)})` : ""}. Signals: ${model.template_signals.map(esc).join("; ")}.</p>
<p>Rules passed: <b>${report.summary.passed}</b>, failed: <b>${report.summary.failed}</b>. Defects found in the inputs: <b>${output.defects.length}</b>.</p>
<h2>Rule checks (V1-V10)</h2>
<table><tr><th>Rule</th><th>Severity</th><th>Result</th><th>Details</th></tr>
${report.checks.map((c) => `<tr><td>${esc(c.id)} ${esc(c.rule)}</td><td>${esc(c.severity)}</td><td class="${c.ok ? "ok" : "bad"}">${c.ok ? "Pass" : "Fail"}</td><td>${c.details.map(esc).join("<br>")}</td></tr>`).join("")}
</table>
${groups.map((g) => `<h2>${g.sev} severity defects (${g.items.length})</h2>${g.items.length ? `<table><tr><th>Code</th><th>Where</th><th>Problem</th><th>Fix applied</th></tr>${g.items.map((x) => `<tr class="${g.sev}"><td>${esc(x.code)}</td><td>${esc(x.location.source)}${x.location.section ? `, section ${x.location.section}` : ""}${x.location.refs.length ? `<br>${x.location.refs.map(esc).join(", ")}` : ""}</td><td>${esc(x.description)}</td><td>${esc(x.fix)}</td></tr>`).join("")}</table>` : "<p>None.</p>"}`).join("")}
<h2>Sections not in the template</h2>${report.dropped_sections.length ? `<ul>${report.dropped_sections.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "<p>None.</p>"}
<h2>Changes and conflicts resolved</h2>${report.notes.length ? `<ul>${report.notes.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "<p>None.</p>"}
</body></html>`;
}
