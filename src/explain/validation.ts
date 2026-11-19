import { REASON_CODES, type ReasonCode } from './reasonCodes';
import type { Decision } from '../types';

export interface ExplainInput {
  roomLabel: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  reasonCodes: ReasonCode[];
  decision: Decision;
}

const ALLOWED_DECISIONS: readonly Decision[] = ['available', 'unavailable'];

export interface ExplainOutput {
  explanation: string;
}

export interface ValidationResult<T> {
  ok: boolean;
  value: T | null;
  error: string | null;
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidHHMM(value: string): boolean {
  return HH_MM.test(value);
}

/**
 * Validate the input that will be sent to the adapter.
 * - roomLabel: 1-50 chars
 * - startTime / endTime: valid HH:MM
 * - reasonCodes: only from the allowed list (no duplicates needed, but no foreign codes)
 */
export function validateInput(
  input: unknown,
): ValidationResult<ExplainInput> {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, value: null, error: 'Input must be an object.' };
  }
  const raw = input as Record<string, unknown>;

  const { roomLabel, startTime, endTime, reasonCodes, decision } = raw;

  if (
    typeof decision !== 'string' ||
    !ALLOWED_DECISIONS.includes(decision as Decision)
  ) {
    return { ok: false, value: null, error: "decision must be 'available' or 'unavailable'." };
  }

  if (typeof roomLabel !== 'string' || roomLabel.length < 1 || roomLabel.length > 50) {
    return { ok: false, value: null, error: 'roomLabel must be 1-50 characters.' };
  }
  if (typeof startTime !== 'string' || !isValidHHMM(startTime)) {
    return { ok: false, value: null, error: 'startTime must be a valid HH:MM string.' };
  }
  if (typeof endTime !== 'string' || !isValidHHMM(endTime)) {
    return { ok: false, value: null, error: 'endTime must be a valid HH:MM string.' };
  }
  if (!Array.isArray(reasonCodes)) {
    return { ok: false, value: null, error: 'reasonCodes must be an array.' };
  }
  const allowed = new Set<string>(REASON_CODES);
  for (const code of reasonCodes) {
    if (typeof code !== 'string' || !allowed.has(code)) {
      return { ok: false, value: null, error: `reasonCodes contains an unknown code: ${String(code)}` };
    }
  }

  return {
    ok: true,
    value: {
      roomLabel,
      startTime,
      endTime,
      reasonCodes: reasonCodes as ReasonCode[],
      decision: decision as Decision,
    },
    error: null,
  };
}

const MAX_EXPLANATION_CHARS = 300;
const MAX_SENTENCES = 2;
const HTML_TAG = /</;

/**
 * Validate the adapter output (treated as untrusted).
 * Format checks: { explanation: string }, non-empty, max 300 chars, max 2 sentences, no HTML.
 * Consistency guard (simple heuristic, not a full language check):
 * - when decision is "unavailable", reject text that claims the room is free/available
 *   or has no conflicts, unless the claim is negated (e.g. "not free", "cannot be booked");
 * - when decision is "available", reject text that says unavailable/not available/blocked/overlap;
 * - reject any HH:MM time in the text that is not startTime or endTime (no invented times).
 */
export function validateOutput(
  output: unknown,
  context: { decision: Decision; startTime: string; endTime: string },
): ValidationResult<ExplainOutput> {
  if (typeof output !== 'object' || output === null) {
    return { ok: false, value: null, error: 'Output must be an object.' };
  }
  const raw = output as Record<string, unknown>;
  const explanation = raw.explanation;
  if (typeof explanation !== 'string') {
    return { ok: false, value: null, error: 'explanation must be a string.' };
  }
  const trimmed = explanation.trim();
  if (trimmed.length === 0) {
    return { ok: false, value: null, error: 'explanation must not be empty.' };
  }
  if (trimmed.length > MAX_EXPLANATION_CHARS) {
    return { ok: false, value: null, error: 'explanation exceeds 300 characters.' };
  }
  if (HTML_TAG.test(trimmed)) {
    return { ok: false, value: null, error: 'explanation must not contain HTML.' };
  }
  const sentenceCount = trimmed
    .split(/[.!?]+/)
    .filter((s) => s.trim().length > 0).length;
  if (sentenceCount > MAX_SENTENCES) {
    return { ok: false, value: null, error: 'explanation must be at most 2 sentences.' };
  }

  const consistency = checkConsistency(trimmed, context);
  if (consistency !== null) {
    return { ok: false, value: null, error: consistency };
  }

  return { ok: true, value: { explanation: trimmed }, error: null };
}

/** Simple, documented heuristic — not a full language check. */
function checkConsistency(
  text: string,
  context: { decision: Decision; startTime: string; endTime: string },
): string | null {
  const lower = text.toLowerCase();

  if (context.decision === 'unavailable') {
    const falseClaims = ['is free', 'are free', 'is available', 'are available', 'no conflicts', 'no conflict'];
    for (const claim of falseClaims) {
      const idx = lower.indexOf(claim);
      if (idx !== -1) {
        const before = lower.slice(Math.max(0, idx - 4), idx);
        if (!/\bnot\b|n't|cannot|no\s+longer\s+/.test(before)) {
          return 'explanation claims availability for an unavailable result.';
        }
      }
    }
  } else {
    const badTerms = ['unavailable', 'not available', 'blocked', 'overlap'];
    for (const term of badTerms) {
      if (lower.includes(term)) {
        return 'explanation claims unavailability for an available result.';
      }
    }
  }

  const allowedTimes = new Set([context.startTime, context.endTime]);
  const timeMatches = text.match(/\b([01]\d|2[0-3]):[0-5]\d\b/g) ?? [];
  for (const t of timeMatches) {
    if (!allowedTimes.has(t)) {
      return 'explanation contains a time not in the request.';
    }
  }

  return null;
}

export const EXPLAIN_LIMITS = {
  MAX_CHARS: MAX_EXPLANATION_CHARS,
  MAX_SENTENCES,
} as const;
