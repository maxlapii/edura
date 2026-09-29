/**
 * Optional product features. Everything in the MVP (CLAUDE.md §46) is always on; the features
 * below are extras that can be switched on per deployment. Switching one off hides it from the
 * menus, dashboards and create menu, and makes its pages and API routes return 404 (see proxy.ts).
 * The code stays in place, so turning a feature back on is a one-line change.
 */
export type FeatureId =
  | "reportCards"
  | "professionalDevelopment"
  | "supportCases"
  | "discipline"
  | "approvals"
  | "automationEditor"
  | "departmentDashboard"
  | "staffDirectory"
  | "messageTemplates";

export interface Feature {
  label: string;
  description: string;
  enabled: boolean;
  /** Page routes owned by the feature (prefix match). */
  pages: string[];
  /** API routes owned by the feature (prefix match). */
  api: string[];
}

export const FEATURES: Record<FeatureId, Feature> = {
  reportCards: { label: "Report cards", description: "Term report cards generated from grades.", enabled: false, pages: ["/report-cards", "/admin/report-cards"], api: ["/api/report-cards"] },
  professionalDevelopment: { label: "Professional development", description: "Certifications, training records and availability preferences.", enabled: false, pages: ["/professional-development"], api: [] },
  supportCases: { label: "Student support cases", description: "Structured academic, attendance and wellbeing cases.", enabled: false, pages: ["/admin/support-cases"], api: ["/api/support-cases"] },
  discipline: { label: "Discipline", description: "Behaviour incident records.", enabled: false, pages: ["/admin/discipline"], api: ["/api/discipline"] },
  approvals: { label: "Approvals inbox", description: "A combined inbox for leave, event and trip approvals (leave is reviewed on the leave page).", enabled: false, pages: ["/admin/approvals"], api: ["/api/approvals"] },
  automationEditor: { label: "Automation rule editor", description: "Edit automation rules. The default rules keep running when this is off.", enabled: false, pages: ["/admin/workflows"], api: ["/api/workflows"] },
  departmentDashboard: { label: "Department dashboard", description: "A separate dashboard for department heads.", enabled: false, pages: ["/department"], api: [] },
  staffDirectory: { label: "Staff directory", description: "Profiles for non-teaching staff (accounts can still be created under User accounts).", enabled: false, pages: ["/admin/staff"], api: ["/api/staff"] },
  messageTemplates: { label: "Message templates", description: "Reusable message templates for parents.", enabled: false, pages: ["/messages/templates"], api: ["/api/message-templates"] },
};

export function isEnabled(id: FeatureId): boolean {
  return FEATURES[id].enabled;
}

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

/** The disabled feature that owns a path, if any. */
export function disabledFeatureFor(pathname: string): FeatureId | null {
  for (const [id, f] of Object.entries(FEATURES) as Array<[FeatureId, Feature]>) {
    if (f.enabled) continue;
    if ([...f.pages, ...f.api].some((p) => matches(pathname, p))) return id;
  }
  return null;
}

/** True when a link target belongs to a disabled feature (used to prune menus). */
export function isHrefDisabled(href: string): boolean {
  return disabledFeatureFor(href.split("?")[0]) !== null;
}
