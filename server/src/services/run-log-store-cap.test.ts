import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { createDurableRunLogStore } from "./run-log-store.js";

// COR-4533: a per-run ndjson cap keeps one chatty session from writing
// unbounded bytes (a single verbose run has been observed at >1 GiB).

let baseDir: string;
beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "run-log-store-cap-test-"));
});
afterEach(async () => {
  await fs.rm(baseDir, { recursive: true, force: true });
  delete process.env.RUN_LOG_MAX_BYTES;
});

const begin = { companyId: "co1", agentId: "ag1", runId: "run1" };

async function logPath(handle: { logRef: string }) {
  return path.join(baseDir, handle.logRef);
}

describe("run-log per-run size cap", () => {
  it("truncates the crossing line to the exact cap, then rejects appends and warns once", async () => {
    const store = createDurableRunLogStore({ basePath: baseDir, maxBytes: 600 });
    const handle = await store.begin(begin);
    const file = await logPath(handle);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // First append is under the cap: written in full.
      const first = await store.append(handle, { stream: "stdout", chunk: "x".repeat(300), ts: "t1" });
      expect(first).toBeGreaterThan(0);
      const afterFirst = (await fs.stat(file)).size;
      expect(afterFirst).toBeLessThan(600);

      // Second append crosses the cap: only the remaining budget is written.
      const second = await store.append(handle, { stream: "stdout", chunk: "y".repeat(300), ts: "t2" });
      expect(second).toBe(600 - afterFirst);
      expect((await fs.stat(file)).size).toBe(600);

      // At the cap: rejected, file frozen, and the run is warned only once.
      expect(await store.append(handle, { stream: "stderr", chunk: "z".repeat(50), ts: "t3" })).toBe(0);
      expect(await store.append(handle, { stream: "stderr", chunk: "again", ts: "t4" })).toBe(0);
      expect((await fs.stat(file)).size).toBe(600);
      expect(warn).toHaveBeenCalledTimes(1);

      // Live tail still reads the capped file, including the partial last line.
      const tail = await store.read(handle);
      expect(tail.content).toContain("x".repeat(300));
      expect(tail.content.length).toBeGreaterThan(0);
    } finally {
      warn.mockRestore();
    }
  });

  it("counts an existing/restored prefix toward the cap", async () => {
    const dir = path.join(baseDir, begin.companyId, begin.agentId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${begin.runId}.ndjson`), "p".repeat(700), "utf8");
    const store = createDurableRunLogStore({ basePath: baseDir, maxBytes: 600 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const handle = await store.begin(begin);
      expect(await store.append(handle, { stream: "stdout", chunk: "never persisted", ts: "t1" })).toBe(0);
      expect((await fs.stat(await logPath(handle))).size).toBe(700);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("resolves RUN_LOG_MAX_BYTES when no explicit option is passed", async () => {
    process.env.RUN_LOG_MAX_BYTES = "500";
    const store = createDurableRunLogStore({ basePath: baseDir });
    const handle = await store.begin(begin);
    const file = await logPath(handle);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (let i = 0; i < 10; i++) {
        await store.append(handle, { stream: "stdout", chunk: "q".repeat(200), ts: `t${i}` });
      }
      expect((await fs.stat(file)).size).toBeLessThanOrEqual(500);
      expect((await fs.stat(file)).size).toBe(500);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("does not cap when maxBytes is 0 (explicit opt-out)", async () => {
    const store = createDurableRunLogStore({ basePath: baseDir, maxBytes: 0 });
    const handle = await store.begin(begin);
    for (let i = 0; i < 10; i++) {
      expect(await store.append(handle, { stream: "stdout", chunk: "u".repeat(200), ts: `t${i}` })).toBeGreaterThan(0);
    }
    expect((await fs.stat(await logPath(handle))).size).toBeGreaterThan(2000);
  });
});
