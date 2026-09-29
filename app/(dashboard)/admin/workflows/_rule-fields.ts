import type { FieldDef, Option } from "../_components/entity-form";

export function ruleFields(triggers: Option[]): FieldDef[] {
  return [
    { name: "name", label: "Name", required: true },
    { name: "trigger", label: "Trigger", type: "select", options: triggers, required: true },
    { name: "description", label: "Description", type: "textarea", rows: 2, className: "sm:col-span-2", nullable: true },
    { name: "conditions", label: "Conditions (JSON)", type: "json", rows: 8, hint: '{"all":[{"path":"status","op":"eq","value":"ABSENT"}]} – empty object = always', className: "sm:col-span-2" },
    { name: "actions", label: "Actions (JSON)", type: "json", rows: 10, hint: '[{"type":"SEND_NOTIFICATION","params":{"to":"admins","title":"…","body":"{{studentName}} …"}}]', className: "sm:col-span-2" },
    { name: "isActive", label: "Active", type: "checkbox" },
  ];
}
