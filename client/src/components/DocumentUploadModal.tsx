import React, { useState, useRef } from 'react';
import {
  Upload,
  X,
  FileText,
  AlertCircle,
  CheckCircle2,
  FileCode,
  Layers,
  Sparkles,
  FileSpreadsheet,
  Settings2,
  Building,
} from 'lucide-react';
import { DocumentCategory } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onUploadSuccess: () => Promise<void>;
}

const CATEGORY_OPTIONS: { id: string; label: string; desc: string }[] = [
  { id: 'auto', label: '⚡ Auto-Detect Category', desc: 'Classifies across all 11 industrial categories' },
  { id: 'sds', label: '1. Safety Data Sheet (SDS)', desc: 'OSHA 7 PSI hazard topics & GHS data' },
  { id: 'pid', label: '2. Piping & Instrumentation (P&ID)', desc: 'Lines, tags, valves, nozzles & topology' },
  { id: 'pfd', label: '3. Process Flow Diagram (PFD)', desc: 'Major unit operations & primary streams' },
  { id: 'bfd', label: '4. Block Flow Diagram (BFD)', desc: 'High-level facility battery limit blocks' },
  { id: 'stream_table', label: '5. Stream Table (H&MB)', desc: 'Mass/molar flow, compositions, T & P matrix' },
  { id: 'equipment_datasheet', label: '6. Equipment Datasheet', desc: 'Mechanical specs, MOC, design P&T, relief' },
  { id: 'basis_of_design', label: '7. Basis of Design (BOD)', desc: 'Design envelope, plant capacity & margins' },
  { id: 'process_design_philosophy', label: '8. Process Design Philosophy', desc: 'Overpressure, relief, sparing & flaring' },
  { id: 'operating_philosophy', label: '9. Operating Philosophy', desc: 'Normal startup, shutdown & turndown limits' },
  { id: 'control_philosophy', label: '10. Control Philosophy', desc: 'DCS control loops, split-range & overrides' },
  { id: 'shutdown_philosophy', label: '11. Shutdown & ESD Philosophy', desc: 'Interlock logic, SIL ratings & ESD matrices' },
];

const ALLOWED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.csv',
  '.txt',
  '.png',
  '.jpg',
  '.jpeg',
  '.svg',
  '.webp',
];

export const DocumentUploadModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projectId,
  onUploadSuccess,
}) => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('auto');
  const [revision, setRevision] = useState<string>('A');
  const [sourceOrg, setSourceOrg] = useState<string>('Process Engineering');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);
    validateAndAddFiles(files);
  };

  const validateAndAddFiles = (newFiles: File[]) => {
    setErrorMsg(null);
    const valid: File[] = [];
    const maxSizeBytes = 50 * 1024 * 1024; // 50MB

    for (const f of newFiles) {
      const ext = '.' + f.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setErrorMsg(
          `File "${f.name}" has an unsupported format. Supported formats: PDF, DOCX, XLSX, CSV, TXT, PNG, JPG, SVG.`
        );
        return;
      }
      if (f.size > maxSizeBytes) {
        setErrorMsg(`File "${f.name}" exceeds the 50MB file size limit.`);
        return;
      }
      valid.push(f);
    }

    setSelectedFiles((prev) => [...prev, ...valid]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files) {
      validateAndAddFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleRemoveFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    if (!projectId) {
      setErrorMsg('No active project selected. Please select or create a project first.');
      return;
    }

    setIsUploading(true);
    setErrorMsg(null);
    setUploadProgress('Running document classification and multi-category extraction pipeline...');

    try {
      const formData = new FormData();
      formData.append('category', selectedCategory);
      formData.append('doc_type', selectedCategory);
      formData.append('revision', revision);
      formData.append('source_organization', sourceOrg);

      for (const file of selectedFiles) {
        formData.append('files', file);
      }

      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to upload and extract documents');
      }

      await onUploadSuccess();
      onClose();
      setSelectedFiles([]);
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message?.toLowerCase().includes('fetch')) {
        setErrorMsg('Connection failed: Cannot reach the backend API at http://localhost:5001. Please verify the server is running.');
      } else {
        setErrorMsg(err.message || 'Upload error');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-950 border border-amber-500/30 rounded-2xl w-full max-w-2xl flex flex-col shadow-2xl shadow-black/80 overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-600" />

        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-inner">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
                Multi-Document Ingestion Studio
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300">
                  11 Categories
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload engineering documents across PDF, Word DOCX, Excel XLSX, CSV, TXT, and drawing formats.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
          
          {/* Document Category Dropdown / Selector */}
          <div className="space-y-1.5">
            <label className="block text-slate-200 font-semibold">
              Target Document Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-slate-200 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 focus:border-amber-500 shadow-inner cursor-pointer"
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id} className="bg-slate-900 text-slate-200">
                  {opt.label} — {opt.desc}
                </option>
              ))}
            </select>
          </div>

          {/* Metadata: Revision & Source Organization */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <Settings2 className="w-3.5 h-3.5 text-amber-400" />
                Drawing / Doc Revision
              </label>
              <input
                type="text"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
                placeholder="e.g. A, 0, Rev 1"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-inner"
              />
            </div>

            <div className="space-y-1">
              <label className="text-slate-300 font-medium flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5 text-amber-400" />
                Source Organization
              </label>
              <input
                type="text"
                value={sourceOrg}
                onChange={(e) => setSourceOrg(e.target.value)}
                placeholder="e.g. Intelligent Engineering Solutions"
                className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-inner"
              />
            </div>
          </div>

          {/* Drag & Drop Area */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-700 hover:border-amber-400/70 bg-slate-900/50 hover:bg-slate-900/80 p-6 rounded-2xl text-center cursor-pointer transition-all space-y-2 group"
          >
            <Upload className="w-8 h-8 text-amber-400 mx-auto group-hover:scale-110 transition-transform" />
            <div className="font-semibold text-slate-200 text-sm">
              Drag & Drop files here or click to browse
            </div>
            <p className="text-[11px] text-slate-400">
              Supports <strong className="text-amber-300">PDF</strong>, <strong className="text-amber-300">DOCX</strong>, <strong className="text-amber-300">XLSX</strong>, <strong className="text-amber-300">CSV</strong>, <strong className="text-amber-300">TXT</strong>, and vector/raster drawings (<strong className="text-amber-300">PNG, JPG, SVG</strong>) up to 50MB.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.svg,.webp"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <div className="font-semibold text-slate-300 flex items-center justify-between">
                <span>Selected Documents ({selectedFiles.length}):</span>
                <button
                  type="button"
                  onClick={() => setSelectedFiles([])}
                  className="text-[11px] text-rose-400 hover:underline"
                >
                  Clear All
                </button>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {selectedFiles.map((f, i) => {
                  const ext = f.name.split('.').pop()?.toUpperCase() || 'FILE';
                  return (
                    <div
                      key={i}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800 text-[11px]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-amber-400 font-bold">
                          {ext}
                        </span>
                        <span className="font-mono text-slate-200 truncate">{f.name}</span>
                        <span className="text-slate-500 font-mono">
                          ({(f.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(i);
                        }}
                        className="text-slate-500 hover:text-rose-400 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Status / Errors */}
          {errorMsg && (
            <div className="p-3 bg-rose-950/50 border border-rose-800 text-rose-300 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isUploading && (
            <div className="p-3 bg-amber-950/40 border border-amber-800 text-amber-300 rounded-xl flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <span>{uploadProgress || 'Processing document extraction...'}</span>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-900/90 border-t border-slate-800 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            OSHA 1910.119 Multi-Document Evidence Grounding
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={isUploading}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={isUploading || selectedFiles.length === 0}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-md shadow-amber-950/50 disabled:opacity-50 transition-all"
            >
              {isUploading ? 'Extracting...' : 'Upload & Process'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
