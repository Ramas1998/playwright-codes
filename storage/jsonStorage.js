"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonStorage = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class JsonStorage {
    constructor(options) {
        this.baseDir = options?.baseDir || path_1.default.join(process.cwd(), "flaky-data");
        this.runsDir = path_1.default.join(this.baseDir, "runs");
        this.historyFile = path_1.default.join(this.baseDir, "history.json");
        this.ensureDirectories();
    }
    // -----------------------------
    // Ensure directory structure
    // -----------------------------
    ensureDirectories() {
        if (!fs_1.default.existsSync(this.baseDir)) {
            fs_1.default.mkdirSync(this.baseDir, { recursive: true });
        }
        if (!fs_1.default.existsSync(this.runsDir)) {
            fs_1.default.mkdirSync(this.runsDir, { recursive: true });
        }
        if (!fs_1.default.existsSync(this.historyFile)) {
            fs_1.default.writeFileSync(this.historyFile, JSON.stringify([]));
        }
    }
    // -----------------------------
    // Save full run
    // -----------------------------
    async saveRun(run) {
        const runFile = path_1.default.join(this.runsDir, `${run.runId}.json`);
        // Save individual run
        fs_1.default.writeFileSync(runFile, JSON.stringify(run, null, 2));
        // Add to history
        await this.appendToHistory(run);
    }
    // -----------------------------
    // Append aggregated metadata to history
    // -----------------------------
    async appendToHistory(run) {
        let history = [];
        try {
            const raw = fs_1.default.readFileSync(this.historyFile, "utf-8");
            history = JSON.parse(raw);
        }
        catch (err) {
            console.warn("⚠ Could not read history.json, recreating…");
        }
        history.push({
            runId: run.runId,
            status: run.status,
            startTime: run.startTime,
            endTime: run.endTime,
            totalTests: run.tests.length,
            flaky: run.tests.filter((t) => t.flakiness === "flaky").length,
            failed: run.tests.filter((t) => t.flakiness === "failed").length,
        });
        fs_1.default.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
    }
    // -----------------------------
    // Load a single run
    // -----------------------------
    async getRun(runId) {
        const file = path_1.default.join(this.runsDir, `${runId}.json`);
        if (!fs_1.default.existsSync(file))
            return null;
        const raw = fs_1.default.readFileSync(file, "utf-8");
        return JSON.parse(raw);
    }
    // -----------------------------
    // List all run IDs
    // -----------------------------
    async listRuns() {
        const files = fs_1.default.readdirSync(this.runsDir);
        return files
            .filter((f) => f.endsWith(".json"))
            .map((f) => path_1.default.basename(f, ".json"));
    }
    // -----------------------------
    // Load all aggregated runs
    // -----------------------------
    async loadHistory() {
        if (!fs_1.default.existsSync(this.historyFile))
            return [];
        const raw = fs_1.default.readFileSync(this.historyFile, "utf-8");
        return JSON.parse(raw);
    }
}
exports.JsonStorage = JsonStorage;
