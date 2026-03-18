"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteStorage = void 0;
// src/storage/sqliteStorage.ts
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
class SQLiteStorage {
    constructor(dbPath = "flaky-guardian.db") {
        this.db = new better_sqlite3_1.default(dbPath);
        this.initialize();
    }
    initialize() {
        // Runs table
        this.db
            .prepare(`
        CREATE TABLE IF NOT EXISTS runs (
          run_id     TEXT PRIMARY KEY,
          status     TEXT NOT NULL,
          start_time INTEGER NOT NULL,
          end_time   INTEGER NOT NULL
        )
      `)
            .run();
        // Per-test aggregated results
        this.db
            .prepare(`
        CREATE TABLE IF NOT EXISTS test_results (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          run_id       TEXT NOT NULL,
          test_id      TEXT NOT NULL,
          title        TEXT NOT NULL,
          full_title   TEXT NOT NULL,
          file         TEXT NOT NULL,
          attempts     INTEGER NOT NULL,
          flakiness    TEXT NOT NULL,
          duration_ms  INTEGER NOT NULL,
          statuses     TEXT NOT NULL, -- JSON array
          errors       TEXT NOT NULL, -- JSON array
          FOREIGN KEY (run_id) REFERENCES runs(run_id)
        )
      `)
            .run();
        this.db
            .prepare(`CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id)`)
            .run();
        this.db
            .prepare(`CREATE INDEX IF NOT EXISTS idx_test_results_test_id ON test_results(test_id)`)
            .run();
    }
    // ----- StorageEngine implementation -----
    async saveRun(run) {
        const insertRun = this.db.prepare(`
      INSERT OR REPLACE INTO runs (run_id, status, start_time, end_time)
      VALUES (@runId, @status, @startTime, @endTime)
    `);
        const insertTest = this.db.prepare(`
      INSERT INTO test_results
        (run_id, test_id, title, full_title, file,
         attempts, flakiness, duration_ms, statuses, errors)
      VALUES
        (@runId, @testId, @title, @fullTitle, @file,
         @attempts, @flakiness, @duration, @statuses, @errors)
    `);
        const tx = this.db.transaction(() => {
            insertRun.run({
                runId: run.runId,
                status: run.status,
                startTime: run.startTime,
                endTime: run.endTime,
            });
            // Replace tests if the run already existed
            this.db.prepare(`DELETE FROM test_results WHERE run_id = ?`).run(run.runId);
            for (const t of run.tests) {
                insertTest.run({
                    runId: run.runId,
                    testId: t.testId,
                    title: t.title,
                    fullTitle: t.fullTitle,
                    file: t.file,
                    attempts: t.attempts,
                    flakiness: t.flakiness,
                    duration: t.duration,
                    statuses: JSON.stringify(t.statuses),
                    errors: JSON.stringify(t.errors ?? []),
                });
            }
        });
        tx();
    }
    async getRun(runId) {
        const runRow = this.db
            .prepare(`
        SELECT
          run_id     AS runId,
          status     AS status,
          start_time AS startTime,
          end_time   AS endTime
        FROM runs
        WHERE run_id = ?
      `)
            .get(runId);
        if (!runRow)
            return null;
        const testRows = this.db
            .prepare(`
        SELECT
          test_id     AS testId,
          title       AS title,
          full_title  AS fullTitle,
          file        AS file,
          attempts    AS attempts,
          flakiness   AS flakiness,
          duration_ms AS duration,
          statuses    AS statuses,
          errors      AS errors
        FROM test_results
        WHERE run_id = ?
        ORDER BY id ASC
      `)
            .all(runId);
        const tests = testRows.map((r) => ({
            testId: r.testId,
            title: r.title,
            fullTitle: r.fullTitle,
            file: r.file,
            attempts: r.attempts,
            flakiness: r.flakiness,
            duration: r.duration,
            statuses: JSON.parse(r.statuses),
            errors: JSON.parse(r.errors),
        }));
        return {
            runId: runRow.runId,
            status: runRow.status,
            startTime: runRow.startTime,
            endTime: runRow.endTime,
            tests,
        };
    }
    async listRuns() {
        const rows = this.db
            .prepare(`SELECT run_id AS runId FROM runs ORDER BY start_time DESC`)
            .all();
        return rows.map((r) => r.runId);
    }
    async loadHistory() {
        const rows = this.db
            .prepare(`
        SELECT
          r.run_id     AS runId,
          r.status     AS status,
          r.start_time AS startTime,
          r.end_time   AS endTime,
          COUNT(tr.test_id) AS totalTests,
          SUM(CASE WHEN tr.flakiness = 'flaky' THEN 1 ELSE 0 END)  AS flaky,
          SUM(CASE WHEN tr.flakiness = 'failed' THEN 1 ELSE 0 END) AS failed
        FROM runs r
        LEFT JOIN test_results tr ON tr.run_id = r.run_id
        GROUP BY r.run_id
        ORDER BY r.start_time DESC
      `)
            .all();
        return rows;
    }
    // ----- Optional helpers (nice for debugging / future APIs) -----
    async getRunTests(runId) {
        const run = await this.getRun(runId);
        return run?.tests ?? [];
    }
    async getRecentRuns(limit = 10) {
        const ids = await this.listRuns();
        const subset = ids.slice(0, limit);
        const result = [];
        for (const id of subset) {
            const run = await this.getRun(id);
            if (!run)
                continue;
            const flaky = run.tests.filter((t) => t.flakiness === "flaky").length;
            const failed = run.tests.filter((t) => t.flakiness === "failed").length;
            result.push({
                runId: run.runId,
                status: run.status,
                startTime: run.startTime,
                endTime: run.endTime,
                totalTests: run.tests.length,
                flaky,
                failed,
            });
        }
        return result;
    }
    async getFlakyTestsHistory() {
        const rows = this.db
            .prepare(`
        SELECT
          tr.test_id  AS testId,
          tr.title    AS title,
          tr.file     AS file,
          tr.flakiness AS flakiness,
          COUNT(*)    AS totalRuns
        FROM test_results tr
        GROUP BY tr.test_id, tr.title, tr.file, tr.flakiness
      `)
            .all();
        return rows;
    }
}
exports.SQLiteStorage = SQLiteStorage;
