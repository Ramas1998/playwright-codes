import { StorageEngine, StoredTestRun, StoredTestSummary } from "../types";
export declare class SQLiteStorage implements StorageEngine {
    private db;
    constructor(dbPath?: string);
    private initialize;
    saveRun(run: StoredTestRun): Promise<void>;
    getRun(runId: string): Promise<StoredTestRun | null>;
    listRuns(): Promise<string[]>;
    loadHistory(): Promise<any[]>;
    getRunTests(runId: string): Promise<StoredTestSummary[]>;
    getRecentRuns(limit?: number): Promise<any[]>;
    getFlakyTestsHistory(): Promise<any[]>;
}
