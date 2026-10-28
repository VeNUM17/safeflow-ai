import React, { useState } from 'react';
import {
  FlaskConical,
  FileText,
  Calendar,
  Building,
  Hash,
  ShieldAlert,
  ExternalLink,
  ChevronRight,
  BookOpen,
  Info,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { ChemicalRecord, ReviewStatus, PsiParameters } from '../types';
import { PsiFieldCard } from './PsiFieldCard';

interface Props {
  chemicals: ChemicalRecord[];
  selectedChemicalId: string | null;
  onSelectChemical: (id: string) => void;
  onUpdateField: (
    chemicalId: string,
    fieldKey: string,
    updates: {
      user_value?: string | null;
      review_status: ReviewStatus;
      notes?: string;
    }
  ) => Promise<void>;
  statusFilter: string;
  searchQuery: string;
}

const PSI_FIELDS_CONFIG: {
  key: keyof PsiParameters;
  label: string;
  num: string;
  oshaRef: string;
  desc: string;
}[] = [
  {
    key: 'toxicity',
    label: 'Toxicity Information',
    num: '1910.119(d)(1)(i)',
    oshaRef: 'OSHA 29 CFR 1910.119(d)(1)(i) / GHS Sec 11',
    desc: 'Acute and chronic toxicological data, LC50/LD50 inhalation/oral thresholds, target organs, and lethal concentration levels.',
  },
  {
    key: 'permissible_exposure_limits',
    label: 'Permissible Exposure Limits (PEL / TLV / REL)',
    num: '1910.119(d)(1)(ii)',
    oshaRef: 'OSHA 29 CFR 1910.119(d)(1)(ii) / GHS Sec 8',
    desc: 'Mandatory OSHA PEL 8-hr TWA, ACGIH TLV, NIOSH REL, STEL, and IDLH emergency evacuation limits.',
  },
  {
    key: 'physical_data',
    label: 'Physical Data',
    num: '1910.119(d)(1)(iii)',
    oshaRef: 'OSHA 29 CFR 1910.119(d)(1)(iii) / GHS Sec 9',
    desc: 'Boiling point, vapor pressure at ambient/operating temps, vapor density (air=1), flash point, flammability limits (LEL/UEL).',
  },
  {
    key: 'reactivity_data',
    label: 'Reactivity Data',
    num: '1910.119(d)(1)(iv)',
    oshaRef: 'OSHA 29 CFR 1910.119(d)(1)(iv) / GHS Sec 10',
    desc: 'Chemical reactivity hazards, hazardous decomposition under normal use, static discharge sensitivity, and conditions to avoid.',
  },
  {
    key: 'corrosivity_data',
    label: 'Corrosivity Data',
    num: '1910.119(d)(1)(v)',
    oshaRef: 'OSHA 29 CFR 1910.119(d)(1)(v) / GHS Sec 2 & 9',
    desc: 'Corrosion to piping/vessel metallurgy (e.g. copper/brass/zinc attack), solution pH, and severe dermal/ocular tissue destruction.',
  },
  {
    key: 'thermal_and_chemical_stability_data',
    label: 'Thermal and Chemical Stability Data',
    num: '1910.119(d)(1)(vi)',
    oshaRef: 'OSHA 29 CFR 1910.119(d)(1)(vi) / GHS Sec 10',
    desc: 'Thermal decomposition threshold temperatures, self-accelerating decomposition, exothermic reactions, and hazardous polymerization.',
  },
  {
    key: 'inadvertent_mixing_hazards',
    label: 'Hazardous Effects of Inadvertent Mixing',
    num: '1910.119(d)(1)(vii)',
    oshaRef: 'OSHA 29 CFR 1910.119(d)(1)(vii) / GHS Sec 10',
    desc: 'Catastrophic consequences of foreseeable inadvertent mixing (e.g., ammonia + bleach = toxic chloramines; bleach + acid = chlorine gas).',
  },
];

export const PsiReviewWorkspace: React.FC<Props> = ({
  chemicals,
  selectedChemicalId,
  onSelectChemical,
  onUpdateField,
  statusFilter,
  searchQuery,
}) => {
  const [inspectedSnippet, setInspectedSnippet] = useState<{
    text: string;
    source: any;
  } | null>(null);

  if (chemicals.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-slate-400">
        <FlaskConical className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <h3 className="text-lg font-semibold text-slate-200">No Chemical SDS Records Available</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
          Upload Safety Data Sheet (SDS) PDFs or select a project with processed documents to view and verify Process Safety Information.
        </p>
      </div>
    );
  }

  const activeChemical =
    chemicals.find((c) => c.id === selectedChemicalId) || chemicals[0];

  const handleInspectSnippet = (snippet: string, source: any) => {
    setInspectedSnippet({ text: snippet, source });
  };

  // Filter fields
  const filteredFields = PSI_FIELDS_CONFIG.filter((cfg) => {
    const fieldData = activeChemical.psi_parameters[cfg.key];
    if (statusFilter !== 'all' && fieldData.review_status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const val = (fieldData.user_value || fieldData.value || '').toLowerCase();
      const label = cfg.label.toLowerCase();
      const snippet = (fieldData.source.snippet || '').toLowerCase();
      return val.includes(q) || label.includes(q) || snippet.includes(q);
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      
      {/* Chemical Selector Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800">
        {chemicals.map((chem) => {
          const isSelected = chem.id === activeChemical.id;
          const name = chem.chemical_name.user_value || chem.chemical_name.value || 'Unknown';
          const cas = chem.cas_number.user_value || chem.cas_number.value || 'N/A';
          const isReviewed = chem.chemical_name.review_status === 'confirmed';

          return (
            <button
              key={chem.id}
              onClick={() => onSelectChemical(chem.id)}
              className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-left transition-all shrink-0 ${
                isSelected
                  ? 'bg-slate-800 border-cyan-500/70 shadow-md ring-1 ring-cyan-500/30'
                  : 'bg-slate-900/60 border-slate-800 hover:bg-slate-800/60 text-slate-400'
              }`}
            >
              <div
                className={`p-1.5 rounded-lg ${
                  isSelected ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500'
                }`}
              >
                <FlaskConical className="w-4 h-4" />
              </div>

              <div>
                <div className={`text-xs font-bold leading-tight ${isSelected ? 'text-slate-100' : 'text-slate-300'}`}>
                  {name}
                </div>
                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span>CAS {cas}</span>
                  <span>•</span>
                  <span className="truncate max-w-[130px]">{chem.manufacturer.value || 'Vendor'}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Chemical Metadata Bar */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-slate-400 font-medium block flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
            Chemical / Product
          </span>
          <span className="font-semibold text-slate-100 mt-0.5 block truncate">
            {activeChemical.chemical_name.user_value || activeChemical.chemical_name.value}
          </span>
        </div>

        <div>
          <span className="text-slate-400 font-medium block flex items-center gap-1">
            <Hash className="w-3.5 h-3.5 text-purple-400" />
            CAS Number
          </span>
          <span className="font-mono font-semibold text-slate-100 mt-0.5 block">
            {activeChemical.cas_number.user_value || activeChemical.cas_number.value || '(Not Found)'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 font-medium block flex items-center gap-1">
            <Building className="w-3.5 h-3.5 text-amber-400" />
            Manufacturer / Supplier
          </span>
          <span className="font-medium text-slate-200 mt-0.5 block truncate">
            {activeChemical.manufacturer.user_value || activeChemical.manufacturer.value || 'N/A'}
          </span>
        </div>

        <div>
          <span className="text-slate-400 font-medium block flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-emerald-400" />
            SDS Revision Date
          </span>
          <span className="font-mono text-slate-200 mt-0.5 block">
            {activeChemical.sds_revision_date.user_value || activeChemical.sds_revision_date.value || 'Undated'}
          </span>
        </div>
      </div>

      {/* Main Review Workspace Layout: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: 7 Mandatory PSI Field Cards */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              OSHA 29 CFR 1910.119(d)(1) Mandated Parameters ({filteredFields.length})
            </h2>
            <span className="text-xs text-slate-400">
              Human review & verification required
            </span>
          </div>

          {filteredFields.length === 0 ? (
            <div className="bg-slate-900/50 p-8 rounded-xl border border-slate-800 text-center text-slate-400 text-xs">
              No fields match the current filter criteria ({statusFilter}).
            </div>
          ) : (
            filteredFields.map((cfg) => {
              const fieldData = activeChemical.psi_parameters[cfg.key];
              return (
                <PsiFieldCard
                  key={cfg.key}
                  fieldKey={cfg.key}
                  fieldLabel={cfg.label}
                  fieldNumber={cfg.num}
                  fieldData={fieldData}
                  chemicalId={activeChemical.id}
                  onUpdateField={onUpdateField}
                  onInspectSnippet={handleInspectSnippet}
                />
              );
            })
          )}
        </div>

        {/* Right Column: Verbatim Evidence & Regulatory Guidance Inspector */}
        <div className="lg:col-span-4 space-y-4">
          
          {/* Active Snippet Inspector */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 sticky top-20 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h3 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-cyan-400" />
                Evidence Grounding Inspector
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                Verbatim Primary Source
              </span>
            </div>

            {inspectedSnippet ? (
              <div className="space-y-3">
                <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-xs">
                  <div className="text-[11px] text-slate-400 font-semibold mb-1">
                    Document Reference:
                  </div>
                  <div className="text-cyan-400 font-mono text-[11px] truncate">
                    {inspectedSnippet.source.document}
                  </div>
                  <div className="text-slate-400 text-[11px] mt-0.5">
                    {inspectedSnippet.source.page !== null && `Page ${inspectedSnippet.source.page}`}
                    {inspectedSnippet.source.section && ` • ${inspectedSnippet.source.section}`}
                  </div>
                </div>

                <div>
                  <div className="text-[11px] font-semibold text-slate-300 mb-1 flex items-center gap-1">
                    <span>Unedited Source Text Snippet:</span>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-lg border border-cyan-500/30 text-xs font-mono text-slate-200 leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap">
                    "{inspectedSnippet.text}"
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-800/30 text-[11px] text-cyan-300/80 leading-relaxed">
                  <Info className="w-3.5 h-3.5 inline mr-1 text-cyan-400" />
                  Preserving the exact source snippet prevents translation hallucination and ensures traceability during OSHA PSM regulatory audits.
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-500 text-xs space-y-2">
                <BookOpen className="w-8 h-8 mx-auto text-slate-600" />
                <p>Click "Inspect Verbatim Evidence" on any PSI card to view the exact text context extracted from the SDS.</p>
              </div>
            )}

            {/* Regulatory Scope Info Card */}
            <div className="mt-4 pt-4 border-t border-slate-800 space-y-2 text-xs">
              <div className="font-semibold text-slate-300 flex items-center gap-1">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                PSM Compliance Guideline
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Under OSHA 1910.119(d)(1), the employer must compile written process safety information enabling personnel to identify hazards. Missing fields must be investigated rather than assumed non-hazardous.
              </p>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
