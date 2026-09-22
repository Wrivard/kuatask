/**
 * Who a task belongs to, now that « both of us » is an answer.
 *
 * A task is someone's (assignee_id), both people's (shared), or nobody's.
 * The two fields are exclusive — the database refuses a row that is both —
 * and these functions are the only place that has to remember it.
 */
type Assignable = { assignee_id: string | null; shared: boolean };

/** The choice a picker shows: a member's id, BOTH, or null for nobody. */
export const BOTH = '__both__';
export type Assignment = string | null;

/** Whether this is one of the tasks a person should see as theirs. */
export function isAssignedTo(task: Assignable, userId: string): boolean {
  return task.shared || task.assignee_id === userId;
}

/**
 * The assignee lens: « Moi » and the partner's name each include the tasks
 * that are both people's. A shared task that vanished from both personal views
 * would be the one nobody picks up.
 */
export function matchesFilter(task: Assignable, filter: string | null): boolean {
  return filter === null || isAssignedTo(task, filter);
}

export function assignmentOf(task: Assignable): Assignment {
  return task.shared ? BOTH : task.assignee_id;
}

/** The patch that makes a task belong to `choice`, keeping the two fields exclusive. */
export function assign(choice: Assignment): Assignable {
  if (choice === BOTH) return { assignee_id: null, shared: true };
  return { assignee_id: choice, shared: false };
}

/** Handles that mean « both of us » when typed after @ in the composer. */
export const BOTH_HANDLES = ['nous', 'tous', 'deux', 'both', 'tout'];
