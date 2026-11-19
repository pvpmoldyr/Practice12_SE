import { useState } from 'react';
import { Sparkles, Loader2, Info } from 'lucide-react';
import type { CheckResult } from '@/types';
import { explainAvailability } from '@/explain/explainAvailability';

interface ExplanationPanelProps {
  /** The confirmed result already stored in `res` (never mutated). */
  result: CheckResult;
  roomLabel: string;
  startTime: string;
  endTime: string;
}

interface ExplainState {
  loading: boolean;
  text: string | null;
  isFallback: boolean;
}

export function ExplanationPanel({
  result,
  roomLabel,
  startTime,
  endTime,
}: ExplanationPanelProps) {
  const [state, setState] = useState<ExplainState>({
    loading: false,
    text: null,
    isFallback: false,
  });

  async function handleExplain() {
    setState({ loading: true, text: null, isFallback: false });
    const out = await explainAvailability({
      roomLabel,
      startTime,
      endTime,
      decision: result.decision,
      reasons: result.reasons,
    });
    setState({ loading: false, text: out.explanation, isFallback: out.isFallback });
  }

  const available = result.decision === 'available';

  return (
    <div
      className={`mt-3 rounded-xl border p-4 transition-all ${
        state.isFallback
          ? 'bg-amber-50 border-amber-200'
          : 'bg-slate-50 border-slate-200'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="w-4 h-4 text-slate-500 shrink-0" />
          <span className="text-xs font-semibold text-slate-600 truncate">
            {state.text === null
              ? 'AI-generated explanation (mock)'
              : state.isFallback
                ? 'AI explanation unavailable'
                : 'AI-generated explanation (mock)'}
          </span>
        </div>
        {state.text === null && !state.loading && (
          <button
            onClick={handleExplain}
            className="shrink-0 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium px-3 py-1.5 transition-all"
          >
            Explain availability
          </button>
        )}
      </div>

      {state.loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Generating explanation…
        </div>
      )}

      {state.text !== null && (
        <div className="mt-3">
          <p className="text-sm text-slate-700 leading-relaxed">{state.text}</p>
          {state.isFallback && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700">
              <Info className="w-3.5 h-3.5 shrink-0" />
              The mock explainer could not respond, so a local summary is shown.
            </p>
          )}
          <button
            onClick={handleExplain}
            className="mt-3 text-xs font-medium text-slate-500 hover:text-slate-700 underline underline-offset-2"
          >
            Regenerate
          </button>
        </div>
      )}

      {state.text === null && !state.loading && available && (
        <p className="mt-2 text-xs text-slate-400">
          Generates a short plain-text summary of this availability result.
        </p>
      )}
    </div>
  );
}
