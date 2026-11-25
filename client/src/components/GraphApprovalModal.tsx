import React, { useState } from 'react';
import { FileCheck, ShieldCheck, AlertTriangle, X, Check, RotateCcw, Key, Layers, AlertCircle, FileText } from 'lucide-react';
import { GraphApprovalRecord, GraphValidationResult } from '../types';

interface GraphApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  approval: GraphApprovalRecord | null;
  validation: GraphValidationResult | null;
  onApprove: (reviewer: string, notes: string, role?: string) => Promise<void>;
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
  const [reviewer, setReviewer] = useState('Lead Process Safety Specialist (PE)');
  const [role, setRole] = useState('Principal Process Safety Engineer (PE)');
  const [notes, setNotes] = useState('P&ID topology and connectivity verified against design drawing');
  const [unapproveReason, setUnapproveReason] = useState('Reopening review for topology correction');
  const [isRevoking, setIsRevoking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const isApproved = Boolean(approval?.approved);

  const handleConfirmApproval = async () => {
    if (!reviewer.trim()) {
      setError('Reviewer identifier is required.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await onApprove(reviewer.trim(), notes.trim(), role.trim());
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden font-sans max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950 shrink-0">
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
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-950/60 border border-rose-500/40 rounded-xl text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isApproved ? (
            <div className="space-y-4">
              <div className="bg-emerald-950/40 border border-emerald-500/40 p-4 rounded-xl text-emerald-300 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                    Process Graph Formally Approved
                  </div>
                  <span className="text-[10px] bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Sign-Off Locked
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[11px] bg-slate-950/60 p-3 rounded-lg border border-emerald-500/20">
                  <div>
                    <span className="text-slate-400 font-semibold block">Approver:</span>
                    <span className="text-slate-200 font-medium">{approval?.approved_by || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Discipline / Role:</span>
                    <span className="text-cyan-400 font-medium">{approval?.approver_role || 'Lead Process Safety Engineer (PE)'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Timestamp:</span>
                    <span className="text-slate-200 font-mono text-[10px]">
                      {approval?.approved_at ? new Date(approval.approved_at).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-semibold block">Graph Snapshot Hash:</span>
                    <span className="text-amber-300 font-mono text-[10px] truncate block" title={approval?.graph_snapshot_hash}>
                      {approval?.graph_snapshot_hash ? `${approval.graph_snapshot_hash.substring(0, 16)}...` : 'Computed on snapshot'}
                    </span>
                  </div>
                </div>

                {approval?.notes && (
                  <div className="text-[11px] text-slate-300 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800">
                    <span className="text-slate-400 font-semibold block mb-0.5">Review Notes:</span>
                    {approval.notes}
                  </div>
                )}

                {/* Document Versions Used */}
                {Array.isArray(approval?.document_versions_used) && approval.document_versions_used.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <FileText className="w-3 h-3 text-cyan-400" />
                      Document Versions Used ({approval.document_versions_used.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {approval.document_versions_used.map((doc, idx) => (
                        <span key={idx} className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[10px] font-mono text-slate-300">
                          {doc.filename} <span className="text-cyan-400 font-semibold">({doc.revision || 'Rev 0'})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outstanding Provisional Items Documented */}
                {Array.isArray(approval?.outstanding_provisional_items) && approval.outstanding_provisional_items.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Layers className="w-3 h-3 text-amber-400" />
                      Documented Provisional Items Permitted ({approval.outstanding_provisional_items.length})
                    </span>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {approval.outstanding_provisional_items.map((item, idx) => (
                        <div key={idx} className="text-[10px] bg-slate-950/80 px-2 py-1 rounded border border-slate-800 flex items-center justify-between">
                          <span className="font-mono text-amber-300 font-semibold">{item.type.toUpperCase()}: {item.tag_or_number}</span>
                          <span className="text-slate-400 text-[9px] truncate max-w-[200px]">{item.reason || 'Documented'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {!isRevoking ? (
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                  <p className="text-slate-400 leading-relaxed text-[11px]">
                    To modify equipment, tags, or piping connections, you can revoke approval and return the graph to draft review. Any existing PHA study nodes will revert to <code className="text-amber-300 bg-amber-950/50 px-1 py-0.5 rounded">under_review</code> status.
                  </p>
                  <button
                    onClick={() => setIsRevoking(true)}
                    className="w-full py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
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
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs cursor-pointer hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmUnapprove}
                      disabled={loading}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold cursor-pointer disabled:opacity-50"
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
                  <span>
                    Critical Errors:{' '}
                    <strong className={validation?.critical_errors_count ? 'text-rose-400' : 'text-emerald-400'}>
                      {validation?.critical_errors_count || validation?.errors_count || 0}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Warnings:{' '}
                    <strong className={validation?.warnings_count ? 'text-amber-400' : 'text-slate-300'}>
                      {validation?.warnings_count || 0}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Gate Status:{' '}
                    <strong className={validation?.can_approve ? 'text-emerald-400' : 'text-rose-400'}>
                      {validation?.can_approve ? 'READY FOR SIGN-OFF' : 'APPROVAL BLOCKED'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Sign-Off Engineer (Name / ID):
                    </label>
                    <input
                      type="text"
                      value={reviewer}
                      onChange={(e) => setReviewer(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 text-xs focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                      Engineering Role & Discipline:
                    </label>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      placeholder="e.g. Principal Process Safety Engineer (PE)"
                      className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-lg p-2 text-xs focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
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
                  <strong>Engineering Sign-off Gate:</strong> Approval calculates a cryptographic SHA-256 snapshot hash of the equipment, lines, and stream topology, recording source document versions and permitted provisional items. Any subsequent modification automatically invalidates this qualification.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors cursor-pointer"
          >
            {isApproved ? 'Close' : 'Cancel'}
          </button>

          {!isApproved && (
            <button
              onClick={handleConfirmApproval}
              disabled={loading || !validation?.can_approve}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-lg shadow transition-all cursor-pointer disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"
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
