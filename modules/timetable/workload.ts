/**
 * Pure teacher workload calculation.
 */
export interface WorkloadInput {
  /** Weekly recurring timetable slots (one per lesson). */
  teachingSlots: Array<{ courseId: string; classId: string; subjectId: string }>;
  /** Extra duties with weekly hours. */
  duties: Array<{ weeklyHours: number }>;
  /** Substitution periods covered in the reference window. */
  substitutionPeriods: number;
  /** Meetings (hours) in the reference window. */
  meetingHours: number;
  /** Homeroom classes. */
  homeroomClasses: number;
  /** Preparation periods per week (school policy, default derived). */
  preparationPeriods?: number;
  /** Leave days in the reference window. */
  leaveDays: number;
  /** Teacher's contractual maximum weekly periods. */
  maxWeeklyPeriods: number;
  /** Period length in minutes (default 45). */
  periodMinutes?: number;
}

export interface WorkloadSummary {
  teachingPeriods: number;
  classes: number;
  subjects: number;
  preparationPeriods: number;
  substitutionPeriods: number;
  meetingHours: number;
  dutyHours: number;
  homeroomClasses: number;
  leaveDays: number;
  /** Total weekly workload expressed in periods (meetings/duties converted). */
  totalPeriods: number;
  maxWeeklyPeriods: number;
  /** totalPeriods / maxWeeklyPeriods as a percentage. */
  utilization: number;
  level: "UNDERUTILIZED" | "NORMAL" | "HIGH" | "OVERLOADED";
}

export const WORKLOAD_THRESHOLDS = { underutilized: 60, high: 95, overloaded: 110 } as const;

export function classifyUtilization(utilization: number): WorkloadSummary["level"] {
  if (utilization >= WORKLOAD_THRESHOLDS.overloaded) return "OVERLOADED";
  if (utilization >= WORKLOAD_THRESHOLDS.high) return "HIGH";
  if (utilization < WORKLOAD_THRESHOLDS.underutilized) return "UNDERUTILIZED";
  return "NORMAL";
}

export function computeWorkload(input: WorkloadInput): WorkloadSummary {
  const periodMinutes = input.periodMinutes ?? 45;
  const teachingPeriods = input.teachingSlots.length;
  const classes = new Set(input.teachingSlots.map((s) => s.classId)).size;
  const subjects = new Set(input.teachingSlots.map((s) => s.subjectId)).size;
  // Default prep: one prep period per 5 teaching periods (rounded).
  const preparationPeriods = input.preparationPeriods ?? Math.round(teachingPeriods / 5);
  const dutyHours = input.duties.reduce((sum, d) => sum + (d.weeklyHours || 0), 0);
  const toPeriods = (hours: number) => (hours * 60) / periodMinutes;
  const homeroomPeriods = input.homeroomClasses * 1; // one admin period per homeroom
  const totalPeriods =
    teachingPeriods + preparationPeriods + input.substitutionPeriods + toPeriods(input.meetingHours) + toPeriods(dutyHours) + homeroomPeriods;
  const max = Math.max(1, input.maxWeeklyPeriods);
  const utilization = Number(((totalPeriods / max) * 100).toFixed(1));
  return {
    teachingPeriods,
    classes,
    subjects,
    preparationPeriods,
    substitutionPeriods: input.substitutionPeriods,
    meetingHours: Number(input.meetingHours.toFixed(2)),
    dutyHours: Number(dutyHours.toFixed(2)),
    homeroomClasses: input.homeroomClasses,
    leaveDays: input.leaveDays,
    totalPeriods: Number(totalPeriods.toFixed(1)),
    maxWeeklyPeriods: input.maxWeeklyPeriods,
    utilization,
    level: classifyUtilization(utilization),
  };
}
