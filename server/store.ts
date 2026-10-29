// In-memory store, saved to data/specs.json so specs survive a restart. Never holds API keys.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Role } from "./config.js";
import type { PipelineResult } from "./pipeline.js";

export type Status = "Draft" | "Submitted" | "Under Review" | "Pending HOD" | "Approved" | "Returned";
export type LogEntry = { at: string; user: string; role: Role; action: string; from: Status | null; to: Status; comment: string };
export type Comment = { id: string; at: string; user: string; role: Role; section: number | null; text: string };
export type SpecRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  status: Status;
  version: number;
  files: { spec: string; blueprint: string | null };
  result: PipelineResult;
  log: LogEntry[];
  comments: Comment[];
};

const DIR = new URL("../data/", import.meta.url);
const FILE = new URL("specs.json", DIR);
const specs = new Map<string, SpecRecord>();

try {
  if (existsSync(FILE)) for (const s of JSON.parse(readFileSync(FILE, "utf8")) as SpecRecord[]) specs.set(s.id, s);
} catch {
  console.error("Could not read data/specs.json; starting with an empty store.");
}

function persist() {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    const tmp = new URL("specs.json.tmp", DIR);
    writeFileSync(tmp, JSON.stringify([...specs.values()]));
    renameSync(tmp, FILE);
  } catch {
    console.error("Could not save data/specs.json; data is kept in memory only.");
  }
}

export const now = () => new Date().toISOString();
export const newId = () => randomUUID();

export const store = {
  list: () => [...specs.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
  get: (id: string) => specs.get(id),
  save(rec: SpecRecord) {
    rec.updated_at = now();
    specs.set(rec.id, rec);
    persist();
    return rec;
  },
};
