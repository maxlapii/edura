import type { Role } from "@/generated/prisma/enums";
import type { Permission } from "./permissions";
import { PERMISSIONS } from "./permissions";

const ALL: Permission[] = [...PERMISSIONS];

const TEACHER_PERMISSIONS: Permission[] = [
  "teachers:read",
  "staff:read",
  "students:read",
  "guardians:read",
  "departments:read",
  "classes:read",
  "subjects:read",
  "timetable:read",
  "attendance:read",
  "attendance:record",
  "assignments:read",
  "assignments:manage",
  "grades:read",
  "grades:manage",
  "report_cards:read",
  "lesson_plans:read",
  "lesson_plans:manage",
  "tasks:read",
  "tasks:manage",
  "leave:request",
  "substitution:read",
  "meetings:read",
  "events:read",
  "announcements:read",
  "calendar:read",
  "rooms:read",
  "rooms:book",
  "maintenance:report",
  "support_cases:read",
  "support_cases:manage",
  "discipline:read",
  "discipline:manage",
  "messages:send",
  "messages:read",
  "notifications:read",
  "reports:teacher",
  "ai:teacher",
  "dashboard:teacher",
  "professional_development:read",
  "workload:read",
];

const DEPARTMENT_HEAD_PERMISSIONS: Permission[] = [
  ...TEACHER_PERMISSIONS,
  "departments:manage",
  "tasks:assign",
  "leave:read_all",
  "meetings:manage",
  "announcements:manage",
  "reports:school",
  "dashboard:department",
  "professional_development:manage",
];

const STAFF_PERMISSIONS: Permission[] = [
  "teachers:read",
  "staff:read",
  "students:read",
  "departments:read",
  "classes:read",
  "subjects:read",
  "timetable:read",
  "tasks:read",
  "tasks:manage",
  "leave:request",
  "meetings:read",
  "events:read",
  "announcements:read",
  "calendar:read",
  "rooms:read",
  "rooms:book",
  "maintenance:report",
  "maintenance:manage",
  "support_cases:read",
  "messages:send",
  "messages:read",
  "notifications:read",
  "dashboard:teacher",
];

const STUDENT_PERMISSIONS: Permission[] = [
  "timetable:read",
  "attendance:read",
  "assignments:read",
  "assignments:submit",
  "grades:read",
  "report_cards:read",
  "events:read",
  "announcements:read",
  "calendar:read",
  "messages:send",
  "messages:read",
  "notifications:read",
  "dashboard:student",
];

const PARENT_PERMISSIONS: Permission[] = [
  "timetable:read",
  "attendance:read",
  "assignments:read",
  "grades:read",
  "report_cards:read",
  "events:read",
  "announcements:read",
  "calendar:read",
  "messages:send",
  "messages:read",
  "notifications:read",
  "dashboard:parent",
];

const ADMIN_PERMISSIONS: Permission[] = ALL.filter(
  (p) => !["dashboard:student", "dashboard:parent", "assignments:submit"].includes(p),
);

const PRINCIPAL_PERMISSIONS: Permission[] = [...ADMIN_PERMISSIONS];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  SUPER_ADMIN: new Set(ALL),
  SCHOOL_ADMIN: new Set(ADMIN_PERMISSIONS),
  PRINCIPAL: new Set(PRINCIPAL_PERMISSIONS),
  DEPARTMENT_HEAD: new Set(DEPARTMENT_HEAD_PERMISSIONS),
  TEACHER: new Set(TEACHER_PERMISSIONS),
  STUDENT: new Set(STUDENT_PERMISSIONS),
  PARENT: new Set(PARENT_PERMISSIONS),
  STAFF: new Set(STAFF_PERMISSIONS),
};

export const ADMIN_ROLES: ReadonlySet<Role> = new Set(["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"]);
export const STAFF_LIKE_ROLES: ReadonlySet<Role> = new Set([
  "SUPER_ADMIN",
  "SCHOOL_ADMIN",
  "PRINCIPAL",
  "DEPARTMENT_HEAD",
  "TEACHER",
  "STAFF",
]);
