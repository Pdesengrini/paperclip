import { describe, expect, it } from "vitest";
import { isZeroTokenProviderFailure } from "../services/heartbeat.js";

// COR-3538: a run that exits 0 with no adapter error but whose adapter reported
// zero tokens billed (no input, cached, or output) never reached the model —
// it is a silent provider/billing rejection and MUST be classified as a
// failure, not a success. These tests assert that intent and the boundaries
// that keep legitimate runs (and non-token adapters) out of the net.
describe("isZeroTokenProviderFailure", () => {
  it("flags the DeepSeek-402 signature: adapter reported all-zero token usage on a clean exit", () => {
    // Exact shape recorded for the parked runs during the COR-3518 outage.
    expect(
      isZeroTokenProviderFailure({
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      }),
    ).toBe(true);
  });

  it("flags all-zero usage even when cachedInputTokens is omitted", () => {
    expect(
      isZeroTokenProviderFailure({ usage: { inputTokens: 0, outputTokens: 0 } }),
    ).toBe(true);
  });

  it("does NOT flag a real completion that produced output tokens", () => {
    expect(
      isZeroTokenProviderFailure({
        usage: { inputTokens: 1200, cachedInputTokens: 0, outputTokens: 340 },
      }),
    ).toBe(false);
  });

  it("does NOT flag a legitimate empty completion: the prompt was still billed (input>0)", () => {
    // This is the false-positive class the issue explicitly warns about. A
    // genuine zero-OUTPUT completion still bills input tokens for the prompt,
    // so gating on input AND output being zero excludes it.
    expect(
      isZeroTokenProviderFailure({
        usage: { inputTokens: 5321, cachedInputTokens: 0, outputTokens: 0 },
      }),
    ).toBe(false);
  });

  it("does NOT flag a fully cache-hit run (cached input present, output present)", () => {
    expect(
      isZeroTokenProviderFailure({
        usage: { inputTokens: 0, cachedInputTokens: 8000, outputTokens: 12 },
      }),
    ).toBe(false);
  });

  it("does NOT flag adapters that report no usage at all (http / openclaw_gateway)", () => {
    // usage: undefined must never be treated as a provider failure — these
    // adapters simply do not emit token counts.
    expect(isZeroTokenProviderFailure({ usage: undefined })).toBe(false);
    expect(isZeroTokenProviderFailure({})).toBe(false);
  });

  it("does NOT flag when token counts are non-finite / unparseable", () => {
    expect(
      isZeroTokenProviderFailure({
        usage: {
          inputTokens: Number.NaN,
          outputTokens: Number.NaN,
        } as unknown as { inputTokens: number; outputTokens: number },
      }),
    ).toBe(false);
  });
});
