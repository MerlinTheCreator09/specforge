# Curricula – Course Specification Builder

Curricula turns a messy course specification into a corrected one. Built for the SpecForge Buildathon (RUAS Peenya, 29 Oct 2026) from the event starter.

- **Track:** coder (own editor with AI help)
- **AI tools used:** Claude Code (Anthropic) for writing code; Google Stitch for the UI design (Obsidian theme), converted to React + Tailwind; Claude via the Anthropic API inside the app (bring your own key)
- **Run:** `npm install`, then `npm run dev` (web on 5173, API on 3001) or `npm start` (API only). With the app running: `npm run verify -- anthropic YOUR_KEY`.

## Backend

| Route (under `/api/v1`) | Who | What |
| --- | --- | --- |
| `GET /health`, `GET /llm-check` | anyone | status; test the AI key |
| `POST /generate` | anyone | multipart `spec` (+ optional `blueprint`) -> `{ output, html, report }`. The scorer's route |
| `POST /parse` | Author | structured data extracted from the uploads |
| `GET /users`, `GET /reference` | anyone | seeded users for the role switcher; PO/PSO/Bloom reference |
| `GET /specs`, `GET /specs/:id` | any user | list; full spec with HTML preview, report, log, comments and allowed actions |
| `POST /specs` | Author | upload and generate a new Draft |
| `PATCH /specs/:id` | Author, Draft/Returned only | edit sections (403 otherwise) |
| `POST /specs/:id/template` | Author, Draft/Returned only | override the template with a reason |
| `POST /specs/:id/transitions` | by role | `submit` (Author), `start_review`/`forward`/`return` (Reviewer), `approve`/`return` (HOD) |
| `POST /specs/:id/comments` | any user | comment on a section (1-9) |
| `GET /specs/:id/export/{spec.html,specforge_output.json,validation_report.html}` | any user | downloads; `?inline=1` to preview |

Identity: send `x-user-email` with one of the seeded users in `config/users.json`; the server takes the role from that record.
AI key: `x-llm-provider`, `x-llm-key`, `x-llm-model` headers on AI routes only. The key is never stored, logged or returned.

Pipeline: extract text (mammoth / word-extractor / pdf-parse / cheerio) -> AI parses the spec and blueprint into Zod-validated JSON ->
source-of-truth merge -> Bloom's level from the verb list -> AI map, then code enforces every mapping rule (Bloom ceilings in
`config/rules.json`, PO-5 tool use, quoted evidence for PO-6..PO-10, PSO-1/PSO-2 only) -> plain-code defect rules + AI text review
(each AI finding must quote text that exists in the input) -> official template filled with cheerio -> validation report V1-V10.

---

## Starter notes

Participant portal (sign in, prompts, submit): **https://specforge-arena.vercel.app**

Level 0 is already built: a React app and an Express server that run together, plus a Settings panel where you paste your own AI key.

## Start (5 minutes)

```bash
npm install
npm run dev
```

Open http://localhost:5173. Press **Settings**, choose Gemini or OpenRouter, paste your key, press **Test key**. If it says the key works, you are ready for Level 1.

Don't have a key yet? Ask at the help desk. It is free.

## Where things are

| Folder | What it is |
| --- | --- |
| `kit/` | Handbook, one-page guidelines, primer cards and the prompt pack (`specforge-prompt.json`, every level prompt). |
| `sample-inputs/` | A sample course spec, a blueprint and the PO/PSO reference. Practice here. |
| `templates/` | The two HTML layouts your export must use. |
| `config/` | `po_pso.json` (POs, PSOs, Bloom's levels) and `specforge_output.schema.json` (the format of your output file). |
| `src/`, `server/` | Your app. |
| `outputs/` | Where your exported `specforge_output.json` goes. |

## Working with your AI assistant

This repo has an `AGENTS.md` (also copied as `CLAUDE.md`, `GEMINI.md` and a Cursor rule). Your assistant reads it first. Paste each level's prompt from the handbook, in order.

## Before you submit

With the app running (`npm run dev`), in a second terminal:

```bash
npm run verify -- gemini YOUR_KEY
```

This sends the sample files to your app's `POST /api/v1/generate`, exactly as the organisers will, saves
`outputs/specforge_output.json` and `outputs/spec.html`, and checks the output file. Upload both files on the portal,
or zip the whole project (with `outputs/` inside) and upload just the zip.

Your final score comes from the organisers running your code: your last commit before 15:45, or your latest zip if that is
newer. So `npm install` + `npm start` must work on a fresh copy of your project. Don't commit your key.

## Handing in a zip instead of a repo

No GitHub repo, or it won't push? Upload a `.zip` of your project in **Submit**. If it has `outputs/` inside, the zip alone
is a full submission: both files are read from it.

| Put in the zip | Leave out |
| --- | --- |
| `package.json`, `package-lock.json` | `node_modules/` (the organisers install packages; it makes the zip too big) |
| `server/`, `src/`, `scripts/`, `config/`, `templates/` | `.env` (holds your API key; a zip with one is refused) |
| `index.html`, `tsconfig.json`, `vite.config.ts`, `README.md` | `.git/`, `dist/` |
| `outputs/specforge_output.json`, `outputs/spec.html` (scored) | `kit/`, `sample-inputs/` (optional) |

- **Windows:** open the project folder, select everything except `node_modules` and `.env`, right-click, **Send to**,
  **Compressed (zipped) folder**.
- **Mac:** select the same files in Finder, right-click, **Compress**.
- **Terminal** (Mac, Linux, Git Bash), in the project folder:

```bash
zip -r specforge.zip . -x "node_modules/*" ".git/*" "dist/*" ".env*"
```

Up to 4 MB (this starter zips to about 0.3 MB). Each new zip replaces the last one; zips can be uploaded until 15:45.
