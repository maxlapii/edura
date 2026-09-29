/**
 * Pure message-template rendering. `{{var}}` placeholders are replaced with the
 * given variables; unknown/missing variables render as an empty string.
 */
export type TemplateVars = Record<string, string | number | null | undefined>;

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g;

export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(PLACEHOLDER, (_m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

/** Distinct placeholder names used in a template (for editors/previews). */
export function templateVariables(template: string): string[] {
  const names = new Set<string>();
  for (const m of template.matchAll(PLACEHOLDER)) names.add(m[1]);
  return [...names];
}

/** Variables every student-scoped template can rely on. */
export const STUDENT_TEMPLATE_VARIABLES = ["studentName", "className", "teacherName", "date"] as const;
