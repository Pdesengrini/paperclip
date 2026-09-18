import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

// 2.1.19 predates --add-dir skill discovery. Keep local/CI qualification
// reproducible without replacing a developer's globally installed CLI.
export const LEGACY_CLAUDE_CLI_VERSION = "2.1.277";
const execute = promisify(execFile);
export function qualifiedLegacyClaudeVersion(output: string) {
  return output.trim() === `${LEGACY_CLAUDE_CLI_VERSION} (Claude Code)`;
}

export async function qualifyLegacyClaudeCli(temporaryRoot: string, environment: NodeJS.ProcessEnv) {
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "SystemRoot"]
    .flatMap(key => environment[key] ? [[key, environment[key]!]] : []));
  try {
    const result = await execute("claude", ["--version"], { env, timeout: 15_000 });
    if (qualifiedLegacyClaudeVersion(result.stdout)) return environment.PATH ?? "";
  } catch { /* Install the exact fixture version in the attempt's private root. */ }
  const prefix = path.join(temporaryRoot, "legacy-claude-cli");
  await execute("npm", ["install", "--prefix", prefix, "--no-save", "--no-package-lock", "--no-audit", "--no-fund",
    `@anthropic-ai/claude-code@${LEGACY_CLAUDE_CLI_VERSION}`], { env, timeout: 120_000, maxBuffer: 1024 * 1024 });
  const bin = path.join(prefix, "node_modules", ".bin");
  const result = await execute(path.join(bin, "claude"), ["--version"], { env, timeout: 15_000 });
  if (!qualifiedLegacyClaudeVersion(result.stdout)) throw new Error("Legacy Claude CLI version qualification failed");
  return `${bin}${path.delimiter}${environment.PATH ?? ""}`;
}
