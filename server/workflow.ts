// Approval workflow and permissions. The server decides who may do what; the screen only mirrors it.
import type { Role } from "./config.js";
import { ApiError } from "./envelope.js";
import type { Status } from "./store.js";

export type Action = "submit" | "start_review" | "forward" | "return" | "approve";

// action -> role -> allowed from-states and the resulting state
const TRANSITIONS: Record<Action, Partial<Record<Role, { from: Status[]; to: Status }>>> = {
  submit: { author: { from: ["Draft", "Returned"], to: "Submitted" } },
  start_review: { reviewer: { from: ["Submitted"], to: "Under Review" } },
  forward: { reviewer: { from: ["Submitted", "Under Review"], to: "Pending HOD" } },
  return: {
    reviewer: { from: ["Submitted", "Under Review"], to: "Returned" },
    hod: { from: ["Pending HOD"], to: "Returned" },
  },
  approve: { hod: { from: ["Pending HOD"], to: "Approved" } },
};

export function nextStatus(action: Action, role: Role, current: Status, comment: string): Status {
  const rule = TRANSITIONS[action][role];
  if (!rule) throw new ApiError(403, "FORBIDDEN", `A ${role} cannot ${action.replace("_", " ")} a spec.`);
  if (!rule.from.includes(current)) throw new ApiError(409, "INVALID_STATE", `Cannot ${action.replace("_", " ")} a spec that is ${current}.`);
  if (action === "return" && !comment.trim()) throw new ApiError(400, "COMMENT_REQUIRED", "Say why the spec is being returned.");
  return rule.to;
}

// Only the Author edits content, and only while the spec is a Draft or Returned.
export function assertCanEdit(role: Role, status: Status) {
  if (role !== "author") throw new ApiError(403, "FORBIDDEN", "Only the Author can edit a spec.");
  if (status !== "Draft" && status !== "Returned") throw new ApiError(403, "LOCKED", `The spec is ${status}; it can be edited only as a Draft or after it is Returned.`);
}

export function allowedActions(role: Role, status: Status): Action[] {
  return (Object.keys(TRANSITIONS) as Action[]).filter((a) => TRANSITIONS[a][role]?.from.includes(status));
}
