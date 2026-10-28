import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  CheckCircle2,
  FileText,
  Calendar,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { ChemicalConflict } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  conflicts: ChemicalConflict[];
  onResolveConflict: (
    conflictId: string,
    resolvedValue: string,
    resolutionNotes: string
  ) => Promise<void>;
}

export const ConflictResolutionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  conflicts,
  onResolveConflict,
}) => {
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(
    conflicts[0]?.id || null
  );
  const [selectedValue, setSelectedValue] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [isResolving, setIsResolving] = useState(false);

  if (!isOpen) return null;

  const activeConflict =
    conflicts.find((c) => c.id === selectedConflictId) || conflicts[0];

  const handleSelectEntry = (val: string) => {
    setSelectedValue(val);
  };

  const handleResolve = async () => {
    if (!activeConflict || !selectedValue.trim() || !resolutionNotes.trim()) return;

    setIsResolving(true);
    try {
      await onResolveConflict(activeConflict.id, selectedValue.trim(), resolutionNotes.trim());
      // Move to next conflict or close if none left
      const remaining = conflicts.filter((c) => c.id !== activeConflict.id && c.status === 'unresolved');
      if (remaining.length > 0) {
        setSelectedConflictId(remaining[0].id);
        setSelectedValue('');
        setResolutionNotes('');
      } else {
        onClose();
      }
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Multi-Vendor SDS Conflict Resolution
              </h2>
              <p className="text-xs text-slate-400">
                Divergent safety information detected across multiple Safety Data Sheets. Explicit reconciliation required.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Conflict Selector Pills if multiple */}
          {conflicts.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
              {conflicts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setSelectedConflictId(c.id);
                    setSelectedValue('');
                    setResolutionNotes('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    (activeConflict?.id === c.id)
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                      : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200'
                  }`}
                >
                  {c.chemical_name}: {c.field_label}
                  {c.status === 'resolved' && ' (Resolved)'}
                </button>
              ))}
            </div>
          )}

          {activeConflict ? (
            <div className="space-y-6">
              
              {/* Conflict Context Title */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">Chemical Substance</div>
                  <span className="font-mono text-xs text-cyan-400">CAS: {activeConflict.cas_number}</span>
                </div>
                <div className="text-lg font-bold text-slate-100 mt-0.5">
                  {activeConflict.chemical_name}
                </div>
                <div className="text-xs font-semibold text-rose-400 mt-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Conflicting Field: {activeConflict.field_label}
                </div>
              </div>

              {/* Side-by-Side Comparison of Conflicting SDSs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeConflict.entries.map((entry, idx) => {
                  const isChosen = selectedValue === entry.value;

                  return (
                    <div
                      key={idx}
                      onClick={() => handleSelectEntry(entry.value)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                        isChosen
                          ? 'bg-cyan-950/30 border-cyan-500 ring-2 ring-cyan-500/30'
                          : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span className="font-semibold text-slate-300 flex items-center gap-1">
                            <FileText className="w-3.5 h-3.5 text-cyan-400" />
                            Source SDS {idx + 1}
                          </span>
                          <span className="font-mono flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            {entry.revision_date}
                          </span>
                        </div>

                        <div className="text-xs font-mono text-cyan-400 truncate">
                          {entry.document_name}
                        </div>

                        <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 text-xs font-mono text-slate-100 leading-relaxed min-h-[70px]">
                          {entry.value}
                        </div>

                        <div className="text-[11px] text-slate-400 italic bg-slate-950/60 p-2 rounded border border-slate-800 truncate">
                          Snippet: "{entry.snippet}"
                        </div>
                      </div>

                      <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-400">
                          Confidence: {Math.round(entry.confidence * 100)}%
                        </span>
                        <button
                          type="button"
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            isChosen
                              ? 'bg-cyan-600 text-white'
                              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {isChosen ? 'Selected Choice' : 'Select This Value'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reconciliation & Engineering Sign-Off Input */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-4">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  Reconciled Value & Audit Justification
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Final Accepted Value (Select from above or customize):
                  </label>
                  <textarea
                    rows={2}
                    value={selectedValue}
                    onChange={(e) => setSelectedValue(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    placeholder="Click an option above or type reconciled consensus value..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Mandatory Process-Safety Justification Note:
                  </label>
                  <input
                    type="text"
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    placeholder="e.g. Selected conservative OSHA PEL 50 ppm from 2024 revised SDS per site industrial hygiene standard."
                  />
                </div>
              </div>

            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-xs">
              All multi-vendor SDS conflicts have been resolved!
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Never silently auto-merge differing safety thresholds.
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
            <button
              onClick={handleResolve}
              disabled={isResolving || !selectedValue.trim() || !resolutionNotes.trim()}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white shadow transition-all"
            >
              {isResolving ? 'Resolving...' : 'Confirm Resolution'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
