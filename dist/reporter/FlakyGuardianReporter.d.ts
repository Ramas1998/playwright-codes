import type { Reporter, FullConfig, FullResult, TestCase, TestResult } from "@playwright/test/reporter";
import { StorageEngine } from "../types";
export declare class FlakyGuardianReporter implements Reporter {
    private storage;
    private runId;
    private results;
    constructor(options: {
        storage: StorageEngine;
    });
    onBegin(config: FullConfig): void;
    onTestEnd(test: TestCase, result: TestResult): void;
    onEnd(result: FullResult): Promise<void>;
    private aggregateResults;
}
