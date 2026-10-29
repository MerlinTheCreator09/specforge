// Loads reference data from config/. These are rules and outcome statements, never course content.
import { readFileSync } from "node:fs";
import { z } from "zod";

const read = (file: string) => JSON.parse(readFileSync(new URL(`../config/${file}`, import.meta.url), "utf8"));

const PoPso = z.object({
  pos: z.array(z.object({ id: z.string(), title: z.string(), statement: z.string() })),
  psos: z.array(z.object({ id: z.string(), statement: z.string() })),
  blooms: z.array(z.object({ level: z.string(), name: z.string(), verbs: z.string() })),
});
const Rules = z.object({
  bloom_ceiling: z.record(z.union([z.array(z.number()), z.string()])),
  evidence_required: z.array(z.string()),
  tool_use_columns: z.array(z.string()),
  practical_required_columns: z.array(z.string()),
  tool_use_keywords: z.array(z.string()),
  practical_component_keywords: z.array(z.string()),
  template_sections: z.array(z.string()),
});
const Users = z.array(z.object({ email: z.string(), name: z.string(), role: z.enum(["author", "reviewer", "hod"]) }));

export const poPso = PoPso.parse(read("po_pso.json"));
export const rules = Rules.parse(read("rules.json"));
export const users = Users.parse(read("users.json"));
export type Role = z.infer<typeof Users>[number]["role"];
export type User = z.infer<typeof Users>[number];

// Map columns in template order: PO-1..PO-11 then the programme's PSOs.
export const COLUMNS = [...poPso.pos.map((p) => p.id), ...poPso.psos.map((p) => p.id)];

export function bloomCeiling(column: string, bloom: number): number {
  const row = rules.bloom_ceiling[column];
  return Array.isArray(row) ? (row[Math.min(Math.max(bloom, 1), 6) - 1] ?? 3) : 3;
}
