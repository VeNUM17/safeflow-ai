import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Info,
  Check,
  ShieldCheck,
} from 'lucide-react';
import { DrawingValidationResult, DrawingValidationIssue } from '../../types';

interface DrawingValidationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  validationResult: DrawingValidationResult | null;
  onAcknowledgeWarning: (warningCode: string) => void;
  onOpenApprovalModal: () => void;
}

export const DrawingValidationDrawer: React.FC<DrawingValidationDrawerProps> = ({
  isOpen,
  onClose,
  validationResult,
  onAcknowledgeWarning,
  onOpenApprovalModal,
}) => {
  const [selectedIssue, setSelectedIssue] = useState<DrawingValidationIssue | null>(null);

  if (!isOpen) return null;

  const errors = validationResult?.issues.filter((i) => i.severity === 'error') || [];
  const warnings = validationResult?.issues.filter((i) => i.severity === 'warning') || [];

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-blue-600" />
          <h3 className="font-bold text-slate-800 text-sm">Drawing Engineering Validation</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-200 text-slate-500 rounded transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Status Banner */}
      <div
        className={`p-3 text-xs flex items-center justify-between border-b ${
          validationResult?.can_approve
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-800'
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          {validationResult?.can_approve ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Ready for Engineering Sign-off</span>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span>{errors.length} Critical Issue(s) Blocking Sign-off</span>
            </>
          )}
        </div>
        <span className="font-mono text-[11px] font-bold">
          {errors.length} Errors • {warnings.length} Warnings
        </span>
      </div>

      {/* Issues List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {(!validationResult || validationResult.issues.length === 0) ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">Drawing validation passed</p>
            <p className="mt-1">All tags, ports, and piping rules adhere to PSM requirements.</p>
          </div>
        ) : (
          validationResult.issues.map((issue) => (
            <div
              key={issue.id}
              className={`p-3 rounded-lg border transition-all text-xs ${
                issue.severity === 'error'
                  ? 'bg-red-50/60 border-red-200 text-red-900'
                  : 'bg-amber-50/60 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-1.5 font-semibold">
                  {issue.severity === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <span>{issue.code}</span>
                </div>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                    issue.severity === 'error'
                      ? 'bg-red-200 text-red-800'
                      : 'bg-amber-200 text-amber-800'
                  }`}
                >
                  {issue.severity}
                </span>
              </div>

              <p className="text-slate-700 mt-1.5 pl-5.5 leading-relaxed">
                {issue.message}
              </p>

              {issue.severity === 'warning' && (
                <div className="mt-2.5 pl-5.5 flex justify-end">
                  <button
                    onClick={() => onAcknowledgeWarning(issue.code)}
                    className="flex items-center gap-1 text-[11px] font-semibold text-amber-800 bg-amber-100 hover:bg-amber-200 px-2 py-1 rounded transition-colors"
                  >
                    <Check className="w-3 h-3" />
                    Acknowledge Warning
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
        >
          Close
        </button>
        <button
          onClick={() => {
            onClose();
            onOpenApprovalModal();
          }}
          disabled={!validationResult?.can_approve}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-40 disabled:hover:bg-blue-600 flex items-center gap-1.5"
        >
          <CheckCircle2 className="w-4 h-4" />
          Approve Drawing
        </button>
      </div>
    </div>
  );
};
