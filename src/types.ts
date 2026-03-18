// src/types.ts

// ---- Core status model ----
export type TestStatus =
  | "passed"
  | "failed"
  | "timedOut"
  | "skipped"
  | "interrupted"
  | "unknown";

// Raw attempt captured by the reporter before aggregation
export interface StoredTestAttempt {
  runId: string;
  testId: string;
  title: string;
  fullTitle: string;
  file: string;
  line: number;
  retries: number;
  attempt: number; // 0,1,2...
  status: TestStatus;
  duration: number; // ms
  errors?: any[];
  timestamp: number; // epoch ms
}

// Flakiness category used in UI
export type FlakinessLevel = "flaky" | "stable" | "failed";

// Aggregated, per-test summary for a single run
export interface StoredTestSummary {
  testId: string;
  title: string;
  fullTitle: string;
  file: string;
  attempts: number;
  statuses: TestStatus[];
  flakiness: FlakinessLevel;
  duration: number; // total ms across attempts
  errors: any[];
}

// Persisted representation of one test run
export interface StoredTestRun {
  runId: string;
  status: TestStatus;
  startTime: number; // epoch ms
  endTime: number; // epoch ms
  tests: StoredTestSummary[];
}

// Alias used by JSON storage (for convenience)
export type StoredRun = StoredTestRun;

// High-level history entry (used by storage dashboards)
export interface HistoryRunEntry {
  runId: string;
  status: TestStatus;
  startTime: number;
  endTime: number;
  totalTests: number;
  flaky: number;
  failed: number;
}

// Pluggable storage abstraction used by the reporter
export interface StorageEngine {
  /**
   * Persist one completed run (aggregated per test).
   */
  saveRun(run: StoredTestRun): Promise<void>;

  /**
   * Load a single run by ID, or null if not found.
   */
  getRun(runId: string): Promise<StoredTestRun | null>;

  /**
   * List known run IDs (e.g. newest first).
   */
  listRuns(): Promise<string[]>;

  /**
   * Optional summary for dashboards / trend views.
   * Shape is deliberately loose to allow different backends.
   */
  loadHistory(): Promise<HistoryRunEntry[] | any[]>;
}

// ---- Types used only by the dashboard server ----

// Sample-level row used by the Express dashboard API
export interface TestResultSample {
  testId: string;
  title: string;
  file: string;
  line: number;
  status: TestStatus;
  durationMs: number;
  runAt?: string;
  attempt?: number;
  errors?: any;
}

// Aggregated flaky summary across *all* runs
export interface FlakySummary {
  testId: string;
  title: string;
  file: string;
  totalRuns: number;
  failures: number;
  passRate: number; // 0..1
  isFlaky: boolean;
}

