import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { routines } from "@paperclipai/db";

const ROUTINE_EXECUTION_ORIGIN_KIND = "routine_execution";

/**
 * A routine that owns a `routine_execution` issue keeps re-arming it: every fire
 * creates the next execution issue on the routine's schedule. That schedule is
 * the durable continuation for the one-shot execution issue, so a successful
 * poll run that leaves its execution issue without a disposition is a
 * *re-armed* poll — a valid terminal state — not a missing disposition.
 *
 * Without this check the disposition watchdog hands a completed poll to the
 * correction path, which parks the issue `blocked` and escalates it to the
 * board (COR-3258): the run succeeded, but nothing ever closed the one-shot
 * issue the routine created.
 *
 * Returns the owning routine id when `issue` is an active routine's execution
 * issue, else null. Callers use this to treat the poll re-arm as the valid
 * continuation path (handoff skip / liveness-recovery skip) instead of nagging
 * the assignee for a disposition or escalating the issue.
 */
export async function activeOwningRoutineIdForExecutionIssue(
  db: Db,
  issue: {
    companyId: string;
    originKind?: string | null;
    originId?: string | null;
  },
): Promise<string | null> {
  if (issue.originKind !== ROUTINE_EXECUTION_ORIGIN_KIND) return null;
  const routineId = issue.originId?.trim();
  if (!routineId) return null;

  const row = await db
    .select({ id: routines.id })
    .from(routines)
    .where(
      and(
        eq(routines.companyId, issue.companyId),
        eq(routines.id, routineId),
        eq(routines.status, "active"),
      ),
    )
    .limit(1)
    .then((rows) => rows[0] ?? null);
  return row?.id ?? null;
}
