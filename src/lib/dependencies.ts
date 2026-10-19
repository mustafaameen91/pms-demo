/** Finish-to-start dependency rules (pure). An edge = { taskId, dependsOnId }. */

export type Edge = { taskId: string; dependsOnId: string };

/** True if adding "taskId depends on dependsOnId" would create a loop. */
export function wouldCreateCycle(edges: Edge[], taskId: string, dependsOnId: string) {
  if (taskId === dependsOnId) return true;
  // Loop exists if taskId is already (indirectly) a predecessor of dependsOnId.
  const preds = new Map<string, string[]>();
  for (const e of edges) preds.set(e.taskId, [...(preds.get(e.taskId) ?? []), e.dependsOnId]);
  const stack = [dependsOnId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(preds.get(id) ?? []));
  }
  return false;
}

export const isFinished = (category: string) => category === "done" || category === "canceled";

/** Predecessors that aren't finished yet. */
export function openPredecessors<T extends { category: string }>(preds: T[]) {
  return preds.filter((p) => !isFinished(p.category));
}

/**
 * Scheduling conflict: the task is planned to start on or before the day its
 * predecessor ends (finish-to-start means it should start the day after).
 */
export function startsTooEarly(taskStart: string | null, predecessorEnd: string | null) {
  return Boolean(taskStart && predecessorEnd && taskStart <= predecessorEnd);
}
