import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  ProcessProject,
  DocumentRecord,
  ChemicalRecord,
  EquipmentTag,
  EquipmentType,
  PipingLine,
  ChemicalConflict,
  ProjectDashboardSummary,
  PsiFieldRecord,
  PsiParameters,
  AuditTrailEntry,
  GraphApprovalRecord,
  GraphValidationResult,
  PhaStudyNode,
  HazopReadinessResult,
  PhaWorkflowStage,
  DigitalPidDrawing,
  DrawingElement,
  DrawingConnector,
  TopologyGraph,
  EquipmentSpecifications,
  SpecProperty,
  SpecHistoryEntry,
  SpecConflictEntry,
  createDefaultSpecifications,
  createEmptySpecProperty,
  CreateManualChemicalInput,
  UpdateChemicalInput,
  ChemicalDuplicateMatch,
  ChemicalAuditEntry,
  createEmptyPsiFieldRecord,
  createEmptyPsiParameters,
  ProcessStream,
  CreateStreamInput,
  createEmptyProcessStream,
  CommonDrawingModel,
  ConnectionCandidate,
  ProcessDescriptionExtraction,
} from '../types';
import { detectConflictsForProject } from '../services/conflictDetector';
import { validateProcessGraph } from '../services/graphValidationService';
import { buildProcessTopologyGraph } from '../services/graphService';
import {
  generateCandidatePhaNodes,
  checkHazopReadiness,
  evaluateNodeSpecifications,
  attachStreamContextToNode,
} from '../services/phaService';
import { validateDigitalDrawing } from '../services/drawingValidationService';

interface DatabaseSchema {
  projects: ProcessProject[];
  documents: DocumentRecord[];
  chemicals: ChemicalRecord[];
  equipment: EquipmentTag[];
  lines: PipingLine[];
  streams: ProcessStream[];
  conflicts: ChemicalConflict[];
  audit_log: AuditTrailEntry[];
  graph_approvals: Record<string, GraphApprovalRecord>;
  pha_nodes: PhaStudyNode[];
  acknowledged_warnings: Record<string, string[]>;
  drawings: DigitalPidDrawing[];
  drawing_acknowledged_warnings: Record<string, string[]>;
  process_descriptions: ProcessDescriptionExtraction[];
  common_drawings: CommonDrawingModel[];
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'psi_db.json');
const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

export class PsiDataStore {
  private data: DatabaseSchema = {
    projects: [],
    documents: [],
    chemicals: [],
    equipment: [],
    lines: [],
    streams: [],
    conflicts: [],
    audit_log: [],
    graph_approvals: {},
    pha_nodes: [],
    acknowledged_warnings: {},
    drawings: [],
    drawing_acknowledged_warnings: {},
    process_descriptions: [],
    common_drawings: [],
  };

  constructor() {
    this.initDirectories();
    this.loadDatabase();
    if (this.data.projects.length === 0) {
      this.seedSampleProject();
    }
  }

  private initDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  private loadDatabase() {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        this.data = {
          projects: parsed.projects || [],
          documents: parsed.documents || [],
          chemicals: parsed.chemicals || [],
          equipment: parsed.equipment || [],
          lines: parsed.lines || [],
          streams: parsed.streams || [],
          conflicts: parsed.conflicts || [],
          audit_log: parsed.audit_log || [],
          graph_approvals: parsed.graph_approvals || {},
          pha_nodes: parsed.pha_nodes || [],
          acknowledged_warnings: parsed.acknowledged_warnings || {},
          drawings: parsed.drawings || [],
          drawing_acknowledged_warnings: parsed.drawing_acknowledged_warnings || {},
          process_descriptions: parsed.process_descriptions || [],
          common_drawings: parsed.common_drawings || [],
        };
        // Ensure sample streams are seeded if this is the sample project and streams are empty
        if (this.data.streams.length === 0 && this.data.projects.some((p) => p.id === 'proj-sample-ammonia-demo')) {
          this.seedSampleStreams('proj-sample-ammonia-demo');
        }
        // Ensure every equipment item has specifications data structure
        for (const eq of this.data.equipment) {
          if (!eq.specifications) {
            eq.specifications = createDefaultSpecifications(eq.equipment_type);
          }
          if (eq.tag.toUpperCase() === 'V-101') {
            // Ensure V-101 illustrative initial values as specified
            if (
              !eq.specifications.material_of_construction.value ||
              eq.specifications.material_of_construction.status === 'not_provided'
            ) {
              eq.specifications.material_of_construction = {
                value: 'Unknown',
                unit: null,
                status: 'not_provided',
                verification_status: 'unverified',
                source_document_name: 'Not provided',
                conflicting_records: [],
                change_history: [],
              };
            }
            if (
              eq.specifications.design_pressure.value === null ||
              eq.specifications.design_pressure.status === 'not_provided'
            ) {
              eq.specifications.design_pressure = {
                value: null,
                unit: 'psig',
                status: 'not_provided',
                verification_status: 'unverified',
                source_document_name: 'Not provided',
                conflicting_records: [],
                change_history: [],
              };
            }
            if (
              eq.specifications.design_temperature.value === null ||
              eq.specifications.design_temperature.status === 'not_provided'
            ) {
              eq.specifications.design_temperature = {
                value: null,
                unit: '°F',
                status: 'not_provided',
                verification_status: 'unverified',
                source_document_name: 'Not provided',
                conflicting_records: [],
                change_history: [],
              };
            }
            if (
              eq.specifications.capacity.value === null ||
              eq.specifications.capacity.status === 'not_provided'
            ) {
              eq.specifications.capacity = {
                value: null,
                unit: 'gallons',
                capacity_type: 'total_volume',
                status: 'not_provided',
                verification_status: 'unverified',
                source_document_name: 'Not provided',
                conflicting_records: [],
                change_history: [],
              };
            }
          }
        }

        // Ensure every PHA node has specification evaluation
        for (const node of this.data.pha_nodes) {
          const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(
            node,
            this.data.equipment
          );
          if (!node.missing_specifications) node.missing_specifications = missing_specifications;
          if (!node.applicable_deviations) node.applicable_deviations = applicable_deviations;
        }
      } catch (err) {
        console.error('Failed to read db file, initializing empty store:', err);
      }
    }
  }

  private saveDatabase() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save db file:', err);
    }
  }

  // --- AUDIT TRAIL ---
  public logAudit(entry: Omit<AuditTrailEntry, 'id' | 'timestamp'>): AuditTrailEntry {
    const fullEntry: AuditTrailEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...entry,
    };
    this.data.audit_log.unshift(fullEntry);
    this.saveDatabase();
    return fullEntry;
  }

  public listAuditLog(projectId: string): AuditTrailEntry[] {
    return this.data.audit_log.filter((a) => a.project_id === projectId);
  }

  // --- PROJECTS ---
  public listProjects(): ProcessProject[] {
    return this.data.projects;
  }

  public getProject(id: string): ProcessProject | undefined {
    return this.data.projects.find((p) => p.id === id);
  }

  public createProject(name: string, description: string): ProcessProject {
    const newProj: ProcessProject = {
      id: uuidv4(),
      name,
      description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_sample: false,
    };
    this.data.projects.push(newProj);
    this.saveDatabase();
    return newProj;
  }

  public deleteProject(id: string): boolean {
    const idx = this.data.projects.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.data.projects.splice(idx, 1);
    this.data.documents = this.data.documents.filter((d) => d.project_id !== id);
    this.data.chemicals = this.data.chemicals.filter((c) => c.project_id !== id);
    this.data.equipment = this.data.equipment.filter((e) => e.project_id !== id);
    this.data.lines = this.data.lines.filter((l) => l.project_id !== id);
    this.data.streams = this.data.streams.filter((s) => s.project_id !== id);
    this.data.conflicts = this.data.conflicts.filter((c) => c.project_id !== id);
    this.data.pha_nodes = this.data.pha_nodes.filter((n) => n.project_id !== id);
    delete this.data.graph_approvals[id];
    delete this.data.acknowledged_warnings[id];
    this.saveDatabase();
    return true;
  }

  // --- DOCUMENTS ---
  public listDocuments(projectId: string): DocumentRecord[] {
    return this.data.documents.filter((d) => d.project_id === projectId);
  }

  public getDocument(id: string): DocumentRecord | undefined {
    return this.data.documents.find((d) => d.id === id);
  }

  public addDocument(doc: DocumentRecord): void {
    this.data.documents.push(doc);
    this.saveDatabase();
  }

  public deleteDocument(id: string): { success: boolean; projectId?: string } {
    const docIdx = this.data.documents.findIndex((d) => d.id === id);
    if (docIdx === -1) return { success: false };

    const doc = this.data.documents[docIdx];
    const projectId = doc.project_id;

    if (doc.file_path) {
      try {
        const diskPath = path.resolve(UPLOADS_DIR, path.basename(doc.file_path));
        if (fs.existsSync(diskPath)) {
          fs.unlinkSync(diskPath);
        }
      } catch (err) {
        console.warn(`Could not delete file ${doc.file_path} from disk:`, err);
      }
    }

    this.data.documents.splice(docIdx, 1);

    const deletedChemIds = new Set(doc.chemical_ids || []);
    this.data.chemicals = this.data.chemicals.filter((c) => {
      // Preserve manual chemical records if an attached SDS document is removed
      if (c.origin === 'manual_entry' || c.origin === 'hybrid') {
        if (c.sds_document_id === id) {
          c.sds_document_id = '';
          c.origin = 'manual_entry';
        }
        return true;
      }
      return c.sds_document_id !== id && !deletedChemIds.has(c.id);
    });

    this.data.equipment = this.data.equipment.filter((e) => e.document_id !== id);
    this.data.lines = this.data.lines.filter((l) => l.document_id !== id);

    const remainingChems = this.listChemicals(projectId);
    const updatedConflicts = detectConflictsForProject(remainingChems, projectId, []);
    this.data.conflicts = [
      ...this.data.conflicts.filter((c) => c.project_id !== projectId),
      ...updatedConflicts,
    ];

    this.saveDatabase();
    return { success: true, projectId };
  }

  // --- CHEMICALS ---
  public listChemicals(projectId: string): ChemicalRecord[] {
    return this.data.chemicals.filter((c) => c.project_id === projectId);
  }

  public getChemical(id: string): ChemicalRecord | undefined {
    return this.data.chemicals.find((c) => c.id === id);
  }

  public addChemical(chem: ChemicalRecord): void {
    const existingIdx = this.data.chemicals.findIndex((c) => c.id === chem.id);
    if (existingIdx >= 0) {
      const existing = this.data.chemicals[existingIdx];
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
        const existField = existing.psi_parameters[k];
        const newField = chem.psi_parameters[k];

        // If user already confirmed or provided manual value, preserve user_value and verification status
        if (
          existField.user_value !== null ||
          existField.verification_status === 'verified' ||
          existField.review_status === 'confirmed'
        ) {
          newField.user_value = existField.user_value;
          newField.review_status = existField.review_status;
          newField.verification_status = existField.verification_status;
          newField.verified_by = existField.verified_by;
          newField.verified_at = existField.verified_at;
          newField.notes = existField.notes || newField.notes;
          newField.value = existField.user_value;
        } else if (newField.category_status === 'not_found' && existField.category_status === 'extracted') {
          // Do not let a partial/empty re-extraction wipe out a previously valid extraction
          chem.psi_parameters[k] = existField;
        }
      }

      // Preserve origin and audit history
      if (existing.origin === 'manual_entry') {
        chem.origin = 'hybrid';
      } else if (existing.origin) {
        chem.origin = existing.origin;
      }
      chem.audit_history = [
        ...(existing.audit_history || []),
        {
          timestamp: new Date().toISOString(),
          author: 'SafeFlow SDS Extractor',
          action: 'sds_linked',
          change_summary: `Linked SDS extraction without overwriting manual/verified values`,
        },
      ];

      this.data.chemicals[existingIdx] = chem;
    } else {
      this.data.chemicals.push(chem);
    }
    const projectChems = this.listChemicals(chem.project_id);
    const existingConflicts = this.data.conflicts.filter((c) => c.project_id === chem.project_id);
    const updatedConflicts = detectConflictsForProject(projectChems, chem.project_id, existingConflicts);

    this.data.conflicts = [
      ...this.data.conflicts.filter((c) => c.project_id !== chem.project_id),
      ...updatedConflicts,
    ];
    this.saveDatabase();
  }

  public checkDuplicateChemical(
    projectId: string,
    name: string,
    casNumber?: string | null,
    excludeId?: string
  ): { is_potential_duplicate: boolean; matches: ChemicalDuplicateMatch[] } {
    const normName = (name || '').trim().toLowerCase();
    const normCas = (casNumber || '').trim();
    const matches: ChemicalDuplicateMatch[] = [];

    const existingChems = this.listChemicals(projectId);
    for (const chem of existingChems) {
      if (excludeId && chem.id === excludeId) continue;

      // 1. Exact CAS match
      const chemCas = (chem.cas_number?.value || chem.cas_number?.user_value || '').trim();
      if (normCas && chemCas && normCas === chemCas) {
        matches.push({
          chemical: chem,
          match_type: 'exact_cas',
          match_reason: `Exact CAS Registry Number match (${normCas})`,
        });
        continue;
      }

      // 2. Exact Chemical Name match (case-insensitive)
      const chemName = (chem.chemical_name?.value || chem.chemical_name?.user_value || '').trim().toLowerCase();
      if (normName && chemName && normName === chemName) {
        matches.push({
          chemical: chem,
          match_type: 'exact_name',
          match_reason: `Exact chemical name match ("${chem.chemical_name.value || chem.chemical_name.user_value}")`,
        });
        continue;
      }

      // 3. Similar / substring name match
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

    return {
      is_potential_duplicate: matches.length > 0,
      matches,
    };
  }

  public createManualChemical(
    projectId: string,
    input: CreateManualChemicalInput,
    reviewer = 'Process Safety Engineer'
  ): ChemicalRecord {
    if (!input.chemical_name || !String(input.chemical_name).trim()) {
      throw new Error('chemical_name is required');
    }

    const now = new Date().toISOString();
    const chemId = `chem-${uuidv4()}`;

    const psiKeys: (keyof PsiParameters)[] = [
      'toxicity',
      'permissible_exposure_limits',
      'physical_data',
      'reactivity_data',
      'corrosivity_data',
      'thermal_and_chemical_stability_data',
      'inadvertent_mixing_hazards',
    ];

    const psiParams = createEmptyPsiParameters('manual');

    // Populate provided PSI parameters
    if (input.psi_parameters) {
      for (const k of psiKeys) {
        const pInput = input.psi_parameters[k];
        if (pInput && pInput.value !== undefined && pInput.value !== null && String(pInput.value).trim() !== '') {
          const valStr = String(pInput.value).trim();
          psiParams[k] = {
            value: valStr,
            machine_value: null,
            user_value: valStr,
            source: {
              document: pInput.source_document || 'Manual Entry',
              document_id: 'manual',
              page: pInput.source_page ?? null,
              section: pInput.source_section ?? null,
              snippet: valStr,
            },
            confidence: 1.0,
            review_status: pInput.review_status || 'needs_review',
            entry_method: 'manual',
            verification_status: pInput.verification_status || 'unverified',
            units: pInput.units || null,
            notes: pInput.notes || undefined,
            updated_at: now,
            missing_reason: null,
          };
        }
      }
    }

    const chem: ChemicalRecord = {
      id: chemId,
      project_id: projectId,
      sds_document_id: '',
      origin: 'manual_entry',
      record_status: input.record_status || 'active',
      chemical_name: {
        value: input.chemical_name.trim(),
        machine_value: null,
        user_value: input.chemical_name.trim(),
        source: { document: 'Manual Entry', document_id: 'manual', page: null, section: 'Identity', snippet: input.chemical_name.trim() },
        confidence: 1.0,
        review_status: 'confirmed',
        entry_method: 'manual',
        verification_status: 'unverified',
        updated_at: now,
      },
      cas_number: {
        value: input.cas_number?.trim() || null,
        machine_value: null,
        user_value: input.cas_number?.trim() || null,
        source: { document: 'Manual Entry', document_id: 'manual', page: null, section: 'Identity', snippet: input.cas_number?.trim() || null },
        confidence: input.cas_number ? 1.0 : 0.0,
        review_status: input.cas_number ? 'confirmed' : 'missing',
        entry_method: 'manual',
        verification_status: 'unverified',
        updated_at: now,
        missing_reason: input.cas_number ? null : 'Field not provided',
      },
      sds_revision_date: {
        value: input.sds_revision_date?.trim() || null,
        machine_value: null,
        user_value: input.sds_revision_date?.trim() || null,
        source: { document: 'Manual Entry', document_id: 'manual', page: null, section: 'Identity', snippet: input.sds_revision_date?.trim() || null },
        confidence: input.sds_revision_date ? 1.0 : 0.0,
        review_status: input.sds_revision_date ? 'confirmed' : 'missing',
        entry_method: 'manual',
        verification_status: 'unverified',
        updated_at: now,
        missing_reason: input.sds_revision_date ? null : 'Field not provided',
      },
      manufacturer: {
        value: input.manufacturer?.trim() || null,
        machine_value: null,
        user_value: input.manufacturer?.trim() || null,
        source: { document: 'Manual Entry', document_id: 'manual', page: null, section: 'Identity', snippet: input.manufacturer?.trim() || null },
        confidence: input.manufacturer ? 1.0 : 0.0,
        review_status: input.manufacturer ? 'confirmed' : 'missing',
        entry_method: 'manual',
        verification_status: 'unverified',
        updated_at: now,
        missing_reason: input.manufacturer ? null : 'Field not provided',
      },
      psi_parameters: psiParams,
      synonyms: input.synonyms || [],
      molecular_formula: input.molecular_formula || null,
      molecular_weight: input.molecular_weight || null,
      physical_state: input.physical_state || null,
      composition_type: input.composition_type || 'pure_substance',
      concentration: input.concentration || null,
      description: input.description || null,
      structured_psi: input.structured_psi || {},
      audit_history: [
        {
          timestamp: now,
          author: reviewer,
          action: 'create',
          change_summary: `Manually created chemical record (${input.record_status === 'draft' ? 'Draft' : 'Active'})`,
        },
      ],
      created_at: now,
      updated_at: now,
    };

    this.addChemical(chem);

    this.logAudit({
      project_id: projectId,
      entity_type: 'chemical' as any,
      entity_id: chem.id,
      action: 'create',
      change_reason: `Manually created chemical "${chem.chemical_name.value}"`,
      reviewer,
      revised_value: { name: chem.chemical_name.value, cas: chem.cas_number.value, status: chem.record_status },
    });

    this.saveDatabase();
    return chem;
  }

  public updateChemical(
    chemicalId: string,
    input: UpdateChemicalInput,
    reviewer = 'Process Safety Engineer',
    changeReason = 'Updated chemical record'
  ): ChemicalRecord | undefined {
    const chem = this.getChemical(chemicalId);
    if (!chem) return undefined;

    const now = new Date().toISOString();

    if (input.chemical_name) {
      const val = input.chemical_name.trim();
      chem.chemical_name.value = val;
      chem.chemical_name.user_value = val;
      chem.chemical_name.updated_at = now;
    }

    if (input.cas_number !== undefined) {
      const val = input.cas_number?.trim() || null;
      chem.cas_number.value = val;
      chem.cas_number.user_value = val;
      chem.cas_number.review_status = val ? 'confirmed' : 'missing';
      chem.cas_number.updated_at = now;
      chem.cas_number.missing_reason = val ? null : 'Field not provided';
    }

    if (input.manufacturer !== undefined) {
      const val = input.manufacturer?.trim() || null;
      chem.manufacturer.value = val;
      chem.manufacturer.user_value = val;
      chem.manufacturer.review_status = val ? 'confirmed' : 'missing';
      chem.manufacturer.updated_at = now;
      chem.manufacturer.missing_reason = val ? null : 'Field not provided';
    }

    if (input.sds_revision_date !== undefined) {
      const val = input.sds_revision_date?.trim() || null;
      chem.sds_revision_date.value = val;
      chem.sds_revision_date.user_value = val;
      chem.sds_revision_date.review_status = val ? 'confirmed' : 'missing';
      chem.sds_revision_date.updated_at = now;
      chem.sds_revision_date.missing_reason = val ? null : 'Field not provided';
    }

    if (input.record_status) chem.record_status = input.record_status;
    if (input.synonyms !== undefined) chem.synonyms = input.synonyms;
    if (input.molecular_formula !== undefined) chem.molecular_formula = input.molecular_formula;
    if (input.molecular_weight !== undefined) chem.molecular_weight = input.molecular_weight;
    if (input.physical_state !== undefined) chem.physical_state = input.physical_state;
    if (input.composition_type !== undefined) chem.composition_type = input.composition_type;
    if (input.concentration !== undefined) chem.concentration = input.concentration;
    if (input.description !== undefined) chem.description = input.description;
    if (input.structured_psi !== undefined) chem.structured_psi = { ...chem.structured_psi, ...input.structured_psi };

    const psiKeys: (keyof PsiParameters)[] = [
      'toxicity',
      'permissible_exposure_limits',
      'physical_data',
      'reactivity_data',
      'corrosivity_data',
      'thermal_and_chemical_stability_data',
      'inadvertent_mixing_hazards',
    ];

    if (input.psi_parameters) {
      for (const k of psiKeys) {
        const pInput = input.psi_parameters[k];
        if (pInput !== undefined) {
          const currentParam = chem.psi_parameters[k] || createEmptyPsiFieldRecord(k, 'manual');
          const val = pInput.value !== undefined ? (pInput.value ? String(pInput.value).trim() : null) : currentParam.value;

          chem.psi_parameters[k] = {
            ...currentParam,
            value: val,
            user_value: val,
            source: {
              document: pInput.source_document || currentParam.source?.document || 'Manual Entry',
              document_id: currentParam.source?.document_id || 'manual',
              page: pInput.source_page ?? currentParam.source?.page ?? null,
              section: pInput.source_section ?? currentParam.source?.section ?? null,
              snippet: val || null,
            },
            confidence: 1.0,
            review_status: val ? (pInput.review_status || currentParam.review_status || 'needs_review') : 'missing',
            entry_method: 'manual',
            verification_status: pInput.verification_status || currentParam.verification_status || 'unverified',
            units: pInput.units !== undefined ? pInput.units : currentParam.units,
            notes: pInput.notes !== undefined ? pInput.notes : currentParam.notes,
            updated_at: now,
            missing_reason: val ? null : 'Field not provided',
          };
        }
      }
    }

    if (!chem.audit_history) chem.audit_history = [];
    chem.audit_history.push({
      timestamp: now,
      author: reviewer,
      action: 'update',
      change_summary: changeReason,
    });

    chem.updated_at = now;

    // Upstream change invalidates graph approval
    this.invalidateGraphApproval(chem.project_id, `Chemical ${chem.chemical_name.value} updated`);

    // Detect conflicts
    const projectChems = this.listChemicals(chem.project_id);
    const existingConflicts = this.data.conflicts.filter((c) => c.project_id === chem.project_id);
    const updatedConflicts = detectConflictsForProject(projectChems, chem.project_id, existingConflicts);
    this.data.conflicts = [
      ...this.data.conflicts.filter((c) => c.project_id !== chem.project_id),
      ...updatedConflicts,
    ];

    this.saveDatabase();
    return chem;
  }

  public deleteChemical(chemicalId: string, reviewer = 'Process Safety Engineer', reason = 'Deleted chemical record'): boolean {
    const idx = this.data.chemicals.findIndex((c) => c.id === chemicalId);
    if (idx === -1) return false;

    const chem = this.data.chemicals[idx];
    const projectId = chem.project_id;

    this.data.chemicals.splice(idx, 1);

    // Unassign from any equipment or lines
    for (const eq of this.data.equipment) {
      if (eq.project_id === projectId && eq.assigned_chemical_id === chemicalId) {
        eq.assigned_chemical_id = null;
      }
    }
    for (const line of this.data.lines) {
      if (line.project_id === projectId && line.assigned_chemical_id === chemicalId) {
        line.assigned_chemical_id = null;
      }
    }

    // Remove conflicts
    this.data.conflicts = this.data.conflicts.filter((c) => {
      const involvesThis = c.entries.some((e) => e.chemical_id === chemicalId);
      return !involvesThis;
    });

    this.logAudit({
      project_id: projectId,
      entity_type: 'chemical' as any,
      entity_id: chemicalId,
      action: 'delete',
      change_reason: reason,
      reviewer,
      original_value: { name: chem.chemical_name.value, cas: chem.cas_number.value },
    });

    this.invalidateGraphApproval(projectId, `Chemical ${chem.chemical_name.value} removed`);
    this.saveDatabase();
    return true;
  }

  public linkSdsToChemical(
    chemicalId: string,
    sdsDocumentId: string,
    reviewer = 'Process Safety Engineer'
  ): { success: boolean; chemical?: ChemicalRecord; conflicts_created?: number; error?: string } {
    const chem = this.getChemical(chemicalId);
    if (!chem) return { success: false, error: 'Chemical not found' };

    const doc = this.getDocument(sdsDocumentId);
    if (!doc) return { success: false, error: 'SDS document not found' };

    const now = new Date().toISOString();
    chem.sds_document_id = sdsDocumentId;
    chem.origin = 'hybrid';

    // Find if an extracted chemical already exists for this document within the same project
    const extractedChem = this.data.chemicals.find(
      (c) => c.project_id === chem.project_id && c.sds_document_id === sdsDocumentId && c.id !== chemicalId
    );

    let conflictsCount = 0;
    if (extractedChem) {
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
        const manualField = chem.psi_parameters[k];
        const extractedField = extractedChem.psi_parameters[k];

        // If manual chemical had no value, fill in extracted value without overwriting manual data!
        if ((!manualField.value || manualField.review_status === 'missing') && extractedField.value) {
          chem.psi_parameters[k] = {
            ...extractedField,
            review_status: 'needs_review',
            entry_method: 'machine',
            verification_status: 'unverified',
            updated_at: now,
          };
        } else if (manualField.value && extractedField.value) {
          // Both have values; if they differ, flag conflict!
          const normManual = manualField.value.replace(/\s+/g, ' ').trim().toLowerCase();
          const normExtracted = extractedField.value.replace(/\s+/g, ' ').trim().toLowerCase();
          if (normManual !== normExtracted) {
            conflictsCount++;
          }
        }
      }
    }

    if (!chem.audit_history) chem.audit_history = [];
    chem.audit_history.push({
      timestamp: now,
      author: reviewer,
      action: 'sds_linked',
      change_summary: `Linked SDS document ${doc.name}`,
    });

    const projectChems = this.listChemicals(chem.project_id);
    const existingConflicts = this.data.conflicts.filter((c) => c.project_id === chem.project_id);
    const updatedConflicts = detectConflictsForProject(projectChems, chem.project_id, existingConflicts);
    this.data.conflicts = [
      ...this.data.conflicts.filter((c) => c.project_id !== chem.project_id),
      ...updatedConflicts,
    ];

    this.saveDatabase();
    return { success: true, chemical: chem, conflicts_created: conflictsCount };
  }

  public updatePsiField(
    chemicalId: string,
    fieldKey: string,
    updates: {
      user_value?: string | null;
      review_status: 'needs_review' | 'confirmed' | 'rejected' | 'missing';
      notes?: string;
    }
  ): ChemicalRecord | undefined {
    const chem = this.getChemical(chemicalId);
    if (!chem) return undefined;

    const now = new Date().toISOString();

    if (fieldKey in chem.psi_parameters) {
      const param = chem.psi_parameters[fieldKey as keyof PsiParameters];
      if (updates.user_value !== undefined) {
        param.user_value = updates.user_value;
      }
      param.review_status = updates.review_status;
      if (updates.review_status === 'confirmed') {
        param.verification_status = 'verified';
      } else if (updates.review_status === 'rejected') {
        param.verification_status = 'unverified';
      }
      if (updates.notes !== undefined) {
        param.notes = updates.notes;
      }
      param.updated_at = now;
    } else if (fieldKey === 'chemical_name') {
      if (updates.user_value !== undefined) chem.chemical_name.user_value = updates.user_value;
      chem.chemical_name.review_status = updates.review_status;
      if (updates.notes !== undefined) chem.chemical_name.notes = updates.notes;
      chem.chemical_name.updated_at = now;
    } else if (fieldKey === 'cas_number') {
      if (updates.user_value !== undefined) chem.cas_number.user_value = updates.user_value;
      chem.cas_number.review_status = updates.review_status;
      if (updates.notes !== undefined) chem.cas_number.notes = updates.notes;
      chem.cas_number.updated_at = now;
    } else if (fieldKey === 'sds_revision_date') {
      if (updates.user_value !== undefined) chem.sds_revision_date.user_value = updates.user_value;
      chem.sds_revision_date.review_status = updates.review_status;
      if (updates.notes !== undefined) chem.sds_revision_date.notes = updates.notes;
      chem.sds_revision_date.updated_at = now;
    } else if (fieldKey === 'manufacturer') {
      if (updates.user_value !== undefined) chem.manufacturer.user_value = updates.user_value;
      chem.manufacturer.review_status = updates.review_status;
      if (updates.notes !== undefined) chem.manufacturer.notes = updates.notes;
      chem.manufacturer.updated_at = now;
    }

    chem.updated_at = now;

    const projectChems = this.listChemicals(chem.project_id);
    const existingConflicts = this.data.conflicts.filter((c) => c.project_id === chem.project_id);
    const updatedConflicts = detectConflictsForProject(projectChems, chem.project_id, existingConflicts);
    this.data.conflicts = [
      ...this.data.conflicts.filter((c) => c.project_id !== chem.project_id),
      ...updatedConflicts,
    ];

    this.saveDatabase();
    return chem;
  }

  // --- CONFLICTS ---
  public listConflicts(projectId: string): ChemicalConflict[] {
    return this.data.conflicts.filter((c) => c.project_id === projectId);
  }

  public resolveConflict(
    conflictId: string,
    resolvedValue: string,
    resolutionNotes: string,
    reviewer = 'Process Safety Engineer'
  ): ChemicalConflict | undefined {
    const conflict = this.data.conflicts.find((c) => c.id === conflictId);
    if (!conflict) return undefined;

    const originalEntries = conflict.entries.map((e) => ({ source: e.document_name, val: e.value }));
    conflict.status = 'resolved';
    conflict.resolved_value = resolvedValue;
    conflict.resolution_notes = resolutionNotes;
    conflict.resolved_at = new Date().toISOString();

    for (const entry of conflict.entries) {
      this.updatePsiField(entry.chemical_id, conflict.field_key, {
        user_value: resolvedValue,
        review_status: 'confirmed',
        notes: `Resolved via cross-SDS conflict review by ${reviewer}: ${resolutionNotes}`,
      });
    }

    this.logAudit({
      project_id: conflict.project_id,
      entity_type: 'chemical' as any,
      entity_id: conflict.id,
      action: 'update',
      original_value: originalEntries,
      revised_value: { resolved_value: resolvedValue },
      change_reason: `Cross-SDS Conflict Resolution: ${resolutionNotes}`,
      reviewer,
    });

    this.saveDatabase();
    return conflict;
  }

  // --- EQUIPMENT & PIPING WITH AUDIT LOGGING ---
  public listEquipment(projectId: string): EquipmentTag[] {
    return this.data.equipment.filter((e) => e.project_id === projectId);
  }

  public addEquipment(
    tags: EquipmentTag[],
    reviewer = 'Process Engineer',
    reason = 'Added equipment item'
  ): void {
    for (const tag of tags) {
      const existingIdx = this.data.equipment.findIndex(
        (e) => e.id === tag.id || (e.project_id === tag.project_id && e.tag.toUpperCase() === tag.tag.toUpperCase())
      );
      if (existingIdx >= 0) {
        this.data.equipment[existingIdx] = {
          ...this.data.equipment[existingIdx],
          ...tag,
          id: this.data.equipment[existingIdx].id,
        };
      } else {
        this.data.equipment.push(tag);
      }
      this.logAudit({
        project_id: tag.project_id,
        entity_type: 'equipment',
        entity_id: tag.id,
        action: existingIdx >= 0 ? 'update' : 'create',
        change_reason: reason,
        reviewer,
        revised_value: { tag: tag.tag, type: tag.equipment_type, description: tag.description },
      });
    }
    // Upstream change invalidates graph approval
    if (tags.length > 0) {
      this.invalidateGraphApproval(tags[0].project_id, 'New equipment added');
    }
    this.saveDatabase();
  }

  public updateEquipment(
    tagId: string,
    updates: Partial<EquipmentTag>,
    reviewer = 'Process Engineer',
    reason = 'Manual equipment modification'
  ): EquipmentTag | undefined {
    const tag = this.data.equipment.find((e) => e.id === tagId);
    if (!tag) return undefined;

    const originalSnapshot = {
      tag: tag.tag,
      description: tag.description,
      equipment_type: tag.equipment_type,
      assigned_chemical_id: tag.assigned_chemical_id,
      status: tag.status,
    };

    // Preserve machine values if not already set
    if (!tag.machine_tag) tag.machine_tag = tag.tag;
    if (!tag.machine_type) tag.machine_type = tag.equipment_type;
    if (!tag.machine_description) tag.machine_description = tag.description;

    Object.assign(tag, updates, { updated_at: new Date().toISOString() });

    // If tag identifier changed, cascade update to all connected lines, PHA nodes, and drawings
    if (updates.tag && updates.tag !== originalSnapshot.tag) {
      const oldTagUpper = originalSnapshot.tag.toUpperCase();
      const newTagUpper = updates.tag.toUpperCase();
      this.data.lines.forEach((l) => {
        if (l.project_id === tag.project_id) {
          if (l.from_equipment.toUpperCase() === oldTagUpper) l.from_equipment = newTagUpper;
          if (l.to_equipment.toUpperCase() === oldTagUpper) l.to_equipment = newTagUpper;
        }
      });
      // Also update any PHA nodes referencing the old tag
      this.data.pha_nodes.forEach((n) => {
        if (n.project_id === tag.project_id && n.equipment_tags) {
          const idx = n.equipment_tags.findIndex((t) => t.toUpperCase() === oldTagUpper);
          if (idx !== -1) {
            n.equipment_tags[idx] = newTagUpper;
          }
        }
      });
      // Also update any Digital P&ID drawing element referencing this equipment
      if (tag.drawing_id && tag.drawing_element_id) {
        const drawing = this.getDrawing(tag.drawing_id);
        if (drawing) {
          const elem = drawing.elements.find((el) => el.id === tag.drawing_element_id);
          if (elem) {
            elem.tag = newTagUpper;
          }
        }
      }
    }

    this.logAudit({
      project_id: tag.project_id,
      entity_type: 'equipment',
      entity_id: tag.id,
      action: 'update',
      original_value: originalSnapshot,
      revised_value: updates,
      change_reason: reason,
      reviewer,
    });

    this.invalidateGraphApproval(tag.project_id, `Equipment ${tag.tag} modified`);
    this.saveDatabase();
    return tag;
  }

  public deleteEquipment(
    tagId: string,
    reviewer = 'Process Engineer',
    reason = 'Removed equipment node'
  ): boolean {
    const idx = this.data.equipment.findIndex((e) => e.id === tagId);
    if (idx === -1) return false;

    const eq = this.data.equipment[idx];
    const projectId = eq.project_id;
    const tagUpper = eq.tag.toUpperCase();

    this.data.equipment.splice(idx, 1);

    // Remove any connections where this equipment was an endpoint
    const removedLines = this.data.lines.filter(
      (l) => l.project_id === projectId && (l.from_equipment.toUpperCase() === tagUpper || l.to_equipment.toUpperCase() === tagUpper)
    );
    this.data.lines = this.data.lines.filter(
      (l) => !(l.project_id === projectId && (l.from_equipment.toUpperCase() === tagUpper || l.to_equipment.toUpperCase() === tagUpper))
    );

    this.logAudit({
      project_id: projectId,
      entity_type: 'equipment',
      entity_id: tagId,
      action: 'delete',
      original_value: { tag: eq.tag, type: eq.equipment_type, removed_connected_lines: removedLines.length },
      change_reason: reason,
      reviewer,
    });

    this.invalidateGraphApproval(projectId, `Equipment ${eq.tag} removed`);
    this.saveDatabase();
    return true;
  }

  // --- EQUIPMENT SPECIFICATIONS (ENGINEERING SPECIFICATION MODEL) ---

  public getEquipmentSpecifications(equipmentId: string): EquipmentSpecifications | undefined {
    const eq = this.data.equipment.find((e) => e.id === equipmentId) || this.data.equipment.find((e) => e.tag.toUpperCase() === equipmentId.toUpperCase());
    if (!eq) return undefined;
    if (!eq.specifications) {
      eq.specifications = createDefaultSpecifications(eq.equipment_type);
      this.saveDatabase();
    }
    return eq.specifications;
  }

  public updateEquipmentSpecification(
    equipmentId: string,
    propertyKey: keyof EquipmentSpecifications,
    payload: Partial<SpecProperty<any>>,
    reviewer = 'Process Safety Engineer',
    changeReason = 'Specification update'
  ): { equipment: EquipmentTag; affected_pha_nodes: string[] } | undefined {
    const eq = this.data.equipment.find((e) => e.id === equipmentId) || this.data.equipment.find((e) => e.tag.toUpperCase() === equipmentId.toUpperCase());
    if (!eq) return undefined;

    if (!eq.specifications) {
      eq.specifications = createDefaultSpecifications(eq.equipment_type);
    }

    const currentProp = (eq.specifications[propertyKey] as SpecProperty<any>) || createEmptySpecProperty();
    const prevValue = currentProp.value;
    const prevUnit = currentProp.unit;

    // Build history entry
    const historyEntry: SpecHistoryEntry = {
      timestamp: new Date().toISOString(),
      author: reviewer,
      field: propertyKey,
      previous_value: prevValue,
      previous_unit: prevUnit,
      new_value: payload.value !== undefined ? payload.value : prevValue,
      new_unit: payload.unit !== undefined ? payload.unit : prevUnit,
      change_reason: changeReason || 'Specification update',
    };

    const existingHistory = currentProp.change_history || [];

    // Create updated property object
    const updatedProp: SpecProperty<any> = {
      ...currentProp,
      ...payload,
      value: payload.value !== undefined ? payload.value : prevValue,
      unit: payload.unit !== undefined ? payload.unit : prevUnit,
      // Default status to 'user_entered' unless explicitly specified or verified
      status: payload.status || (payload.verification_status === 'verified' ? 'verified' : 'user_entered'),
      // Keep verification status separate from extraction confidence!
      // Must remain unverified unless explicitly marked verified by authorized review
      verification_status: payload.verification_status || (payload.status === 'verified' ? 'verified' : 'unverified'),
      change_history: [historyEntry, ...existingHistory],
    };

    if (payload.verification_status === 'verified' && !updatedProp.verified_by) {
      updatedProp.verified_by = reviewer;
      updatedProp.verified_at = new Date().toISOString();
    }

    eq.specifications[propertyKey] = updatedProp;
    eq.specifications_revision = (Number(eq.specifications_revision) || 1) + 1;
    eq.specifications_updated_at = new Date().toISOString();
    eq.updated_at = new Date().toISOString();

    // Invalidate graph approval
    this.invalidateGraphApproval(eq.project_id, `Equipment ${eq.tag} specification '${propertyKey}' modified`);

    // Synchronize to digital drawing element if linked
    if (eq.drawing_id && eq.drawing_element_id) {
      const drawing = this.getDrawing(eq.drawing_id);
      if (drawing) {
        const elem = drawing.elements.find((el) => el.id === eq.drawing_element_id);
        if (elem) {
          if (!elem.specifications) elem.specifications = createDefaultSpecifications(elem.type as any);
          elem.specifications[propertyKey] = updatedProp;
        }
      }
    }

    // Identify dependent PHA study nodes and mark for reassessment
    const affectedNodeIds: string[] = [];
    for (const node of this.data.pha_nodes) {
      if (node.project_id === eq.project_id && (node.equipment_tags || []).includes(eq.tag)) {
        node.requires_reassessment = true;
        if (!node.reassessment_reasons) node.reassessment_reasons = [];
        const reasonStr = `Specification '${propertyKey}' on equipment ${eq.tag} changed from ${prevValue ?? 'None'} to ${payload.value ?? 'None'} by ${reviewer} (${changeReason})`;
        if (!node.reassessment_reasons.includes(reasonStr)) {
          node.reassessment_reasons.push(reasonStr);
        }
        // Re-evaluate node specifications & deviation limits
        const evalResult = evaluateNodeSpecifications(node, this.data.equipment);
        node.missing_specifications = evalResult.missing_specifications;
        node.applicable_deviations = evalResult.applicable_deviations;
        affectedNodeIds.push(node.node_id);
      }
    }

    // Log audit trail
    this.logAudit({
      project_id: eq.project_id,
      entity_type: 'equipment',
      entity_id: eq.id,
      action: 'update',
      original_value: { [propertyKey]: { value: prevValue, unit: prevUnit } },
      revised_value: { [propertyKey]: { value: updatedProp.value, unit: updatedProp.unit, status: updatedProp.status } },
      change_reason: `Spec '${propertyKey}' updated: ${changeReason}. Affected PHA nodes: ${affectedNodeIds.join(', ') || 'none'}`,
      reviewer,
    });

    this.saveDatabase();
    return { equipment: eq, affected_pha_nodes: affectedNodeIds };
  }

  public verifyEquipmentSpecification(
    equipmentId: string,
    propertyKey: keyof EquipmentSpecifications,
    reviewer = 'Senior Process Safety Specialist (PE)',
    verificationNotes = 'Authorized engineering verification of design parameters'
  ): { equipment: EquipmentTag; affected_pha_nodes: string[] } | undefined {
    const eq = this.data.equipment.find((e) => e.id === equipmentId) || this.data.equipment.find((e) => e.tag.toUpperCase() === equipmentId.toUpperCase());
    if (!eq) return undefined;
    if (!eq.specifications || !eq.specifications[propertyKey]) return undefined;

    const prop = eq.specifications[propertyKey] as SpecProperty<any>;
    const prevVerificationStatus = prop.verification_status;

    prop.verification_status = 'verified';
    prop.status = 'verified';
    prop.verified_by = reviewer;
    prop.verified_at = new Date().toISOString();

    const historyEntry: SpecHistoryEntry = {
      timestamp: new Date().toISOString(),
      author: reviewer,
      field: propertyKey,
      previous_value: prop.value,
      previous_unit: prop.unit,
      new_value: prop.value,
      new_unit: prop.unit,
      change_reason: `Authorized verification: ${verificationNotes} (previous status: ${prevVerificationStatus})`,
    };
    prop.change_history = [historyEntry, ...(prop.change_history || [])];

    eq.specifications_revision = (Number(eq.specifications_revision) || 1) + 1;
    eq.specifications_updated_at = new Date().toISOString();

    // Re-evaluate dependent PHA study nodes so limit comparisons become 'verified_limit'
    const affectedNodeIds: string[] = [];
    for (const node of this.data.pha_nodes) {
      if (node.project_id === eq.project_id && (node.equipment_tags || []).includes(eq.tag)) {
        const evalResult = evaluateNodeSpecifications(node, this.data.equipment);
        node.missing_specifications = evalResult.missing_specifications;
        node.applicable_deviations = evalResult.applicable_deviations;
        affectedNodeIds.push(node.node_id);
      }
    }

    this.logAudit({
      project_id: eq.project_id,
      entity_type: 'equipment',
      entity_id: eq.id,
      action: 'update',
      original_value: { [propertyKey]: { verification_status: prevVerificationStatus } },
      revised_value: { [propertyKey]: { verification_status: 'verified', verified_by: reviewer } },
      change_reason: `Verified specification '${propertyKey}': ${verificationNotes}`,
      reviewer,
    });

    this.saveDatabase();
    return { equipment: eq, affected_pha_nodes: affectedNodeIds };
  }

  public recordSpecificationConflict(
    equipmentId: string,
    propertyKey: keyof EquipmentSpecifications,
    conflictEntry: Omit<SpecConflictEntry, 'id' | 'reported_at'>,
    reviewer = 'Process Safety Engineer'
  ): EquipmentTag | undefined {
    const eq = this.data.equipment.find((e) => e.id === equipmentId) || this.data.equipment.find((e) => e.tag.toUpperCase() === equipmentId.toUpperCase());
    if (!eq) return undefined;
    if (!eq.specifications) eq.specifications = createDefaultSpecifications(eq.equipment_type);

    const prop = (eq.specifications[propertyKey] as SpecProperty<any>) || createEmptySpecProperty();
    prop.status = 'conflict';
    if (!prop.conflicting_records) prop.conflicting_records = [];

    const newConflict: SpecConflictEntry = {
      id: uuidv4(),
      reported_at: new Date().toISOString(),
      ...conflictEntry,
    };
    prop.conflicting_records.push(newConflict);

    eq.specifications[propertyKey] = prop;
    eq.specifications_revision = (Number(eq.specifications_revision) || 1) + 1;
    eq.specifications_updated_at = new Date().toISOString();

    this.logAudit({
      project_id: eq.project_id,
      entity_type: 'equipment',
      entity_id: eq.id,
      action: 'update',
      original_value: { [propertyKey]: prop.value },
      revised_value: { [propertyKey]: { conflict: newConflict } },
      change_reason: `Recorded specification conflict on '${propertyKey}': source ${conflictEntry.source_document_name} reports ${conflictEntry.value} ${conflictEntry.unit || ''}`,
      reviewer,
    });

    this.saveDatabase();
    return eq;
  }

  public resolveSpecificationConflict(
    equipmentId: string,
    propertyKey: keyof EquipmentSpecifications,
    selectedValue: any,
    selectedUnit: string | null,
    reviewer: string,
    resolutionNotes: string,
    markVerified = false
  ): { equipment: EquipmentTag; affected_pha_nodes: string[] } | undefined {
    const eq = this.data.equipment.find((e) => e.id === equipmentId) || this.data.equipment.find((e) => e.tag.toUpperCase() === equipmentId.toUpperCase());
    if (!eq) return undefined;
    if (!eq.specifications || !eq.specifications[propertyKey]) return undefined;

    const prop = eq.specifications[propertyKey] as SpecProperty<any>;
    const prevValue = prop.value;
    const prevUnit = prop.unit;

    prop.value = selectedValue;
    prop.unit = selectedUnit;
    prop.status = markVerified ? 'verified' : 'user_entered';
    if (markVerified) {
      prop.verification_status = 'verified';
      prop.verified_by = reviewer;
      prop.verified_at = new Date().toISOString();
    }

    const historyEntry: SpecHistoryEntry = {
      timestamp: new Date().toISOString(),
      author: reviewer,
      field: propertyKey,
      previous_value: prevValue,
      previous_unit: prevUnit,
      new_value: selectedValue,
      new_unit: selectedUnit,
      change_reason: `Conflict Resolution by ${reviewer}: ${resolutionNotes}`,
    };
    prop.change_history = [historyEntry, ...(prop.change_history || [])];

    eq.specifications_revision = (Number(eq.specifications_revision) || 1) + 1;
    eq.specifications_updated_at = new Date().toISOString();

    // Re-evaluate dependent PHA study nodes
    const affectedNodeIds: string[] = [];
    for (const node of this.data.pha_nodes) {
      if (node.project_id === eq.project_id && (node.equipment_tags || []).includes(eq.tag)) {
        const evalResult = evaluateNodeSpecifications(node, this.data.equipment);
        node.missing_specifications = evalResult.missing_specifications;
        node.applicable_deviations = evalResult.applicable_deviations;
        affectedNodeIds.push(node.node_id);
      }
    }

    this.logAudit({
      project_id: eq.project_id,
      entity_type: 'equipment',
      entity_id: eq.id,
      action: 'update',
      original_value: { [propertyKey]: { value: prevValue, status: 'conflict' } },
      revised_value: { [propertyKey]: { value: selectedValue, unit: selectedUnit, status: prop.status } },
      change_reason: `Resolved specification conflict on '${propertyKey}': ${resolutionNotes}`,
      reviewer,
    });

    this.saveDatabase();
    return { equipment: eq, affected_pha_nodes: affectedNodeIds };
  }

  public acknowledgePhaNodeReassessment(
    nodeId: string,
    reviewer = 'Lead PHA Facilitator',
    notes = 'Acknowledged reassessment and confirmed scenario validity'
  ): PhaStudyNode | undefined {
    const node = this.data.pha_nodes.find((n) => n.id === nodeId || n.node_id === nodeId);
    if (!node) return undefined;

    node.requires_reassessment = false;
    node.updated_at = new Date().toISOString();

    this.logAudit({
      project_id: node.project_id,
      entity_type: 'pha_node',
      entity_id: node.id,
      action: 'update',
      original_value: { requires_reassessment: true, reasons: node.reassessment_reasons },
      revised_value: { requires_reassessment: false },
      change_reason: `HAZOP Reassessment Acknowledged: ${notes}`,
      reviewer,
    });

    this.saveDatabase();
    return node;
  }

  // --- PIPING LINES ---
  public listLines(projectId: string): PipingLine[] {
    return this.data.lines.filter((l) => l.project_id === projectId);
  }

  public addLines(
    lines: PipingLine[],
    reviewer = 'Process Engineer',
    reason = 'Added piping line connection'
  ): void {
    for (const line of lines) {
      const existingIdx = this.data.lines.findIndex(
        (l) => l.id === line.id || (l.project_id === line.project_id && l.line_number === line.line_number)
      );
      if (existingIdx >= 0) {
        this.data.lines[existingIdx] = {
          ...this.data.lines[existingIdx],
          ...line,
          id: this.data.lines[existingIdx].id,
        };
      } else {
        this.data.lines.push(line);
      }
      this.logAudit({
        project_id: line.project_id,
        entity_type: 'line',
        entity_id: line.id,
        action: existingIdx >= 0 ? 'update' : 'create',
        change_reason: reason,
        reviewer,
        revised_value: {
          line_number: line.line_number,
          from: line.from_equipment,
          to: line.to_equipment,
          functional_type: line.functional_type,
        },
      });
    }
    if (lines.length > 0) {
      this.invalidateGraphApproval(lines[0].project_id, 'New lines added');
    }
    this.saveDatabase();
  }

  public updateLine(
    lineId: string,
    updates: Partial<PipingLine>,
    reviewer = 'Process Engineer',
    reason = 'Manual line connection modification'
  ): PipingLine | undefined {
    const line = this.data.lines.find((l) => l.id === lineId);
    if (!line) return undefined;

    const originalSnapshot = {
      line_number: line.line_number,
      from_equipment: line.from_equipment,
      to_equipment: line.to_equipment,
      size: line.size,
      material: line.material,
      functional_type: line.functional_type,
      flow_direction: line.flow_direction,
      status: line.status,
      assigned_chemical_id: line.assigned_chemical_id,
    };

    if (!line.machine_line_number) line.machine_line_number = line.line_number;
    if (!line.machine_from) line.machine_from = line.from_equipment;
    if (!line.machine_to) line.machine_to = line.to_equipment;

    Object.assign(line, updates, { updated_at: new Date().toISOString() });

    this.logAudit({
      project_id: line.project_id,
      entity_type: 'line',
      entity_id: line.id,
      action: 'update',
      original_value: originalSnapshot,
      revised_value: updates,
      change_reason: reason,
      reviewer,
    });

    this.invalidateGraphApproval(line.project_id, `Line ${line.line_number} modified`);
    this.saveDatabase();
    return line;
  }

  public deleteLine(
    lineId: string,
    reviewer = 'Process Engineer',
    reason = 'Removed piping connection'
  ): boolean {
    const idx = this.data.lines.findIndex((l) => l.id === lineId);
    if (idx === -1) return false;

    const line = this.data.lines[idx];
    const projectId = line.project_id;
    this.data.lines.splice(idx, 1);

    this.logAudit({
      project_id: projectId,
      entity_type: 'line',
      entity_id: lineId,
      action: 'delete',
      original_value: { line_number: line.line_number, from: line.from_equipment, to: line.to_equipment },
      change_reason: reason,
      reviewer,
    });

    this.invalidateGraphApproval(projectId, `Line ${line.line_number} removed`);
    this.saveDatabase();
    return true;
  }

  // --- PROCESS STREAMS ---
  public listStreams(projectId: string): ProcessStream[] {
    return this.data.streams.filter((s) => s.project_id === projectId);
  }

  public getStream(streamId: string): ProcessStream | undefined {
    return this.data.streams.find((s) => s.id === streamId);
  }

  public addStreams(
    streams: ProcessStream[],
    reviewer = 'Process Engineer',
    reason = 'Extracted or added process streams'
  ): void {
    for (const stream of streams) {
      const existingIdx = this.data.streams.findIndex(
        (s) => s.id === stream.id || (s.project_id === stream.project_id && s.stream_number === stream.stream_number)
      );
      if (existingIdx >= 0) {
        this.data.streams[existingIdx] = {
          ...this.data.streams[existingIdx],
          ...stream,
          id: this.data.streams[existingIdx].id,
        };
      } else {
        this.data.streams.push(stream);
      }
      // If stream has a connected line, associate stream_id with line
      if (stream.connected_line_id) {
        const line = this.data.lines.find((l) => l.id === stream.connected_line_id);
        if (line && !line.stream_id) {
          line.stream_id = stream.id;
        }
      }
      this.logAudit({
        project_id: stream.project_id,
        entity_type: 'stream',
        entity_id: stream.id,
        action: existingIdx >= 0 ? 'update' : 'create',
        change_reason: reason,
        reviewer,
        revised_value: {
          stream_number: stream.stream_number,
          source: stream.source_equipment_tag,
          dest: stream.destination_equipment_tag,
          flow_rates: stream.flow_rates,
          origin: stream.data_origin,
        },
      });
    }
    if (streams.length > 0) {
      this.invalidateGraphApproval(streams[0].project_id, 'Process streams updated');
    }
    this.saveDatabase();
  }

  public createStream(
    input: CreateStreamInput,
    reviewer = 'Process Engineer',
    reason = 'Manual stream entry'
  ): ProcessStream {
    const stream = createEmptyProcessStream(
      input.project_id,
      input.source_equipment_tag,
      input.destination_equipment_tag,
      input.connected_line_id,
      input.line_number,
      input.stream_number
    );

    // Find source & dest equipment IDs
    const sourceEq = this.data.equipment.find(
      (e) => e.project_id === input.project_id && e.tag.toUpperCase() === input.source_equipment_tag.trim().toUpperCase()
    );
    if (sourceEq) stream.source_equipment_id = sourceEq.id;

    const destEq = this.data.equipment.find(
      (e) => e.project_id === input.project_id && e.tag.toUpperCase() === input.destination_equipment_tag.trim().toUpperCase()
    );
    if (destEq) stream.destination_equipment_id = destEq.id;

    if (input.material_description) stream.material_description = input.material_description;
    if (input.assigned_chemical_id) stream.assigned_chemical_id = input.assigned_chemical_id;
    if (input.flow_direction) stream.flow_direction = input.flow_direction;
    if (input.phase) stream.phase = input.phase;
    if (input.pipe_nominal_diameter) stream.pipe_nominal_diameter = input.pipe_nominal_diameter;
    if (input.pipe_spec) stream.pipe_spec = input.pipe_spec;
    if (input.associated_instrument_tags) stream.associated_instrument_tags = input.associated_instrument_tags;

    // Numerical flow rates: preserve null if not provided, DO NOT default to 0
    if (input.flow_rates) {
      if (input.flow_rates.normal !== undefined) {
        stream.flow_rates.normal = input.flow_rates.normal !== null && input.flow_rates.normal !== undefined && !isNaN(Number(input.flow_rates.normal)) ? Number(input.flow_rates.normal) : null;
      }
      if (input.flow_rates.min !== undefined) {
        stream.flow_rates.min = input.flow_rates.min !== null && input.flow_rates.min !== undefined && !isNaN(Number(input.flow_rates.min)) ? Number(input.flow_rates.min) : null;
      }
      if (input.flow_rates.max !== undefined) {
        stream.flow_rates.max = input.flow_rates.max !== null && input.flow_rates.max !== undefined && !isNaN(Number(input.flow_rates.max)) ? Number(input.flow_rates.max) : null;
      }
      if (input.flow_rates.design !== undefined) {
        stream.flow_rates.design = input.flow_rates.design !== null && input.flow_rates.design !== undefined && !isNaN(Number(input.flow_rates.design)) ? Number(input.flow_rates.design) : null;
      }
      if (input.flow_rates.actual !== undefined) {
        stream.flow_rates.actual = input.flow_rates.actual !== null && input.flow_rates.actual !== undefined && !isNaN(Number(input.flow_rates.actual)) ? Number(input.flow_rates.actual) : null;
      }
      if (input.flow_rates.unit) stream.flow_rates.unit = input.flow_rates.unit;
      if (input.flow_rates.basis) stream.flow_rates.basis = input.flow_rates.basis;
    }

    if (input.operating_pressure) {
      if (input.operating_pressure.value !== undefined) {
        stream.operating_pressure.value = input.operating_pressure.value !== null && !isNaN(Number(input.operating_pressure.value)) ? Number(input.operating_pressure.value) : null;
      }
      if (input.operating_pressure.unit) stream.operating_pressure.unit = input.operating_pressure.unit;
      if (input.operating_pressure.status) stream.operating_pressure.status = input.operating_pressure.status;
    }

    if (input.operating_temperature) {
      if (input.operating_temperature.value !== undefined) {
        stream.operating_temperature.value = input.operating_temperature.value !== null && !isNaN(Number(input.operating_temperature.value)) ? Number(input.operating_temperature.value) : null;
      }
      if (input.operating_temperature.unit) stream.operating_temperature.unit = input.operating_temperature.unit;
      if (input.operating_temperature.status) stream.operating_temperature.status = input.operating_temperature.status;
    }

    stream.data_origin = input.data_origin || 'manual';
    // Manually entered streams must not be automatically marked as verified
    stream.verification_status = input.verification_status || 'unverified';
    if (input.verified_by) stream.verified_by = input.verified_by;
    if (input.notes) stream.notes = input.notes;

    if (input.source_document) {
      stream.source.document = input.source_document;
      stream.source.page = input.source_page || null;
      stream.source.snippet = input.source_snippet || null;
    }

    // Link connected line if line_id provided
    if (stream.connected_line_id) {
      const line = this.data.lines.find((l) => l.id === stream.connected_line_id);
      if (line) {
        line.stream_id = stream.id;
      }
    }

    this.data.streams.push(stream);

    this.logAudit({
      project_id: stream.project_id,
      entity_type: 'stream',
      entity_id: stream.id,
      action: 'create',
      change_reason: reason,
      reviewer,
      revised_value: {
        stream_number: stream.stream_number,
        source: stream.source_equipment_tag,
        dest: stream.destination_equipment_tag,
        flow_rates: stream.flow_rates,
      },
    });

    this.invalidateGraphApproval(stream.project_id, `Manual stream ${stream.stream_number} created`);
    this.saveDatabase();
    return stream;
  }

  public updateStream(
    streamId: string,
    updates: Partial<ProcessStream>,
    reviewer = 'Process Engineer',
    reason = 'Manual stream modification'
  ): ProcessStream | undefined {
    const stream = this.data.streams.find((s) => s.id === streamId);
    if (!stream) return undefined;

    const originalSnapshot = { ...stream, flow_rates: { ...stream.flow_rates } };

    if (updates.stream_number !== undefined) stream.stream_number = updates.stream_number;
    if (updates.source_equipment_tag !== undefined) stream.source_equipment_tag = updates.source_equipment_tag;
    if (updates.destination_equipment_tag !== undefined) stream.destination_equipment_tag = updates.destination_equipment_tag;
    if (updates.connected_line_id !== undefined) stream.connected_line_id = updates.connected_line_id;
    if (updates.line_number !== undefined) stream.line_number = updates.line_number;
    if (updates.material_description !== undefined) stream.material_description = updates.material_description;
    if (updates.assigned_chemical_id !== undefined) stream.assigned_chemical_id = updates.assigned_chemical_id;
    if (updates.flow_direction !== undefined) stream.flow_direction = updates.flow_direction;
    if (updates.phase !== undefined) stream.phase = updates.phase;
    if (updates.pipe_nominal_diameter !== undefined) stream.pipe_nominal_diameter = updates.pipe_nominal_diameter;
    if (updates.pipe_spec !== undefined) stream.pipe_spec = updates.pipe_spec;
    if (updates.associated_instrument_tags !== undefined) stream.associated_instrument_tags = updates.associated_instrument_tags;
    if (updates.notes !== undefined) stream.notes = updates.notes;
    if (updates.data_origin !== undefined) stream.data_origin = updates.data_origin;
    if (updates.verification_status !== undefined) stream.verification_status = updates.verification_status;
    if (updates.verified_by !== undefined) stream.verified_by = updates.verified_by;
    if (updates.verified_at !== undefined) stream.verified_at = updates.verified_at;

    if (updates.flow_rates) {
      if (updates.flow_rates.normal !== undefined) {
        stream.flow_rates.normal = updates.flow_rates.normal !== null && !isNaN(Number(updates.flow_rates.normal)) ? Number(updates.flow_rates.normal) : null;
      }
      if (updates.flow_rates.min !== undefined) {
        stream.flow_rates.min = updates.flow_rates.min !== null && !isNaN(Number(updates.flow_rates.min)) ? Number(updates.flow_rates.min) : null;
      }
      if (updates.flow_rates.max !== undefined) {
        stream.flow_rates.max = updates.flow_rates.max !== null && !isNaN(Number(updates.flow_rates.max)) ? Number(updates.flow_rates.max) : null;
      }
      if (updates.flow_rates.design !== undefined) {
        stream.flow_rates.design = updates.flow_rates.design !== null && !isNaN(Number(updates.flow_rates.design)) ? Number(updates.flow_rates.design) : null;
      }
      if (updates.flow_rates.actual !== undefined) {
        stream.flow_rates.actual = updates.flow_rates.actual !== null && !isNaN(Number(updates.flow_rates.actual)) ? Number(updates.flow_rates.actual) : null;
      }
      if (updates.flow_rates.unit !== undefined) stream.flow_rates.unit = updates.flow_rates.unit;
      if (updates.flow_rates.basis !== undefined) stream.flow_rates.basis = updates.flow_rates.basis;
    }

    if (updates.operating_pressure) {
      if (updates.operating_pressure.value !== undefined) {
        stream.operating_pressure.value = updates.operating_pressure.value !== null && !isNaN(Number(updates.operating_pressure.value)) ? Number(updates.operating_pressure.value) : null;
      }
      if (updates.operating_pressure.unit !== undefined) stream.operating_pressure.unit = updates.operating_pressure.unit;
      if (updates.operating_pressure.status !== undefined) stream.operating_pressure.status = updates.operating_pressure.status;
    }

    if (updates.operating_temperature) {
      if (updates.operating_temperature.value !== undefined) {
        stream.operating_temperature.value = updates.operating_temperature.value !== null && !isNaN(Number(updates.operating_temperature.value)) ? Number(updates.operating_temperature.value) : null;
      }
      if (updates.operating_temperature.unit !== undefined) stream.operating_temperature.unit = updates.operating_temperature.unit;
      if (updates.operating_temperature.status !== undefined) stream.operating_temperature.status = updates.operating_temperature.status;
    }

    stream.updated_at = new Date().toISOString();

    this.logAudit({
      project_id: stream.project_id,
      entity_type: 'stream',
      entity_id: stream.id,
      action: 'update',
      original_value: originalSnapshot,
      revised_value: stream,
      change_reason: reason,
      reviewer,
    });

    this.invalidateGraphApproval(stream.project_id, `Stream ${stream.stream_number} updated`);
    this.saveDatabase();
    return stream;
  }

  public deleteStream(streamId: string, reviewer = 'Process Engineer', reason = 'Deleted process stream'): boolean {
    const idx = this.data.streams.findIndex((s) => s.id === streamId);
    if (idx === -1) return false;

    const stream = this.data.streams[idx];
    const projectId = stream.project_id;

    // Unlink any line pointing to this stream
    for (const l of this.data.lines) {
      if (l.stream_id === streamId) {
        l.stream_id = null;
      }
    }

    this.data.streams.splice(idx, 1);

    this.logAudit({
      project_id: projectId,
      entity_type: 'stream',
      entity_id: streamId,
      action: 'delete',
      original_value: { stream_number: stream.stream_number, source: stream.source_equipment_tag, dest: stream.destination_equipment_tag },
      change_reason: reason,
      reviewer,
    });

    this.invalidateGraphApproval(projectId, `Stream ${stream.stream_number} deleted`);
    this.saveDatabase();
    return true;
  }

  public verifyStream(streamId: string, reviewer = 'Lead Process Engineer', notes?: string): ProcessStream | undefined {
    const stream = this.data.streams.find((s) => s.id === streamId);
    if (!stream) return undefined;

    stream.verification_status = 'verified';
    stream.verified_by = reviewer;
    stream.verified_at = new Date().toISOString();
    if (notes) {
      stream.notes = stream.notes ? `${stream.notes}; Verification Note: ${notes}` : notes;
    }
    stream.updated_at = new Date().toISOString();

    this.logAudit({
      project_id: stream.project_id,
      entity_type: 'stream',
      entity_id: stream.id,
      action: 'verify',
      change_reason: `Stream ${stream.stream_number} verified by ${reviewer}`,
      reviewer,
      revised_value: { verification_status: 'verified', notes },
    });

    this.saveDatabase();
    return stream;
  }

  // --- GRAPH VALIDATION & APPROVAL GATES ---
  public getProcessTopologyGraph(projectId: string): TopologyGraph {
    const eq = this.listEquipment(projectId);
    const lines = this.listLines(projectId);
    const chems = this.listChemicals(projectId);
    const conflicts = this.listConflicts(projectId);
    const streams = this.listStreams(projectId);
    return buildProcessTopologyGraph(eq, lines, chems, conflicts, streams);
  }

  public getGraphValidation(projectId: string): GraphValidationResult {
    const eq = this.listEquipment(projectId);
    const lines = this.listLines(projectId);
    const chems = this.listChemicals(projectId);
    const ack = new Set(this.data.acknowledged_warnings[projectId] || []);
    return validateProcessGraph(eq, lines, chems, ack);
  }

  public acknowledgeWarning(projectId: string, warningCode: string): void {
    if (!this.data.acknowledged_warnings[projectId]) {
      this.data.acknowledged_warnings[projectId] = [];
    }
    if (!this.data.acknowledged_warnings[projectId].includes(warningCode)) {
      this.data.acknowledged_warnings[projectId].push(warningCode);
      this.saveDatabase();
    }
  }

  public getGraphApproval(projectId: string): GraphApprovalRecord {
    return this.data.graph_approvals[projectId] || { approved: false };
  }

  public approveGraph(
    projectId: string,
    reviewer = 'Lead Process Safety Engineer',
    notes = 'P&ID topology and connectivity verified against design drawing'
  ): { success: boolean; error?: string; approval?: GraphApprovalRecord } {
    const validation = this.getGraphValidation(projectId);

    if (validation.errors_count > 0) {
      return {
        success: false,
        error: `Graph approval blocked: ${validation.errors_count} unresolved critical errors present.`,
      };
    }

    if (!validation.can_approve) {
      return {
        success: false,
        error: `Graph approval blocked: please review and acknowledge all remaining warnings.`,
      };
    }

    const record: GraphApprovalRecord = {
      approved: true,
      approved_by: reviewer,
      approved_at: new Date().toISOString(),
      notes,
      validation_snapshot: validation,
    };

    this.data.graph_approvals[projectId] = record;

    this.logAudit({
      project_id: projectId,
      entity_type: 'graph',
      entity_id: projectId,
      action: 'approve',
      revised_value: record,
      change_reason: notes,
      reviewer,
    });

    this.saveDatabase();
    return { success: true, approval: record };
  }

  public unapproveGraph(
    projectId: string,
    reviewer = 'Process Engineer',
    reason = 'Returned to review for topology corrections'
  ): void {
    this.invalidateGraphApproval(projectId, reason, reviewer);
  }

  private invalidateGraphApproval(projectId: string, reason: string, reviewer = 'System'): void {
    const existing = this.data.graph_approvals[projectId];
    if (existing && existing.approved) {
      this.data.graph_approvals[projectId] = { approved: false };
      this.logAudit({
        project_id: projectId,
        entity_type: 'graph',
        entity_id: projectId,
        action: 'reject',
        change_reason: `Approval invalidated: ${reason}`,
        reviewer,
      });
      // Flag PHA study nodes as stale
      this.data.pha_nodes
        .filter((n) => n.project_id === projectId)
        .forEach((n) => {
          if (n.status === 'approved') n.status = 'under_review';
        });
      this.saveDatabase();
    }
  }

  // --- PHA STUDY NODES ---
  public listPhaNodes(projectId: string): PhaStudyNode[] {
    const nodes = this.data.pha_nodes.filter((n) => n.project_id === projectId);
    const streams = this.listStreams(projectId);
    const lines = this.listLines(projectId);
    const eq = this.listEquipment(projectId);
    return nodes.map((n) => attachStreamContextToNode(n, streams, eq, lines));
  }

  public generatePhaNodes(
    projectId: string,
    reviewer = 'Process Engineer'
  ): PhaStudyNode[] {
    const eq = this.listEquipment(projectId);
    const lines = this.listLines(projectId);
    const streams = this.listStreams(projectId);

    const candidates = generateCandidatePhaNodes(projectId, eq, lines, streams);

    // Replace existing candidate nodes or merge
    this.data.pha_nodes = [
      ...this.data.pha_nodes.filter((n) => n.project_id !== projectId),
      ...candidates,
    ];

    this.logAudit({
      project_id: projectId,
      entity_type: 'pha_node',
      entity_id: projectId,
      action: 'create',
      change_reason: `Auto-segmented ${candidates.length} candidate PHA study nodes from process graph`,
      reviewer,
      revised_value: candidates.map((c) => ({ node_id: c.node_id, name: c.name })),
    });

    this.saveDatabase();
    return candidates;
  }

  public createPhaNode(
    nodeData: Omit<PhaStudyNode, 'id' | 'created_at' | 'updated_at'>,
    reviewer = 'Process Engineer'
  ): PhaStudyNode {
    const newNode: PhaStudyNode = {
      ...nodeData,
      id: uuidv4(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.data.pha_nodes.push(newNode);

    this.logAudit({
      project_id: newNode.project_id,
      entity_type: 'pha_node',
      entity_id: newNode.id,
      action: 'create',
      change_reason: `Created custom PHA study node ${newNode.node_id}`,
      reviewer,
      revised_value: { node_id: newNode.node_id, name: newNode.name },
    });

    this.saveDatabase();
    return newNode;
  }

  public updatePhaNode(
    nodeId: string,
    updates: Partial<PhaStudyNode>,
    reviewer = 'Process Engineer',
    reason = 'Modified PHA study node boundary/intent'
  ): PhaStudyNode | undefined {
    const node = this.data.pha_nodes.find((n) => n.id === nodeId);
    if (!node) return undefined;

    const originalSnapshot = {
      node_id: node.node_id,
      name: node.name,
      equipment_tags: [...node.equipment_tags],
      line_numbers: [...node.line_numbers],
      design_intent: node.design_intent,
      status: node.status,
    };

    Object.assign(node, updates, { updated_at: new Date().toISOString() });

    this.logAudit({
      project_id: node.project_id,
      entity_type: 'pha_node',
      entity_id: node.id,
      action: 'update',
      original_value: originalSnapshot,
      revised_value: updates,
      change_reason: reason,
      reviewer,
    });

    this.saveDatabase();
    return node;
  }

  public approvePhaNode(
    nodeId: string,
    reviewer = 'PHA Team Leader / Facilitator'
  ): PhaStudyNode | undefined {
    const node = this.data.pha_nodes.find((n) => n.id === nodeId);
    if (!node) return undefined;

    node.status = 'approved';
    node.reviewed_by = reviewer;
    node.approved_at = new Date().toISOString();
    node.updated_at = new Date().toISOString();

    this.logAudit({
      project_id: node.project_id,
      entity_type: 'pha_node',
      entity_id: node.id,
      action: 'approve',
      change_reason: `Approved PHA study node ${node.node_id} boundary and design intent`,
      reviewer,
      revised_value: { status: 'approved' },
    });

    this.saveDatabase();
    return node;
  }

  public deletePhaNode(nodeId: string, reviewer = 'Process Engineer'): boolean {
    const idx = this.data.pha_nodes.findIndex((n) => n.id === nodeId);
    if (idx === -1) return false;

    const node = this.data.pha_nodes[idx];
    this.data.pha_nodes.splice(idx, 1);

    this.logAudit({
      project_id: node.project_id,
      entity_type: 'pha_node',
      entity_id: nodeId,
      action: 'delete',
      change_reason: `Removed PHA study node ${node.node_id}`,
      reviewer,
    });

    this.saveDatabase();
    return true;
  }

  public getHazopReadiness(projectId: string): HazopReadinessResult {
    const eq = this.listEquipment(projectId);
    const lines = this.listLines(projectId);
    const chems = this.listChemicals(projectId);
    const nodes = this.listPhaNodes(projectId);
    const streams = this.listStreams(projectId);
    const approval = this.getGraphApproval(projectId);

    return checkHazopReadiness(eq, lines, chems, nodes, approval.approved, streams);
  }

  // --- DIGITAL P&ID DRAWINGS ---
  public listDrawings(projectId: string): DigitalPidDrawing[] {
    return this.data.drawings.filter((d) => d.project_id === projectId);
  }

  public getDrawing(drawingId: string): DigitalPidDrawing | undefined {
    return this.data.drawings.find((d) => d.id === drawingId);
  }

  public saveDrawing(
    drawing: DigitalPidDrawing,
    reviewer = 'Process Safety Engineer',
    notes = 'Drawing updated'
  ): DigitalPidDrawing {
    const existingIdx = this.data.drawings.findIndex((d) => d.id === drawing.id);
    const now = new Date().toISOString();

    if (existingIdx >= 0) {
      const existing = this.data.drawings[existingIdx];

      // If modifying an approved drawing, bump revision to draft and invalidate derived graph approval
      let revision = drawing.revision;
      let status: DigitalPidDrawing['status'] = drawing.status;
      if (existing.status === 'approved') {
        const revNum = parseInt(existing.revision.replace(/\D/g, '') || '0', 10);
        revision = `REV ${revNum + 1} (DRAFT)`;
        status = 'draft';
        this.invalidateGraphApproval(
          drawing.project_id,
          `Digital drawing ${drawing.drawing_number} revised to ${revision} by ${reviewer}`
        );
      }

      const updatedDrawing: DigitalPidDrawing = {
        ...drawing,
        revision,
        status,
        updated_at: now,
        change_log: [
          ...(existing.change_log || []),
          {
            timestamp: now,
            author: reviewer,
            notes,
            revision,
          },
        ],
      };

      this.data.drawings[existingIdx] = updatedDrawing;
      this.logAudit({
        project_id: drawing.project_id,
        entity_type: 'equipment',
        entity_id: drawing.id,
        action: 'update',
        reviewer,
        change_reason: notes,
        revised_value: { elements: drawing.elements.length, connectors: drawing.connectors.length, revision },
      });

      this.saveDatabase();
      return updatedDrawing;
    } else {
      const newDrawing: DigitalPidDrawing = {
        ...drawing,
        created_at: now,
        updated_at: now,
        change_log: [
          {
            timestamp: now,
            author: reviewer,
            notes: 'Drawing created',
            revision: drawing.revision || 'REV 0',
          },
        ],
      };
      this.data.drawings.push(newDrawing);
      this.logAudit({
        project_id: drawing.project_id,
        entity_type: 'equipment',
        entity_id: drawing.id,
        action: 'create',
        reviewer,
        change_reason: notes,
        revised_value: { title: drawing.title, revision: newDrawing.revision },
      });
      this.saveDatabase();
      return newDrawing;
    }
  }

  public validateDrawing(drawingId: string) {
    const drawing = this.getDrawing(drawingId);
    if (!drawing) {
      return {
        is_valid: false,
        can_approve: false,
        errors_count: 1,
        warnings_count: 0,
        issues: [
          {
            id: 'err-not-found',
            severity: 'error' as const,
            code: 'ERR_DRAWING_NOT_FOUND',
            message: 'Digital drawing not found.',
          },
        ],
        checked_at: new Date().toISOString(),
      };
    }

    const ack = new Set(this.data.drawing_acknowledged_warnings[drawingId] || []);
    return validateDigitalDrawing(drawing, ack);
  }

  public acknowledgeDrawingWarning(drawingId: string, warningCode: string): void {
    if (!this.data.drawing_acknowledged_warnings[drawingId]) {
      this.data.drawing_acknowledged_warnings[drawingId] = [];
    }
    if (!this.data.drawing_acknowledged_warnings[drawingId].includes(warningCode)) {
      this.data.drawing_acknowledged_warnings[drawingId].push(warningCode);
      this.saveDatabase();
    }
  }

  public approveDrawing(
    drawingId: string,
    reviewer: string = 'Lead Process Safety Engineer',
    revision?: string,
    notes: string = 'Engineering sign-off completed'
  ): { success: boolean; drawing?: DigitalPidDrawing; error?: string; validation?: import('../types').DrawingValidationResult } {
    const drawing = this.getDrawing(drawingId);
    if (!drawing) return { success: false, error: 'Drawing not found' };

    const ack = new Set(this.data.drawing_acknowledged_warnings[drawingId] || []);
    const val = validateDigitalDrawing(drawing, ack);
    if (!val.can_approve) {
      return {
        success: false,
        error: `Drawing has ${val.errors_count} critical error(s) preventing sign-off. Resolve errors before approving.`,
        validation: val,
      };
    }

    const now = new Date().toISOString();
    drawing.status = 'approved';
    drawing.approved_at = now;
    drawing.approved_by = reviewer;
    drawing.revision = revision || drawing.revision;
    drawing.approval_notes = notes;
    drawing.updated_at = now;
    drawing.change_log = [
      ...(drawing.change_log || []),
      {
        timestamp: now,
        author: reviewer,
        notes: `Drawing formally approved: ${notes}`,
        revision: drawing.revision,
      },
    ];

    // Synchronize drawing into project's authoritative equipment and lines
    this.syncDrawingToProject(drawingId, reviewer);

    // Formally sign-off project graph approval as well
    this.approveGraph(drawing.project_id, reviewer, `Approved via Digital P&ID Drawing ${drawing.drawing_number} (${drawing.revision})`);

    this.logAudit({
      project_id: drawing.project_id,
      entity_type: 'equipment',
      entity_id: drawing.id,
      action: 'approve',
      reviewer,
      change_reason: notes,
      revised_value: { status: 'approved', revision: drawing.revision },
    });

    this.saveDatabase();
    return { success: true, drawing, validation: val };
  }

  public syncDrawingToProject(
    drawingId: string,
    reviewer = 'Process Safety Engineer'
  ): { success: boolean; equipment_count: number; lines_count: number; error?: string } {
    const drawing = this.getDrawing(drawingId);
    if (!drawing) return { success: false, equipment_count: 0, lines_count: 0, error: 'Drawing not found' };

    const projectId = drawing.project_id;
    const now = new Date().toISOString();

    // Map DrawingElement[] to EquipmentTag[]
    const newEquipment: EquipmentTag[] = drawing.elements
      .filter((e) => e.type !== 'junction' && e.type !== 'offpage_connector')
      .map((e) => {
        const existingEq = this.data.equipment.find(
          (ex) => ex.project_id === projectId && ex.tag.toUpperCase() === e.tag.toUpperCase()
        );
        let eqType: EquipmentType = 'vessel';
        if (e.type === 'check_valve' || e.type === 'relief_valve') {
          eqType = 'manual_valve';
        } else if (e.type === 'filter') {
          eqType = 'other';
        } else {
          eqType = e.type as EquipmentType;
        }

        return {
          id: existingEq?.id || e.id,
          project_id: projectId,
          document_id: drawing.source_document_id || 'manual_drawing',
          tag: e.tag.trim().toUpperCase(),
          description: e.description || `${e.type.replace('_', ' ')} unit`,
          equipment_type: eqType,
          assigned_chemical_id: e.assigned_chemical_id,
          confidence: e.confidence ?? 1.0,
          status: drawing.status === 'approved' ? 'confirmed' : e.status,
          source: e.source_evidence || {
            document: drawing.title,
            page: drawing.source_document_page || 1,
            snippet: `Digital P&ID Element: ${e.tag}`,
          },
          notes: e.notes,
          machine_tag: existingEq?.machine_tag || e.tag,
          machine_type: existingEq?.machine_type || e.type,
          machine_description: existingEq?.machine_description || e.description,
          is_manual_entry: true,
          specifications: e.specifications || existingEq?.specifications || createDefaultSpecifications(eqType),
          specifications_revision: existingEq?.specifications_revision || 1,
          specifications_updated_at: existingEq?.specifications_updated_at || now,
          drawing_id: drawing.id,
          drawing_revision: drawing.revision,
          drawing_element_id: e.id,
          created_at: existingEq?.created_at || now,
          updated_at: now,
        };
      });

    // Map DrawingConnector[] to PipingLine[]
    const elementIdToTag = new Map<string, string>();
    drawing.elements.forEach((e) => elementIdToTag.set(e.id, e.tag));

    const newLines: PipingLine[] = drawing.connectors.map((c) => {
      const fromTag = elementIdToTag.get(c.from_element_id) || 'UNKNOWN';
      const toTag = elementIdToTag.get(c.to_element_id) || 'UNKNOWN';
      const existingLine = this.data.lines.find(
        (ex) => ex.project_id === projectId && ex.line_number === c.line_number
      );

      return {
        id: existingLine?.id || c.id,
        project_id: projectId,
        document_id: drawing.source_document_id || 'manual_drawing',
        line_number: c.line_number || `LINE-${fromTag}-${toTag}`,
        from_equipment: fromTag,
        to_equipment: toTag,
        size: c.size || '2"',
        material: c.material || 'CS',
        stream_label: c.stream_label || '',
        functional_type: c.functional_type || 'piping_line',
        flow_direction: c.flow_direction || 'forward',
        assigned_chemical_id: c.functional_type === 'signal_line' ? null : c.assigned_chemical_id,
        confidence: c.confidence ?? 1.0,
        status: drawing.status === 'approved' ? 'confirmed' : c.status,
        source: c.source_evidence || {
          document: drawing.title,
          page: drawing.source_document_page || 1,
          snippet: `Digital P&ID Connector: ${c.line_number}`,
        },
        alerts: [],
        notes: c.notes,
        created_at: existingLine?.created_at || now,
        updated_at: now,
      };
    });

    // Replace project's equipment and lines with synchronized digital drawing elements
    this.data.equipment = [
      ...this.data.equipment.filter((e) => e.project_id !== projectId),
      ...newEquipment,
    ];
    this.data.lines = [
      ...this.data.lines.filter((l) => l.project_id !== projectId),
      ...newLines,
    ];

    if (drawing.status !== 'approved') {
      this.invalidateGraphApproval(projectId, `Digital drawing modified by ${reviewer}`);
    }

    this.saveDatabase();
    return { success: true, equipment_count: newEquipment.length, lines_count: newLines.length };
  }

  public deleteDrawing(drawingId: string): boolean {
    const idx = this.data.drawings.findIndex((d) => d.id === drawingId);
    if (idx === -1) return false;
    this.data.drawings.splice(idx, 1);
    delete this.data.drawing_acknowledged_warnings[drawingId];
    this.saveDatabase();
    return true;
  }

  // --- PROCESS DESCRIPTION NARRATIVES ---
  public saveProcessDescription(extraction: ProcessDescriptionExtraction): ProcessDescriptionExtraction {
    if (!this.data.process_descriptions) this.data.process_descriptions = [];
    const idx = this.data.process_descriptions.findIndex((d) => d.project_id === extraction.project_id);
    if (idx >= 0) {
      this.data.process_descriptions[idx] = extraction;
    } else {
      this.data.process_descriptions.push(extraction);
    }
    this.saveDatabase();
    return extraction;
  }

  public getProcessDescription(projectId: string): ProcessDescriptionExtraction | undefined {
    if (!this.data.process_descriptions) this.data.process_descriptions = [];
    return this.data.process_descriptions.find((d) => d.project_id === projectId);
  }

  // --- COMMON DRAWING MODELS & HYBRID CANDIDATES ---
  public saveCommonDrawingModel(model: CommonDrawingModel): CommonDrawingModel {
    if (!this.data.common_drawings) this.data.common_drawings = [];
    const idx = this.data.common_drawings.findIndex((m) => m.document_id === model.document_id);
    if (idx >= 0) {
      this.data.common_drawings[idx] = model;
    } else {
      this.data.common_drawings.push(model);
    }
    this.saveDatabase();
    return model;
  }

  public getCommonDrawingModel(documentId: string): CommonDrawingModel | undefined {
    if (!this.data.common_drawings) this.data.common_drawings = [];
    return this.data.common_drawings.find((m) => m.document_id === documentId);
  }

  public listCommonDrawingModels(): CommonDrawingModel[] {
    return this.data.common_drawings || [];
  }

  public updateCandidateConnection(
    candidateId: string,
    updates: Partial<ConnectionCandidate>,
    reviewer = 'Process Safety Engineer'
  ): ConnectionCandidate | undefined {
    if (!this.data.common_drawings) return undefined;
    for (const drawing of this.data.common_drawings) {
      const cand = drawing.connection_candidates.find((c) => c.id === candidateId);
      if (cand) {
        Object.assign(cand, updates);
        cand.is_manually_corrected = true;
        this.saveDatabase();
        return cand;
      }
    }
    return undefined;
  }

  public verifyCandidateConnection(
    candidateId: string,
    reviewer = 'Process Safety Engineer',
    notes = 'Verified by engineer'
  ): ConnectionCandidate | undefined {
    return this.updateCandidateConnection(
      candidateId,
      {
        verification_status: 'verified',
        recognition_status: 'engineer_verified',
        verified_by: reviewer,
        verified_at: new Date().toISOString(),
        verification_notes: notes,
      },
      reviewer
    );
  }

  public rejectCandidateConnection(
    candidateId: string,
    reviewer = 'Process Safety Engineer',
    notes = 'Rejected by engineer'
  ): ConnectionCandidate | undefined {
    return this.updateCandidateConnection(
      candidateId,
      {
        verification_status: 'rejected',
        verified_by: reviewer,
        verified_at: new Date().toISOString(),
        verification_notes: notes,
      },
      reviewer
    );
  }

  /**
   * Idempotent Synchronization of verified / approved Connection Candidates into authoritative topology
   */
  public syncCandidateConnectionsToTopology(
    projectId: string,
    candidateIds: string[],
    reviewer = 'Process Safety Engineer'
  ): { success: boolean; synced_count: number; lines_added: number; error?: string } {
    const project = this.getProject(projectId);
    if (!project) return { success: false, synced_count: 0, lines_added: 0, error: 'Project not found' };

    let syncedCount = 0;
    let linesAdded = 0;
    const now = new Date().toISOString();

    for (const model of this.data.common_drawings || []) {
      for (const cand of model.connection_candidates) {
        if (!candidateIds.includes(cand.id)) continue;
        if (cand.verification_status === 'rejected') continue;

        // Idempotency check: see if a piping line with same from/to already exists
        const existingLine = this.data.lines.find(
          (l) =>
            l.project_id === projectId &&
            l.from_equipment.toUpperCase() === cand.source_equipment.toUpperCase() &&
            l.to_equipment.toUpperCase() === cand.destination_equipment.toUpperCase()
        );

        const lineTag = cand.line_number || `LINE-${cand.source_equipment}-${cand.destination_equipment}`;
        const streamId = cand.stream_id || `stream-${cand.id.substring(0, 8)}`;

        if (existingLine) {
          existingLine.status = 'confirmed';
          existingLine.functional_type = cand.functional_type;
          existingLine.flow_direction = cand.flow_direction;
          existingLine.confidence = Math.max(existingLine.confidence, cand.confidence);
          existingLine.updated_at = now;
          syncedCount++;
        } else {
          const newLine: PipingLine = {
            id: `line-${cand.id}`,
            project_id: projectId,
            document_id: model.document_id,
            line_number: lineTag,
            from_equipment: cand.source_equipment,
            to_equipment: cand.destination_equipment,
            size: '2"',
            material: 'CS',
            stream_label: `${cand.source_equipment} to ${cand.destination_equipment} Stream`,
            functional_type: cand.functional_type,
            flow_direction: cand.flow_direction,
            assigned_chemical_id: null,
            stream_id: streamId,
            confidence: cand.confidence,
            status: cand.verification_status === 'verified' ? 'confirmed' : 'provisional',
            source: {
              document: model.document_name,
              page: 1,
              snippet: `Reconciled connection: ${cand.source_equipment} -> ${cand.destination_equipment}`,
            },
            alerts: [],
            notes: `Synchronized from Hybrid P&ID engine (${cand.recognition_status}).`,
            machine_from: cand.source_equipment,
            machine_to: cand.destination_equipment,
            machine_line_number: lineTag,
            is_manual_entry: cand.is_manually_corrected || false,
            created_at: now,
          };
          this.data.lines.push(newLine);
          linesAdded++;
          syncedCount++;
        }

        // Also idempotently sync ProcessStream
        const existingStream = this.data.streams.find(
          (s) =>
            s.project_id === projectId &&
            s.source_equipment_tag.toUpperCase() === cand.source_equipment.toUpperCase() &&
            s.destination_equipment_tag.toUpperCase() === cand.destination_equipment.toUpperCase()
        );

        if (!existingStream) {
          const newStream: ProcessStream = {
            id: streamId,
            project_id: projectId,
            stream_number: `STR-${lineTag}`,
            source_equipment_id: null,
            source_equipment_tag: cand.source_equipment,
            destination_equipment_id: null,
            destination_equipment_tag: cand.destination_equipment,
            connected_line_id: `line-${cand.id}`,
            line_number: lineTag,
            material_description: `${cand.source_equipment} to ${cand.destination_equipment} Stream`,
            assigned_chemical_id: null,
            flow_direction: cand.flow_direction,
            flow_rates: cand.flow_rates || {
              normal: null,
              min: null,
              max: null,
              design: null,
              actual: null,
              unit: 'm3/h',
              basis: 'volumetric',
            },
            operating_pressure: { value: null, unit: 'bar(g)', status: 'not_provided' },
            operating_temperature: { value: null, unit: '°C', status: 'not_provided' },
            phase: null,
            pipe_nominal_diameter: '2"',
            pipe_spec: 'CS',
            associated_instrument_tags: [],
            source: {
              document: model.document_name,
              document_id: model.document_id,
              page: 1,
              snippet: `Hybrid connection: ${cand.source_equipment} -> ${cand.destination_equipment}`,
            },
            data_origin: cand.recognition_status === 'corroborated' ? 'hybrid' : 'manual_entry',
            verification_status: cand.verification_status === 'verified' ? 'verified' : 'unverified',
            verified_by: cand.verified_by || null,
            verified_at: cand.verified_at || null,
            notes: cand.conflict_details || null,
            created_at: now,
            updated_at: now,
          };
          this.data.streams.push(newStream);
        }

        this.logAudit({
          project_id: projectId,
          entity_type: 'line',
          entity_id: cand.id,
          action: 'create',
          reviewer,
          change_reason: `Synchronized connection candidate ${cand.source_equipment} -> ${cand.destination_equipment} (${cand.recognition_status})`,
        });
      }
    }

    this.saveDatabase();
    return { success: true, synced_count: syncedCount, lines_added: linesAdded };
  }

  // --- SUMMARY WITH PHA WORKFLOW STAGES ---
  public getDashboardSummary(projectId: string): ProjectDashboardSummary | undefined {
    const project = this.getProject(projectId);
    if (!project) return undefined;

    const docs = this.listDocuments(projectId);
    const chems = this.listChemicals(projectId);
    const conflicts = this.listConflicts(projectId);
    const eqList = this.listEquipment(projectId);
    const linesList = this.listLines(projectId);
    const phaNodes = this.listPhaNodes(projectId);
    const graphApproval = this.getGraphApproval(projectId);
    const hazopReadiness = this.getHazopReadiness(projectId);

    let totalFields = 0;
    let confirmedFields = 0;
    let needsReviewFields = 0;
    let missingFields = 0;
    let rejectedFields = 0;

    const psiKeys: (keyof PsiParameters)[] = [
      'toxicity',
      'permissible_exposure_limits',
      'physical_data',
      'reactivity_data',
      'corrosivity_data',
      'thermal_and_chemical_stability_data',
      'inadvertent_mixing_hazards',
    ];

    for (const chem of chems) {
      for (const k of psiKeys) {
        totalFields++;
        const status = chem.psi_parameters[k].review_status;
        if (status === 'confirmed') confirmedFields++;
        else if (status === 'needs_review') needsReviewFields++;
        else if (status === 'missing') missingFields++;
        else if (status === 'rejected') rejectedFields++;
      }
    }

    const completenessPct =
      totalFields > 0 ? Math.round((confirmedFields / totalFields) * 100) : 0;

    // Determine current PHA workflow stage
    let currentStage: PhaWorkflowStage = 'upload';
    if (docs.filter((d) => d.doc_type === 'pid').length === 0) {
      currentStage = 'upload';
    } else if (eqList.some((e) => e.status === 'provisional') || linesList.some((l) => l.status === 'provisional')) {
      currentStage = 'provisional_graph';
    } else if (!graphApproval.approved) {
      currentStage = 'graph_review';
    } else if (phaNodes.length === 0) {
      currentStage = 'node_segmentation';
    } else if (phaNodes.some((n) => n.status !== 'approved')) {
      currentStage = 'node_review';
    } else {
      currentStage = 'hazop_readiness';
    }

    // Calculate line and node connection breakdowns
    const connectedTags = new Set<string>();
    linesList.forEach((l) => {
      if (l.from_equipment) connectedTags.add(l.from_equipment.toUpperCase());
      if (l.to_equipment) connectedTags.add(l.to_equipment.toUpperCase());
    });
    const isolatedNodesCount = eqList.filter(
      (e) => !connectedTags.has(e.tag.toUpperCase()) && e.equipment_type !== 'instrument'
    ).length;

    const confirmedProcessEdges = linesList.filter(
      (l) => (l.functional_type || 'piping_line') === 'piping_line' && l.status === 'confirmed'
    ).length;
    const provisionalCandidateEdges = linesList.filter(
      (l) => (l.functional_type || 'piping_line') === 'piping_line' && l.status === 'provisional'
    ).length;
    const unresolvedConnections = linesList.filter(
      (l) => l.status === 'unresolved' || l.flow_direction === 'unknown'
    ).length;
    const signalOnlyConnections = linesList.filter(
      (l) => l.functional_type === 'signal_line'
    ).length;

    const streamsList = this.listStreams(projectId);
    const streamsWithFlow = streamsList.filter((s) => s.flow_rates.normal !== null || s.flow_rates.design !== null).length;
    const streamsMissingFlow = streamsList.filter((s) => s.flow_rates.normal === null && s.flow_rates.design === null).length;

    return {
      project,
      documents_count: docs.length,
      sds_count: docs.filter((d) => d.doc_type === 'sds').length,
      pid_count: docs.filter((d) => d.doc_type === 'pid').length,
      unreadable_docs_count: docs.filter((d) => !d.is_readable).length,
      chemicals_count: chems.length,
      completeness_pct: completenessPct,
      total_fields: totalFields,
      confirmed_fields: confirmedFields,
      needs_review_fields: needsReviewFields,
      missing_fields: missingFields,
      rejected_fields: rejectedFields,
      active_conflicts_count: conflicts.filter((c) => c.status === 'unresolved').length,
      equipment_nodes_count: eqList.length,
      provisional_equipment_count: eqList.filter((e) => e.status === 'provisional').length,
      confirmed_equipment_count: eqList.filter((e) => e.status === 'confirmed').length,
      provisional_lines_count: linesList.filter((l) => l.status === 'provisional').length,
      confirmed_lines_count: linesList.filter((l) => l.status === 'confirmed').length,
      confirmed_process_edges_count: confirmedProcessEdges,
      provisional_candidate_edges_count: provisionalCandidateEdges,
      unresolved_connections_count: unresolvedConnections,
      signal_only_connections_count: signalOnlyConnections,
      isolated_nodes_count: isolatedNodesCount,
      graph_approved: graphApproval.approved,
      pha_nodes_count: phaNodes.length,
      pha_approved_nodes_count: phaNodes.filter((n) => n.status === 'approved').length,
      streams_count: streamsList.length,
      streams_with_flow_count: streamsWithFlow,
      streams_missing_flow_count: streamsMissingFlow,
      hazop_ready: hazopReadiness.ready,
      current_stage: currentStage,
    };
  }

  // --- SEED SAMPLE DATA ---
  private seedSampleProject() {
    const sampleProjId = 'proj-sample-ammonia-demo';
    const sdsDocId1 = 'doc-sds-ammonia-apex';
    const sdsDocId2 = 'doc-sds-ammonia-chemcorp';
    const sdsDocId3 = 'doc-sds-bleach-apex';
    const pidDocId1 = 'doc-pid-refrigeration-loop';
    const pidDocId2 = 'doc-pid-scanned-archive';

    const sampleProject: ProcessProject = {
      id: sampleProjId,
      name: 'OSHA PSM Ammonia Refrigeration & Dosing Loop',
      description:
        'Industrial industrial refrigeration loop with sodium hypochlorite water treatment dosing skid. Demonstrates OSHA 1910.119(d)(1) extraction, multi-vendor SDS conflict detection, P&ID topology editing, and PHA study node segmentation.',
      created_at: new Date('2026-03-15T08:00:00Z').toISOString(),
      updated_at: new Date().toISOString(),
      is_sample: true,
    };

    const now = new Date().toISOString();

    const sampleDocs: DocumentRecord[] = [
      {
        id: sdsDocId1,
        project_id: sampleProjId,
        name: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
        original_filename: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
        file_path: '/uploads/sample_ammonia_apex.pdf',
        mime_type: 'application/pdf',
        size_bytes: 412500,
        doc_type: 'sds',
        upload_timestamp: new Date('2026-03-15T08:05:00Z').toISOString(),
        pages_count: 8,
        is_readable: true,
        chemical_ids: ['chem-ammonia-apex'],
      },
      {
        id: sdsDocId2,
        project_id: sampleProjId,
        name: 'ChemCorp_Anhydrous_Ammonia_SDS_2022.pdf',
        original_filename: 'ChemCorp_Anhydrous_Ammonia_SDS_2022.pdf',
        file_path: '/uploads/sample_ammonia_chemcorp.pdf',
        mime_type: 'application/pdf',
        size_bytes: 388100,
        doc_type: 'sds',
        upload_timestamp: new Date('2026-03-15T08:06:00Z').toISOString(),
        pages_count: 6,
        is_readable: true,
        chemical_ids: ['chem-ammonia-chemcorp'],
      },
      {
        id: sdsDocId3,
        project_id: sampleProjId,
        name: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
        original_filename: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
        file_path: '/uploads/sample_bleach_apex.pdf',
        mime_type: 'application/pdf',
        size_bytes: 350200,
        doc_type: 'sds',
        upload_timestamp: new Date('2026-03-15T08:08:00Z').toISOString(),
        pages_count: 7,
        is_readable: true,
        chemical_ids: ['chem-bleach-apex'],
      },
      {
        id: pidDocId1,
        project_id: sampleProjId,
        name: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
        original_filename: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
        file_path: '/uploads/sample_pid_diagram.png',
        mime_type: 'image/png',
        size_bytes: 1250000,
        doc_type: 'pid',
        upload_timestamp: new Date('2026-03-15T08:10:00Z').toISOString(),
        pages_count: 1,
        is_readable: true,
        chemical_ids: [],
      },
      {
        id: pidDocId2,
        project_id: sampleProjId,
        name: 'LEGACY_SCAN_1998_WATER_TREATMENT_PID.pdf',
        original_filename: 'LEGACY_SCAN_1998_WATER_TREATMENT_PID.pdf',
        file_path: '/uploads/sample_legacy_scan.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2890000,
        doc_type: 'pid',
        upload_timestamp: new Date('2026-03-15T08:12:00Z').toISOString(),
        pages_count: 2,
        is_readable: false,
        unreadable_reason:
          'Document contains virtually no extractable digital text. Scanned image requiring OCR.',
        is_scanned_ocr_attempted: true,
        chemical_ids: [],
      },
    ];

    // Seed equipment with full machine attributes
    const sampleEquipment: EquipmentTag[] = [
      {
        id: 'eq-v101',
        project_id: sampleProjId,
        document_id: pidDocId1,
        tag: 'V-101',
        description: 'Ammonia High-Pressure Receiver Drum (12,000 Gallons)',
        equipment_type: 'vessel',
        assigned_chemical_id: 'chem-ammonia-apex',
        confidence: 0.95,
        status: 'confirmed',
        source: {
          document: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
          page: 1,
          snippet: 'V-101 NH3 High-Pressure Liquid Receiver Drum',
          bbox: { x: 180, y: 150, w: 120, h: 70 },
        },
        machine_tag: 'V-101',
        machine_type: 'vessel',
        machine_description: 'Receiver Drum',
        notes: 'Confirmed ASME Section VIII Div 1 pressure vessel for ammonia service.',
        specifications: {
          material_of_construction: {
            value: 'Unknown',
            unit: null,
            status: 'not_provided',
            verification_status: 'unverified',
            source_document_name: 'Not provided',
            conflicting_records: [],
            change_history: [],
          },
          design_pressure: {
            value: null,
            unit: 'psig',
            status: 'not_provided',
            verification_status: 'unverified',
            source_document_name: 'Not provided',
            conflicting_records: [],
            change_history: [],
          },
          design_temperature: {
            value: null,
            unit: '°F',
            status: 'not_provided',
            verification_status: 'unverified',
            source_document_name: 'Not provided',
            conflicting_records: [],
            change_history: [],
          },
          capacity: {
            value: null,
            unit: 'gallons',
            capacity_type: 'total_volume',
            status: 'not_provided',
            verification_status: 'unverified',
            source_document_name: 'Not provided',
            conflicting_records: [],
            change_history: [],
          },
        },
        specifications_revision: 1,
        specifications_updated_at: now,
        created_at: now,
      },
      {
        id: 'eq-p101a',
        project_id: sampleProjId,
        document_id: pidDocId1,
        tag: 'P-101A',
        description: 'Liquid Ammonia Recirculation Pump A (Hermetic Canned Motor)',
        equipment_type: 'pump',
        assigned_chemical_id: 'chem-ammonia-apex',
        confidence: 0.92,
        status: 'confirmed',
        source: {
          document: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
          page: 1,
          snippet: 'P-101A Ammonia Recirc Pump (Sealless design)',
          bbox: { x: 380, y: 320, w: 90, h: 60 },
        },
        machine_tag: 'P-101A',
        machine_type: 'pump',
        machine_description: 'Ammonia Recirc Pump',
        notes: 'Dual containment canned pump to prevent shaft seal ammonia leaks.',
        specifications: createDefaultSpecifications('pump'),
        specifications_revision: 1,
        specifications_updated_at: now,
        created_at: now,
      },
      {
        id: 'eq-e101',
        project_id: sampleProjId,
        document_id: pidDocId1,
        tag: 'E-101',
        description: 'Ammonia Evaporative Condenser',
        equipment_type: 'heat_exchanger',
        assigned_chemical_id: 'chem-ammonia-apex',
        confidence: 0.91,
        status: 'confirmed',
        source: {
          document: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
          page: 1,
          snippet: 'E-101 Hot Gas Ammonia Condenser Coil',
          bbox: { x: 560, y: 140, w: 130, h: 80 },
        },
        machine_tag: 'E-101',
        machine_type: 'heat_exchanger',
        machine_description: 'Condenser Coil',
        notes: 'Hot-dip galvanized steel coil. Copper alloys prohibited.',
        specifications: createDefaultSpecifications('heat_exchanger'),
        specifications_revision: 1,
        specifications_updated_at: now,
        created_at: now,
      },
      {
        id: 'eq-tk201',
        project_id: sampleProjId,
        document_id: pidDocId1,
        tag: 'TK-201',
        description: 'Water Treatment Sodium Hypochlorite Dosing Day Tank',
        equipment_type: 'tank',
        assigned_chemical_id: 'chem-bleach-apex',
        confidence: 0.88,
        status: 'confirmed',
        source: {
          document: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
          page: 1,
          snippet: 'TK-201 Bleach Dosing Tank (Crosslinked Polyethylene XLPE)',
          bbox: { x: 180, y: 360, w: 100, h: 70 },
        },
        machine_tag: 'TK-201',
        machine_type: 'tank',
        machine_description: 'Bleach Dosing Tank',
        notes: 'Dedicated chemical feed tank. Strict physical separation from ammonia loop.',
        specifications: createDefaultSpecifications('tank'),
        specifications_revision: 1,
        specifications_updated_at: now,
        created_at: now,
      },
    ];

    // Seed lines with functional type and flow direction
    const sampleLines: PipingLine[] = [
      {
        id: 'line-3nh3-101',
        project_id: sampleProjId,
        document_id: pidDocId1,
        line_number: '3"-NH3-101-CS',
        from_equipment: 'V-101',
        to_equipment: 'P-101A',
        size: '3"',
        material: 'CS (ASTM A333 Grade 6)',
        stream_label: 'Liquid Ammonia Recirculation Suction',
        functional_type: 'piping_line',
        flow_direction: 'forward',
        assigned_chemical_id: 'chem-ammonia-apex',
        confidence: 0.95,
        status: 'confirmed',
        source: {
          document: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
          page: 1,
          snippet: '3"-NH3-101-CS from V-101 sump to P-101A suction',
        },
        alerts: ['Exposure Threshold: OSHA PEL 50 ppm, IDLH 300 ppm'],
        notes: 'Low-temperature impact tested carbon steel.',
        machine_from: 'V-101',
        machine_to: 'P-101A',
        machine_line_number: '3"-NH3-101-CS',
        created_at: now,
      },
      {
        id: 'line-15bl-201',
        project_id: sampleProjId,
        document_id: pidDocId1,
        line_number: '1.5"-BL-201-PVC',
        from_equipment: 'TK-201',
        to_equipment: 'V-101',
        size: '1.5"',
        material: 'PVC Schedule 80',
        stream_label: 'Sodium Hypochlorite Biocide Dosing Line',
        functional_type: 'piping_line',
        flow_direction: 'forward',
        assigned_chemical_id: 'chem-bleach-apex',
        confidence: 0.88,
        status: 'confirmed',
        source: {
          document: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
          page: 1,
          snippet: '1.5"-BL-201-PVC dosing tie-in to water cooling loop / receiver jacket',
        },
        alerts: [
          'Inadvertent Mixing Alert: Direct connection to Ammonia vessel V-101',
          'Corrosivity Profile: Strongly alkaline pH 12-13',
        ],
        notes: 'CRITICAL HAZOP FINDING: Cross-connection between bleach dosing and ammonia equipment creates inadvertent mixing risk.',
        machine_from: 'TK-201',
        machine_to: 'V-101',
        machine_line_number: '1.5"-BL-201-PVC',
        created_at: now,
      },
    ];

    // Seed graph approval for demo
    this.data.graph_approvals[sampleProjId] = {
      approved: true,
      approved_by: 'Lead Process Safety Engineer (PE)',
      approved_at: new Date('2026-03-15T08:30:00Z').toISOString(),
      notes: 'Initial engineering review approved for demonstration worked example.',
    };

    // Seed candidate PHA study nodes for demo
    const samplePhaNodes: PhaStudyNode[] = [
      {
        id: 'pha-sample-node-1',
        project_id: sampleProjId,
        node_id: 'N-001',
        name: 'High-Pressure Ammonia Storage & Pumping',
        design_intent: 'Accumulate liquid ammonia refrigerant at condensing pressure (12-15 bar) and recirculate via canned pump P-101A to chillers.',
        equipment_tags: ['V-101', 'P-101A'],
        line_numbers: ['3"-NH3-101-CS'],
        inlet_boundaries: ['Condenser E-101 liquid drain line'],
        outlet_boundaries: ['P-101A discharge header'],
        basis_for_grouping: 'Continuous high-pressure liquid inventory subsystem.',
        status: 'approved',
        unresolved_questions: ['Confirm pump cavitation NPSH margin at low liquid level'],
        operating_limits: {
          temperature_safe_upper: 38,
          temperature_safe_lower: -33,
          pressure_safe_upper: 18.5,
          pressure_safe_lower: 1.0,
          flow_safe_upper: 45,
          flow_safe_lower: 5,
          units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' },
        },
        reviewed_by: 'HAZOP Team Leader (CFSE)',
        approved_at: new Date('2026-03-15T09:00:00Z').toISOString(),
        created_at: now,
        updated_at: now,
      },
      {
        id: 'pha-sample-node-2',
        project_id: sampleProjId,
        node_id: 'N-002',
        name: 'Cooling Water Biocide Dosing Skid',
        design_intent: 'Store aqueous sodium hypochlorite (12.5%) in day tank TK-201 and meter into cooling tower basin at 5-10 L/h.',
        equipment_tags: ['TK-201'],
        line_numbers: ['1.5"-BL-201-PVC'],
        inlet_boundaries: ['Chemical tote refill connection'],
        outlet_boundaries: ['Check valve at biocide injection quill'],
        basis_for_grouping: 'Secondary chemical storage and metering boundary.',
        status: 'approved',
        unresolved_questions: ['Ensure no cross-connection with ammonia refrigerant loop'],
        operating_limits: {
          temperature_safe_upper: 35,
          temperature_safe_lower: 5,
          pressure_safe_upper: 3.5,
          pressure_safe_lower: 0.1,
          flow_safe_upper: 15,
          flow_safe_lower: 1,
          units: { temperature: '°C', pressure: 'bar(g)', flow: 'L/h' },
        },
        reviewed_by: 'HAZOP Team Leader (CFSE)',
        approved_at: new Date('2026-03-15T09:15:00Z').toISOString(),
        created_at: now,
        updated_at: now,
      },
    ];

    this.data.projects.push(sampleProject);
    this.data.documents.push(...sampleDocs);
    this.data.equipment.push(...sampleEquipment);
    this.data.lines.push(...sampleLines);
    this.data.pha_nodes.push(...samplePhaNodes);

    this.seedSampleStreams(sampleProjId);
    this.seedSampleDrawing();
    this.saveDatabase();
  }

  public seedSampleStreams(projectId: string = 'proj-sample-ammonia-demo'): ProcessStream[] {
    const existing = this.data.streams.filter((s) => s.project_id === projectId);
    if (existing.length > 0) return existing;

    const now = new Date().toISOString();
    const sampleStreams: ProcessStream[] = [
      {
        id: 'stream-nh3-101',
        project_id: projectId,
        stream_number: 'STR-101',
        source_equipment_id: 'eq-v101',
        source_equipment_tag: 'V-101',
        destination_equipment_id: 'eq-p101a',
        destination_equipment_tag: 'P-101A',
        connected_line_id: 'line-3nh3-101',
        line_number: '3"-NH3-101-CS',
        material_description: 'Anhydrous Ammonia (Liquid Refrigerant)',
        assigned_chemical_id: 'chem-ammonia-apex',
        flow_direction: 'forward',
        flow_rates: {
          normal: 25.0,
          min: 8.0,
          max: 35.0,
          design: 40.0,
          actual: 24.8,
          unit: 'm3/h',
          basis: 'volumetric',
        },
        operating_pressure: {
          value: 13.5,
          unit: 'bar(g)',
          status: 'verified',
        },
        operating_temperature: {
          value: -10.0,
          unit: '°C',
          status: 'verified',
        },
        phase: 'liquid',
        pipe_nominal_diameter: '3"',
        pipe_spec: 'CS (ASTM A333 Grade 6)',
        associated_instrument_tags: ['FIT-101', 'FIC-101', 'FCV-101', 'FAL-101'],
        source: {
          document: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
          page: 1,
          snippet: '3"-NH3-101-CS from V-101 sump to P-101A suction. Normal: 25 m3/h, Design: 40 m3/h',
        },
        data_origin: 'extracted',
        verification_status: 'verified',
        verified_by: 'Lead Process Safety Engineer (PE)',
        verified_at: new Date('2026-03-15T08:30:00Z').toISOString(),
        notes: 'Primary liquid ammonia recirculation suction stream.',
        created_at: now,
        updated_at: now,
      },
      {
        id: 'stream-bleach-201',
        project_id: projectId,
        stream_number: 'STR-201',
        source_equipment_id: 'eq-tk201',
        source_equipment_tag: 'TK-201',
        destination_equipment_id: 'eq-v101',
        destination_equipment_tag: 'V-101',
        connected_line_id: 'line-15bl-201',
        line_number: '1.5"-BL-201-PVC',
        material_description: 'Sodium Hypochlorite Solution 12.5%',
        assigned_chemical_id: 'chem-bleach-apex',
        flow_direction: 'forward',
        flow_rates: {
          normal: 0.15,
          min: 0.05,
          max: 0.30,
          design: 0.50,
          actual: 0.14,
          unit: 'm3/h',
          basis: 'volumetric',
        },
        operating_pressure: {
          value: 2.2,
          unit: 'bar(g)',
          status: 'verified',
        },
        operating_temperature: {
          value: 20.0,
          unit: '°C',
          status: 'verified',
        },
        phase: 'liquid',
        pipe_nominal_diameter: '1.5"',
        pipe_spec: 'PVC Schedule 80',
        associated_instrument_tags: ['FI-201', 'FT-201', 'FCV-201'],
        source: {
          document: 'PID-104-NH3-REFRIGERATION-MAIN-P&ID.png',
          page: 1,
          snippet: '1.5"-BL-201-PVC dosing tie-in to water cooling loop / receiver jacket. Normal: 0.15 m3/h',
        },
        data_origin: 'extracted',
        verification_status: 'verified',
        verified_by: 'Lead Process Safety Engineer (PE)',
        verified_at: new Date('2026-03-15T08:30:00Z').toISOString(),
        notes: 'Chemical biocide dosing tie-in line.',
        created_at: now,
        updated_at: now,
      },
    ];

    this.data.streams.push(...sampleStreams);
    // Link streams to lines
    for (const stream of sampleStreams) {
      if (stream.connected_line_id) {
        const line = this.data.lines.find((l) => l.id === stream.connected_line_id);
        if (line) line.stream_id = stream.id;
      }
    }
    this.saveDatabase();
    return sampleStreams;
  }

  public seedSampleDrawing(projectId: string = 'proj-sample-ammonia-demo'): DigitalPidDrawing {
    const existing = this.data.drawings.find((d) => d.project_id === projectId);
    if (existing) return existing;

    const sampleProjId = projectId;

    const now = new Date().toISOString();
    const sampleDrawing: DigitalPidDrawing = {
      id: projectId === 'proj-sample-ammonia-demo' ? 'draw-ammonia-demo-1' : `draw-${projectId}-1`,
      project_id: sampleProjId,
      source_document_id: 'doc-pid-refrigeration-loop',
      source_document_page: 1,
      title: 'Industrial Ammonia Refrigeration & Dosing Skid P&ID',
      drawing_number: 'PID-104-NH3-REV-0',
      revision: 'REV 0',
      mode: 'imported_overlay',
      status: 'approved',
      background_visible: true,
      background_opacity: 0.35,
      elements: [
        {
          id: 'elem-v101',
          tag: 'V-101',
          type: 'vessel',
          description: 'Ammonia High-Pressure Receiver Drum (12,000 Gallons)',
          position: { x: 380, y: 220 },
          size: { width: 110, height: 160 },
          rotation: 0,
          assigned_chemical_id: 'chem-ammonia-chemcorp',
          status: 'confirmed',
          confidence: 0.95,
          notes: 'ASME Section VIII Div 1 receiver drum for ammonia service.',
          specifications: {
            material_of_construction: {
              value: 'Unknown',
              unit: null,
              status: 'not_provided',
              verification_status: 'unverified',
              source_document_name: 'Not provided',
              conflicting_records: [],
              change_history: [],
            },
            design_pressure: {
              value: null,
              unit: 'psig',
              status: 'not_provided',
              verification_status: 'unverified',
              source_document_name: 'Not provided',
              conflicting_records: [],
              change_history: [],
            },
            design_temperature: {
              value: null,
              unit: '°F',
              status: 'not_provided',
              verification_status: 'unverified',
              source_document_name: 'Not provided',
              conflicting_records: [],
              change_history: [],
            },
            capacity: {
              value: null,
              unit: 'gallons',
              capacity_type: 'total_volume',
              status: 'not_provided',
              verification_status: 'unverified',
              source_document_name: 'Not provided',
              conflicting_records: [],
              change_history: [],
            },
          },
          ports: [
            { id: 'p-top', name: 'Hot Gas Inlet', type: 'inlet', position: { x: 0, y: -80 } },
            { id: 'p-bottom', name: 'Liquid Suction Outlet', type: 'outlet', position: { x: 0, y: 80 } },
            { id: 'p-left', name: 'Tie-in Connection', type: 'inlet', position: { x: -55, y: 0 } },
            { id: 'p-right', name: 'Relief / Vent Nozzle', type: 'outlet', position: { x: 55, y: 0 } },
          ],
        },
        {
          id: 'elem-p101a',
          tag: 'P-101A',
          type: 'pump',
          description: 'Liquid Ammonia Recirculation Pump A (Hermetic Canned Motor)',
          position: { x: 600, y: 300 },
          size: { width: 90, height: 80 },
          rotation: 0,
          assigned_chemical_id: 'chem-ammonia-apex',
          status: 'confirmed',
          confidence: 0.92,
          notes: 'Dual containment sealless canned pump.',
          ports: [
            { id: 'p-suction', name: 'Suction Inlet', type: 'inlet', position: { x: -45, y: 0 } },
            { id: 'p-discharge', name: 'Discharge Outlet', type: 'outlet', position: { x: 0, y: -40 } },
          ],
        },
        {
          id: 'elem-e101',
          tag: 'E-101',
          type: 'heat_exchanger',
          description: 'Ammonia Evaporative Condenser',
          position: { x: 380, y: 60 },
          size: { width: 130, height: 75 },
          rotation: 0,
          assigned_chemical_id: 'chem-ammonia-apex',
          status: 'confirmed',
          confidence: 0.91,
          notes: 'Hot-dip galvanized coil.',
          ports: [
            { id: 'p-in', name: 'Vapor Inlet', type: 'inlet', position: { x: -65, y: 0 } },
            { id: 'p-out', name: 'Liquid Condensate Outlet', type: 'outlet', position: { x: 65, y: 0 } },
          ],
        },
        {
          id: 'elem-tk201',
          tag: 'TK-201',
          type: 'tank',
          description: 'Water Treatment Sodium Hypochlorite Dosing Day Tank',
          position: { x: 120, y: 220 },
          size: { width: 100, height: 130 },
          rotation: 0,
          assigned_chemical_id: 'chem-bleach-apex',
          status: 'confirmed',
          confidence: 0.88,
          notes: 'Crosslinked Polyethylene (XLPE) bleach tank.',
          ports: [
            { id: 'p-fill', name: 'Fill Top Connection', type: 'inlet', position: { x: 0, y: -65 } },
            { id: 'p-outlet', name: 'Dosing Outlet', type: 'outlet', position: { x: 50, y: 30 } },
            { id: 'p-drain', name: 'Drain Bottom', type: 'outlet', position: { x: 0, y: 65 } },
          ],
        },
        {
          id: 'elem-hv101',
          tag: 'HV-101',
          type: 'manual_valve',
          description: 'Isolation Ball Valve (PVC)',
          position: { x: 250, y: 250 },
          size: { width: 44, height: 32 },
          rotation: 0,
          assigned_chemical_id: 'chem-bleach-apex',
          status: 'confirmed',
          confidence: 0.95,
          notes: 'Quarter-turn true union ball valve.',
          ports: [
            { id: 'p-in', name: 'Valve Inlet', type: 'inlet', position: { x: -22, y: 0 } },
            { id: 'p-out', name: 'Valve Outlet', type: 'outlet', position: { x: 22, y: 0 } },
          ],
        },
        {
          id: 'elem-fit101',
          tag: 'FIT-101',
          type: 'instrument',
          instrument_type: 'flow',
          description: 'Magnetic Flow Transmitter (Ammonia Recirculation)',
          position: { x: 600, y: 170 },
          size: { width: 50, height: 50 },
          rotation: 0,
          assigned_chemical_id: null,
          status: 'confirmed',
          confidence: 0.95,
          notes: 'ISA 5.1 Tag Balloon FIT-101. 4-20mA loop.',
          ports: [
            { id: 'p-signal', name: 'Signal Loop', type: 'signal', position: { x: 0, y: 25 } },
          ],
        },
      ],
      connectors: [
        {
          id: 'conn-3nh3-101',
          line_number: '3"-NH3-101-CS',
          from_element_id: 'elem-v101',
          from_port_id: 'p-bottom',
          to_element_id: 'elem-p101a',
          to_port_id: 'p-suction',
          functional_type: 'piping_line',
          flow_direction: 'forward',
          size: '3"',
          material: 'CS',
          stream_label: 'Ammonia Suction',
          assigned_chemical_id: 'chem-ammonia-apex',
          status: 'confirmed',
          confidence: 0.95,
          waypoints: [
            { x: 380, y: 300 },
            { x: 555, y: 300 },
          ],
        },
        {
          id: 'conn-15bl-201',
          line_number: '1.5"-BL-201-PVC',
          from_element_id: 'elem-tk201',
          from_port_id: 'p-outlet',
          to_element_id: 'elem-v101',
          to_port_id: 'p-left',
          functional_type: 'piping_line',
          flow_direction: 'forward',
          size: '1.5"',
          material: 'PVC',
          stream_label: 'Bleach Dosing Tie-in',
          assigned_chemical_id: 'chem-bleach-apex',
          status: 'confirmed',
          confidence: 0.88,
          waypoints: [
            { x: 200, y: 250 },
            { x: 325, y: 220 },
          ],
        },
        {
          id: 'conn-sig-101',
          line_number: 'SIG-101',
          from_element_id: 'elem-fit101',
          from_port_id: 'p-signal',
          to_element_id: 'elem-v101',
          to_port_id: 'p-right',
          functional_type: 'signal_line',
          flow_direction: 'forward',
          stream_label: '4-20mA Flow Signal',
          assigned_chemical_id: null,
          status: 'confirmed',
          confidence: 0.95,
          waypoints: [
            { x: 600, y: 220 },
            { x: 435, y: 220 },
          ],
        },
      ],
      created_at: now,
      updated_at: now,
      approved_at: new Date('2026-03-15T08:30:00Z').toISOString(),
      approved_by: 'Lead Process Safety Engineer (PE)',
      approval_notes: 'Digital P&ID approved for baseline PSM review and PHA node segmentation.',
      change_log: [
        {
          timestamp: now,
          author: 'Lead Process Safety Engineer (PE)',
          notes: 'Baseline approved digital P&ID representation.',
          revision: 'REV 0',
        },
      ],
    };

    this.data.drawings.push(sampleDrawing);
    this.saveDatabase();
    return sampleDrawing;
  }
}

export const store = new PsiDataStore();
