import React, { useState } from 'react';
import {
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle2,
  X,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
} from 'lucide-react';
import { GraphValidationResult, ValidationIssue } from '../types';

interface GraphValidationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  validation: GraphValidationResult | null;
  onAcknowledgeWarning: (warningCode: string) => Promise<void>;
  onOpenApprovalModal: () => void;
}

export const GraphValidationDrawer: React.FC<GraphValidationDrawerProps> = ({
  isOpen,
  onClose,
  validation,
  onAcknowledgeWarning,
  onOpenApprovalModal,
}) => {
  const [acknowledgingCode, setAcknowledgingCode] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen || !validation) return null;

  const errors = validation.issues.filter((i) => i.severity === 'error');
  const warnings = validation.issues.filter((i) => i.severity === 'warning');
  const info = validation.issues.filter((i) => i.severity === 'info');

  const handleConfirmAck = async (code: string) => {
    setLoading(true);
    try {
      await onAcknowledgeWarning(code);
      setAcknowledgingCode(null);
      setJustification('');
    } catch (err) {
      console.error('Failed to acknowledge warning:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border-l border-slate-800 w-full max-w-xl h-full flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400 border border-cyan-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">
                Process Graph Validation & Consistency Engine
              </h3>
              <p className="text-xs text-slate-400">
                P&ID topological connectivity and engineering integrity checks
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

        {/* Status Summary Banner */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-rose-400 bg-rose-950/80 px-2.5 py-1 rounded-md border border-rose-500/30">
                <AlertCircle className="w-3.5 h-3.5" />
                {validation.errors_count} Critical Errors
              </span>
              <span className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-400 bg-amber-950/80 px-2.5 py-1 rounded-md border border-amber-500/30">
                <AlertTriangle className="w-3.5 h-3.5" />
                {validation.warnings_count} Warnings
              </span>
            </div>

            {validation.can_approve ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-950/80 px-3 py-1 rounded-md border border-emerald-500/40">
                <CheckCircle2 className="w-4 h-4" /> Ready for Approval
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-400 bg-rose-950/80 px-3 py-1 rounded-md border border-rose-500/40">
                <ShieldAlert className="w-4 h-4" /> Approval Blocked
              </span>
            )}
          </div>

          <p className="text-[11px] text-slate-400 mt-2">
            Formal engineering sign-off requires all critical errors to be resolved and all warnings acknowledged with engineering justification.
          </p>
        </div>

        {/* Issues List */}
        <div className="p-4 overflow-y-auto flex-1 space-y-4">
          {/* Critical Errors */}
          {errors.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" />
                Critical Topology Errors ({errors.length}) — Must Be Fixed
              </div>
              <div className="space-y-2">
                {errors.map((err) => (
                  <div
                    key={err.id}
                    className="bg-rose-950/30 border border-rose-600/40 p-3 rounded-xl text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-rose-300 text-[10px] bg-rose-900/40 px-1.5 py-0.5 rounded border border-rose-700/50">
                        {err.code}
                      </span>
                      <span className="text-[10px] font-mono text-rose-400 uppercase">
                        Entity: {err.entity_type} {err.entity_id ? `(${err.entity_id})` : ''}
                      </span>
                    </div>
                    <p className="text-slate-200 leading-relaxed font-medium">{err.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                Engineering Warnings ({warnings.length})
              </div>
              <div className="space-y-2">
                {warnings.map((warn) => (
                  <div
                    key={warn.id}
                    className="bg-amber-950/30 border border-amber-600/40 p-3 rounded-xl text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-amber-300 text-[10px] bg-amber-900/40 px-1.5 py-0.5 rounded border border-amber-700/50">
                        {warn.code}
                      </span>
                      <span className="text-[10px] font-mono text-amber-400 uppercase">
                        Entity: {warn.entity_type} {warn.entity_id ? `(${warn.entity_id})` : ''}
                      </span>
                    </div>
                    <p className="text-slate-200 leading-relaxed">{warn.message}</p>

                    {/* Acknowledgment Action */}
                    {warn.acknowledged ? (
                      <div className="text-[11px] text-emerald-400 font-mono flex items-center gap-1 bg-emerald-950/40 p-1.5 rounded border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged by Engineer
                      </div>
                    ) : acknowledgingCode === warn.code ? (
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-amber-500/50 space-y-2 mt-1">
                        <label className="text-[11px] text-amber-300 font-medium block">
                          Engineering Acknowledgment Justification:
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Verified standalone utility vessel / boundary tie-in"
                          value={justification}
                          onChange={(e) => setJustification(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded p-1.5 text-xs focus:ring-1 focus:ring-amber-500"
                        />
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setAcknowledgingCode(null)}
                            className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 text-[11px]"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleConfirmAck(warn.code)}
                            disabled={loading || !justification.trim()}
                            className="px-3 py-1 rounded bg-amber-600 hover:bg-amber-500 text-white font-medium text-[11px] disabled:opacity-50"
                          >
                            Confirm Acknowledgment
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAcknowledgingCode(warn.code)}
                        className="text-[11px] text-amber-300 hover:text-amber-100 bg-amber-900/40 hover:bg-amber-900/60 px-2.5 py-1 rounded border border-amber-600/40 font-medium transition-colors"
                      >
                        Acknowledge & Accept Risk
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clean State */}
          {errors.length === 0 && warnings.length === 0 && (
            <div className="text-center py-16 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center border border-emerald-500/40">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-slate-100 text-sm">P&ID Topology Clean</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No duplicate tags, missing endpoints, or unassigned process classifications detected. The process graph is consistent with SafeFlow engineering rules.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
          >
            Close
          </button>

          <button
            onClick={() => {
              onClose();
              onOpenApprovalModal();
            }}
            disabled={!validation.can_approve}
            className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white disabled:text-slate-500 text-xs font-semibold rounded-lg shadow transition-all cursor-pointer disabled:cursor-not-allowed"
          >
            Proceed to Formal Sign-Off
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
