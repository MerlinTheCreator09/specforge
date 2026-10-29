// Writes the files the portal's Submit page asks for, in the same places `npm run verify` uses:
//   outputs/specforge_output.json  (Output file, 80 points)
//   outputs/spec.html              (Spec document, 20 points)
//   outputs/specforge.zip          (Your code: the project, with outputs/ inside, as the website describes)
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { ApiError } from "./envelope.js";
import { OutputSchema, type Output } from "./schemas.js";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const OUT = join(ROOT, "outputs");
const MAX_ZIP_BYTES = 4 * 1024 * 1024; // portal limit

// Per the website: leave out node_modules (they install), .env (holds the key; a zip with one is refused), .git, dist.
// kit/ and sample-inputs/ are optional (they bring their own); data/ holds local runs; older zips are skipped.
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "kit", "sample-inputs", "data"]);
const skipFile = (name: string) => /^\.env/i.test(name) || /\.zip$/i.test(name) || /\.(key|pem)$/i.test(name);

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(full, files); }
    else if (!skipFile(name)) files.push(full);
  }
  return files;
}

export type SubmissionResult = {
  files: { slot: string; points: string; path: string; bytes: number }[];
  checks: { ok: boolean; text: string }[];
};

export function writeSubmission(output: Output, html: string): SubmissionResult {
  // Same gate as the portal: exact schema, no extra keys, input_id "SAMPLE".
  const parsed = OutputSchema.safeParse(output);
  if (!parsed.success) throw new ApiError(400, "BAD_OUTPUT", "The output file does not match the schema: " + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  if (typeof html !== "string" || !/<html[\s>]/i.test(html)) throw new ApiError(400, "BAD_HTML", "The spec document is missing.");

  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  const jsonPath = join(OUT, "specforge_output.json");
  const htmlPath = join(OUT, "spec.html");
  writeFileSync(jsonPath, JSON.stringify(parsed.data, null, 2));
  writeFileSync(htmlPath, html);

  const zip = new AdmZip();
  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file).split(sep).join("/");
    zip.addLocalFile(file, rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "");
  }
  const zipBuf = zip.toBuffer();
  const zipPath = join(OUT, "specforge.zip");
  writeFileSync(zipPath, zipBuf);

  const d = parsed.data;
  const checks = [
    { ok: true, text: "Output file matches specforge_output.schema.json (no extra keys)" },
    { ok: d.input_id === "SAMPLE", text: `input_id is "${d.input_id}"${d.input_id === "SAMPLE" ? "" : ' (must be exactly "SAMPLE" for the sample kit)'}` },
    { ok: /^\d+:\d+:\d+$/.test(d.course.credits_ltp), text: `credits_ltp is "${d.course.credits_ltp}"` },
    { ok: zipBuf.length <= MAX_ZIP_BYTES, text: `Project zip is ${(zipBuf.length / 1024).toFixed(0)} KB (limit 4 MB), without node_modules, .env, .git or dist` },
  ];
  return {
    files: [
      { slot: "Output file", points: "80", path: relative(ROOT, jsonPath), bytes: statSync(jsonPath).size },
      { slot: "Spec document", points: "20", path: relative(ROOT, htmlPath), bytes: statSync(htmlPath).size },
      { slot: "Your code (.zip)", points: "final run", path: relative(ROOT, zipPath), bytes: zipBuf.length },
    ],
    checks,
  };
}

const SERVED: Record<string, string> = {
  "specforge_output.json": "application/json; charset=utf-8",
  "spec.html": "text/html; charset=utf-8",
  "specforge.zip": "application/zip",
};

// Reads a saved submission file by its fixed name; any other name is refused, so no path can be smuggled in.
export function readSubmissionFile(name: string): { name: string; type: string; body: Buffer } {
  const type = Object.hasOwn(SERVED, name) ? SERVED[name] : undefined;
  if (!type) throw new ApiError(404, "NOT_FOUND", "Files: specforge_output.json, spec.html, specforge.zip.");
  const path = join(OUT, name);
  if (!existsSync(path)) throw new ApiError(404, "NOT_SAVED", "Save the submission files first.");
  return { name, type, body: readFileSync(path) };
}
