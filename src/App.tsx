// App shell from the Stitch "Obsidian" design: top bar with the role switcher, a six-step lifecycle sidebar,
// and one screen per step. All data comes from the backend; nothing about a course is written here.
import { useEffect, useState } from "react";
import { call, setUser } from "./api";
import Settings from "./Settings";
import { Icon, type Spec, type User } from "./ui";
import Upload from "./screens/Upload";
import SpecScreen from "./screens/SpecScreen";
import MapScreen from "./screens/MapScreen";
import Checks from "./screens/Checks";
import Workflow from "./screens/Workflow";
import Export from "./screens/Export";

const STEPS = ["Upload", "Spec", "CO-PO-PSO Map", "Checks", "Workflow", "Export"];

export default function App() {
  const [settings, setSettings] = useState(false);
  const [health, setHealth] = useState<"up" | "down" | "...">("...");
  const [users, setUsers] = useState<User[]>([]);
  const [me, setMe] = useState<User | null>(null);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    call("/health").then(() => setHealth("up")).catch(() => setHealth("down"));
    call<User[]>("/users").then((u) => { setUsers(u); setUser(u[0].email); setMe(u[0]); }).catch((e) => setError(e.message));
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setError("");
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  const switchUser = (u: User) => { setUser(u.email); setMe(u); if (spec) run("Loading", async () => setSpec(await call(`/specs/${spec.id}`))); };
  const open = (id: string, goTo = 1) => run("Loading", async () => { setSpec(await call(`/specs/${id}`)); setStep(goTo); });
  const post = (path: string, body: unknown) => run("Saving", async () => setSpec(await call(path, { method: "POST", body: JSON.stringify(body) })));
  const patch = (body: unknown) => run("Saving", async () => setSpec(await call(`/specs/${spec.id}`, { method: "PATCH", body: JSON.stringify(body) })));
  const act = { spec, me, post, patch, go: setStep };

  return (
    <div className="min-h-screen bg-background text-on-surface">
      <header className="fixed top-0 inset-x-0 h-14 bg-surface-container border-b border-outline-variant z-50 flex items-center justify-between px-6">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center text-on-primary"><Icon name="architecture" /></div>
            <span className="text-headline-sm tracking-tight">SpecForge</span>
            <span className="hidden md:inline text-body-sm text-on-surface-variant">Course Specification Builder</span>
          </div>
          <div className="h-4 w-px bg-outline-variant" />
          <div className="flex bg-background p-0.5 rounded-lg border border-outline-variant" role="group" aria-label="Role">
            {users.map((u) => (
              <button key={u.email} onClick={() => switchUser(u)} title={u.name}
                className={`px-2.5 py-1 rounded-md text-label-sm ${me?.email === u.email ? "bg-primary-container text-white" : "text-on-surface-variant hover:text-on-surface"}`}>
                {u.role === "hod" ? "HOD" : u.role[0].toUpperCase() + u.role.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {spec && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-surface-container-high rounded-lg border border-outline-variant">
              <span className="font-mono text-label-md text-primary">{spec.model.header.code}</span>
              <span className="text-outline-variant">|</span>
              <span className="text-body-sm truncate max-w-[220px]">{spec.model.header.title}</span>
            </div>
          )}
          {spec && <span className="chip"><span className={`w-1.5 h-1.5 rounded-full ${spec.status === "Approved" ? "bg-tertiary" : spec.status === "Returned" ? "bg-error" : "bg-primary animate-pulse"}`} />{spec.status}</span>}
          <span className="chip" title="API status"><span className={`w-1.5 h-1.5 rounded-full ${health === "up" ? "bg-tertiary" : "bg-error"}`} />API {health}</span>
          <button className="w-8 h-8 flex items-center justify-center rounded-lg border border-outline-variant text-on-surface-variant hover:text-on-surface" onClick={() => setSettings(true)} aria-label="Settings"><Icon name="settings" /></button>
        </div>
      </header>

      <aside className="fixed left-0 top-14 bottom-0 w-60 bg-surface-container border-r border-outline-variant z-40 hidden md:flex flex-col justify-between">
        <div className="py-3">
          <div className="px-3 pb-2 mb-1 border-b border-outline-variant text-label-sm uppercase tracking-wider text-outline">Specification Lifecycle</div>
          <nav className="flex flex-col gap-1 px-1">
            {STEPS.map((s, i) => (
              <button key={s} onClick={() => setStep(i)}
                className={`flex items-center gap-2 px-2 py-2 rounded-lg text-left text-body-md ${step === i ? "bg-surface-container-high text-primary" : "text-on-surface-variant hover:bg-surface-container-high"}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[11px] ${step === i ? "bg-primary-container text-white" : "bg-surface-container-high"}`}>{i + 1}</span>{s}
              </button>
            ))}
          </nav>
        </div>
        <div className="p-3 border-t border-outline-variant text-[11px] text-outline">
          <div className="flex justify-between mb-1.5"><span>Signed in as</span><span className="text-on-surface">{me?.name ?? "-"}</span></div>
          <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden"><div className="bg-gradient-to-r from-primary to-primary-container h-1.5" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
          <div className="mt-1 flex justify-between"><span>Step {step + 1} of {STEPS.length}</span><span className="text-primary">{spec ? `${spec.output.defects.length} defects` : "No spec open"}</span></div>
        </div>
      </aside>

      <div className="md:pl-60">
        <main className="pt-14 px-6 pb-16 min-h-screen max-w-[1400px]">
          <div className="md:hidden flex gap-1 overflow-x-auto py-3">{STEPS.map((s, i) => <button key={s} className={`chip ${step === i ? "text-primary" : ""}`} onClick={() => setStep(i)}>{i + 1}. {s}</button>)}</div>
          {busy && <div className="mt-4 card !py-3 flex items-center gap-2 text-body-md"><Icon name="progress_activity" className="animate-spin text-primary" />{busy}...</div>}
          {error && <div className="mt-4 rounded-lg border border-error bg-error-container text-on-error-container px-4 py-3 text-body-md flex items-center gap-2"><Icon name="error" />{error}</div>}
          <div className="mt-4">
            {step === 0 && <Upload me={me} busy={!!busy} run={run} open={open} onSettings={() => setSettings(true)} current={spec} />}
            {step === 1 && <SpecScreen {...act} />}
            {step === 2 && <MapScreen {...act} />}
            {step === 3 && <Checks {...act} />}
            {step === 4 && <Workflow {...act} />}
            {step === 5 && <Export {...act} />}
          </div>
        </main>
      </div>
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}
