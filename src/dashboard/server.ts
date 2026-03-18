// src/dashboard/server.ts
import express from "express";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";
import { TestResultSample, FlakySummary } from "../types";

const app = express();

// -------------------------------------------------------
// CONFIG
// -------------------------------------------------------
const OUTPUT_DIR = process.env.FLAKY_GUARDIAN_OUTPUT_DIR || ".flaky-guardian";
const SQLITE_PATH = process.env.FLAKY_GUARDIAN_SQLITE_PATH || "";
const PORT = Number(process.env.FLAKY_GUARDIAN_PORT || 4173);

// -------------------------------------------------------
// OPTIONAL SQLITE CONNECTION
// -------------------------------------------------------
let db: Database.Database | null = null;

if (SQLITE_PATH) {
  try {
    db = new Database(SQLITE_PATH);
    console.log(`✅ Using SQLite DB: ${SQLITE_PATH}`);
  } catch (err) {
    console.warn(`⚠️ Failed to open SQLite. Falling back to JSON.`, err);
    db = null;
  }
}

app.use(express.json());

// -------------------------------------------------------
// PUBLIC UI DIRECTORY
// -------------------------------------------------------
function resolvePublicDir(): string {
  const pathsToCheck = [
    process.env.FLAKY_GUARDIAN_PUBLIC_DIR,
    path.resolve(__dirname, "../../public"),
    path.resolve(process.cwd(), "public"),
  ].filter(Boolean) as string[];

  for (const p of pathsToCheck) {
    if (fs.existsSync(p)) return p;
  }

  return path.resolve(process.cwd(), "public");
}

const PUBLIC_DIR = resolvePublicDir();
console.log(`📊 Serving UI from: ${PUBLIC_DIR}`);

// -------------------------------------------------------
// TYPES
// -------------------------------------------------------
interface RunWithSamples {
  runId: string;
  samples: TestResultSample[];
}

interface RunSummary {
  runId: string;
  totalTests: number;
  passed: number;
  failed: number;
  startedAt?: string;
  finishedAt?: string;
}

// -------------------------------------------------------
// JSON STORAGE HELPERS
// -------------------------------------------------------
function loadRunsFromJson(): RunWithSamples[] {
  const dir = path.resolve(process.cwd(), OUTPUT_DIR);
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("run-") && f.endsWith(".json"));

  const runs: RunWithSamples[] = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), "utf-8");
      const parsed = JSON.parse(raw);
      const samples: TestResultSample[] = parsed.samples || [];
      const runId = path.basename(file, ".json");
      if (samples.length > 0) runs.push({ runId, samples });
    } catch (err) {
      console.warn(`⚠️ Failed to read JSON run: ${file}`, err);
    }
  }

  // Sort runs chronologically
  runs.sort((a, b) => {
    const aAt = a.samples[0]?.runAt ?? "";
    const bAt = b.samples[0]?.runAt ?? "";
    return aAt.localeCompare(bAt);
  });

  return runs;
}

// -------------------------------------------------------
// SQLITE READ HELPERS
// -------------------------------------------------------
function loadAllSamplesFromSqlite(): TestResultSample[] {
  if (!db) return [];

  return db
    .prepare(
      `
      SELECT
        test_id     AS testId,
        title       AS title,
        file        AS file,
        line        AS line,
        status      AS status,
        duration_ms AS durationMs,
        run_at      AS runAt,
        attempt     AS attempt
      FROM test_runs
    `
    )
    .all() as TestResultSample[];
}

function loadAllSamplesFromJson(): TestResultSample[] {
  return loadRunsFromJson().flatMap((r) => r.samples);
}

function loadAllSamples(): TestResultSample[] {
  return db ? loadAllSamplesFromSqlite() : loadAllSamplesFromJson();
}

// -------------------------------------------------------
// AGGREGATION HELPERS
// -------------------------------------------------------
function makeRunSummary(run: RunWithSamples): RunSummary {
  const samples = run.samples;

  const timestamps = samples
    .map((s) => s.runAt)
    .filter(Boolean)
    .sort();

  return {
    runId: run.runId,
    totalTests: samples.length,
    passed: samples.filter((s) => s.status === "passed").length,
    failed: samples.filter((s) => s.status !== "passed").length,
    startedAt: timestamps[0],
    finishedAt: timestamps[timestamps.length - 1],
  };
}

function computeFlakySummary(samples: TestResultSample[]): FlakySummary[] {
  const grouped = new Map<
    string,
    { first: TestResultSample; total: number; failures: number }
  >();

  samples.forEach((s) => {
    const isFail = s.status !== "passed";
    const bucket = grouped.get(s.testId);

    if (!bucket) {
      grouped.set(s.testId, {
        first: s,
        total: 1,
        failures: isFail ? 1 : 0,
      });
    } else {
      bucket.total++;
      if (isFail) bucket.failures++;
    }
  });

  const results: FlakySummary[] = [];

  for (const [, v] of grouped) {
    const passRate = (v.total - v.failures) / v.total;
    const isFlaky = v.failures > 0 && passRate > 0 && passRate < 1;

    results.push({
      testId: v.first.testId,
      title: v.first.title,
      file: v.first.file,
      totalRuns: v.total,
      failures: v.failures,
      passRate,
      isFlaky,
    });
  }

  // Sort by failures desc
  results.sort((a, b) => b.failures - a.failures);
  return results;
}

// -------------------------------------------------------
// 🔥 NEW: HEATMAP ENDPOINT
// -------------------------------------------------------
app.get("/api/heatmap", (_req, res) => {
  const samples = loadAllSamples();
  const results: Array<{
    testId: string;
    title: string;
    file: string;
    runId: string;
    status: string;
  }> = [];

  if (db) {
    // SQLite: reconstruct runId from timestamp
    samples.forEach((s) => {
      const runId = "run-" + new Date(s.runAt ?? 0).getTime();
      results.push({
        testId: s.testId,
        title: s.title,
        file: s.file,
        runId,
        status: s.status,
      });
    });
  } else {
    // JSON: use known runs
    const runs = loadRunsFromJson();
    runs.forEach((run) => {
      run.samples.forEach((s) => {
        results.push({
          testId: s.testId,
          title: s.title,
          file: s.file,
          runId: run.runId,
          status: s.status,
        });
      });
    });
  }

  res.json(results);
});

// -------------------------------------------------------
// MAIN API
// -------------------------------------------------------
app.get("/api/runs", (_req, res) => {
  res.json(loadRunsFromJson().map(makeRunSummary));
});

app.get("/api/runs/:runId", (req, res) => {
  const runs = loadRunsFromJson();
  const run = runs.find((r) => r.runId === req.params.runId);
  if (!run) return res.status(404).json({ error: "Run not found" });

  res.json({
    ...makeRunSummary(run),
    samples: run.samples,
  });
});

app.get("/api/flaky", (_req, res) => {
  res.json(computeFlakySummary(loadAllSamples()));
});

// -------------------------------------------------------
// STATIC UI
// -------------------------------------------------------
app.use(express.static(PUBLIC_DIR));

app.get("/", (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// -------------------------------------------------------
// START SERVER
// -------------------------------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Dashboard running: http://localhost:${PORT}`);
  console.log(`📦 Backend mode: ${db ? "SQLite" : "JSON"}`);
});

