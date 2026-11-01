import { parseWorkflowGoal, type WorkflowGoal, type WorkflowStep } from "../../contracts/src/workflow";
export function compileWorkflow(input: unknown): { goal: WorkflowGoal; steps: WorkflowStep[] } {
  const goal = parseWorkflowGoal(input);
  const steps: WorkflowStep[] = [{ kind: "search", text: goal.query }];
  if (goal.filter !== null) steps.push({ kind: "filter", filter: goal.filter });
  if (goal.open) steps.push({ kind: "open_result", ordinal: goal.open - 1 });
  return { goal, steps };
}
export function workflowLabel(step: WorkflowStep): string {
  return step.kind === "search" ? `Search for “${step.text}”` : step.kind === "filter" ? `Filter ${step.filter}` : `Open ${["first", "second", "third"][step.ordinal]} visible reviewed result (up to 3 scrolls)`;
}
