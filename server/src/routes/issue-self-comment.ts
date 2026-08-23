// Pure predicates for the "self / system comment must not wake its own
// assignee" rule (COR-2416 loop-killer). Kept dependency-free so both the issue
// PATCH-with-comment path and the dedicated comment POST path share one
// implementation — the two mirror sites previously drifted — and so the logic
// is unit-testable without the full route/service graph.

/**
 * Whether a comment should be treated as authored by the issue's own assignee
 * run — a "self" comment. Two independent, individually-sufficient signals:
 *
 *  - Attribution: the actor is the assignee agent itself (a correctly-attributed
 *    agent comment).
 *  - Run identity: the comment was authored by the run that currently owns the
 *    issue (its checkout or execution run). This holds even when the actor's
 *    attribution was laundered to a non-agent identity (e.g. a local-board
 *    system write in local_trusted mode), which the attribution signal alone
 *    misses.
 *
 * Genuine interactive humans never carry a run id and are never the assignee
 * agent, so a human comment is never classified self here — a human reopen of a
 * blocked issue still wakes its assignee (Invariant 1).
 */
export function isAssigneeSelfComment(input: {
  actorType: "agent" | "user";
  actorId: string;
  actorRunId: string | null | undefined;
  assigneeAgentId: string | null | undefined;
  checkoutRunId: string | null | undefined;
  executionRunId: string | null | undefined;
}): boolean {
  const assigneeId = input.assigneeAgentId;
  if (typeof assigneeId !== "string" || assigneeId.length === 0) return false;
  if (input.actorType === "agent" && input.actorId === assigneeId) return true;
  const runId = input.actorRunId;
  if (typeof runId === "string" && runId.length > 0) {
    return runId === input.checkoutRunId || runId === input.executionRunId;
  }
  return false;
}

/**
 * Whether a committed comment should wake the issue's assignee agent.
 *
 * A self/system comment must never wake its own assignee — even when it reopened
 * the issue. That reopen → self-wake → re-block cycle is the unbounded loop this
 * fix closes: previously `reopened || !skipWake` let any reopen (including an
 * implicit reopen driven by a laundered self-comment) bypass the self-comment
 * guard.
 *
 * Preserved behaviors:
 *  - A genuine external reopen (never `selfComment`) still wakes the assignee.
 *  - An explicit self-resume / reopen (`explicitMoveToTodoRequested`) still
 *    wakes — the assignee asked to continue its own work.
 *  - A closure comment (issue now closed) does not wake unless it reopened.
 */
export function shouldWakeAssigneeOnComment(input: {
  reopened: boolean;
  selfComment: boolean;
  closedComment: boolean;
  explicitMoveToTodoRequested: boolean;
}): boolean {
  if (input.reopened) {
    return !input.selfComment || input.explicitMoveToTodoRequested;
  }
  return !input.selfComment && !input.closedComment;
}
