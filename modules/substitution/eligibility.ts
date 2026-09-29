/**
 * Pure substitute-eligibility ranking. Transparent scoring so administrators
 * can see WHY a candidate is suggested. Hard constraints exclude; soft factors rank.
 */
export interface SlotNeed {
  dayOfWeek: number;
  periodId: string;
  subjectId: string;
  departmentId: string | null;
  absentTeacherId: string;
}

export interface CandidateTeacher {
  id: string;
  name: string;
  status: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "INACTIVE";
  subjectIds: string[];
  departmentId: string | null;
  /** "dow:periodId" keys where the teacher already teaches. */
  busyKeys: Set<string>;
  /** "dow:periodId" keys where the teacher already covers another lesson that date. */
  substitutionKeys: Set<string>;
  /** True when the teacher has approved leave on the date. */
  onLeave: boolean;
  availability: Array<{ dayOfWeek: number; periodId: string | null; type: "AVAILABLE" | "UNAVAILABLE" | "PREFERRED" | "PREFERRED_SUBSTITUTION" }>;
  /** Substitutions already covered in the reference week. */
  substitutionsThisWeek: number;
  /** Workload utilization percentage (see timetable/workload). */
  utilization: number;
}

export interface SubstituteCandidate {
  teacherId: string;
  name: string;
  eligible: boolean;
  score: number;
  reasons: string[];
  conflicts: string[];
  subjectMatch: boolean;
  departmentMatch: boolean;
  utilization: number;
  substitutionsThisWeek: number;
}

export function availabilityFor(c: CandidateTeacher, need: SlotNeed) {
  // Period-specific entries win over day-wide entries.
  const specific = c.availability.find((a) => a.dayOfWeek === need.dayOfWeek && a.periodId === need.periodId);
  if (specific) return specific.type;
  const dayWide = c.availability.find((a) => a.dayOfWeek === need.dayOfWeek && a.periodId === null);
  return dayWide?.type ?? null;
}

export function evaluateCandidate(c: CandidateTeacher, need: SlotNeed): SubstituteCandidate {
  const key = `${need.dayOfWeek}:${need.periodId}`;
  const conflicts: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  if (c.id === need.absentTeacherId) conflicts.push("Is the absent teacher");
  if (c.status !== "ACTIVE") conflicts.push(`Teacher status is ${c.status}`);
  if (c.onLeave) conflicts.push("On approved leave that day");
  if (c.busyKeys.has(key)) conflicts.push("Already teaching at this time");
  if (c.substitutionKeys.has(key)) conflicts.push("Already covering another lesson at this time");
  const availability = availabilityFor(c, need);
  if (availability === "UNAVAILABLE") conflicts.push("Marked unavailable at this time");

  const subjectMatch = c.subjectIds.includes(need.subjectId);
  const departmentMatch = !!need.departmentId && c.departmentId === need.departmentId;

  if (subjectMatch) {
    score += 40;
    reasons.push("Teaches this subject");
  }
  if (departmentMatch) {
    score += 20;
    reasons.push("Same department");
  }
  if (availability === "PREFERRED_SUBSTITUTION") {
    score += 20;
    reasons.push("Prefers substitution at this time");
  } else if (availability === "PREFERRED" || availability === "AVAILABLE") {
    score += 10;
    reasons.push("Available at this time");
  }
  // Workload: reward lighter loads, penalise heavy ones.
  if (c.utilization < 60) {
    score += 15;
    reasons.push("Light workload");
  } else if (c.utilization >= 95) {
    score -= 15;
    reasons.push("Heavy workload");
  } else {
    score += 5;
  }
  // Fairness: fewer substitutions this week first.
  score -= Math.min(15, c.substitutionsThisWeek * 5);
  if (c.substitutionsThisWeek > 0) reasons.push(`${c.substitutionsThisWeek} substitution(s) this week`);

  return {
    teacherId: c.id,
    name: c.name,
    eligible: conflicts.length === 0,
    score: conflicts.length === 0 ? score : Number.NEGATIVE_INFINITY,
    reasons,
    conflicts,
    subjectMatch,
    departmentMatch,
    utilization: c.utilization,
    substitutionsThisWeek: c.substitutionsThisWeek,
  };
}

/** Ranks all candidates: eligible first (by score desc, then name), then ineligible with their conflicts. */
export function rankSubstitutes(candidates: CandidateTeacher[], need: SlotNeed): SubstituteCandidate[] {
  return candidates
    .map((c) => evaluateCandidate(c, need))
    .sort((a, b) => {
      if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
      if (a.eligible && b.eligible && b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
}
