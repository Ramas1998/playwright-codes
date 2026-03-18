import fs from "fs";
import path from "path";
import { StorageEngine, StoredRun } from "../types";

export class JsonStorage implements StorageEngine {
  private baseDir: string;
  private runsDir: string;
  private historyFile: string;

  constructor(options?: { baseDir?: string }) {
    this.baseDir = options?.baseDir || path.join(process.cwd(), "flaky-data");
    this.runsDir = path.join(this.baseDir, "runs");
    this.historyFile = path.join(this.baseDir, "history.json");

    this.ensureDirectories();
  }

  // -----------------------------
  // Ensure directory structure
  // -----------------------------
  private ensureDirectories() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
    if (!fs.existsSync(this.runsDir)) {
      fs.mkdirSync(this.runsDir, { recursive: true });
    }
    if (!fs.existsSync(this.historyFile)) {
      fs.writeFileSync(this.historyFile, JSON.stringify([]));
    }
  }

  // -----------------------------
  // Save full run
  // -----------------------------
  async saveRun(run: StoredRun): Promise<void> {
    const runFile = path.join(this.runsDir, `${run.runId}.json`);

    // Save individual run
    fs.writeFileSync(runFile, JSON.stringify(run, null, 2));

    // Add to history
    await this.appendToHistory(run);
  }

  // -----------------------------
  // Append aggregated metadata to history
  // -----------------------------
  private async appendToHistory(run: StoredRun): Promise<void> {
    let history: any[] = [];

    try {
      const raw = fs.readFileSync(this.historyFile, "utf-8");
      history = JSON.parse(raw);
    } catch (err) {
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

    fs.writeFileSync(this.historyFile, JSON.stringify(history, null, 2));
  }

  // -----------------------------
  // Load a single run
  // -----------------------------
  async getRun(runId: string): Promise<StoredRun | null> {
    const file = path.join(this.runsDir, `${runId}.json`);
    if (!fs.existsSync(file)) return null;

    const raw = fs.readFileSync(file, "utf-8");
    return JSON.parse(raw);
  }

  // -----------------------------
  // List all run IDs
  // -----------------------------
  async listRuns(): Promise<string[]> {
    const files = fs.readdirSync(this.runsDir);
    return files
      .filter((f) => f.endsWith(".json"))
      .map((f) => path.basename(f, ".json"));
  }

  // -----------------------------
  // Load all aggregated runs
  // -----------------------------
  async loadHistory(): Promise<any[]> {
    if (!fs.existsSync(this.historyFile)) return [];
    const raw = fs.readFileSync(this.historyFile, "utf-8");
    return JSON.parse(raw);
  }
}

