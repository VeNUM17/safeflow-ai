import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, ChevronDown, ChevronUp, CheckCircle2, ShieldCheck } from 'lucide-react';

interface Props {
  isSample?: boolean;
}

export const SafetyDisclaimerBanner: React.FC<Props> = ({ isSample }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-amber-950/70 border-b border-amber-500/30 text-amber-200 px-4 py-2 text-xs shadow-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[10px] tracking-wider uppercase">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Process Safety Scope</span>
          </div>

          <span className="text-amber-100/90 text-xs">
            OSHA 29 CFR 1910.119(d)(1) Evidence Management Engine. Machine-extracted records require licensed engineer certification.
          </span>

          {isSample && (
            <span className="bg-cyan-500/20 text-cyan-300 font-mono text-[10px] px-2 py-0.5 rounded-full border border-cyan-500/40 uppercase font-semibold">
              Demo Project
            </span>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-400 hover:text-amber-300 flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 transition-all shrink-0 ml-auto md:ml-0"
        >
          <span>{expanded ? 'Hide Regulatory Scope' : 'Review Standards & Scope'}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="max-w-7xl mx-auto mt-2.5 pt-2.5 border-t border-amber-500/20 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] leading-relaxed text-amber-200/90">
          <div className="bg-slate-950/70 p-3 rounded-xl border border-amber-500/20 shadow-inner">
            <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Evidence Grounding Principle
            </div>
            This system does not compute fabricated scores. Chemical and process conditions are extracted directly from user-supplied P&IDs, SDSs, and stream reports.
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-amber-500/20 shadow-inner">
            <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Source Provenance Guaranteed
            </div>
            All extracted parameters preserve exact document snippets, page coordinates, and model extraction confidence. Missing items remain explicitly absent (null).
          </div>

          <div className="bg-slate-950/70 p-3 rounded-xl border border-amber-500/20 shadow-inner">
            <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              PE Sign-off & Audit Trail
            </div>
            Machine-extracted records remain candidates until verified by a licensed engineer. Every modification and verification is immutably logged with timestamp and author.
          </div>
        </div>
      )}
    </div>
  );
};
