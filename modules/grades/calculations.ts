/** Pure grade calculations. */

export interface GradeScaleBand {
  letter: string;
  min: number; // inclusive percentage
}

export const DEFAULT_GRADE_SCALE: GradeScaleBand[] = [
  { letter: "A", min: 90 },
  { letter: "B", min: 80 },
  { letter: "C", min: 70 },
  { letter: "D", min: 60 },
  { letter: "F", min: 0 },
];

export function percentage(score: number, maxScore: number): number {
  if (maxScore <= 0) return 0;
  return Number(((score / maxScore) * 100).toFixed(2));
}

export function letterGrade(pct: number, scale: GradeScaleBand[] = DEFAULT_GRADE_SCALE): string {
  const sorted = [...scale].sort((a, b) => b.min - a.min);
  for (const band of sorted) if (pct >= band.min) return band.letter;
  return sorted[sorted.length - 1]?.letter ?? "F";
}

/** Validates a score against its maximum. Returns an error message or null. */
export function validateScore(score: number, maxScore: number): string | null {
  if (!Number.isFinite(score)) return "Score must be a number";
  if (!Number.isFinite(maxScore) || maxScore <= 0) return "Maximum score must be positive";
  if (score < 0) return "Score cannot be negative";
  if (score > maxScore) return `Score cannot exceed the maximum of ${maxScore}`;
  return null;
}

export interface WeightedItem {
  score: number;
  maxScore: number;
  weight?: number;
}

/** Weighted average as a percentage (weights default to 1). Returns null when there is nothing to average. */
export function weightedAverage(items: WeightedItem[]): number | null {
  const valid = items.filter((i) => i.maxScore > 0);
  if (!valid.length) return null;
  const totalWeight = valid.reduce((s, i) => s + (i.weight ?? 1), 0);
  if (totalWeight === 0) return null;
  const sum = valid.reduce((s, i) => s + percentage(i.score, i.maxScore) * (i.weight ?? 1), 0);
  return Number((sum / totalWeight).toFixed(2));
}

export interface CourseSummary {
  average: number | null;
  letter: string | null;
  graded: number;
  total: number;
}

export function summarizeCourse(items: WeightedItem[], totalAssessments: number, scale?: GradeScaleBand[]): CourseSummary {
  const average = weightedAverage(items);
  return { average, letter: average === null ? null : letterGrade(average, scale), graded: items.length, total: totalAssessments };
}

/** Overall GPA-like average across courses (unweighted by credits). */
export function overallAverage(courseAverages: Array<number | null>): number | null {
  const valid = courseAverages.filter((a): a is number => a !== null);
  if (!valid.length) return null;
  return Number((valid.reduce((s, a) => s + a, 0) / valid.length).toFixed(2));
}
