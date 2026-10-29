// Zod schemas for everything that crosses a boundary: AI replies, the output file and API bodies.
import { z } from "zod";

const num = z.number().finite().nullable();
const str = z.string().max(20_000);

// ---------- What the AI extracts from the existing course spec ----------
export const ParsedSpecSchema = z.object({
  title: str,
  code: str,
  course_type: str,
  department: str,
  faculty: str,
  summary: str,
  credits: z.object({
    number_of_credits: str,
    ltp: str, // "3:0:1"
    total_hours_of_interaction: num,
    weeks: num,
    department_responsible: str,
    total_course_marks: num,
    pass_criterion: str,
    attendance_requirement: str,
  }),
  course_outcomes: z.array(z.object({ id: str, statement: str })),
  units: z.array(z.object({ number: z.number().int(), title: str, content: str, lab: str.nullable() })),
  old_map: z.object({
    columns: z.array(str),
    rows: z.array(z.object({ co: str, values: z.array(num) })),
  }),
  teaching: z.object({
    lectures: num,
    demonstrations: z.object({ videos: num, physical_models: num, computer: num }),
    numeracy: z.object({ numerical_problems: num }),
    practicals: z.object({ course_lab: num, computer_lab: num, workshop: num, clinical_lab: num, hospital: num, model_studio: num }),
    others: z.object({ case_study: num, guest_lecture: num, field_visit: num, brainstorming: num, group_discussions: num, innovations: num }),
    tests_exams: num,
    tests_exams_label: str,
    stated_total: num,
  }),
  assessment: z.object({
    paragraphs_before: z.array(str),
    paragraphs_after: z.array(str),
    groups: z.array(
      z.object({
        name: str,
        weight_percent: num,
        components: z.array(z.object({ name: str, marks: num, weight_percent: num, practical: z.boolean() })),
      }),
    ),
    coverage: z.array(z.object({ co: str, components: z.array(str) })),
  }),
  achieving: z.array(z.object({ skill: str, how: str })),
  resources: z.object({
    essential: z.array(str),
    recommended: z.array(str),
    magazines: z.array(str),
    websites: z.array(str),
    other: z.array(str),
  }),
  extra_sections: z.array(z.object({ heading: str, summary: str })),
});
export type ParsedSpec = z.infer<typeof ParsedSpecSchema>;

// ---------- What the AI extracts from the question-paper blueprint ----------
export const ParsedBlueprintSchema = z.object({
  title: str,
  code: str,
  programme: str,
  examination: str,
  maximum_marks: num,
  duration: str,
  units: z.array(z.object({ number: z.number().int(), title: str, content: str, hours: num, marks: num })),
  stated_total_marks: num,
  course_outcomes: z.array(z.object({ id: str, statement: str })),
});
export type ParsedBlueprint = z.infer<typeof ParsedBlueprintSchema>;

// ---------- The scoring file (mirrors config/specforge_output.schema.json; strict = no extra keys) ----------
export const DEFECT_CODES = [
  "CO_MISSING_IN_TABLE", "CO_EXTRA_IN_TABLE", "CO_ASSESSMENT_MISMATCH", "PSO_COLUMN_MISMATCH",
  "MAPPING_BLOOM_MISMATCH", "MAPPING_UNSUPPORTED", "WRONG_TEMPLATE", "PLACEHOLDER_TEXT",
  "SUMMARY_SYLLABUS_MISMATCH", "LABEL_OR_TITLE_MISMATCH", "HOURS_INCONSISTENT", "WEIGHTAGE_INCONSISTENT",
  "TYPO_OR_FORMAT", "SECTION_NOT_IN_TEMPLATE", "MARKS_INCONSISTENT", "OTHER",
] as const;

export const CellSchema = z.object({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]), justification: z.string() }).strict();
const COLUMN_KEY = /^(PO-([1-9]|1[01])|PSO-\d+)$/;
const CO_KEY = /^CO-\d+$/;

export const DefectSchema = z.object({
  code: z.enum(DEFECT_CODES),
  location: z.object({
    source: z.enum(["spec", "blueprint", "template"]),
    section: z.number().int().min(1).max(12).nullable(),
    refs: z.array(z.string()),
  }).strict(),
  description: z.string(),
  fix: z.string(),
}).strict();
export type Defect = z.infer<typeof DefectSchema>;

export const OutputSchema = z.object({
  schema_version: z.literal("1.0"),
  input_id: z.string(),
  template: z.enum(["integrated", "non_lab"]),
  course: z.object({
    title: z.string(), code: z.string(), department: z.string(),
    credits_ltp: z.string().regex(/^\d+:\d+:\d+$/), course_type: z.string(), summary: z.string(),
  }).strict(),
  course_outcomes: z.array(z.object({ id: z.string().regex(CO_KEY), statement: z.string(), bloom_level: z.number().int().min(1).max(6) }).strict()).min(1),
  units: z.array(z.object({ number: z.number().int(), title: z.string(), lab: z.string().nullable() }).strict()),
  co_po_pso_map: z.record(z.string().regex(CO_KEY), z.record(z.string().regex(COLUMN_KEY), CellSchema)),
  teaching_hours: z.object({ lectures: z.number(), lab: z.number(), tests_exams: z.number(), total: z.number() }).strict(),
  assessment: z.object({
    components: z.array(z.object({ name: z.string(), weight_percent: z.number() }).strict()),
    co_coverage: z.record(z.string().regex(CO_KEY), z.array(z.string())),
  }).strict(),
  defects: z.array(DefectSchema),
}).strict();
export type Output = z.infer<typeof OutputSchema>;
export type MapCell = z.infer<typeof CellSchema>;
