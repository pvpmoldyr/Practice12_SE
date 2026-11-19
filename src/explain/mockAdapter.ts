import type { ExplainInput, ExplainOutput } from './validation';
import type { ReasonCode } from './reasonCodes';

export interface MockAdapterOptions {
  /** Simulated processing delay in ms before resolving. */
  delayMs?: number;
  /** Force the adapter to reject after this many ms (simulates a failure). */
  failAfterMs?: number;
  /** Force the adapter to reject immediately with this error message. */
  throwError?: string;
  /** Force the adapter to resolve with this exact output (used to test invalid output). */
  forceOutput?: unknown;
}

/**
 * MOCK adapter only. Builds a short explanation from a template per reason
 * code, using only the supplied facts. Never calls any real service.
 */
export function createMockAdapter(
  options: MockAdapterOptions = {},
): (input: ExplainInput) => Promise<ExplainOutput> {
  return async (input: ExplainInput): Promise<ExplainOutput> => {
    if (options.throwError !== undefined) {
      throw new Error(options.throwError);
    }

    const delay = options.delayMs ?? 0;
    if (delay > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delay);
      });
    }

    if (options.failAfterMs !== undefined) {
      throw new Error(`Mock adapter simulated failure after ${options.failAfterMs} ms.`);
    }

    if (options.forceOutput !== undefined) {
      return options.forceOutput as ExplainOutput;
    }

    return { explanation: buildExplanation(input) };
  };
}

function buildExplanation(input: ExplainInput): string {
  const { roomLabel, startTime, endTime, reasonCodes, decision } = input;

  if (decision === 'available') {
    return `${roomLabel} is available from ${startTime} to ${endTime}.`;
  }
  if (reasonCodes.length === 0) {
    return `${roomLabel} is unavailable for ${startTime}–${endTime}.`;
  }

  const phrases = reasonCodes.map((code) => phraseFor(code));
  const reasonText = joinPhrases(phrases);
  return `${roomLabel} is unavailable for ${startTime}–${endTime} because ${reasonText}.`;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`;
}

function phraseFor(code: ReasonCode): string {
  switch (code) {
    case 'INVALID_INPUT':
      return 'the times entered are not valid';
    case 'OUT_OF_DAY':
      return 'the times must stay within the same day';
    case 'START_AFTER_END':
      return 'the start time must be earlier than the end time';
    case 'PAST_START':
      return 'the start time has already passed';
    case 'TOO_LONG':
      return 'a booking can last at most 120 minutes';
    case 'ROOM_BLOCKED':
      return 'the room is blocked';
    case 'OVERLAP':
      return 'it overlaps an existing booking';
    default:
      return 'the request could not be confirmed';
  }
}
