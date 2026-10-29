// Small shared pieces in the Stitch "Obsidian" style.
import type { ReactNode } from "react";

export type Role = "author" | "reviewer" | "hod";
export type User = { email: string; name: string; role: Role };
export type Cell = { level: 1 | 2 | 3; justification: string };
export type Spec = any; // GET /specs/:id view (see server/routes.ts)
export type Act = {
  spec: Spec | null;
  me: User | null;
  post: (path: string, body: unknown) => Promise<void>;
  patch: (body: unknown) => Promise<void>;
  go: (step: number) => void;
};

export const SEVERITY_COLOR: Record<string, string> = { high: "text-error", medium: "text-warning", low: "text-on-surface-variant" };

export const Icon = ({ name, className = "" }: { name: string; className?: string }) => <span className={`icon ${className}`} aria-hidden="true">{name}</span>;

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 pt-2">
      <div>
        <h1 className="text-headline-lg text-white tracking-tight">{title}</h1>
        {sub && <p className="text-body-md text-on-surface-variant mt-1 max-w-3xl">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function CardHead({ icon, title, sub, right }: { icon: string; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-surface-container-high border border-outline-variant flex items-center justify-center text-primary"><Icon name={icon} /></div>
        <div>
          <h2 className="text-headline-sm text-white">{title}</h2>
          {sub && <p className="text-body-sm text-on-surface-variant">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

export function Empty({ go }: { go: (n: number) => void }) {
  return (
    <div className="card text-center py-16">
      <Icon name="upload_file" className="text-[40px] text-outline" />
      <p className="text-body-lg mt-3">No specification open.</p>
      <p className="text-body-sm text-on-surface-variant mb-4">Upload a course spec, or open one from the list on the Upload screen.</p>
      <button className="btn-primary" onClick={() => go(0)}>Go to Upload</button>
    </div>
  );
}

export const cellStyle = (level?: number) =>
  level === 3 ? "bg-primary-container text-white" : level === 2 ? "bg-[#5b3fb5] text-white" : level === 1 ? "bg-secondary-fixed text-primary" : "text-outline";
