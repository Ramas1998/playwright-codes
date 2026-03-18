export type TestStatus = "passed" | "failed" | "timedOut" | "skipped" | "interrupted" | "unknown";
export interface StoredTestAttempt {
    runId: string;
    testId: string;
    title: string;
    fullTitle: string;
    file: string;
    line: number;
    retries: number;
    attempt: number;
    status: TestStatus;
    duration: number;
    errors?: any[];
    timestamp: number;
}
export type FlakinessLevel = "flaky" | "stable" | "failed";
export interface StoredTestSummary {
    testId: string;
    title: string;
    fullTitle: string;
    file: string;
    attempts: number;
    statuses: TestStatus[];
    flakiness: FlakinessLevel;
    duration: number;
    errors: any[];
}
export interface StoredTestRun {
    runId: string;
    status: TestStatus;
    startTime: number;
    endTime: number;
    tests: StoredTestSummary[];
}
export type StoredRun = StoredTestRun;
export interface HistoryRunEntry {
    runId: string;
    status: TestStatus;
    startTime: number;
    endTime: number;
    totalTests: number;
    flaky: number;
    failed: number;
}
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
export interface FlakySummary {
    testId: string;
    title: string;
    file: string;
    totalRuns: number;
    failures: number;
    passRate: number;
    isFlaky: boolean;
}
