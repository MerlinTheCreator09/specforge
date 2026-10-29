// /api/v1 routes for parsing, generation and the Author -> Reviewer -> HOD workflow.
import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { poPso, users } from "./config.js";
import { ApiError, ok } from "./envelope.js";
import { extractText } from "./extract.js";
import { configFromRequest } from "./llm.js";
import { bloomFromStatement } from "./bloom.js";
import { CourseModelSchema, teachingTotal } from "./model.js";
import { parseBlueprint, parseSpec } from "./parse.js";
import { finish, inputIdFor, runPipeline, type UploadedFile } from "./pipeline.js";
import { renderReport } from "./reportHtml.js";
import { rateLimit, requireRole, currentUser } from "./security.js";
import { newId, now, store, type SpecRecord } from "./store.js";
import { renderSpec } from "./template.js";
import { allowedActions, assertCanEdit, nextStatus } from "./workflow.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 2, fields: 10, fieldSize: 10_000 },
}).fields([{ name: "spec", maxCount: 1 }, { name: "blueprint", maxCount: 1 }]);

function filesFrom(req: Request): { spec: UploadedFile; blueprint: UploadedFile | null } {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const spec = files?.spec?.[0];
  const bp = files?.blueprint?.[0];
  if (!spec) throw new ApiError(400, "MISSING_SPEC", "Upload the existing course specification in the 'spec' field.");
  const clean = (n: string) => n.replace(/[^\w.\- ]/g, "_").slice(0, 120);
  return { spec: { name: clean(spec.originalname), buffer: spec.buffer }, blueprint: bp ? { name: clean(bp.originalname), buffer: bp.buffer } : null };
}

const aiLimit = rateLimit(30, 10 * 60 * 1000);

function getSpec(id: string): SpecRecord {
  const rec = /^[0-9a-f-]{36}$/.test(id) ? store.get(id) : undefined;
  if (!rec) throw new ApiError(404, "NOT_FOUND", "No spec with that id.");
  return rec;
}

const view = (rec: SpecRecord, role: string) => ({
  id: rec.id,
  status: rec.status,
  version: rec.version,
  created_at: rec.created_at,
  updated_at: rec.updated_at,
  files: rec.files,
  model: rec.result.model,
  // The uploaded text as parsed, for the "original vs corrected" views.
  original: { summary: rec.result.sources.spec.summary, course_outcomes: rec.result.sources.spec.course_outcomes, units: rec.result.sources.spec.units, old_map: rec.result.sources.spec.old_map },
  output: rec.result.output,
  report: rec.result.report,
  html: renderSpec(rec.result.model, { watermark: rec.status !== "Approved" }),
  log: rec.log,
  comments: rec.comments,
  allowed_actions: allowedActions(role as never, rec.status),
  can_edit: role === "author" && (rec.status === "Draft" || rec.status === "Returned"),
});

const EditSchema = CourseModelSchema.pick({
  header: true, summary: true, credits: true, course_outcomes: true, units: true, map: true,
  teaching: true, assessment: true, achieving: true, resources: true,
}).partial().strict();

export const router = Router();

router.get("/users", (_req, res) => ok(res, users));
router.get("/reference", (_req, res) => ok(res, poPso));

// Parse only (Level 1): structured data from the uploads, nothing stored.
router.post("/parse", aiLimit, upload, async (req, res, next) => {
  try {
    requireRole(req, "author");
    const cfg = configFromRequest(req);
    const { spec, blueprint } = filesFrom(req);
    const [s, b] = await Promise.all([extractText(spec.name, spec.buffer), blueprint ? extractText(blueprint.name, blueprint.buffer) : null]);
    const [ps, pb] = await Promise.all([parseSpec(s.text, cfg), b ? parseBlueprint(b.text, cfg) : null]);
    ok(res, { spec: ps, blueprint: pb });
  } catch (e) { next(e); }
});

// The scorer's route: files in, { output, html } out, no clicks.
router.post("/generate", aiLimit, upload, async (req, res, next) => {
  try {
    const cfg = configFromRequest(req);
    const { spec, blueprint } = filesFrom(req);
    const result = await runPipeline(spec, blueprint, cfg, inputIdFor(req.body?.input_id));
    ok(res, { output: result.output, html: renderSpec(result.model, { watermark: false }), report: result.report });
  } catch (e) { next(e); }
});

// ----- Workflow -----
router.get("/specs", (req, res, next) => {
  try {
    currentUser(req);
    ok(res, store.list().map((s) => ({ id: s.id, status: s.status, title: s.result.model.header.title, code: s.result.model.header.code, updated_at: s.updated_at, defects: s.result.output.defects.length })));
  } catch (e) { next(e); }
});

router.post("/specs", aiLimit, upload, async (req, res, next) => {
  try {
    const user = requireRole(req, "author");
    const cfg = configFromRequest(req);
    const { spec, blueprint } = filesFrom(req);
    const result = await runPipeline(spec, blueprint, cfg, inputIdFor(req.body?.input_id));
    const at = now();
    const rec: SpecRecord = {
      id: newId(), created_at: at, updated_at: at, status: "Draft", version: 1,
      files: { spec: spec.name, blueprint: blueprint?.name ?? null },
      result, comments: [],
      log: [{ at, user: user.email, role: user.role, action: "generate", from: null, to: "Draft", comment: blueprint ? "Generated from spec and blueprint" : "Generated from spec only (no blueprint supplied)" }],
    };
    ok(res, view(store.save(rec), user.role), 201);
  } catch (e) { next(e); }
});

router.get("/specs/:id", (req, res, next) => {
  try {
    const user = currentUser(req);
    ok(res, view(getSpec(req.params.id), user.role));
  } catch (e) { next(e); }
});

router.patch("/specs/:id", (req, res, next) => {
  try {
    const user = currentUser(req);
    const rec = getSpec(req.params.id);
    assertCanEdit(user.role, rec.status);
    const parsed = EditSchema.safeParse(req.body);
    if (!parsed.success) throw new ApiError(400, "INVALID_EDIT", parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    const model = { ...rec.result.model, ...parsed.data };
    if (parsed.data.course_outcomes) {
      model.course_outcomes = parsed.data.course_outcomes.map((c, i) => ({ ...c, id: `CO-${i + 1}`, bloom_level: c.bloom_level || bloomFromStatement(c.statement)?.level || 1 }));
    }
    if (parsed.data.teaching) model.teaching_total = teachingTotal(model.teaching);
    rec.result = finish({ ...rec.result, model });
    rec.version += 1;
    rec.log.push({ at: now(), user: user.email, role: user.role, action: "edit", from: rec.status, to: rec.status, comment: `Edited ${Object.keys(parsed.data).join(", ")}` });
    ok(res, view(store.save(rec), user.role));
  } catch (e) { next(e); }
});

router.post("/specs/:id/template", (req, res, next) => {
  try {
    const user = currentUser(req);
    const rec = getSpec(req.params.id);
    assertCanEdit(user.role, rec.status);
    const body = z.object({ template: z.enum(["integrated", "non_lab"]), reason: z.string().max(1000) }).strict().safeParse(req.body);
    if (!body.success) throw new ApiError(400, "INVALID_INPUT", "Send { template: 'integrated' | 'non_lab', reason }.");
    const model = rec.result.model;
    const overriding = body.data.template !== model.template_detected;
    if (overriding && body.data.reason.trim().length < 5) throw new ApiError(400, "REASON_REQUIRED", "Give a reason for overriding the detected template.");
    rec.result = finish({ ...rec.result, model: { ...model, template: body.data.template, template_override_reason: overriding ? body.data.reason.trim() : null } });
    rec.version += 1;
    rec.log.push({ at: now(), user: user.email, role: user.role, action: "template", from: rec.status, to: rec.status, comment: overriding ? `Template set to ${body.data.template}: ${body.data.reason.trim()}` : `Template reset to detected (${body.data.template})` });
    ok(res, view(store.save(rec), user.role));
  } catch (e) { next(e); }
});

router.post("/specs/:id/transitions", (req, res, next) => {
  try {
    const user = currentUser(req);
    const rec = getSpec(req.params.id);
    const body = z.object({ action: z.enum(["submit", "start_review", "forward", "return", "approve"]), comment: z.string().max(2000).default("") }).strict().safeParse(req.body);
    if (!body.success) throw new ApiError(400, "INVALID_INPUT", "Send { action, comment }.");
    const to = nextStatus(body.data.action, user.role, rec.status, body.data.comment);
    rec.log.push({ at: now(), user: user.email, role: user.role, action: body.data.action, from: rec.status, to, comment: body.data.comment.trim() });
    rec.status = to;
    ok(res, view(store.save(rec), user.role));
  } catch (e) { next(e); }
});

router.post("/specs/:id/comments", (req, res, next) => {
  try {
    const user = currentUser(req);
    const rec = getSpec(req.params.id);
    const body = z.object({ section: z.number().int().min(1).max(9).nullable().default(null), text: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
    if (!body.success) throw new ApiError(400, "INVALID_INPUT", "Send { section: 1-9 or null, text }.");
    if (rec.status === "Approved") throw new ApiError(409, "INVALID_STATE", "The spec is approved; comments are closed.");
    rec.comments.push({ id: newId(), at: now(), user: user.email, role: user.role, section: body.data.section, text: body.data.text });
    ok(res, view(store.save(rec), user.role), 201);
  } catch (e) { next(e); }
});

// ----- Exports -----
function sendFile(res: import("express").Response, name: string, type: string, body: string, inline: boolean) {
  res.setHeader("Content-Type", `${type}; charset=utf-8`);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${name}"`);
  // The documents carry the template's own print script; nothing else may load or run.
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'");
  res.send(body);
}

router.get("/specs/:id/export/:file", (req, res, next) => {
  try {
    currentUser(req);
    const rec = getSpec(req.params.id);
    const inline = req.query.inline === "1";
    const r = rec.result;
    switch (req.params.file) {
      case "spec.html": return sendFile(res, "spec.html", "text/html", renderSpec(r.model, { watermark: rec.status !== "Approved" }), inline);
      case "specforge_output.json": return sendFile(res, "specforge_output.json", "application/json", JSON.stringify(r.output, null, 2), inline);
      case "validation_report.html": return sendFile(res, "validation_report.html", "text/html", renderReport(r), inline);
      default: throw new ApiError(404, "NOT_FOUND", "Exports: spec.html, specforge_output.json, validation_report.html");
    }
  } catch (e) { next(e); }
});
