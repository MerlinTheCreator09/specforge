// npm run dump [file...]   Prints the text the server extracts from input files (default: sample-inputs). For debugging the parser.
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { extractText } from "../server/extract.js";

const files = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("sample-inputs").map((f) => join("sample-inputs", f));
for (const f of files) {
  const { text, kind } = await extractText(basename(f), readFileSync(f));
  console.log(`\n===== ${f} (${kind}, ${text.length} chars)\n${text}`);
}
