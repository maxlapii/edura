/**
 * Runs a service call and captures the outcome without throwing, so pages can
 * build JSX *after* the try/catch (the `react-hooks/error-boundaries` lint rule
 * forbids constructing JSX inside try/catch).
 */
export type Loaded<T> = { ok: true; data: T } | { ok: false; error: unknown };

export async function load<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}
