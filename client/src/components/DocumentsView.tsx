import React, { useState } from 'react';
import {
  FileText,
  FileWarning,
  CheckCircle2,
  AlertTriangle,
  Upload,
  Trash2,
  Filter,
  Search,
  Tag,
  ShieldCheck,
  RotateCcw,
  Sparkles,
  Layers,
  ChevronDown,
  Building,
  Calendar,
  Check,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { DocumentRecord, DocumentCategory } from '../types';

interface Props {
  documents: DocumentRecord[];
  onOpenUploadModal: () => void;
  onDeleteDocument: (id: string) => Promise<void>;
  onRefreshDocuments?: () => Promise<void>;
}

const CATEGORY_LABELS: Record<DocumentCategory, { label: string; color: string }> = {
  sds: { label: 'Safety Data Sheet (SDS)', color: 'border-cyan-500/40 text-cyan-300 bg-cyan-950/40' },
  pid: { label: 'Piping & Instrumentation (P&ID)', color: 'border-amber-500/40 text-amber-300 bg-amber-950/40' },
  pfd: { label: 'Process Flow Diagram (PFD)', color: 'border-blue-500/40 text-blue-300 bg-blue-950/40' },
  bfd: { label: 'Block Flow Diagram (BFD)', color: 'border-indigo-500/40 text-indigo-300 bg-indigo-950/40' },
  stream_table: { label: 'Stream Table (H&MB)', color: 'border-emerald-500/40 text-emerald-300 bg-emerald-950/40' },
  equipment_datasheet: { label: 'Equipment Datasheet', color: 'border-purple-500/40 text-purple-300 bg-purple-950/40' },
  basis_of_design: { label: 'Basis of Design (BOD)', color: 'border-yellow-500/40 text-yellow-300 bg-yellow-950/40' },
  process_design_philosophy: { label: 'Process Design Philosophy', color: 'border-orange-500/40 text-orange-300 bg-orange-950/40' },
  operating_philosophy: { label: 'Operating Philosophy', color: 'border-teal-500/40 text-teal-300 bg-teal-950/40' },
  control_philosophy: { label: 'Control Philosophy', color: 'border-sky-500/40 text-sky-300 bg-sky-950/40' },
  shutdown_philosophy: { label: 'Shutdown & ESD Philosophy', color: 'border-rose-500/40 text-rose-300 bg-rose-950/40' },
};

export const DocumentsView: React.FC<Props> = ({
  documents,
  onOpenUploadModal,
  onDeleteDocument,
  onRefreshDocuments,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reclassifyingDoc, setReclassifyingDoc] = useState<DocumentRecord | null>(null);
  const [targetCategory, setTargetCategory] = useState<DocumentCategory>('sds');
  const [reclassifyReason, setReclassifyReason] = useState<string>('');
  const [isSubmittingReclassify, setIsSubmittingReclassify] = useState(false);

  const handleDelete = async (doc: DocumentRecord) => {
    const confirmMsg = `Are you sure you want to delete "${doc.name}"?\n\nThis will permanently remove the document and any PSI chemical records or provisional equipment tags extracted from it.`;
    if (!window.confirm(confirmMsg)) return;

    setDeletingId(doc.id);
    try {
      await onDeleteDocument(doc.id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleOpenReclassify = (doc: DocumentRecord) => {
    setReclassifyingDoc(doc);
    setTargetCategory(doc.category || 'sds');
    setReclassifyReason('');
  };

  const handleConfirmReclassify = async () => {
    if (!reclassifyingDoc) return;
    setIsSubmittingReclassify(true);
    try {
      const res = await fetch(`/api/documents/${reclassifyingDoc.id}/reclassify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: targetCategory,
          reason: reclassifyReason || 'Engineer manual category correction',
        }),
      });
      const json = await res.json();
      if (json.success && onRefreshDocuments) {
        await onRefreshDocuments();
      }
      setReclassifyingDoc(null);
    } catch (err) {
      console.error('Failed to reclassify document:', err);
    } finally {
      setIsSubmittingReclassify(false);
    }
  };

  const handleToggleVerification = async (doc: DocumentRecord) => {
    const newStatus = doc.verification_status === 'engineer_verified' ? 'unverified' : 'engineer_verified';
    try {
      const res = await fetch(`/api/documents/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verification_status: newStatus,
          verified_by: newStatus === 'engineer_verified' ? 'Lead Process Safety Engineer (PE)' : null,
          verified_at: newStatus === 'engineer_verified' ? new Date().toISOString() : null,
        }),
      });
      const json = await res.json();
      if (json.success && onRefreshDocuments) {
        await onRefreshDocuments();
      }
    } catch (err) {
      console.error('Failed to update verification status:', err);
    }
  };

  // Filtered documents
  const filteredDocs = documents.filter((doc) => {
    const matchesCategory =
      selectedCategory === 'all' || doc.category === selectedCategory || doc.doc_type === selectedCategory;
    const matchesSearch =
      !searchQuery ||
      doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (doc.revision && doc.revision.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (doc.source_organization && doc.source_organization.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* 1. Header Banner */}
      <div className="bg-slate-950/90 border border-amber-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-600" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                Multi-Document Control Center
              </h2>
              <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold">
                {documents.length} Total Documents
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Authoritative repository for the 11 Process Safety Information categories under OSHA 1910.119 with revision tracking and classification controls.
            </p>
          </div>

          <button
            onClick={onOpenUploadModal}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-extrabold shadow-md shadow-amber-950/40 transition-all shrink-0"
          >
            <Upload className="w-4 h-4" />
            Upload New Documents
          </button>
        </div>

        {/* Filter Chips Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs pb-1 sm:pb-0">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-bold whitespace-nowrap transition-all text-xs ${
                selectedCategory === 'all'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow-md shadow-amber-950/40'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              All Categories ({documents.length})
            </button>

            {Object.entries(CATEGORY_LABELS).map(([catKey, info]) => {
              const count = documents.filter((d) => d.category === catKey || d.doc_type === catKey).length;
              if (count === 0 && selectedCategory !== catKey) return null; // Show only active categories
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-all text-xs flex items-center gap-1.5 ${
                    selectedCategory === catKey
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold shadow-md shadow-amber-950/40'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  <span>{catKey.toUpperCase()}</span>
                  <span className="font-mono text-[10px] opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by name, revision, or org..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-900 border border-slate-700/80 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-1.5 w-full focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-inner placeholder-slate-500"
            />
          </div>
        </div>
      </div>

      {/* 2. Documents Grid / List */}
      {filteredDocs.length === 0 ? (
        <div className="bg-slate-950/60 p-12 rounded-2xl border border-slate-800 text-center text-slate-400 text-xs space-y-2">
          <FileText className="w-10 h-10 mx-auto text-slate-600" />
          <p className="font-medium text-slate-300">No documents found matching the filter criteria.</p>
          <p className="text-[11px] text-slate-500">
            Upload engineering files across any of the 11 categories using the upload button above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDocs.map((doc) => {
            const isReadable = doc.is_readable;
            const isDeleting = deletingId === doc.id;
            const categoryMeta = CATEGORY_LABELS[doc.category] || CATEGORY_LABELS.sds;
            const isVerified = doc.verification_status === 'engineer_verified';
            const ext = doc.original_filename?.split('.').pop()?.toUpperCase() || 'PDF';

            return (
              <div
                key={doc.id}
                className={`bg-slate-950/80 rounded-2xl border p-4 flex flex-col justify-between transition-all relative overflow-hidden group shadow-lg ${
                  !isReadable
                    ? 'border-rose-700/50 bg-rose-950/10'
                    : isVerified
                    ? 'border-emerald-500/30 hover:border-emerald-500/60'
                    : 'border-slate-800 hover:border-amber-500/40'
                }`}
              >
                <div className="space-y-3">
                  
                  {/* Top Bar: Category Badge & Revision */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full uppercase border shadow-sm ${categoryMeta.color}`}
                    >
                      {doc.category ? doc.category.replace(/_/g, ' ') : doc.doc_type}
                    </span>

                    <div className="flex items-center gap-1.5 font-mono text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-amber-300 font-bold">
                        Rev {doc.revision || 'A'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                        {ext}
                      </span>
                    </div>
                  </div>

                  {/* Document Title & Size */}
                  <div>
                    <h3 className="font-bold text-slate-100 text-xs font-mono truncate" title={doc.name}>
                      {doc.name}
                    </h3>
                    <div className="text-[11px] text-slate-400 font-mono mt-1 flex items-center gap-2 flex-wrap">
                      <span>{(doc.size_bytes / 1024).toFixed(0)} KB</span>
                      <span>•</span>
                      <span>{doc.pages_count} {doc.pages_count === 1 ? 'Page / Sheet' : 'Pages / Sheets'}</span>
                      {doc.source_organization && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[140px] text-slate-300">{doc.source_organization}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Readability & Extraction Status Banner */}
                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <div className="flex items-center gap-1.5">
                      {isReadable ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Parsed ({doc.extraction_status || 'completed'})
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-400 font-semibold font-mono animate-pulse">
                          <FileWarning className="w-3.5 h-3.5" />
                          Unreadable
                        </span>
                      )}
                    </div>

                    {/* PE Verification Status Button */}
                    <button
                      onClick={() => handleToggleVerification(doc)}
                      title={isVerified ? 'Click to mark unverified' : 'Click to certify as Engineer Verified'}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold transition-all border ${
                        isVerified
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                          : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-amber-300 hover:border-amber-400/50'
                      }`}
                    >
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span>{isVerified ? 'PE Verified' : 'Unverified'}</span>
                    </button>
                  </div>

                  {/* Classification Notes or Warning */}
                  {doc.notes && (
                    <div className="text-[10px] text-slate-400 bg-slate-900/90 p-2 rounded-xl border border-slate-800 leading-relaxed font-mono truncate" title={doc.notes}>
                      {doc.notes}
                    </div>
                  )}

                  {!isReadable && (
                    <div className="bg-rose-950/40 p-2.5 rounded-xl border border-rose-800/40 text-[11px] text-rose-300 space-y-1">
                      <div className="font-semibold text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        Extraction Incomplete:
                      </div>
                      <p className="leading-relaxed">
                        {doc.unreadable_reason ||
                          'Virtually no extractable digital text detected. Scanned drawing or flattened bitmap.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer Controls: Reclassify & Delete */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono flex items-center justify-between">
                  <button
                    onClick={() => handleOpenReclassify(doc)}
                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px] font-semibold transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reclassify</span>
                  </button>

                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={isDeleting}
                    className="text-rose-400/80 hover:text-rose-300 flex items-center gap-1 text-[11px] transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Reclassification Modal */}
      {reclassifyingDoc && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-amber-500/40 rounded-2xl w-full max-w-md p-6 shadow-2xl relative space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-400" />
                Manual Document Reclassification
              </h3>
              <button
                onClick={() => setReclassifyingDoc(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-1">
              <div><strong>Document:</strong> <span className="font-mono text-slate-200">{reclassifyingDoc.name}</span></div>
              <div><strong>Current Category:</strong> <span className="font-mono text-amber-400">{reclassifyingDoc.category}</span></div>
            </div>

            <div className="space-y-1 text-xs">
              <label className="text-slate-300 font-medium">Select Authoritative Category:</label>
              <select
                value={targetCategory}
                onChange={(e) => setTargetCategory(e.target.value as DocumentCategory)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
              >
                {Object.entries(CATEGORY_LABELS).map(([catKey, info]) => (
                  <option key={catKey} value={catKey} className="bg-slate-900 text-slate-200">
                    {info.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 text-xs">
              <label className="text-slate-300 font-medium">Reclassification Reason / Note:</label>
              <input
                type="text"
                placeholder="e.g. Document contains Heat & Material Balance stream columns"
                value={reclassifyReason}
                onChange={(e) => setReclassifyReason(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setReclassifyingDoc(null)}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReclassify}
                disabled={isSubmittingReclassify}
                className="px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 shadow disabled:opacity-50"
              >
                {isSubmittingReclassify ? 'Saving...' : 'Confirm Reclassification'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
