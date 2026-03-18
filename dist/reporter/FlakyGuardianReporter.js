"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlakyGuardianReporter = void 0;
class FlakyGuardianReporter {
    constructor(options) {
        this.results = [];
        this.storage = options.storage;
        this.runId = `run_${Date.now()}`;
    }
    // Called once at the start
    onBegin(config) {
        const projectNames = config.projects.map((p) => p.name).join(", ");
        console.log("🚀 Flaky Guardian Starting…");
        console.log(`Run ID: ${this.runId}`);
        console.log(`Projects: ${projectNames}`);
    }
    // Called for every test case + attempt result
    onTestEnd(test, result) {
        const record = {
            runId: this.runId,
            testId: test.id,
            title: test.title,
            fullTitle: test.titlePath().join(" > "),
            file: test.location.file,
            line: test.location.line,
            retries: test.retries,
            attempt: result.retry, // 0,1,2,...
            status: result.status ?? "unknown",
            duration: result.duration,
            errors: result.errors ?? [],
            timestamp: Date.now(),
        };
        // Collect all raw results
        this.results.push(record);
    }
    // Called once at end
    async onEnd(result) {
        console.log(`📦 Flaky Guardian Finalizing run ${this.runId}`);
        console.log(`Status: ${result.status}`);
        const aggregated = this.aggregateResults();
        const run = {
            runId: this.runId,
            status: result.status ?? "unknown",
            startTime: aggregated.startTime,
            endTime: Date.now(),
            tests: aggregated.tests,
        };
        // Save to storage (JSON / SQLite / future backends)
        await this.storage.saveRun(run);
        console.log("💾 Saved test results into storage engine.");
    }
    // ---------- INTERNAL AGGREGATION LOGIC ----------
    aggregateResults() {
        if (this.results.length === 0) {
            const now = Date.now();
            return { startTime: now, tests: [] };
        }
        const startTime = Math.min(...this.results.map((r) => r.timestamp));
        // Group by testId
        const grouped = new Map();
        for (const r of this.results) {
            const bucket = grouped.get(r.testId);
            if (!bucket) {
                grouped.set(r.testId, [r]);
            }
            else {
                bucket.push(r);
            }
        }
        const aggregatedTests = [];
        for (const [, attempts] of grouped) {
            const first = attempts[0];
            const statuses = attempts.map((a) => a.status);
            const hasPass = statuses.includes("passed");
            const hasFail = statuses.includes("failed") || statuses.includes("timedOut");
            let flakiness;
            if (attempts.length > 1 && hasPass && hasFail) {
                flakiness = "flaky";
            }
            else if (hasPass && !hasFail) {
                flakiness = "stable";
            }
            else {
                flakiness = "failed";
            }
            const duration = attempts.reduce((t, a) => t + a.duration, 0);
            const errors = attempts.flatMap((a) => a.errors ?? []);
            aggregatedTests.push({
                testId: first.testId,
                title: first.title,
                fullTitle: first.fullTitle,
                file: first.file,
                attempts: attempts.length,
                statuses,
                flakiness,
                duration,
                errors,
            });
        }
        return {
            startTime,
            tests: aggregatedTests,
        };
    }
}
exports.FlakyGuardianReporter = FlakyGuardianReporter;
