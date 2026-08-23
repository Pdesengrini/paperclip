import { describe, expect, it } from "vitest";
import {
  isAssigneeSelfComment,
  shouldWakeAssigneeOnComment,
} from "../routes/issue-self-comment.js";

const ASSIGNEE = "agent-assignee";
const OTHER_AGENT = "agent-other";
const CHECKOUT_RUN = "run-checkout";
const EXECUTION_RUN = "run-execution";
const OTHER_RUN = "run-other";

describe("isAssigneeSelfComment", () => {
  it("recognizes a correctly-attributed agent self-comment", () => {
    expect(
      isAssigneeSelfComment({
        actorType: "agent",
        actorId: ASSIGNEE,
        actorRunId: OTHER_RUN,
        assigneeAgentId: ASSIGNEE,
        checkoutRunId: CHECKOUT_RUN,
        executionRunId: EXECUTION_RUN,
      }),
    ).toBe(true);
  });

  it("recognizes a laundered (non-agent) self-comment authored by the issue's checkout run", () => {
    // The loop's signature: a system write attributed to the local-board user
    // (actorType "user", not the assignee agent) but authored by the run that
    // owns the issue. Attribution alone would miss this.
    expect(
      isAssigneeSelfComment({
        actorType: "user",
        actorId: "local-board",
        actorRunId: CHECKOUT_RUN,
        assigneeAgentId: ASSIGNEE,
        checkoutRunId: CHECKOUT_RUN,
        executionRunId: null,
      }),
    ).toBe(true);
  });

  it("recognizes a laundered self-comment authored by the issue's execution run", () => {
    expect(
      isAssigneeSelfComment({
        actorType: "user",
        actorId: "local-board",
        actorRunId: EXECUTION_RUN,
        assigneeAgentId: ASSIGNEE,
        checkoutRunId: null,
        executionRunId: EXECUTION_RUN,
      }),
    ).toBe(true);
  });

  it("does not classify a genuine human comment (no run id) as self", () => {
    expect(
      isAssigneeSelfComment({
        actorType: "user",
        actorId: "local-board",
        actorRunId: null,
        assigneeAgentId: ASSIGNEE,
        checkoutRunId: CHECKOUT_RUN,
        executionRunId: EXECUTION_RUN,
      }),
    ).toBe(false);
  });

  it("does not classify a different agent's comment as self", () => {
    expect(
      isAssigneeSelfComment({
        actorType: "agent",
        actorId: OTHER_AGENT,
        actorRunId: OTHER_RUN,
        assigneeAgentId: ASSIGNEE,
        checkoutRunId: CHECKOUT_RUN,
        executionRunId: EXECUTION_RUN,
      }),
    ).toBe(false);
  });

  it("does not classify a run-id write from an unrelated run as self", () => {
    // A run that does not own this issue (e.g. a different agent's heartbeat)
    // is not self on run identity alone.
    expect(
      isAssigneeSelfComment({
        actorType: "user",
        actorId: "local-board",
        actorRunId: OTHER_RUN,
        assigneeAgentId: ASSIGNEE,
        checkoutRunId: CHECKOUT_RUN,
        executionRunId: EXECUTION_RUN,
      }),
    ).toBe(false);
  });

  it("returns false when there is no assignee agent", () => {
    expect(
      isAssigneeSelfComment({
        actorType: "agent",
        actorId: ASSIGNEE,
        actorRunId: CHECKOUT_RUN,
        assigneeAgentId: null,
        checkoutRunId: CHECKOUT_RUN,
        executionRunId: EXECUTION_RUN,
      }),
    ).toBe(false);
  });
});

describe("shouldWakeAssigneeOnComment", () => {
  it("suppresses the wake for a self-comment that reopened the issue (the loop)", () => {
    expect(
      shouldWakeAssigneeOnComment({
        reopened: true,
        selfComment: true,
        closedComment: false,
        explicitMoveToTodoRequested: false,
      }),
    ).toBe(false);
  });

  it("still wakes on a genuine external reopen (never self)", () => {
    expect(
      shouldWakeAssigneeOnComment({
        reopened: true,
        selfComment: false,
        closedComment: false,
        explicitMoveToTodoRequested: false,
      }),
    ).toBe(true);
  });

  it("still wakes a self-comment when an explicit resume/reopen was requested", () => {
    expect(
      shouldWakeAssigneeOnComment({
        reopened: true,
        selfComment: true,
        closedComment: false,
        explicitMoveToTodoRequested: true,
      }),
    ).toBe(true);
  });

  it("wakes a non-self comment on an open issue", () => {
    expect(
      shouldWakeAssigneeOnComment({
        reopened: false,
        selfComment: false,
        closedComment: false,
        explicitMoveToTodoRequested: false,
      }),
    ).toBe(true);
  });

  it("does not wake a self-comment on an open issue", () => {
    expect(
      shouldWakeAssigneeOnComment({
        reopened: false,
        selfComment: true,
        closedComment: false,
        explicitMoveToTodoRequested: false,
      }),
    ).toBe(false);
  });

  it("does not wake a closure comment that did not reopen", () => {
    expect(
      shouldWakeAssigneeOnComment({
        reopened: false,
        selfComment: false,
        closedComment: true,
        explicitMoveToTodoRequested: false,
      }),
    ).toBe(false);
  });
});
