import React, { useState } from 'react';
import { AlertTriangle, ShieldAlert, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';

interface Props {
  isSample?: boolean;
}

export const SafetyDisclaimerBanner: React.FC<Props> = ({ isSample }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-amber-950/60 border-b border-amber-600/40 text-amber-200 px-4 py-2 text-xs">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="font-semibold text-amber-300 uppercase tracking-wider">
            Process Safety Notice (OSHA 29 CFR 1910.119(d)(1)):
          </span>
          <span className="text-amber-100/90 hidden sm:inline">
            Automated PSI identification and evidence management tool. Unverified machine extraction must be reviewed by qualified process-safety professionals.
          </span>
          {isSample && (
            <span className="bg-amber-500/20 text-amber-300 font-mono text-[10px] px-2 py-0.5 rounded border border-amber-500/40 uppercase">
              Demo Sample Data
            </span>
          )}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-400 hover:text-amber-300 flex items-center gap-1 underline font-medium shrink-0 ml-auto md:ml-0"
        >
          {expanded ? 'Hide Regulatory Scope' : 'Review Standards & Scope'}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-amber-800/40 grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] leading-relaxed text-amber-200/80">
          <div className="bg-amber-900/30 p-2.5 rounded border border-amber-700/30">
            <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              Not a Certified Safety Rating System
            </div>
            This application does not compute or display a plant risk rating or numerical safety score. Chemical and process attributes are extracted directly from user-supplied documentation.
          </div>

          <div className="bg-amber-900/30 p-2.5 rounded border border-amber-700/30">
            <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
              Evidence Grounding & Provenance
            </div>
            All extracted parameters preserve exact source snippets, page references, and extraction confidence. Absent values are tracked as explicit missing/unknown states without inference.
          </div>

          <div className="bg-amber-900/30 p-2.5 rounded border border-amber-700/30">
            <div className="font-semibold text-amber-300 mb-1 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              Human Engineer Sign-off Required
            </div>
            Machine-extracted records remain flagged as provisional until a competent human engineer inspects the primary text and confirms or corrects the record.
          </div>
        </div>
      )}
    </div>
  );
};
