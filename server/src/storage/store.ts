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
} from '../types';
import { detectConflictsForProject } from '../services/conflictDetector';
import { validateProcessGraph } from '../services/graphValidationService';
import { buildProcessTopologyGraph } from '../services/graphService';
import {
  generateCandidatePhaNodes,
  checkHazopReadiness,
  evaluateNodeSpecifications,
} from '../services/phaService';
import { validateDigitalDrawing } from '../services/drawingValidationService';

interface DatabaseSchema {
  projects: ProcessProject[];
  documents: DocumentRecord[];
  chemicals: ChemicalRecord[];
  equipment: EquipmentTag[];
  lines: PipingLine[];
  conflicts: ChemicalConflict[];
  audit_log: AuditTrailEntry[];
  graph_approvals: Record<string, GraphApprovalRecord>;
  pha_nodes: PhaStudyNode[];
  acknowledged_warnings: Record<string, string[]>;
  drawings: DigitalPidDrawing[];
  drawing_acknowledged_warnings: Record<string, string[]>;
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
    conflicts: [],
    audit_log: [],
    graph_approvals: {},
    pha_nodes: [],
    acknowledged_warnings: {},
    drawings: [],
    drawing_acknowledged_warnings: {},
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
          conflicts: parsed.conflicts || [],
          audit_log: parsed.audit_log || [],
          graph_approvals: parsed.graph_approvals || {},
          pha_nodes: parsed.pha_nodes || [],
          acknowledged_warnings: parsed.acknowledged_warnings || {},
          drawings: parsed.drawings || [],
          drawing_acknowledged_warnings: parsed.drawing_acknowledged_warnings || {},
        };
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
    this.data.chemicals = this.data.chemicals.filter(
      (c) => c.sds_document_id !== id && !deletedChemIds.has(c.id)
    );

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
    this.data.chemicals.push(chem);
    const projectChems = this.listChemicals(chem.project_id);
    const existingConflicts = this.data.conflicts.filter((c) => c.project_id === chem.project_id);
    const updatedConflicts = detectConflictsForProject(projectChems, chem.project_id, existingConflicts);

    this.data.conflicts = [
      ...this.data.conflicts.filter((c) => c.project_id !== chem.project_id),
      ...updatedConflicts,
    ];
    this.saveDatabase();
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
      const existingIdx = this.data.equipment.findIndex((e) => e.id === tag.id);
      if (existingIdx >= 0) {
        this.data.equipment[existingIdx] = tag;
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
      const existingIdx = this.data.lines.findIndex((l) => l.id === line.id);
      if (existingIdx >= 0) {
        this.data.lines[existingIdx] = line;
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

  // --- GRAPH VALIDATION & APPROVAL GATES ---
  public getProcessTopologyGraph(projectId: string): TopologyGraph {
    const eq = this.listEquipment(projectId);
    const lines = this.listLines(projectId);
    const chems = this.listChemicals(projectId);
    const conflicts = this.listConflicts(projectId);
    return buildProcessTopologyGraph(eq, lines, chems, conflicts);
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
    return this.data.pha_nodes.filter((n) => n.project_id === projectId);
  }

  public generatePhaNodes(
    projectId: string,
    reviewer = 'Process Engineer'
  ): PhaStudyNode[] {
    const eq = this.listEquipment(projectId);
    const lines = this.listLines(projectId);

    const candidates = generateCandidatePhaNodes(projectId, eq, lines);

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
    const approval = this.getGraphApproval(projectId);

    return checkHazopReadiness(eq, lines, chems, nodes, approval.approved);
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

    this.seedSampleDrawing();
    this.saveDatabase();
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
