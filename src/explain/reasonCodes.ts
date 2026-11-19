/**
 * Maps the human-readable `reasons` strings produced by checkAvailability
 * to a small set of machine-friendly reason codes. This mapping is purely
 * descriptive — it never changes the availability decision or the reasons.
 */

export type ReasonCode =
  | 'INVALID_INPUT'
  | 'OUT_OF_DAY'
  | 'START_AFTER_END'
  | 'PAST_START'
  | 'TOO_LONG'
  | 'ROOM_BLOCKED'
  | 'OVERLAP';

export const REASON_CODES: readonly ReasonCode[] = [
  'INVALID_INPUT',
  'OUT_OF_DAY',
  'START_AFTER_END',
  'PAST_START',
  'TOO_LONG',
  'ROOM_BLOCKED',
  'OVERLAP',
];

interface ReasonPattern {
  code: ReasonCode;
  test: (reason: string) => boolean;
}

const PATTERNS: readonly ReasonPattern[] = [
  {
    code: 'INVALID_INPUT',
    test: (r) => r.startsWith('Please enter a valid'),
  },
  {
    code: 'OUT_OF_DAY',
    test: (r) => r.includes('within the same day'),
  },
  {
    code: 'START_AFTER_END',
    test: (r) => r.includes('Start time must be earlier than end time'),
  },
  {
    code: 'PAST_START',
    test: (r) => r.includes('Start time must be after the current time'),
  },
  {
    code: 'TOO_LONG',
    test: (r) => r.includes('maximum allowed'),
  },
  {
    code: 'ROOM_BLOCKED',
    test: (r) =>
      r.includes('currently blocked') || r.includes('Under maintenance'),
  },
  {
    code: 'OVERLAP',
    test: (r) => r.startsWith('Overlaps existing booking'),
  },
];

/**
 * Pure function: map the text reasons from checkAvailability to codes.
 * Returns an empty list when the request is available (no reasons).
 * Unknown reason strings are ignored rather than mapped to a wrong code.
 */
export function mapReasonsToCodes(reasons: readonly string[]): ReasonCode[] {
  const codes: ReasonCode[] = [];
  for (const reason of reasons) {
    for (const pattern of PATTERNS) {
      if (pattern.test(reason)) {
        if (!codes.includes(pattern.code)) {
          codes.push(pattern.code);
        }
        break;
      }
    }
  }
  return codes;
}
