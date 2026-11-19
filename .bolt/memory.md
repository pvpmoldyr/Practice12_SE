# Project memory

## Product intent & audience

- Room/meeting availability checker with a human-readable explanation feature for students/end-users.
- `checkAvailability` in `src/availability.ts` is the single source of truth; the explain feature renders its decision in natural language.

## Brand personality & voice

- Clear, concise, deterministic explanations. No invented facts, times, or bookings.
- Fallback text is factual and neutral (e.g. "No further details are available.").

## Visual design & UX direction

- React + Vite + Tailwind + Lucide React; `@/` alias → `src/`.
- `ExplanationPanel` component consumes `explainAvailability` output; displays status with its explanation.
- `DayTimeline` visualizes the day; not to be modified for explain-feature work.

## Decisions, constraints & rationale

- **No external deps/patterns**: stick to existing stack; pure functions only.
- **Explain architecture**: `ExplainParams`/`ExplainAdapter` input includes `decision: CheckResult['decision']` (`'available' | 'unavailable'`). Flow: `mapReasonsToCodes` → adapter (if codes exist) → `validateOutput` → `fallback`.
- **validateInput**: rejects `decision` values other than `'available'`/`'unavailable'`.
- **validateOutput**: format checks (type, non-empty, ≤300 chars, no HTML, sentence count) + consistency heuristic: rejects claims contradicting decision (e.g. "is free" under unavailable; "unavailable/blocked/overlap" under available) and any HH:MM time not equal to `startTime`/`endTime`.
- **explainAvailability**: if decision is unavailable and `mapReasonsToCodes` returns no codes, adapter is skipped; deterministic fallback returned.
- **fallback()**: branches only on `decision`; unavailable+empty-reasons → "…is unavailable for <start>–<end>. No further details are available."; available keeps prior text.
- **File scope discipline**: `availability.ts`, `availability.test.ts`, `types.ts`, sample data, `DayTimeline` are off-limits for explain-feature changes.
- **AGENTS.md** exists with project rules; must be read and followed before making changes.

## Open questions & assumptions

- Test count: 36 availability + 44 explain = 80 total (vitest). Lint/typecheck/build scripts exist and must pass.
- `mockAdapter` is the current default adapter; real/LLM adapter may come later but no new deps allowed.
- Consistency guard is an intentionally simple heuristic, not full NLP — may need refinement as edge cases surface.