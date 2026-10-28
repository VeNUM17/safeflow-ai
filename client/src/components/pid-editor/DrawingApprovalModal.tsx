import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';
import { DigitalPidDrawing } from '../../types';

interface DrawingApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  drawing: DigitalPidDrawing;
  onApprove: (reviewer: string, revision: string, notes: string) => void;
}

export const DrawingApprovalModal: React.FC<DrawingApprovalModalProps> = ({
  isOpen,
  onClose,
  drawing,
  onApprove,
}) => {
  const [reviewer, setReviewer] = useState('Lead Process Safety Engineer (PE)');
  const [revision, setRevision] = useState(
    drawing.status === 'approved' ? 'REV 1' : drawing.revision || 'REV 0'
  );
  const [notes, setNotes] = useState(
    'Digital P&ID approved for baseline PSM review and PHA study node segmentation.'
  );

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewer.trim()) return;
    onApprove(reviewer.trim(), revision.trim(), notes.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-slate-800 text-sm">Formal Engineering Drawing Sign-off</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 text-slate-500 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg text-emerald-900 leading-relaxed">
            <p className="font-semibold text-emerald-950 mb-1">
              Authoritative Process Topology Sign-off
            </p>
            Approving this drawing establishes it as the verified digital single source of truth for
            the process. It will automatically synchronize project equipment, piping lines, and
            unlock PHA Node Segmentation for HAZOP study.
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
              Drawing Identifier
            </label>
            <div className="font-mono font-bold text-slate-800 bg-slate-100 p-2 rounded border border-slate-300">
              {drawing.drawing_number} — {drawing.title}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                Approval Revision
              </label>
              <input
                type="text"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                required
                className="w-full px-3 py-1.5 font-mono font-bold text-slate-800 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
                Drawing Status
              </label>
              <div className="px-3 py-1.5 bg-emerald-100 text-emerald-800 font-bold rounded-md border border-emerald-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                APPROVED
              </div>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
              Approving Engineer / Reviewer
            </label>
            <input
              type="text"
              value={reviewer}
              onChange={(e) => setReviewer(e.target.value)}
              required
              className="w-full px-3 py-1.5 font-medium text-slate-800 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px] mb-1">
              Engineering Sign-Off Notes / Basis
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-1.5 text-slate-800 bg-white border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-slate-600 hover:text-slate-800 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg shadow-sm flex items-center gap-1.5"
            >
              <ShieldCheck className="w-4 h-4" />
              Sign-Off & Approve Drawing
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
