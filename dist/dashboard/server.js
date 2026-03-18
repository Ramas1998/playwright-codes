"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/dashboard/server.ts
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const app = (0, express_1.default)();
// ---- Config ----
const OUTPUT_DIR = process.env.FLAKY_GUARDIAN_OUTPUT_DIR || ".flaky-guardian";
const SQLITE_PATH = process.env.FLAKY_GUARDIAN_SQLITE_PATH || "";
const PORT = Number(process.env.FLAKY_GUARDIAN_PORT || 4173);
// optional SQLite DB (for large history)
let db = null;
if (SQLITE_PATH) {
    try {
        db = new better_sqlite3_1.default(SQLITE_PATH);
        // Table is created by SQLiteStorage, so just trust it exists
        console.log(`✅ Flaky Guardian dashboard using SQLite at: ${SQLITE_PATH}`);
    }
    catch (err) {
        console.warn(`⚠️ Failed to open SQLite at ${SQLITE_PATH}, falling back to JSON only.`, err);
        db = null;
    }
}
app.use(express_1.default.json());
// ---------- Utility: locate public dir for dashboard UI ----------
function resolvePublicDir() {
    const candidates = [
        process.env.FLAKY_GUARDIAN_PUBLIC_DIR,
        // when running from dist/dashboard/server.js
        path_1.default.resolve(__dirname, "../../public"),
        // when running directly with ts-node from project root
        path_1.default.resolve(process.cwd(), "public"),
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate))
            return candidate;
    }
    // last resort – just use cwd/public (may 404 if not present)
    return path_1.default.resolve(process.cwd(), "public");
}
const PUBLIC_DIR = resolvePublicDir();
console.log(`📊 Serving dashboard static files from: ${PUBLIC_DIR}`);
// JSON backend: each run-*.json = one run
function loadRunsFromJson() {
    const dir = path_1.default.resolve(process.cwd(), OUTPUT_DIR);
    if (!fs_1.default.existsSync(dir))
        return [];
    const files = fs_1.default
        .readdirSync(dir)
        .filter((f) => f.startsWith("run-") && f.endsWith(".json"));
    const runs = [];
    for (const file of files) {
        const filePath = path_1.default.join(dir, file);
        try {
            const raw = fs_1.default.readFileSync(filePath, "utf-8");
            const parsed = JSON.parse(raw);
            const samples = parsed.samples || [];
            const runId = path_1.default.basename(file, ".json"); // e.g. run-1699999999999
            if (samples.length > 0) {
                runs.push({ runId, samples });
            }
        }
        catch (err) {
            console.warn(`⚠️ Failed to read JSON run file: ${filePath}`, err);
        }
    }
    // sort by first timestamp in run
    runs.sort((a, b) => {
        const aAt = a.samples[0]?.runAt ?? "";
        const bAt = b.samples[0]?.runAt ?? "";
        return aAt.localeCompare(bAt);
    });
    return runs;
}
// SQLite backend: all samples in one table
function loadAllSamplesFromSqlite() {
    if (!db)
        return [];
    const rows = db
        .prepare(`
      SELECT
        test_id  AS testId,
        title    AS title,
        file     AS file,
        line     AS line,
        status   AS status,
        duration_ms AS durationMs,
        run_at   AS runAt,
        attempt  AS attempt
      FROM test_runs
    `)
        .all();
    return rows;
}
// Fallback: combine all JSON runs into one big sample list
function loadAllSamplesFromJson() {
    const runs = loadRunsFromJson();
    return runs.flatMap((r) => r.samples);
}
function loadAllSamples() {
    if (db) {
        return loadAllSamplesFromSqlite();
    }
    return loadAllSamplesFromJson();
}
// ---------- Aggregation helpers ----------
function makeRunSummary(run) {
    const { runId, samples } = run;
    const totalTests = samples.length;
    const failed = samples.filter((s) => s.status === "failed" || s.status === "timedOut").length;
    const passed = samples.filter((s) => s.status === "passed").length;
    const timestamps = samples.map((s) => s.runAt).filter(Boolean);
    const startedAt = timestamps.length
        ? timestamps.slice().sort()[0]
        : undefined;
    const finishedAt = timestamps.length
        ? timestamps.slice().sort()[timestamps.length - 1]
        : undefined;
    return {
        runId,
        totalTests,
        passed,
        failed,
        startedAt,
        finishedAt,
    };
}
function computeFlakySummary(samples) {
    const byTest = new Map();
    for (const s of samples) {
        const key = s.testId;
        const bucket = byTest.get(key);
        const isFailure = s.status !== "passed";
        if (!bucket) {
            byTest.set(key, {
                first: s,
                total: 1,
                failures: isFailure ? 1 : 0,
            });
        }
        else {
            bucket.total += 1;
            if (isFailure)
                bucket.failures += 1;
        }
    }
    const result = [];
    for (const [, value] of byTest) {
        const { first, total, failures } = value;
        const passRate = total === 0 ? 0 : (total - failures) / total;
        const isFlaky = failures > 0 && passRate > 0 && passRate < 1;
        result.push({
            testId: first.testId,
            title: first.title,
            file: first.file,
            totalRuns: total,
            failures,
            passRate,
            isFlaky,
        });
    }
    // Sort most flaky / most failures first
    result.sort((a, b) => {
        if (a.isFlaky !== b.isFlaky) {
            return a.isFlaky ? -1 : 1;
        }
        return b.failures - a.failures;
    });
    return result;
}
// ---------- API Endpoints ----------
// List all runs (JSON-based runs)
app.get("/api/runs", (_req, res) => {
    const runs = loadRunsFromJson();
    const summaries = runs.map(makeRunSummary);
    res.json(summaries);
});
// Detailed info for a single run
app.get("/api/runs/:runId", (req, res) => {
    const { runId } = req.params;
    const runs = loadRunsFromJson();
    const run = runs.find((r) => r.runId === runId);
    if (!run) {
        res.status(404).json({ error: `Run ${runId} not found` });
        return;
    }
    const summary = makeRunSummary(run);
    res.json({
        ...summary,
        samples: run.samples,
    });
});
// Global flaky summary (uses SQLite if available, otherwise JSON)
app.get("/api/flaky", (_req, res) => {
    const samples = loadAllSamples();
    const flaky = computeFlakySummary(samples);
    res.json(flaky);
});
// ---------- Static dashboard UI ----------
app.use(express_1.default.static(PUBLIC_DIR));
app.get("/", (_req, res) => {
    res.sendFile(path_1.default.join(PUBLIC_DIR, "index.html"));
});
// ---------- Start server ----------
app.listen(PORT, () => {
    console.log(`🚀 Flaky Guardian dashboard running at http://localhost:${PORT}`);
    console.log(`   Using ${db ? "SQLite" : "JSON"} backend for flaky analysis.`);
});
