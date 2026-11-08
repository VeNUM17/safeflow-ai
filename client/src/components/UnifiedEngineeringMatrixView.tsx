import React, { useState, useEffect } from 'react';
import {
  Layers,
  Database,
  Search,
  Filter,
  RefreshCw,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Activity,
  ArrowRight,
  GitBranch,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Info,
  Clock,
  Check,
} from 'lucide-react';
import {
  UnifiedEngineeringMatrixEntry,
  DocumentCategory,
  UnifiedProvenanceValue,
} from '../types';

interface UnifiedEngineeringMatrixViewProps {
  projectId: string;
  onRefreshProject?: () => Promise<void>;
}

export const UnifiedEngineeringMatrixView: React.FC<UnifiedEngineeringMatrixViewProps> = ({
  projectId,
  onRefreshProject,
}) => {
  const [matrix, setMatrix] = useState<UnifiedEngineeringMatrixEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<UnifiedEngineeringMatrixEntry | null>(null);
  const [entityFilter, setEntityFilter] = useState<'all' | 'equipment' | 'line' | 'stream'>('all');
  const [conflictOnly, setConflictOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Load matrix from API
  const fetchMatrix = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/engineering-matrix`);
      const json = await res.json();
      if (json.success) {
        setMatrix(json.data);
        if (json.data.length > 0 && !selectedEntry) {
          setSelectedEntry(json.data[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load Unified Engineering Matrix:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMatrix();
  }, [projectId]);

  // Synchronize matrix
  const handleSynchronize = async () => {
    setIsSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/engineering-matrix/synchronize`, {
        method: 'POST',
      });
      const json = await res.json();
      if (json.success) {
        setMatrix(json.data);
        setSyncMessage(`Successfully consolidated ${json.data.length} engineering entities across 11 document categories.`);
        if (json.data.length > 0) {
          setSelectedEntry(json.data[0]);
        }
        if (onRefreshProject) await onRefreshProject();
      }
    } catch (err) {
      console.error('Failed to synchronize matrix:', err);
      setSyncMessage('Failed to synchronize matrix.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Filter matrix entries
  const filteredEntries = matrix.filter((entry) => {
    if (entityFilter !== 'all' && entry.entity_type !== entityFilter) return false;
    if (conflictOnly && !entry.has_conflicts) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTag = entry.entity_tag.toLowerCase().includes(q);
      const matchDesc = entry.description?.toLowerCase().includes(q) || false;
      const matchSources = entry.sources_found.some((s) => s.toLowerCase().includes(q));
      if (!matchTag && !matchDesc && !matchSources) return false;
    }
    return true;
  });

  const categoryColor = (cat: DocumentCategory) => {
    switch (cat) {
      case 'pid':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
      case 'equipment_datasheet':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'stream_table':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'pfd':
      case 'bfd':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
      case 'sds':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      case 'shutdown_philosophy':
      case 'control_philosophy':
      case 'process_design_philosophy':
      case 'operating_philosophy':
      case 'basis_of_design':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      default:
        return 'bg-slate-700/40 text-slate-300 border-slate-600';
    }
  };

  const categoryLabel = (cat: DocumentCategory) => {
    switch (cat) {
      case 'pid':
        return 'P&ID';
      case 'equipment_datasheet':
        return 'Datasheet';
      case 'stream_table':
        return 'Stream Table';
      case 'pfd':
        return 'PFD';
      case 'bfd':
        return 'BFD';
      case 'sds':
        return 'SDS';
      case 'shutdown_philosophy':
        return 'ESD Phil.';
      case 'control_philosophy':
        return 'Control Phil.';
      case 'process_design_philosophy':
        return 'Design Phil.';
      case 'operating_philosophy':
        return 'Oper. Phil.';
      case 'basis_of_design':
        return 'BOD';
      default:
        return cat;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* 1. Header Banner & Executive Attribution */}
      <div className="bg-slate-900/90 border border-amber-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden backdrop-blur-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-amber-500/10 via-cyan-500/5 to-transparent rounded-full blur-3xl -z-10" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-inner">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-100 to-amber-400">
                    Unified Engineering Database
                  </h1>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    11-Category Multi-Source Matrix
                  </span>
                </div>
                <p className="text-slate-400 text-xs mt-0.5">
                  Relational consolidation linking Equipment, Lines, Streams, Chemicals, Datasheet Specs, and Philosophy Interlocks without destructive overwrite.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/80 border border-amber-500/40 text-[11px] font-medium text-slate-300">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Architected by <strong className="text-amber-300 font-bold">Shlok</strong></span>
            </div>

            <button
              onClick={handleSynchronize}
              disabled={isSyncing}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-950/50 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Consolidating...' : 'Rebuild & Synchronize Matrix'}
            </button>
          </div>
        </div>

        {syncMessage && (
          <div className="mt-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>{syncMessage}</span>
          </div>
        )}
      </div>

      {/* 2. Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/70 p-3 rounded-xl border border-slate-800">
        {/* Entity Type Filter Tabs */}
        <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          {(['all', 'equipment', 'line', 'stream'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setEntityFilter(type)}
              className={`px-3 py-1.5 rounded-md font-medium capitalize transition-all ${
                entityFilter === type
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {type === 'all' ? `All Entities (${matrix.length})` : `${type}s`}
            </button>
          ))}
        </div>

        {/* Search & Conflicts Only */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search tag, description, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500/60"
            />
          </div>

          <button
            onClick={() => setConflictOnly(!conflictOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              conflictOnly
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/50'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
            <span>Conflicts Only</span>
          </button>
        </div>
      </div>

      {/* 3. Matrix Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Entity Registry List (5 cols) */}
        <div className="lg:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              Consolidated Entities ({filteredEntries.length})
            </span>
            <span className="text-[11px] font-mono text-slate-500">Click to inspect</span>
          </div>

          <div className="divide-y divide-slate-800/60 max-h-[700px] overflow-y-auto">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                Consolidating cross-document entities...
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500 font-mono">
                No engineering entities match criteria.
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const isSelected = selectedEntry?.id === entry.id;
                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className={`p-3.5 cursor-pointer transition-all hover:bg-slate-800/40 ${
                      isSelected
                        ? 'bg-gradient-to-r from-amber-500/10 via-slate-800/50 to-transparent border-l-4 border-amber-400'
                        : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white text-xs font-mono">
                            {entry.entity_tag}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase bg-slate-800 text-slate-400 border border-slate-700">
                            {entry.entity_type}
                          </span>
                          {entry.has_conflicts && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Conflict
                            </span>
                          )}
                        </div>

                        {entry.description && (
                          <p className="text-[11px] text-slate-400 truncate max-w-[280px]">
                            {entry.description}
                          </p>
                        )}

                        {/* Source Document Category Badges */}
                        <div className="flex items-center gap-1 flex-wrap pt-1">
                          {entry.sources_found.map((source) => (
                            <span
                              key={source}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono border ${categoryColor(
                                source
                              )}`}
                            >
                              {categoryLabel(source)}
                            </span>
                          ))}
                        </div>
                      </div>

                      <ChevronRight className={`w-4 h-4 text-slate-600 transition-transform ${isSelected ? 'rotate-90 text-amber-400' : ''}`} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deep Multi-Source Inspector (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          {selectedEntry ? (
            <>
              {/* Entity Header */}
              <div className="border-b border-slate-800 pb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-black text-white font-mono">
                      {selectedEntry.entity_tag}
                    </h2>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                      {selectedEntry.entity_type}
                    </span>
                    {selectedEntry.has_conflicts && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        Discrepancies Present
                      </span>
                    )}
                  </div>
                  {selectedEntry.description && (
                    <p className="text-xs text-slate-300 mt-1">{selectedEntry.description}</p>
                  )}
                </div>

                <div className="text-right text-[11px] font-mono text-slate-500">
                  Last synchronized:{' '}
                  <span className="text-slate-400">
                    {new Date(selectedEntry.last_updated).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {/* Source Document Provenance List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Correlated Source Documents ({selectedEntry.sources_found.length})
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedEntry.sources_found.map((cat, idx) => (
                    <div
                      key={idx}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono border flex items-center gap-1.5 ${categoryColor(
                        cat
                      )}`}
                    >
                      <Check className="w-3 h-3" />
                      <span>{categoryLabel(cat)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Design Specifications (Datasheets / Mechanical Ratings) */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-cyan-400" />
                  Design Mechanical Specifications (Datasheet / P&ID)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Design Pressure */}
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400">Design Pressure</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {selectedEntry.design_specifications?.design_pressure?.normalized_value !== undefined &&
                      selectedEntry.design_specifications?.design_pressure?.normalized_value !== null
                        ? `${selectedEntry.design_specifications.design_pressure.normalized_value} ${selectedEntry.design_specifications.design_pressure.normalized_unit || 'barg'}`
                        : <span className="text-rose-400 font-normal italic">Missing (Zero Fabrication)</span>}
                    </div>
                    {selectedEntry.design_specifications?.design_pressure && (
                      <span className="text-[9px] font-mono text-slate-500 block truncate">
                        Source: {selectedEntry.design_specifications.design_pressure.source_document_name} ({selectedEntry.design_specifications.design_pressure.verification_status})
                      </span>
                    )}
                  </div>

                  {/* Design Temperature */}
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400">Design Temperature</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {selectedEntry.design_specifications?.design_temperature?.normalized_value !== undefined &&
                      selectedEntry.design_specifications?.design_temperature?.normalized_value !== null
                        ? `${selectedEntry.design_specifications.design_temperature.normalized_value} ${selectedEntry.design_specifications.design_temperature.normalized_unit || '°C'}`
                        : <span className="text-rose-400 font-normal italic">Missing (Zero Fabrication)</span>}
                    </div>
                    {selectedEntry.design_specifications?.design_temperature && (
                      <span className="text-[9px] font-mono text-slate-500 block truncate">
                        Source: {selectedEntry.design_specifications.design_temperature.source_document_name} ({selectedEntry.design_specifications.design_temperature.verification_status})
                      </span>
                    )}
                  </div>

                  {/* Material of Construction */}
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400">Material of Construction</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {selectedEntry.design_specifications?.material_of_construction?.normalized_value || (
                        <span className="text-amber-400 font-normal italic">Not provided</span>
                      )}
                    </div>
                    {selectedEntry.design_specifications?.material_of_construction && (
                      <span className="text-[9px] font-mono text-slate-500 block truncate">
                        Source: {selectedEntry.design_specifications.material_of_construction.source_document_name}
                      </span>
                    )}
                  </div>

                  {/* Relief Valve Set Pressure */}
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400">Relief Valve Set Pressure</span>
                    <div className="text-sm font-bold text-white font-mono">
                      {selectedEntry.design_specifications?.relief_valve_set_pressure?.normalized_value !== undefined &&
                      selectedEntry.design_specifications?.relief_valve_set_pressure?.normalized_value !== null
                        ? `${selectedEntry.design_specifications.relief_valve_set_pressure.normalized_value} ${selectedEntry.design_specifications.relief_valve_set_pressure.normalized_unit || 'barg'}`
                        : <span className="text-slate-500 font-normal italic">N/A</span>}
                    </div>
                    {selectedEntry.design_specifications?.relief_valve_set_pressure && (
                      <span className="text-[9px] font-mono text-slate-500 block truncate">
                        Set per API 520 / Datasheet
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Operating Conditions (Stream Table / H&MB) */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  Operating Process Conditions (Stream Table / PFD)
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400">Operating Pressure</span>
                    <div className="text-sm font-bold text-emerald-300 font-mono">
                      {selectedEntry.operating_conditions?.pressure?.normalized_value !== undefined &&
                      selectedEntry.operating_conditions?.pressure?.normalized_value !== null
                        ? `${selectedEntry.operating_conditions.pressure.normalized_value} ${selectedEntry.operating_conditions.pressure.normalized_unit || 'barg'}`
                        : <span className="text-slate-500 font-normal italic">N/A</span>}
                    </div>
                  </div>

                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400">Operating Temperature</span>
                    <div className="text-sm font-bold text-emerald-300 font-mono">
                      {selectedEntry.operating_conditions?.temperature?.normalized_value !== undefined &&
                      selectedEntry.operating_conditions?.temperature?.normalized_value !== null
                        ? `${selectedEntry.operating_conditions.temperature.normalized_value} ${selectedEntry.operating_conditions.temperature.normalized_unit || '°C'}`
                        : <span className="text-slate-500 font-normal italic">N/A</span>}
                    </div>
                  </div>

                  <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-mono text-slate-400">Process Fluid Phase</span>
                    <div className="text-sm font-bold text-emerald-300 font-mono capitalize">
                      {selectedEntry.operating_conditions?.phase?.normalized_value || 'Multiphase / N/A'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Topology Connectivity */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                  Connected Process Piping & Streams
                </span>

                <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono">Connected Lines:</span>
                    {selectedEntry.connected_lines && selectedEntry.connected_lines.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {selectedEntry.connected_lines.map((l) => (
                          <span key={l} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-cyan-300">
                            {l}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">None linked</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-mono">Connected Streams:</span>
                    {selectedEntry.connected_streams && selectedEntry.connected_streams.length > 0 ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {selectedEntry.connected_streams.map((s) => (
                          <span key={s} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] text-emerald-300">
                            {s}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-500 italic">None linked</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Philosophy Safeguards & Interlocks */}
              {selectedEntry.rules && selectedEntry.rules.length > 0 && (
                <div className="space-y-3">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-rose-400" />
                    Engineering Philosophy Rules & SIF Interlocks ({selectedEntry.rules.length})
                  </span>

                  <div className="space-y-2">
                    {selectedEntry.rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-rose-300">
                            {rule.loop_tag || rule.equipment_tag} ({rule.rule_type})
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-400">
                            {rule.source_category}
                          </span>
                        </div>
                        <div className="text-slate-300 font-medium">
                          <span className="text-slate-500">Condition:</span> {rule.condition}
                        </div>
                        <div className="text-slate-300">
                          <span className="text-slate-500">Action:</span> {rule.action} {rule.fail_safe_position ? `(${rule.fail_safe_position})` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="py-24 text-center text-slate-500 text-xs font-mono">
              Select an engineering entity from the registry to inspect cross-document intelligence.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
