import type { FieldDef, Option } from "../_components/entity-form";
import { enumOptions } from "../_lib/options";

export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED"] as const;

export function studentFields(opts: { classes: Option[]; mode: "create" | "edit" }): FieldDef[] {
  const create = opts.mode === "create";
  return [
    { name: "firstName", label: "First name", required: true },
    { name: "lastName", label: "Last name", required: true },
    { name: "studentNumber", label: "Student number", required: true },
    { name: "dateOfBirth", label: "Date of birth", type: "date", nullable: !create },
    { name: "gender", label: "Gender", nullable: !create },
    { name: "classId", label: "Class", type: "select", options: opts.classes, nullable: !create },
    { name: "enrollmentDate", label: "Enrollment date", type: "date", nullable: !create },
    ...(create
      ? [
          { name: "email", label: "Login email", type: "email" as const, hint: "Optional – creates a student login" },
          { name: "password", label: "Password", type: "password" as const, hint: "Optional – a temporary password is generated when a login is created" },
        ]
      : [{ name: "status", label: "Status", type: "select" as const, options: enumOptions(STUDENT_STATUSES), required: true }]),
    { name: "notes", label: "Notes", type: "textarea", rows: 3, className: "sm:col-span-2", nullable: !create },
    { name: "medicalNotes", label: "Medical notes (sensitive)", type: "textarea", rows: 3, className: "sm:col-span-2", hint: "Visible only to users with sensitive-data permission" },
  ];
}
