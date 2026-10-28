import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  FileEdit,
  AlertTriangle,
  FlaskConical,
  Info,
  CheckCircle2,
  HelpCircle,
  ShieldAlert,
  Thermometer,
  Flame,
  Droplet,
  Layers,
  FileText,
} from 'lucide-react';
import {
  ChemicalRecord,
  CompositionType,
  ChemicalRecordStatus,
  PsiParameters,
  StructuredPsiParameters,
  ChemicalDuplicateMatch,
} from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  existingChemicals: ChemicalRecord[];
  initialChemical?: ChemicalRecord | null;
  onSave: (chemicalData: any, isDraft: boolean) => Promise<void>;
}

export const ManualChemicalModal: React.FC<Props> = ({
  isOpen,
  onClose,
  projectId,
  existingChemicals,
  initialChemical,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<ChemicalDuplicateMatch[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Identity Form State
  const [name, setName] = useState('');
  const [casNumber, setCasNumber] = useState('');
  const [synonyms, setSynonyms] = useState('');
  const [formula, setFormula] = useState('');
  const [molecularWeight, setMolecularWeight] = useState('');
  const [mwUnit, setMwUnit] = useState('g/mol');
  const [physicalState, setPhysicalState] = useState('liquid');
  const [compositionType, setCompositionType] = useState<CompositionType>('pure_substance');
  const [concentration, setConcentration] = useState('');
  const [description, setDescription] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [revisionDate, setRevisionDate] = useState('');

  // 7 PSI Parameters State
  const [psiValues, setPsiValues] = useState<Record<string, {
    value: string;
    units: string;
    notes: string;
    sourceDoc: string;
    sourcePage: string;
    sourceSection: string;
  }>>({
    toxicity: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
    permissible_exposure_limits: { value: '', units: 'ppm', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
    physical_data: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
    reactivity_data: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
    corrosivity_data: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
    thermal_and_chemical_stability_data: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
    inadvertent_mixing_hazards: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
  });

  // Structured fields state
  const [oshaPel, setOshaPel] = useState('');
  const [acgihTlv, setAcgihTlv] = useState('');
  const [nioshRel, setNioshRel] = useState('');
  const [pelUnits, setPelUnits] = useState('ppm');
  const [boilingPoint, setBoilingPoint] = useState('');
  const [flashPoint, setFlashPoint] = useState('');
  const [vaporPressure, setVaporPressure] = useState('');
  const [specificGravity, setSpecificGravity] = useState('');
  const [ph, setPh] = useState('');
  const [incompatibleMaterials, setIncompatibleMaterials] = useState('');
  const [decompositionTemp, setDecompositionTemp] = useState('');

  // Populate state on open or edit
  useEffect(() => {
    if (!isOpen) return;

    if (initialChemical) {
      setName(initialChemical.chemical_name?.user_value || initialChemical.chemical_name?.value || '');
      setCasNumber(initialChemical.cas_number?.user_value || initialChemical.cas_number?.value || '');
      setSynonyms((initialChemical.synonyms || []).join(', '));
      setFormula(initialChemical.molecular_formula || '');
      setMolecularWeight(initialChemical.molecular_weight?.value ? String(initialChemical.molecular_weight.value) : '');
      setMwUnit(initialChemical.molecular_weight?.unit || 'g/mol');
      setPhysicalState(initialChemical.physical_state || 'liquid');
      setCompositionType(initialChemical.composition_type || 'pure_substance');
      setConcentration(initialChemical.concentration || '');
      setDescription(initialChemical.description || '');
      setManufacturer(initialChemical.manufacturer?.user_value || initialChemical.manufacturer?.value || '');
      setRevisionDate(initialChemical.sds_revision_date?.user_value || initialChemical.sds_revision_date?.value || '');

      const initialPsi: any = {};
      const psiKeys: (keyof PsiParameters)[] = [
        'toxicity',
        'permissible_exposure_limits',
        'physical_data',
        'reactivity_data',
        'corrosivity_data',
        'thermal_and_chemical_stability_data',
        'inadvertent_mixing_hazards',
      ];
      for (const k of psiKeys) {
        const param = initialChemical.psi_parameters?.[k];
        initialPsi[k] = {
          value: param?.user_value || param?.value || '',
          units: param?.units || (k === 'permissible_exposure_limits' ? 'ppm' : ''),
          notes: param?.notes || '',
          sourceDoc: param?.source?.document !== 'Manual Entry' ? (param?.source?.document || '') : '',
          sourcePage: param?.source?.page ? String(param.source.page) : '',
          sourceSection: param?.source?.section || '',
        };
      }
      setPsiValues(initialPsi);
      setHasUnsavedChanges(false);
    } else {
      // Reset form
      setName('');
      setCasNumber('');
      setSynonyms('');
      setFormula('');
      setMolecularWeight('');
      setMwUnit('g/mol');
      setPhysicalState('liquid');
      setCompositionType('pure_substance');
      setConcentration('');
      setDescription('');
      setManufacturer('');
      setRevisionDate('');
      setPsiValues({
        toxicity: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
        permissible_exposure_limits: { value: '', units: 'ppm', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
        physical_data: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
        reactivity_data: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
        corrosivity_data: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
        thermal_and_chemical_stability_data: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
        inadvertent_mixing_hazards: { value: '', units: '', notes: '', sourceDoc: '', sourcePage: '', sourceSection: '' },
      });
      setOshaPel('');
      setAcgihTlv('');
      setNioshRel('');
      setBoilingPoint('');
      setFlashPoint('');
      setVaporPressure('');
      setSpecificGravity('');
      setPh('');
      setIncompatibleMaterials('');
      setDecompositionTemp('');
      setHasUnsavedChanges(false);
    }
    setActiveTab(0);
    setErrorMsg(null);
    setDuplicateMatches([]);
  }, [isOpen, initialChemical]);

  // Check for duplicates when name or CAS changes
  useEffect(() => {
    if (!name.trim() && !casNumber.trim()) {
      setDuplicateMatches([]);
      return;
    }

    const normName = name.trim().toLowerCase();
    const normCas = casNumber.trim();
    const matches: ChemicalDuplicateMatch[] = [];

    for (const chem of existingChemicals) {
      if (initialChemical && chem.id === initialChemical.id) continue;

      const chemCas = (chem.cas_number?.value || chem.cas_number?.user_value || '').trim();
      if (normCas && chemCas && normCas === chemCas) {
        matches.push({
          chemical: chem,
          match_type: 'exact_cas',
          match_reason: `Exact CAS Registry Number match (${normCas})`,
        });
        continue;
      }

      const chemName = (chem.chemical_name?.value || chem.chemical_name?.user_value || '').trim().toLowerCase();
      if (normName && chemName && normName === chemName) {
        matches.push({
          chemical: chem,
          match_type: 'exact_name',
          match_reason: `Exact chemical name match ("${chem.chemical_name.value || chem.chemical_name.user_value}")`,
        });
        continue;
      }

      if (normName.length >= 3 && chemName.length >= 3) {
        if (normName.includes(chemName) || chemName.includes(normName)) {
          matches.push({
            chemical: chem,
            match_type: 'similar_name',
            match_reason: `Similar chemical name match ("${chem.chemical_name.value || chem.chemical_name.user_value}")`,
          });
        }
      }
    }

    setDuplicateMatches(matches);
  }, [name, casNumber, existingChemicals, initialChemical]);

  if (!isOpen) return null;

  const handlePsiChange = (key: string, field: string, val: string) => {
    setPsiValues((prev) => ({
      ...prev,
      [key]: {
        ...prev[key],
        [field]: val,
      },
    }));
    setHasUnsavedChanges(true);
  };

  const validateCas = (val: string): boolean => {
    if (!val.trim()) return true;
    return /^\d{2,7}-\d{2}-\d$/.test(val.trim());
  };

  const handleSave = async (isDraft: boolean) => {
    if (!name.trim()) {
      setErrorMsg('Chemical name is required.');
      setActiveTab(0);
      return;
    }

    if (casNumber.trim() && !validateCas(casNumber)) {
      setErrorMsg('Invalid CAS Registry Number format. Standard format is: XXXXX-XX-X (e.g., 7664-41-7).');
      setActiveTab(0);
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      // Build structured PSI object
      const structuredPsi: StructuredPsiParameters = {
        permissible_exposure_limits: {
          limits: [
            ...(oshaPel ? [{ authority: 'OSHA_PEL' as const, value: parseFloat(oshaPel) || null, unit: pelUnits, averaging_period: '8-hr TWA' }] : []),
            ...(acgihTlv ? [{ authority: 'ACGIH_TLV' as const, value: parseFloat(acgihTlv) || null, unit: pelUnits, averaging_period: '8-hr TWA' }] : []),
            ...(nioshRel ? [{ authority: 'NIOSH_REL' as const, value: parseFloat(nioshRel) || null, unit: pelUnits, averaging_period: '10-hr TWA' }] : []),
          ],
        },
        physical_data: {
          physical_state: physicalState,
          boiling_point: boilingPoint ? { property_name: 'boiling_point', value: parseFloat(boilingPoint) || boilingPoint, unit: '°C' } : null,
          flash_point: flashPoint ? { property_name: 'flash_point', value: parseFloat(flashPoint) || flashPoint, unit: '°C' } : null,
          vapor_pressure: vaporPressure ? { property_name: 'vapor_pressure', value: parseFloat(vaporPressure) || vaporPressure, unit: 'psia' } : null,
          specific_gravity: specificGravity ? { property_name: 'specific_gravity', value: parseFloat(specificGravity) || specificGravity, unit: null } : null,
        },
        reactivity_data: {
          incompatible_materials: incompatibleMaterials ? incompatibleMaterials.split(',').map((s) => s.trim()) : [],
        },
        corrosivity_data: {
          ph: ph ? parseFloat(ph) || null : null,
        },
        thermal_and_chemical_stability_data: {
          decomposition_temperature: decompositionTemp ? { property_name: 'decomposition_temperature', value: parseFloat(decompositionTemp) || decompositionTemp, unit: '°C' } : null,
        },
      };

      // Merge PEL structured values into summary text if not explicitly written
      const effectivePsi = { ...psiValues };
      if (!effectivePsi.permissible_exposure_limits.value && (oshaPel || acgihTlv || nioshRel)) {
        const parts: string[] = [];
        if (oshaPel) parts.push(`OSHA PEL: ${oshaPel} ${pelUnits} (8-hr TWA)`);
        if (acgihTlv) parts.push(`ACGIH TLV: ${acgihTlv} ${pelUnits} (8-hr TWA)`);
        if (nioshRel) parts.push(`NIOSH REL: ${nioshRel} ${pelUnits} (10-hr TWA)`);
        effectivePsi.permissible_exposure_limits.value = parts.join('; ');
      }

      // Merge physical data
      if (!effectivePsi.physical_data.value && (boilingPoint || flashPoint || vaporPressure || specificGravity)) {
        const parts: string[] = [];
        if (boilingPoint) parts.push(`BP: ${boilingPoint} °C`);
        if (flashPoint) parts.push(`Flash Pt: ${flashPoint} °C`);
        if (vaporPressure) parts.push(`VP: ${vaporPressure} psia`);
        if (specificGravity) parts.push(`SG: ${specificGravity}`);
        effectivePsi.physical_data.value = parts.join('; ');
      }

      const psiParamsPayload: any = {};
      for (const [k, v] of Object.entries(effectivePsi)) {
        if (v.value && v.value.trim()) {
          psiParamsPayload[k] = {
            value: v.value.trim(),
            units: v.units || null,
            notes: v.notes || undefined,
            review_status: 'needs_review',
            verification_status: 'unverified',
            source_document: v.sourceDoc || 'Manual Entry',
            source_page: v.sourcePage ? parseInt(v.sourcePage, 10) : null,
            source_section: v.sourceSection || null,
          };
        } else {
          // Explicit null/missing parameter
          psiParamsPayload[k] = {
            value: null,
            units: null,
            review_status: 'missing',
            verification_status: 'unverified',
          };
        }
      }

      const payload = {
        project_id: projectId,
        chemical_name: name.trim(),
        cas_number: casNumber.trim() || null,
        synonyms: synonyms ? synonyms.split(',').map((s) => s.trim()).filter(Boolean) : [],
        molecular_formula: formula.trim() || null,
        molecular_weight: molecularWeight ? { value: parseFloat(molecularWeight) || null, unit: mwUnit } : null,
        physical_state: physicalState || null,
        composition_type: compositionType || 'pure_substance',
        concentration: concentration.trim() || null,
        description: description.trim() || null,
        manufacturer: manufacturer.trim() || null,
        sds_revision_date: revisionDate.trim() || null,
        record_status: isDraft ? ('draft' as ChemicalRecordStatus) : ('active' as ChemicalRecordStatus),
        psi_parameters: psiParamsPayload,
        structured_psi: structuredPsi,
        reviewer: 'Process Safety Engineer',
        change_reason: initialChemical ? 'Manual chemical specification update' : 'Initial manual chemical creation',
      };

      await onSave(payload, isDraft);
      setHasUnsavedChanges(false);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save chemical record.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs = [
    { id: 0, label: 'Identity', icon: FlaskConical },
    { id: 1, label: 'A. Toxicity', icon: ShieldAlert, key: 'toxicity' },
    { id: 2, label: 'B. Exposure Limits', icon: Info, key: 'permissible_exposure_limits' },
    { id: 3, label: 'C. Physical Data', icon: Droplet, key: 'physical_data' },
    { id: 4, label: 'D. Reactivity', icon: Flame, key: 'reactivity_data' },
    { id: 5, label: 'E. Corrosivity', icon: Layers, key: 'corrosivity_data' },
    { id: 6, label: 'F. Stability', icon: Thermometer, key: 'thermal_and_chemical_stability_data' },
    { id: 7, label: 'G. Mixing Hazards', icon: AlertTriangle, key: 'inadvertent_mixing_hazards' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                {initialChemical ? 'Edit Chemical Record & PSI' : 'Add Chemical Manually'}
                <span className="text-[11px] font-normal text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  Unverified Manual Entry
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                OSHA 29 CFR 1910.119(d)(1) Process Safety Information Entry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSave(true)}
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <FileEdit className="w-3.5 h-3.5 text-slate-400" />
              Save Draft
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 shadow-md shadow-cyan-900/20 transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Chemical
            </button>
            <button
              onClick={() => {
                if (hasUnsavedChanges) {
                  if (window.confirm('You have unsaved changes. Are you sure you want to discard them?')) {
                    onClose();
                  }
                } else {
                  onClose();
                }
              }}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Duplicate Warning Banner */}
        {duplicateMatches.length > 0 && (
          <div className="bg-amber-950/40 border-b border-amber-500/30 px-6 py-2.5 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Potential Duplicate Chemical Detected: </span>
              {duplicateMatches.map((m, idx) => (
                <span key={idx} className="mr-2">
                  {m.match_reason} (ID: {m.chemical.id}).
                </span>
              ))}
              <span className="text-amber-400/80 block mt-0.5">
                SafeFlow will not silently merge records. You may save if this represents a distinct grade, concentration, or vendor specification.
              </span>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMsg && (
          <div className="bg-rose-950/40 border-b border-rose-500/30 px-6 py-2.5 flex items-center gap-2 text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 overflow-x-auto gap-1 text-xs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const hasData = tab.key ? Boolean(psiValues[tab.key]?.value) : Boolean(name);
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-3 border-b-2 font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-cyan-500 text-cyan-300 bg-slate-900/60'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/30'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${activeTab === tab.id ? 'text-cyan-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {hasData && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
              </button>
            );
          })}
        </div>

        {/* Form Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-200">
          {/* TAB 0: CHEMICAL IDENTITY */}
          {activeTab === 0 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-cyan-400" />
                  Primary Chemical Identification
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Chemical Name */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium flex items-center justify-between">
                      <span>Chemical / Substance Name <span className="text-rose-400">*</span></span>
                      <span className="text-[10px] text-slate-400">Required</span>
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. Anhydrous Ammonia, Sodium Hypochlorite"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* CAS Registry Number */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium flex items-center justify-between">
                      <span>CAS Registry Number</span>
                      <span className="text-[10px] text-slate-400">Format: XXXXX-XX-X</span>
                    </label>
                    <input
                      type="text"
                      value={casNumber}
                      onChange={(e) => {
                        setCasNumber(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. 7664-41-7"
                      className={`w-full bg-slate-900 border rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 ${
                        casNumber && !validateCas(casNumber) ? 'border-amber-500' : 'border-slate-700'
                      }`}
                    />
                  </div>

                  {/* Classification */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Composition Classification</label>
                    <select
                      value={compositionType}
                      onChange={(e) => {
                        setCompositionType(e.target.value as CompositionType);
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value="pure_substance">Pure Substance (100% / Ref. Grade)</option>
                      <option value="solution">Aqueous Solution / Mixture in Solvent</option>
                      <option value="mixture">Chemical Mixture / Multi-component Blend</option>
                    </select>
                  </div>

                  {/* Concentration */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Concentration / Grade</label>
                    <input
                      type="text"
                      value={concentration}
                      onChange={(e) => {
                        setConcentration(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. 12.5% active Cl, 99.5% anhydrous"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Synonyms */}
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-slate-300 font-medium">Synonyms / Alternative Trade Names</label>
                    <input
                      type="text"
                      value={synonyms}
                      onChange={(e) => {
                        setSynonyms(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. Bleach, Liquid Chlorine, Spirit of Hartshorn (comma-separated)"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>

                  {/* Formula & Molecular Weight */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Molecular Formula</label>
                    <input
                      type="text"
                      value={formula}
                      onChange={(e) => {
                        setFormula(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. NH3, NaOCl"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Molecular Weight</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        value={molecularWeight}
                        onChange={(e) => {
                          setMolecularWeight(e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        placeholder="e.g. 17.03"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                      />
                      <select
                        value={mwUnit}
                        onChange={(e) => setMwUnit(e.target.value)}
                        className="bg-slate-900 border border-slate-700 rounded-lg px-2 text-slate-300"
                      >
                        <option value="g/mol">g/mol</option>
                        <option value="kg/kmol">kg/kmol</option>
                      </select>
                    </div>
                  </div>

                  {/* Physical State */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Physical State (Ambient)</label>
                    <select
                      value={physicalState}
                      onChange={(e) => {
                        setPhysicalState(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    >
                      <option value="gas">Compressed / Liquefied Gas</option>
                      <option value="liquid">Liquid</option>
                      <option value="aqueous_solution">Aqueous Solution</option>
                      <option value="solid">Solid / Powder / Granular</option>
                      <option value="slurry">Slurry / Suspension</option>
                    </select>
                  </div>

                  {/* Manufacturer / Vendor */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Manufacturer / Vendor</label>
                    <input
                      type="text"
                      value={manufacturer}
                      onChange={(e) => {
                        setManufacturer(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. Apex Industrial Chemicals LLC"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Process Description & Notes</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => {
                      setDescription(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="Document process usage, inventory thresholds, or regulatory remarks..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 1: TOXICITY */}
          {activeTab === 1 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    OSHA 1910.119(d)(1)(i) — Toxicity Information
                  </h3>
                  <span className="text-[10px] text-slate-400">OSHA PSM Parameter 1</span>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Toxicity Summary Statement</label>
                  <textarea
                    rows={3}
                    value={psiValues.toxicity.value}
                    onChange={(e) => handlePsiChange('toxicity', 'value', e.target.value)}
                    placeholder="e.g. Inhalation LC50 rat 2000 ppm/4h; corrosive to mucous membranes; causes severe lung damage and pulmonary edema."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono text-xs"
                  />
                </div>

                {/* Source Provenance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Source Document Reference</label>
                    <input
                      type="text"
                      value={psiValues.toxicity.sourceDoc}
                      onChange={(e) => handlePsiChange('toxicity', 'sourceDoc', e.target.value)}
                      placeholder="e.g. Vendor SDS / NIOSH Pocket Guide"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Section</label>
                    <input
                      type="text"
                      value={psiValues.toxicity.sourceSection}
                      onChange={(e) => handlePsiChange('toxicity', 'sourceSection', e.target.value)}
                      placeholder="e.g. Section 11"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Page Number</label>
                    <input
                      type="number"
                      value={psiValues.toxicity.sourcePage}
                      onChange={(e) => handlePsiChange('toxicity', 'sourcePage', e.target.value)}
                      placeholder="e.g. 5"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: EXPOSURE LIMITS */}
          {activeTab === 2 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Info className="w-4 h-4 text-cyan-400" />
                    OSHA 1910.119(d)(1)(ii) — Permissible Exposure Limits (PEL / TLV / REL)
                  </h3>
                  <span className="text-[10px] text-slate-400">OSHA PSM Parameter 2</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">OSHA PEL (8-hr TWA)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={oshaPel}
                        onChange={(e) => {
                          setOshaPel(e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        placeholder="e.g. 50"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                      />
                      <span className="bg-slate-800 border border-slate-700 px-2 py-2 rounded-lg text-slate-400 text-xs">
                        {pelUnits}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">ACGIH TLV (8-hr TWA / STEL)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={acgihTlv}
                        onChange={(e) => {
                          setAcgihTlv(e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        placeholder="e.g. 25"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                      />
                      <span className="bg-slate-800 border border-slate-700 px-2 py-2 rounded-lg text-slate-400 text-xs">
                        {pelUnits}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">NIOSH REL (10-hr TWA)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={nioshRel}
                        onChange={(e) => {
                          setNioshRel(e.target.value);
                          setHasUnsavedChanges(true);
                        }}
                        placeholder="e.g. 25"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                      />
                      <span className="bg-slate-800 border border-slate-700 px-2 py-2 rounded-lg text-slate-400 text-xs">
                        {pelUnits}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Summary Statement or Full Text</label>
                  <textarea
                    rows={2}
                    value={psiValues.permissible_exposure_limits.value}
                    onChange={(e) => handlePsiChange('permissible_exposure_limits', 'value', e.target.value)}
                    placeholder="e.g. OSHA PEL: 50 ppm (35 mg/m3) 8-hr TWA; ACGIH TLV: 25 ppm TWA, 35 ppm STEL"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono text-xs"
                  />
                </div>

                {/* Source Provenance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Source Document</label>
                    <input
                      type="text"
                      value={psiValues.permissible_exposure_limits.sourceDoc}
                      onChange={(e) => handlePsiChange('permissible_exposure_limits', 'sourceDoc', e.target.value)}
                      placeholder="e.g. OSHA Table Z-1 / ACGIH"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Section</label>
                    <input
                      type="text"
                      value={psiValues.permissible_exposure_limits.sourceSection}
                      onChange={(e) => handlePsiChange('permissible_exposure_limits', 'sourceSection', e.target.value)}
                      placeholder="e.g. Section 8"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Page Number</label>
                    <input
                      type="number"
                      value={psiValues.permissible_exposure_limits.sourcePage}
                      onChange={(e) => handlePsiChange('permissible_exposure_limits', 'sourcePage', e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: PHYSICAL DATA */}
          {activeTab === 3 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Droplet className="w-4 h-4 text-blue-400" />
                    OSHA 1910.119(d)(1)(iii) — Physical Data
                  </h3>
                  <span className="text-[10px] text-slate-400">OSHA PSM Parameter 3</span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Boiling Point (°C)</label>
                    <input
                      type="text"
                      value={boilingPoint}
                      onChange={(e) => {
                        setBoilingPoint(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. -33.34"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Flash Point (°C)</label>
                    <input
                      type="text"
                      value={flashPoint}
                      onChange={(e) => {
                        setFlashPoint(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. N/A"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Vapor Pressure (psia)</label>
                    <input
                      type="text"
                      value={vaporPressure}
                      onChange={(e) => {
                        setVaporPressure(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. 128.8 @ 70°F"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Specific Gravity</label>
                    <input
                      type="text"
                      value={specificGravity}
                      onChange={(e) => {
                        setSpecificGravity(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. 0.68 @ -33°C"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Physical Data Summary Statement</label>
                  <textarea
                    rows={2}
                    value={psiValues.physical_data.value}
                    onChange={(e) => handlePsiChange('physical_data', 'value', e.target.value)}
                    placeholder="e.g. Boiling point -33.34 °C; vapor density 0.6 (air=1); vapor pressure 128.8 psia at 21.1 °C; pungent suffocating odor."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono text-xs"
                  />
                </div>

                {/* Source Provenance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Source Document</label>
                    <input
                      type="text"
                      value={psiValues.physical_data.sourceDoc}
                      onChange={(e) => handlePsiChange('physical_data', 'sourceDoc', e.target.value)}
                      placeholder="e.g. Engineering Handbook / SDS"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Section</label>
                    <input
                      type="text"
                      value={psiValues.physical_data.sourceSection}
                      onChange={(e) => handlePsiChange('physical_data', 'sourceSection', e.target.value)}
                      placeholder="e.g. Section 9"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Page Number</label>
                    <input
                      type="number"
                      value={psiValues.physical_data.sourcePage}
                      onChange={(e) => handlePsiChange('physical_data', 'sourcePage', e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: REACTIVITY */}
          {activeTab === 4 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Flame className="w-4 h-4 text-amber-400" />
                    OSHA 1910.119(d)(1)(iv) — Reactivity Data
                  </h3>
                  <span className="text-[10px] text-slate-400">OSHA PSM Parameter 4</span>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Reactivity Hazards Statement</label>
                  <textarea
                    rows={3}
                    value={psiValues.reactivity_data.value}
                    onChange={(e) => handlePsiChange('reactivity_data', 'value', e.target.value)}
                    placeholder="e.g. Reacts vigorously with strong oxidizing agents and acids; may form explosive compounds with halogens, mercury, and gold."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Incompatible Reactive Substances (comma-separated)</label>
                  <input
                    type="text"
                    value={incompatibleMaterials}
                    onChange={(e) => {
                      setIncompatibleMaterials(e.target.value);
                      setHasUnsavedChanges(true);
                    }}
                    placeholder="e.g. Bleach, Chlorine, Hypochlorites, Strong Mineral Acids"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100"
                  />
                </div>

                {/* Source Provenance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Source Document</label>
                    <input
                      type="text"
                      value={psiValues.reactivity_data.sourceDoc}
                      onChange={(e) => handlePsiChange('reactivity_data', 'sourceDoc', e.target.value)}
                      placeholder="e.g. Bretherick's Handbook / SDS"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Section</label>
                    <input
                      type="text"
                      value={psiValues.reactivity_data.sourceSection}
                      onChange={(e) => handlePsiChange('reactivity_data', 'sourceSection', e.target.value)}
                      placeholder="e.g. Section 10"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Page Number</label>
                    <input
                      type="number"
                      value={psiValues.reactivity_data.sourcePage}
                      onChange={(e) => handlePsiChange('reactivity_data', 'sourcePage', e.target.value)}
                      placeholder="e.g. 6"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CORROSIVITY */}
          {activeTab === 5 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    OSHA 1910.119(d)(1)(v) — Corrosivity Data
                  </h3>
                  <span className="text-[10px] text-slate-400">OSHA PSM Parameter 5</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Solution pH</label>
                    <input
                      type="number"
                      step="0.1"
                      value={ph}
                      onChange={(e) => {
                        setPh(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. 11.6"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Corrosivity Statement & Affected Metallurgy</label>
                  <textarea
                    rows={3}
                    value={psiValues.corrosivity_data.value}
                    onChange={(e) => handlePsiChange('corrosivity_data', 'value', e.target.value)}
                    placeholder="e.g. Corrosive to copper, brass, bronze, zinc, and galvanized alloys; compatible with carbon steel, stainless steel 304/316, and polyethylene."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono text-xs"
                  />
                </div>

                {/* Source Provenance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Source Document</label>
                    <input
                      type="text"
                      value={psiValues.corrosivity_data.sourceDoc}
                      onChange={(e) => handlePsiChange('corrosivity_data', 'sourceDoc', e.target.value)}
                      placeholder="e.g. NACE MR0175 / Corrosion Guide"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Section</label>
                    <input
                      type="text"
                      value={psiValues.corrosivity_data.sourceSection}
                      onChange={(e) => handlePsiChange('corrosivity_data', 'sourceSection', e.target.value)}
                      placeholder="e.g. Section 10"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Page Number</label>
                    <input
                      type="number"
                      value={psiValues.corrosivity_data.sourcePage}
                      onChange={(e) => handlePsiChange('corrosivity_data', 'sourcePage', e.target.value)}
                      placeholder="e.g. 5"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: STABILITY */}
          {activeTab === 6 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <Thermometer className="w-4 h-4 text-purple-400" />
                    OSHA 1910.119(d)(1)(vi) — Thermal & Chemical Stability Data
                  </h3>
                  <span className="text-[10px] text-slate-400">OSHA PSM Parameter 6</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-medium">Decomposition Temp (°C)</label>
                    <input
                      type="text"
                      value={decompositionTemp}
                      onChange={(e) => {
                        setDecompositionTemp(e.target.value);
                        setHasUnsavedChanges(true);
                      }}
                      placeholder="e.g. > 450 °C"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-slate-100 font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Thermal & Chemical Stability Statement</label>
                  <textarea
                    rows={3}
                    value={psiValues.thermal_and_chemical_stability_data.value}
                    onChange={(e) => handlePsiChange('thermal_and_chemical_stability_data', 'value', e.target.value)}
                    placeholder="e.g. Stable under normal storage conditions; decomposes above 450 °C into hydrogen and nitrogen gases; exothermic decomposition accelerated by catalysts."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono text-xs"
                  />
                </div>

                {/* Source Provenance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Source Document</label>
                    <input
                      type="text"
                      value={psiValues.thermal_and_chemical_stability_data.sourceDoc}
                      onChange={(e) => handlePsiChange('thermal_and_chemical_stability_data', 'sourceDoc', e.target.value)}
                      placeholder="e.g. Process Datasheet / SDS"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Section</label>
                    <input
                      type="text"
                      value={psiValues.thermal_and_chemical_stability_data.sourceSection}
                      onChange={(e) => handlePsiChange('thermal_and_chemical_stability_data', 'sourceSection', e.target.value)}
                      placeholder="e.g. Section 10"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Page Number</label>
                    <input
                      type="number"
                      value={psiValues.thermal_and_chemical_stability_data.sourcePage}
                      onChange={(e) => handlePsiChange('thermal_and_chemical_stability_data', 'sourcePage', e.target.value)}
                      placeholder="e.g. 6"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: INADVERTENT MIXING */}
          {activeTab === 7 && (
            <div className="space-y-4 max-w-3xl mx-auto">
              <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-500" />
                    OSHA 1910.119(d)(1)(vii) — Inadvertent Mixing Hazards
                  </h3>
                  <span className="text-[10px] text-slate-400">OSHA PSM Parameter 7</span>
                </div>

                <div className="space-y-1">
                  <label className="text-slate-300 font-medium">Inadvertent Mixing Consequences & Hazards</label>
                  <textarea
                    rows={4}
                    value={psiValues.inadvertent_mixing_hazards.value}
                    onChange={(e) => handlePsiChange('inadvertent_mixing_hazards', 'value', e.target.value)}
                    placeholder="e.g. Inadvertent mixing with sodium hypochlorite (bleach) produces deadly toxic chloramine and nitrogen trichloride gases; mixing with acids releases violent exothermic neutralization and pressure generation."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono text-xs"
                  />
                </div>

                {/* Source Provenance */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <label className="text-slate-400 block mb-1">Source Document</label>
                    <input
                      type="text"
                      value={psiValues.inadvertent_mixing_hazards.sourceDoc}
                      onChange={(e) => handlePsiChange('inadvertent_mixing_hazards', 'sourceDoc', e.target.value)}
                      placeholder="e.g. CCPS Chemical Reactivity Worksheet"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Section</label>
                    <input
                      type="text"
                      value={psiValues.inadvertent_mixing_hazards.sourceSection}
                      onChange={(e) => handlePsiChange('inadvertent_mixing_hazards', 'sourceSection', e.target.value)}
                      placeholder="e.g. Section 10"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Page Number</label>
                    <input
                      type="number"
                      value={psiValues.inadvertent_mixing_hazards.sourcePage}
                      onChange={(e) => handlePsiChange('inadvertent_mixing_hazards', 'sourcePage', e.target.value)}
                      placeholder="e.g. 7"
                      className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/60 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Missing parameters will remain explicitly absent (null), never filled with zero or assumed defaults.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (hasUnsavedChanges) {
                  if (window.confirm('You have unsaved changes. Are you sure you want to discard them?')) {
                    onClose();
                  }
                } else {
                  onClose();
                }
              }}
              className="px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors disabled:opacity-50"
            >
              <FileEdit className="w-3.5 h-3.5 text-slate-400" />
              Save Draft
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={isSubmitting || !name.trim()}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-semibold text-white bg-cyan-600 hover:bg-cyan-500 shadow-md shadow-cyan-900/20 transition-all disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              Save Chemical
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
