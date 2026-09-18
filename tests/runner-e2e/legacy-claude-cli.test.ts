import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { LEGACY_CLAUDE_CLI_VERSION, qualifiedLegacyClaudeVersion } from "./legacy-claude-cli.js";

it("rejects the old CLI that cannot discover mounted skills and requires the exact qualified version", () => {
  expect(qualifiedLegacyClaudeVersion("2.1.19 (Claude Code)")).toBe(false);
  expect(qualifiedLegacyClaudeVersion(`${LEGACY_CLAUDE_CLI_VERSION} (Claude Code)\n`)).toBe(true);
  expect(qualifiedLegacyClaudeVersion(`warning: ${LEGACY_CLAUDE_CLI_VERSION} (Claude Code)`)).toBe(false);
});
it("keeps the workflow installation pin synchronized with local qualification", () => {
  const workflow = readFileSync(new URL("../../.github/workflows/runner-full-stack-e2e.yml", import.meta.url), "utf8");
  expect(workflow).toContain(`@anthropic-ai/claude-code@${LEGACY_CLAUDE_CLI_VERSION}`);
  expect(workflow).not.toContain("@anthropic-ai/claude-code@2.1.19");
});
