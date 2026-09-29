import type { AuthUser } from "@/lib/auth/types";
import { hasPermission, isAdmin, type Permission } from "@/lib/permissions";

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
      { href: "/assignments", label: "Assignments", permissions: ["assignments:read"] },
      { href: "/grades", label: "Grades", permissions: ["grades:read"] },
      { href: "/report-cards", label: "Report cards", permissions: ["report_cards:read"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STUDENT", "PARENT"] },
      { href: "/lesson-plans", label: "Lesson plans", permissions: ["lesson_plans:manage"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
    ],
  },
  {
    title: "My work",
    items: [
      { href: "/tasks", label: "Tasks", permissions: ["tasks:read"] },
      { href: "/leave", label: "Leave", permissions: ["leave:request"] },
      { href: "/substitutions", label: "Substitutions", permissions: ["substitution:read"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
      { href: "/professional-development", label: "Professional development", roles: ["TEACHER", "DEPARTMENT_HEAD"] },
    ],
  },
  {
    title: "Communication",
    items: [
      { href: "/messages", label: "Messages", permissions: ["messages:read"] },
      { href: "/announcements", label: "Announcements", permissions: ["announcements:read"] },
      { href: "/meetings", label: "Meetings", permissions: ["meetings:read"] },
      { href: "/events", label: "Events", permissions: ["events:read"] },
    ],
  },
  {
    title: "School",
    items: [
      { href: "/department", label: "Department", permissions: ["dashboard:department"], roles: ["DEPARTMENT_HEAD"] },
      { href: "/students", label: "Students", permissions: ["students:read"], roles: ["TEACHER", "DEPARTMENT_HEAD", "STAFF"] },
      { href: "/rooms", label: "Rooms", permissions: ["rooms:read"] },
      { href: "/maintenance", label: "Maintenance", permissions: ["maintenance:report"] },
    ],
  },
  {
    title: "People",
    group: "Administration",
    items: [
      { href: "/admin/teachers", label: "Teachers", permissions: ["teachers:manage"] },
      { href: "/admin/staff", label: "Staff", permissions: ["staff:manage"] },
      { href: "/admin/students", label: "Students", permissions: ["students:manage"] },
      { href: "/admin/guardians", label: "Parents & guardians", permissions: ["guardians:manage"] },
      { href: "/admin/users", label: "User accounts", permissions: ["users:manage"] },
    ],
  },
  {
    title: "Academics",
    group: "Administration",
    items: [
      { href: "/admin/classes", label: "Classes & courses", permissions: ["classes:manage"] },
      { href: "/admin/subjects", label: "Subjects", permissions: ["subjects:manage"] },
      { href: "/admin/departments", label: "Departments", permissions: ["departments:manage"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/academic-years", label: "Academic years", permissions: ["academic:manage"] },
      { href: "/admin/timetable", label: "Timetable", permissions: ["timetable:manage"] },
      { href: "/admin/report-cards", label: "Report cards", permissions: ["report_cards:manage"] },
    ],
  },
  {
    title: "Operations",
    group: "Administration",
    items: [
      { href: "/admin/attendance", label: "Attendance", permissions: ["reports:school"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/leave", label: "Leave requests", permissions: ["leave:review"] },
      { href: "/admin/substitutions", label: "Substitutions", permissions: ["substitution:manage"] },
      { href: "/admin/approvals", label: "Approvals", permissions: ["approvals:decide"] },
      { href: "/admin/workload", label: "Teacher workload", permissions: ["workload:read"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/tasks", label: "All tasks", permissions: ["tasks:assign"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
    ],
  },
  {
    title: "Student welfare",
    group: "Administration",
    items: [
      { href: "/admin/support-cases", label: "Student support", permissions: ["support_cases:manage"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
      { href: "/admin/discipline", label: "Discipline", permissions: ["discipline:manage"], roles: ["SUPER_ADMIN", "SCHOOL_ADMIN", "PRINCIPAL"] },
    ],
  },
  {
    title: "Insights & settings",
    group: "Administration",
    items: [
      { href: "/admin/reports", label: "Reports", permissions: ["reports:school"] },
      { href: "/admin/workflows", label: "Automation rules", permissions: ["workflows:manage"] },
      { href: "/admin/audit", label: "Audit log", permissions: ["audit:read"] },
      { href: "/admin/school", label: "School settings", permissions: ["school:manage"] },
      { href: "/admin/schools", label: "All schools", roles: ["SUPER_ADMIN"] },
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
  { href: "/tasks", label: "New task", permissions: ["tasks:manage"] },
  { href: "/assignments/new", label: "New assignment", permissions: ["assignments:manage"], roles: ["TEACHER", "DEPARTMENT_HEAD", "SCHOOL_ADMIN", "PRINCIPAL", "SUPER_ADMIN"] },
  { href: "/lesson-plans/new", label: "New lesson plan", permissions: ["lesson_plans:manage"], roles: ["TEACHER", "DEPARTMENT_HEAD"] },
  { href: "/leave", label: "Request leave", permissions: ["leave:request"] },
  { href: "/messages/new", label: "New message", permissions: ["messages:send"] },
  { href: "/meetings/new", label: "New meeting", permissions: ["meetings:manage"] },
  { href: "/announcements/new", label: "New announcement", permissions: ["announcements:manage"] },
  { href: "/events/new", label: "New event", permissions: ["events:manage"] },
  { href: "/maintenance", label: "Report an issue", permissions: ["maintenance:report"] },
  { href: "/admin/teachers/new", label: "Add teacher", permissions: ["teachers:manage"] },
  { href: "/admin/students/new", label: "Add student", permissions: ["students:manage"] },
];

export function quickActionsForUser(user: AuthUser): QuickAction[] {
  if (user.role === "SUPER_ADMIN" && !user.schoolId) return [];
  return QUICK_ACTIONS.filter((a) => {
    if (a.roles && !a.roles.includes(user.role)) return false;
    if (!a.permissions?.length) return true;
    return a.permissions.some((p) => hasPermission(user, p));
  });
}

/** Flat list of every nav entry the user can reach (used by search and breadcrumbs). */
export function flatNavForUser(user: AuthUser): Array<{ href: string; label: string; section: string }> {
  return navForUser(user).flatMap((s) => s.items.map((i) => ({ href: i.href, label: i.label, section: s.title })));
}
