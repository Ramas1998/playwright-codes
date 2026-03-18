import { StorageEngine, StoredRun } from "../types";
export declare class JsonStorage implements StorageEngine {
    private baseDir;
    private runsDir;
    private historyFile;
    constructor(options?: {
        baseDir?: string;
    });
    private ensureDirectories;
    saveRun(run: StoredRun): Promise<void>;
    private appendToHistory;
    getRun(runId: string): Promise<StoredRun | null>;
    listRuns(): Promise<string[]>;
    loadHistory(): Promise<any[]>;
}
