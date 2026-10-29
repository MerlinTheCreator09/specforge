// Turns an uploaded file into plain text. Tables become "| cell | cell |" rows so numbers stay next to their labels.
// The text is data for the parser and the AI, never instructions.
import * as cheerio from "cheerio";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { ApiError } from "./envelope.js";

export type Extracted = { text: string; kind: "docx" | "doc" | "pdf" | "html" };

const MAX_CHARS = 120_000;

function detectKind(name: string, buf: Buffer): Extracted["kind"] {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const zip = buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  const ole = buf.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
  const pdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  // Trust the file's bytes, not just its name.
  if (zip && ext !== "doc") return "docx";
  if (ole) return "doc";
  if (pdf) return "pdf";
  if (ext === "html" || ext === "htm") return "html";
  if (zip) return "docx";
  throw new ApiError(400, "UNSUPPORTED_FILE", `Cannot read "${name}". Upload a .docx, .doc, .pdf or .html file.`);
}

function clean(s: string): string {
  return s.replace(/ /g, " ").replace(/[ \t]+/g, " ").trim();
}

// Walks HTML in document order: paragraphs and headings become lines, tables become pipe rows.
export function htmlToText(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript, button, template").remove();
  const lines: string[] = [];
  const walk = (el: any) => {
    $(el).children().each((_, child) => {
      const tag = (child as any).tagName?.toLowerCase();
      if (tag === "table") {
        lines.push("[table]");
        $(child).find("tr").each((_, tr) => {
          // Keep merged-cell widths: a group header like "CE (60 %)" spanning three columns tells which components belong to it.
          const cells = $(tr).children("td, th").map((_, c) => {
            const span = Number($(c).attr("colspan") ?? 1);
            const t = clean($(c).text()).replace(/\|/g, "/");
            return span > 1 ? `${t} {spans ${span} columns}` : t;
          }).get();
          if (cells.some(Boolean)) lines.push("| " + cells.join(" | ") + " |");
        });
        lines.push("[/table]");
      } else if (tag && /^(p|h[1-6]|li)$/.test(tag)) {
        const t = clean($(child).text());
        if (t) lines.push(t);
      } else {
        walk(child);
      }
    });
  };
  walk($("body").length ? $("body") : $.root());
  return lines.join("\n");
}

// Word 97 binary: cells end in tabs inside rows; keep them as pipes.
function docBodyToText(body: string): string {
  return body
    .split(/\r?\n/)
    .map((line) => (line.includes("\t") ? "| " + line.split("\t").map(clean).join(" | ") + " |" : clean(line)))
    .filter(Boolean)
    .join("\n");
}

export async function extractText(name: string, buf: Buffer): Promise<Extracted> {
  const kind = detectKind(name, buf);
  let text = "";
  try {
    if (kind === "docx") text = htmlToText((await mammoth.convertToHtml({ buffer: buf })).value);
    else if (kind === "doc") text = docBodyToText((await new WordExtractor().extract(buf)).getBody());
    else if (kind === "pdf") text = (await pdfParse(buf)).text.split("\n").map(clean).filter(Boolean).join("\n");
    else text = htmlToText(buf.toString("utf8"));
  } catch {
    throw new ApiError(400, "UNREADABLE_FILE", `Could not read "${name}". Is the file damaged or password protected?`);
  }
  if (!text.trim()) throw new ApiError(400, "EMPTY_FILE", `No text found in "${name}".`);
  return { text: text.slice(0, MAX_CHARS), kind };
}
