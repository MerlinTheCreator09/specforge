// The corrected course, built from the parsed sources by the source-of-truth rules.
// The output file and the spec document are both rendered from this one model.
import { z } from "zod";
import { bloomFromStatement } from "./bloom.js";
import { COLUMNS, rules } from "./config.js";
import { CellSchema, ParsedSpecSchema, type Defect, type Output, type ParsedBlueprint, type ParsedSpec } from "./schemas.js";
import { detectTemplate, type TemplateId } from "./template.js";

export const CourseModelSchema = z.object({
  input_id: z.string().max(100),
  template: z.enum(["integrated", "non_lab"]),
  template_detected: z.enum(["integrated", "non_lab"]),
  template_signals: z.array(z.string()),
  template_override_reason: z.string().max(1000).nullable(),
  has_blueprint: z.boolean(),
  header: z.object({ title: z.string(), code: z.string(), course_type: z.string(), department: z.string(), faculty: z.string() }),
  summary: z.string(),
  credits: ParsedSpecSchema.shape.credits,
  course_outcomes: z.array(z.object({ id: z.string().regex(/^CO-\d+$/), statement: z.string(), bloom_level: z.number().int().min(1).max(6) })),
  units: z.array(z.object({ number: z.number().int(), title: z.string(), content: z.string(), lab: z.string().nullable() })),
  map: z.record(z.string().regex(/^CO-\d+$/), z.record(z.string().regex(/^(PO-([1-9]|1[01])|PSO-\d+)$/), CellSchema)),
  teaching: ParsedSpecSchema.shape.teaching,
  teaching_total: z.number(),
  assessment: z.object({
    paragraphs_before: z.array(z.string()),
    paragraphs_after: z.array(z.string()),
    groups: z.array(z.object({
      name: z.string(),
      weight_percent: z.number().nullable(),
      components: z.array(z.object({ name: z.string(), marks: z.number().nullable(), weight_percent: z.number().nullable(), practical: z.boolean() })),
    })),
    coverage: z.record(z.string().regex(/^CO-\d+$/), z.array(z.string())),
  }),
  achieving: z.array(z.object({ skill: z.string(), how: z.string() })),
  resources: ParsedSpecSchema.shape.resources,
});
export type CourseModel = z.infer<typeof CourseModelSchema>;

// "CO1", "CO 1", "CO-01" -> "CO-1"
export function normaliseCoId(raw: string): string | null {
  const m = raw.match(/CO\s*-?\s*0*(\d+)/i);
  return m ? `CO-${m[1]}` : null;
}

export function normaliseLtp(raw: string): string {
  const nums = raw.match(/\d+/g) ?? [];
  return nums.length >= 3 ? nums.slice(0, 3).join(":") : "0:0:0";
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function teachingTotal(t: ParsedSpec["teaching"]): number {
  const sum = (o: Record<string, number | null>) => Object.values(o).reduce<number>((a, b) => a + (b ?? 0), 0);
  return (t.lectures ?? 0) + sum(t.demonstrations) + sum(t.numeracy) + sum(t.practicals) + sum(t.others) + (t.tests_exams ?? 0);
}

export function isPracticalComponent(name: string, flagged: boolean): boolean {
  return flagged || rules.practical_component_keywords.some((k) => new RegExp(`\\b${k}`, "i").test(name));
}

// Fills in component weights the spec only gives per group: split the group weight by marks, else evenly.
function resolveWeights(groups: ParsedSpec["assessment"]["groups"]) {
  return groups.map((g) => {
    const known = g.components.every((c) => c.weight_percent != null);
    if (known || g.weight_percent == null || !g.components.length) return g;
    const marks = g.components.map((c) => c.marks ?? 0);
    const totalMarks = marks.reduce((a, b) => a + b, 0);
    const components = g.components.map((c, i) => ({
      ...c,
      weight_percent: c.weight_percent ?? Math.round(((totalMarks > 0 ? marks[i] / totalMarks : 1 / g.components.length) * g.weight_percent!) * 100) / 100,
    }));
    return { ...g, components };
  });
}

export function buildModel(spec: ParsedSpec, blueprint: ParsedBlueprint | null, inputId: string): CourseModel {
  const ltp = normaliseLtp(spec.credits.ltp);
  const { template, signals } = detectTemplate(ltp, spec.course_type);
  const useBlueprint = !!blueprint && blueprint.course_outcomes.length > 0;
  const bpUnits = blueprint && blueprint.units.length > 0;

  const coSource = useBlueprint ? blueprint!.course_outcomes : spec.course_outcomes;
  const course_outcomes = coSource.map((co, i) => {
    const statement = co.statement.trim();
    return { id: `CO-${i + 1}`, statement, bloom_level: bloomFromStatement(statement)?.level ?? 0 };
  });

  // Units: text from the blueprint, lab exercises from the existing spec (matched by number, then by title).
  const units = (bpUnits ? blueprint!.units : spec.units).map((u, i) => {
    const specUnit = spec.units.find((s) => s.number === u.number) ?? spec.units.find((s) => norm(s.title) === norm(u.title)) ?? spec.units[i];
    return { number: u.number || i + 1, title: u.title.trim(), content: u.content.trim(), lab: specUnit?.lab?.trim() || null };
  });

  // Coverage: keep only defined COs; components by name.
  const groups = resolveWeights(spec.assessment.groups);
  const compNames = new Set(groups.flatMap((g) => g.components.map((c) => c.name)));
  const coverage: Record<string, string[]> = {};
  for (const co of course_outcomes) coverage[co.id] = [];
  for (const row of spec.assessment.coverage) {
    const id = normaliseCoId(row.co);
    if (id && coverage[id]) coverage[id] = [...new Set(row.components.filter((c) => compNames.has(c)))];
  }

  return {
    input_id: inputId,
    template,
    template_detected: template,
    template_signals: signals,
    template_override_reason: null,
    has_blueprint: !!blueprint,
    header: { title: spec.title.trim(), code: spec.code.trim(), course_type: spec.course_type.trim(), department: spec.department.trim(), faculty: spec.faculty.trim() },
    summary: spec.summary.trim(),
    credits: { ...spec.credits, ltp },
    course_outcomes,
    units,
    map: {},
    teaching: spec.teaching,
    teaching_total: teachingTotal(spec.teaching),
    assessment: { paragraphs_before: spec.assessment.paragraphs_before, paragraphs_after: spec.assessment.paragraphs_after, groups, coverage },
    achieving: spec.achieving,
    resources: spec.resources,
  };
}

export function toOutput(model: CourseModel, defects: Defect[]): Output {
  const t = model.teaching;
  const lab = Object.values(t.practicals).reduce<number>((a, b) => a + (b ?? 0), 0);
  const components = model.assessment.groups.flatMap((g) => g.components.map((c) => ({ name: c.name, weight_percent: c.weight_percent ?? 0 })));
  return {
    schema_version: "1.0",
    input_id: model.input_id,
    template: model.template as TemplateId,
    course: {
      title: model.header.title,
      code: model.header.code,
      department: model.header.department,
      credits_ltp: model.credits.ltp,
      course_type: model.header.course_type,
      summary: model.summary,
    },
    course_outcomes: model.course_outcomes.map((c) => ({ id: c.id, statement: c.statement, bloom_level: Math.min(Math.max(c.bloom_level || 1, 1), 6) })),
    units: model.units.map((u) => ({ number: u.number, title: u.title, lab: model.template === "integrated" ? u.lab : null })),
    co_po_pso_map: Object.fromEntries(model.course_outcomes.map((co) => [co.id, Object.fromEntries(COLUMNS.map((col) => [col, model.map[co.id]?.[col] ?? null]))])),
    teaching_hours: { lectures: t.lectures ?? 0, lab, tests_exams: t.tests_exams ?? 0, total: model.teaching_total },
    assessment: { components, co_coverage: model.assessment.coverage },
    defects,
  };
}
