import React, { useState } from 'react';
import {
  Download,
  X,
  FileCode,
  FileSpreadsheet,
  CheckCircle2,
  Copy,
  ShieldAlert,
} from 'lucide-react';
import { ProcessProject } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  project: ProcessProject | null;
}

export const ExportModal: React.FC<Props> = ({ isOpen, onClose, project }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !project) return null;

  const jsonUrl = `/api/projects/${project.id}/export/json`;
  const csvUrl = `/api/projects/${project.id}/export/csv`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin + jsonUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                Export Process Safety Information Records
              </h2>
              <p className="text-xs text-slate-400">
                Download verified audit packages in machine-readable JSON or tabular CSV.
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
        <div className="p-6 space-y-4 text-xs">
          
          {/* Regulatory Disclaimer Notice */}
          <div className="p-3 bg-amber-950/30 border border-amber-700/40 rounded-xl text-amber-200/90 text-[11px] leading-relaxed flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">OSHA PSM Compliance Audit Scope: </span>
              Exported records distinguish machine-extracted initial data from engineer-verified final values, complete with source document provenance, revision dates, and justification notes.
            </div>
          </div>

          {/* Export Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            
            {/* CSV Export Option */}
            <a
              href={csvUrl}
              download
              className="p-4 rounded-xl border border-slate-800 hover:border-emerald-500 bg-slate-950 hover:bg-emerald-950/20 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-1.5">
                <FileSpreadsheet className="w-6 h-6 text-emerald-400 group-hover:scale-110 transition-transform" />
                <div className="font-bold text-slate-100 text-sm">Tabular CSV Records</div>
                <p className="text-[11px] text-slate-400">
                  Formatted spreadsheet with all 7 PSI fields, machine values, confirmed values, review notes, and source page citations.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-emerald-400 font-semibold text-[11px]">
                <span>Download .csv</span>
                <Download className="w-3.5 h-3.5" />
              </div>
            </a>

            {/* JSON Export Option */}
            <a
              href={jsonUrl}
              download
              className="p-4 rounded-xl border border-slate-800 hover:border-cyan-500 bg-slate-950 hover:bg-cyan-950/20 transition-all flex flex-col justify-between group"
            >
              <div className="space-y-1.5">
                <FileCode className="w-6 h-6 text-cyan-400 group-hover:scale-110 transition-transform" />
                <div className="font-bold text-slate-100 text-sm">Structured JSON Package</div>
                <p className="text-[11px] text-slate-400">
                  Full schema object including projects, documents, field provenance snippets, resolved conflicts, and P&ID topology graph.
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-cyan-400 font-semibold text-[11px]">
                <span>Download .json</span>
                <Download className="w-3.5 h-3.5" />
              </div>
            </a>

          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
