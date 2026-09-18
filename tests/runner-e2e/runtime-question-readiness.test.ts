import { expect, it } from "vitest";
import { answerableRuntimeRunIds } from "./runtime-question-readiness.js";
it("recognizes only a pending native question as an answerable active turn", () => {
  const native = { kind: "ask_user_questions", status: "pending", sourceRunId: "live", payload: { runtimeRequestId: "request" } };
  expect([...answerableRuntimeRunIds([native])]).toEqual(["live"]);
  expect([...answerableRuntimeRunIds([{ ...native, status: "answered" }, { ...native, payload: {} }])]).toEqual([]);
});
