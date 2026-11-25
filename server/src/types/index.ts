export type ReviewStatus =
  | 'needs_review'
  | 'confirmed'
  | 'rejected'
  | 'missing'
  | 'extracted'
  | 'not_found'
  | 'extraction_failed';

export type CategoryExtractionStatus =
  | 'extracted'
  | 'not_found'
  | 'needs_review'
  | 'extraction_failed';

export interface CategoryFinding {
  field?: string;
  value: string;
  units?: string | null;
  qualifier?: string | null;
  test_conditions?: string | null;
}

export interface CategoryExtractionResult {
  status: CategoryExtractionStatus;
  findings: CategoryFinding[];
  source_sections: string[];
  evidence: string[];
  summary?: string | null;
  missing_reason?: string | null;
}

export interface StructuredSdsExtraction {
  chemical_identity: {
    name: string | null;
    cas_number: string | null;
    molecular_formula: string | null;
    molecular_weight: string | null;
  };
  psi: {
    toxicity: CategoryExtractionResult;
    exposure_limits: CategoryExtractionResult;
    physical_data: CategoryExtractionResult;
    reactivity: CategoryExtractionResult;
    corrosivity: CategoryExtractionResult;
    thermal_chemical_stability: CategoryExtractionResult;
    hazardous_effects_of_inadvertent_mixing: CategoryExtractionResult;
  };
  extraction_metadata: {
    document_name: string | null;
    pages_processed: number[];
    extraction_status: 'complete' | 'partial' | 'failed';
    warnings: string[];
  };
}

export interface FieldSource {
  document: string;
  document_id: string;
  page: number | null;
  section: string | null;
  snippet: string | null;
}

export interface PsiFieldRecord {
  value: string | null;
  machine_value: string | null;
  user_value: string | null;
  source: FieldSource;
  confidence: number;
  review_status: ReviewStatus;
  entry_method?: 'manual' | 'machine' | 'hybrid';
  verification_status?: 'unverified' | 'verified';
  verified_by?: string | null;
  verified_at?: string | null;
  notes?: string;
  units?: string | null;
  updated_at?: string;
  missing_reason?: string | null;
  category_status?: CategoryExtractionStatus;
  findings?: CategoryFinding[];
  source_sections?: string[];
  evidence?: string[];
}

export interface PsiParameters {
  toxicity: PsiFieldRecord;
  permissible_exposure_limits: PsiFieldRecord;
  physical_data: PsiFieldRecord;
  reactivity_data: PsiFieldRecord;
  corrosivity_data: PsiFieldRecord;
  thermal_and_chemical_stability_data: PsiFieldRecord;
  inadvertent_mixing_hazards: PsiFieldRecord;
}

export type ChemicalOrigin = 'sds_extracted' | 'manual_entry' | 'hybrid';
export type ChemicalRecordStatus = 'draft' | 'active' | 'archived';
export type CompositionType = 'pure_substance' | 'mixture' | 'solution';

export interface StructuredExposureLimit {
  authority: 'OSHA_PEL' | 'ACGIH_TLV' | 'NIOSH_REL';
  value: number | null;
  unit: string | null;
  averaging_period: string | null;
  source_reference?: string | null;
}

export interface StructuredPhysicalProperty {
  property_name: string;
  value: number | string | null;
  unit: string | null;
  conditions?: string | null;
}

export interface StructuredPsiParameters {
  toxicity?: {
    acute_toxicity_summary?: string | null;
    exposure_routes?: string[];
    target_organs?: string[];
    ghs_classification?: string | null;
  };
  permissible_exposure_limits?: {
    limits?: StructuredExposureLimit[];
  };
  physical_data?: {
    physical_state?: string | null;
    boiling_point?: StructuredPhysicalProperty | null;
    melting_point?: StructuredPhysicalProperty | null;
    vapor_pressure?: StructuredPhysicalProperty | null;
    vapor_density?: StructuredPhysicalProperty | null;
    specific_gravity?: StructuredPhysicalProperty | null;
    solubility?: string | null;
    flash_point?: StructuredPhysicalProperty | null;
  };
  reactivity_data?: {
    conditions_to_avoid?: string[];
    incompatible_materials?: string[];
    polymerization_risk?: boolean | null;
  };
  corrosivity_data?: {
    ph?: number | null;
    materials_attacked?: string[];
    corrosion_rate_notes?: string | null;
  };
  thermal_and_chemical_stability_data?: {
    is_stable?: boolean | null;
    decomposition_temperature?: StructuredPhysicalProperty | null;
    decomposition_products?: string[];
  };
  inadvertent_mixing_hazards?: {
    incompatible_chemicals?: string[];
    hazardous_reactions?: string[];
    mixing_scenarios?: string[];
  };
}

export interface ChemicalAuditEntry {
  timestamp: string;
  author: string;
  action: 'create' | 'update' | 'verify' | 'draft_save' | 'conflict_detected' | 'sds_linked';
  field?: string;
  change_summary: string;
}

export interface ChemicalDuplicateMatch {
  chemical: ChemicalRecord;
  match_type: 'exact_cas' | 'exact_name' | 'similar_name';
  match_reason: string;
}

export interface CreateManualChemicalInput {
  project_id: string;
  chemical_name: string;
  cas_number?: string | null;
  synonyms?: string[];
  molecular_formula?: string | null;
  molecular_weight?: { value: number | null; unit: string } | null;
  physical_state?: string | null;
  composition_type?: CompositionType | null;
  concentration?: string | null;
  description?: string | null;
  manufacturer?: string | null;
  sds_revision_date?: string | null;
  record_status?: ChemicalRecordStatus;
  psi_parameters?: Partial<Record<keyof PsiParameters, {
    value?: string | null;
    units?: string | null;
    notes?: string;
    review_status?: ReviewStatus;
    verification_status?: 'unverified' | 'verified';
    source_document?: string | null;
    source_page?: number | null;
    source_section?: string | null;
  }>>;
  structured_psi?: StructuredPsiParameters;
  reviewer?: string;
}

export interface UpdateChemicalInput extends Partial<CreateManualChemicalInput> {
  change_reason?: string;
}

export interface ChemicalRecord {
  id: string;
  project_id: string;
  sds_document_id: string;
  origin?: ChemicalOrigin;
  record_status?: ChemicalRecordStatus;
  chemical_name: PsiFieldRecord;
  cas_number: PsiFieldRecord;
  sds_revision_date: PsiFieldRecord;
  manufacturer: PsiFieldRecord;
  psi_parameters: PsiParameters;
  synonyms?: string[];
  molecular_formula?: string | null;
  molecular_weight?: { value: number | null; unit: string } | null;
  physical_state?: string | null;
  composition_type?: CompositionType | null;
  concentration?: string | null;
  description?: string | null;
  structured_psi?: StructuredPsiParameters;
  structured_extraction?: StructuredSdsExtraction;
  audit_history?: ChemicalAuditEntry[];
  created_at: string;
  updated_at: string;
}

export function createEmptyPsiFieldRecord(
  fieldName: string,
  entryMethod: 'manual' | 'machine' = 'manual'
): PsiFieldRecord {
  return {
    value: null,
    machine_value: null,
    user_value: null,
    source: {
      document: entryMethod === 'manual' ? 'Manual Entry' : 'SDS',
      document_id: entryMethod === 'manual' ? 'manual' : '',
      page: null,
      section: null,
      snippet: null,
    },
    confidence: entryMethod === 'manual' ? 1.0 : 0.0,
    review_status: 'missing',
    entry_method: entryMethod,
    verification_status: 'unverified',
    units: null,
    updated_at: new Date().toISOString(),
    missing_reason: 'Field not provided',
  };
}

export function createEmptyPsiParameters(entryMethod: 'manual' | 'machine' = 'manual'): PsiParameters {
  return {
    toxicity: createEmptyPsiFieldRecord('toxicity', entryMethod),
    permissible_exposure_limits: createEmptyPsiFieldRecord('permissible_exposure_limits', entryMethod),
    physical_data: createEmptyPsiFieldRecord('physical_data', entryMethod),
    reactivity_data: createEmptyPsiFieldRecord('reactivity_data', entryMethod),
    corrosivity_data: createEmptyPsiFieldRecord('corrosivity_data', entryMethod),
    thermal_and_chemical_stability_data: createEmptyPsiFieldRecord('thermal_and_chemical_stability_data', entryMethod),
    inadvertent_mixing_hazards: createEmptyPsiFieldRecord('inadvertent_mixing_hazards', entryMethod),
  };
}

export type DocumentCategory =
  | 'sds'
  | 'pid'
  | 'pfd'
  | 'bfd'
  | 'stream_table'
  | 'equipment_datasheet'
  | 'basis_of_design'
  | 'process_design_philosophy'
  | 'operating_philosophy'
  | 'control_philosophy'
  | 'shutdown_philosophy';

export type DocumentType = DocumentCategory; // Backwards compatible with existing 'sds' | 'pid' references

export type ExtractionStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'partial'
  | 'failed';

export type DocumentVerificationStatus =
  | 'unverified'
  | 'engineer_verified'
  | 'rejected';

export interface DocumentRecord {
  id: string;
  project_id: string;
  name: string;
  original_filename: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  doc_type: DocumentCategory;
  category: DocumentCategory;
  category_confidence?: number;
  user_overridden_category?: DocumentCategory | null;
  revision: string;
  source_organization?: string;
  upload_timestamp: string;
  extracted_text_preview?: string;
  pages_count: number;
  is_readable: boolean;
  unreadable_reason?: string;
  is_scanned_ocr_attempted?: boolean;
  chemical_ids: string[];
  extraction_status: ExtractionStatus;
  verification_status: DocumentVerificationStatus;
  verified_by?: string | null;
  verified_at?: string | null;
  notes?: string;
  metadata?: Record<string, any>;
}

// --- UNIFIED PROVENANCE & CROSS-DOCUMENT DISCREPANCY MODELS ---

export interface UnifiedProvenanceValue<T = any> {
  id: string;
  original_value: string | number | null;
  normalized_value: T | null;
  original_unit?: string | null;
  normalized_unit?: string | null;
  source_document_id: string;
  source_document_name: string;
  source_category: DocumentCategory;
  source_revision?: string | null;
  page_or_drawing_location: string;
  extraction_confidence: number;
  verification_status: 'unverified' | 'engineer_verified' | 'disputed' | 'rejected';
  verified_by?: string | null;
  verified_at?: string | null;
  extraction_timestamp: string;
  notes?: string;
}

export type DiscrepancyCategory =
  | 'source_to_source_discrepancy'
  | 'operating_vs_design_limit_violation'
  | 'missing_engineering_information'
  | 'unit_or_basis_inconsistency';

export type DiscrepancyType =
  | 'conflict'
  | 'unit_difference'
  | 'design_vs_operating'
  | 'missing_in_source'
  | 'compatible'
  | 'numerical_mismatch'
  | 'moc_divergence'
  | 'relief_vs_mawp'
  | 'trip_vs_design'
  | 'flow_imbalance'
  | 'source_to_source_discrepancy'
  | 'operating_vs_design_limit_violation'
  | 'missing_engineering_information'
  | 'unit_or_basis_inconsistency';

export type DiscrepancyStatus =
  | 'open'
  | 'reviewed'
  | 'resolved'
  | 'accepted_as_margin';

export interface PropertyVerificationHistoryEntry {
  verified_by: string;
  verified_at: string;
  action: 'verified' | 'rejected' | 'modified' | 'flagged' | 'reviewed';
  notes?: string;
  previous_value?: any;
  revised_value?: any;
}

export interface PropertyProvenance<T = any> {
  value: T | null;
  normalized_value?: T | null;
  unit?: string | null;
  source_document_id?: string | null;
  source_document_name?: string | null;
  source_category?: DocumentCategory | string | null;
  source_revision?: string | null;
  source_page?: number | null;
  drawing_location?: string | null;
  original_extracted_text?: string | null;
  extraction_confidence?: number | null;
  verification_status?: 'unverified' | 'engineer_verified' | 'rejected';
  verification_history?: PropertyVerificationHistoryEntry[];
}

export interface CrossDocumentDiscrepancy {
  id: string;
  project_id: string;
  entity_type: 'equipment' | 'stream' | 'line' | 'chemical' | 'safeguard';
  entity_tag: string; // e.g. "PG-1001", "10\"-PG-00101-A1A", "STR-101"
  property_name: string; // e.g. "design_pressure", "operating_temperature", "material"
  discrepancy_type: DiscrepancyType;
  discrepancy_category?: DiscrepancyCategory;
  status: DiscrepancyStatus;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  evidence_records: UnifiedProvenanceValue[];
  resolution_notes?: string | null;
  resolved_by?: string | null;
  resolved_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UnifiedEngineeringMatrixEntry {
  id: string;
  project_id: string;
  entity_type: 'equipment' | 'stream' | 'line';
  entity_tag: string;
  description?: string;
  sources_found: DocumentCategory[];
  source_document_ids?: string[];
  source_document_names?: string[];
  connected_lines?: string[];
  connected_streams?: string[];
  connected_equipment?: string[];
  assigned_chemicals?: string[];
  instruments?: string[];
  safeguards?: string[];
  rules?: EngineeringPhilosophyRule[];
  operating_conditions?: {
    pressure?: UnifiedProvenanceValue<number>;
    temperature?: UnifiedProvenanceValue<number>;
    flow_rate?: UnifiedProvenanceValue<number>;
    phase?: UnifiedProvenanceValue<string>;
  };
  design_specifications?: {
    design_pressure?: UnifiedProvenanceValue<number>;
    design_temperature?: UnifiedProvenanceValue<number>;
    material_of_construction?: UnifiedProvenanceValue<string>;
    capacity_or_volume?: UnifiedProvenanceValue<number>;
    design_code?: UnifiedProvenanceValue<string>;
    corrosion_allowance?: UnifiedProvenanceValue<number>;
    relief_valve_set_pressure?: UnifiedProvenanceValue<number>;
  };
  p_and_id_data?: Record<string, any>;
  datasheet_data?: Record<string, any>;
  stream_table_data?: Record<string, any>;
  pfd_data?: Record<string, any>;
  philosophy_data?: Record<string, any>;
  has_conflicts: boolean;
  conflict_ids: string[];
  last_updated: string;
}

export interface EngineeringPhilosophyRule {
  id: string;
  project_id: string;
  source_document_id: string;
  source_document_name: string;
  source_category: DocumentCategory;
  rule_type: 'interlock' | 'esd_action' | 'control_objective' | 'operating_limit' | 'relief_basis';
  equipment_tag?: string;
  loop_tag?: string; // e.g. "PIC-1001", "SIS LS-1001", "BDV-1001"
  condition: string;
  action: string;
  fail_safe_position?: 'fail_closed' | 'fail_open' | 'fail_locked';
  sil_rating?: string;
  is_confirmed_setpoint: boolean;
  verification_status: 'unverified' | 'engineer_verified';
  notes?: string;
}

export type EquipmentStatus =
  | 'machine_extracted'
  | 'provisional'
  | 'human_reviewed'
  | 'confirmed'
  | 'unresolved'
  | 'rejected';

export type EquipmentType =
  | 'vessel'
  | 'tank'
  | 'column'
  | 'mixing_tank'
  | 'pump'
  | 'compressor'
  | 'heat_exchanger'
  | 'reactor'
  | 'agitator'
  | 'separator'
  | 'manual_valve'
  | 'isolation_valve'
  | 'control_valve'
  | 'drain_valve'
  | 'instrument'
  | 'other';

// --- EQUIPMENT SPECIFICATION DATA MODEL ---

export type SpecFieldStatus =
  | 'not_provided'
  | 'extracted'
  | 'user_entered'
  | 'needs_review'
  | 'conflict'
  | 'verified';

export type SpecVerificationStatus =
  | 'unverified'
  | 'under_review'
  | 'verified'
  | 'rejected';

export type CapacityType = 'total_volume' | 'working_volume' | 'rated_throughput';

export interface SpecHistoryEntry {
  timestamp: string;
  author: string;
  field: string;
  previous_value: any;
  previous_unit?: string | null;
  new_value: any;
  new_unit?: string | null;
  change_reason: string;
}

export interface SpecConflictEntry {
  id: string;
  source_document_name: string;
  source_document_id?: string | null;
  source_revision?: string | null;
  source_page?: number | null;
  value: any;
  unit?: string | null;
  original_extracted_text?: string | null;
  reported_at: string;
  notes?: string;
}

export interface SpecProperty<T = number | string> {
  value: T | null; // Missing numerical values must remain null, NOT zero!
  unit?: string | null;
  status: SpecFieldStatus;
  verification_status: SpecVerificationStatus;
  capacity_type?: CapacityType | null; // For capacity / volume
  source_document_id?: string | null;
  source_document_name?: string | null;
  source_revision?: string | null;
  source_page?: number | null;
  source_section?: string | null;
  original_extracted_text?: string | null;
  extraction_confidence?: number | null;
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  conflicting_records?: SpecConflictEntry[];
  change_history?: SpecHistoryEntry[];
}

export interface EquipmentSpecifications {
  // Core 4 specifications
  material_of_construction: SpecProperty<string>;
  design_pressure: SpecProperty<number>;
  design_temperature: SpecProperty<number>;
  capacity: SpecProperty<number>;

  // Operating vs Design distinctions
  operating_pressure?: SpecProperty<number>;
  operating_temperature?: SpecProperty<number>;
  relief_device_set_pressure?: SpecProperty<number>;

  // Optional fields by equipment type
  design_code?: SpecProperty<string>; // e.g. ASME Section VIII Div 1, API 650
  corrosion_allowance?: SpecProperty<number>;
  mawp?: SpecProperty<number>;
  test_pressure?: SpecProperty<number>;
  min_design_metal_temperature?: SpecProperty<number>;
  pump_head?: SpecProperty<number>;
  pump_power?: SpecProperty<number>;
  heat_exchange_duty?: SpecProperty<number>;
  heat_exchange_area?: SpecProperty<number>;
}

export function createEmptySpecProperty<T>(capacityType?: CapacityType): SpecProperty<T> {
  return {
    value: null,
    unit: null,
    status: 'not_provided',
    verification_status: 'unverified',
    capacity_type: capacityType || null,
    source_document_id: null,
    source_document_name: null,
    source_revision: null,
    source_page: null,
    source_section: null,
    original_extracted_text: null,
    extraction_confidence: null,
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    conflicting_records: [],
    change_history: [],
  };
}

export function createDefaultSpecifications(type?: EquipmentType): EquipmentSpecifications {
  return {
    material_of_construction: createEmptySpecProperty<string>(),
    design_pressure: createEmptySpecProperty<number>(),
    design_temperature: createEmptySpecProperty<number>(),
    capacity: createEmptySpecProperty<number>('total_volume'),
    operating_pressure: createEmptySpecProperty<number>(),
    operating_temperature: createEmptySpecProperty<number>(),
    relief_device_set_pressure: createEmptySpecProperty<number>(),
    design_code: createEmptySpecProperty<string>(),
    corrosion_allowance: createEmptySpecProperty<number>(),
  };
}

export type IsolatedReviewStatus =
  | 'confirmed_isolated'
  | 'missing_connection_suspected'
  | 'connection_exists_on_another_drawing'
  | 'incorrect_equipment_identification'
  | 'awaiting_review';

export interface EquipmentTag {
  id: string; // Stable internal ID
  project_id: string;
  document_id: string;
  tag: string;
  description: string;
  equipment_type: EquipmentType;
  assigned_chemical_id: string | null;
  confidence: number;
  status: EquipmentStatus;
  source: {
    document: string;
    page: number;
    snippet: string;
    bbox?: { x: number; y: number; w: number; h: number };
  };
  notes?: string;
  machine_tag?: string;
  machine_type?: string;
  machine_description?: string;
  is_manual_entry?: boolean;
  specifications: EquipmentSpecifications;
  specifications_revision?: string | number;
  specifications_updated_at?: string;
  nozzle_schedule?: NozzleScheduleItem[];
  drawing_id?: string | null;
  drawing_revision?: string | null;
  drawing_element_id?: string | null;
  source_drawing?: string | null;
  source_page?: number | null;
  source_revision?: string | null;
  isolated_review_status?: IsolatedReviewStatus | null;
  isolated_review_notes?: string | null;
  isolated_reviewed_by?: string | null;
  isolated_reviewed_at?: string | null;
  verification_status?: 'unverified' | 'engineer_verified';
  verified_by?: string | null;
  verified_at?: string | null;
  duplicate_detected?: boolean;
  duplicate_tag_ids?: string[];
  conflicting_tags?: Array<{
    document_id: string;
    document_name: string;
    tag: string;
    confidence: number;
    conflict_reason?: string;
  }>;
  original_extracted_values?: {
    tag?: string;
    equipment_type?: string;
    description?: string;
    confidence?: number;
    extracted_at?: string;
  };
  property_provenance?: Record<string, PropertyProvenance>;
  created_at: string;
  updated_at?: string;
}

export type FunctionalType = 'piping_line' | 'signal_line' | 'utility_line' | 'non_process_line';
export type ConnectionClassification =
  | 'process_piping'
  | 'instrument_signal'
  | 'utility_connection'
  | 'non_process_equipment_relationship';
export type FlowDirection = 'forward' | 'reverse' | 'bidirectional' | 'unknown';

// --- PROCESS STREAM DATA MODEL ---

export type FlowBasis = 'volumetric' | 'mass' | 'molar';
export type StreamPhase = 'liquid' | 'gas' | 'vapor' | 'solid' | 'multiphase';
export type StreamDataOrigin =
  | 'document_extracted'
  | 'manual_entry'
  | 'live_measurement'
  | 'hybrid'
  | 'extracted'
  | 'manual'
  | 'measured'
  | 'synthesized';
export type StreamVerificationStatus = 'unverified' | 'under_review' | 'verified' | 'rejected';

export interface StreamOperatingCondition {
  value: number | null;
  unit: string | null;
  status: 'not_provided' | 'extracted' | 'user_entered' | 'verified';
  source_document_id?: string | null;
  source_document_name?: string | null;
  source_page?: number | null;
}

export interface StreamFlowRates {
  normal: number | null; // Missing values MUST remain null, NOT zero!
  min: number | null;
  max: number | null;
  design: number | null;
  actual: number | null; // Live or measured data if available
  unit: string | null; // e.g. "m3/h", "kg/h", "gpm", "lb/h", "kmol/h", "scfh"
  basis: FlowBasis | null;
}

export interface ProcessStream {
  id: string; // Unique stream ID
  project_id: string;
  stream_number: string; // Identifier e.g. "STR-101", "1", "S-01"
  stream_id?: string;
  stream_description?: string | null;
  source_equipment_id: string | null;
  source_equipment_tag: string; // e.g. "TK-101"
  destination_equipment_id: string | null;
  destination_equipment_tag: string; // e.g. "P-101"
  connected_equipment?: string[];
  connected_line_id: string | null;
  line_number: string | null;
  connected_line_ids?: string[];
  connected_line_numbers?: string[];
  material_description: string;
  assigned_chemical_id: string | null;
  components?: (StreamTableComponentFraction | ChemicalCompositionEntry)[];
  flow_direction: FlowDirection;
  flow_rates: StreamFlowRates;
  total_flow_rate?: UnifiedProvenanceValue<number>;
  operating_pressure: StreamOperatingCondition;
  operating_temperature: StreamOperatingCondition;
  phase: StreamPhase | null;
  pipe_nominal_diameter: string | null;
  pipe_spec: string | null;
  density?: UnifiedProvenanceValue<number>;
  vapor_fraction?: UnifiedProvenanceValue<number>;
  molecular_weight?: UnifiedProvenanceValue<number>;
  viscosity?: UnifiedProvenanceValue<number>;
  enthalpy?: UnifiedProvenanceValue<number>;
  heat_capacity?: UnifiedProvenanceValue<number>;
  z_factor?: UnifiedProvenanceValue<number>;
  operating_range?: {
    min?: number | null;
    normal?: number | null;
    max?: number | null;
    unit?: string | null;
  };
  associated_instrument_tags: string[]; // e.g. ["FI-101", "FIT-101", "FIC-101", "FCV-101", "FE-101", "FO-101"]
  source: {
    document: string;
    document_id?: string | null;
    page: number | null;
    snippet: string | null;
    section?: string | null;
    drawing_location?: string | null;
  };
  data_origin: StreamDataOrigin;
  verification_status: StreamVerificationStatus;
  verified_by?: string | null;
  verified_at?: string | null;
  original_extracted_values?: Record<string, any>;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessStreamValidationIssue {
  id: string;
  stream_id: string;
  stream_number: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  property_name?: string;
  message: string;
  operating_value?: any;
  design_limit?: any;
  unit?: string;
  source_document?: string;
}

export interface ProcessStreamValidationReport {
  project_id: string;
  total_streams_count: number;
  verified_streams_count: number;
  unverified_streams_count: number;
  issues: ProcessStreamValidationIssue[];
  critical_errors_count: number;
  warnings_count: number;
  limit_violations_count: number;
  missing_info_count: number;
  separator_decoupling_violations_count: number;
  can_approve: boolean;
  validated_at: string;
}

// --- CONNECTION CLASSIFICATION & TOPOLOGY VALIDATION (PHASE 4) ---

export type ConnectionValidationCategory =
  | 'critical_error'
  | 'warning'
  | 'engineering_review_required'
  | 'informational';

export interface ConnectionValidationIssue {
  id: string;
  connection_id: string;
  line_number: string;
  severity: ConnectionValidationCategory;
  category:
    | 'unresolved_endpoint'
    | 'flow_direction_conflict'
    | 'material_flow_on_non_process'
    | 'material_flow_on_signal'
    | 'utility_fluid_gap'
    | 'missing_engineering_data'
    | 'circular_connection'
    | 'cross_drawing_boundary'
    | 'self_loop';
  message: string;
  source_equipment: string;
  target_equipment: string;
  connection_classification: ConnectionClassification;
  is_drawing_boundary?: boolean;
  can_approve: boolean;
  created_at: string;
}

export interface ConnectionValidationReport {
  project_id: string;
  total_connections_count: number;
  process_piping_count: number;
  instrument_signal_count: number;
  utility_connection_count: number;
  non_process_count: number;
  critical_errors_count: number;
  warnings_count: number;
  review_required_count: number;
  informational_count: number;
  issues: ConnectionValidationIssue[];
  can_approve: boolean;
  validated_at: string;
}

// --- PFD & BFD EXTRACTION DATA MODELS ---

export interface ProcessBlock {
  id: string;
  project_id: string;
  document_id: string;
  block_name: string;
  block_type: 'battery_limit' | 'process_unit' | 'utility' | 'treatment' | 'storage' | 'emission';
  description: string;
  sequence_order: number;
  inlet_streams: string[];
  outlet_streams: string[];
  battery_limit_type?: 'inlet' | 'outlet' | 'tie_in' | 'internal' | null;
  operating_summary?: string | null;
  confidence: number;
}

export interface MajorUnitOperation {
  id: string;
  project_id: string;
  document_id: string;
  tag: string;
  name: string;
  equipment_type: EquipmentType;
  operating_pressure: UnifiedProvenanceValue<number>;
  operating_temperature: UnifiedProvenanceValue<number>;
  design_pressure: UnifiedProvenanceValue<number>;
  design_temperature: UnifiedProvenanceValue<number>;
  capacity_or_duty?: UnifiedProvenanceValue<number | string>;
  inlet_stream_numbers: string[];
  outlet_stream_numbers: string[];
  associated_block_name?: string | null;
  confidence: number;
}

export interface PfdStreamLink {
  id: string;
  project_id: string;
  document_id: string;
  stream_number: string;
  stream_name?: string | null;
  source_tag: string | null;
  destination_tag: string | null;
  operating_temperature: UnifiedProvenanceValue<number>;
  operating_pressure: UnifiedProvenanceValue<number>;
  mass_flow_rate?: UnifiedProvenanceValue<number>;
  volumetric_flow_rate?: UnifiedProvenanceValue<number>;
  phase?: StreamPhase | null;
  correlated_pid_line_number?: string | null;
  correlation_confidence?: number | null;
  confidence: number;
}

export interface PfdExtractionResult {
  id: string;
  project_id: string;
  document_id: string;
  document_name: string;
  category: 'pfd' | 'bfd';
  blocks: ProcessBlock[];
  major_units: MajorUnitOperation[];
  stream_links: PfdStreamLink[];
  battery_limits: {
    name: string;
    type: 'inlet' | 'outlet' | 'tie_in';
    stream_numbers: string[];
  }[];
  extraction_warnings: string[];
  extracted_at: string;
}

// --- STREAM TABLE (H&MB) EXTRACTION DATA MODELS ---

export interface StreamTableComponentFraction {
  component_name: string;
  formula?: string | null;
  cas_number?: string | null;
  fraction_value: number | null;
  unit: string; // e.g. "mol%", "wt%", "fraction", "%"
  is_hazardous: boolean;
}

export interface ExtractedStreamRecord {
  id: string;
  project_id: string;
  document_id: string;
  stream_number: string;
  stream_name?: string | null;
  phase?: StreamPhase | null;
  vapor_fraction: UnifiedProvenanceValue<number>;
  operating_temperature: UnifiedProvenanceValue<number>;
  operating_pressure: UnifiedProvenanceValue<number>;
  mass_flow_rate: UnifiedProvenanceValue<number>;
  volumetric_flow_rate: UnifiedProvenanceValue<number>;
  molar_flow_rate: UnifiedProvenanceValue<number>;
  molecular_weight: UnifiedProvenanceValue<number>;
  density: UnifiedProvenanceValue<number>;
  components: StreamTableComponentFraction[];
  correlated_pfd_stream_id?: string | null;
  correlated_pid_line_number?: string | null;
  source_location: string;
  confidence: number;
}

export interface StreamTableExtractionResult {
  id: string;
  project_id: string;
  document_id: string;
  document_name: string;
  table_orientation: 'streams_as_columns' | 'streams_as_rows' | 'hybrid';
  streams: ExtractedStreamRecord[];
  total_streams_found: number;
  extraction_warnings: string[];
  extracted_at: string;
}

// --- EQUIPMENT DATASHEET EXTRACTION DATA MODELS ---

export interface NozzleScheduleItem {
  nozzle_tag: string; // e.g. "N1", "N2", "N3", "N4", "N5"
  service: string; // e.g. "Inlet", "Gas Outlet", "Liquid Outlet", "PSV", "Drain", "Vent"
  nominal_size: string; // e.g. "10\"", "4\"", "2\""
  flange_rating?: string | null; // e.g. "600# RF", "300# RTJ"
  flange_facing?: string | null; // e.g. "RF", "RTJ", "FF"
}

export interface ExtractedDatasheetRecord {
  id: string;
  project_id: string;
  document_id: string;
  equipment_tag: string;
  equipment_name: string;
  equipment_type: EquipmentType;
  material_of_construction: UnifiedProvenanceValue<string>;
  design_pressure: UnifiedProvenanceValue<number>;
  design_temperature: UnifiedProvenanceValue<number>;
  min_design_metal_temp?: UnifiedProvenanceValue<number>;
  operating_pressure: UnifiedProvenanceValue<number>;
  operating_temperature: UnifiedProvenanceValue<number>;
  mawp?: UnifiedProvenanceValue<number>;
  test_pressure?: UnifiedProvenanceValue<number>;
  design_code?: UnifiedProvenanceValue<string>;
  corrosion_allowance?: UnifiedProvenanceValue<number>;
  capacity_or_volume?: UnifiedProvenanceValue<number>;
  relief_valve_set_pressure?: UnifiedProvenanceValue<number>;
  nozzles: NozzleScheduleItem[];
  equipment_specific_params?: Record<string, UnifiedProvenanceValue<any>>;
  confidence: number;
  extracted_at: string;
}

export interface DatasheetExtractionResult {
  id: string;
  project_id: string;
  document_id: string;
  document_name: string;
  datasheets: ExtractedDatasheetRecord[];
  total_equipment_found: number;
  extraction_warnings: string[];
  extracted_at: string;
}

export interface SparingPhilosophy {
  equipment_tag_or_type: string;
  configuration: string; // e.g. "2 x 100%", "1 duty + 1 standby", "3 x 50%"
  service_description?: string;
  notes?: string;
}

export interface DesignMarginRule {
  parameter: string; // e.g. "Design Pressure Margin", "Overdesign Allowance", "Fouling Margin"
  margin_value: string; // e.g. "+10% or 1.8 barg above max operating", "+15% flow margin"
  equipment_type_or_tag?: string;
  source_standard?: string; // e.g. "API 520", "ASME Section VIII", "DEP 31.22"
}

export interface ShutdownHierarchyLevel {
  level: string; // e.g. "ESD-0", "ESD-1", "ESD-2", "Unit Trip"
  name: string; // e.g. "Total Plant De-energization", "Facility Emergency Blowdown", "Train Isolation"
  description: string;
  triggers: string[];
  actions: string[];
}

export interface SafeOperatingLimitRule {
  parameter: string;
  equipment_tag?: string;
  normal_range?: string;
  safe_upper_limit?: string;
  safe_lower_limit?: string;
  consequence_of_deviation?: string;
  corrective_action?: string;
}

export interface EnvironmentalDesignLimits {
  min_ambient_temp?: string;
  max_ambient_temp?: string;
  solar_radiation?: string;
  seismic_zone?: string;
  basic_wind_speed?: string;
  site_elevation?: string;
  relative_humidity?: string;
}

export interface PhilosophyExtractionResult {
  id: string;
  project_id: string;
  document_id: string;
  document_name: string;
  document_category: DocumentCategory;
  rules: EngineeringPhilosophyRule[];
  sparing_philosophies: SparingPhilosophy[];
  design_margins: DesignMarginRule[];
  shutdown_hierarchy: ShutdownHierarchyLevel[];
  safe_operating_limits: SafeOperatingLimitRule[];
  environmental_limits?: EnvironmentalDesignLimits;
  total_rules_found: number;
  extraction_warnings: string[];
  extracted_at: string;
}

export interface CreateStreamInput {
  project_id: string;
  stream_number?: string;
  stream_id?: string;
  stream_description?: string;
  source_equipment_tag: string;
  destination_equipment_tag: string;
  connected_line_id?: string | null;
  line_number?: string | null;
  connected_line_ids?: string[];
  connected_line_numbers?: string[];
  connected_equipment?: string[];
  material_description?: string;
  assigned_chemical_id?: string | null;
  components?: (StreamTableComponentFraction | ChemicalCompositionEntry)[];
  flow_direction?: FlowDirection;
  flow_rates?: Partial<StreamFlowRates>;
  total_flow_rate?: UnifiedProvenanceValue<number>;
  operating_pressure?: Partial<StreamOperatingCondition>;
  operating_temperature?: Partial<StreamOperatingCondition>;
  phase?: StreamPhase | null;
  pipe_nominal_diameter?: string | null;
  pipe_spec?: string | null;
  density?: UnifiedProvenanceValue<number>;
  vapor_fraction?: UnifiedProvenanceValue<number>;
  molecular_weight?: UnifiedProvenanceValue<number>;
  viscosity?: UnifiedProvenanceValue<number>;
  enthalpy?: UnifiedProvenanceValue<number>;
  heat_capacity?: UnifiedProvenanceValue<number>;
  z_factor?: UnifiedProvenanceValue<number>;
  operating_range?: { min?: number | null; normal?: number | null; max?: number | null; unit?: string | null };
  associated_instrument_tags?: string[];
  source_document?: string;
  source_page?: number | null;
  source_snippet?: string | null;
  data_origin?: StreamDataOrigin;
  verification_status?: StreamVerificationStatus;
  verified_by?: string | null;
  notes?: string | null;
  reviewer?: string;
}

export function createEmptyProcessStream(
  projectId: string,
  sourceTag = '',
  destTag = '',
  connectedLineId?: string | null,
  lineNumber?: string | null,
  streamNumber?: string,
  origin: StreamDataOrigin = 'manual_entry'
): ProcessStream {
  const now = new Date().toISOString();
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  const num = streamNumber || `STR-${Date.now().toString(36).toUpperCase()}`;
  return {
    id: `stream-${randomSuffix}`,
    project_id: projectId,
    stream_number: num,
    source_equipment_id: null,
    source_equipment_tag: sourceTag,
    destination_equipment_id: null,
    destination_equipment_tag: destTag,
    connected_line_id: connectedLineId || null,
    line_number: lineNumber || null,
    material_description: 'Process Material',
    assigned_chemical_id: null,
    flow_direction: 'forward',
    flow_rates: {
      normal: null,
      min: null,
      max: null,
      design: null,
      actual: null,
      unit: 'm3/h',
      basis: 'volumetric',
    },
    operating_pressure: {
      value: null,
      unit: 'bar(g)',
      status: 'not_provided',
    },
    operating_temperature: {
      value: null,
      unit: '°C',
      status: 'not_provided',
    },
    phase: null,
    pipe_nominal_diameter: null,
    pipe_spec: null,
    associated_instrument_tags: [],
    source: {
      document: origin === 'manual_entry' ? 'Manual Engineering Entry' : 'P&ID Extraction',
      document_id: null,
      page: null,
      snippet: null,
    },
    data_origin: origin,
    verification_status: 'unverified',
    verified_by: null,
    verified_at: null,
    notes: null,
    created_at: now,
    updated_at: now,
  };
}

export type ConnectionType =
  | 'process_piping'
  | 'instrument_signal'
  | 'utility_connection'
  | 'non_process_equipment_relationship'
  | 'non_process';

export type ChemicalCompositionBasis =
  | 'mol%'
  | 'wt%'
  | 'ppm mol'
  | 'ppm wt'
  | 'vol%';

export interface ChemicalCompositionEntry {
  component_identity: string;
  cas_number?: string | null;
  concentration_value: number | null;
  concentration_basis: ChemicalCompositionBasis;
  unit: string;
  source?: string | null;
  source_document_id?: string | null;
  verification_status: 'unverified' | 'engineer_verified';
  notes?: string | null;
}

export interface ProcessLineFlowRates {
  min: PropertyProvenance<number>;
  normal: PropertyProvenance<number>;
  max: PropertyProvenance<number>;
  design?: PropertyProvenance<number>;
}

export interface ProcessLine {
  id: string;
  project_id: string;
  document_id: string;
  line_number: string;
  from_equipment: string;
  to_equipment: string;
  size: string;
  material: string;
  pipe_specification?: string;
  stream_label: string;
  functional_type: FunctionalType;
  flow_direction: FlowDirection;
  assigned_chemical_id: string | null;
  stream_id?: string | null;
  confidence: number;
  status: EquipmentStatus;
  source: {
    document: string;
    page: number;
    snippet: string;
  };
  alerts: string[];
  nominal_pipe_size?: PropertyProvenance<string>;
  pipe_spec?: PropertyProvenance<string>;
  fluid_service?: PropertyProvenance<string>;
  connection_type?: ConnectionType;
  connection_classification?: ConnectionClassification;
  is_drawing_boundary?: boolean;
  drawing_boundary_target?: string | null;
  drawing_boundary_drawing?: string | null;
  operating_flow_rate?: PropertyProvenance<number>;
  flow_rates?: ProcessLineFlowRates;
  operating_pressure?: PropertyProvenance<number>;
  operating_temperature?: PropertyProvenance<number>;
  design_pressure?: PropertyProvenance<number>;
  design_temperature?: PropertyProvenance<number>;
  chemical_composition?: ChemicalCompositionEntry[];
  physical_state?: PropertyProvenance<'liquid' | 'gas' | 'vapor' | 'multiphase' | 'slurry' | string>;
  source_document_id?: string | null;
  source_document_name?: string | null;
  source_drawing?: string | null;
  source_page?: number | null;
  source_revision?: string | null;
  drawing_location?: string | null;
  extraction_confidence?: number;
  verification_status?: 'unverified' | 'engineer_verified';
  verified_by?: string | null;
  verified_at?: string | null;
  original_extracted_values?: Record<string, any>;
  property_provenance?: Record<string, PropertyProvenance>;
  notes?: string | null;
  change_reason?: string | null;
  is_manual_entry?: boolean;
  machine_from?: string;
  machine_to?: string;
  machine_line_number?: string;
  created_at: string;
  updated_at?: string;
}

export type PipingLine = ProcessLine;

export interface ProcessLineValidationIssue {
  id: string;
  line_id: string;
  line_number: string;
  category: ValidationCategory;
  severity: ValidationSeverity;
  property_name?: string;
  message: string;
  operating_value?: any;
  design_limit?: any;
  unit?: string;
  source_document?: string;
}

export interface ProcessLineValidationReport {
  project_id: string;
  total_lines_count: number;
  verified_lines_count: number;
  unverified_lines_count: number;
  issues: ProcessLineValidationIssue[];
  critical_errors_count: number;
  warnings_count: number;
  limit_violations_count: number;
  missing_info_count: number;
  can_approve: boolean;
  validated_at: string;
}

export interface ChemicalConflict {
  id: string;
  project_id: string;
  chemical_name: string;
  cas_number: string;
  field_key: keyof PsiParameters | 'cas_number' | 'chemical_name';
  field_label: string;
  status: 'unresolved' | 'resolved';
  entries: {
    chemical_id: string;
    document_id: string;
    document_name: string;
    revision_date: string;
    value: string;
    snippet: string;
    confidence: number;
  }[];
  resolved_value: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
}

export interface ProcessProject {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  is_sample: boolean;
}

// Graph Validation Types
export type ValidationSeverity =
  | 'critical_error'
  | 'warning'
  | 'engineering_review_required'
  | 'informational'
  | 'error' // backwards compatibility
  | 'info';  // backwards compatibility

export type ValidationCategory =
  | 'source_to_source_discrepancy'
  | 'operating_vs_design_limit_violation'
  | 'missing_engineering_information'
  | 'unit_or_basis_inconsistency'
  | 'topology_integrity';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  category?: ValidationCategory;
  code: string;
  message: string;
  entity_type: 'equipment' | 'line' | 'graph' | 'stream';
  entity_id?: string;
  acknowledged?: boolean;
  acknowledgment_reason?: string;
  documented_waiver?: {
    approved_by: string;
    approved_at: string;
    justification: string;
  };
}

export interface GraphValidationResult {
  is_valid: boolean;
  can_approve: boolean;
  errors_count: number;
  critical_errors_count?: number;
  warnings_count: number;
  review_required_count?: number;
  info_count?: number;
  issues: ValidationIssue[];
  checked_at: string;
}

export interface GraphApprovalRecord {
  approved: boolean;
  approved_by?: string;
  approver_role?: string;
  approved_at?: string;
  notes?: string;
  graph_snapshot_hash?: string;
  document_versions_used?: Array<{ document_id: string; filename: string; category?: string; revision?: string }>;
  acknowledged_warnings?: string[];
  outstanding_provisional_items?: Array<{ id: string; type: string; tag_or_number: string; reason?: string }>;
  validation_snapshot?: GraphValidationResult;
  invalidated_at?: string;
  invalidation_reason?: string;
  invalidated_by?: string;
  previous_approval_snapshot?: any;
}

// Audit Trail Types
export interface AuditTrailEntry {
  id: string;
  project_id: string;
  timestamp: string;
  entity_type: 'equipment' | 'line' | 'graph' | 'pha_node' | 'stream' | 'chemical';
  entity_id: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'restore' | 'verify';
  field_changed?: string;
  original_value?: any;
  revised_value?: any;
  change_reason: string;
  reviewer: string;
  previous_state?: any;
  new_state?: any;
  can_revert?: boolean;
  reverted_at?: string;
  reverted_by?: string;
  revert_audit_id?: string;
}

// Change Impact Analysis Types
export interface ChangeImpactConnectedLine {
  id: string;
  line_number: string;
  direction: string;
  from_equipment: string;
  to_equipment: string;
  is_utility?: boolean;
}

export interface ChangeImpactConnectedStream {
  id: string;
  stream_number: string;
  source_equipment_tag?: string;
  destination_equipment_tag?: string;
  connected_lines: string[];
}

export interface ChangeImpactPhaNode {
  id: string;
  node_id: string;
  name: string;
  current_status: string;
  impact_reasons: string[];
}

export interface ChangeImpactAnalysisResult {
  project_id: string;
  target_entity_type: 'equipment' | 'line' | 'stream' | 'drawing';
  target_entity_id: string;
  target_entity_tag_or_number: string;
  change_type: 'update' | 'delete' | 'create' | 'limit_change' | 'stream_assignment';
  change_description: string;
  timestamp: string;
  directly_affected_entity: any;
  connected_lines: ChangeImpactConnectedLine[];
  connected_streams: ChangeImpactConnectedStream[];
  downstream_equipment: string[];
  upstream_equipment: string[];
  impacted_pha_nodes: ChangeImpactPhaNode[];
  impacted_deviations_count: number;
  severity_level: 'critical' | 'warning' | 'informational';
  requires_pha_reassessment: boolean;
  reassessment_recommendations: string[];
}

// PHA Study Node Types
export type PhaNodeStatus = 'candidate_not_authoritative' | 'under_review' | 'approved';

export interface PhaOperatingLimits {
  temperature_safe_upper?: number | null;
  temperature_safe_lower?: number | null;
  pressure_safe_upper?: number | null;
  pressure_safe_lower?: number | null;
  flow_safe_upper?: number | null;
  flow_safe_lower?: number | null;
  units: Record<string, string>;
}

export interface PhaDeviationScenario {
  id: string;
  deviation: string; // e.g. "MORE PRESSURE", "MORE TEMPERATURE", "CORROSION / MATERIAL COMPATIBILITY"
  parameter: string; // "Pressure", "Temperature", "Composition"
  guideword: string; // "MORE", "LESS", "OTHER THAN"
  status: 'verified_limit' | 'unverified_limit' | 'limit_unknown';
  equipment_tag: string;
  design_limit_reference?: string | null;
  potential_scenario: string;
  requires_additional_info: boolean;
  notes?: string;
}

export interface FlowDeviationAnalysis {
  id: string;
  deviation: 'NO FLOW' | 'LESS FLOW' | 'MORE FLOW' | 'REVERSE FLOW' | 'FLUCTUATING FLOW';
  parameter: 'Flow';
  guideword: 'NO' | 'LESS' | 'MORE' | 'REVERSE' | 'OTHER THAN';
  stream_id: string;
  stream_number: string;
  from_to: string;
  status: 'verified_limit' | 'unverified_limit' | 'limit_unknown';
  documented_limits: {
    normal?: number | null;
    min_allowable?: number | null;
    max_allowable?: number | null;
    design_flow?: number | null;
    unit?: string | null;
  };
  causes: string[];
  consequences: string[];
  safeguards: string[];
  instrumentation_and_alarms: string[];
  recommendations: string[];
  required_operating_limits: string[];
}

export interface NodeStreamSummary {
  incoming_streams: ProcessStream[];
  outgoing_streams: ProcessStream[];
  incoming_count: number;
  outgoing_count: number;
  known_flow_count: number;
  unknown_flow_count: number;
  known_conditions_count: number;
  missing_critical_count: number;
  unverified_count: number;
  verified_count: number;
}

export interface PhaMissingSpecAlert {
  equipment_tag: string;
  property: string;
  criticality: 'critical' | 'warning';
  impact: string;
}

export interface PhaMultiDocumentContext {
  matrix_entries: UnifiedEngineeringMatrixEntry[];
  philosophy_rules: EngineeringPhilosophyRule[];
  active_discrepancies: CrossDocumentDiscrepancy[];
  missing_design_specifications: PhaMissingSpecAlert[];
  unconfirmed_compositions: string[];
  unverified_safeguards: string[];
  verified_limits_count: number;
  unverified_limits_count: number;
  limit_comparison_status: 'fully_verified' | 'partially_verified' | 'unverified_or_blocked';
}

export interface PhaStudyNode {
  id: string;
  project_id: string;
  node_id: string; // e.g. "N-001"
  name: string; // e.g. "Feed storage and transfer"
  design_intent: string;
  equipment_tags: string[];
  line_numbers: string[];
  inlet_boundaries: string[];
  outlet_boundaries: string[];
  basis_for_grouping: string;
  status: PhaNodeStatus;
  unresolved_questions: string[];
  operating_limits: PhaOperatingLimits;
  incoming_stream_ids?: string[];
  outgoing_stream_ids?: string[];
  incoming_streams?: ProcessStream[];
  outgoing_streams?: ProcessStream[];
  stream_summary?: NodeStreamSummary;
  associated_valves?: string[];
  associated_instruments?: string[];
  control_loops?: string[];
  missing_process_information?: string[];
  flow_deviations?: FlowDeviationAnalysis[];
  reviewed_by?: string;
  approved_at?: string;
  requires_reassessment?: boolean;
  reassessment_reasons?: string[];
  missing_specifications?: PhaMissingSpecAlert[];
  applicable_deviations?: PhaDeviationScenario[];
  chemical_mapping?: ChemicalMappingResult | null;
  comprehensive_hazop_deviations?: ComprehensiveHazopDeviation[];
  chemical_context_summary?: string;
  multi_document_context?: PhaMultiDocumentContext;
  has_critical_gaps?: boolean;
  critical_information_gaps?: string[];
  created_at: string;
  updated_at: string;
}

export interface HazopReadinessResult {
  ready: boolean;
  blocking_reasons: string[];
  warnings: string[];
  nodes_ready_count: number;
  total_nodes_count: number;
  unresolved_discrepancies_count?: number;
  nodes_with_critical_gaps_count?: number;
  evaluated_at: string;
}

export type PhaWorkflowStage =
  | 'upload'
  | 'provisional_graph'
  | 'graph_review'
  | 'validation'
  | 'graph_approval'
  | 'node_segmentation'
  | 'node_review'
  | 'hazop_readiness';

export interface ProjectDashboardSummary {
  project: ProcessProject;
  documents_count: number;
  sds_count: number;
  pid_count: number;
  unreadable_docs_count: number;
  chemicals_count: number;
  completeness_pct: number;
  total_fields: number;
  confirmed_fields: number;
  needs_review_fields: number;
  missing_fields: number;
  rejected_fields: number;
  active_conflicts_count: number;
  equipment_nodes_count?: number;
  provisional_equipment_count: number;
  confirmed_equipment_count: number;
  provisional_lines_count: number;
  confirmed_lines_count: number;
  confirmed_process_edges_count: number;
  provisional_candidate_edges_count: number;
  unresolved_connections_count: number;
  signal_only_connections_count: number;
  isolated_nodes_count: number;
  graph_approved: boolean;
  pha_nodes_count: number;
  pha_approved_nodes_count: number;
  streams_count?: number;
  streams_with_flow_count?: number;
  streams_missing_flow_count?: number;
  hazop_ready: boolean;
  current_stage: PhaWorkflowStage;
}

export type MixingAlertStatus = 'potential' | 'validated' | 'unresolved';

export interface ChemicalMixingAlert {
  id: string;
  hazard_title: string;
  status: MixingAlertStatus;
  severity: 'critical' | 'warning';
  node_tag: string;
  supporting_equipment_tags: string[];
  supporting_edge_ids: string[];
  supporting_line_numbers: string[];
  chemicals_involved: {
    chemical_id: string;
    chemical_name: string;
    cas_number: string;
    role: string;
    flow_direction: string;
    line_number: string;
    connection_status: string;
  }[];
  reaction_description: string;
  sds_evidence: string;
  pid_evidence: string;
  assumptions: string[];
  limitations: string;
  created_at: string;
}

export interface TopologyGraphSummary {
  equipment_nodes_count: number;
  confirmed_process_edges_count: number;
  provisional_candidate_edges_count: number;
  unresolved_connections_count: number;
  signal_only_connections_count: number;
  isolated_nodes_count: number;
  process_piping_edges_count?: number;
  utility_connection_edges_count?: number;
  instrument_signal_edges_count?: number;
  non_process_relationship_edges_count?: number;
}

export interface GraphNode {
  id: string;
  tag: string;
  label: string;
  type: string;
  status: string;
  confidence?: number;
  machine_tag?: string;
  machine_type?: string;
  machine_description?: string;
  is_isolated?: boolean;
  has_active_conflict?: boolean;
  active_conflict_details?: string | null;
  chemical?: {
    id?: string;
    name: string;
    cas: string;
    pel: string | null;
    toxicity: string | null;
    review_status?: string;
    has_conflict?: boolean;
    conflict_values?: { source: string; value: string; revision_date: string; limit_type: string }[];
  };
  alerts: string[];
  specifications?: EquipmentSpecifications;
  specifications_revision?: string | number;
  drawing_id?: string | null;
  drawing_revision?: string | null;
  drawing_element_id?: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  line_number: string;
  stream_label: string;
  size: string;
  material: string;
  functional_type: FunctionalType;
  connection_classification?: ConnectionClassification;
  connection_type?: ConnectionType;
  flow_direction: FlowDirection;
  status: string;
  stream_id?: string | null;
  stream_number?: string | null;
  stream_properties?: ProcessStream;
  confidence?: number;
  source_evidence?: {
    document: string;
    page: number;
    snippet: string;
  };
  chemical?: {
    name: string;
    cas: string;
    pel: string | null;
    corrosivity: string | null;
    inadvertent_mixing: string | null;
  };
  operating_conditions?: {
    flow_rate?: number | null;
    flow_unit?: string | null;
    pressure?: number | null;
    pressure_unit?: string | null;
    temperature?: number | null;
    temperature_unit?: string | null;
  };
  alerts: string[];
}

export interface TopologyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: TopologyGraphSummary;
  mixing_alerts: ChemicalMixingAlert[];
  localized_alerts_count: number;
  incompatible_mixing_detected: boolean;
  provisional_alerts: string[];
}

// --- DIGITAL P&ID DRAWING SCHEMA ---

export type DrawingElementType =
  | EquipmentType
  | 'instrument'
  | 'junction'
  | 'offpage_connector'
  | 'filter'
  | 'check_valve'
  | 'relief_valve';

export interface DrawingPort {
  id: string;
  name: string;
  type: 'inlet' | 'outlet' | 'bidirectional' | 'signal';
  position: { x: number; y: number }; // normalized or px offset from element origin
}

export interface DrawingElement {
  id: string; // Stable internal ID, separate from tag
  tag: string; // Engineering tag (e.g. V-101, P-101A)
  type: DrawingElementType;
  component_class_id?: string;
  inline?: boolean;
  description: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number; // 0, 90, 180, 270 degrees
  assigned_chemical_id: string | null;
  status: EquipmentStatus;
  confidence?: number;
  source_evidence?: {
    document: string;
    page: number;
    snippet: string;
    bbox?: { x: number; y: number; w: number; h: number };
  };
  notes?: string;
  ports: DrawingPort[];
  label_offset?: { x: number; y: number };
  instrument_type?: string;
  measured_variable?: string;
  loop_id?: string;
  associated_equipment_id?: string | null;
  specifications?: EquipmentSpecifications;
}

export interface DrawingConnectorWaypoint {
  x: number;
  y: number;
}

export interface DrawingConnector {
  id: string; // Stable internal ID
  line_number: string;
  from_element_id: string;
  from_port_id: string;
  to_element_id: string;
  to_port_id: string;
  functional_type: FunctionalType;
  flow_direction: FlowDirection;
  size?: string;
  material?: string;
  stream_label?: string;
  assigned_chemical_id: string | null;
  status: EquipmentStatus;
  confidence?: number;
  waypoints?: DrawingConnectorWaypoint[];
  source_evidence?: {
    document: string;
    page: number;
    snippet: string;
  };
  notes?: string;
}

export interface DigitalPidDrawing {
  id: string;
  project_id: string;
  source_document_id: string | null;
  source_document_page: number;
  title: string;
  drawing_number: string;
  revision: string;
  mode: 'scratch' | 'imported_overlay';
  status: 'draft' | 'under_review' | 'approved';
  canvas_width?: number;
  canvas_height?: number;
  elements: DrawingElement[];
  connectors: DrawingConnector[];
  background_visible: boolean;
  background_opacity: number;
  created_at: string;
  updated_at: string;
  approved_at?: string | null;
  approved_by?: string | null;
  approval_notes?: string | null;
  change_log?: {
    timestamp: string;
    author: string;
    notes: string;
    revision: string;
  }[];
}

export interface DrawingValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  element_id?: string;
  connector_id?: string;
}

export interface DrawingValidationResult {
  is_valid: boolean;
  can_approve: boolean;
  errors_count: number;
  warnings_count: number;
  issues: DrawingValidationIssue[];
  checked_at: string;
}

// ==========================================
// COMMON DRAWING REPRESENTATION & HYBRID P&ID
// ==========================================

export type RecognitionMethod =
  | 'vector_geometry'
  | 'raster_ocr'
  | 'symbol_template'
  | 'heuristic_tracing'
  | 'process_description'
  | 'hybrid_reconciled'
  | 'manual_engineering';

export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Coordinate2D {
  x: number;
  y: number;
}

export interface DrawingEvidence {
  source_document: string;
  source_document_id?: string | null;
  page_number: number;
  bounding_box?: BoundingBox | null;
  recognition_method: RecognitionMethod;
  supporting_text?: string | null;
  confidence: number;
}

export type DrawingObjectType =
  | 'equipment'
  | 'instrument'
  | 'valve'
  | 'junction'
  | 'flow_arrow'
  | 'line_tag'
  | 'equipment_tag'
  | 'instrument_tag'
  | 'nozzle';

export interface DrawingObject {
  id: string;
  type: DrawingObjectType;
  tag: string;
  sub_type?: string;
  page: number;
  bounding_box: BoundingBox;
  center_coordinates: Coordinate2D;
  confidence: number;
  recognition_method: RecognitionMethod;
  evidence: DrawingEvidence;
  ports?: EquipmentPort[];
  specifications?: EquipmentSpecifications;
  assigned_chemical_id?: string | null;
  raw_properties?: Record<string, any>;
}

export interface PipeJunction {
  id: string;
  page: number;
  coordinates: Coordinate2D;
  junction_type: 't_junction' | 'cross_junction' | 'unconnected_crossing' | 'elbow_bend';
  has_junction_dot: boolean;
  connected_path_ids: string[];
  evidence: DrawingEvidence;
  confidence: number;
}

export interface PipePath {
  id: string;
  page: number;
  coordinates: Coordinate2D[]; // Polyline vertices
  line_tag?: string | null;
  functional_type: FunctionalType; // 'piping_line' | 'signal_line'
  flow_direction: FlowDirection; // 'forward' | 'bidirectional' | 'unknown'
  junction_ids: string[];
  start_candidate?: {
    equipment_tag?: string;
    equipment_id?: string;
    port_id?: string;
    distance: number;
    confidence: number;
  } | null;
  end_candidate?: {
    equipment_tag?: string;
    equipment_id?: string;
    port_id?: string;
    distance: number;
    confidence: number;
  } | null;
  is_continuous: boolean;
  crossings: {
    crossing_point: Coordinate2D;
    other_path_id: string;
    is_connected: boolean; // false for unconnected bridges / jumps
    has_bridge_symbol: boolean;
    confidence: number;
  }[];
  flow_arrow?: {
    position: Coordinate2D;
    angle: number; // In degrees
    direction: 'forward' | 'reverse';
    confidence: number;
  } | null;
  flow_rates?: StreamFlowRates;
  confidence: number;
  evidence: DrawingEvidence;
}

export interface EquipmentPort {
  id: string;
  equipment_id: string;
  equipment_tag: string;
  port_type: 'inlet' | 'outlet' | 'bidirectional' | 'drain' | 'vent' | 'signal';
  position: Coordinate2D;
  normal_vector?: Coordinate2D; // Outward pointing normal
  connection_candidates: string[]; // ConnectionCandidate IDs
  confidence: number;
}

export type ConnectionReconciliationStatus =
  | 'visually_supported'
  | 'description_supported'
  | 'corroborated'
  | 'conflicting'
  | 'unresolved'
  | 'engineer_verified';

export interface ConnectionCandidate {
  id: string;
  source_equipment: string; // Equipment tag
  source_port?: string | null;
  destination_equipment: string; // Equipment tag
  destination_port?: string | null;
  associated_pipe_paths: string[]; // PipePath IDs
  line_number?: string | null;
  stream_id?: string | null;
  functional_type: FunctionalType;
  flow_direction: FlowDirection;
  flow_rates?: StreamFlowRates;
  connection_evidence: DrawingEvidence[];
  text_evidence?: string[];
  confidence: number; // 0.0 to 1.0 AI certainty
  recognition_status: ConnectionReconciliationStatus;
  verification_status: 'unverified' | 'verified' | 'rejected' | 'flagged_for_review';
  verified_by?: string | null;
  verified_at?: string | null;
  verification_notes?: string | null;
  conflict_details?: string | null;
  is_manually_corrected?: boolean;
}

// Process Description Extraction
export interface ProcessDescriptionRelationship {
  id: string;
  source_tag: string;
  destination_tag: string;
  operation_type: 'transfer' | 'pump' | 'cooling' | 'heating' | 'reaction' | 'mixing' | 'recycle' | 'feed';
  chemical_name?: string | null;
  stream_label?: string | null;
  flow_rates?: Partial<StreamFlowRates> | null;
  operating_conditions?: {
    pressure?: number;
    pressure_unit?: string;
    temperature?: number;
    temperature_unit?: string;
  } | null;
  supporting_sentence: string;
  confidence: number;
}

export interface ProcessDescriptionExtraction {
  id: string;
  project_id: string;
  raw_description: string;
  extracted_tags: string[];
  missing_tags_in_drawing: string[];
  relationships: ProcessDescriptionRelationship[];
  feed_streams: { source: string; destination: string; material: string }[];
  mixing_operations: { destination: string; converging_sources: string[] }[];
  branches: { source: string; destinations: string[] }[];
  extracted_at: string;
}

// Hybrid Recognition Full Pipeline Result
export interface CommonDrawingModel {
  document_id: string;
  document_name: string;
  page_count: number;
  document_classification: 'vector_pdf' | 'scanned_pdf' | 'raster_image' | 'mixed_pdf';
  objects: DrawingObject[];
  pipe_paths: PipePath[];
  junctions: PipeJunction[];
  ports: EquipmentPort[];
  connection_candidates: ConnectionCandidate[];
  reconciliation_summary: {
    total_candidates: number;
    visually_supported_count: number;
    description_supported_count: number;
    corroborated_count: number;
    conflicting_count: number;
    unresolved_count: number;
    engineer_verified_count: number;
  };
  processed_at: string;
  convention_profile_id?: string;
  sheet_structure?: any;
  bridged_gaps_count?: number;
  uncertain_connections_count?: number;
}

// ============================================================================
// MODULE B, C, D, E, F: HYBRID CHEMICAL IDENTIFICATION & PROCESS MAPPING TYPES
// ============================================================================

export type ChemicalIdentificationStatus = 'CONFIRMED' | 'CANDIDATE' | 'UNKNOWN';
export type ChemicalMappingStatus = 'VERIFIED MAPPING' | 'PROPOSED MAPPING' | 'INCOMPLETE MAPPING';
export type PsiParameterDataState = 'VERIFIED' | 'UNVERIFIED' | 'MISSING' | 'NOT_APPLICABLE' | 'REQUIRES_REVIEW';
export type ConcentrationUnit = 'mol%' | 'vol%' | 'wt%' | 'ppm' | 'mg/L' | 'g/L' | 'fraction' | 'barg' | 'other';

export interface ChemicalAssignment {
  id: string;
  project_id: string;
  chemical_id: string;
  chemical_name: string;
  cas_number?: string | null;
  equipment_id?: string | null;
  equipment_tag?: string | null;
  stream_id?: string | null;
  stream_number?: string | null;
  connection_endpoint?: 'inlet' | 'outlet' | 'internal' | 'all' | null;
  concentration?: number | null;
  concentration_unit?: ConcentrationUnit | null;
  phase?: StreamPhase | null;
  source_document?: string | null;
  source_document_id?: string | null;
  source_page_or_location?: string | null;
  verification_status: 'unverified' | 'verified';
  identification_status: ChemicalIdentificationStatus;
  reviewer?: string | null;
  review_date?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface MappedChemicalItem {
  chemical_id: string;
  chemical_name: string;
  cas_number?: string | null;
  concentration: number | null;
  concentration_unit: ConcentrationUnit | null;
  phase: StreamPhase | null;
  identification_status: ChemicalIdentificationStatus;
  source_provenance: string;
  connection_tag?: string;
  is_verified: boolean;
}

export interface ChemicalMappingResult {
  id: string;
  project_id: string;
  target_type: 'equipment' | 'stream';
  target_id: string;
  target_tag: string;
  mapping_status: ChemicalMappingStatus;
  phase: StreamPhase | 'multiphase' | 'unknown';
  inlet_chemicals: MappedChemicalItem[];
  outlet_chemicals: MappedChemicalItem[];
  internal_chemicals: MappedChemicalItem[];
  separation_summary?: string | null;
  unresolved_gaps: string[];
  source_provenance: string;
  is_multiphase_separation: boolean;
  last_evaluated_at: string;
}

export interface PsiCompletenessCategoryReport {
  category_key: keyof PsiParameters;
  category_name: string;
  is_populated: boolean;
  is_verified: boolean;
  data_state: PsiParameterDataState;
  findings_count: number;
  value_summary: string | null;
  source_evidence: string | null;
  notes?: string | null;
}

export interface ChemicalPsiCompletenessReport {
  chemical_id: string;
  chemical_name: string;
  cas_number: string | null;
  identification_status: ChemicalIdentificationStatus;
  categories: PsiCompletenessCategoryReport[];
  total_categories: number;
  populated_categories_count: number;
  verified_categories_count: number;
  completeness_percentage: number;
  verification_percentage: number;
  is_fully_verified: boolean;
  missing_critical_topics: string[];
  conflicts_count: number;
  actionable_engineering_checklist: string[];
}

export interface ProjectPsiDashboardValidation {
  project_id: string;
  total_chemicals: number;
  confirmed_chemicals_count: number;
  candidate_chemicals_count: number;
  unknown_chemicals_count: number;
  fully_verified_psi_count: number;
  partially_verified_psi_count: number;
  unverified_psi_count: number;
  overall_completeness_pct: number;
  overall_verification_pct: number;
  chemical_reports: ChemicalPsiCompletenessReport[];
  global_engineering_checklist: {
    chemical_name: string;
    missing_topic: string;
    priority: 'high' | 'medium' | 'low';
    description: string;
  }[];
  evaluated_at: string;
}

export interface GasCompositionComponent {
  component_name: string;
  formula?: string | null;
  cas_number?: string | null;
  concentration: number;
  unit: ConcentrationUnit;
  normalized_mol_pct?: number | null;
  phase: StreamPhase;
  is_hazardous: boolean;
}

export interface GasCompositionReport {
  id: string;
  project_id: string;
  document_id: string;
  report_title: string;
  sample_point: string;
  sample_date?: string | null;
  analysis_method?: string | null;
  components: GasCompositionComponent[];
  total_concentration: number;
  concentration_unit: ConcentrationUnit;
  associated_stream_number?: string | null;
  associated_stream_id?: string | null;
  ambiguity_flag?: string | null;
  extracted_at: string;
}

export interface VerificationHistoryEntry {
  id: string;
  project_id: string;
  target_type: 'chemical' | 'assignment' | 'mapping' | 'psi_category' | 'stream';
  target_id: string;
  target_name: string;
  previous_status: string;
  new_status: string;
  reviewer: string;
  reason: string;
  timestamp: string;
}

export type HazopParameterCategory =
  | 'Pressure'
  | 'Temperature'
  | 'Flow'
  | 'Level'
  | 'Composition'
  | 'Phase'
  | 'Direction'
  | 'Contamination';

export interface ComprehensiveHazopDeviation {
  id: string;
  parameter: HazopParameterCategory;
  deviation: string; // e.g. "More Flow", "Off-spec Composition", "Liquid Carryover"
  guideword: string;
  causes: string[];
  consequences: string[];
  existing_safeguards: string[];
  recommended_safeguards: string[];
  information_gaps: string[];
  severity: 'high' | 'medium' | 'low';
  likelihood: 'high' | 'medium' | 'low';
  risk_rank: string;
  requires_engineering_review: boolean;
}

// ============================================================================
// IEC 61882 HAZOP WORKFLOW & CCPS LOPA DOMAIN MODELS
// ============================================================================

export interface HazopRiskMatrixConfig {
  id: string;
  project_id: string;
  version: number | string;
  standard_reference: string; // e.g. "IEC 61882 / CCPS Risk Tolerance Criteria"
  severity_levels: {
    level: number;
    label: string;
    description: string;
    safety_impact: string;
    environmental_impact: string;
    economic_impact: string;
  }[];
  likelihood_levels: {
    level: number;
    label: string;
    description: string;
    frequency_per_year: string;
  }[];
  cells: {
    severity: number;
    likelihood: number;
    risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
    acceptance_action: string;
  }[];
  created_at: string;
  updated_at: string;
}

export interface HazopSafeguard {
  id: string;
  type: 'prevention' | 'mitigation'; // IEC 61882: Distinguish prevention vs. emergency mitigation
  tag?: string;
  description: string;
  pid_reference?: string;
  verification_status: 'unverified' | 'verified' | 'flagged';
  verified_by?: string;
  notes?: string;
}

export interface HazopActionItem {
  id: string;
  hazop_row_id: string;
  project_id: string;
  node_id: string;
  action_number: string;
  recommendation: string;
  category: 'engineering_design' | 'operating_procedure' | 'maintenance_inspection' | 'instrumentation_alarm';
  owner: string;
  target_date: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'in_progress' | 'closed';
  closure_evidence?: string;
  closure_date?: string;
  verified_by?: string;
  requires_review_on_change: boolean;
}

export interface HazopWorksheetRow {
  id: string;
  project_id: string;
  node_id: string;
  node_name: string;
  drawing_number: string;
  drawing_revision: string;
  parameter: HazopParameterCategory;
  guideword: string;
  deviation: string;
  causes: string[];
  consequences: string[];
  registry_references?: {
    component_class_id: string;
    component_name: string;
    typical_failure_modes: string[];
    typical_safeguards: string[];
    verification_status: 'generic_unverified';
  }[];
  prevention_safeguards: HazopSafeguard[];
  mitigation_safeguards: HazopSafeguard[];
  initial_severity: number;
  initial_likelihood: number;
  initial_risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
  residual_severity?: number;
  residual_likelihood?: number;
  residual_risk_level?: 'Low' | 'Medium' | 'High' | 'Critical';
  actions: HazopActionItem[];
  supporting_documents: {
    document_id: string;
    document_name: string;
    page?: number;
    section?: string;
  }[];
  linked_lopa_id?: string | null;
  review_status: 'draft' | 'under_review' | 'confirmed';
  reviewed_by?: string;
  created_at: string;
  updated_at: string;
}

export interface IndependentProtectionLayer {
  id: string;
  tag: string;
  description: string;
  ipl_type: 'bpcs' | 'alarm_operator_intervention' | 'prv_relief' | 'sis_sif' | 'passive_containment' | 'other';
  pfd: number; // Probability of Failure on Demand (e.g. 0.1, 0.01)
  
  // CCPS LOPA 4 Mandatory Criteria (Must be individually verified with recorded evidence)
  independence_verified: boolean;
  independence_evidence: string;
  
  functionality_verified: boolean;
  functionality_evidence: string;
  
  reliability_verified: boolean;
  reliability_evidence: string;
  
  auditability_verified: boolean;
  auditability_evidence: string;
  
  // Qualification Gate: True ONLY if all 4 criteria are explicitly verified by a qualified analyst
  is_qualified_ipl: boolean;
  criterion_independence_met?: boolean;
  criterion_functionality_met?: boolean;
  criterion_reliability_met?: boolean;
  criterion_auditability_met?: boolean;
  verified_by?: string;
  verified_at?: string;
}

export interface LopaRecord {
  id: string;
  project_id: string;
  node_id: string;
  hazop_row_id: string;
  scenario_title: string;
  drawing_number: string;
  drawing_revision: string;
  consequence_description: string;
  severity_level: number;
  initiating_event: {
    description: string;
    category: string;
    frequency_per_year: number; // f_IE (events/year)
    evidence: string;
  };
  conditional_modifiers: {
    id: string;
    name: string;
    probability: number; // 0.0 - 1.0
    justification: string;
  }[];
  unmitigated_frequency: number; // f0 = f_IE * prod(modifiers)
  target_frequency: number; // TMEF (Target Mitigated Event Frequency, e.g. 1e-4 /yr)
  ipls: IndependentProtectionLayer[];
  total_pfd: number; // Product of all qualified IPL PFDs
  total_credited_pfd?: number;
  mitigated_frequency: number; // MEF = f0 * total_pfd
  mitigated_frequency_per_year?: number;
  unmitigated_frequency_per_year?: number;
  target_mitigated_frequency_per_year?: number;
  reviewed_by?: string;
  last_modified?: string;
  risk_tolerance_met: boolean; // MEF <= target_frequency
  sil_requirement: 'None' | 'SIL 1' | 'SIL 2' | 'SIL 3' | 'SIL 4';
  analyst_signoff?: {
    analyst_name: string;
    date: string;
    notes: string;
  };
  created_at: string;
  updated_at: string;
}

export interface ConnectionQualityMetrics {
  drawing_id: string;
  project_id: string;
  evaluated_at: string;
  total_connections_evaluated: number;
  false_connections_count: number;
  missed_connections_count: number;
  line_type_errors_count: number;
  offpage_matching_errors_count: number;
  unresolved_endpoints_count: number;
  path_accuracy_percentage: number;
  symbol_detection_score: number; // Tracked separately from connection quality
  human_corrections_retained: number;
}



