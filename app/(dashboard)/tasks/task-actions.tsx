"use client";
import { ActionButton } from "@/components/work/action-button";

/** Per-row quick status buttons. */
export function TaskRowActions({ id, status }: { id: string; status: string }) {
  if (status === "DONE" || status === "CANCELLED") {
    return <ActionButton method="PATCH" path={`/api/tasks/${id}`} json={{ status: "TODO" }} label="Reopen" variant="ghost" testId="task-reopen" />;
  }
  return (
    <span className="flex items-center gap-1">
      {status === "TODO" && <ActionButton method="PATCH" path={`/api/tasks/${id}`} json={{ status: "IN_PROGRESS" }} label="Start" variant="ghost" testId="task-start" />}
      <ActionButton method="PATCH" path={`/api/tasks/${id}`} json={{ status: "DONE" }} label="Done" variant="outline" testId="task-done" />
    </span>
  );
}
