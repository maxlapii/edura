import type { AuthUser } from "@/lib/auth/types";
import { hasPermission, isAdmin, type Permission } from "@/lib/permissions";
import { isHrefDisabled } from "@/lib/features";

export interface NavItem {
  href: string;
  label: string;
  /** Any of these permissions grants the item. Empty = everyone. */
  permissions?: Permission[];
  /** Restrict to roles (in addition to permissions). */
  roles?: AuthUser["role"][];
}

export interface NavSection {
  title: string;
  items: NavItem[];
  /** Optional parent heading shown above a run of sections (e.g. "Administration"). */
  group?: string;
}

const SECTIONS: NavSection[] = [
  {
    title: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/calendar", label: "Calendar", permissions: ["calendar:read"] },
      { href: "/notifications", label: "Notifications" },
      { href: "/ai", label: "AI assistant", permissions: ["ai:teacher", "ai:admin"] },
    ],
  },
  {
    title: "Teaching",
    items: [
      { href: "/schedule", label: "My schedule", permissions: ["timetable:read"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STUDENT", "PARENT"] },
      { href: "/classes", label: "My classes", permissions: ["classes:read"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
      { href: "/attendance", label: "Attendance", permissions: ["attendance:record"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
      { href: "/assignments", label: "Assignments", permissions: ["assignments:read"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STUDENT", "PARENT"] },
      { href: "/grades", label: "Grades", permissions: ["grades:read"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STUDENT", "PARENT"] },
      { href: "/lesson-plans", label: "Lesson plans", permissions: ["lesson_plans:manage"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
      { href: "/report-cards", label: "Report cards", permissions: ["report_cards:read"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STUDENT", "PARENT"] },
    ],
  },
  {
    title: "My work",
    items: [
      { href: "/tasks", label: "Tasks", permissions: ["tasks:read"] },
      { href: "/leave", label: "Leave", permissions: ["leave:request"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STAFF"] },
      { href: "/substitutions", label: "Cover lessons", permissions: ["substitution:read"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
      { href: "/professional-development", label: "Professional development", roles: ["TEACHER", "DEPARTMENT_HEAD"] },
    ],
  },
  {
    title: "School life",
    items: [
      { href: "/messages", label: "Messages", permissions: ["messages:read"] },
      { href: "/announcements", label: "Announcements", permissions: ["announcements:read"] },
      { href: "/meetings", label: "Meetings", permissions: ["meetings:read"] },
      { href: "/events", label: "Events", permissions: ["events:read"] },
      { href: "/students", label: "Students", permissions: ["students:read"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STAFF"] },
      { href: "/rooms", label: "Rooms", permissions: ["rooms:read"] },
      { href: "/maintenance", label: "Maintenance", permissions: ["maintenance:report"] },
      { href: "/department", label: "Department", permissions: ["dashboard:department"], roles: ["DEPARTMENT_HEAD"] },
    ],
  },
  {
    title: "People",
    group: "Administration",
    items: [
      { href: "/admin/teachers", label: "Teachers", permissions: ["teachers:manage"] },
      { href: "/admin/students", label: "Students", permissions: ["students:manage"] },
      { href: "/admin/guardians", label: "Parents & guardians", permissions: ["guardians:manage"] },
      { href: "/admin/staff", label: "Staff", permissions: ["staff:manage"] },
      { href: "/admin/users", label: "User accounts", permissions: ["users:manage"] },
    ],
  },
  {
    title: "School setup",
    group: "Administration",
    items: [
      { href: "/admin/classes", label: "Classes & courses", permissions: ["classes:manage"] },
      { href: "/admin/subjects", label: "Subjects", permissions: ["subjects:manage"] },
      { href: "/admin/timetable", label: "Timetable", permissions: ["timetable:manage"] },
      { href: "/admin/academic-years", label: "Academic years", permissions: ["academic:manage"] },
      { href: "/admin/departments", label: "Departments", permissions: ["departments:manage"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/school", label: "School settings", permissions: ["school:manage"] },
      { href: "/admin/workflows", label: "Automation rules", permissions: ["workflows:manage"] },
      { href: "/admin/audit", label: "Audit log", permissions: ["audit:read"] },
      { href: "/admin/schools", label: "All schools", roles: ["SUPER_ADMIN"] },
    ],
  },
  {
    title: "Daily operations",
    group: "Administration",
    items: [
      { href: "/admin/attendance", label: "Attendance", permissions: ["reports:school"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/leave", label: "Leave requests", permissions: ["leave:review"] },
      { href: "/admin/substitutions", label: "Cover & substitutes", permissions: ["substitution:manage"] },
      { href: "/admin/workload", label: "Teacher workload", permissions: ["workload:read"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/tasks", label: "All tasks", permissions: ["tasks:assign"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/reports", label: "Reports", permissions: ["reports:school"] },
      { href: "/admin/approvals", label: "Approvals", permissions: ["approvals:decide"] },
      { href: "/admin/report-cards", label: "Report cards", permissions: ["report_cards:manage"] },
      { href: "/admin/support-cases", label: "Student support", permissions: ["support_cases:manage"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/discipline", label: "Discipline", permissions: ["discipline:manage"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
    ],
  },
];

/** Platform administrators who are not attached to a school only manage schools. */
const PLATFORM_SECTIONS: NavSection[] = [
  { title: "Overview", items: [{ href: "/notifications", label: "Notifications" }] },
  { title: "Platform", items: [{ href: "/admin/schools", label: "All schools" }] },
];

export function navForUser(user: AuthUser): NavSection[] {
  if (user.role === "SUPER_ADMIN" && !user.schoolId) return PLATFORM_SECTIONS;
  return SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (isHrefDisabled(item.href)) return false;
      if (item.roles && !item.roles.includes(user.role)) return false;
      if (!item.permissions?.length) return true;
      return item.permissions.some((p) => hasPermission(user, p));
    }),
  })).filter((s) => s.items.length > 0);
}

export function homeForUser(user: AuthUser): string {
  return isAdmin(user) ? "/admin" : "/dashboard";
}

export interface QuickAction {
  href: string;
  label: string;
  permissions?: Permission[];
  roles?: AuthUser["role"][];
}

const QUICK_ACTIONS: QuickAction[] = [
  { href: "/assignments/new", label: "New assignment", permissions: ["assignments:manage"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
  { href: "/lesson-plans/new", label: "New lesson plan", permissions: ["lesson_plans:manage"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
  { href: "/tasks", label: "New task", permissions: ["tasks:manage"] },
  { href: "/leave", label: "Request leave", permissions: ["leave:request"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STAFF"] },
  { href: "/messages/new", label: "New message", permissions: ["messages:send"] },
  { href: "/announcements/new", label: "New announcement", permissions: ["announcements:manage"] },
  { href: "/admin/teachers/new", label: "Add teacher", permissions: ["teachers:manage"] },
  { href: "/admin/students/new", label: "Add student", permissions: ["students:manage"] },
];

export function quickActionsForUser(user: AuthUser): QuickAction[] {
  if (user.role === "SUPER_ADMIN" && !user.schoolId) return [];
  return QUICK_ACTIONS.filter((a) => {
    if (isHrefDisabled(a.href)) return false;
    if (a.roles && !a.roles.includes(user.role)) return false;
    if (!a.permissions?.length) return true;
    return a.permissions.some((p) => hasPermission(user, p));
  });
}

/** Flat list of every nav entry the user can reach (used by search and breadcrumbs). */
export function flatNavForUser(user: AuthUser): Array<{ href: string; label: string; section: string }> {
  return navForUser(user).flatMap((s) => s.items.map((i) => ({ href: i.href, label: i.label, section: s.title })));
}
