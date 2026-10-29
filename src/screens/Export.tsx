// Step 6: preview of the filled official template, document checks, print to PDF and downloads.
import { currentUserEmail, download } from "../api";
import { CardHead, Empty, Icon, PageHead, type Act } from "../ui";

// The nine numbered sections of the official template, in order, read from the rendered document itself.
function sectionsInOrder(html: string): boolean {
  const heads = [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("h2")].map((h) => Number(h.textContent?.trim().match(/^(\d+)\./)?.[1]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].every((n, i) => heads.filter(Number.isFinite)[i] === n);
}

// Opens the document in a new tab and starts the browser's print dialog (Save as PDF).
async function printPdf(id: string) {
  const res = await fetch(`/api/v1/specs/${id}/export/spec.html?inline=1`, { headers: { "x-user-email": currentUserEmail() } });
  const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/html" }));
  const w = window.open(url, "_blank");
  w?.addEventListener("load", () => w.print());
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const FILES: [string, string, string][] = [
  ["spec.html", "Course specification", "The official template, filled in (HTML)"],
  ["specforge_output.json", "Course data", "Outcomes, map, hours, assessment and issues (JSON)"],
  ["validation_report.html", "Validation report", "Rule checks and every issue found (HTML)"],
];

export default function Export({ spec, go }: Act) {
  if (!spec) return <Empty go={go} />;
  const approved = spec.status === "Approved";
  const check = (id: string) => spec.report.checks.find((c: any) => c.id === id)?.ok;
  const list: [string, boolean][] = [
    ["All nine template sections, in order", sectionsInOrder(spec.html)],
    ["No sample text left from the template", !!check("V7")],
    ["Assessment weightages total 100%", !!check("V6")],
    ["Every course outcome in sections 3, 5 and 7", !!check("V1")],
  ];

  return (
    <>
      <PageHead title="Export" sub={approved ? "Approved. Exports are final copies." : "Exports carry a DRAFT watermark until the HOD approves the specification."} />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <div className="card !p-0 overflow-hidden">
          <iframe title="Course specification preview" srcDoc={spec.html} sandbox="allow-scripts allow-modals" className="w-full h-[900px] bg-white" />
        </div>
        <div className="flex flex-col gap-6 h-fit">
          <div className="card">
            <CardHead icon="fact_check" title="Document checks" />
            <ul className="space-y-1.5">{list.map(([t, ok]) => (
              <li key={t} className={`text-body-sm flex items-center gap-1.5 ${ok ? "text-on-surface" : "text-error"}`}><Icon name={ok ? "check" : "close"} className={`text-[16px] ${ok ? "text-tertiary" : ""}`} />{t}</li>
            ))}</ul>
          </div>
          <div className="card">
            <CardHead icon="download" title="Downloads" />
            <button className="btn-primary w-full justify-center mb-3" onClick={() => printPdf(spec.id)}><Icon name="print" />Print or save as PDF</button>
            <div className="flex flex-col divide-y divide-outline-variant">
              {FILES.map(([name, title, sub]) => (
                <button key={name} onClick={() => download(`/specs/${spec.id}/export/${name}`, name)} className="flex items-center justify-between gap-3 py-3 text-left hover:text-primary">
                  <span><span className="block text-label-lg">{title}</span><span className="block text-body-sm text-on-surface-variant">{sub}</span></span>
                  <Icon name="download" className="shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
