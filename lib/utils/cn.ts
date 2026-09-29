import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * Class name helper: joins conditional classes and resolves Tailwind conflicts so that a
 * caller's override (e.g. `w-64`) reliably wins over a component default (e.g. `w-full`).
 * Custom design tokens are registered so they are grouped correctly.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      color: ["ink", "ink-soft", "muted", "canvas", "frame", "brand", "accent", "pastel-blue", "pastel-lavender", "pastel-green", "pastel-peach", "pastel-yellow", "pastel-rose"],
      font: ["display", "sans"],
      shadow: ["card", "pop", "frame"],
      radius: ["card"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
