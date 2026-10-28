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

export type DocumentType = 'sds' | 'pid';

export interface DocumentRecord {
  id: string;
  project_id: string;
  name: string;
  original_filename: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  doc_type: DocumentType;
  upload_timestamp: string;
  extracted_text_preview?: string;
  pages_count: number;
  is_readable: boolean;
  unreadable_reason?: string;
  is_scanned_ocr_attempted?: boolean;
  chemical_ids: string[];
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
  drawing_id?: string | null;
  drawing_revision?: string | null;
  drawing_element_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export type FunctionalType = 'piping_line' | 'signal_line' | 'utility_line';
export type FlowDirection = 'forward' | 'reverse' | 'bidirectional' | 'unknown';

export interface PipingLine {
  id: string;
  project_id: string;
  document_id: string;
  line_number: string;
  from_equipment: string;
  to_equipment: string;
  size: string;
  material: string;
  stream_label: string;
  functional_type: FunctionalType;
  flow_direction: FlowDirection;
  assigned_chemical_id: string | null;
  confidence: number;
  status: EquipmentStatus;
  source: {
    document: string;
    page: number;
    snippet: string;
  };
  alerts: string[];
  notes?: string;
  change_reason?: string;
  machine_from?: string;
  machine_to?: string;
  machine_line_number?: string;
  is_manual_entry?: boolean;
  created_at: string;
  updated_at?: string;
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
export interface ValidationIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  entity_type: 'equipment' | 'line' | 'graph';
  entity_id?: string;
  acknowledged?: boolean;
  acknowledgment_reason?: string;
}

export interface GraphValidationResult {
  is_valid: boolean;
  can_approve: boolean;
  errors_count: number;
  warnings_count: number;
  issues: ValidationIssue[];
  checked_at: string;
}

export interface GraphApprovalRecord {
  approved: boolean;
  approved_by?: string;
  approved_at?: string;
  notes?: string;
  validation_snapshot?: GraphValidationResult;
}

// Audit Trail Types
export interface AuditTrailEntry {
  id: string;
  project_id: string;
  timestamp: string;
  entity_type: 'equipment' | 'line' | 'graph' | 'pha_node';
  entity_id: string;
  action: 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'restore';
  field_changed?: string;
  original_value?: any;
  revised_value?: any;
  change_reason: string;
  reviewer: string;
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

export interface PhaMissingSpecAlert {
  equipment_tag: string;
  property: string;
  criticality: 'critical' | 'warning';
  impact: string;
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
  reviewed_by?: string;
  approved_at?: string;
  requires_reassessment?: boolean;
  reassessment_reasons?: string[];
  missing_specifications?: PhaMissingSpecAlert[];
  applicable_deviations?: PhaDeviationScenario[];
  created_at: string;
  updated_at: string;
}

export interface HazopReadinessResult {
  ready: boolean;
  blocking_reasons: string[];
  warnings: string[];
  nodes_ready_count: number;
  total_nodes_count: number;
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
  flow_direction: FlowDirection;
  status: string;
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
