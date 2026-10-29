import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { ApiError, fail, ok } from "./envelope.js";
import { configFromRequest, generateJson } from "./llm.js";
import { router } from "./routes.js";
import { securityHeaders } from "./security.js";

const app = express();
app.disable("x-powered-by");
app.use(securityHeaders);
app.use(express.json({ limit: "2mb" }));

const api = express.Router();

api.get("/health", (_req, res) => ok(res, { status: "up" }));

// "Test key" button in Settings. Proves the key and model work, nothing more.
api.get("/llm-check", async (req, res, next) => {
  try {
    const cfg = configFromRequest(req);
    const out = await generateJson('Return exactly {"pong": true}', z.object({ pong: z.boolean() }), cfg);
    ok(res, { provider: cfg.provider, model: cfg.model, reply: out });
  } catch (e) {
    next(e);
  }
});

// Parsing, POST /generate (the scorer's route) and the approval workflow.
api.use(router);

app.use("/api/v1", api);
app.use("/api", (_req, res) => fail(res, 404, "NOT_FOUND", "No such route"));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) return fail(res, err.status, err.code, err.message);
  if (err instanceof multer.MulterError) return fail(res, 400, "BAD_UPLOAD", err.code === "LIMIT_FILE_SIZE" ? "A file is larger than 15 MB." : "Upload the files in the 'spec' and 'blueprint' fields.");
  const type = (err as { type?: string })?.type;
  if (type === "entity.parse.failed") return fail(res, 400, "BAD_JSON", "The request body is not valid JSON.");
  if (type === "entity.too.large") return fail(res, 413, "TOO_LARGE", "The request body is too large.");
  console.error("Unhandled:", err instanceof Error ? err.message : "unknown error"); // never log headers or keys
  fail(res, 500, "SERVER_ERROR", "Something went wrong on the server.");
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}/api/v1`));
