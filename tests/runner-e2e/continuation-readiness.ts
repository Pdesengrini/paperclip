/** A terminal child does not mean the parent has processed its completion wake. */
export function continuationInitialReady(interactions: ReadonlyArray<{ kind?: unknown; status?: unknown }>): boolean {
  return interactions.some((i) => i.kind === "ask_user_questions" && i.status === "pending");
}
