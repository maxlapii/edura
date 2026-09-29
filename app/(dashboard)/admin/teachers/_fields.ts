import type { FieldDef, Option } from "../_components/entity-form";
import { enumOptions } from "../_lib/options";

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "SUBSTITUTE"] as const;
export const TEACHER_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "INACTIVE"] as const;

export function teacherFields(opts: { departments: Option[]; subjects: Option[]; mode: "create" | "edit" }): FieldDef[] {
  const create = opts.mode === "create";
  return [
    { name: "name", label: "Full name", required: true },
    ...(create
      ? [
          { name: "email", label: "Email", type: "email" as const, required: true },
          { name: "password", label: "Password", type: "password" as const, hint: "Optional – leave empty to generate a temporary password" },
        ]
      : []),
    { name: "phone", label: "Phone", nullable: !create },
    { name: "employeeNumber", label: "Employee number", required: true },
    { name: "employmentType", label: "Employment type", type: "select", options: enumOptions(EMPLOYMENT_TYPES), required: true },
    ...(create ? [] : [{ name: "status", label: "Status", type: "select" as const, options: enumOptions(TEACHER_STATUSES), required: true }]),
    { name: "hireDate", label: "Hire date", type: "date", nullable: !create },
    { name: "departmentId", label: "Department", type: "select", options: opts.departments, nullable: !create },
    { name: "position", label: "Position", nullable: !create, placeholder: "Teacher" },
    { name: "maxWeeklyPeriods", label: "Max weekly periods", type: "number", min: 1, max: 60, required: true },
    { name: "qualifications", label: "Qualifications", type: "tags", className: "sm:col-span-2" },
    { name: "subjectIds", label: "Subjects", type: "multiselect", options: opts.subjects, className: "sm:col-span-2" },
    { name: "emergencyContactName", label: "Emergency contact name", nullable: !create },
    { name: "emergencyContactPhone", label: "Emergency contact phone", nullable: !create },
    { name: "bio", label: "Bio", type: "textarea", className: "sm:col-span-2", nullable: !create },
  ];
}
