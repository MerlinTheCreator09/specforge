// The whole generation run, used by POST /generate (the scorer) and by the Author's upload.
import { extractText } from "./extract.js";
import type { LlmConfig } from "./llm.js";
import { ensureEveryCoAssessed, ensureLabComponentsUsed, ensurePracticalCoverage, generateMap, type MapFix } from "./mapper.js";
import { buildModel, toOutput, type CourseModel } from "./model.js";
import { parseBlueprint, parseSpec } from "./parse.js";
import { reviewText } from "./review.js";
import type { Defect, Output, ParsedBlueprint, ParsedSpec } from "./schemas.js";
import { OutputSchema } from "./schemas.js";
import { renderSpec, SAMPLE_TOKENS } from "./template.js";
import { findInputDefects, fixAchieving, validateModel, type Report } from "./validate.js";
import { ApiError } from "./envelope.js";

export type UploadedFile = { name: string; buffer: Buffer };
export type PipelineResult = {
  model: CourseModel;
  output: Output;
  report: Report;
  sources: { spec: ParsedSpec; blueprint: ParsedBlueprint | null };
  notes: string[];
  fixes: MapFix[];
  defects: Defect[];
};

// The scorer runs the sample kit, whose id must be exactly "SAMPLE" (anything else scores 0), and file names
// may change between runs. So default to SAMPLE and only use an id that the caller sends explicitly.
export function inputIdFor(override?: unknown): string {
  return typeof override === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(override) ? override : "SAMPLE";
}

export async function runPipeline(specFile: UploadedFile, blueprintFile: UploadedFile | null, cfg: LlmConfig, inputId: string): Promise<PipelineResult> {
  const [specText, bpText] = await Promise.all([
    extractText(specFile.name, specFile.buffer),
    blueprintFile ? extractText(blueprintFile.name, blueprintFile.buffer) : Promise.resolve(null),
  ]);
  const [spec, blueprint] = await Promise.all([parseSpec(specText.text, cfg), bpText ? parseBlueprint(bpText.text, cfg) : Promise.resolve(null)]);
  // Any file may be uploaded. If the "spec" is really the blank official template (its title and code are the template's
  // own sample course, read from templates/ at startup), the run continues and the report says so.
  const isSample = (v: string) => SAMPLE_TOKENS.some((t) => t.toLowerCase() === v.trim().toLowerCase());
  const warnings = isSample(spec.title) && isSample(spec.code)
    ? [`Heads-up: the uploaded spec looks like the official template's sample course ("${spec.title}", ${spec.code}), not an existing course specification. The output describes that sample course. The scorer uses sample_course_spec.docx as the spec.`]
    : [];
  if (!spec.course_outcomes.length && !blueprint?.course_outcomes.length) throw new ApiError(422, "NO_COURSE_OUTCOMES", "No course outcomes were found in the uploaded files.");

  const model = buildModel(spec, blueprint, inputId);
  const [mapped, review] = await Promise.all([generateMap(model, cfg, spec.old_map), reviewText(model, specText.text, cfg)]);
  model.map = mapped.map;
  for (const co of model.course_outcomes) co.bloom_level = mapped.bloom[co.id] ?? (co.bloom_level || 1);
  model.summary = review.summary;
  model.resources = review.resources;

  const notes = [...warnings, ...ensureEveryCoAssessed(model), ...ensurePracticalCoverage(model), ...ensureLabComponentsUsed(model)];
  fixAchieving(model);
  const defects = dedupe([...findInputDefects(spec, blueprint, model, specText.text), ...review.defects]);
  return finish({ model, sources: { spec, blueprint }, notes, fixes: mapped.fixes, defects });
}

// Re-renders and re-validates after any change (generation, an Author edit or a template override).
export function finish(r: { model: CourseModel; sources: PipelineResult["sources"]; notes: string[]; fixes: MapFix[]; defects: Defect[] }): PipelineResult {
  const output = OutputSchema.parse(toOutput(r.model, r.defects));
  const html = renderSpec(r.model, { watermark: false });
  const report = validateModel(r.model, html, { notes: r.notes, dropped: r.sources.spec.extra_sections.map((s) => s.heading), fixes: r.fixes });
  return { ...r, output, report };
}

function dedupe(defects: Defect[]): Defect[] {
  const seen = new Set<string>();
  return defects.filter((x) => {
    const key = `${x.code}|${x.location.section}|${[...x.location.refs].sort().join(",")}|${x.description.toLowerCase().slice(0, 60)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
