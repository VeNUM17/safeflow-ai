import React, { useEffect, useState } from 'react';
import { History, X, Clock, User, ArrowRight, Shield } from 'lucide-react';
import { AuditTrailEntry } from '../types';

interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
}

export const AuditTrailModal: React.FC<AuditTrailModalProps> = ({
  isOpen,
  onClose,
  projectId,
}) => {
  const [logs, setLogs] = useState<AuditTrailEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && projectId) {
      setLoading(true);
      fetch(`/api/projects/${projectId}/audit-log`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success) {
            setLogs(data.data);
          }
        })
        .catch((err) => console.error('Failed to load audit trail:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen, projectId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950">
          <div className="flex items-center gap-2.5">
            <div className="bg-cyan-500/20 p-2 rounded-lg text-cyan-400 border border-cyan-500/30">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-sm">
                Engineering Audit Trail & Provenance Log
              </h3>
              <p className="text-xs text-slate-400">
                Traceable record of all P&ID corrections, topology edits, and approval gates
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
        <div className="p-4 overflow-y-auto flex-1 space-y-3 font-sans">
          {loading ? (
            <div className="text-center py-12 text-xs font-mono text-slate-500">
              Loading engineering audit records...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400">
              No manual changes recorded yet. Graph retains automated machine extractions.
            </div>
          ) : (
            logs.map((log) => (
              <div
                key={log.id}
                className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 hover:border-slate-700 transition-all text-xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${
                        log.action === 'create'
                          ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/30'
                          : log.action === 'delete'
                          ? 'bg-rose-950/80 text-rose-300 border border-rose-500/30'
                          : log.action === 'approve'
                          ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/30'
                          : log.action === 'reject'
                          ? 'bg-amber-950/80 text-amber-300 border border-amber-500/30'
                          : 'bg-indigo-950/80 text-indigo-300 border border-indigo-500/30'
                      }`}
                    >
                      {log.action}
                    </span>
                    <span className="font-semibold text-slate-200 uppercase text-[11px]">
                      {log.entity_type}
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">
                      ID: {log.entity_id}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3.5 h-3.5 text-slate-500" />
                      {new Date(log.timestamp).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 font-medium text-slate-300">
                      <User className="w-3.5 h-3.5 text-cyan-400" />
                      {log.reviewer}
                    </span>
                  </div>
                </div>

                {/* Change Reason */}
                {log.change_reason && (
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 text-slate-300 text-[11px]">
                    <span className="text-slate-400 font-medium">Reason / Basis: </span>
                    {log.change_reason}
                  </div>
                )}

                {/* Values diff */}
                {(log.original_value || log.revised_value) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] font-mono mt-1">
                    {log.original_value && (
                      <div className="bg-slate-900/60 p-2 rounded border border-rose-900/30 text-rose-300 overflow-x-auto">
                        <div className="font-sans font-semibold text-rose-400 mb-1">Original:</div>
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.original_value, null, 2)}</pre>
                      </div>
                    )}
                    {log.revised_value && (
                      <div className="bg-slate-900/60 p-2 rounded border border-emerald-900/30 text-emerald-300 overflow-x-auto">
                        <div className="font-sans font-semibold text-emerald-400 mb-1">Revised:</div>
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.revised_value, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors"
          >
            Close Audit Trail
          </button>
        </div>
      </div>
    </div>
  );
};
