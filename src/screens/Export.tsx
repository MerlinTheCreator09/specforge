// Step 6: the filled official template as a live preview, plus the three downloads.
import { download } from "../api";
import { CardHead, Empty, Icon, PageHead, type Act } from "../ui";

export default function Export({ spec, go }: Act) {
  if (!spec) return <Empty go={go} />;
  const approved = spec.status === "Approved";
  const files: [string, string, string, string][] = [
    ["spec.html", "html", "Corrected specification", "Official template, self-contained. Open it and press Download as PDF."],
    ["specforge_output.json", "data_object", "Scoring file", "Validated against the output schema."],
    ["validation_report.html", "fact_check", "Validation report", "Rule checks V1-V10, defects and fixes."],
  ];

  return (
    <>
      <PageHead stage="06" label="Distribution" title="Institutional Dossier Export">
        <span className={`chip ${approved ? "text-tertiary" : "text-warning"}`}><Icon name={approved ? "verified" : "draft"} />{approved ? "Approved: final copy" : "DRAFT watermark until HOD approval"}</span>
      </PageHead>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] gap-6">
        <div className="card !p-0 overflow-hidden">
          <div className="p-4 border-b border-outline-variant flex items-center justify-between">
            <span className="text-headline-sm">Preview: {spec.model.template === "integrated" ? "Integrated (theory + lab)" : "Non-Lab"} template</span>
          </div>
          <iframe title="Corrected specification preview" srcDoc={spec.html} sandbox="allow-scripts allow-modals" className="w-full h-[900px] bg-white" />
        </div>
        <div className="card h-fit">
          <CardHead icon="inventory_2" title="Distribution Package" sub="Downloads use the current version" />
          <div className="flex flex-col gap-2">
            {files.map(([name, icon, title, sub], i) => (
              <button key={name} onClick={() => download(`/specs/${spec.id}/export/${name}`, name)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left border ${i === 0 ? "bg-primary-container border-primary-container text-white" : "bg-surface-container-high border-outline-variant"}`}>
                <span className="flex items-center gap-3"><Icon name={icon} /><span><span className="block text-label-lg">{title}</span><span className={`block text-body-sm ${i === 0 ? "text-white/80" : "text-on-surface-variant"}`}>{sub}</span></span></span>
                <Icon name="download" />
              </button>
            ))}
          </div>
          <p className="text-body-sm text-outline mt-4">PDF: use the "Download as PDF" button inside the preview or the downloaded spec.html (browser print-to-PDF).</p>
        </div>
      </div>
    </>
  );
}
