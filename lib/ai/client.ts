import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/lib/utils/errors";

/**
 * Anthropic client for the AI assistant layer.
 *
 * The client is created lazily so that the rest of Edura keeps working without an API key:
 * `isAiConfigured()` drives the UI banner and `/api/ai/status`, while every AI service throws a
 * BAD_REQUEST AppError when the key is missing.
 */

/** Latest Sonnet-class model (see the claude-api skill model table). */
export const DEFAULT_AI_MODEL = "claude-sonnet-5";

/** Model id used for every request; override with ANTHROPIC_MODEL. */
export const AI_MODEL: string = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_AI_MODEL;

export const AI_NOT_CONFIGURED_MESSAGE = "AI assistant is not configured (ANTHROPIC_API_KEY missing)";

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

/** Returns the shared Anthropic client, or throws AppError.badRequest when no API key is set. */
export function getAiClient(): Anthropic {
  if (!isAiConfigured()) throw AppError.badRequest(AI_NOT_CONFIGURED_MESSAGE);
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Test helper: drop the cached client (e.g. after changing env vars). */
export function resetAiClient(): void {
  client = null;
}
