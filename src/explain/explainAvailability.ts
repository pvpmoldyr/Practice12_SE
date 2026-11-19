import type { ReasonCode } from './reasonCodes';
import { mapReasonsToCodes } from './reasonCodes';
import { validateInput, validateOutput, type ExplainOutput } from './validation';
import { createMockAdapter } from './mockAdapter';
import type { Decision } from '../types';

const DEFAULT_TIMEOUT_MS = 3000;

export interface ExplainResult {
  explanation: string;
  isFallback: boolean;
}

export type ExplainAdapter = (input: {
  roomLabel: string;
  startTime: string;
  endTime: string;
  reasonCodes: ReasonCode[];
  decision: Decision;
}) => Promise<ExplainOutput>;

interface ExplainParams {
  roomLabel: string;
  startTime: string;
  endTime: string;
  /** The checker's own decision + reasons — used to build a deterministic fallback. */
  decision: Decision;
  reasons: readonly string[];
  adapter?: ExplainAdapter;
  timeoutMs?: number;
}

/**
 * Orchestrator: validate input -> call adapter (with a 3s timeout) ->
 * validate output -> return explanation.
 * On timeout, error, or invalid output, returns a deterministic fallback
 * built from the checker's own `reasons`, flagged as fallback.
 */
export async function explainAvailability(
  params: ExplainParams,
): Promise<ExplainResult> {
  const reasonCodes = mapReasonsToCodes(params.reasons);
  const input = {
    roomLabel: params.roomLabel,
    startTime: params.startTime,
    endTime: params.endTime,
    reasonCodes,
    decision: params.decision,
  };

  const inputCheck = validateInput(input);
  if (!inputCheck.ok || inputCheck.value === null) {
    return { explanation: fallback(params), isFallback: true };
  }

  // If the checker says unavailable but none of its reason texts is recognised,
  // do not ask the adapter — it would have no facts to explain and could claim
  // the room is free. Return the deterministic fallback instead.
  if (params.decision === 'unavailable' && reasonCodes.length === 0) {
    return { explanation: fallback(params), isFallback: true };
  }

  const adapter = params.adapter ?? createMockAdapter();
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const result = await withTimeout(adapter(inputCheck.value), timeoutMs);
    const outputCheck = validateOutput(result, {
      decision: params.decision,
      startTime: params.startTime,
      endTime: params.endTime,
    });
    if (!outputCheck.ok || outputCheck.value === null) {
      return { explanation: fallback(params), isFallback: true };
    }
    return { explanation: outputCheck.value.explanation, isFallback: false };
  } catch {
    return { explanation: fallback(params), isFallback: true };
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Explain adapter timed out after ${ms} ms.`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Deterministic fallback built only from the checker's decision and reasons. */
function fallback(params: ExplainParams): string {
  if (params.decision === 'available') {
    return `${params.roomLabel} is available for ${params.startTime}–${params.endTime}. No conflicts were detected.`;
  }
  if (params.reasons.length === 0) {
    return `${params.roomLabel} is unavailable for ${params.startTime}–${params.endTime}. No further details are available.`;
  }
  const first = params.reasons[0];
  return `${params.roomLabel} is unavailable: ${first}`;
}
