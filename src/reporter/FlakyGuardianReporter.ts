// src/reporter/FlakyGuardianReporter.ts
import type {
  Reporter,
  FullConfig,
  FullResult,
  TestCase,
  TestResult,
} from "@playwright/test/reporter";

import {
  StorageEngine,
  StoredTestRun,
  StoredTestAttempt,
  StoredTestSummary,
  FlakinessLevel,
  TestStatus,
} from "../types";

export class FlakyGuardianReporter implements Reporter {
  private storage: StorageEngine;
  private runId: string;
  private results: StoredTestAttempt[] = [];

  constructor(options: { storage: StorageEngine }) {
    this.storage = options.storage;
    this.runId = `run_${Date.now()}`;
  }

  // Called once at the start
  onBegin(config: FullConfig): void {
    const projectNames = config.projects.map((p) => p.name).join(", ");

    console.log("🚀 Flaky Guardian Starting…");
    console.log(`Run ID: ${this.runId}`);
    console.log(`Projects: ${projectNames}`);
  }

  // Called for every test case + attempt result
  onTestEnd(test: TestCase, result: TestResult): void {
    const record: StoredTestAttempt = {
      runId: this.runId,
      testId: test.id,
      title: test.title,
      fullTitle: test.titlePath().join(" > "),
      file: test.location.file,
      line: test.location.line,
      retries: test.retries,
      attempt: result.retry, // 0,1,2,...
      status: (result.status as TestStatus) ?? "unknown",
      duration: result.duration,
      errors: result.errors ?? [],
      timestamp: Date.now(),
    };

    // Collect all raw results
    this.results.push(record);
  }

  // Called once at end
  async onEnd(result: FullResult): Promise<void> {
    console.log(`📦 Flaky Guardian Finalizing run ${this.runId}`);
    console.log(`Status: ${result.status}`);

    const aggregated = this.aggregateResults();

    const run: StoredTestRun = {
      runId: this.runId,
      status: (result.status as TestStatus) ?? "unknown",
      startTime: aggregated.startTime,
      endTime: Date.now(),
      tests: aggregated.tests,
    };

    // Save to storage (JSON / SQLite / future backends)
    await this.storage.saveRun(run);

    console.log("💾 Saved test results into storage engine.");
  }

  // ---------- INTERNAL AGGREGATION LOGIC ----------
  private aggregateResults(): {
    startTime: number;
    tests: StoredTestSummary[];
  } {
    if (this.results.length === 0) {
      const now = Date.now();
      return { startTime: now, tests: [] };
    }

    const startTime = Math.min(...this.results.map((r) => r.timestamp));

    // Group by testId
    const grouped = new Map<string, StoredTestAttempt[]>();

    for (const r of this.results) {
      const bucket = grouped.get(r.testId);
      if (!bucket) {
        grouped.set(r.testId, [r]);
      } else {
        bucket.push(r);
      }
    }

    const aggregatedTests: StoredTestSummary[] = [];

    for (const [, attempts] of grouped) {
      const first = attempts[0];

      const statuses = attempts.map((a) => a.status);
      const hasPass = statuses.includes("passed");
      const hasFail =
        statuses.includes("failed") || statuses.includes("timedOut");

      let flakiness: FlakinessLevel;
      if (attempts.length > 1 && hasPass && hasFail) {
        flakiness = "flaky";
      } else if (hasPass && !hasFail) {
        flakiness = "stable";
      } else {
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

