// Plain-code checks (no AI). Two jobs:
//  1. findInputDefects: real problems in the uploaded documents -> defects[] in the output file.
//  2. validateModel: rules V1-V10 on the corrected spec -> the validation report.
import { bloomCeiling, COLUMNS, poPso, rules } from "./config.js";
import { isPracticalComponent, normaliseCoId, norm, teachingTotal, type CourseModel } from "./model.js";
import type { Defect, ParsedBlueprint, ParsedSpec } from "./schemas.js";
import { SAMPLE_STRINGS, SAMPLE_TOKENS, detectTemplate } from "./template.js";
import type { MapFix } from "./mapper.js";

const d = (code: Defect["code"], source: Defect["location"]["source"], section: number | null, refs: string[], description: string, fix: string): Defect =>
  ({ code, location: { source, section, refs }, description, fix });

const near = (a: number, b: number) => Math.abs(a - b) < 0.51;

export function findInputDefects(spec: ParsedSpec, bp: ParsedBlueprint | null, model: CourseModel, specText: string): Defect[] {
  const out: Defect[] = [];
  const defined = new Set(model.course_outcomes.map((c) => c.id));
  const psos = new Set(poPso.psos.map((p) => p.id));

  // ----- Section 5: the old CO-PO-PSO map -----
  const oldCols = spec.old_map.columns.map((c) => c.replace(/\s+/g, "").toUpperCase());
  for (const col of oldCols) {
    if (/^PSO-?\d+$/.test(col) && !psos.has(col.replace(/^PSO-?/, "PSO-"))) {
      out.push(d("PSO_COLUMN_MISMATCH", "spec", 5, [col.replace(/^PSO-?/, "PSO-")], `The CO-PO-PSO map has a ${col} column, but the programme only defines ${[...psos].join(" and ")}.`, `Removed the ${col} column; the map uses ${[...psos].join(" and ")} only.`));
    }
  }
  const oldRows = new Map<string, (number | null)[]>();
  for (const r of spec.old_map.rows) { const id = normaliseCoId(r.co); if (id) oldRows.set(id, r.values); }
  if (oldRows.size) {
    for (const id of defined) if (!oldRows.has(id)) out.push(d("CO_MISSING_IN_TABLE", "spec", 5, [id], `${id} is a course outcome but has no row in the CO-PO-PSO map.`, `Added a ${id} row to the regenerated map.`));
    for (const id of oldRows.keys()) if (!defined.has(id)) out.push(d("CO_EXTRA_IN_TABLE", "spec", 5, [id], `The CO-PO-PSO map has a row for ${id}, which is not a defined course outcome.`, `Removed the ${id} row.`));
  }
  for (const co of model.course_outcomes) {
    const values = oldRows.get(co.id);
    if (!values) continue;
    const overBloom: string[] = [];
    const unsupported: string[] = [];
    oldCols.forEach((col, i) => {
      const v = values[i];
      if (v == null || v === 0 || !COLUMNS.includes(col)) return;
      if (v > bloomCeiling(col, co.bloom_level || 1)) overBloom.push(`${col}=${v}`);
      else if ((rules.evidence_required.includes(col) || rules.tool_use_columns.includes(col)) && !model.map[co.id]?.[col]) unsupported.push(`${col}=${v}`);
    });
    if (overBloom.length) out.push(d("MAPPING_BLOOM_MISMATCH", "spec", 5, [co.id, ...overBloom.map((x) => x.split("=")[0])], `${co.id} (Bloom L${co.bloom_level}) is mapped ${overBloom.join(", ")}, stronger than its Bloom's level supports.`, `Re-derived ${co.id}'s map within its Bloom's ceiling.`));
    if (unsupported.length) out.push(d("MAPPING_UNSUPPORTED", "spec", 5, [co.id, ...unsupported.map((x) => x.split("=")[0])], `${co.id} is mapped ${unsupported.join(", ")} without evidence in the syllabus or assessment.`, `Left those cells blank in the regenerated map.`));
  }

  // ----- Section 7: assessment table -----
  const covered = new Map<string, string[]>();
  for (const row of spec.assessment.coverage) { const id = normaliseCoId(row.co); if (id) covered.set(id, row.components); }
  if (spec.assessment.coverage.length) {
    for (const id of covered.keys()) if (!defined.has(id)) out.push(d("CO_EXTRA_IN_TABLE", "spec", 7, [id], `The assessment table has a row for ${id}, which is not a defined course outcome.`, `Removed the ${id} row from the assessment table.`));
    for (const id of defined) {
      if (!covered.has(id)) out.push(d("CO_MISSING_IN_TABLE", "spec", 7, [id], `${id} has no row in the assessment table.`, `Added ${id} to the assessment table.`));
      else if (!covered.get(id)!.length) out.push(d("CO_ASSESSMENT_MISMATCH", "spec", 7, [id], `${id} is not assessed in any component.`, `Assigned ${id} to an assessment component.`));
    }
    const comps = spec.assessment.groups.flatMap((g) => g.components);
    for (const c of comps.filter((c) => isPracticalComponent(c.name, c.practical) && /lab|practical/i.test(c.name))) {
      const assessesDefined = [...covered.entries()].some(([id, list]) => defined.has(id) && list.includes(c.name));
      if (!assessesDefined) out.push(d("CO_ASSESSMENT_MISMATCH", "spec", 7, [c.name], `The "${c.name}" component does not assess any defined course outcome.`, `Assigned the COs with lab or tool work to "${c.name}".`));
    }
  }
  const groupWeights = spec.assessment.groups.map((g) => g.weight_percent);
  if (groupWeights.length && groupWeights.every((w) => w != null)) {
    const total = groupWeights.reduce<number>((a, b) => a + (b ?? 0), 0);
    if (!near(total, 100)) out.push(d("WEIGHTAGE_INCONSISTENT", "spec", 7, [], `Assessment weightages add up to ${total}%, not 100%.`, "Weightages must total 100%; flagged for the Author to correct."));
  }
  for (const g of spec.assessment.groups) {
    const ws = g.components.map((c) => c.weight_percent);
    if (g.weight_percent != null && ws.length && ws.every((w) => w != null)) {
      const sum = ws.reduce<number>((a, b) => a + (b ?? 0), 0);
      if (!near(sum, g.weight_percent)) out.push(d("WEIGHTAGE_INCONSISTENT", "spec", 7, [g.name], `${g.name} components add up to ${sum}% but ${g.name} is weighted ${g.weight_percent}%.`, "Flagged for correction."));
    }
  }

  // ----- Hours (sections 2, 4, 6) -----
  const t = spec.teaching;
  const total = teachingTotal(t);
  if (t.stated_total != null && !near(total, t.stated_total)) out.push(d("HOURS_INCONSISTENT", "spec", 6, [], `Teaching hours add up to ${total}, but the stated total is ${t.stated_total}.`, `Total recomputed as ${total}.`));
  const interaction = spec.credits.total_hours_of_interaction;
  if (interaction != null && !near(interaction, total - (t.tests_exams ?? 0)) && !near(interaction, total)) {
    out.push(d("HOURS_INCONSISTENT", "spec", 2, [], `Total Hours of Interaction is ${interaction}, but the teaching table gives ${total - (t.tests_exams ?? 0)} contact hours (${total} including tests).`, "Flagged for the Author to correct."));
  }
  const [L] = model.credits.ltp.split(":").map(Number);
  if (spec.credits.weeks && L && t.lectures != null && !near(L * spec.credits.weeks, t.lectures)) {
    out.push(d("HOURS_INCONSISTENT", "spec", 6, [], `${L} lecture credits over ${spec.credits.weeks} weeks means ${L * spec.credits.weeks} lecture hours, but the table lists ${t.lectures}.`, "Flagged for the Author to correct."));
  }
  if (bp?.units.length && bp.units.every((u) => u.hours != null) && t.lectures != null) {
    const bpHours = bp.units.reduce((a, u) => a + (u.hours ?? 0), 0);
    if (!near(bpHours, t.lectures)) out.push(d("HOURS_INCONSISTENT", "blueprint", null, [], `Blueprint unit hours add up to ${bpHours}, but the spec lists ${t.lectures} lecture hours.`, "Flagged for correction."));
  }

  // ----- Blueprint marks -----
  if (bp) {
    const unitMarks = bp.units.every((u) => u.marks != null) ? bp.units.reduce((a, u) => a + (u.marks ?? 0), 0) : null;
    const stated = bp.stated_total_marks ?? unitMarks;
    if (bp.maximum_marks != null && stated != null && !near(stated, bp.maximum_marks)) {
      out.push(d("MARKS_INCONSISTENT", "blueprint", null, [], `Blueprint unit marks total ${stated}, but Maximum Marks is ${bp.maximum_marks}.`, "Flagged for the examiner to correct."));
    } else if (unitMarks != null && bp.stated_total_marks != null && !near(unitMarks, bp.stated_total_marks)) {
      out.push(d("MARKS_INCONSISTENT", "blueprint", null, [], `Blueprint unit marks add up to ${unitMarks}, but Total Marks says ${bp.stated_total_marks}.`, "Flagged for the examiner to correct."));
    }
  }

  // ----- Header and syllabus agreement with the blueprint -----
  if (bp) {
    if (bp.code && norm(bp.code) !== norm(spec.code)) out.push(d("LABEL_OR_TITLE_MISMATCH", "spec", null, [], `Course code "${spec.code}" in the spec does not match "${bp.code}" in the blueprint.`, "Kept the spec's code; flagged the conflict."));
    if (bp.title && norm(bp.title) !== norm(spec.title)) out.push(d("LABEL_OR_TITLE_MISMATCH", "spec", null, [], `Course title "${spec.title}" in the spec does not match "${bp.title}" in the blueprint.`, "Kept the spec's title; flagged the conflict."));
    if (bp.course_outcomes.length) {
      const specCos = new Map(spec.course_outcomes.map((c) => [normaliseCoId(c.id) ?? c.id, c.statement]));
      bp.course_outcomes.forEach((c, i) => {
        const id = `CO-${i + 1}`;
        if (!specCos.has(id)) out.push(d("CO_MISSING_IN_TABLE", "spec", 3, [id], `${id} is in the blueprint but missing from the spec's Course Outcomes.`, `Took ${id} from the blueprint.`));
        else if (norm(specCos.get(id)!) !== norm(c.statement)) out.push(d("LABEL_OR_TITLE_MISMATCH", "spec", 3, [id], `${id} wording in the spec differs from the blueprint.`, "Used the blueprint's wording."));
      });
      for (const id of specCos.keys()) if (Number(id.split("-")[1]) > bp.course_outcomes.length) out.push(d("CO_EXTRA_IN_TABLE", "spec", 3, [id], `${id} is in the spec but not in the blueprint.`, `Dropped ${id}; the blueprint decides the COs.`));
    }
    if (bp.units.length && spec.units.length && bp.units.length !== spec.units.length) {
      out.push(d("LABEL_OR_TITLE_MISMATCH", "spec", 4, [], `The spec has ${spec.units.length} units but the blueprint has ${bp.units.length}.`, "Used the blueprint's units."));
    }
  }

  // ----- Template choice and leftovers -----
  const ltp = model.credits.ltp;
  const practical = Number(ltp.split(":")[2] ?? 0) > 0;
  const typeLab = /laborator|\blab\b|practical/i.test(spec.course_type);
  if (practical !== typeLab) {
    out.push(d("WRONG_TEMPLATE", "spec", 2, [], `Credit structure ${ltp} and course type "${spec.course_type}" point to different templates.`, `Chose the ${detectTemplate(ltp, spec.course_type).template === "integrated" ? "Integrated" : "Non-Lab"} template by the credit rule.`));
  }
  const source = norm(specText);
  for (const s of SAMPLE_TOKENS) {
    if (norm(s).length >= 4 && new RegExp(`\\b${norm(s)}\\b`).test(source) && !new RegExp(`\\b${norm(s)}\\b`).test(norm(`${spec.title} ${spec.department} ${spec.code} ${spec.faculty} ${spec.course_type}`))) {
      out.push(d("PLACEHOLDER_TEXT", "template", null, [], `Text from the template's sample course ("${s}") appears in the spec.`, "Removed the sample text."));
    }
  }
  spec.extra_sections.forEach((s, i) => {
    out.push(d("SECTION_NOT_IN_TEMPLATE", "spec", Math.min(10 + i, 12), [], `"${s.heading}" is not a section of the official template.`, "Left it out of the corrected spec and listed it in the validation report."));
  });

  // ----- Section 8: lab courses must list the laboratory for practical skills -----
  if (model.template === "integrated") {
    const row = spec.achieving.find((a) => /practical/i.test(a.skill));
    if (row && !/lab/i.test(row.how)) out.push(d("OTHER", "spec", 8, [], `"${row.skill}" is imparted through "${row.how}" only, but this is a laboratory course.`, "Added the laboratory to how practical skills are imparted."));
  }
  return out;
}

// Lab courses list the laboratory for practical skills.
export function fixAchieving(model: CourseModel): void {
  if (model.template !== "integrated") return;
  for (const row of model.achieving) if (/practical/i.test(row.skill) && !/lab/i.test(row.how)) row.how = `Laboratory, ${row.how}`.replace(/,\s*--$/, "");
}

// ---------- Validation report ----------
export type Severity = "high" | "medium" | "low";
export type Check = { id: string; rule: string; ok: boolean; severity: Severity; details: string[] };
export type Report = { checks: Check[]; notes: string[]; dropped_sections: string[]; summary: { passed: number; failed: number } };

const SEVERITY: Record<string, Severity> = { V1: "high", V2: "high", V3: "high", V4: "high", V5: "medium", V6: "medium", V7: "high", V8: "medium", V9: "high", V10: "medium" };

export function validateModel(model: CourseModel, html: string, extra: { notes: string[]; dropped: string[]; fixes: MapFix[] }): Report {
  const ids = model.course_outcomes.map((c) => c.id);
  const set = new Set(ids);
  const comps = model.assessment.groups.flatMap((g) => g.components);
  const checks: Check[] = [];
  const add = (id: string, rule: string, details: string[]) => checks.push({ id, rule, ok: details.length === 0, severity: SEVERITY[id], details });

  const mapIds = Object.keys(model.map);
  const covIds = Object.keys(model.assessment.coverage);
  add("V1", "CO count is identical in Sections 3, 5 and 7", ids.length === mapIds.length && ids.length === covIds.length ? [] : [`Section 3: ${ids.length}, Section 5: ${mapIds.length}, Section 7: ${covIds.length}`]);
  add("V2", "Every CO is mapped to at least one PO", ids.filter((id) => !Object.keys(model.map[id] ?? {}).some((k) => k.startsWith("PO-"))).map((id) => `${id} has no PO`));
  add("V3", "Every CO is assessed in at least one component", ids.filter((id) => !(model.assessment.coverage[id] ?? []).length).map((id) => `${id} is not assessed`));
  add("V4", "No undefined CO appears in any table", [...mapIds, ...covIds].filter((id) => !set.has(id)).map((id) => `${id} is not defined in Section 3`));
  const total = teachingTotal(model.teaching);
  add("V5", "Teaching hours add up to the total", near(total, model.teaching_total) ? [] : [`Rows add to ${total}, total shows ${model.teaching_total}`]);
  const weights = model.assessment.groups.map((g) => g.weight_percent ?? 0);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const csum = comps.reduce((a, c) => a + (c.weight_percent ?? 0), 0);
  add("V6", "Assessment weightages total 100%", near(wsum, 100) && near(csum, 100) ? [] : [`Groups total ${wsum}%, components total ${Math.round(csum * 100) / 100}%`]);
  const htmlText = norm(html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "));
  const own = norm(JSON.stringify({ h: model.header, u: model.units, c: model.course_outcomes, s: model.summary, r: model.resources }));
  add("V7", "No template sample text remains", SAMPLE_STRINGS.filter((s) => norm(s).length >= 4 && htmlText.includes(norm(s)) && !own.includes(norm(s))).map((s) => `Found "${s.slice(0, 60)}"`));
  const psoCols = new Set(poPso.psos.map((p) => p.id));
  add("V8", "PSO columns match the programme", Object.values(model.map).flatMap((row) => Object.keys(row).filter((k) => k.startsWith("PSO") && !psoCols.has(k))));
  const v9: string[] = [];
  for (const co of model.course_outcomes) {
    for (const [col, cell] of Object.entries(model.map[co.id] ?? {})) {
      if (![1, 2, 3].includes(cell.level)) v9.push(`${co.id} ${col} has value ${cell.level}`);
      if (cell.level > bloomCeiling(col, co.bloom_level)) v9.push(`${co.id} ${col}=${cell.level} exceeds Bloom L${co.bloom_level}`);
      if (!cell.justification.trim()) v9.push(`${co.id} ${col} has no justification`);
    }
    const strong = rules.practical_required_columns.some((col) => (model.map[co.id]?.[col]?.level ?? 0) >= 2);
    const practical = (model.assessment.coverage[co.id] ?? []).some((name) => comps.some((c) => c.name === name && isPracticalComponent(c.name, c.practical)));
    if (strong && !practical) v9.push(`${co.id} is strong on PO-3/PO-5 but not assessed in a practical or assignment component`);
  }
  add("V9", "Map values, Bloom ceilings and practical assessment", v9);
  add("V10", "Template matches the credit/course-type rule or an override reason is recorded",
    model.template === model.template_detected || (model.template_override_reason ?? "").trim() ? [] : [`Detected ${model.template_detected}, using ${model.template} without a reason`]);

  const notes = [...extra.notes, ...extra.fixes.map((f) => `${f.co} ${f.column}: ${f.from ?? "blank"} -> ${f.to ?? "blank"} (${f.reason})`)];
  if (!model.has_blueprint) notes.unshift("No blueprint supplied: COs and units were taken from the existing spec.");
  const failed = checks.filter((c) => !c.ok).length;
  return { checks, notes, dropped_sections: extra.dropped, summary: { passed: checks.length - failed, failed } };
}
