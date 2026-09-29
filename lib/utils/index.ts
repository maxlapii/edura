export * from "./errors";
export * from "./dates";
export { cn } from "./cn";

export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const k of keys) if (k in obj) out[k] = obj[k];
  return out;
}

export function fullName(p: { firstName: string; lastName: string }): string {
  return `${p.firstName} ${p.lastName}`.trim();
}

export function percent(n: number, d: number, digits = 1): number {
  if (d === 0) return 0;
  return Number(((n / d) * 100).toFixed(digits));
}
