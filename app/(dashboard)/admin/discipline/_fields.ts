import type { FieldDef, Option } from "../_components/entity-form";
import { enumOptions } from "../_lib/options";

export const SEVERITIES = ["MINOR", "MODERATE", "MAJOR", "SEVERE"] as const;

export function incidentFields(opts: { students: Option[]; mode: "create" | "edit" }): FieldDef[] {
  const create = opts.mode === "create";
  return [
    ...(create ? [{ name: "studentId", label: "Student", type: "select" as const, options: opts.students, required: true, placeholder: "Select a student…" }] : []),
    { name: "date", label: "Date", type: "date", required: true },
    { name: "category", label: "Category", required: true, placeholder: "Disruption, bullying, lateness…" },
    { name: "severity", label: "Severity", type: "select", options: enumOptions(SEVERITIES), required: true },
    { name: "description", label: "What happened", type: "textarea", rows: 4, required: true, className: "sm:col-span-2" },
    { name: "actions", label: "Actions taken", type: "textarea", rows: 3, className: "sm:col-span-2", nullable: !create },
    { name: "followUp", label: "Follow-up", type: "textarea", rows: 2, className: "sm:col-span-2", nullable: !create },
    { name: "parentNotified", label: "Parent notified", type: "checkbox", hint: "Guardians receive a notification when the incident is recorded" },
  ];
}
