// Step 6: the filled official template as a live preview, and the submission files in the portal's format.
import Submission from "../Submission";
import { CardHead, Empty, Icon, PageHead, type Act } from "../ui";

export default function Export({ spec, me, go }: Act) {
  if (!spec) return <Empty go={go} />;
  const approved = spec.status === "Approved";

  return (
    <>
      <PageHead stage="06" label="Distribution" title="Institutional Dossier Export">
        <span className={`chip ${approved ? "text-tertiary" : "text-warning"}`}><Icon name={approved ? "verified" : "draft"} />{approved ? "Approved: final copy" : "DRAFT watermark until HOD approval"}</span>
      </PageHead>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6">
        <div className="card !p-0 overflow-hidden">
          <div className="p-4 border-b border-outline-variant text-headline-sm">Preview: {spec.model.template === "integrated" ? "Integrated (theory + lab)" : "Non-Lab"} template</div>
          <iframe title="Corrected specification preview" srcDoc={spec.html} sandbox="allow-scripts allow-modals" className="w-full h-[900px] bg-white" />
        </div>
        <div className="card h-fit">
          <CardHead icon="upload" title="Submission package" sub="The files the portal's Submit page asks for" />
          <ul className="text-body-sm text-on-surface-variant mb-4 space-y-1">
            <li><span className="font-mono text-primary">outputs/specforge_output.json</span> · Output file, 80 points</li>
            <li><span className="font-mono text-primary">outputs/spec.html</span> · Spec document, 20 points</li>
            <li><span className="font-mono text-primary">outputs/specforge.zip</span> · your project with outputs/ inside (optional instead of the two files)</li>
          </ul>
          <Submission body={{ spec_id: spec.id }} disabled={me?.role !== "author"} />
          {me?.role !== "author" && <p className="text-body-sm text-outline mt-3 flex items-center gap-1"><Icon name="lock" />Switch to the Author to save submission files.</p>}
          <p className="text-body-sm text-outline mt-4">PDF: press "Download as PDF" inside the preview (browser print-to-PDF). The DRAFT watermark is shown only until approval and is never in the submission files.</p>
        </div>
      </div>
    </>
  );
}
