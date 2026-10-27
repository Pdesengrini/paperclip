import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Node clamps setTimeout delays above this to 1ms.
const MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

export const DEFAULT_FIRST_BACKUP_MIN_DELAY_MS = 5 * 60 * 1000;

export type LatestServerBackup = {
  name: string;
  mtimeMs: number;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Newest completed dump written by the server's own backup runner
 * (`<prefix>-YYYYMMDD-HHMMSS[-<checkpoint-id>].sql.gz`). Hand-named dumps
 * (e.g. `<prefix>-pre-deploy-...`) and in-progress `.sql` files are ignored.
 */
export function findLatestServerBackup(
  backupDir: string,
  filenamePrefix = "paperclip",
): LatestServerBackup | null {
  if (!existsSync(backupDir)) return null;
  const pattern = new RegExp(
    `^${escapeRegExp(filenamePrefix)}-\\d{8}-\\d{6}(?:-[0-9a-f-]+)?\\.sql\\.gz$`,
  );
  let latest: LatestServerBackup | null = null;
  for (const name of readdirSync(backupDir)) {
    if (!pattern.test(name)) continue;
    const stat = statSync(join(backupDir, name));
    if (!stat.isFile()) continue;
    if (!latest || stat.mtimeMs > latest.mtimeMs) {
      latest = { name, mtimeMs: stat.mtimeMs };
    }
  }
  return latest;
}

/**
 * Delay before the first scheduled backup after boot. The schedule is anchored
 * to the previous dump, not to process start, so restarts closer together than
 * the interval cannot starve backups. An overdue (or missing) backup runs after
 * `minDelayMs` to let startup settle.
 */
export function computeFirstScheduledBackupDelayMs(opts: {
  latestBackupMtimeMs: number | null;
  nowMs: number;
  intervalMs: number;
  minDelayMs?: number;
}): number {
  const intervalMs = Math.min(Math.max(1, opts.intervalMs), MAX_TIMER_DELAY_MS);
  const minDelayMs = Math.min(opts.minDelayMs ?? DEFAULT_FIRST_BACKUP_MIN_DELAY_MS, intervalMs);
  if (opts.latestBackupMtimeMs === null) return minDelayMs;
  const dueInMs = opts.latestBackupMtimeMs + intervalMs - opts.nowMs;
  // A future mtime (clock skew) must not push the first run past one interval.
  return Math.min(Math.max(minDelayMs, dueInMs), intervalMs);
}
