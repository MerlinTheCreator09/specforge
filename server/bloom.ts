// Deterministic Bloom's level from a CO's leading verb, using the verb list in config/po_pso.json.
import { poPso } from "./config.js";

// British and American spellings both appear in specs.
const normalise = (w: string) => w.toLowerCase().replace(/[^a-z]/g, "").replace(/yz/g, "ys").replace(/iz/g, "is");

const VERBS = new Map<string, number>();
for (const b of poPso.blooms) {
  const level = Number(b.level.replace(/\D/g, ""));
  for (const v of b.verbs.split(/[,;]/)) {
    const verb = normalise(v.trim().split(/\s+/)[0] ?? "");
    if (verb && !VERBS.has(verb)) VERBS.set(verb, level);
  }
}

function lookup(word: string): number | null {
  const w = normalise(word);
  if (!w) return null;
  if (VERBS.has(w)) return VERBS.get(w)!;
  // Inflections: "applies", "explaining", "designed".
  for (const suffix of ["s", "es", "ing", "ed", "d"]) {
    if (w.endsWith(suffix) && VERBS.has(w.slice(0, -suffix.length))) return VERBS.get(w.slice(0, -suffix.length))!;
  }
  return null;
}

// Returns the level of the first known verb among the first three words, or null when the AI should decide.
export function bloomFromStatement(statement: string): { level: number; verb: string } | null {
  const words = statement.replace(/^\s*(CO-?\s*\d+[.:)\-\s]*)/i, "").trim().split(/\s+/).slice(0, 3);
  for (const word of words) {
    const level = lookup(word);
    if (level) return { level, verb: word.toLowerCase().replace(/[^a-z]/g, "") };
  }
  return null;
}
