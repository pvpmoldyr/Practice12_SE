import { describe, expect, it } from 'vitest';
import { checkAvailability } from '../availability';
import { mapReasonsToCodes, REASON_CODES } from './reasonCodes';
import {
  validateInput,
  validateOutput,
  EXPLAIN_LIMITS,
} from './validation';
import { createMockAdapter } from './mockAdapter';
import { explainAvailability } from './explainAvailability';
import { sampleRooms } from '../sampleData';
import type { Room } from '../types';

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: 'r1',
    name: 'Room 1',
    building: 'A',
    capacity: 20,
    blocked: false,
    bookings: [{ start: 600, end: 660, title: 'Existing', bookedBy: 'Tester' }],
    ...overrides,
  };
}

const CURRENT = 540;

describe('reasonCodes - mapReasonsToCodes', () => {
  it('returns an empty list when available (no reasons)', () => {
    const res = checkAvailability(makeRoom(), 660, 720, CURRENT);
    expect(mapReasonsToCodes(res.reasons)).toEqual([]);
  });

  it('maps each known reason text to exactly one code', () => {
    const cases: Array<{ reasons: string[]; codes: string[] }> = [
      {
        reasons: ['Please enter a valid start time, end time and current time.'],
        codes: ['INVALID_INPUT'],
      },
      {
        reasons: ['Times must fall within the same day (00:00–24:00).'],
        codes: ['OUT_OF_DAY'],
      },
      {
        reasons: ['Start time must be earlier than end time.'],
        codes: ['START_AFTER_END'],
      },
      {
        reasons: ['Start time must be after the current time.'],
        codes: ['PAST_START'],
      },
      {
        reasons: ['Booking duration is 121 min — maximum allowed is 120 min.'],
        codes: ['TOO_LONG'],
      },
      {
        reasons: ['This room is currently blocked.'],
        codes: ['ROOM_BLOCKED'],
      },
      {
        reasons: ['Under maintenance — HVAC repair scheduled.'],
        codes: ['ROOM_BLOCKED'],
      },
      {
        reasons: ['Overlaps existing booking "Existing" (10:00–11:00).'],
        codes: ['OVERLAP'],
      },
    ];
    for (const { reasons, codes } of cases) {
      expect(mapReasonsToCodes(reasons)).toEqual(codes);
    }
  });

  it('maps several reasons at once, in order, de-duplicated', () => {
    const reasons = [
      'Times must fall within the same day (00:00–24:00).',
      'Times must fall within the same day (00:00–24:00).',
      'Start time must be earlier than end time.',
    ];
    expect(mapReasonsToCodes(reasons)).toEqual(['OUT_OF_DAY', 'START_AFTER_END']);
  });

  it('ignores unknown reason text rather than guessing', () => {
    expect(mapReasonsToCodes(['something completely unknown'])).toEqual([]);
  });

  it('all exported codes are unique', () => {
    expect(new Set(REASON_CODES).size).toBe(REASON_CODES.length);
  });
});

describe('validation - validateInput', () => {
  const valid = {
    roomLabel: 'Room 101',
    startTime: '10:00',
    endTime: '11:00',
    reasonCodes: ['OVERLAP', 'TOO_LONG'] as const,
    decision: 'unavailable' as const,
  };

  it('accepts a well-formed input', () => {
    const r = validateInput(valid);
    expect(r.ok).toBe(true);
    expect(r.value).toEqual(valid);
  });

  it('rejects an empty roomLabel', () => {
    expect(validateInput({ ...valid, roomLabel: '' }).ok).toBe(false);
  });

  it('rejects a roomLabel over 50 chars', () => {
    expect(validateInput({ ...valid, roomLabel: 'x'.repeat(51) }).ok).toBe(false);
  });

  it('rejects malformed times', () => {
    expect(validateInput({ ...valid, startTime: '25:00' }).ok).toBe(false);
    expect(validateInput({ ...valid, startTime: '9:00' }).ok).toBe(false);
    expect(validateInput({ ...valid, endTime: '10-30' }).ok).toBe(false);
  });

  it('rejects unknown reason codes', () => {
    expect(
      validateInput({ ...valid, reasonCodes: ['NOPE'] }).ok,
    ).toBe(false);
  });

  it('rejects an invalid decision', () => {
    expect(validateInput({ ...valid, decision: 'maybe' }).ok).toBe(false);
    expect(validateInput({ ...valid, decision: undefined }).ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateInput(null).ok).toBe(false);
    expect(validateInput('hello').ok).toBe(false);
  });
});

describe('validation - validateOutput', () => {
  const ctxAvailable = { decision: 'available' as const, startTime: '10:00', endTime: '11:00' };
  const ctxUnavailable = { decision: 'unavailable' as const, startTime: '10:00', endTime: '11:00' };

  it('accepts a valid explanation consistent with an available decision', () => {
    const r = validateOutput(
      { explanation: 'Room is available for 10:00–11:00.' },
      ctxAvailable,
    );
    expect(r.ok).toBe(true);
    expect(r.value?.explanation).toBe('Room is available for 10:00–11:00.');
  });

  it('accepts a valid explanation consistent with an unavailable decision', () => {
    const r = validateOutput(
      { explanation: 'Room is unavailable for 10:00–11:00.' },
      ctxUnavailable,
    );
    expect(r.ok).toBe(true);
  });

  it('rejects empty / whitespace explanation', () => {
    expect(validateOutput({ explanation: '' }, ctxAvailable).ok).toBe(false);
    expect(validateOutput({ explanation: '   ' }, ctxAvailable).ok).toBe(false);
  });

  it('rejects explanations over 300 chars', () => {
    expect(
      validateOutput({ explanation: 'a'.repeat(EXPLAIN_LIMITS.MAX_CHARS + 1) }, ctxAvailable).ok,
    ).toBe(false);
  });

  it('rejects explanations with more than 2 sentences', () => {
    expect(
      validateOutput({ explanation: 'One. Two. Three.' }, ctxAvailable).ok,
    ).toBe(false);
  });

  it('rejects explanations containing HTML', () => {
    expect(
      validateOutput({ explanation: 'Available. <script>alert(1)</script>' }, ctxAvailable).ok,
    ).toBe(false);
  });

  it('rejects non-string explanation', () => {
    expect(validateOutput({ explanation: 42 }, ctxAvailable).ok).toBe(false);
    expect(validateOutput({}, ctxAvailable).ok).toBe(false);
  });

  it('rejects an explanation that claims free/available for an unavailable result', () => {
    expect(
      validateOutput({ explanation: 'Room 101 is free.' }, ctxUnavailable).ok,
    ).toBe(false);
    expect(
      validateOutput({ explanation: 'Room 101 is available. No conflicts.' }, ctxUnavailable).ok,
    ).toBe(false);
  });

  it('rejects an explanation that claims unavailable for an available result', () => {
    expect(
      validateOutput({ explanation: 'Room 101 is unavailable.' }, ctxAvailable).ok,
    ).toBe(false);
    expect(
      validateOutput({ explanation: 'Room 101 is blocked.' }, ctxAvailable).ok,
    ).toBe(false);
  });

  it('rejects an explanation containing a time not in the request', () => {
    expect(
      validateOutput(
        { explanation: 'Room 101 is available for 09:00–11:00.' },
        ctxAvailable,
      ).ok,
    ).toBe(false);
  });

  it('allows a negated availability claim for an unavailable result', () => {
    const r = validateOutput(
      { explanation: 'Room 101 is not available for 10:00–11:00.' },
      ctxUnavailable,
    );
    expect(r.ok).toBe(true);
  });
});

describe('mockAdapter', () => {
  it('builds an available explanation when decision is available', async () => {
    const adapter = createMockAdapter();
    const out = await adapter({
      roomLabel: 'Room 101',
      startTime: '10:00',
      endTime: '11:00',
      reasonCodes: [],
      decision: 'available',
    });
    expect(out.explanation).toBe('Room 101 is available from 10:00 to 11:00.');
  });

  it('builds an unavailable explanation for a reason code', async () => {
    const adapter = createMockAdapter();
    const out = await adapter({
      roomLabel: 'Room 101',
      startTime: '10:00',
      endTime: '11:00',
      reasonCodes: ['OVERLAP'],
      decision: 'unavailable',
    });
    expect(out.explanation).toContain('unavailable');
    expect(out.explanation).toContain('overlaps an existing booking');
  });

  it('simulates a delay', async () => {
    const adapter = createMockAdapter({ delayMs: 30 });
    const start = Date.now();
    await adapter({
      roomLabel: 'Room 101',
      startTime: '10:00',
      endTime: '11:00',
      reasonCodes: [],
      decision: 'available',
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });

  it('throws immediately when throwError is set', async () => {
    const adapter = createMockAdapter({ throwError: 'boom' });
    await expect(
      adapter({
        roomLabel: 'Room 101',
        startTime: '10:00',
        endTime: '11:00',
        reasonCodes: [],
        decision: 'available',
      }),
    ).rejects.toThrow('boom');
  });

  it('throws after the simulated failure window', async () => {
    const adapter = createMockAdapter({ delayMs: 10, failAfterMs: 5 });
    await expect(
      adapter({
        roomLabel: 'Room 101',
        startTime: '10:00',
        endTime: '11:00',
        reasonCodes: [],
        decision: 'available',
      }),
    ).rejects.toThrow();
  });

  it('can force invalid output for testing', async () => {
    const adapter = createMockAdapter({ forceOutput: { explanation: '' } });
    const out = await adapter({
      roomLabel: 'Room 101',
      startTime: '10:00',
      endTime: '11:00',
      reasonCodes: [],
      decision: 'available',
    });
    expect(out).toEqual({ explanation: '' });
  });
});

describe('explainAvailability - default path (no adapter passed)', () => {
  const roomLabel = 'Room 101 — Lecture Hall A';

  const reasonText: Record<string, string> = {
    INVALID_INPUT: 'Please enter a valid start time, end time and current time.',
    OUT_OF_DAY: 'Times must fall within the same day (00:00–24:00).',
    START_AFTER_END: 'Start time must be earlier than end time.',
    PAST_START: 'Start time must be after the current time.',
    TOO_LONG: 'Booking duration is 121 min — maximum allowed is 120 min.',
    ROOM_BLOCKED: 'This room is currently blocked.',
    OVERLAP: 'Overlaps existing booking "Existing" (10:00–11:00).',
  };

  const expectedPhrase: Record<string, string> = {
    INVALID_INPUT: 'the times entered are not valid',
    OUT_OF_DAY: 'the times must stay within the same day',
    START_AFTER_END: 'the start time must be earlier than the end time',
    PAST_START: 'the start time has already passed',
    TOO_LONG: 'a booking can last at most 120 minutes',
    ROOM_BLOCKED: 'the room is blocked',
    OVERLAP: 'it overlaps an existing booking',
  };

  for (const code of REASON_CODES) {
    it(`explains a single ${code} reason via the default path without falling back`, async () => {
      const r = await explainAvailability({
        roomLabel,
        startTime: '11:00',
        endTime: '13:00',
        decision: 'unavailable',
        reasons: [reasonText[code]],
      });
      expect(r.isFallback).toBe(false);
      expect(r.explanation).toContain(expectedPhrase[code]);
      expect(r.explanation.length).toBeLessThanOrEqual(EXPLAIN_LIMITS.MAX_CHARS);
    });
  }

  it('explains two reason codes in one sentence without falling back', async () => {
    const r = await explainAvailability({
      roomLabel,
      startTime: '11:00',
      endTime: '13:00',
      decision: 'unavailable',
      reasons: [reasonText.PAST_START, reasonText.OVERLAP],
    });
    expect(r.isFallback).toBe(false);
    expect(r.explanation).toContain(expectedPhrase.PAST_START);
    expect(r.explanation).toContain(expectedPhrase.OVERLAP);
    expect(r.explanation).toContain(' and ');
    expect(r.explanation.length).toBeLessThanOrEqual(EXPLAIN_LIMITS.MAX_CHARS);
  });

  it('explains three reason codes joined with commas and "and" without falling back', async () => {
    const r = await explainAvailability({
      roomLabel,
      startTime: '11:00',
      endTime: '13:00',
      decision: 'unavailable',
      reasons: [reasonText.PAST_START, reasonText.OVERLAP, reasonText.TOO_LONG],
    });
    expect(r.isFallback).toBe(false);
    expect(r.explanation).toContain(expectedPhrase.PAST_START);
    expect(r.explanation).toContain(expectedPhrase.OVERLAP);
    expect(r.explanation).toContain(expectedPhrase.TOO_LONG);
    expect(r.explanation).toMatch(/, and |, /);
    expect(r.explanation.length).toBeLessThanOrEqual(EXPLAIN_LIMITS.MAX_CHARS);
  });

  it('available result uses the available template via the default path', async () => {
    const r = await explainAvailability({
      roomLabel,
      startTime: '11:00',
      endTime: '12:00',
      decision: 'available',
      reasons: [],
    });
    expect(r.isFallback).toBe(false);
    expect(r.explanation).toBe('Room 101 — Lecture Hall A is available from 11:00 to 12:00.');
  });

  it('never shows raw code names such as PAST_START or "past start" in the text', async () => {
    for (const code of REASON_CODES) {
      const r = await explainAvailability({
        roomLabel,
        startTime: '11:00',
        endTime: '13:00',
        decision: 'unavailable',
        reasons: [reasonText[code]],
      });
      expect(r.isFallback).toBe(false);
      const lower = r.explanation.toLowerCase();
      const asWords = code.toLowerCase().replace(/_/g, ' ');
      // The raw code (with or without underscores) must never appear as a token.
      const pattern = new RegExp(['\\b', asWords, '\\b'].join(''));
      expect(lower).not.toMatch(pattern);
    }
  });
});

describe('explainAvailability - fallback behaviour', () => {
  const baseParams = {
    roomLabel: 'Room 101',
    startTime: '10:00',
    endTime: '11:00',
    decision: 'unavailable' as const,
    reasons: ['Overlaps existing booking "Existing" (10:00–11:00).'],
  };

  it('returns a non-fallback explanation for a healthy adapter', async () => {
    const adapter = createMockAdapter();
    const r = await explainAvailability({ ...baseParams, adapter });
    expect(r.isFallback).toBe(false);
    expect(r.explanation.length).toBeGreaterThan(0);
  });

  it('returns a fallback on adapter error', async () => {
    const adapter = createMockAdapter({ throwError: 'down' });
    const r = await explainAvailability({ ...baseParams, adapter });
    expect(r.isFallback).toBe(true);
    expect(r.explanation).toContain('unavailable');
    expect(r.explanation).toContain('Room 101');
  });

  it('returns a fallback on timeout', async () => {
    const adapter = createMockAdapter({ delayMs: 200 });
    const r = await explainAvailability({
      ...baseParams,
      adapter,
      timeoutMs: 20,
    });
    expect(r.isFallback).toBe(true);
    expect(r.explanation).toContain('Room 101');
  });

  it('returns a fallback when the adapter output is invalid', async () => {
    const adapter = createMockAdapter({ forceOutput: { explanation: '' } });
    const r = await explainAvailability({ ...baseParams, adapter });
    expect(r.isFallback).toBe(true);
  });

  it('returns a fallback when the adapter output exceeds 300 chars', async () => {
    const adapter = createMockAdapter({
      forceOutput: { explanation: 'a'.repeat(301) },
    });
    const r = await explainAvailability({ ...baseParams, adapter });
    expect(r.isFallback).toBe(true);
  });

  it('returns a fallback when the adapter claims free for an unavailable result', async () => {
    const adapter = createMockAdapter({
      forceOutput: { explanation: 'Room 101 is free.' },
    });
    const r = await explainAvailability({ ...baseParams, adapter });
    expect(r.isFallback).toBe(true);
  });

  it('returns a fallback when the adapter claims unavailable for an available result', async () => {
    const adapter = createMockAdapter({
      forceOutput: { explanation: 'Room 101 is unavailable.' },
    });
    const r = await explainAvailability({
      ...baseParams,
      decision: 'available',
      reasons: [],
      adapter,
    });
    expect(r.isFallback).toBe(true);
  });

  it('returns a fallback when the adapter output contains a time not in the request', async () => {
    const adapter = createMockAdapter({
      forceOutput: { explanation: 'Room 101 is unavailable for 09:00–11:00.' },
    });
    const r = await explainAvailability({ ...baseParams, adapter });
    expect(r.isFallback).toBe(true);
  });

  it('fallback is deterministic and built from the checker reasons', async () => {
    const adapter = createMockAdapter({ throwError: 'x' });
    const a = await explainAvailability({ ...baseParams, adapter });
    const b = await explainAvailability({ ...baseParams, adapter });
    expect(a).toEqual(b);
  });

  it('fallback for an available result mentions availability', async () => {
    const adapter = createMockAdapter({ throwError: 'x' });
    const r = await explainAvailability({
      ...baseParams,
      decision: 'available',
      reasons: [],
      adapter,
    });
    expect(r.isFallback).toBe(true);
    expect(r.explanation).toContain('available');
  });
});

describe('explainAvailability - unavailable with unrecognised reasons', () => {
  it('does not call the adapter and returns a fallback that never says free/available', async () => {
    let called = false;
    const adapter: ReturnType<typeof createMockAdapter> = async (input) => {
      called = true;
      return { explanation: `${input.roomLabel} is free.` };
    };
    const r = await explainAvailability({
      roomLabel: 'Room 101',
      startTime: '10:00',
      endTime: '11:00',
      decision: 'unavailable',
      reasons: ['something completely unrecognised'],
      adapter,
    });
    expect(called).toBe(false);
    expect(r.isFallback).toBe(true);
    expect(r.explanation.toLowerCase()).not.toContain('free');
    expect(r.explanation.toLowerCase()).not.toMatch(/\bis available\b/);
    expect(r.explanation.toLowerCase()).not.toMatch(/\bare available\b/);
  });

  it('fallback for unavailable with empty reasons never says the room is available', async () => {
    const r = await explainAvailability({
      roomLabel: 'Room 101',
      startTime: '10:00',
      endTime: '11:00',
      decision: 'unavailable',
      reasons: [],
      adapter: createMockAdapter(),
    });
    expect(r.isFallback).toBe(true);
    expect(r.explanation.toLowerCase()).not.toContain('free');
    expect(r.explanation.toLowerCase()).not.toMatch(/\bis available\b/);
    expect(r.explanation).toContain('unavailable');
    expect(r.explanation).toContain('No further details are available.');
  });
});

describe('explainAvailability - status is unchanged after explaining', () => {
  it('decision and reasons from checkAvailability are identical before and after explaining', async () => {
    const room = makeRoom();
    const before = checkAvailability(room, 630, 690, CURRENT);
    const adapter = createMockAdapter();
    await explainAvailability({
      roomLabel: room.name,
      startTime: '10:30',
      endTime: '11:30',
      decision: before.decision,
      reasons: before.reasons,
      adapter,
    });
    const after = checkAvailability(room, 630, 690, CURRENT);
    expect(after).toEqual(before);
  });

  it('room and bookings are not mutated by explaining', async () => {
    const room = makeRoom();
    const roomBefore = structuredClone(room);
    const adapter = createMockAdapter();
    await explainAvailability({
      roomLabel: room.name,
      startTime: '10:30',
      endTime: '11:30',
      decision: 'unavailable',
      reasons: ['Overlaps existing booking "Existing" (10:00–11:00).'],
      adapter,
    });
    expect(room).toEqual(roomBefore);
  });

  it('explanation never changes the decision on sample rooms', async () => {
    for (const room of sampleRooms) {
      const res = checkAvailability(room, 660, 720, CURRENT);
      const decisionBefore = res.decision;
      const adapter = createMockAdapter();
      await explainAvailability({
        roomLabel: room.name,
        startTime: '11:00',
        endTime: '12:00',
        decision: res.decision,
        reasons: res.reasons,
        adapter,
      });
      const decisionAfter = checkAvailability(room, 660, 720, CURRENT).decision;
      expect(decisionAfter).toBe(decisionBefore);
    }
  });
});
