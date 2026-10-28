import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  FileSearch,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  UserCheck,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import { PsiFieldRecord, ReviewStatus } from '../types';

interface Props {
  fieldKey: string;
  fieldLabel: string;
  fieldNumber?: string;
  fieldData: PsiFieldRecord;
  chemicalId: string;
  onUpdateField: (
    chemicalId: string,
    fieldKey: string,
    updates: {
      user_value?: string | null;
      review_status: ReviewStatus;
      notes?: string;
    }
  ) => Promise<void>;
  onInspectSnippet: (snippet: string, source: any) => void;
}

export const PsiFieldCard: React.FC<Props> = ({
  fieldKey,
  fieldLabel,
  fieldNumber,
  fieldData,
  chemicalId,
  onUpdateField,
  onInspectSnippet,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(
    fieldData.user_value !== null ? fieldData.user_value : fieldData.value || ''
  );
  const [editNotes, setEditNotes] = useState(fieldData.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  const status = fieldData.review_status;
  const isUserConfirmed = status === 'confirmed' && fieldData.user_value !== null;
  const isDirectlyConfirmed = status === 'confirmed' && fieldData.user_value === null;

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await onUpdateField(chemicalId, fieldKey, {
        review_status: 'confirmed',
        notes: fieldData.notes || 'Confirmed machine extraction based on SDS source evidence.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = async () => {
    setIsSaving(true);
    try {
      await onUpdateField(chemicalId, fieldKey, {
        review_status: 'rejected',
        notes: 'Rejected by process engineer: extraction inaccurate or ungrounded.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      await onUpdateField(chemicalId, fieldKey, {
        user_value: editValue.trim() || null,
        review_status: editValue.trim() ? 'confirmed' : 'missing',
        notes: editNotes.trim(),
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  // Status Badge Rendering
  const renderStatusBadge = () => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px] font-semibold px-2 py-0.5 rounded-md">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Verified & Confirmed
          </span>
        );
      case 'needs_review':
      case 'extracted':
        return (
          <span className="flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-semibold px-2 py-0.5 rounded-md animate-pulse">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            Extracted (Needs Review)
          </span>
        );
      case 'rejected':
        return (
          <span className="flex items-center gap-1 bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-semibold px-2 py-0.5 rounded-md">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            Rejected
          </span>
        );
      case 'extraction_failed':
        return (
          <span className="flex items-center gap-1 bg-rose-950/60 text-rose-300 border border-rose-700/60 text-[11px] font-semibold px-2 py-0.5 rounded-md">
            <XCircle className="w-3.5 h-3.5 text-rose-400" />
            Extraction Failed
          </span>
        );
      case 'missing':
      case 'not_found':
      default:
        return (
          <span className="flex items-center gap-1 bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded-md">
            <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
            Not Stated in SDS
          </span>
        );
    }
  };

  return (
    <div
      className={`rounded-xl border transition-all ${
        status === 'needs_review' || status === 'extracted'
          ? 'bg-slate-900/90 border-amber-500/40 shadow-sm'
          : status === 'confirmed'
          ? 'bg-slate-900/70 border-slate-800'
          : status === 'rejected' || status === 'extraction_failed'
          ? 'bg-slate-900/50 border-rose-800/40'
          : 'bg-slate-900/40 border-slate-800/80'
      } p-4`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          {fieldNumber && (
            <span className="bg-slate-800 text-cyan-400 font-mono text-[11px] px-1.5 py-0.5 rounded font-semibold">
              {fieldNumber}
            </span>
          )}
          <h3 className="font-semibold text-slate-200 text-sm">{fieldLabel}</h3>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {fieldData.confidence > 0 && (
            <span className="text-[11px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
              Confidence: {Math.round(fieldData.confidence * 100)}%
            </span>
          )}
          {renderStatusBadge()}
        </div>
      </div>

      {/* Body: Value presentation */}
      <div className="mt-3 space-y-3">
        {/* If Extraction Failed */}
        {(status === 'extraction_failed' || fieldData.category_status === 'extraction_failed') && !isEditing && (
          <div className="bg-rose-950/40 p-3 rounded-lg border border-dashed border-rose-500/50 text-rose-300 text-xs flex items-start gap-2">
            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-rose-200">Extraction Technical Failure</div>
              <p className="mt-0.5 text-rose-300/90">
                {fieldData.missing_reason || 'Technical failure during document parsing or text extraction. OCR or manual entry required.'}
              </p>
            </div>
          </div>
        )}

        {/* If Missing / Not Found */}
        {(status === 'missing' || status === 'not_found' || fieldData.category_status === 'not_found') &&
          status !== 'extraction_failed' &&
          !isEditing &&
          !fieldData.value && (
            <div className="bg-slate-950/80 p-3 rounded-lg border border-dashed border-slate-800 text-slate-400 text-xs flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-300">Information Absent in SDS</div>
                <p className="mt-0.5 text-slate-400">
                  {fieldData.missing_reason || 'This parameter was evaluated but is not documented in the source SDS. Under OSHA 1910.119(d)(1), absent data must not be assumed safe or zero.'}
                </p>
              </div>
            </div>
          )}

        {/* If Editing Mode */}
        {isEditing ? (
          <div className="bg-slate-950 p-3.5 rounded-lg border border-cyan-500/50 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Verified Field Value (Include units and qualifiers):
              </label>
              <textarea
                rows={3}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md p-2 text-xs text-slate-100 font-sans focus:outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="Enter verified chemical safety value with units..."
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Engineering Reviewer Notes & Justification:
              </label>
              <input
                type="text"
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-md px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                placeholder="Reference engineering standard or supplier addendum..."
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                className="px-3 py-1 rounded text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={isSaving}
                className="px-3 py-1 rounded text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-medium shadow"
              >
                {isSaving ? 'Saving...' : 'Save & Confirm Value'}
              </button>
            </div>
          </div>
        ) : (
          /* Normal Display Mode: Clearly distinguish Machine vs User-Confirmed */
          <div className="space-y-2">
            {/* If User has overridden or confirmed with edits */}
            {fieldData.user_value !== null ? (
              <div className="space-y-2">
                <div className="bg-emerald-950/20 p-3 rounded-lg border border-emerald-500/30">
                  <div className="text-[11px] font-semibold text-emerald-400 flex items-center gap-1 mb-1">
                    <UserCheck className="w-3.5 h-3.5" />
                    Human-Confirmed Verified Value:
                  </div>
                  <div className="text-slate-100 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                    {fieldData.user_value}
                  </div>
                  {fieldData.notes && (
                    <div className="mt-2 pt-2 border-t border-emerald-900/40 text-[11px] text-emerald-300/80 italic">
                      Note: {fieldData.notes}
                    </div>
                  )}
                </div>

                {/* Show machine value underneath for auditable distinction */}
                {fieldData.machine_value && (
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-400">Original Machine Extraction: </span>
                    <span className="font-mono text-slate-300">{fieldData.machine_value}</span>
                  </div>
                )}
              </div>
            ) : fieldData.value ? (
              /* Machine extracted active value */
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] font-semibold text-cyan-400 flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    Machine-Extracted Value (Unverified until confirmed):
                  </span>
                  {status === 'confirmed' && (
                    <span className="text-emerald-400 font-normal text-[10px]">
                      Confirmed without edits
                    </span>
                  )}
                </div>
                <div className="text-slate-200 text-xs font-mono leading-relaxed whitespace-pre-wrap">
                  {fieldData.value}
                </div>

                {/* Structured Findings List (if available) */}
                {fieldData.findings && fieldData.findings.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800 space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                      Granular Source Findings ({fieldData.findings.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {fieldData.findings.map((f, idx) => (
                        <div
                          key={idx}
                          className="bg-slate-900/90 border border-slate-800 p-1.5 rounded text-[11px] font-sans flex flex-col"
                        >
                          <div className="flex items-center justify-between text-slate-300">
                            <span className="font-semibold text-cyan-300">{f.field || 'Measurement'}:</span>
                            <span className="font-mono text-emerald-300 font-medium">
                              {f.value} {f.units || ''}
                            </span>
                          </div>
                          {f.qualifier && (
                            <span className="text-[10px] text-slate-400 italic mt-0.5 truncate" title={f.qualifier}>
                              {f.qualifier}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {fieldData.notes && (
                  <div className="mt-2 pt-2 border-t border-slate-800 text-[11px] text-slate-400 italic">
                    Note: {fieldData.notes}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}

        {/* Source Evidence & Provenance Bar */}
        {fieldData.source && fieldData.source.snippet && (
          <div className="bg-slate-950/70 p-2.5 rounded-lg border border-slate-800/80 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 font-medium text-slate-300">
                <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
                Source Provenance: {fieldData.source.document}
                {fieldData.source.page !== null && ` (Page ${fieldData.source.page})`}
                {fieldData.source.section && ` • ${fieldData.source.section}`}
              </span>

              <button
                onClick={() => onInspectSnippet(fieldData.source.snippet || '', fieldData.source)}
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 text-[11px] underline"
              >
                Inspect Verbatim Evidence
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            <div className="bg-slate-900 p-2 rounded text-[11px] text-slate-300 font-mono italic border-l-2 border-cyan-500 truncate">
              "{fieldData.source.snippet}"
            </div>
          </div>
        )}

        {/* Action Controls */}
        {!isEditing && (
          <div className="flex items-center justify-between gap-2 pt-2 text-xs">
            <div className="text-[11px] text-slate-400">
              {fieldData.updated_at && (
                <span>Last updated: {new Date(fieldData.updated_at).toLocaleDateString()}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setEditValue(fieldData.user_value || fieldData.value || '');
                  setEditNotes(fieldData.notes || '');
                  setIsEditing(true);
                }}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 font-medium transition-colors"
              >
                <Edit3 className="w-3 h-3 text-cyan-400" />
                Edit / Override
              </button>

              {status !== 'confirmed' && (
                <button
                  onClick={handleConfirm}
                  disabled={isSaving}
                  className="px-2.5 py-1 rounded bg-emerald-600/90 hover:bg-emerald-600 text-white flex items-center gap-1 font-medium transition-colors shadow-sm"
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Confirm Value
                </button>
              )}

              {status !== 'rejected' && (
                <button
                  onClick={handleReject}
                  disabled={isSaving}
                  className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 flex items-center gap-1 font-medium transition-colors"
                >
                  <XCircle className="w-3 h-3 text-rose-400" />
                  Reject
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
