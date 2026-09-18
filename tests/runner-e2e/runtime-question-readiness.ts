/** Provider-native questions pause inside a turn; they need an answer, not a
 * terminal run. Plain semantic questions instead wake a subsequent run. */
export function answerableRuntimeRunIds(interactions: ReadonlyArray<Record<string, any>>): Set<string> {
  return new Set(interactions.filter((i) => i.kind === "ask_user_questions" && i.status === "pending" &&
    typeof i.sourceRunId === "string" && typeof i.payload?.runtimeRequestId === "string")
    .map((i) => i.sourceRunId));
}
