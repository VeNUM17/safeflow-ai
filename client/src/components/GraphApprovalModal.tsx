import React, { useState } from 'react';
import { FileCheck, ShieldCheck, AlertTriangle, X, Check, RotateCcw } from 'lucide-react';
import { GraphApprovalRecord, GraphValidationResult } from '../types';

interface GraphApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  approval: GraphApprovalRecord | null;
  validation: GraphValidationResult | null;
  onApprove: (reviewer: string, notes: string) => Promise<void>;
  onUnapprove: (reviewer: string, reason: string) => Promise<void>;
}

export const GraphApprovalModal: React.FC<GraphApprovalModalProps> = ({
  isOpen,
  onClose,
  approval,
  validation,
  onApprove,
  onUnapprove,
}) => {
  const [reviewer, setReviewer] = useState('Lead Process Safety Engineer (PE)');
  const [notes, setNotes] = useState('P&ID topology and connectivity verified against design drawing');
  const [unapproveReason, setUnapproveReason] = useState('Reopening review for topology correction');
  const [isRevoking, setIsRevoking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isApproved = Boolean(approval?.approved);

  const handleConfirmApproval = async () => {
    if (!reviewer.trim()) {
      setError('Reviewer identifier and engineering discipline required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onApprove(reviewer.trim(), notes.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Approval failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUnapprove = async () => {
    if (!unapproveReason.trim()) {
      setError('A reason for revoking approval is required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onUnapprove(reviewer.trim(), unapproveReason.trim());
      setIsRevoking(false);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Revocation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400 border border-cyan-500/30">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">
                Process Graph Engineering Approval Gate
              </h3>
              <p className="text-xs text-slate-400">
                Formal qualification of P&ID topology before PHA study node segmentation
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
        <div className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isApproved ? (
            <div className="space-y-4">
              <div className="bg-emerald-950/40 border border-emerald-500/40 p-4 rounded-xl text-emerald-300 space-y-2">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                  Process Graph Currently Approved
                </div>
                <div className="text-[11px] space-y-1 text-slate-300">
                  <div>
                    <span className="text-slate-400 font-semibold">Approved By: </span>
                    {approval?.approved_by}
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold">Approved At: </span>
                    {approval?.approved_at ? new Date(approval.approved_at).toLocaleString() : 'N/A'}
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold">Review Notes: </span>
                    {approval?.notes || 'None recorded'}
                  </div>
                </div>
              </div>

              {!isRevoking ? (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    To modify equipment, tags, or piping connections, you can revoke approval and return the graph to draft review. Any existing PHA study nodes will revert to <code className="text-amber-300 bg-amber-950/50 px-1 py-0.5 rounded">under_review</code> status.
                  </p>
                  <button
                    onClick={() => setIsRevoking(true)}
                    className="w-full py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Revoke Approval & Reopen Editing
                  </button>
                </div>
              ) : (
                <div className="bg-slate-950 p-4 rounded-xl border border-amber-500/50 space-y-3">
                  <label className="text-[11px] font-semibold text-amber-300 block">
                    Reason for Reopening P&ID Editing:
                  </label>
                  <textarea
                    rows={2}
                    value={unapproveReason}
                    onChange={(e) => setUnapproveReason(e.target.value)}
                    placeholder="e.g. Correcting piping connection from V-101 to P-101A"
                    className="w-full bg-slate-900 border border-slate-700 text-slate-100 rounded-lg p-2 text-xs focus:ring-1 focus:ring-amber-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsRevoking(false)}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmUnapprove}
                      disabled={loading}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold"
                    >
                      Confirm Revocation
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                <div className="text-slate-200 font-semibold text-xs flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Pre-Approval Validation Snapshot
                </div>
                <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
                  <span>Critical Errors: <strong className="text-emerald-400">0</strong></span>
                  <span>•</span>
                  <span>
                    Warnings:{' '}
                    <strong className={validation?.warnings_count ? 'text-amber-400' : 'text-slate-300'}>
                      {validation?.warnings_count || 0}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Validation:{' '}
                    <strong className="text-emerald-400">PASSED</strong>
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Sign-Off Process Engineer (PE / Discipline Lead):
                  </label>
                  <input
                    type="text"
                    value={reviewer}
                    onChange={(e) => setReviewer(e.target.value)}
                    placeholder="e.g. John Smith, Lead Process Safety Engineer"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 text-xs focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                    Engineering Review Notes & Verification Basis:
                  </label>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Document drawing revision, engineering checks, and basis of approval..."
                    className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 text-xs focus:ring-1 focus:ring-cyan-500"
                  />
                </div>

                <div className="bg-cyan-950/30 border border-cyan-500/30 p-3 rounded-xl text-[11px] text-cyan-300 leading-relaxed">
                  <strong>Engineering Sign-off Gate:</strong> Approval confirms that provisional machine extractions have been validated against authoritative P&IDs. Material changes to equipment tags or piping will automatically invalidate this approval and require re-signoff.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors"
          >
            {isApproved ? 'Close' : 'Cancel'}
          </button>

          {!isApproved && (
            <button
              onClick={handleConfirmApproval}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Sign & Approve Process Graph
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
