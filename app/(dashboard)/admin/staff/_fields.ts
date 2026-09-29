import type { FieldDef, Option } from "../_components/entity-form";
import { enumOptions } from "../_lib/options";

export const STAFF_TYPES = ["ADMINISTRATIVE", "RECEPTION", "IT", "MAINTENANCE", "LIBRARIAN", "COORDINATOR", "SUPPORT", "OTHER"] as const;
export const STAFF_STATUSES = ["ACTIVE", "ON_LEAVE", "INACTIVE"] as const;

export function staffFields(opts: { departments: Option[]; mode: "create" | "edit" }): FieldDef[] {
  const create = opts.mode === "create";
  return [
    { name: "name", label: "Full name", required: true },
    ...(create
      ? [
          { name: "email", label: "Email", type: "email" as const, required: true },
          { name: "password", label: "Password", type: "password" as const, hint: "Optional – leave empty to generate a temporary password" },
          { name: "role", label: "System role", type: "select" as const, options: enumOptions(["STAFF", "SCHOOL_ADMIN", "PRINCIPAL"]), required: true, hint: "Administrative staff may be given an admin role" },
        ]
      : []),
    { name: "phone", label: "Phone", nullable: !create },
    { name: "employeeNumber", label: "Employee number", required: true },
    { name: "staffType", label: "Staff type", type: "select", options: enumOptions(STAFF_TYPES), required: true },
    ...(create ? [] : [{ name: "status", label: "Status", type: "select" as const, options: enumOptions(STAFF_STATUSES), required: true }]),
    { name: "departmentId", label: "Department", type: "select", options: opts.departments, nullable: !create },
    { name: "position", label: "Position", nullable: !create },
    { name: "workSchedule", label: "Work schedule (JSON)", type: "json", rows: 4, className: "sm:col-span-2", hint: 'e.g. {"monday": "08:00-16:00"}', nullable: !create },
  ];
}
