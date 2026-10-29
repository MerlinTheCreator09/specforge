// Fills the official HTML templates in templates/ with the course model. Layout, CSS, numbering and the
// "Download as PDF" script stay as they are; only the sample content is replaced. All text goes in via
// cheerio's .text(), so document content can never inject markup or scripts.
import { readFileSync } from "node:fs";
import * as cheerio from "cheerio";
import { COLUMNS } from "./config.js";
import type { CourseModel } from "./model.js";

export type TemplateId = "integrated" | "non_lab";
const FILES: Record<TemplateId, string> = { integrated: "integrated_lab.html", non_lab: "non_lab.html" };
const RAW: Record<TemplateId, string> = {
  integrated: readFileSync(new URL(`../templates/${FILES.integrated}`, import.meta.url), "utf8"),
  non_lab: readFileSync(new URL(`../templates/${FILES.non_lab}`, import.meta.url), "utf8"),
};

// ---------- Template choice ----------
export function detectTemplate(ltp: string, courseType: string): { template: TemplateId; signals: string[] } {
  const practical = Number(ltp.split(":")[2] ?? 0);
  const typeHasLab = /laborator|\blab\b|practical/i.test(courseType);
  const signals = [
    `Credit structure ${ltp || "(missing)"}: Practical = ${Number.isFinite(practical) ? practical : "?"}`,
    `Course type "${courseType}" ${typeHasLab ? "mentions" : "does not mention"} a laboratory`,
  ];
  return { template: practical > 0 || typeHasLab ? "integrated" : "non_lab", signals };
}

// ---------- Sample text the templates ship with (must never survive into an output) ----------
// Collected from the template itself on load, so nothing about the sample course is written in code.
function collectSampleStrings(html: string): string[] {
  const $ = cheerio.load(html);
  const out = new Set<string>();
  const add = (s: string) => { const t = s.replace(/\s+/g, " ").trim(); if (t) out.add(t); };
  add($("h1 [contenteditable]").first().text());
  $("h1").nextAll("table").first().find("tr").each((_, tr) => {
    const label = $(tr).find("td").first().text().trim();
    if (/title|code|department/i.test(label)) add($(tr).find("td").eq(1).text());
  });
  $("ul.co-list li").each((_, li) => add($(li).text()));
  $(".unit-row [contenteditable]").each((_, s) => add($(s).text()));
  const summary = sectionHeading($, 1).nextAll("p").first().text();
  add(summary);
  return [...out];
}
export const SAMPLE_STRINGS: string[] = [...new Set([...collectSampleStrings(RAW.integrated), ...collectSampleStrings(RAW.non_lab)])];

// Short, distinctive tokens from the sample header (title, code, department) are the ones most likely to leak.
export const SAMPLE_TOKENS: string[] = SAMPLE_STRINGS.filter((s) => s.length <= 40);

function sectionHeading($: cheerio.CheerioAPI, n: number) {
  return $("h2").filter((_, h) => new RegExp(`^\\s*${n}\\.`).test($(h).text())).first();
}

const pad = (n: number | null | undefined) => (n == null ? "00" : String(n).padStart(2, "0"));

function setRowValue($: cheerio.CheerioAPI, table: cheerio.Cheerio<any>, label: RegExp, value: string) {
  table.find("tr").each((_, tr) => {
    const cells = $(tr).children("td");
    if (label.test(cells.first().text())) cells.eq(1).text(value);
  });
}

export function renderSpec(model: CourseModel, opts: { watermark: boolean }): string {
  const $ = cheerio.load(RAW[model.template]);
  const h = model.header;

  // Header
  $("h1 [contenteditable]").first().text(h.title);
  const headerTable = $("h1").nextAll("table").first();
  setRowValue($, headerTable, /course title/i, h.title);
  setRowValue($, headerTable, /course code/i, h.code);
  setRowValue($, headerTable, /course type/i, h.course_type);
  setRowValue($, headerTable, /department/i, h.department);
  setRowValue($, headerTable, /faculty/i, h.faculty);

  // 1. Summary
  sectionHeading($, 1).nextAll("p").first().text(model.summary);

  // 2. Size and credits
  const c = model.credits;
  const creditTable = sectionHeading($, 2).nextAll("table").first();
  setRowValue($, creditTable, /number of credits/i, c.number_of_credits);
  setRowValue($, creditTable, /credit structure/i, c.ltp);
  setRowValue($, creditTable, /hours of interaction/i, c.total_hours_of_interaction == null ? "" : String(c.total_hours_of_interaction));
  setRowValue($, creditTable, /weeks/i, c.weeks == null ? "" : String(c.weeks));
  setRowValue($, creditTable, /department responsible/i, c.department_responsible);
  setRowValue($, creditTable, /course marks/i, c.total_course_marks == null ? "" : String(c.total_course_marks));
  setRowValue($, creditTable, /pass criterion/i, c.pass_criterion);
  setRowValue($, creditTable, /attendance/i, c.attendance_requirement);

  // 3. Course outcomes (the template's CSS numbers them CO1, CO2, ...)
  const coList = $("ul.co-list").first().empty();
  for (const co of model.course_outcomes) coList.append($("<li></li>").text(co.statement));

  // 4. Course contents
  const rows = $(".unit-row");
  const anchor = rows.first().prev();
  rows.remove();
  let last: cheerio.Cheerio<any> = anchor;
  for (const u of model.units) {
    const div = $('<div class="unit-row"></div>');
    div.append($('<span class="static unit-label" style="padding: 1px 3px; border-radius: 2px;"></span>').text(`Unit ${u.number}:`));
    div.append(" ");
    div.append($('<span contenteditable="true"></span>').text(u.content ? `${u.title}: ${u.content}` : u.title));
    if (model.template === "integrated" && u.lab) {
      div.append("<br>");
      div.append($('<span class="static unit-label" style="padding: 1px 3px; border-radius: 2px;"></span>').text("Lab Exercises:"));
      div.append(" ");
      div.append($('<span contenteditable="true"></span>').text(u.lab));
    }
    last.after(div);
    last = div;
  }

  // 5. CO-PO-PSO map
  const mapBody = $("table.copo-table tbody").first();
  const legend = mapBody.find("tr.copo-legend-row").first().clone();
  mapBody.empty();
  for (const co of model.course_outcomes) {
    const tr = $("<tr></tr>");
    tr.append($('<td class="text-center" contenteditable="true" style="font-weight:bold;"></td>').text(co.id));
    for (const col of COLUMNS) {
      const cell = model.map[co.id]?.[col];
      const td = $('<td class="text-center" contenteditable="true"></td>').text(cell ? String(cell.level) : "");
      if (cell) td.attr("title", cell.justification);
      tr.append(td);
    }
    mapBody.append(tr);
  }
  mapBody.append(legend);

  // 6. Teaching and learning
  fillTeaching($, model);

  // 7. Assessment
  fillAssessment($, model);

  // 8. Achieving COs
  const skills = sectionHeading($, 8).nextAll("table").first().find("tbody").first().empty();
  model.achieving.forEach((row, i) => {
    const tr = $("<tr></tr>");
    tr.append($('<td class="static text-center"></td>').text(`${i + 1}.`));
    tr.append($('<td class="static"></td>').text(row.skill));
    tr.append($('<td class="static"></td>').text(row.how));
    skills.append(tr);
  });

  // 9. Resources (a. to e. in template order)
  const lists = sectionHeading($, 9).nextAll("div").first().find("ol");
  const r = model.resources;
  [r.essential, r.recommended, r.magazines, r.websites, r.other].forEach((items, i) => {
    const ol = lists.eq(i).empty();
    for (const item of items) ol.append($("<li></li>").text(item));
  });

  if (opts.watermark) {
    $("head").append(
      "<style>body::after{content:'DRAFT';position:fixed;top:45%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);" +
        "font:bold 140px Calibri,sans-serif;color:rgba(200,0,0,.12);pointer-events:none;z-index:999}" +
        "@media print{body::after{position:fixed}}</style>",
    );
  }
  return $.html();
}

function fillTeaching($: cheerio.CheerioAPI, model: CourseModel) {
  const t = model.teaching;
  const sum = (o: Record<string, number | null>) => Object.values(o).reduce<number>((a, b) => a + (b ?? 0), 0);
  const groups: { label: RegExp; total: number; leaves: [RegExp, number | null][] }[] = [
    { label: /face to face lectures/i, total: t.lectures ?? 0, leaves: [] },
    { label: /^demonstrations/i, total: sum(t.demonstrations), leaves: [[/videos/i, t.demonstrations.videos], [/physical models/i, t.demonstrations.physical_models], [/on a computer/i, t.demonstrations.computer]] },
    { label: /^numeracy/i, total: sum(t.numeracy), leaves: [[/numerical problems/i, t.numeracy.numerical_problems]] },
    { label: /^practical/i, total: sum(t.practicals), leaves: [[/course laboratory/i, t.practicals.course_lab], [/computer laboratory/i, t.practicals.computer_lab], [/workshop/i, t.practicals.workshop], [/clinical/i, t.practicals.clinical_lab], [/hospital/i, t.practicals.hospital], [/model studio/i, t.practicals.model_studio]] },
    { label: /^others/i, total: sum(t.others), leaves: [[/case study/i, t.others.case_study], [/guest lecture/i, t.others.guest_lecture], [/field visit/i, t.others.field_visit], [/brain ?storming/i, t.others.brainstorming], [/group discussions/i, t.others.group_discussions], [/innovations/i, t.others.innovations]] },
  ];
  const table = sectionHeading($, 6).nextAll("table").first();
  table.find("tbody tr").each((_, tr) => {
    const cells = $(tr).children("td");
    const label = cells.first().text().replace(/\s+/g, " ").trim();
    if (/^total duration/i.test(label)) { cells.last().text(pad(model.teaching_total)); return; }
    if (/test|examination/i.test(label) && cells.first().attr("colspan")) { cells.last().text(pad(t.tests_exams)); return; }
    for (const g of groups) {
      if (cells.first().attr("colspan") && g.label.test(label)) { cells.last().text(pad(g.total)); return; }
      for (const [re, v] of g.leaves) {
        if (!cells.first().attr("colspan") && re.test(label)) {
          cells.eq(1).text(pad(v));
          if (cells.length > 2) cells.eq(2).text("");
          return;
        }
      }
    }
  });
}

function fillAssessment($: cheerio.CheerioAPI, model: CourseModel) {
  const a = model.assessment;
  const heading = sectionHeading($, 7);
  const table = heading.nextAll("table").first();
  const before = table.prevUntil(heading, "p").get().reverse();
  const after = table.nextUntil("h2", "p");
  before.forEach((p, i) => { if (a.paragraphs_before[i] != null) $(p).text(a.paragraphs_before[i]); else $(p).remove(); });
  for (const extra of a.paragraphs_before.slice(before.length)) table.before($('<p contenteditable="true"></p>').text(extra));
  after.each((i, p) => { if (a.paragraphs_after[i] != null) $(p).text(a.paragraphs_after[i]); else $(p).remove(); });

  const comps = a.groups.flatMap((g) => g.components);
  const n = comps.length;
  const thead = table.find("thead").first();
  const note = table.find("tbody tr").last().find("td").first().text();
  thead.empty();
  const th = (cls = "static text-center") => $(`<th class="${cls}"></th>`);
  const row = (cells: cheerio.Cheerio<any>[]) => { const tr = $("<tr></tr>"); for (const c of cells) tr.append(c); return tr; };
  thead.append($("<tr></tr>").append(th().attr("colspan", String(n + 1)).text("Focus of COs on each Component or Subcomponent of Evaluation")));
  const groupRow = $("<tr></tr>").append(th().attr("rowspan", "4").attr("style", "vertical-align: middle;").text("Course Outcome"));
  for (const g of a.groups) {
    const cell = th().attr("colspan", String(Math.max(g.components.length, 1)));
    cell.append(textSpan($, g.name)).append("<br>").append(textSpan($, `(Weightage: ${fmt(g.weight_percent)} %)`));
    groupRow.append(cell);
  }
  thead.append(groupRow);
  thead.append(row(comps.map((c) => th().text(`Weightage: ${fmt(c.weight_percent)} %`))));
  thead.append(row(comps.map((c) => th().text(c.name))));
  thead.append(row(comps.map((c) => th().text(c.marks == null ? "" : `${c.marks} Marks`))));

  const tbody = table.find("tbody").first().empty();
  for (const co of model.course_outcomes) {
    const tr = $("<tr></tr>").append($('<td class="static text-center" style="font-weight: bold;"></td>').text(co.id));
    for (const comp of comps) tr.append($('<td class="text-center" contenteditable="true"></td>').text(a.coverage[co.id]?.includes(comp.name) ? "X" : ""));
    tbody.append(tr);
  }
  if (note) tbody.append($("<tr></tr>").append($('<td class="static" style="font-style: italic;"></td>').attr("colspan", String(n + 1)).text(note)));
}

const fmt = (n: number | null) => (n == null ? "" : String(Math.round(n * 100) / 100));
const textSpan = ($: cheerio.CheerioAPI, text: string) => $("<span></span>").text(text);
