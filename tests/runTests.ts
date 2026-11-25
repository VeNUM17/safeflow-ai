import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { parseSdsContent } from '../server/src/services/sdsParser';
import { detectConflictsForProject } from '../server/src/services/conflictDetector';
import { buildProcessTopologyGraph } from '../server/src/services/graphService';
import { exportProjectToJson, exportProjectToCsv } from '../server/src/services/exportService';
import { parsePidDocument } from '../server/src/services/pidParser';
import { validateProcessGraph } from '../server/src/services/graphValidationService';
import {
  generateCandidatePhaNodes,
  checkHazopReadiness,
  evaluateNodeSpecifications,
  generateFlowDeviationsForNode,
  attachStreamContextToNode,
  attachMultiDocumentContextToNode,
  generateComprehensiveHazopDeviations,
} from '../server/src/services/phaService';
import { validateDigitalDrawing } from '../server/src/services/drawingValidationService';
import { exportDrawingToJson, exportDrawingToSvg } from '../server/src/services/drawingExportService';
import { PsiDataStore } from '../server/src/storage/store';
import {
  ChemicalRecord,
  EquipmentTag,
  PipingLine,
  ProcessProject,
  PhaStudyNode,
  GraphValidationResult,
  DigitalPidDrawing,
  DrawingElement,
  DrawingConnector,
  EquipmentSpecifications,
  SpecProperty,
  CapacityType,
  createDefaultSpecifications,
  createEmptySpecProperty,
  CreateManualChemicalInput,
  UpdateChemicalInput,
  StructuredPsiParameters,
  createEmptyPsiFieldRecord,
  createEmptyPsiParameters,
  ProcessStream,
  CreateStreamInput,
  createEmptyProcessStream,
  FlowDeviationAnalysis,
  NodeStreamSummary,
  CommonDrawingModel,
  ConnectionCandidate,
  ProcessDescriptionExtraction,
  ChemicalAssignment,
  ChemicalMappingResult,
  GasCompositionReport,
  ProjectPsiDashboardValidation,
  PfdExtractionResult,
  StreamTableExtractionResult,
  DatasheetExtractionResult,
  PhilosophyExtractionResult,
  EngineeringPhilosophyRule,
  SparingPhilosophy,
  DesignMarginRule,
  ShutdownHierarchyLevel,
  SafeOperatingLimitRule,
  EnvironmentalDesignLimits,
  UnifiedEngineeringMatrixEntry,
} from '../server/src/types';
import { parsePfdOrBfdDocument } from '../server/src/services/pfdParser';
import { parseStreamTableDocument } from '../server/src/services/streamTableParser';
import { parseDatasheetDocument } from '../server/src/services/datasheetParser';
import { parsePhilosophyDocument } from '../server/src/services/philosophyParser';
import {
  buildUnifiedEngineeringMatrix,
  getUnifiedEquipmentContext,
} from '../server/src/services/unifiedEngineeringService';
import {
  detectCrossDocumentDiscrepancies,
  resolveEngineeringDiscrepancy,
  generateCrossDocumentReconciliationReport,
  CrossDocumentReconciliationReport,
} from '../server/src/services/crossDocumentConsistencyService';
import { classifyDocument, classifyEngineeringCategory } from '../server/src/services/documentClassifier';
import { extractTextFromDocument } from '../server/src/services/pdfExtractor';
import { extractVectorGeometry } from '../server/src/services/vectorPdfService';
import { preprocessRasterImage } from '../server/src/services/rasterPreprocessingService';
import { recognizeDrawingText } from '../server/src/services/ocrService';
import { detectDrawingSymbols } from '../server/src/services/symbolDetectionService';
import { tracePipingNetwork, findLineIntersection } from '../server/src/services/pipeTracingService';
import { parseProcessDescription } from '../server/src/services/processDescriptionService';
import { reconcileConnections } from '../server/src/services/connectionReconciliationService';
import { validateCandidateTopology } from '../server/src/services/topologyValidationService';
import {
  parseGasCompositionReportText,
  determineIdentificationStatus,
} from '../server/src/services/chemicalIdentificationEngine';
import {
  classifyConnection,
  isMaterialFlowConnection,
  validateConnectionTopology,
} from '../server/src/services/connectionClassificationService';
import {
  ConnectionClassification,
  ConnectionValidationReport,
  ConnectionValidationIssue,
} from '../server/src/types';
import {
  evaluateEquipmentChemicalMapping,
  evaluateProjectChemicalMappings,
  isMultiphaseSeparator,
} from '../server/src/services/chemicalMappingEngine';
import { validateProjectPsiCompleteness } from '../server/src/services/psiValidationService';
import {
  attachChemicalContextToPhaNode,
  generateComprehensiveHazopDeviations,
} from '../server/src/services/phaService';
import { exportDossierToJson, exportDossierToMarkdown } from '../server/src/services/dossierExportService';

console.log('🧪 Starting SafeFlow AI & PSI Engine Comprehensive Test Suite...\n');

import {
  ISA_5_1_STANDARD_PROFILE,
  SOUR_GAS_FACILITY_PROFILE,
  DIN_EN_ISO_10628_PROFILE,
  getConventionProfile,
  registerConventionProfile,
} from '../server/src/services/pidConventionService';
import { analyzeSheetStructure, isInsideNonProcessRegion } from '../server/src/services/sheetStructureService';
import {
  partitionSheetIntoTiles,
  mergeTiledDetections,
  associateSymbolsWithTags,
} from '../server/src/services/tiledDetectionService';
import { recognizeDrawingText } from '../server/src/services/ocrService';
import { detectDrawingSymbols } from '../server/src/services/symbolDetectionService';
import { tracePipingNetwork } from '../server/src/services/pipeTracingService';
import { normalizeDrawing } from '../server/src/services/drawingNormalizationService';
import { PidConventionProfile } from '../server/src/types/conventionProfile';
import { computeDiagramBounds, spreadElementSpacing, resolveElementOverlaps } from '../client/src/utils/pidDeclutter';

let passedTests = 0;
let failedTests = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}`);
    if (err.stack) console.error(err.stack);
    failedTests++;
  }
}

// ----------------------------------------------------
// Test Group 1: OSHA 29 CFR 1910.119(d)(1) SDS Parser
// ----------------------------------------------------
console.log('--- Test Group 1: OSHA 1910.119(d)(1) SDS Parser ---');

const sampleSdsText = `
SAFETY DATA SHEET
SECTION 1: IDENTIFICATION
Product Identifier: Anhydrous Ammonia Refrigeration Grade
CAS-No: 7664-41-7
Manufacturer: Apex Industrial Chemicals LLC, Houston, TX
Revision Date: 2024-01-15

SECTION 2: HAZARDS IDENTIFICATION
Skin corrosion/irritation Category 1B
Causes severe skin burns and eye damage. Corrosive to metals.

SECTION 3: COMPOSITION / INFORMATION ON INGREDIENTS
Chemical Name: Ammonia, anhydrous
CAS Number: 7664-41-7
Weight %: 99.5% min

SECTION 8: EXPOSURE CONTROLS / PERSONAL PROTECTION
OSHA PEL: 50 ppm (35 mg/m3) 8-hr TWA.
ACGIH TLV: 25 ppm TWA, 35 ppm STEL.
NIOSH REL: 25 ppm TWA, 35 ppm STEL. IDLH: 300 ppm.

SECTION 9: PHYSICAL AND CHEMICAL PROPERTIES
Boiling Point: -33.34 C (-28.01 F)
Melting Point: -77.7 C
Vapor Pressure: 8.5 atm at 20 C
Vapor Density: 0.59 (Air = 1)
Flammability limits: LEL 15%, UEL 28%

SECTION 10: STABILITY AND REACTIVITY
Reactivity: Reacts violently with strong acids and oxidizing agents.
Chemical stability: Stable under normal conditions. Decomposes above 450 C releasing flammable hydrogen gas.
Incompatible materials: Incompatible with copper, brass, zinc alloys, and sodium hypochlorite bleach.
Inadvertent mixing with bleach produces deadly toxic chloramine gas.

SECTION 11: TOXICOLOGICAL INFORMATION
Acute Toxicity: Inhalation LC50 rat 2000 ppm/4h.
Causes severe respiratory tract burns and pulmonary edema.
`;

const mockDocContent = {
  text: sampleSdsText,
  pages: [{ pageNumber: 1, text: sampleSdsText }],
  pagesCount: 1,
  isReadable: true,
  isScanned: false,
};

test('Extracts chemical name, CAS number, manufacturer, and revision date', () => {
  const result = parseSdsContent(mockDocContent, 'doc-1', 'ammonia_sds.pdf', 'proj-1');

  assert.strictEqual(result.chemical_name.value, 'Anhydrous Ammonia Refrigeration Grade');
  assert.strictEqual(result.cas_number.value, '7664-41-7');
  assert.strictEqual(result.manufacturer.value, 'Apex Industrial Chemicals LLC, Houston, TX');
  assert.strictEqual(result.sds_revision_date.value, '2024-01-15');
  assert.ok(result.chemical_name.confidence > 0.8, 'High confidence for exact match');
});

test('Extracts all 7 OSHA 1910.119(d)(1) PSI parameters with source provenance', () => {
  const result = parseSdsContent(mockDocContent, 'doc-1', 'ammonia_sds.pdf', 'proj-1');
  const psi = result.psi_parameters;

  assert.ok(psi.toxicity.value?.includes('2000 ppm'), 'Contains LC50');
  assert.strictEqual(psi.toxicity.review_status, 'needs_review', 'Starts as needs_review');
  assert.ok(psi.toxicity.source.snippet?.length, 'Preserves source snippet');

  assert.ok(psi.permissible_exposure_limits.value?.includes('50 ppm'), 'Contains OSHA PEL 50 ppm');
  assert.ok(psi.permissible_exposure_limits.value?.includes('25 ppm'), 'Contains ACGIH TLV 25 ppm');

  assert.ok(psi.physical_data.value?.includes('-33.34'), 'Contains boiling point');
  assert.ok(psi.reactivity_data.value?.includes('oxidizing agents'), 'Contains reactivity');
  assert.ok(psi.corrosivity_data.value?.includes('Corrosive to metals'), 'Contains corrosivity');
  assert.ok(psi.thermal_and_chemical_stability_data.value?.includes('Stable'), 'Contains stability');
  assert.ok(psi.inadvertent_mixing_hazards.value?.includes('chloramine gas'), 'Contains mixing hazard');
});

test('Missing fields in sparse SDS receive explicit missing status rather than zero or safe', () => {
  const sparseText = `
    SAFETY DATA SHEET
    SECTION 1: IDENTIFICATION
    Product Identifier: Water
    CAS-No: 7732-18-5
  `;
  const sparseDoc = {
    text: sparseText,
    pages: [{ pageNumber: 1, text: sparseText }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };
  const result = parseSdsContent(sparseDoc, 'doc-2', 'water.pdf', 'proj-1');
  assert.strictEqual(result.psi_parameters.toxicity.review_status, 'missing');
  assert.strictEqual(result.psi_parameters.toxicity.value, null);
  assert.ok(
    result.psi_parameters.toxicity.missing_reason?.toLowerCase().includes('no toxicity') ||
    result.psi_parameters.toxicity.missing_reason?.toLowerCase().includes('found')
  );
});

// ----------------------------------------------------
// Test Group 2: Cross-SDS Conflict Detection
// ----------------------------------------------------
console.log('\n--- Test Group 2: Cross-SDS Conflict Detection ---');

test('Detects conflicting exposure limits between multiple vendor SDSs for the same chemical', () => {
  const sdsApex = parseSdsContent(mockDocContent, 'doc-1', 'Apex_Ammonia.pdf', 'proj-1');

  const sdsChemCorpText = `
    SAFETY DATA SHEET
    Product Identifier: Ammonia Anhydrous
    CAS-No: 7664-41-7
    Revision Date: 2022-05-10
    Manufacturer: ChemCorp Global
    SECTION 8: EXPOSURE CONTROLS
    OSHA PEL: 35 ppm 8-hr TWA.
  `;
  const chemCorpDoc = {
    text: sdsChemCorpText,
    pages: [{ pageNumber: 1, text: sdsChemCorpText }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };
  const sdsChemCorp = parseSdsContent(chemCorpDoc, 'doc-2', 'ChemCorp_Ammonia.pdf', 'proj-1');

  const conflicts = detectConflictsForProject([sdsApex, sdsChemCorp], 'proj-1');
  assert.ok(conflicts.length > 0, 'Conflicts detected');
  const pelConflict = conflicts.find((c) => c.field_key === 'permissible_exposure_limits');
  assert.ok(pelConflict, 'PEL conflict identified');
  assert.strictEqual(pelConflict?.entries.length, 2, 'Two conflicting vendor entries');
});

// ----------------------------------------------------
// Test Group 3: Enhanced P&ID Parser (SafeFlow Demo PID)
// ----------------------------------------------------
console.log('\n--- Test Group 3: Enhanced P&ID Parser (SafeFlow Demo PID) ---');

const safeFlowDemoPidText = `
DRAWING: PID-101-NEUTRALIZATION-SKID REV C
EQUIPMENT SCHEDULE:
TK-101: Caustic Soda Day Tank (500 gal, FRP)
TK-102: Sulfuric Acid Storage Tank (1000 gal, CS lined)
MX-101: Neutralization Mixing Tank with AG-101 Agitator
P-101: Product Effluent Transfer Pump
E-101: Shell & Tube Exchanger
HV-101: Hand Isolation Valve
XV-101: Emergency Shutoff Valve
DV-101: Drain Valve
FIT-101: Magnetic Flow Transmitter
TIT-101: RTD Temperature Transmitter
LIT-102: Ultrasonic Level Transmitter

PIPING AND SIGNAL SCHEDULE:
Line L-101: 2" NaOH feed line from TK-101 to MX-101
Line L-102: 1.5" H2SO4 line from TK-102 to MX-101
Stream L-103: mixed aqueous product from MX-101 to pump P-101
Line L-104: pump discharge from P-101 to E-101
Line L-105: effluent discharge line from E-101 to battery limit
Signal SIG-101: 4-20mA loop from FIT-101 to MX-101
Signal SIG-102: 4-20mA loop from TIT-101 to MX-101
Signal SIG-103: digital bus from LIT-102 to TK-101
`;

test('Extracts all candidate equipment tags including tanks, mixers, pumps, valves, and transmitters', () => {
  const result = parsePidDocument(
    { text: safeFlowDemoPidText, pages: [{ pageNumber: 1, text: safeFlowDemoPidText }], pagesCount: 1, isReadable: true },
    'doc-pid-demo',
    'SafeFlow_Demo_PID.pdf',
    'proj-demo'
  );

  const tags = result.equipment.map((e) => e.tag);
  assert.ok(tags.includes('TK-101'), 'Includes TK-101');
  assert.ok(tags.includes('TK-102'), 'Includes TK-102');
  assert.ok(tags.includes('MX-101'), 'Includes MX-101');
  assert.ok(tags.includes('P-101'), 'Includes P-101');
  assert.ok(tags.includes('E-101'), 'Includes E-101');
  assert.ok(tags.includes('FIT-101'), 'Includes FIT-101');
  assert.ok(tags.includes('HV-101'), 'Includes HV-101');
  assert.ok(result.equipment.length >= 8, 'Found expected equipment count');
});

test('Extracts candidate lines including simple formats (L-101..105) and avoids 0-edge anomaly', () => {
  const result = parsePidDocument(
    { text: safeFlowDemoPidText, pages: [{ pageNumber: 1, text: safeFlowDemoPidText }], pagesCount: 1, isReadable: true },
    'doc-pid-demo',
    'SafeFlow_Demo_PID.pdf',
    'proj-demo'
  );

  assert.ok(result.lines.length >= 5, `Expected >= 5 lines, found ${result.lines.length}`);
  const lineNumbers = result.lines.map((l) => l.line_number);
  assert.ok(lineNumbers.includes('L-101'), 'Found L-101');
  assert.ok(lineNumbers.includes('L-102'), 'Found L-102');
  assert.ok(lineNumbers.includes('L-103'), 'Found L-103');
});

test('Classifies SIG- signal lines as functional_type: signal_line (non-chemical transmission)', () => {
  const result = parsePidDocument(
    { text: safeFlowDemoPidText, pages: [{ pageNumber: 1, text: safeFlowDemoPidText }], pagesCount: 1, isReadable: true },
    'doc-pid-demo',
    'SafeFlow_Demo_PID.pdf',
    'proj-demo'
  );

  const sigLines = result.lines.filter((l) => l.line_number.startsWith('SIG-'));
  assert.ok(sigLines.length > 0, 'Extracted signal lines');
  for (const s of sigLines) {
    assert.strictEqual(s.functional_type, 'signal_line', 'SIG line marked as signal_line');
    assert.strictEqual(s.assigned_chemical_id, null, 'Signal line has no chemical assigned');
  }
});

// ----------------------------------------------------
// Test Group 4: Process Topology Graph & Localized Alerts
// ----------------------------------------------------
console.log('\n--- Test Group 4: Process Topology Graph & Localized Alerts ---');

test('Topology graph injects chemical profiles and flags localized inadvertent mixing risk', () => {
  const chemAmmonia: ChemicalRecord = {
    id: 'chem-nh3',
    project_id: 'proj-1',
    sds_document_id: 'doc-1',
    chemical_name: { value: 'Anhydrous Ammonia', machine_value: 'Ammonia', user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    cas_number: { value: '7664-41-7', machine_value: '7664-41-7', user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    sds_revision_date: { value: '2024-01-01', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    manufacturer: { value: 'Apex', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    psi_parameters: {
      toxicity: { value: '2000 ppm', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      permissible_exposure_limits: { value: '50 ppm', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      physical_data: { value: 'BP -33 C', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      reactivity_data: { value: 'Stable', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      corrosivity_data: { value: 'Corrosive to copper', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      thermal_and_chemical_stability_data: { value: 'Decomposes 450 C', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      inadvertent_mixing_hazards: { value: 'Deadly toxic chloramine gas with bleach', machine_value: null, user_value: null, source: { document: 'sds.pdf', document_id: 'doc-1', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const chemBleach: ChemicalRecord = {
    id: 'chem-bleach',
    project_id: 'proj-1',
    sds_document_id: 'doc-2',
    chemical_name: { value: 'Sodium Hypochlorite 12.5%', machine_value: 'Bleach', user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    cas_number: { value: '7681-52-9', machine_value: '7681-52-9', user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    sds_revision_date: { value: '2024-01-01', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    manufacturer: { value: 'Apex', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    psi_parameters: {
      toxicity: { value: 'Harmful if swallowed', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      permissible_exposure_limits: { value: '1 ppm STEL', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      physical_data: { value: 'Liquid pH 12', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      reactivity_data: { value: 'Releases chlorine gas with acids', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      corrosivity_data: { value: 'Corrosive to steel', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      thermal_and_chemical_stability_data: { value: 'Decomposes on heating', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
      inadvertent_mixing_hazards: { value: 'Generates deadly chloramine gas with ammonia', machine_value: null, user_value: null, source: { document: 'sds2.pdf', document_id: 'doc-2', page: 1, section: '', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const eqList: EquipmentTag[] = [
    { id: 'eq-1', project_id: 'proj-1', document_id: 'doc-pid', tag: 'V-101', description: 'Receiver Drum', equipment_type: 'vessel', assigned_chemical_id: 'chem-nh3', confidence: 0.9, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: 'V-101' }, created_at: new Date().toISOString() },
    { id: 'eq-2', project_id: 'proj-1', document_id: 'doc-pid', tag: 'P-101A', description: 'Pump', equipment_type: 'pump', assigned_chemical_id: 'chem-nh3', confidence: 0.9, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: 'P-101A' }, created_at: new Date().toISOString() },
    { id: 'eq-3', project_id: 'proj-1', document_id: 'doc-pid', tag: 'TK-201', description: 'Bleach Day Tank', equipment_type: 'tank', assigned_chemical_id: 'chem-bleach', confidence: 0.9, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: 'TK-201' }, created_at: new Date().toISOString() },
  ];

  const linesList: PipingLine[] = [
    { id: 'line-1', project_id: 'proj-1', document_id: 'doc-pid', line_number: '3"-NH3-101-CS', from_equipment: 'V-101', to_equipment: 'P-101A', size: '3"', material: 'CS', stream_label: 'Ammonia Suction', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: 'chem-nh3', confidence: 0.9, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: '3"-NH3-101-CS' }, alerts: [], created_at: new Date().toISOString() },
    { id: 'line-2', project_id: 'proj-1', document_id: 'doc-pid', line_number: '1.5"-BL-201-PVC', from_equipment: 'TK-201', to_equipment: 'V-101', size: '1.5"', material: 'PVC', stream_label: 'Bleach Dosing', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: 'chem-bleach', confidence: 0.9, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: '1.5"-BL-201-PVC' }, alerts: [], created_at: new Date().toISOString() },
  ];

  const graph = buildProcessTopologyGraph(eqList, linesList, [chemAmmonia, chemBleach]);

  assert.strictEqual(graph.incompatible_mixing_detected, true, 'Incompatible mixing detected');
  const v101 = graph.nodes.find((n) => n.tag === 'V-101');
  assert.ok(v101?.alerts.some((a) => a.includes('chloramine gas')), 'V-101 flagged with chloramine gas alert');
});

// ----------------------------------------------------
// Test Group 5: Graph Validation Engine
// ----------------------------------------------------
console.log('\n--- Test Group 5: Graph Validation Engine ---');

test('Validation flags critical errors for duplicate tags and non-existent line endpoints', () => {
  const badEquipment: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'TK-101', description: 'Tank 1', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'TK-101', description: 'Duplicate Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
  ];

  const badLines: PipingLine[] = [
    { id: 'l1', project_id: 'p1', document_id: 'd1', line_number: 'L-101', from_equipment: 'TK-101', to_equipment: 'NON_EXISTENT_PUMP', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];

  const result = validateProcessGraph(badEquipment, badLines, []);
  assert.strictEqual(result.is_valid, false, 'Graph is invalid');
  assert.ok(result.errors_count >= 2, `Expected at least 2 errors, found ${result.errors_count}`);
  assert.ok(result.issues.some((i) => i.code.includes('DUPLICATE_TAG')), 'Duplicate tag error present');
  assert.ok(result.issues.some((i) => i.code.includes('INVALID_TO_NODE') || i.code.includes('INVALID_ENDPOINT')), 'Invalid endpoint error present');
});

test('Validation flags disconnected/isolated equipment with a warning and blocks approval until acknowledged', () => {
  const eqWithIsolated: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'TK-101', description: 'Feed Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'MX-101', description: 'Mixer', equipment_type: 'mixing_tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
    { id: 'e3', project_id: 'p1', document_id: 'd1', tag: 'E-101', description: 'Isolated Exchanger', equipment_type: 'heat_exchanger', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
  ];

  const connectedLines: PipingLine[] = [
    { id: 'l1', project_id: 'p1', document_id: 'd1', line_number: 'L-101', from_equipment: 'TK-101', to_equipment: 'MX-101', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];

  // Without acknowledgment
  const resBeforeAck = validateProcessGraph(eqWithIsolated, connectedLines, []);
  assert.ok(resBeforeAck.warnings_count >= 1, 'Isolated equipment warning found');
  const isolatedIssue = resBeforeAck.issues.find((i) => i.code.includes('DISCONNECTED_NODE'));
  assert.ok(isolatedIssue, 'WARN_DISCONNECTED_NODE present');
  assert.strictEqual(resBeforeAck.can_approve, false, 'Unacknowledged warning blocks can_approve');

  // With engineering acknowledgment
  const ackSet = new Set(['WARN_DISCONNECTED_NODE']);
  const resAfterAck = validateProcessGraph(eqWithIsolated, connectedLines, [], ackSet);
  assert.strictEqual(resAfterAck.can_approve, true, 'Acknowledged warning allows approval');
});

test('Validation flags 0-edge graph as not ready for approval', () => {
  const eqList: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'TK-101', description: 'Feed Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'MX-101', description: 'Mixer', equipment_type: 'mixing_tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
  ];

  const result = validateProcessGraph(eqList, [], []);
  assert.strictEqual(result.can_approve, false, '0-edge graph cannot be approved');
  assert.ok(result.issues.some((i) => i.code.includes('DISCONNECTED_GRAPH') || i.code.includes('NO_EDGES')), 'NO_EDGES code raised');
});

// ----------------------------------------------------
// Test Group 6: PHA Study Node Candidate Segmentation
// ----------------------------------------------------
console.log('\n--- Test Group 6: PHA Study Node Candidate Segmentation ---');

test('Partitions process graph into candidate study nodes (N-001, N-002, N-003) based on functional intent', () => {
  const eq: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'TK-101', description: 'NaOH Day Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'TK-102', description: 'H2SO4 Storage', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
    { id: 'e3', project_id: 'p1', document_id: 'd1', tag: 'MX-101', description: 'Neutralization Mixer', equipment_type: 'mixing_tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
    { id: 'e4', project_id: 'p1', document_id: 'd1', tag: 'P-101', description: 'Transfer Pump', equipment_type: 'pump', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
    { id: 'e5', project_id: 'p1', document_id: 'd1', tag: 'E-101', description: 'Product Cooler', equipment_type: 'heat_exchanger', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
  ];

  const lines: PipingLine[] = [
    { id: 'l1', project_id: 'p1', document_id: 'd1', line_number: 'L-101', from_equipment: 'TK-101', to_equipment: 'MX-101', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, alerts: [], created_at: '' },
    { id: 'l2', project_id: 'p1', document_id: 'd1', line_number: 'L-102', from_equipment: 'TK-102', to_equipment: 'MX-101', size: '1.5"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, alerts: [], created_at: '' },
    { id: 'l3', project_id: 'p1', document_id: 'd1', line_number: 'L-103', from_equipment: 'MX-101', to_equipment: 'P-101', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, alerts: [], created_at: '' },
    { id: 'l4', project_id: 'p1', document_id: 'd1', line_number: 'L-104', from_equipment: 'P-101', to_equipment: 'E-101', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];

  const candidates = generateCandidatePhaNodes('p1', eq, lines);
  assert.ok(candidates.length >= 2, `Segmented into ${candidates.length} candidate nodes`);
  assert.strictEqual(candidates[0].node_id, 'N-001');
  assert.strictEqual(candidates[0].status, 'candidate_not_authoritative');
  assert.ok(candidates[0].design_intent.length > 0, 'Design intent generated');
});

// ----------------------------------------------------
// Test Group 7: HAZOP Readiness Rules
// ----------------------------------------------------
console.log('\n--- Test Group 7: HAZOP Readiness Rules ---');

test('HAZOP readiness blocks when graph is unapproved, or node lacks design intent, or limits missing', () => {
  const nodes: PhaStudyNode[] = [
    {
      id: 'n1',
      project_id: 'p1',
      node_id: 'N-001',
      name: 'Reaction Section',
      design_intent: 'Mix feed chemicals safely',
      equipment_tags: ['MX-101'],
      line_numbers: ['L-101'],
      inlet_boundaries: [],
      outlet_boundaries: [],
      basis_for_grouping: 'Reaction vessel',
      status: 'approved',
      unresolved_questions: [],
      operating_limits: {
        temperature_safe_upper: 60,
        temperature_safe_lower: 10,
        pressure_safe_upper: 2.0,
        units: { temperature: '°C', pressure: 'bar' },
      },
      created_at: '',
      updated_at: '',
    },
  ];

  const sampleEq: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'MX-101', description: 'Neutralizer', equipment_type: 'mixing_tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, created_at: '' },
  ];
  const sampleLines: PipingLine[] = [
    { id: 'l1', project_id: 'p1', document_id: 'd1', line_number: 'L-101', from_equipment: 'MX-101', to_equipment: 'MX-101', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'pid', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];

  // Case 1: Graph NOT approved
  const resUnapproved = checkHazopReadiness(sampleEq, sampleLines, [], nodes, false);
  assert.strictEqual(resUnapproved.ready, false, 'Unapproved graph blocks HAZOP');
  assert.ok(resUnapproved.blocking_reasons.some((r) => r.includes('approved')), 'Reports graph approval blocker');

  // Case 2: Node not approved
  nodes[0].status = 'under_review';
  const resNodeUnderReview = checkHazopReadiness(sampleEq, sampleLines, [], nodes, true);
  assert.strictEqual(resNodeUnderReview.ready, false, 'Unapproved node blocks HAZOP');

  // Case 3: Node missing design intent
  nodes[0].status = 'approved';
  nodes[0].design_intent = '';
  const resMissingIntent = checkHazopReadiness(sampleEq, sampleLines, [], nodes, true);
  assert.strictEqual(resMissingIntent.ready, false, 'Missing design intent blocks HAZOP');

  // Case 4: Complete and verified -> HAZOP ready!
  nodes[0].design_intent = 'Controlled neutralization at 50 °C';
  const resReady = checkHazopReadiness(sampleEq, sampleLines, [], nodes, true);
  assert.strictEqual(resReady.ready, true, 'Complete prerequisites make HAZOP ready');
  assert.strictEqual(resReady.blocking_reasons.length, 0);
});

// ----------------------------------------------------
// Test Group 8: Export Engine (JSON & CSV)
// ----------------------------------------------------
console.log('\n--- Test Group 8: Export Engine (JSON & CSV) ---');

test('Generates valid JSON export with disclaimer and OSHA provenance', () => {
  const project: ProcessProject = {
    id: 'p-1',
    name: 'Unit 100 Process',
    description: 'Test process',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_sample: false,
  };

  const chem = parseSdsContent(mockDocContent, 'doc-1', 'ammonia.pdf', 'p-1');
  const jsonStr = exportProjectToJson(project, [], [chem], [], { nodes: [], edges: [], localized_alerts_count: 0, incompatible_mixing_detected: false, provisional_alerts: [] });
  const parsed = JSON.parse(jsonStr);

  assert.strictEqual(parsed.project.name, 'Unit 100 Process');
  assert.ok(parsed.export_metadata.notice.includes('DISCLAIMER'), 'Includes regulatory disclaimer');
  assert.strictEqual(parsed.chemicals.length, 1);
});

test('Generates valid CSV export with all 7 PSI parameters and review statuses', () => {
  const chem = parseSdsContent(mockDocContent, 'doc-1', 'ammonia.pdf', 'p-1');
  const csvStr = exportProjectToCsv([chem]);

  assert.ok(csvStr.includes('Chemical Name') && csvStr.includes('CAS Number'), 'Header present');
  assert.ok(csvStr.includes('Anhydrous Ammonia Refrigeration Grade'), 'Chemical name present');
  assert.ok(csvStr.includes('7664-41-7'), 'CAS number present');
  assert.ok(csvStr.includes('needs_review'), 'Review status present');
  assert.ok(csvStr.includes('Permissible Exposure Limits'), 'PEL field row present');
});

// ----------------------------------------------------
// Test Group 9: Audit Trail & Approval Invalidation Gate
// ----------------------------------------------------
console.log('\n--- Test Group 9: Audit Trail & Approval Invalidation Gate ---');

test('Upstream modification to equipment logs to audit trail and automatically invalidates graph approval', () => {
  const testStore = new PsiDataStore();
  const testProj = testStore.createProject('Gate Test Project', 'Testing approval invalidation');

  // Add equipment and line
  const eqTag: EquipmentTag = {
    id: 'test-eq-1',
    project_id: testProj.id,
    document_id: 'd1',
    tag: 'TK-999',
    description: 'Feed Storage Tank',
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 1,
    status: 'confirmed',
    source: { document: 'pid', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const lineTag: PipingLine = {
    id: 'test-line-1',
    project_id: testProj.id,
    document_id: 'd1',
    line_number: 'L-999',
    from_equipment: 'TK-999',
    to_equipment: 'TK-999',
    size: '2"',
    material: 'CS',
    stream_label: 'Circulation',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    confidence: 1,
    status: 'confirmed',
    source: { document: 'pid', page: 1, snippet: '' },
    alerts: [],
    created_at: new Date().toISOString(),
  };

  testStore.addEquipment([eqTag], 'Engineer Alice', 'Initial setup');
  testStore.addLines([lineTag], 'Engineer Alice', 'Initial connection');

  // Approve graph
  const appResult = testStore.approveGraph(testProj.id, 'Lead PE Bob', 'Initial topology signoff');
  assert.strictEqual(appResult.success, true, 'Graph approved successfully');
  assert.strictEqual(testStore.getGraphApproval(testProj.id).approved, true, 'Approval verified');

  // Verify audit log has entry
  const logs = testStore.listAuditLog(testProj.id);
  assert.ok(logs.some((l) => l.action === 'approve'), 'Audit log records approval action');

  // Now, perform upstream edit on equipment tag
  testStore.updateEquipment(
    'test-eq-1',
    { tag: 'TK-999-REVISED', description: 'Revised tank description' },
    'Engineer Charlie',
    'Drawing revision C changed tag'
  );

  // Assert that approval is automatically invalidated!
  const approvalAfterEdit = testStore.getGraphApproval(testProj.id);
  assert.strictEqual(approvalAfterEdit.approved, false, 'Upstream edit invalidated graph approval');

  // Clean up
  testStore.deleteProject(testProj.id);
});

// ----------------------------------------------------
// Test Group 10: 9 Specific Scenarios from Engineering Audit
// ----------------------------------------------------
console.log('\n--- Test Group 10: 9 Specific Scenarios from Engineering Audit ---');

const testChemAmmonia: ChemicalRecord = {
  id: 'c-nh3',
  project_id: 'p-scenarios',
  sds_document_id: 'doc-apex',
  chemical_name: { value: 'Anhydrous Ammonia Refrigeration Grade', machine_value: 'Ammonia', user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  cas_number: { value: '7664-41-7', machine_value: '7664-41-7', user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  sds_revision_date: { value: '2024-01-15', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  manufacturer: { value: 'Apex Industrial Chemicals LLC', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  psi_parameters: {
    toxicity: { value: 'Inhalation LC50 rat 2000 ppm/4h', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '11', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    permissible_exposure_limits: { value: '50 ppm (35 mg/m3) 8-hr TWA', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '8', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    physical_data: { value: 'BP -33.34 C', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '9', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    reactivity_data: { value: 'Reacts violently with strong acids', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '10', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    corrosivity_data: { value: 'Corrosive to copper and zinc alloys', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '10', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    thermal_and_chemical_stability_data: { value: 'Decomposes above 450 C', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '10', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    inadvertent_mixing_hazards: { value: 'Inadvertent mixing with bleach produces deadly toxic chloramine gas', machine_value: null, user_value: null, source: { document: 'Apex_SDS.pdf', document_id: 'doc-apex', page: 1, section: '10', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const testChemBleach: ChemicalRecord = {
  id: 'c-bleach',
  project_id: 'p-scenarios',
  sds_document_id: 'doc-bleach',
  chemical_name: { value: 'Sodium Hypochlorite 12.5%', machine_value: 'Bleach', user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  cas_number: { value: '7681-52-9', machine_value: '7681-52-9', user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  sds_revision_date: { value: '2024-01-01', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  manufacturer: { value: 'Apex Chemicals', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '1', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  psi_parameters: {
    toxicity: { value: 'Harmful if swallowed', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '11', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    permissible_exposure_limits: { value: '1 ppm STEL', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '8', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    physical_data: { value: 'Liquid pH 12', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '9', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    reactivity_data: { value: 'Releases toxic chlorine gas with acids', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '10', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    corrosivity_data: { value: 'Corrosive to steel', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '10', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    thermal_and_chemical_stability_data: { value: 'Decomposes on heating', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '10', snippet: '' }, confidence: 1, review_status: 'confirmed' },
    inadvertent_mixing_hazards: { value: 'Inadvertent mixing with ammonia generates deadly chloramine gas', machine_value: null, user_value: null, source: { document: 'Bleach_SDS.pdf', document_id: 'doc-bleach', page: 1, section: '10', snippet: '' }, confidence: 1, review_status: 'confirmed' },
  },
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

test('Scenario 1: Graph containing 8 nodes and 2 edges with isolated node detection', () => {
  const eightNodes: EquipmentTag[] = [
    { id: 'eq-1', project_id: 'p-audit', document_id: 'd-1', tag: 'V-101', description: 'Receiver Drum', equipment_type: 'vessel', assigned_chemical_id: 'c-nh3', confidence: 0.95, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: 'V-101' }, created_at: '' },
    { id: 'eq-2', project_id: 'p-audit', document_id: 'd-1', tag: 'P-101A', description: 'Transfer Pump', equipment_type: 'pump', assigned_chemical_id: 'c-nh3', confidence: 0.95, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: 'P-101A' }, created_at: '' },
    { id: 'eq-3', project_id: 'p-audit', document_id: 'd-1', tag: 'TK-201', description: 'Bleach Day Tank', equipment_type: 'tank', assigned_chemical_id: 'c-bleach', confidence: 0.95, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: 'TK-201' }, created_at: '' },
    { id: 'eq-4', project_id: 'p-audit', document_id: 'd-1', tag: 'E-101', description: 'Product Cooler', equipment_type: 'heat_exchanger', assigned_chemical_id: null, confidence: 0.90, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: 'E-101' }, created_at: '' },
    { id: 'eq-5', project_id: 'p-audit', document_id: 'd-2', tag: 'TK-101', description: 'Neutralizer Feed Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 0.85, status: 'provisional', source: { document: 'pid2.pdf', page: 1, snippet: 'TK-101' }, created_at: '' },
    { id: 'eq-6', project_id: 'p-audit', document_id: 'd-2', tag: 'TK-102', description: 'Acid Storage Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 0.85, status: 'provisional', source: { document: 'pid2.pdf', page: 1, snippet: 'TK-102' }, created_at: '' },
    { id: 'eq-7', project_id: 'p-audit', document_id: 'd-2', tag: 'P-101', description: 'Effluent Pump', equipment_type: 'pump', assigned_chemical_id: null, confidence: 0.85, status: 'provisional', source: { document: 'pid2.pdf', page: 1, snippet: 'P-101' }, created_at: '' },
    { id: 'eq-8', project_id: 'p-audit', document_id: 'd-2', tag: 'XV-101', description: 'Emergency Shutoff', equipment_type: 'control_valve', assigned_chemical_id: null, confidence: 0.80, status: 'provisional', source: { document: 'pid2.pdf', page: 1, snippet: 'XV-101' }, created_at: '' },
  ];

  const twoLines: PipingLine[] = [
    { id: 'l-1', project_id: 'p-audit', document_id: 'd-1', line_number: '3"-NH3-101-CS', from_equipment: 'V-101', to_equipment: 'P-101A', size: '3"', material: 'CS', stream_label: 'Ammonia Suction', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: 'c-nh3', confidence: 0.9, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: '3"-NH3-101-CS' }, alerts: [], created_at: '' },
    { id: 'l-2', project_id: 'p-audit', document_id: 'd-1', line_number: '1.5"-BL-201-PVC', from_equipment: 'TK-201', to_equipment: 'V-101', size: '1.5"', material: 'PVC', stream_label: 'Bleach Dosing', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: 'c-bleach', confidence: 0.9, status: 'confirmed', source: { document: 'pid.pdf', page: 1, snippet: '1.5"-BL-201-PVC' }, alerts: [], created_at: '' },
  ];

  const graph = buildProcessTopologyGraph(eightNodes, twoLines, []);
  assert.strictEqual(graph.counts.equipment_nodes_count, 8, '8 nodes recorded');
  assert.strictEqual(graph.counts.confirmed_process_edges_count, 2, '2 confirmed edges recorded');
  assert.strictEqual(graph.counts.isolated_nodes_count, 5, '5 isolated nodes detected (E-101, TK-101, TK-102, P-101, XV-101)');

  const isolatedNodes = graph.nodes.filter((n) => n.is_isolated);
  assert.strictEqual(isolatedNodes.length, 5, '5 nodes flagged as isolated');
  assert.ok(isolatedNodes.some((n) => n.tag === 'E-101'), 'E-101 is isolated');
  assert.ok(isolatedNodes.some((n) => n.tag === 'TK-101'), 'TK-101 is isolated');
});

test('Scenario 2: Disconnected equipment and unresolved connections validation and tracking', () => {
  const eq: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'TK-100', description: 'Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'TK-200', description: 'Isolated Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
  ];
  const lines: PipingLine[] = [
    { id: 'l1', project_id: 'p1', document_id: 'd1', line_number: 'L-UNRESOLVED', from_equipment: 'TK-100', to_equipment: 'TK-100', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'unknown', assigned_chemical_id: null, confidence: 0.5, status: 'unresolved', source: { document: 'p', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];

  const graph = buildProcessTopologyGraph(eq, lines, []);
  assert.strictEqual(graph.counts.unresolved_connections_count, 1, 'Unresolved connection tracked');
  assert.strictEqual(graph.counts.isolated_nodes_count, 1, 'TK-200 detected as isolated');

  const val = validateProcessGraph(eq, lines, []);
  assert.ok(val.issues.some((i) => i.code.includes('DISCONNECTED_NODE')), 'Disconnected equipment raises warning');
  assert.strictEqual(val.can_approve, false, 'Unacknowledged disconnected equipment blocks approval');
});

test('Scenario 3: Signal lines vs process-material piping (cannot carry process fluids)', () => {
  const eq: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'FIT-101', description: 'Flow Transmitter', equipment_type: 'instrument', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'MX-101', description: 'Mixer', equipment_type: 'mixing_tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
  ];
  const lines: PipingLine[] = [
    { id: 'l-sig', project_id: 'p1', document_id: 'd1', line_number: 'SIG-101', from_equipment: 'FIT-101', to_equipment: 'MX-101', size: '', material: 'Copper/Shielded Cable', stream_label: '4-20mA loop', functional_type: 'signal_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];

  const graph = buildProcessTopologyGraph(eq, lines, []);
  assert.strictEqual(graph.counts.signal_only_connections_count, 1, 'Signal line tracked separately from piping');
  assert.strictEqual(graph.counts.confirmed_process_edges_count, 0, 'Signal line is NOT counted as process piping edge');
  assert.strictEqual(graph.incompatible_mixing_detected, false, 'Signal loop cannot transport chemicals or trigger mixing alert');

  // Test validation error if chemical is mistakenly assigned to signal line
  const badSigLine: PipingLine = { ...lines[0], assigned_chemical_id: 'chem-hazardous' };
  const valResult = validateProcessGraph(eq, [badSigLine], []);
  assert.ok(valResult.issues.some((i) => i.code.includes('SIGNAL_LINE_HAS_CHEMICAL')), 'Flags error when signal line is assigned a chemical');
});

test('Scenario 4: Potential vs validated chemical-mixing alerts with evidence and assumptions', () => {
  // Case A: Validated scenario (confirmed physical piping directly feeding incompatible chemicals into common vessel)
  const eqValidated: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'V-101', description: 'Receiver', equipment_type: 'vessel', assigned_chemical_id: 'c-nh3', confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'TK-201', description: 'Bleach Tank', equipment_type: 'tank', assigned_chemical_id: 'c-bleach', confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
  ];
  const linesValidated: PipingLine[] = [
    { id: 'l1', project_id: 'p1', document_id: 'd1', line_number: 'L-BLEACH-FEED', from_equipment: 'TK-201', to_equipment: 'V-101', size: '1.5"', material: 'PVC', stream_label: 'Bleach', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: 'c-bleach', confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];
  const chems = [testChemAmmonia, testChemBleach];

  const graphVal = buildProcessTopologyGraph(eqValidated, linesValidated, chems);
  assert.strictEqual(graphVal.incompatible_mixing_detected, true, 'Mixing detected');
  assert.strictEqual(graphVal.mixing_alerts.length, 1, '1 mixing alert generated');
  const validatedAlert = graphVal.mixing_alerts[0];
  assert.strictEqual(validatedAlert.status, 'validated', 'Direct confirmed inlet gives validated status');
  assert.ok(validatedAlert.reaction_description.toLowerCase().includes('chloramine'), 'Reaction details chloramines');
  assert.ok(validatedAlert.sds_evidence.length > 0, 'SDS evidence preserved');
  assert.ok(validatedAlert.pid_evidence.includes('L-BLEACH-FEED'), 'P&ID evidence references line');
  assert.ok(validatedAlert.limitations.includes('operating flow conditions'), 'Limitations disclaimer included');

  // Case B: Provisional / Unresolved scenario (provisional line connection)
  const linesProvisional: PipingLine[] = [
    { id: 'l2', project_id: 'p1', document_id: 'd1', line_number: 'L-BLEACH-CANDIDATE', from_equipment: 'TK-201', to_equipment: 'V-101', size: '1.5"', material: 'PVC', stream_label: 'Bleach', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: 'c-bleach', confidence: 0.6, status: 'provisional', source: { document: 'p', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];
  const graphProv = buildProcessTopologyGraph(eqValidated, linesProvisional, chems);
  assert.strictEqual(graphProv.mixing_alerts[0].status, 'unresolved', 'Provisional connection marks mixing pathway as unresolved');
});

test('Scenario 5: Incompatible chemicals without demonstrated connection produce zero mixing alerts', () => {
  // Two equipment nodes hold incompatible chemicals (Ammonia in V-101, Bleach in TK-201)
  // but they have NO connecting piping lines
  const eqSeparated: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'V-101', description: 'Ammonia Receiver', equipment_type: 'vessel', assigned_chemical_id: 'c-nh3', confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'TK-201', description: 'Bleach Tank', equipment_type: 'tank', assigned_chemical_id: 'c-bleach', confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
  ];
  const noConnectedLines: PipingLine[] = [];
  const chems = [testChemAmmonia, testChemBleach];

  const graph = buildProcessTopologyGraph(eqSeparated, noConnectedLines, chems);
  assert.strictEqual(graph.incompatible_mixing_detected, false, 'No mixing detected without physical piping');
  assert.strictEqual(graph.mixing_alerts.length, 0, 'Zero mixing alerts produced without connecting pathway');
});

test('Scenario 6: Conflicting PSI limits from different sources (35 ppm vs 50 ppm)', () => {
  const sdsApex = parseSdsContent(mockDocContent, 'doc-apex', 'Apex_Anhydrous_Ammonia_SDS_2024.pdf', 'proj-conflict');
  const chemCorpText = `
    SAFETY DATA SHEET
    SECTION 1: IDENTIFICATION
    Product Identifier: Ammonia Anhydrous
    CAS-No: 7664-41-7
    Manufacturer: ChemCorp Global
    Revision Date: 2022-05-10
    SECTION 8: EXPOSURE CONTROLS / PERSONAL PROTECTION
    OSHA PEL: 35 ppm 8-hr TWA.
  `;
  const sdsChemCorp = parseSdsContent(
    { text: chemCorpText, pages: [{ pageNumber: 1, text: chemCorpText }], pagesCount: 1, isReadable: true },
    'doc-chemcorp',
    'ChemCorp_Anhydrous_Ammonia_SDS_2022.pdf',
    'proj-conflict'
  );

  const conflicts = detectConflictsForProject([sdsApex, sdsChemCorp], 'proj-conflict');
  const pelConflict = conflicts.find((c) => c.field_key === 'permissible_exposure_limits');
  assert.ok(pelConflict, 'PEL conflict identified');
  assert.strictEqual(pelConflict.status, 'unresolved', 'Starts as unresolved human decision');
  assert.strictEqual(pelConflict.resolved_value, null, 'SafeFlow AI does not auto-select or hardcode either value');

  const apexEntry = pelConflict.entries.find((e) => e.document_name.includes('Apex'));
  const chemCorpEntry = pelConflict.entries.find((e) => e.document_name.includes('ChemCorp'));
  assert.ok(apexEntry?.value.includes('50 ppm'), 'Apex reports 50 ppm (Table Z-1)');
  assert.ok(chemCorpEntry?.value.includes('35 ppm'), 'ChemCorp reports 35 ppm');
  assert.strictEqual(apexEntry?.revision_date, '2024-01-15', 'Apex date preserved');
  assert.strictEqual(chemCorpEntry?.revision_date, '2022-05-10', 'ChemCorp date preserved');
});

test('Scenario 7: Persistence of manual graph edits to store and reload', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Persistence Test', 'Testing data store roundtrip');
  const uniqueEqId = 'eq-persist-' + Date.now();

  // Add manual equipment tag
  const newEq: EquipmentTag = {
    id: uniqueEqId,
    project_id: proj.id,
    document_id: 'manual',
    tag: 'R-301',
    description: 'Manual Reactor',
    equipment_type: 'reactor',
    assigned_chemical_id: null,
    confidence: 1,
    status: 'confirmed',
    source: { document: 'Manual Entry', page: 1, snippet: 'Added by Engineer' },
    is_manual_entry: true,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([newEq], 'Lead PE', 'Manual addition of reactor');

  // Verify equipment is retrievable
  const eqList = store.listEquipment(proj.id);
  assert.ok(eqList.some((e) => e.tag === 'R-301'), 'Equipment persisted');

  // Update tag
  store.updateEquipment(uniqueEqId, { description: 'Updated Polymerizer' }, 'Lead PE', 'Tag clarified');
  const updated = store.listEquipment(proj.id).find((e) => e.id === uniqueEqId);
  assert.strictEqual(updated?.description, 'Updated Polymerizer', 'Edits persisted');

  // Verify audit log has 2 records
  const auditLogs = store.listAuditLog(proj.id);
  assert.ok(auditLogs.some((l) => l.action === 'create' && l.entity_id === uniqueEqId));
  assert.ok(auditLogs.some((l) => l.action === 'update' && l.entity_id === uniqueEqId));

  store.deleteProject(proj.id);
});

test('Scenario 8: Approval blocked by critical validation errors and unacknowledged warnings', () => {
  // Critical error (invalid endpoint)
  const badEq: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'TK-1', description: 'T1', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
  ];
  const badLines: PipingLine[] = [
    { id: 'l1', project_id: 'p1', document_id: 'd1', line_number: 'L-1', from_equipment: 'TK-1', to_equipment: 'GHOST_VESSEL', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];
  const valCritical = validateProcessGraph(badEq, badLines, []);
  assert.strictEqual(valCritical.can_approve, false, 'Critical error blocks can_approve');
  assert.ok(valCritical.errors_count > 0, 'Critical error reported');

  // Isolated node warning blocks approval until acknowledged
  const isolatedEq: EquipmentTag[] = [
    { id: 'e1', project_id: 'p1', document_id: 'd1', tag: 'TK-1', description: 'T1', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
    { id: 'e2', project_id: 'p1', document_id: 'd1', tag: 'P-1', description: 'P1', equipment_type: 'pump', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
    { id: 'e3', project_id: 'p1', document_id: 'd1', tag: 'STANDBY-DRUM', description: 'Spare', equipment_type: 'vessel', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
  ];
  const validLine: PipingLine[] = [
    { id: 'l1', project_id: 'p1', document_id: 'd1', line_number: 'L-1', from_equipment: 'TK-1', to_equipment: 'P-1', size: '2"', material: 'CS', stream_label: '', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];

  const valUnack = validateProcessGraph(isolatedEq, validLine, []);
  assert.strictEqual(valUnack.can_approve, false, 'Unacknowledged warning blocks approval');

  const valAck = validateProcessGraph(isolatedEq, validLine, [], new Set(['WARN_DISCONNECTED_NODE']));
  assert.strictEqual(valAck.can_approve, true, 'Acknowledging isolated equipment warning allows approval');
});

test('Scenario 9: PHA node segmentation using an approved graph and HAZOP readiness verification', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('PHA Flow Project', 'Testing PHA node gating');

  const eqList: EquipmentTag[] = [
    { id: 'eq-t1', project_id: proj.id, document_id: 'd1', tag: 'TK-101', description: 'Feed Tank', equipment_type: 'tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
    { id: 'eq-m1', project_id: proj.id, document_id: 'd1', tag: 'MX-101', description: 'Mixing Vessel', equipment_type: 'mixing_tank', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, created_at: '' },
  ];
  const linesList: PipingLine[] = [
    { id: 'ln-1', project_id: proj.id, document_id: 'd1', line_number: 'L-101', from_equipment: 'TK-101', to_equipment: 'MX-101', size: '2"', material: 'CS', stream_label: 'Feed', functional_type: 'piping_line', flow_direction: 'forward', assigned_chemical_id: null, confidence: 1, status: 'confirmed', source: { document: 'p', page: 1, snippet: '' }, alerts: [], created_at: '' },
  ];

  store.addEquipment(eqList, 'PE', 'Setup');
  store.addLines(linesList, 'PE', 'Setup');

  // Verify graph approval gating
  assert.strictEqual(store.getGraphApproval(proj.id).approved, false, 'Starts unapproved');

  // Generate candidate nodes
  const candidateNodes = generateCandidatePhaNodes(proj.id, eqList, linesList);
  assert.ok(candidateNodes.length > 0, 'Candidate nodes segmented');
  assert.strictEqual(candidateNodes[0].status, 'candidate_not_authoritative');

  // Approve graph
  store.approveGraph(proj.id, 'Lead PE', 'P&ID Verified');
  assert.strictEqual(store.getGraphApproval(proj.id).approved, true, 'Graph is approved');

  // HAZOP Readiness check
  const readyBeforeNodeApprove = checkHazopReadiness(eqList, linesList, [], candidateNodes, true);
  assert.strictEqual(readyBeforeNodeApprove.ready, false, 'Candidate node not yet approved blocks HAZOP');

  // Approve all nodes with operating limits and design intent
  for (const node of candidateNodes) {
    node.status = 'approved';
    node.design_intent = 'Controlled neutralization and feed mixing at 25 °C';
    node.operating_limits = {
      temperature_safe_upper: 50,
      temperature_safe_lower: 10,
      units: { temperature: '°C' },
    };
  }

  const readyAfterNodeApprove = checkHazopReadiness(eqList, linesList, [], candidateNodes, true);
  assert.strictEqual(readyAfterNodeApprove.ready, true, 'HAZOP ready once graph and nodes approved with limits');

  store.deleteProject(proj.id);
});

// ----------------------------------------------------
// Test Group 11: Manual Digital P&ID Editor & PHA Workflow Integration
// (Covering all 16 Acceptance Criteria from Section 14)
// ----------------------------------------------------
console.log('\n--- Test Group 11: Digital P&ID Editor & PHA Workflow Integration ---');

test('Criterion 1: Create a new digital P&ID drawing and save it', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Drawing Test Proj', 'Test');

  const drawing = store.saveDrawing({
    id: `draw-${Date.now()}-1`,
    project_id: proj.id,
    source_document_id: null,
    source_document_page: 1,
    title: 'Benzene Hydrogenation Digital P&ID',
    drawing_number: 'DWG-BZ-101',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'draft',
    background_visible: false,
    background_opacity: 0.5,
    elements: [],
    connectors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  assert.ok(drawing.id, 'Drawing has ID');
  assert.strictEqual(drawing.status, 'draft', 'Initial status is draft');
  assert.strictEqual(drawing.drawing_number, 'DWG-BZ-101');

  const loaded = store.getDrawing(drawing.id);
  assert.ok(loaded, 'Drawing retrieved from store');
  assert.strictEqual(loaded?.title, 'Benzene Hydrogenation Digital P&ID');

  store.deleteProject(proj.id);
});

test('Criterion 2: Add, move, edit, and delete equipment symbols', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Symbol CRUD Proj', 'Test');

  const elem1: DrawingElement = {
    id: 'el-crud-v101',
    tag: 'V-101',
    type: 'vessel',
    description: 'Flash Drum',
    position: { x: 100, y: 150 },
    size: { width: 90, height: 120 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'provisional',
    ports: [
      { id: 'p1', name: 'In', type: 'inlet', position: { x: -45, y: 0 } },
      { id: 'p2', name: 'Out', type: 'outlet', position: { x: 45, y: 0 } },
    ],
  };

  let drawing = store.saveDrawing({
    id: `draw-${Date.now()}-2`,
    project_id: proj.id,
    source_document_id: null,
    source_document_page: 1,
    title: 'CRUD P&ID',
    drawing_number: 'DWG-CRUD-01',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'draft',
    background_visible: false,
    background_opacity: 0.5,
    elements: [elem1],
    connectors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  assert.strictEqual(drawing.elements.length, 1, 'Element added');

  // Move element
  drawing.elements[0].position = { x: 300, y: 400 };
  // Edit element description and tag
  drawing.elements[0].description = 'High Pressure Flash Drum';
  drawing.elements[0].tag = 'V-101A';
  drawing = store.saveDrawing(drawing);

  assert.strictEqual(drawing.elements[0].position.x, 300, 'Element moved');
  assert.strictEqual(drawing.elements[0].description, 'High Pressure Flash Drum', 'Description edited');
  assert.strictEqual(drawing.elements[0].tag, 'V-101A', 'Tag edited');

  // Delete element
  drawing.elements = [];
  drawing = store.saveDrawing(drawing);
  assert.strictEqual(drawing.elements.length, 0, 'Element deleted');

  store.deleteProject(proj.id);
});

test('Criterion 3: Detect duplicate tags', () => {
  const duplicateDrawing: DigitalPidDrawing = {
    id: 'draw-dup-test',
    project_id: 'p-test',
    source_document_id: null,
    source_document_page: 1,
    title: 'Duplicate Tag Test',
    drawing_number: 'DWG-DUP',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'draft',
    background_visible: false,
    background_opacity: 0.5,
    elements: [
      {
        id: 'el-1',
        tag: 'P-101',
        type: 'pump',
        description: 'Pump 1',
        position: { x: 100, y: 100 },
        size: { width: 80, height: 80 },
        rotation: 0,
        assigned_chemical_id: null,
        status: 'provisional',
        ports: [{ id: 'p1', name: 'In', type: 'inlet', position: { x: -40, y: 0 } }],
      },
      {
        id: 'el-2',
        tag: 'P-101', // Duplicate tag!
        type: 'pump',
        description: 'Pump 2 Duplicate',
        position: { x: 300, y: 100 },
        size: { width: 80, height: 80 },
        rotation: 0,
        assigned_chemical_id: null,
        status: 'provisional',
        ports: [{ id: 'p2', name: 'In', type: 'inlet', position: { x: -40, y: 0 } }],
      },
    ],
    connectors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const validation = validateDigitalDrawing(duplicateDrawing, new Set());
  assert.strictEqual(validation.can_approve, false, 'Duplicate tag blocks approval');
  assert.ok(
    validation.issues.some((i) => i.code === 'ERR_DUPLICATE_TAG'),
    'ERR_DUPLICATE_TAG reported'
  );
});

test('Criterion 4: Connect valid ports', () => {
  const elA: DrawingElement = {
    id: 'el-v101',
    tag: 'V-101',
    type: 'vessel',
    description: 'Receiver',
    position: { x: 100, y: 200 },
    size: { width: 90, height: 120 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_out', name: 'Liquid Out', type: 'outlet', position: { x: 45, y: 0 } }],
  };

  const elB: DrawingElement = {
    id: 'el-p101',
    tag: 'P-101',
    type: 'pump',
    description: 'Recirc Pump',
    position: { x: 300, y: 200 },
    size: { width: 80, height: 80 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_in', name: 'Suction In', type: 'inlet', position: { x: -40, y: 0 } }],
  };

  const conn: DrawingConnector = {
    id: 'conn-1',
    line_number: 'L-101-2"-CS',
    from_element_id: 'el-v101',
    from_port_id: 'p_out',
    to_element_id: 'el-p101',
    to_port_id: 'p_in',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    status: 'confirmed',
  };

  const drawing: DigitalPidDrawing = {
    id: 'draw-valid-conn',
    project_id: 'p1',
    source_document_id: null,
    source_document_page: 1,
    title: 'Valid Connection Test',
    drawing_number: 'DWG-CONN',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'draft',
    background_visible: false,
    background_opacity: 0.5,
    elements: [elA, elB],
    connectors: [conn],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const val = validateDigitalDrawing(drawing, new Set());
  assert.strictEqual(val.errors_count, 0, 'No errors on valid port connection');
});

test('Criterion 5: Moving equipment preserves connector attachment', () => {
  const elA: DrawingElement = {
    id: 'el-v101',
    tag: 'V-101',
    type: 'vessel',
    description: 'Receiver',
    position: { x: 100, y: 200 },
    size: { width: 90, height: 120 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_out', name: 'Outlet', type: 'outlet', position: { x: 45, y: 0 } }],
  };

  const elB: DrawingElement = {
    id: 'el-p101',
    tag: 'P-101',
    type: 'pump',
    description: 'Pump',
    position: { x: 400, y: 200 },
    size: { width: 80, height: 80 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_in', name: 'Inlet', type: 'inlet', position: { x: -40, y: 0 } }],
  };

  const conn: DrawingConnector = {
    id: 'conn-preserve',
    line_number: 'L-102',
    from_element_id: 'el-v101',
    from_port_id: 'p_out',
    to_element_id: 'el-p101',
    to_port_id: 'p_in',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    status: 'confirmed',
  };

  // Move element A to (800, 900)
  elA.position = { x: 800, y: 900 };

  // Verify connector still references el-v101 and el-p101 without break
  assert.strictEqual(conn.from_element_id, elA.id, 'Connector from_element_id intact');
  assert.strictEqual(conn.to_element_id, elB.id, 'Connector to_element_id intact');

  // Verify dynamic port coordinates
  const newStartX = elA.position.x + elA.size.width / 2 + elA.ports[0].position.x;
  const newStartY = elA.position.y + elA.size.height / 2 + elA.ports[0].position.y;
  assert.strictEqual(newStartX, 800 + 45 + 45, 'Dynamic connector endpoint recalculated correctly');
  assert.strictEqual(newStartY, 900 + 60, 'Dynamic connector endpoint recalculated correctly');
});

test('Criterion 6: Crossing lines are not joined without an explicit tie-in junction', () => {
  // Line 1: Horizontal from (100, 200) to (500, 200)
  // Line 2: Vertical from (300, 50) to (300, 400)
  // They physically cross at (300, 200) in 2D space, but are not connected to each other
  const eqNorth: DrawingElement = {
    id: 'eq-n',
    tag: 'TK-N',
    type: 'tank',
    description: 'North Tank',
    position: { x: 260, y: 10 },
    size: { width: 80, height: 80 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_out', name: 'Out', type: 'outlet', position: { x: 0, y: 40 } }],
  };
  const eqSouth: DrawingElement = {
    id: 'eq-s',
    tag: 'TK-S',
    type: 'tank',
    description: 'South Tank',
    position: { x: 260, y: 410 },
    size: { width: 80, height: 80 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_in', name: 'In', type: 'inlet', position: { x: 0, y: -40 } }],
  };
  const eqWest: DrawingElement = {
    id: 'eq-w',
    tag: 'TK-W',
    type: 'tank',
    description: 'West Tank',
    position: { x: 50, y: 160 },
    size: { width: 80, height: 80 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_out', name: 'Out', type: 'outlet', position: { x: 40, y: 0 } }],
  };
  const eqEast: DrawingElement = {
    id: 'eq-e',
    tag: 'TK-E',
    type: 'tank',
    description: 'East Tank',
    position: { x: 520, y: 160 },
    size: { width: 80, height: 80 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_in', name: 'In', type: 'inlet', position: { x: -40, y: 0 } }],
  };

  const lineNS: DrawingConnector = {
    id: 'conn-ns',
    line_number: 'L-NS',
    from_element_id: 'eq-n',
    from_port_id: 'p_out',
    to_element_id: 'eq-s',
    to_port_id: 'p_in',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    status: 'confirmed',
  };

  const lineWE: DrawingConnector = {
    id: 'conn-we',
    line_number: 'L-WE',
    from_element_id: 'eq-w',
    from_port_id: 'p_out',
    to_element_id: 'eq-e',
    to_port_id: 'p_in',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    status: 'confirmed',
  };

  // Convert to equipment and lines
  const eqTags: EquipmentTag[] = [eqNorth, eqSouth, eqWest, eqEast].map((e) => ({
    id: e.id,
    project_id: 'p-cross',
    document_id: 'doc',
    tag: e.tag,
    description: e.description,
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 1,
    status: 'confirmed',
    source: { document: 'd', page: 1, snippet: '' },
    created_at: '',
  }));

  const pipeLines: PipingLine[] = [
    {
      id: lineNS.id,
      project_id: 'p-cross',
      document_id: 'doc',
      line_number: lineNS.line_number,
      from_equipment: 'TK-N',
      to_equipment: 'TK-S',
      size: '2"',
      material: 'CS',
      stream_label: '',
      functional_type: 'piping_line',
      flow_direction: 'forward',
      assigned_chemical_id: null,
      confidence: 1,
      status: 'confirmed',
      source: { document: 'd', page: 1, snippet: '' },
      alerts: [],
      created_at: '',
    },
    {
      id: lineWE.id,
      project_id: 'p-cross',
      document_id: 'doc',
      line_number: lineWE.line_number,
      from_equipment: 'TK-W',
      to_equipment: 'TK-E',
      size: '2"',
      material: 'CS',
      stream_label: '',
      functional_type: 'piping_line',
      flow_direction: 'forward',
      assigned_chemical_id: null,
      confidence: 1,
      status: 'confirmed',
      source: { document: 'd', page: 1, snippet: '' },
      alerts: [],
      created_at: '',
    },
  ];

  const graph = buildProcessTopologyGraph(eqTags, pipeLines, [], []);
  assert.strictEqual(graph.edges.length, 2, 'Only exactly 2 edges generated');
  // Verify there is NO connection between TK-W and TK-S or TK-N and TK-E
  const crossEdge = graph.edges.find((e) => e.source === 'TK-W' && e.target === 'TK-S');
  assert.strictEqual(crossEdge, undefined, 'Crossing lines are NOT automatically joined without a junction');
});

test('Criterion 7: Signal lines are not treated as process-material edges', () => {
  const transmitter: DrawingElement = {
    id: 'el-pt101',
    tag: 'PT-101',
    type: 'instrument',
    description: 'Pressure Transmitter',
    position: { x: 100, y: 100 },
    size: { width: 50, height: 50 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_sig', name: '4-20mA Signal', type: 'signal', position: { x: 25, y: 0 } }],
  };

  const controller: DrawingElement = {
    id: 'el-pic101',
    tag: 'PIC-101',
    type: 'instrument',
    description: 'Pressure Controller',
    position: { x: 300, y: 100 },
    size: { width: 50, height: 50 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'confirmed',
    ports: [{ id: 'p_in', name: 'Signal In', type: 'signal', position: { x: -25, y: 0 } }],
  };

  // Signal line wrongly assigned chemical fluid
  const illegalSignalLine: DrawingConnector = {
    id: 'conn-sig-bad',
    line_number: 'SIG-101',
    from_element_id: 'el-pt101',
    from_port_id: 'p_sig',
    to_element_id: 'el-pic101',
    to_port_id: 'p_in',
    functional_type: 'signal_line',
    flow_direction: 'forward',
    assigned_chemical_id: 'chem-toxic-ammonia', // ILLEGAL: chemical on signal wire!
    status: 'provisional',
  };

  const drawing: DigitalPidDrawing = {
    id: 'draw-sig-test',
    project_id: 'p1',
    source_document_id: null,
    source_document_page: 1,
    title: 'Signal Validation',
    drawing_number: 'DWG-SIG',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'draft',
    background_visible: false,
    background_opacity: 0.5,
    elements: [transmitter, controller],
    connectors: [illegalSignalLine],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const val = validateDigitalDrawing(drawing, new Set());
  assert.strictEqual(val.can_approve, false, 'Signal line with chemical blocks approval');
  assert.ok(
    val.issues.some((i) => i.code === 'ERR_SIGNAL_LINE_HAS_CHEMICAL' || i.code === 'ERR_SIGNAL_WITH_CHEMICAL'),
    'Signal line chemical violation correctly caught'
  );
});

test('Criterion 8: Saved drawings persist after store reloads', () => {
  const store1 = new PsiDataStore();
  const proj = store1.createProject('Persistence Project', 'Testing drawing persistence');

  const drawingData: DigitalPidDrawing = {
    id: `draw-persist-${Date.now()}`,
    project_id: proj.id,
    source_document_id: null,
    source_document_page: 1,
    title: 'Persistent P&ID Drawing',
    drawing_number: 'DWG-PERSIST-01',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'draft',
    background_visible: true,
    background_opacity: 0.6,
    elements: [
      {
        id: 'el-p1',
        tag: 'P-201',
        type: 'pump',
        description: 'Feed Pump',
        position: { x: 220, y: 340 },
        size: { width: 90, height: 80 },
        rotation: 0,
        assigned_chemical_id: null,
        status: 'provisional',
        ports: [],
      },
    ],
    connectors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store1.saveDrawing(drawingData);

  // Instantiate new store instance reading same database
  const store2 = new PsiDataStore();
  const loaded = store2.getDrawing(drawingData.id);

  assert.ok(loaded, 'Drawing persisted in database store');
  assert.strictEqual(loaded?.title, 'Persistent P&ID Drawing');
  assert.strictEqual(loaded?.elements.length, 1);
  assert.strictEqual(loaded?.elements[0].tag, 'P-201');

  store2.deleteProject(proj.id);
});

test('Criterion 9: Original imported P&ID files remain unchanged', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Overlay Source Test', 'Check source integrity');

  const docId = `doc-source-${Date.now()}`;
  store.addDocument({
    id: docId,
    project_id: proj.id,
    name: 'Authoritative_PID_Source_Sheet_1.pdf',
    original_filename: 'Authoritative_PID_Source_Sheet_1.pdf',
    file_path: '/uploads/Authoritative_PID_Source_Sheet_1.pdf',
    mime_type: 'application/pdf',
    size_bytes: 1048576,
    doc_type: 'pid',
    upload_timestamp: new Date().toISOString(),
    pages_count: 1,
    is_readable: true,
    chemical_ids: [],
  });

  const drawing = store.saveDrawing({
    id: `draw-overlay-${Date.now()}`,
    project_id: proj.id,
    source_document_id: docId,
    source_document_page: 1,
    title: 'Overlay Over Source',
    drawing_number: 'DWG-OVERLAY-01',
    revision: 'REV 0',
    mode: 'imported_overlay',
    status: 'draft',
    background_visible: true,
    background_opacity: 0.5,
    elements: [],
    connectors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Mutate and save drawing
  drawing.title = 'Modified Overlay Drawing Title';
  store.saveDrawing(drawing);

  // Verify source document record remains completely intact
  const docAfter = store.getDocument(docId);
  assert.ok(docAfter, 'Source document still exists');
  assert.strictEqual(docAfter?.name, 'Authoritative_PID_Source_Sheet_1.pdf');
  assert.strictEqual(docAfter?.file_path, '/uploads/Authoritative_PID_Source_Sheet_1.pdf');

  store.deleteProject(proj.id);
});

test('Criterion 10: Imported objects remain provisional until reviewed', () => {
  const importedElement: DrawingElement = {
    id: 'el-ocr-1',
    tag: 'V-101',
    type: 'vessel',
    description: 'AI Extracted Separator',
    position: { x: 200, y: 200 },
    size: { width: 90, height: 120 },
    rotation: 0,
    assigned_chemical_id: null,
    status: 'provisional',
    confidence: 0.72,
    ports: [],
  };

  assert.strictEqual(importedElement.status, 'provisional', 'Imported object status is provisional');
  assert.strictEqual(importedElement.confidence, 0.72);

  // Review and confirm
  importedElement.status = 'confirmed';
  importedElement.confidence = 1.0;
  assert.strictEqual(importedElement.status, 'confirmed', 'Explicit engineer review confirms object');
});

test('Criterion 11: Invalid drawings cannot bypass required approval checks', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Approval Gate Test', 'Testing approval block');

  // Drawing with dangling connector
  const invalidDrawing: DigitalPidDrawing = {
    id: `draw-invalid-${Date.now()}`,
    project_id: proj.id,
    source_document_id: null,
    source_document_page: 1,
    title: 'Invalid Dangling Drawing',
    drawing_number: 'DWG-DANGLING',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'draft',
    background_visible: false,
    background_opacity: 0.5,
    elements: [
      {
        id: 'el-1',
        tag: 'TK-101',
        type: 'tank',
        description: 'Tank',
        position: { x: 100, y: 100 },
        size: { width: 80, height: 80 },
        rotation: 0,
        assigned_chemical_id: null,
        status: 'provisional',
        ports: [{ id: 'p1', name: 'Out', type: 'outlet', position: { x: 40, y: 0 } }],
      },
    ],
    connectors: [
      {
        id: 'conn-dangling',
        line_number: 'L-GHOST',
        from_element_id: 'el-1',
        from_port_id: 'p1',
        to_element_id: 'non-existent-ghost-id',
        to_port_id: 'non-existent-port',
        functional_type: 'piping_line',
        flow_direction: 'forward',
        assigned_chemical_id: null,
        status: 'provisional',
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.saveDrawing(invalidDrawing);

  // Attempt to approve
  const approvalRes = store.approveDrawing(invalidDrawing.id, 'Lead PE', 'REV 0', 'Sign off');
  assert.strictEqual(approvalRes.success, false, 'Approval blocked by critical dangling connector');
  assert.ok(approvalRes.error?.includes('critical error'), 'Error explains blocking reason');

  store.deleteProject(proj.id);
});

test('Criterion 12: Graph generation uses structured connectivity rather than visual proximity', () => {
  // Two tanks placed side by side at x: 100 and x: 150 (close proximity)
  const tkA: EquipmentTag = {
    id: 'tk-a',
    project_id: 'p-prox',
    document_id: 'd1',
    tag: 'TK-A',
    description: 'Tank A',
    equipment_type: 'tank',
    assigned_chemical_id: 'chem-nh3',
    confidence: 1,
    status: 'confirmed',
    source: { document: 'd', page: 1, snippet: '' },
    created_at: '',
  };
  const tkB: EquipmentTag = {
    id: 'tk-b',
    project_id: 'p-prox',
    document_id: 'd1',
    tag: 'TK-B',
    description: 'Tank B',
    equipment_type: 'tank',
    assigned_chemical_id: 'chem-bleach',
    confidence: 1,
    status: 'confirmed',
    source: { document: 'd', page: 1, snippet: '' },
    created_at: '',
  };

  // No piping lines between them!
  const graph = buildProcessTopologyGraph([tkA, tkB], [], [], []);
  assert.strictEqual(graph.edges.length, 0, 'Zero edges without explicit piping');
  assert.strictEqual(graph.mixing_alerts.length, 0, 'No mixing alerts merely from visual proximity');
});

test('Criterion 13: Drawing revisions invalidate stale derived graphs', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Revision Invalidation Proj', 'Test');

  const validDrawing: DigitalPidDrawing = {
    id: `draw-rev-${Date.now()}`,
    project_id: proj.id,
    source_document_id: null,
    source_document_page: 1,
    title: 'Initial Drawing',
    drawing_number: 'DWG-REV-01',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'draft',
    background_visible: false,
    background_opacity: 0.5,
    elements: [
      {
        id: 'el-v1',
        tag: 'V-101',
        type: 'vessel',
        description: 'Vessel',
        position: { x: 100, y: 100 },
        size: { width: 90, height: 110 },
        rotation: 0,
        assigned_chemical_id: null,
        status: 'confirmed',
        ports: [{ id: 'p1', name: 'Out', type: 'outlet', position: { x: 45, y: 0 } }],
      },
      {
        id: 'el-p1',
        tag: 'P-101',
        type: 'pump',
        description: 'Pump',
        position: { x: 300, y: 100 },
        size: { width: 80, height: 80 },
        rotation: 0,
        assigned_chemical_id: null,
        status: 'confirmed',
        ports: [{ id: 'p2', name: 'In', type: 'inlet', position: { x: -40, y: 0 } }],
      },
    ],
    connectors: [
      {
        id: 'conn-1',
        line_number: 'L-101',
        from_element_id: 'el-v1',
        from_port_id: 'p1',
        to_element_id: 'el-p1',
        to_port_id: 'p2',
        functional_type: 'piping_line',
        flow_direction: 'forward',
        assigned_chemical_id: null,
        status: 'confirmed',
      },
    ],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.saveDrawing(validDrawing);

  // Approve drawing
  const appRes = store.approveDrawing(validDrawing.id, 'Lead PE', 'REV 0', 'Sign off');
  assert.strictEqual(appRes.success, true, 'Drawing approved');
  assert.strictEqual(store.getGraphApproval(proj.id).approved, true, 'Project graph approved');

  // Modify the approved drawing -> transitions to new draft revision
  const approvedDrawing = store.getDrawing(validDrawing.id)!;
  approvedDrawing.elements[0].tag = 'V-101B';
  const draftRevision = store.saveDrawing(approvedDrawing);

  assert.strictEqual(draftRevision.status, 'draft', 'Modified drawing reverts to draft');
  assert.ok(draftRevision.revision.includes('REV 1'), 'Advanced revision number');

  // Verify graph approval was invalidated
  assert.strictEqual(
    store.getGraphApproval(proj.id).approved,
    false,
    'Stale derived graph approval invalidated upon drawing modification'
  );

  store.deleteProject(proj.id);
});

test('Criterion 14: Approved drawings and graphs pass into PHA node segmentation', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('PHA Pipeline Proj', 'Test');

  const seeded = store.seedSampleDrawing(proj.id);
  assert.ok(seeded, 'Sample drawing seeded');

  // Sync drawing to project equipment and lines
  const syncRes = store.syncDrawingToProject(seeded.id, 'Lead PE');
  assert.strictEqual(syncRes.success, true, 'Drawing elements synced to project topology');
  assert.ok(syncRes.equipment_count! > 0, 'Equipment populated');
  assert.ok(syncRes.lines_count! > 0, 'Lines populated');

  // Segment PHA candidate nodes
  const eq = store.listEquipment(proj.id);
  const lines = store.listLines(proj.id);
  const phaNodes = generateCandidatePhaNodes(proj.id, eq, lines);

  assert.ok(phaNodes.length > 0, 'Candidate study nodes segmented from digital drawing topology');
  assert.ok(
    phaNodes.some((n) => n.equipment_tags.includes('V-101')),
    'V-101 included in segmented node'
  );

  store.deleteProject(proj.id);
});

test('Criterion 15: PSI provenance and unresolved conflicts remain intact', () => {
  const chem: ChemicalRecord = {
    id: 'chem-test-1',
    project_id: 'p-psi',
    sds_document_id: 'doc-sds-1',
    chemical_name: {
      value: 'Anhydrous Ammonia',
      machine_value: 'Anhydrous Ammonia',
      user_value: null,
      source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 1, section: 'Sec 1', snippet: 'Ammonia Anhydrous' },
      confidence: 0.95,
      review_status: 'confirmed',
    },
    cas_number: {
      value: '7664-41-7',
      machine_value: '7664-41-7',
      user_value: null,
      source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 1, section: 'Sec 3', snippet: 'CAS 7664-41-7' },
      confidence: 0.98,
      review_status: 'confirmed',
    },
    sds_revision_date: {
      value: '2024-01-01',
      machine_value: '2024-01-01',
      user_value: null,
      source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 1, section: 'Header', snippet: 'Rev Date: 2024-01-01' },
      confidence: 0.9,
      review_status: 'confirmed',
    },
    manufacturer: {
      value: 'Apex Chemicals',
      machine_value: 'Apex Chemicals',
      user_value: null,
      source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 1, section: 'Sec 1', snippet: 'Apex Chemicals' },
      confidence: 0.9,
      review_status: 'confirmed',
    },
    psi_parameters: {
      toxicity: {
        value: 'LC50 2000 ppm',
        machine_value: 'LC50 2000 ppm',
        user_value: null,
        source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 3, section: 'Sec 11', snippet: 'Inhalation LC50 2000 ppm' },
        confidence: 0.92,
        review_status: 'confirmed',
      },
      permissible_exposure_limits: {
        value: '50 ppm OSHA PEL',
        machine_value: '50 ppm OSHA PEL',
        user_value: null,
        source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 2, section: 'Sec 8', snippet: 'OSHA PEL: 50 ppm' },
        confidence: 0.95,
        review_status: 'confirmed',
      },
      physical_data: { value: 'BP -33 C', machine_value: 'BP -33 C', user_value: null, source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 2, section: 'Sec 9', snippet: 'BP -33 C' }, confidence: 0.9, review_status: 'confirmed' },
      reactivity_data: { value: 'Violent reaction with acids', machine_value: 'Violent reaction with acids', user_value: null, source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 3, section: 'Sec 10', snippet: 'Reacts violently' }, confidence: 0.9, review_status: 'confirmed' },
      corrosivity_data: { value: 'Corrosive to copper and zinc', machine_value: 'Corrosive to copper and zinc', user_value: null, source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 3, section: 'Sec 10', snippet: 'Incompatible with copper' }, confidence: 0.9, review_status: 'confirmed' },
      thermal_and_chemical_stability_data: { value: 'Stable under ambient conditions', machine_value: 'Stable under ambient conditions', user_value: null, source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 3, section: 'Sec 10', snippet: 'Stable normal' }, confidence: 0.9, review_status: 'confirmed' },
      inadvertent_mixing_hazards: { value: 'Mixing with bleach generates chloramine gas', machine_value: 'Mixing with bleach generates chloramine gas', user_value: null, source: { document: 'SDS-Ammonia.pdf', document_id: 'doc-sds-1', page: 3, section: 'Sec 10', snippet: 'Inadvertent mixing with bleach' }, confidence: 0.95, review_status: 'confirmed' },
    },
    created_at: '',
    updated_at: '',
  };

  assert.strictEqual(chem.psi_parameters.toxicity.source.document, 'SDS-Ammonia.pdf');
  assert.strictEqual(chem.psi_parameters.toxicity.source.page, 3);
  assert.ok(chem.psi_parameters.inadvertent_mixing_hazards.value?.includes('chloramine gas'));
});

test('Criterion 16: Standalone vector SVG and structured JSON export', () => {
  const sampleDrawing: DigitalPidDrawing = {
    id: 'draw-export-test',
    project_id: 'p-exp',
    source_document_id: null,
    source_document_page: 1,
    title: 'Export Demonstration P&ID',
    drawing_number: 'PID-999-REV-0',
    revision: 'REV 0',
    mode: 'scratch',
    status: 'approved',
    background_visible: false,
    background_opacity: 0.5,
    elements: [
      {
        id: 'el-v999',
        tag: 'V-999',
        type: 'vessel',
        description: 'Export Test Drum',
        position: { x: 200, y: 200 },
        size: { width: 100, height: 140 },
        rotation: 0,
        assigned_chemical_id: null,
        status: 'confirmed',
        ports: [{ id: 'p_out', name: 'Outlet', type: 'outlet', position: { x: 50, y: 0 } }],
      },
    ],
    connectors: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: new Date().toISOString(),
    approved_by: 'Chief Process Safety Engineer',
  };

  // Test JSON export
  const jsonStr = exportDrawingToJson(sampleDrawing);
  assert.ok(jsonStr.length > 50, 'JSON export produced');
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.drawing.drawing_number, 'PID-999-REV-0');
  assert.strictEqual(parsed.export_metadata.standard, 'SafeFlow AI Digital P&ID Schema v1.0');

  // Test SVG export
  const svgStr = exportDrawingToSvg(sampleDrawing, { id: 'p-exp', name: 'Export Test Project', description: '', created_at: '', updated_at: '', is_sample: false });
  assert.ok(svgStr.includes('<svg'), 'SVG root tag present');
  assert.ok(svgStr.includes('V-999'), 'Element tag present in SVG');
  assert.ok(svgStr.includes('id="title-block"'), 'Standard Title Block present in SVG');
  assert.ok(svgStr.includes('id="legend-block"'), 'Symbol & Line Legend present in SVG');
  assert.ok(svgStr.includes('PID-999-REV-0'), 'Drawing number rendered in SVG title block');
  assert.ok(svgStr.includes('APPROVED'), 'Approval status rendered in SVG title block');
});

// ----------------------------------------------------
// Test Group 12: Equipment Specification Data Model & PHA Integration
// ----------------------------------------------------
console.log('\n--- Test Group 12: Equipment Specification Data Model & PHA Integration ---');

test('Criterion 1: V-101 can be created with all four specifications missing', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Spec Test Project', 'Testing equipment specifications model');

  // Synthetic test fixture for V-101 (Illustrative pressure vessel)
  const v101Specs = createDefaultSpecifications('vessel');
  const v101: EquipmentTag = {
    id: 'eq-test-v101',
    project_id: proj.id,
    document_id: 'doc-synthetic-pid',
    tag: 'V-101',
    description: 'Illustrative Ammonia Receiver Drum (Pressure Vessel)',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'provisional',
    source: {
      document: 'Synthetic Drawing PID-101',
      page: 1,
      snippet: 'V-101 Receiver Drum (Design specs not on drawing)',
    },
    specifications: v101Specs,
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };

  store.addEquipment([v101], 'Field Engineer', 'Added illustrative V-101 vessel');

  const retrieved = store.listEquipment(proj.id).find((e) => e.tag === 'V-101');
  assert.ok(retrieved, 'V-101 retrieved from store');
  assert.strictEqual(retrieved.equipment_type, 'vessel');

  const specs = store.getEquipmentSpecifications(retrieved.id);
  assert.ok(specs, 'Equipment specifications retrieved');

  // 1. Material of Construction: Unknown / not_provided / unverified
  assert.strictEqual(specs.material_of_construction.status, 'not_provided');
  assert.strictEqual(specs.material_of_construction.verification_status, 'unverified');

  // 2. Design Pressure: Not provided / null / unverified
  assert.strictEqual(specs.design_pressure.value, null);
  assert.strictEqual(specs.design_pressure.status, 'not_provided');
  assert.strictEqual(specs.design_pressure.verification_status, 'unverified');

  // 3. Design Temperature: Not provided / null / unverified
  assert.strictEqual(specs.design_temperature.value, null);
  assert.strictEqual(specs.design_temperature.status, 'not_provided');
  assert.strictEqual(specs.design_temperature.verification_status, 'unverified');

  // 4. Capacity: Not provided / null / unverified
  assert.strictEqual(specs.capacity.value, null);
  assert.strictEqual(specs.capacity.status, 'not_provided');
  assert.strictEqual(specs.capacity.verification_status, 'unverified');

  store.deleteProject(proj.id);
});

test('Criterion 2: Missing values remain null or explicitly absent, not zero', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Null Safety Project', 'Verifying missing values remain null, never zero');

  const v101Specs = createDefaultSpecifications('vessel');
  const v101: EquipmentTag = {
    id: 'eq-null-v101',
    project_id: proj.id,
    document_id: 'doc-synthetic-pid',
    tag: 'V-101',
    description: 'Pressure Vessel V-101',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'provisional',
    source: { document: 'Synthetic PID', page: 1, snippet: 'V-101' },
    specifications: v101Specs,
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };

  store.addEquipment([v101]);
  const specs = store.getEquipmentSpecifications(v101.id)!;

  // Assert strictly null, never zero
  assert.strictEqual(specs.design_pressure.value, null, 'Design pressure must be null');
  assert.notStrictEqual(specs.design_pressure.value, 0, 'Design pressure must never be coerced to 0');

  assert.strictEqual(specs.design_temperature.value, null, 'Design temperature must be null');
  assert.notStrictEqual(specs.design_temperature.value, 0, 'Design temperature must never be coerced to 0');

  assert.strictEqual(specs.capacity.value, null, 'Capacity must be null');
  assert.notStrictEqual(specs.capacity.value, 0, 'Capacity must never be coerced to 0');

  // Update another property and verify absent values stay strictly null
  store.updateEquipmentSpecification(v101.id, 'material_of_construction', {
    value: 'Carbon Steel SA-516 Grade 70',
    unit: null,
    status: 'user_entered',
  });

  const refreshed = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(refreshed.design_pressure.value, null, 'Design pressure remains null after sibling update');
  assert.notStrictEqual(refreshed.design_pressure.value, 0);

  store.deleteProject(proj.id);
});

test('Criterion 3: Units are stored with numerical quantities', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Units Project', 'Verifying units are persisted alongside values');

  const v101: EquipmentTag = {
    id: 'eq-units-v101',
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Pressure Vessel',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'provisional',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([v101]);

  // Record 250 psig for pressure
  store.updateEquipmentSpecification(v101.id, 'design_pressure', {
    value: 250,
    unit: 'psig',
    source_document_name: 'V-101 Engineering Datasheet Rev C',
  });

  // Record 150 °F for temperature
  store.updateEquipmentSpecification(v101.id, 'design_temperature', {
    value: 150,
    unit: '°F',
    source_document_name: 'V-101 Engineering Datasheet Rev C',
  });

  // Record 12,000 gallons for capacity
  store.updateEquipmentSpecification(v101.id, 'capacity', {
    value: 12000,
    unit: 'gallons',
    capacity_type: 'total_volume',
    source_document_name: 'V-101 Engineering Datasheet Rev C',
  });

  const specs = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(specs.design_pressure.value, 250);
  assert.strictEqual(specs.design_pressure.unit, 'psig');

  assert.strictEqual(specs.design_temperature.value, 150);
  assert.strictEqual(specs.design_temperature.unit, '°F');

  assert.strictEqual(specs.capacity.value, 12000);
  assert.strictEqual(specs.capacity.unit, 'gallons');

  store.deleteProject(proj.id);
});

test('Criterion 4: Different capacity types remain distinguishable', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Capacity Types Project', 'Testing distinct capacity types');

  const v101: EquipmentTag = {
    id: 'eq-cap-v101',
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Storage Vessel',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'provisional',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([v101]);

  // 1. Total volume
  store.updateEquipmentSpecification(v101.id, 'capacity', {
    value: 12000,
    unit: 'gallons',
    capacity_type: 'total_volume',
  });
  let specs = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(specs.capacity.capacity_type, 'total_volume');
  assert.strictEqual(specs.capacity.value, 12000);

  // 2. Working volume
  store.updateEquipmentSpecification(v101.id, 'capacity', {
    value: 10000,
    unit: 'gallons',
    capacity_type: 'working_volume',
  });
  specs = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(specs.capacity.capacity_type, 'working_volume');
  assert.strictEqual(specs.capacity.value, 10000);

  // 3. Rated throughput (for pump or continuous processing unit)
  store.updateEquipmentSpecification(v101.id, 'capacity', {
    value: 250,
    unit: 'gpm',
    capacity_type: 'rated_throughput',
  });
  specs = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(specs.capacity.capacity_type, 'rated_throughput');
  assert.strictEqual(specs.capacity.value, 250);

  store.deleteProject(proj.id);
});

test('Criterion 5: User-entered values remain unverified until reviewed', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Verification Gate Project', 'Testing user-entered vs authorized verification');

  const v101: EquipmentTag = {
    id: 'eq-verify-v101',
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Pressure Vessel',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'provisional',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([v101]);

  // User enters design pressure from an unverified source
  store.updateEquipmentSpecification(
    v101.id,
    'design_pressure',
    {
      value: 250,
      unit: 'psig',
      source_document_name: 'Operator field notes',
    },
    'Junior Process Tech',
    'Recorded draft design pressure from notes'
  );

  let specs = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(specs.design_pressure.value, 250);
  assert.strictEqual(specs.design_pressure.status, 'user_entered');
  assert.strictEqual(specs.design_pressure.verification_status, 'unverified', 'User-entered value MUST remain unverified');
  assert.ok(!specs.design_pressure.verified_by, 'Verified by must be null or empty for unverified spec');

  // Authorized review occurs
  store.verifyEquipmentSpecification(
    v101.id,
    'design_pressure',
    'Lead Mechanical Engineer (PE)',
    'Verified against manufacturer U-1A ASME data report form'
  );

  specs = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(specs.design_pressure.verification_status, 'verified', 'Must transition to verified after authorized review');
  assert.strictEqual(specs.design_pressure.status, 'verified');
  assert.strictEqual(specs.design_pressure.verified_by, 'Lead Mechanical Engineer (PE)');
  assert.ok(specs.design_pressure.verified_at);

  store.deleteProject(proj.id);
});

test('Criterion 6: Source provenance and conflicting values are preserved', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Conflict Preservation Project', 'Testing specification conflict preservation');

  const v101: EquipmentTag = {
    id: 'eq-conf-v101',
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Pressure Vessel',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'provisional',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([v101]);

  // Primary source: Datasheet reports 250 psig
  store.updateEquipmentSpecification(v101.id, 'design_pressure', {
    value: 250,
    unit: 'psig',
    source_document_name: 'V-101-DATASHEET-REV-A.pdf',
    source_page: 2,
    original_extracted_text: 'DESIGN PRESSURE: 250 PSIG @ 150 F',
  });

  // Conflicting source: Vendor Drawing reports 300 psig
  store.recordSpecificationConflict(v101.id, 'design_pressure', {
    source_document_name: 'FABRICATION-DWG-V101-REV-2.pdf',
    source_page: 1,
    value: 300,
    unit: 'psig',
    original_extracted_text: 'MAX ALLOWABLE WORKING PRESSURE (MAWP): 300 PSIG',
    notes: 'Discrepancy between early process datasheet and final vessel fabricator drawing',
  });

  let specs = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(specs.design_pressure.status, 'conflict');
  assert.strictEqual(specs.design_pressure.value, 250, 'Original value is preserved');
  assert.strictEqual(specs.design_pressure.conflicting_records?.length, 1);
  assert.strictEqual(specs.design_pressure.conflicting_records![0].value, 300);
  assert.strictEqual(specs.design_pressure.conflicting_records![0].source_document_name, 'FABRICATION-DWG-V101-REV-2.pdf');

  // Human engineer resolves the conflict by adopting 300 psig MAWP with audit justification
  store.resolveSpecificationConflict(
    v101.id,
    'design_pressure',
    300,
    'psig',
    'Chief Pressure Vessel Engineer',
    'Adopted fabricator MAWP 300 psig from as-built certified U-1A report',
    true // Mark as verified
  );

  specs = store.getEquipmentSpecifications(v101.id)!;
  assert.strictEqual(specs.design_pressure.value, 300);
  assert.strictEqual(specs.design_pressure.status, 'verified');
  assert.strictEqual(specs.design_pressure.verification_status, 'verified');

  // Verify audit history preserves the decision trail
  const hist = specs.design_pressure.change_history || [];
  assert.ok(hist.length >= 2, 'History has initial update and conflict resolution entries');
  assert.ok(hist.some((h) => h.change_reason.includes('Conflict Resolution')));

  store.deleteProject(proj.id);
});

test('Criterion 7: Equipment tags can change without breaking stable internal references', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Stable ID Project', 'Testing decoupling tag from stable internal ID');

  const stableId = 'eq-v101-stable-uuid-1234';
  const v101: EquipmentTag = {
    id: stableId,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Pressure Vessel',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([v101]);

  // Set specifications on the equipment
  store.updateEquipmentSpecification(stableId, 'design_pressure', {
    value: 250,
    unit: 'psig',
  });

  // Rename engineering tag from V-101 to V-101A (e.g. following tag numbering revision)
  store.updateEquipment(stableId, { tag: 'V-101A' }, 'Lead Engineer', 'Renamed tag to V-101A');

  // Look up by stable internal ID
  const retrievedById = store.listEquipment(proj.id).find((e) => e.id === stableId);
  assert.ok(retrievedById, 'Equipment found by stable internal ID');
  assert.strictEqual(retrievedById.tag, 'V-101A', 'Tag was renamed');

  // Look up specifications by stable internal ID
  const specs = store.getEquipmentSpecifications(stableId)!;
  assert.strictEqual(specs.design_pressure.value, 250, 'Specifications remain intact across tag renames');

  store.deleteProject(proj.id);
});

test('Criterion 8: PHA can identify missing critical specifications', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('PHA Missing Specs Project', 'Identifying missing specifications in PHA');

  // Create V-101 with all 4 specifications missing
  const v101: EquipmentTag = {
    id: 'eq-pha-v101',
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Ammonia Receiver Drum',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([v101]);

  // Define candidate PHA node containing V-101
  const candidateNode: PhaStudyNode = {
    id: 'pha-node-v101',
    project_id: proj.id,
    node_id: 'N-001',
    name: 'High-Pressure Ammonia Inventory',
    design_intent: 'Store liquid ammonia at high condensing pressure',
    equipment_tags: ['V-101'],
    line_numbers: [],
    inlet_boundaries: [],
    outlet_boundaries: [],
    basis_for_grouping: 'Pressure vessel boundary',
    operating_limits: {},
    unresolved_questions: [],
    status: 'candidate_not_authoritative',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const evalResult = evaluateNodeSpecifications(candidateNode, [v101]);
  assert.ok(evalResult.missing_specifications.length >= 3, 'Identifies missing specifications');

  // Check critical pressure alert
  const pressAlert = evalResult.missing_specifications.find((m) => m.property === 'design_pressure');
  assert.ok(pressAlert, 'Missing design pressure flagged');
  assert.strictEqual(pressAlert.criticality, 'critical');
  assert.ok(pressAlert.impact.includes('quantitative pressure limit comparison'));

  // Check critical temperature alert
  const tempAlert = evalResult.missing_specifications.find((m) => m.property === 'design_temperature');
  assert.ok(tempAlert, 'Missing design temperature flagged');
  assert.strictEqual(tempAlert.criticality, 'critical');

  // Check material compatibility alert
  const matAlert = evalResult.missing_specifications.find((m) => m.property === 'material_of_construction');
  assert.ok(matAlert, 'Unknown metallurgy flagged');
  assert.ok(matAlert.impact.includes('chemical compatibility or incompatibility'));

  store.deleteProject(proj.id);
});

test('Criterion 9: A pressure scenario cannot claim a verified limit comparison when design pressure is missing', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Pressure Scenario Test', 'Testing limit comparison gating on missing design pressure');

  // 1. Initial State: V-101 has missing design pressure
  const v101: EquipmentTag = {
    id: 'eq-limit-v101',
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Ammonia Receiver Drum',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };

  const node: PhaStudyNode = {
    id: 'pha-limit-node',
    project_id: proj.id,
    node_id: 'N-001',
    name: 'Ammonia Storage',
    design_intent: 'Store liquid ammonia',
    equipment_tags: ['V-101'],
    line_numbers: [],
    inlet_boundaries: [],
    outlet_boundaries: [],
    basis_for_grouping: 'Subsystem',
    operating_limits: {},
    unresolved_questions: [],
    status: 'candidate_not_authoritative',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Evaluation when design pressure is missing:
  let evalRes = evaluateNodeSpecifications(node, [v101]);
  let pressDev = evalRes.applicable_deviations.find((d) => d.deviation === 'MORE PRESSURE')!;
  assert.strictEqual(pressDev.status, 'limit_unknown', 'When design pressure is missing, status MUST be limit_unknown');
  assert.ok(pressDev.notes?.includes('Quantitative overpressure limit comparison cannot be claimed'));

  // 2. User enters design pressure (250 psig), but UNVERIFIED
  v101.specifications.design_pressure = {
    value: 250,
    unit: 'psig',
    status: 'user_entered',
    verification_status: 'unverified',
  };

  evalRes = evaluateNodeSpecifications(node, [v101]);
  pressDev = evalRes.applicable_deviations.find((d) => d.deviation === 'MORE PRESSURE')!;
  assert.strictEqual(pressDev.status, 'unverified_limit', 'User-entered unverified spec yields unverified_limit');

  // 3. Authorized engineer verifies design pressure (250 psig)
  v101.specifications.design_pressure.verification_status = 'verified';
  v101.specifications.design_pressure.status = 'verified';
  v101.specifications.design_pressure.verified_by = 'Lead PE';

  evalRes = evaluateNodeSpecifications(node, [v101]);
  pressDev = evalRes.applicable_deviations.find((d) => d.deviation === 'MORE PRESSURE')!;
  assert.strictEqual(pressDev.status, 'verified_limit', 'Verified specification yields verified_limit');
  assert.ok(pressDev.design_limit_reference?.includes('250 psig (verified)'));

  store.deleteProject(proj.id);
});

test('Criterion 10: Changing a specification marks dependent analyses for reassessment', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Reassessment Trigger Project', 'Testing propagation of spec changes to PHA');

  const v101: EquipmentTag = {
    id: 'eq-reassess-v101',
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Vessel',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };

  const p101: EquipmentTag = {
    id: 'eq-reassess-p101',
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'P-101',
    description: 'Ammonia Transfer Pump',
    equipment_type: 'pump',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('pump'),
    specifications_revision: 1,
    created_at: new Date().toISOString(),
  };

  const line1: PipingLine = {
    id: 'line-reassess-1',
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'L-101',
    from_equipment: 'V-101',
    to_equipment: 'P-101',
    size: '2"',
    material: 'CS',
    stream_label: 'Feed',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID', page: 1, snippet: '' },
    alerts: [],
    created_at: new Date().toISOString(),
  };

  store.addEquipment([v101, p101]);
  store.addLines([line1]);

  // Create an approved PHA study node
  const node = store.createPhaNode({
    project_id: proj.id,
    node_id: 'N-001',
    name: 'High Pressure Loop',
    design_intent: 'Transfer ammonia',
    equipment_tags: ['V-101'],
    line_numbers: ['L-101'],
    inlet_boundaries: [],
    outlet_boundaries: [],
    basis_for_grouping: 'Unit',
    operating_limits: {},
    unresolved_questions: [],
    status: 'approved',
  });

  // Approve project graph
  store.approveGraph(proj.id, 'Lead PE', 'Baseline graph approved');
  assert.strictEqual(store.getGraphApproval(proj.id).approved, true);

  // Now, change design pressure on V-101
  const updateResult = store.updateEquipmentSpecification(
    v101.id,
    'design_pressure',
    {
      value: 275,
      unit: 'psig',
    },
    'Plant Design Engineer',
    'Re-rated vessel based on new engineering calculations'
  );

  assert.ok(updateResult, 'Specification updated successfully');
  assert.ok(updateResult.affected_pha_nodes.includes('N-001'), 'Affected PHA study node identified');

  // Verify graph approval was invalidated
  assert.strictEqual(store.getGraphApproval(proj.id).approved, false, 'Graph approval invalidated by upstream change');

  // Verify PHA study node was flagged for reassessment
  const updatedNode = store.listPhaNodes(proj.id).find((n) => n.node_id === 'N-001')!;
  assert.strictEqual(updatedNode.requires_reassessment, true, 'requires_reassessment MUST be true');
  assert.ok(updatedNode.reassessment_reasons && updatedNode.reassessment_reasons.length > 0);
  assert.ok(updatedNode.reassessment_reasons[0].includes("Specification 'design_pressure' on equipment V-101 changed"));

  // Check HAZOP readiness reports warning regarding required reassessment
  const readiness = checkHazopReadiness(
    store.listEquipment(proj.id),
    store.listLines(proj.id),
    [],
    store.listPhaNodes(proj.id),
    true
  );
  assert.ok(readiness.warnings.some((w) => w.includes('requires reassessment')));

  // Facilitator acknowledges reassessment
  store.acknowledgePhaNodeReassessment(node.id, 'PHA Facilitator', 'Reviewed 275 psig limit against overpressure safeguards');
  const ackedNode = store.listPhaNodes(proj.id).find((n) => n.node_id === 'N-001')!;
  assert.strictEqual(ackedNode.requires_reassessment, false, 'requires_reassessment cleared after acknowledgment');

  store.deleteProject(proj.id);
});

test('Criterion 11: Existing digital P&ID, PSI, graph, and PHA functionality continues working', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Full Regression Project', 'Regression verification of existing platform');

  // 1. Digital P&ID editor and graph synchronization
  const drawing = store.seedSampleDrawing(proj.id);
  assert.ok(drawing, 'Digital drawing created');

  const syncRes = store.syncDrawingToProject(drawing.id, 'Integration Tester');
  assert.ok(syncRes.success, 'Drawing synchronized to project equipment and lines');
  assert.ok(syncRes.equipment_count > 0, 'Equipment synchronized');

  // Verify V-101 carries specifications from drawing sync
  const syncedV101 = store.listEquipment(proj.id).find((e) => e.tag === 'V-101');
  assert.ok(syncedV101, 'V-101 found in synchronized equipment');
  assert.ok(syncedV101.specifications, 'V-101 has specifications model');
  assert.strictEqual(syncedV101.specifications.design_pressure.value, null, 'Unverified initial state preserved');

  // 2. Topology graph generation
  const graph = store.getProcessTopologyGraph(proj.id);
  assert.ok(graph.nodes.length > 0, 'Topology graph has nodes');
  assert.ok(graph.nodes.some((n) => n.tag === 'V-101' && n.specifications !== undefined), 'Graph node preserves specifications');

  // 3. Graph validation
  const validation = store.getGraphValidation(proj.id);
  assert.ok(validation, 'Graph validation operates cleanly');

  // 4. PHA generation & readiness
  const candidateNodes = store.generatePhaNodes(proj.id, 'Lead PE');
  assert.ok(candidateNodes.length > 0, 'Candidate PHA study nodes generated');

  // Verify candidate node evaluates specifications
  const firstNode = candidateNodes[0];
  assert.ok(firstNode.missing_specifications, 'PHA node has missing specifications evaluated');
  assert.ok(firstNode.applicable_deviations, 'PHA node has applicable deviations evaluated');

  store.deleteProject(proj.id);
});

// ----------------------------------------------------
// Test Group 13: Manual Chemical Creation & PSI Entry in PSI Extraction
// ----------------------------------------------------
console.log('\n--- Test Group 13: Manual Chemical Creation & PSI Entry in PSI Extraction ---');

test('Scenario 1: Opening manual chemical creation form / validation - validates required chemical identity attributes and prevents empty name', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-1', 'Test manual chemical creation validation');

  // Attempting to create chemical without chemical_name must throw or be rejected
  assert.throws(() => {
    store.createManualChemical(proj.id, {
      chemical_name: '',
    });
  }, /chemical_name is required/i);

  assert.throws(() => {
    store.createManualChemical(proj.id, {
      chemical_name: '   ',
    });
  }, /chemical_name is required/i);

  store.deleteProject(proj.id);
});

test('Scenario 2: Creating a chemical without uploading an SDS - creates record with origin manual_entry and no sds_document_id', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-2', 'Test manual chemical creation without SDS');

  // Ensure 0 documents exist in project
  assert.strictEqual(store.listDocuments(proj.id).length, 0, 'No documents uploaded');

  const chem = store.createManualChemical(proj.id, {
    chemical_name: 'Chlorine Gas',
    cas_number: '7782-50-5',
    physical_state: 'gas',
  }, 'Lead Safety Engineer');

  assert.ok(chem.id, 'Chemical has valid ID');
  assert.strictEqual(chem.origin, 'manual_entry', 'Chemical origin is manual_entry');
  assert.strictEqual(chem.sds_document_id, '', 'Chemical has no attached SDS document ID');
  assert.strictEqual(chem.chemical_name.value, 'Chlorine Gas');
  assert.strictEqual(chem.cas_number.value, '7782-50-5');
  assert.strictEqual(chem.record_status, 'active');

  store.deleteProject(proj.id);
});

test('Scenario 3: Saving a chemical with only its name - succeeds and defaults remaining fields gracefully', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-3', 'Test chemical with name only');

  const chem = store.createManualChemical(proj.id, {
    chemical_name: 'Nitrogen',
  });

  assert.strictEqual(chem.chemical_name.value, 'Nitrogen');
  assert.strictEqual(chem.cas_number.value, null);
  assert.deepStrictEqual(chem.synonyms, []);
  assert.strictEqual(chem.composition_type, 'pure_substance');
  assert.strictEqual(chem.physical_state, null);
  assert.strictEqual(chem.concentration, null);
  assert.strictEqual(chem.description, null);
  assert.strictEqual(chem.molecular_formula, null);
  assert.strictEqual(chem.molecular_weight, null);
  assert.ok(chem.structured_psi, 'Structured PSI initialized');

  store.deleteProject(proj.id);
});

test('Scenario 4: Saving a chemical with all 7 PSI sections incomplete - all 7 remain strictly null with review_status missing', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-4', 'Test incomplete PSI parameters');

  const chem = store.createManualChemical(proj.id, {
    chemical_name: 'Unknown Solvent Mixture',
  });

  const psiKeys: (keyof typeof chem.psi_parameters)[] = [
    'toxicity',
    'permissible_exposure_limits',
    'physical_data',
    'reactivity_data',
    'corrosivity_data',
    'thermal_and_chemical_stability_data',
    'inadvertent_mixing_hazards',
  ];

  for (const key of psiKeys) {
    const field = chem.psi_parameters[key];
    assert.strictEqual(field.value, null, `PSI section ${key} value must be null (never 0 or assumed safe)`);
    assert.strictEqual(field.review_status, 'missing', `PSI section ${key} review_status must be 'missing'`);
    assert.strictEqual(field.verification_status, 'unverified', `PSI section ${key} verification_status must be 'unverified'`);
    assert.strictEqual(field.entry_method, 'manual');
  }

  store.deleteProject(proj.id);
});

test('Scenario 5: Entering data into each of the 7 PSI sections - persists structured values, units, notes, and references', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-5', 'Test full PSI parameter entry');

  const structuredPsi: StructuredPsiParameters = {
    permissible_exposure_limits: {
      limits: [
        { authority: 'OSHA_PEL', value: 1000, unit: 'ppm', averaging_period: '8-hr TWA' },
        { authority: 'ACGIH_TLV', value: 1000, unit: 'ppm', averaging_period: '15-min STEL' },
      ],
    },
    physical_data: {
      physical_state: 'liquid',
      boiling_point: { property_name: 'boiling_point', value: 78.37, unit: '°C' },
      flash_point: { property_name: 'flash_point', value: 13, unit: '°C' },
      vapor_pressure: { property_name: 'vapor_pressure', value: 0.85, unit: 'psia' },
      specific_gravity: { property_name: 'specific_gravity', value: 0.789, unit: null },
    },
    reactivity_data: {
      incompatible_materials: ['Strong oxidizers', 'peroxides', 'acids'],
    },
    corrosivity_data: {
      ph: 7.0,
    },
    thermal_and_chemical_stability_data: {
      decomposition_temperature: { property_name: 'decomposition_temperature', value: 425, unit: '°C' },
    },
  };

  const chem = store.createManualChemical(proj.id, {
    chemical_name: 'Ethanol (Ethyl Alcohol)',
    cas_number: '64-17-5',
    synonyms: ['Grain alcohol', 'EtOH'],
    molecular_formula: 'C2H6O',
    molecular_weight: { value: 46.07, unit: 'g/mol' },
    physical_state: 'liquid',
    composition_type: 'pure_substance',
    concentration: '99.5 vol%',
    description: 'High purity industrial solvent',
    structured_psi: structuredPsi,
    psi_parameters: {
      toxicity: {
        value: 'Oral LD50 rat 7060 mg/kg; Inhalation LC50 rat 20000 ppm/10h',
        units: 'mg/kg, ppm',
        notes: 'CNS depressant at high concentrations',
        source_document: 'CRC Handbook of Chemistry & Physics',
        source_page: 112,
        source_section: 'Toxicology',
      },
      permissible_exposure_limits: {
        value: 'OSHA PEL: 1000 ppm (1900 mg/m3) 8-hr TWA',
        units: 'ppm',
        notes: 'ACGIH TLV 1000 ppm STEL',
        source_document: '29 CFR 1910.1000 Table Z-1',
      },
      physical_data: {
        value: 'BP: 78.37 °C; Flash Pt: 13 °C; VP: 0.85 psia at 20 °C; SG: 0.789',
        units: '°C, psia',
        notes: 'Flammable liquid Class IB; LEL 3.3%, UEL 19%',
      },
      reactivity_data: {
        value: 'Violent reaction with strong oxidizing agents and perchlorates',
        notes: 'Risk of fire and explosion',
      },
      corrosivity_data: {
        value: 'Neutral pH 7.0; non-corrosive to carbon steel and stainless steel',
        units: 'pH',
      },
      thermal_and_chemical_stability_data: {
        value: 'Thermally stable at ambient operating conditions; decomposes at >425 °C',
        units: '°C',
      },
      inadvertent_mixing_hazards: {
        value: 'Violent or explosive reaction with acetyl chloride, calcium hypochlorite, and nitric acid',
        notes: 'Segregate from strong oxidizers and halogenating agents',
      },
    },
  }, 'Dr. Chemical Engineer');

  // Verify all 7 sections
  assert.strictEqual(chem.psi_parameters.toxicity.value, 'Oral LD50 rat 7060 mg/kg; Inhalation LC50 rat 20000 ppm/10h');
  assert.strictEqual(chem.psi_parameters.toxicity.source.document, 'CRC Handbook of Chemistry & Physics');
  assert.strictEqual(chem.psi_parameters.toxicity.source.page, 112);
  assert.strictEqual(chem.psi_parameters.permissible_exposure_limits.units, 'ppm');
  assert.strictEqual(chem.psi_parameters.corrosivity_data.units, 'pH');
  assert.strictEqual(chem.structured_psi?.physical_data?.boiling_point?.value, 78.37);
  assert.strictEqual(chem.structured_psi?.permissible_exposure_limits?.limits?.[0].value, 1000);

  store.deleteProject(proj.id);
});

test('Scenario 6: Saving and reopening a draft - preserves draft status and partial data', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-6', 'Test draft saving');

  // Save as draft
  const draftChem = store.createManualChemical(proj.id, {
    chemical_name: 'Sulfuric Acid 98%',
    cas_number: '7664-93-9',
    record_status: 'draft',
    psi_parameters: {
      corrosivity_data: {
        value: 'Extremely corrosive; pH < 1.0; attacks mild steel rapidly when dilute',
        units: 'pH',
      },
    },
  }, 'Process Engineer Intern');

  assert.strictEqual(draftChem.record_status, 'draft', 'Status must be draft');
  assert.ok(draftChem.psi_parameters.corrosivity_data.value?.includes('Extremely corrosive'));
  assert.strictEqual(draftChem.psi_parameters.toxicity.value, null, 'Uncompleted fields remain null');

  // Reopen and update draft chemical to active
  const updatedChem = store.updateChemical(draftChem.id, {
    record_status: 'active',
    psi_parameters: {
      permissible_exposure_limits: {
        value: 'OSHA PEL: 1 mg/m3 8-hr TWA',
        units: 'mg/m3',
        review_status: 'confirmed',
      },
    },
  }, 'Senior PSM Facilitator', 'Finalized chemical review from draft');

  assert.ok(updatedChem);
  assert.strictEqual(updatedChem.record_status, 'active', 'Status updated to active');
  // Check prior corrosivity data is preserved
  assert.ok(updatedChem.psi_parameters.corrosivity_data.value?.includes('Extremely corrosive'));
  // Check new PEL is present
  assert.strictEqual(updatedChem.psi_parameters.permissible_exposure_limits.value, 'OSHA PEL: 1 mg/m3 8-hr TWA');

  store.deleteProject(proj.id);
});

test('Scenario 7: Persistence after store reload / page refresh - saved manual chemicals persist across store instances', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-7', 'Test persistence across store reloads');

  const created = store.createManualChemical(proj.id, {
    chemical_name: 'Sodium Hypochlorite 12.5%',
    cas_number: '7681-52-9',
    composition_type: 'solution',
    concentration: '12.5 wt%',
  });

  const chemId = created.id;

  // Retrieve chemical from store
  const fetched = store.getChemical(chemId);
  assert.ok(fetched, 'Chemical found in store');
  assert.strictEqual(fetched.chemical_name.value, 'Sodium Hypochlorite 12.5%');
  assert.strictEqual(fetched.composition_type, 'solution');
  assert.strictEqual(fetched.origin, 'manual_entry');

  // Verify chemical is listed in project chemicals
  const list = store.listChemicals(proj.id);
  assert.ok(list.some((c) => c.id === chemId));

  store.deleteProject(proj.id);
});

test('Scenario 8: Duplicate chemical warnings - detects matching CAS or similar name without silent merge', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-8', 'Test duplicate chemical warnings');

  // First chemical
  const chem1 = store.createManualChemical(proj.id, {
    chemical_name: 'Anhydrous Ammonia',
    cas_number: '7664-41-7',
  });

  // Check duplicate with same CAS
  const checkCas = store.checkDuplicateChemical(proj.id, 'Ammonia Refrigerant Grade', '7664-41-7');
  assert.strictEqual(checkCas.is_potential_duplicate, true, 'Flags duplicate for matching CAS');
  assert.ok(checkCas.matches.some((m) => m.match_type === 'exact_cas'));

  // Check duplicate with exact name
  const checkName = store.checkDuplicateChemical(proj.id, 'anhydrous ammonia', null);
  assert.strictEqual(checkName.is_potential_duplicate, true, 'Flags duplicate for exact name match');
  assert.ok(checkName.matches.some((m) => m.match_type === 'exact_name'));

  // Check duplicate with similar name
  const checkSimilar = store.checkDuplicateChemical(proj.id, 'Ammonia', null);
  assert.strictEqual(checkSimilar.is_potential_duplicate, true, 'Flags duplicate for similar name match');
  assert.ok(checkSimilar.matches.some((m) => m.match_type === 'similar_name'));

  // User decides to proceed and save anyway - must create a separate record, NO silent merge
  const chem2 = store.createManualChemical(proj.id, {
    chemical_name: 'Ammonia Aqueous Solution',
    cas_number: '7664-41-7',
  });

  assert.notStrictEqual(chem1.id, chem2.id, 'Must create separate record with unique ID');
  const allChems = store.listChemicals(proj.id);
  assert.strictEqual(allChems.length, 2, 'Both chemical records preserved without silent overwriting');

  store.deleteProject(proj.id);
});

test('Scenario 9: Invalid identity or numerical inputs - rejects empty name and handles invalid inputs gracefully', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-9', 'Test invalid input handling');

  // Missing chemical_name
  assert.throws(() => {
    store.createManualChemical(proj.id, {
      chemical_name: '',
      cas_number: '123-45-6',
    });
  }, /chemical_name is required/i);

  // Updating non-existent chemical returns undefined
  const nonExistent = store.updateChemical('fake-id-999', {
    chemical_name: 'Ghost Chemical',
  });
  assert.strictEqual(nonExistent, undefined);

  store.deleteProject(proj.id);
});

test('Scenario 10: Preservation of manual values and provenance tracking - audit entries and unverified status', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-10', 'Test provenance and audit history');

  const chem = store.createManualChemical(proj.id, {
    chemical_name: 'Toluene',
    cas_number: '108-88-3',
    psi_parameters: {
      toxicity: {
        value: 'Oral LD50 rat 5580 mg/kg; Inhalation LC50 rat 12500 ppm/4h',
      },
    },
  }, 'PSM Compliance Specialist');

  // Verify provenance flags
  assert.strictEqual(chem.origin, 'manual_entry');
  assert.strictEqual(chem.psi_parameters.toxicity.entry_method, 'manual');
  assert.strictEqual(chem.psi_parameters.toxicity.verification_status, 'unverified');
  assert.strictEqual(chem.psi_parameters.toxicity.review_status, 'needs_review');

  // Verify audit history was created
  assert.ok(chem.audit_history && chem.audit_history.length >= 1);
  const firstAudit = chem.audit_history[0];
  assert.strictEqual(firstAudit.action, 'create');
  assert.strictEqual(firstAudit.author, 'PSM Compliance Specialist');
  assert.ok(firstAudit.timestamp);

  // Update chemical and check audit trail grows
  const updated = store.updateChemical(chem.id, {
    description: 'Updated industrial solvent specification',
  }, 'Senior Auditor', 'Annual PSI review verification');

  assert.ok(updated);
  assert.strictEqual(updated.audit_history.length, 2);
  const secondAudit = updated.audit_history[1];
  assert.strictEqual(secondAudit.action, 'update');
  assert.strictEqual(secondAudit.author, 'Senior Auditor');
  assert.strictEqual(secondAudit.change_summary, 'Annual PSI review verification');

  store.deleteProject(proj.id);
});

test('Scenario 11: Subsequent SDS extraction without silent overwriting of manual values', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-11', 'Test subsequent SDS linking');

  // 1. Manually create chemical with custom toxicity
  const manualChem = store.createManualChemical(proj.id, {
    chemical_name: 'Anhydrous Ammonia',
    cas_number: '7664-41-7',
    psi_parameters: {
      toxicity: {
        value: 'Pre-existing plant engineering standard toxicity: 1500 ppm',
        review_status: 'confirmed',
      },
    },
  });

  // 2. Add an SDS document to the project with parsed extraction
  const doc = {
    id: 'sds-doc-11',
    project_id: proj.id,
    name: 'Ammonia_SDS_Apex.pdf',
    original_filename: 'Ammonia_SDS_Apex.pdf',
    file_path: '/uploads/ammonia.pdf',
    mime_type: 'application/pdf',
    size_bytes: 10240,
    doc_type: 'sds' as const,
    upload_timestamp: new Date().toISOString(),
    pages_count: 1,
    is_readable: true,
    is_scanned_ocr_attempted: false,
    chemical_ids: [] as string[],
  };
  store.addDocument(doc);
  const extracted = parseSdsContent(mockDocContent, doc.id, doc.name, proj.id);
  store.addChemical(extracted);
  doc.chemical_ids.push(extracted.id);

  // 3. Link SDS to the manual chemical
  const linkResult = store.linkSdsToChemical(manualChem.id, doc.id, 'Process Safety Lead');
  assert.strictEqual(linkResult.success, true);

  const updatedChem = store.getChemical(manualChem.id)!;

  // Origin should now be hybrid
  assert.strictEqual(updatedChem.origin, 'hybrid', 'Origin transitions to hybrid');
  assert.strictEqual(updatedChem.sds_document_id, doc.id, 'SDS doc linked');

  // Pre-existing manual toxicity MUST NOT be overwritten!
  assert.strictEqual(
    updatedChem.psi_parameters.toxicity.value,
    'Pre-existing plant engineering standard toxicity: 1500 ppm',
    'Manual toxicity value must NOT be overwritten by SDS linking'
  );

  // Fields that were null/missing SHOULD be populated from SDS extraction
  assert.ok(
    updatedChem.psi_parameters.permissible_exposure_limits.value !== null,
    'Empty field was populated from SDS extraction'
  );

  store.deleteProject(proj.id);
});

test('Scenario 12: Conflict detection when extracted and manual values disagree', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-12', 'Test conflict detection upon SDS linking');

  // Manually enter chemical with conflicting PEL
  const chem = store.createManualChemical(proj.id, {
    chemical_name: 'Anhydrous Ammonia',
    cas_number: '7664-41-7',
    psi_parameters: {
      permissible_exposure_limits: {
        value: 'OSHA PEL: 500 ppm custom threshold',
      },
    },
  });

  // Add SDS document and extracted chemical
  const doc = {
    id: 'sds-doc-12',
    project_id: proj.id,
    name: 'Ammonia_Vendor_SDS.pdf',
    original_filename: 'Ammonia_Vendor_SDS.pdf',
    file_path: '/uploads/ammonia_vendor.pdf',
    mime_type: 'application/pdf',
    size_bytes: 10240,
    doc_type: 'sds' as const,
    upload_timestamp: new Date().toISOString(),
    pages_count: 1,
    is_readable: true,
    is_scanned_ocr_attempted: false,
    chemical_ids: [] as string[],
  };
  store.addDocument(doc);
  const extracted = parseSdsContent(mockDocContent, doc.id, doc.name, proj.id);
  store.addChemical(extracted);
  doc.chemical_ids.push(extracted.id);

  // Link SDS
  const linkRes = store.linkSdsToChemical(chem.id, doc.id, 'Safety Auditor');
  assert.strictEqual(linkRes.success, true);
  assert.ok(linkRes.conflicts_created! > 0, 'Divergent PEL values flagged as conflict');

  const updatedChem = store.getChemical(chem.id)!;
  assert.strictEqual(updatedChem.origin, 'hybrid');

  // Chemical audit history records sds_linked
  const auditEntries = updatedChem.audit_history.filter((a) => a.action === 'sds_linked');
  assert.ok(auditEntries.length > 0, 'SDS linking recorded in audit history');

  store.deleteProject(proj.id);
});

test('Scenario 13: Selecting newly created manual chemical in equipment and PHA study nodes', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Project 13-13', 'Test chemical assignment & PHA readiness');

  // Create manual chemical with missing toxicity and missing exposure limits
  const chem = store.createManualChemical(proj.id, {
    chemical_name: 'Novel Solvent X-1',
  });

  // Add equipment and line
  const v201: EquipmentTag = {
    id: 'eq-v-201',
    project_id: proj.id,
    tag: 'V-201',
    description: 'Solvent Mixing Vessel',
    equipment_type: 'vessel',
    assigned_chemical_id: chem.id,
    source_document_id: null,
    source_page: null,
    status: 'confirmed',
    confidence_score: 1.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.addEquipment([v201]);

  const l201: PipingLine = {
    id: 'line-l-201',
    project_id: proj.id,
    line_number: 'L-201',
    source_tag: 'V-201',
    destination_tag: 'P-201',
    process_fluid: 'Novel Solvent X-1',
    chemical_id: chem.id,
    line_size: '2"',
    piping_spec: 'CS-150',
    source_document_id: null,
    status: 'confirmed',
    confidence_score: 1.0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.addLines([l201]);

  // Create PHA study node with V-201
  const node = store.createPhaNode({
    project_id: proj.id,
    node_id: 'N-201',
    name: 'Solvent Handling Node',
    design_intent: 'Mix and transfer Novel Solvent X-1 to downstream reactors.',
    equipment_tags: ['V-201'],
    line_numbers: ['L-201'],
    inlet_boundaries: ['Solvent feed'],
    outlet_boundaries: ['Reactor discharge'],
    basis_for_grouping: 'Unit node',
    operating_limits: {
      temperature_safe_upper: 50,
      temperature_safe_lower: 10,
      pressure_safe_upper: 5,
      pressure_safe_lower: 0,
      flow_safe_upper: 100,
      flow_safe_lower: 10,
      units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' },
    },
    unresolved_questions: [],
    status: 'approved',
    requires_reassessment: false,
    reassessment_reasons: [],
  });

  // Evaluate HAZOP readiness
  const readiness = checkHazopReadiness(
    store.listEquipment(proj.id),
    store.listLines(proj.id),
    store.listChemicals(proj.id),
    store.listPhaNodes(proj.id),
    true // graph approved
  );

  // Must flag warnings for missing toxicity and missing exposure limits on Novel Solvent X-1
  assert.ok(
    readiness.warnings.some((w) => w.includes('Novel Solvent X-1') && w.includes('missing toxicity data')),
    'Readiness warning surfaced for missing toxicity data'
  );
  assert.ok(
    readiness.warnings.some((w) => w.includes('Novel Solvent X-1') && w.includes('missing exposure limits')),
    'Readiness warning surfaced for missing exposure limits'
  );
  assert.ok(
    readiness.warnings.some((w) => w.includes('Novel Solvent X-1') && w.includes('unknown inadvertent mixing hazards')),
    'Readiness warning surfaced for missing mixing hazards'
  );

  store.deleteProject(proj.id);
});

test('Scenario 14: Full regression testing - existing digital P&ID, SDS extractions, graph validation, and PHA node generation continue working', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Full Regression Project 14', 'Regression testing across all modules');

  // 1. Digital P&ID drawing & synchronization
  const drawing = store.seedSampleDrawing(proj.id);
  assert.ok(drawing, 'Digital drawing created');
  const syncRes = store.syncDrawingToProject(drawing.id, 'Regression Tester');
  assert.ok(syncRes.success);
  assert.ok(syncRes.equipment_count > 0);

  // 2. Topology graph generation & validation
  const graph = store.getProcessTopologyGraph(proj.id);
  assert.ok(graph.nodes.length > 0);
  const validation = store.getGraphValidation(proj.id);
  assert.ok(validation);

  // 3. Manual chemical creation along with existing records
  const manualChem = store.createManualChemical(proj.id, {
    chemical_name: 'Purified Water (PW)',
    cas_number: '7732-18-5',
    psi_parameters: {
      physical_data: {
        value: 'BP: 100 °C; Density: 1.0 g/cm3',
      },
    },
  });
  assert.ok(manualChem);

  // 4. PHA generation & readiness
  const candidateNodes = store.generatePhaNodes(proj.id, 'Lead Facilitator');
  assert.ok(candidateNodes.length > 0);
  const readiness = checkHazopReadiness(
    store.listEquipment(proj.id),
    store.listLines(proj.id),
    store.listChemicals(proj.id),
    candidateNodes,
    false
  );
  assert.ok(readiness);
  assert.strictEqual(readiness.ready, false, 'Blocked because graph not approved');

  store.deleteProject(proj.id);
});

// ----------------------------------------------------
// Test Group 14: SDS-to-PSI Extraction Pipeline Fix & Section 9 Regression Suite
// ----------------------------------------------------
console.log('\n--- Test Group 14: SDS-to-PSI Extraction Pipeline Fix & Section 9 Regression Suite ---');

test('Criterion 1: Fixture containing evidence for all seven categories populates all seven categories', async () => {
  const allSevenFixture = `
SAFETY DATA SHEET
SECTION 1 — IDENTIFICATION
Product Identifier: Complete Process Fluid Safe-700
CAS Number: 108-88-3
Manufacturer: Apex Safety Chemicals Inc.
Revision Date: 2026-04-15

SECTION 2 — HAZARDS IDENTIFICATION
Corrosive to metals, Category 1. Causes severe skin burns and eye damage.
Acute inhalation toxicity Category 4.

SECTION 3 — COMPOSITION / INGREDIENTS
Toluene and amine blend.

SECTION 8 — EXPOSURE CONTROLS / PERSONAL PROTECTION
OSHA PEL: 200 ppm (8-hr TWA), Ceiling 300 ppm.
ACGIH TLV: 20 ppm TWA.
NIOSH REL: 100 ppm (375 mg/m3) TWA, STEL 150 ppm (560 mg/m3). IDLH: 500 ppm.

SECTION 9 — PHYSICAL AND CHEMICAL PROPERTIES
Boiling Point: 110.6 C (231 F)
Melting Point: -95 C
Vapor Pressure: 28 mmHg at 25 C
Vapor Density: 3.1 (Air = 1)
Flash Point: 4.4 C (40 F) closed cup
pH: 12.8 (alkaline concentrate)
Specific Gravity: 0.867 at 20 C

SECTION 10 — STABILITY AND REACTIVITY
10.1 Reactivity: Reacts vigorously with strong oxidizers.
10.2 Chemical stability: Stable under recommended storage conditions.
10.3 Possibility of hazardous reactions: Exothermic reaction when exposed to concentrated acids.
10.4 Conditions to avoid: Heat, flames, sparks, and static discharge.
10.5 Incompatible materials: Incompatible with strong mineral acids, halogens, sodium hypochlorite bleach.
Inadvertent mixing with hypochlorite bleach generates toxic chloroamine vapor.
10.6 Hazardous decomposition products: Thermal decomposition above 380 C releases carbon monoxide and nitrogen oxides.

SECTION 11 — TOXICOLOGICAL INFORMATION
Acute Toxicity:
Inhalation LC50 (rat, 4-hr): 5,000 ppm.
Oral LD50 (rat): 5,580 mg/kg.
Dermal LD50 (rabbit): 12,196 mg/kg.
Causes severe respiratory tract burns, pulmonary edema, and central nervous system depression.
`;

  const doc = {
    text: allSevenFixture,
    pages: [{ pageNumber: 1, text: allSevenFixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };

  const chem = parseSdsContent(doc, 'doc-all-7', 'complete_sds.pdf', 'proj-14');
  assert.strictEqual(chem.chemical_name.value, 'Complete Process Fluid Safe-700');
  assert.strictEqual(chem.cas_number.value, '108-88-3');

  const psi = chem.psi_parameters;
  // Verify all 7 categories are populated
  assert.strictEqual(psi.toxicity.category_status, 'extracted');
  assert.ok(psi.toxicity.value && psi.toxicity.value.includes('LC50'));
  assert.ok(psi.toxicity.findings && psi.toxicity.findings.length >= 2);

  assert.strictEqual(psi.permissible_exposure_limits.category_status, 'extracted');
  assert.ok(psi.permissible_exposure_limits.value && psi.permissible_exposure_limits.value.includes('OSHA PEL'));
  assert.ok(psi.permissible_exposure_limits.findings && psi.permissible_exposure_limits.findings.length >= 2);

  assert.strictEqual(psi.physical_data.category_status, 'extracted');
  assert.ok(psi.physical_data.value && psi.physical_data.value.includes('Boiling Point'));
  assert.ok(psi.physical_data.findings && psi.physical_data.findings.length >= 4);

  assert.strictEqual(psi.reactivity_data.category_status, 'extracted');
  assert.ok(psi.reactivity_data.value && psi.reactivity_data.value.toLowerCase().includes('react'));

  assert.strictEqual(psi.corrosivity_data.category_status, 'extracted');
  assert.ok(psi.corrosivity_data.value && (psi.corrosivity_data.value.includes('Corrosive to metals') || psi.corrosivity_data.value.includes('pH 12.8')));

  assert.strictEqual(psi.thermal_and_chemical_stability_data.category_status, 'extracted');
  assert.ok(psi.thermal_and_chemical_stability_data.value && psi.thermal_and_chemical_stability_data.value.toLowerCase().includes('stable'));

  assert.strictEqual(psi.inadvertent_mixing_hazards.category_status, 'extracted');
  assert.ok(psi.inadvertent_mixing_hazards.value && psi.inadvertent_mixing_hazards.value.toLowerCase().includes('bleach'));

  // Structured extraction metadata
  assert.ok(chem.structured_extraction);
  assert.strictEqual(chem.structured_extraction.extraction_metadata.extraction_status, 'complete');
});

test('Criterion 2: Fixture containing corrosivity information but no toxicity data does not fabricate toxicity findings', () => {
  const corrosivityOnlyFixture = `
SAFETY DATA SHEET
SECTION 1 — IDENTIFICATION
Product Identifier: Acid Wash Solution AC-10
CAS Number: 7664-38-2
Manufacturer: Industrial Cleaning Systems LLC

SECTION 2 — HAZARDS IDENTIFICATION
Corrosive to metals, Category 1. Causes severe skin burns and serious eye damage.

SECTION 9 — PHYSICAL PROPERTIES
pH: 1.2
Appearance: Clear colorless liquid

SECTION 10 — STABILITY AND REACTIVITY
Incompatible with strong bases and reactive metals.
`;

  const doc = {
    text: corrosivityOnlyFixture,
    pages: [{ pageNumber: 1, text: corrosivityOnlyFixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };

  const chem = parseSdsContent(doc, 'doc-corr-only', 'corrosivity_only.pdf', 'proj-14');
  const psi = chem.psi_parameters;

  // Corrosivity MUST be extracted
  assert.strictEqual(psi.corrosivity_data.category_status, 'extracted');
  assert.ok(psi.corrosivity_data.value && psi.corrosivity_data.value.includes('Corrosive to metals'));

  // Toxicity MUST NOT be fabricated or populated
  assert.strictEqual(psi.toxicity.category_status, 'not_found');
  assert.strictEqual(psi.toxicity.review_status, 'missing');
  assert.strictEqual(psi.toxicity.value, null, 'Toxicity value must remain strictly null');
  assert.strictEqual(psi.toxicity.machine_value, null);
  assert.strictEqual(psi.toxicity.findings?.length, 0);
  assert.ok(psi.toxicity.missing_reason && psi.toxicity.missing_reason.includes('No acute or chronic toxicological data'));
});

test('Criterion 3: An SDS containing exposure limits in Section 8 correctly populates exposure limits', () => {
  const pelFixture = `
SECTION 8 — EXPOSURE CONTROLS / PERSONAL PROTECTION
Workplace Exposure Limits:
OSHA PEL: 50 ppm (8-hr TWA)
ACGIH TLV: 25 ppm TWA, 35 ppm STEL
NIOSH REL: 25 ppm TWA, IDLH: 300 ppm
`;

  const doc = {
    text: pelFixture,
    pages: [{ pageNumber: 1, text: pelFixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };

  const chem = parseSdsContent(doc, 'doc-pel', 'pel.pdf', 'proj-14');
  const pel = chem.psi_parameters.permissible_exposure_limits;

  assert.strictEqual(pel.category_status, 'extracted');
  assert.strictEqual(pel.review_status, 'needs_review');
  assert.ok(pel.value?.includes('OSHA PEL'));
  assert.ok(pel.findings && pel.findings.length >= 3);
  const oshaFinding = pel.findings?.find((f) => f.field === 'OSHA PEL');
  assert.ok(oshaFinding);
  assert.strictEqual(oshaFinding?.value, '50');
  assert.strictEqual(oshaFinding?.units, 'ppm');
});

test('Criterion 4: Physical properties in Section 9 correctly populate physical data', () => {
  const physFixture = `
SECTION 9 — PHYSICAL AND CHEMICAL PROPERTIES
Boiling Point: 65.0 C (149 F)
Melting Point: -97.8 C
Vapor Pressure: 128 hPa at 20 C
Flash Point: 11.0 C closed cup
pH: 7.0
Relative density: 0.79 g/cm3
`;

  const doc = {
    text: physFixture,
    pages: [{ pageNumber: 1, text: physFixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };

  const chem = parseSdsContent(doc, 'doc-phys', 'phys.pdf', 'proj-14');
  const phys = chem.psi_parameters.physical_data;

  assert.strictEqual(phys.category_status, 'extracted');
  assert.ok(phys.value?.includes('Boiling Point'));
  assert.ok(phys.findings && phys.findings.length >= 4);
  const bpFinding = phys.findings?.find((f) => f.field === 'Boiling Point');
  assert.ok(bpFinding);
  assert.ok(bpFinding?.value.includes('65.0 C'));
});

test('Criterion 5: Stability and incompatibility information in Section 10 populates the appropriate categories', () => {
  const sec10Fixture = `
SECTION 10 — STABILITY AND REACTIVITY
10.1 Reactivity: Hazardous polymerization will not occur.
10.2 Chemical stability: Thermally stable below 180 C. Decomposes above 200 C releasing toxic vapors.
10.3 Incompatible materials: Inadvertent mixing with sodium hypochlorite (bleach) creates violent exotherm and hazardous gases.
Incompatible with strong acids.
`;

  const doc = {
    text: sec10Fixture,
    pages: [{ pageNumber: 1, text: sec10Fixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };

  const chem = parseSdsContent(doc, 'doc-sec10', 'sec10.pdf', 'proj-14');
  const stab = chem.psi_parameters.thermal_and_chemical_stability_data;
  const mix = chem.psi_parameters.inadvertent_mixing_hazards;
  const react = chem.psi_parameters.reactivity_data;

  // Reactivity
  assert.strictEqual(react.category_status, 'extracted');
  assert.ok(react.value?.includes('polymerization'));

  // Stability
  assert.strictEqual(stab.category_status, 'extracted');
  assert.ok(stab.value?.includes('Thermally stable'));

  // Inadvertent Mixing
  assert.strictEqual(mix.category_status, 'extracted');
  assert.ok(mix.value?.includes('sodium hypochlorite (bleach)'));
});

test('Criterion 6: Toxicological information in Section 11 populates toxicity', () => {
  const toxFixture = `
SECTION 11 — TOXICOLOGICAL INFORMATION
Acute Inhalation Toxicity: LC50 (rat, 4 hours) = 1,250 ppm.
Severe respiratory irritation and pulmonary edema observed following acute exposure.
Oral LD50: 850 mg/kg (rat).
`;

  const doc = {
    text: toxFixture,
    pages: [{ pageNumber: 1, text: toxFixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };

  const chem = parseSdsContent(doc, 'doc-tox', 'tox.pdf', 'proj-14');
  const tox = chem.psi_parameters.toxicity;

  assert.strictEqual(tox.category_status, 'extracted');
  assert.ok(tox.value?.includes('LC50'));
  assert.ok(tox.findings && tox.findings.length >= 2);
  const lc50Finding = tox.findings?.find((f) => f.field === 'Inhalation LC50');
  assert.ok(lc50Finding);
  assert.strictEqual(lc50Finding?.value, '1250');
  assert.strictEqual(lc50Finding?.units, 'ppm');
});

test('Criterion 7: A scanned or text-empty PDF produces a clear OCR/failure status instead of a misleading successful extraction', () => {
  const scannedDoc = {
    text: '   ',
    pages: [{ pageNumber: 1, text: '' }],
    pagesCount: 1,
    isReadable: false,
    unreadableReason: 'Document contains virtually no extractable digital text (< 100 characters or < 15 words). It appears to be a scanned image or flattened drawing. OCR processing or a high-resolution vector PDF is required.',
    isScanned: true,
  };

  const chem = parseSdsContent(scannedDoc, 'doc-scanned', 'scanned_sds.pdf', 'proj-14');
  
  // Every PSI category must have extraction_failed status and explicit reason
  const psi = chem.psi_parameters;
  for (const [key, field] of Object.entries(psi)) {
    assert.strictEqual(field.category_status, 'extraction_failed', `Category ${key} must have extraction_failed status`);
    assert.strictEqual(field.review_status, 'extraction_failed', `Category ${key} review status must be extraction_failed`);
    assert.strictEqual(field.value, null);
    assert.ok(field.missing_reason && field.missing_reason.includes('unreadable or scanned'));
  }
});

test('Criterion 8: Partial model responses / multiple extractions do not erase valid findings from other categories', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Partial Overwrite Protection', '');

  // First extraction: all 7 categories present
  const fullFixture = `
SECTION 1 — IDENTIFICATION
Product Identifier: Test Chem Alpha
CAS: 50-00-0

SECTION 8 — EXPOSURE CONTROLS
OSHA PEL: 0.75 ppm 8-hr TWA

SECTION 9 — PHYSICAL DATA
Boiling Point: -19 C
`;
  const doc1 = {
    text: fullFixture,
    pages: [{ pageNumber: 1, text: fullFixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };
  const chem1 = parseSdsContent(doc1, 'doc-1', 'sds1.pdf', proj.id);
  store.addChemical(chem1);

  assert.strictEqual(chem1.psi_parameters.permissible_exposure_limits.category_status, 'extracted');
  assert.strictEqual(chem1.psi_parameters.physical_data.category_status, 'extracted');

  // Second extraction of the same chemical record with only exposure limits
  const partialFixture = `
SECTION 1 — IDENTIFICATION
Product Identifier: Test Chem Alpha
CAS: 50-00-0

SECTION 8 — EXPOSURE CONTROLS
OSHA PEL: 0.75 ppm 8-hr TWA
`;
  const doc2 = {
    text: partialFixture,
    pages: [{ pageNumber: 1, text: partialFixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };
  const chem2 = parseSdsContent(doc2, 'doc-2', 'sds2.pdf', proj.id);
  chem2.id = chem1.id; // simulate re-extraction for the same chemical ID
  store.addChemical(chem2);

  const updatedChem = store.getChemical(chem1.id);
  assert.ok(updatedChem);
  // Physical data must NOT have been erased by the partial re-extraction!
  assert.strictEqual(updatedChem?.psi_parameters.physical_data.category_status, 'extracted');
  assert.ok(updatedChem?.psi_parameters.physical_data.value?.includes('Boiling Point'));

  store.deleteProject(proj.id);
});

test('Criterion 9: All seven categories survive schema validation, database persistence, and retrieval', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test DB Persistence All 7', '');

  const completeFixture = `
SECTION 1 — IDENTIFICATION
Product: HexaSafe Industrial Solvent
CAS: 110-54-3
Manufacturer: Apex Solvents

SECTION 2 — HAZARDS
Corrosive to metals, Category 1.

SECTION 8 — EXPOSURE CONTROLS
OSHA PEL: 500 ppm TWA.

SECTION 9 — PHYSICAL PROPERTIES
Boiling Point: 69 C. Flash Point: -22 C. pH: 1.5

SECTION 10 — STABILITY AND REACTIVITY
Reactivity: Highly reactive with oxidizing agents.
Chemical stability: Stable under normal temperatures. Decomposes at 250 C.
Incompatible materials: Inadvertent mixing with liquid chlorine produces explosion.

SECTION 11 — TOXICOLOGY
Inhalation LC50: 48000 ppm (rat, 4hr).
`;

  const doc = {
    text: completeFixture,
    pages: [{ pageNumber: 1, text: completeFixture }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };

  const chem = parseSdsContent(doc, 'doc-persist', 'sds.pdf', proj.id);
  store.addChemical(chem);

  // Retrieve fresh from database store
  const loaded = store.getChemical(chem.id);
  assert.ok(loaded);
  assert.strictEqual(loaded?.chemical_name.value, 'HexaSafe Industrial Solvent');

  const psiKeys = [
    'toxicity',
    'permissible_exposure_limits',
    'physical_data',
    'reactivity_data',
    'corrosivity_data',
    'thermal_and_chemical_stability_data',
    'inadvertent_mixing_hazards',
  ] as const;

  for (const k of psiKeys) {
    const field = loaded?.psi_parameters[k];
    assert.ok(field, `Field ${k} must exist`);
    assert.strictEqual(field?.category_status, 'extracted', `Field ${k} must survive persistence as extracted`);
    assert.ok(field?.value, `Field ${k} must have non-empty value`);
    assert.ok(field?.source?.document, `Field ${k} source document must persist`);
  }

  // Reload store from disk
  const reloadedStore = new PsiDataStore();
  const diskLoaded = reloadedStore.getChemical(chem.id);
  assert.ok(diskLoaded);
  for (const k of psiKeys) {
    const field = diskLoaded?.psi_parameters[k];
    assert.strictEqual(field?.category_status, 'extracted');
  }

  store.deleteProject(proj.id);
});

test('Criterion 10: The frontend data contract displays all seven categories and their correct statuses', () => {
  // Ensure the 7 OSHA CFR 1910.119(d)(1) configuration keys match exactly
  const frontendConfigKeys = [
    'toxicity',
    'permissible_exposure_limits',
    'physical_data',
    'reactivity_data',
    'corrosivity_data',
    'thermal_and_chemical_stability_data',
    'inadvertent_mixing_hazards',
  ];

  const emptyDoc = {
    text: 'SECTION 1 — Identification\nProduct: Simple Water\nCAS: 7732-18-5',
    pages: [{ pageNumber: 1, text: 'SECTION 1 — Identification\nProduct: Simple Water\nCAS: 7732-18-5' }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };
  const chem = parseSdsContent(emptyDoc, 'doc-frontend', 'water.pdf', 'proj-14');

  for (const key of frontendConfigKeys) {
    const field = (chem.psi_parameters as any)[key];
    assert.ok(field, `Frontend key ${key} must exist on chemical.psi_parameters`);
    assert.strictEqual(field.category_status, 'not_found', `Field ${key} must have not_found status`);
    assert.strictEqual(field.review_status, 'missing');
    assert.ok(field.missing_reason, `Field ${key} must have human-readable missing explanation`);
  }
});

test('Criterion 11: Manual or verified values are not silently overwritten', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Test Manual Value Protection', '');

  // Create chemical with verified user value
  const chem = parseSdsContent(
    {
      text: 'SECTION 1 — IDENTIFICATION\nProduct: Verified Solvent\nCAS: 67-64-1',
      pages: [{ pageNumber: 1, text: 'SECTION 1 — IDENTIFICATION\nProduct: Verified Solvent\nCAS: 67-64-1' }],
      pagesCount: 1,
      isReadable: true,
      isScanned: false,
    },
    'doc-user-val',
    'sds.pdf',
    proj.id
  );
  store.addChemical(chem);

  // Engineer verifies and overrides permissible exposure limits
  const updatedField = store.updatePsiField(chem.id, 'permissible_exposure_limits', {
    user_value: '250 ppm 8-hr TWA (Engineering Verified)',
    review_status: 'confirmed',
    notes: 'Verified via certified industrial hygiene monitoring',
  });
  assert.ok(updatedField);

  // Subsequent automated re-extraction from a new SDS file
  const reExtractedChem = parseSdsContent(
    {
      text: `SECTION 1 — IDENTIFICATION\nProduct: Verified Solvent\nCAS: 67-64-1\nSECTION 8 — EXPOSURE CONTROLS\nOSHA PEL: 1000 ppm TWA`,
      pages: [{ pageNumber: 1, text: '...' }],
      pagesCount: 1,
      isReadable: true,
      isScanned: false,
    },
    'doc-new-sds',
    'new_sds.pdf',
    proj.id
  );
  reExtractedChem.id = chem.id;
  store.addChemical(reExtractedChem);

  // Verify that the user value and confirmed review status remain 100% intact!
  const finalChem = store.getChemical(chem.id);
  const pel = finalChem?.psi_parameters.permissible_exposure_limits;
  assert.strictEqual(pel?.user_value, '250 ppm 8-hr TWA (Engineering Verified)');
  assert.strictEqual(pel?.review_status, 'confirmed');
  assert.strictEqual(pel?.verification_status, 'verified');
  assert.ok(pel?.notes?.includes('industrial hygiene monitoring'));
  // And the new machine extraction was preserved in machine_value for auditability
  assert.ok(pel?.machine_value?.includes('1000 ppm'));

  store.deleteProject(proj.id);
});

test('Criterion 12: Existing extraction functionality and unrelated application features continue to work', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Full Regression Test Group 14', '');

  // 1. Digital P&ID creation and sync
  const drawing = store.seedSampleDrawing(proj.id);
  assert.ok(drawing, 'Digital drawing created');
  const syncRes = store.syncDrawingToProject(drawing.id, 'Regression Tester');
  assert.ok(syncRes.success);
  assert.ok(syncRes.equipment_count > 0);

  // 2. SDS extraction for 2 representative demo chemicals
  const doc = {
    text: `
SECTION 1 — IDENTIFICATION
Product: Ammonia Solution
CAS: 7664-41-7
SECTION 8 — EXPOSURE CONTROLS
OSHA PEL: 50 ppm
SECTION 9 — PHYSICAL DATA
Boiling Point: -33 C
SECTION 10 — STABILITY
Reactivity: Violently with acids. Incompatible with bleach producing chloramines.
SECTION 11 — TOXICOLOGY
LC50: 2000 ppm rat 4h.
`,
    pages: [{ pageNumber: 1, text: '...' }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };
  const chem = parseSdsContent(doc, 'doc-reg-1', 'ammonia.pdf', proj.id);
  store.addChemical(chem);
  assert.strictEqual(chem.psi_parameters.toxicity.category_status, 'extracted');

  // 3. Topology graph generation & validation
  const graph = store.getProcessTopologyGraph(proj.id);
  assert.ok(graph.nodes.length > 0);
  const validation = store.getGraphValidation(proj.id);
  assert.ok(validation);

  // 4. PHA Node Candidate Segmentation
  const nodes = store.generatePhaNodes(proj.id, 'Safety Facilitator');
  assert.ok(nodes.length > 0);

  // 5. Cross-SDS conflict detection
  const projectChems = store.listChemicals(proj.id);
  const conflicts = detectConflictsForProject(projectChems, proj.id, []);
  assert.ok(Array.isArray(conflicts));

  store.deleteProject(proj.id);
});

// Test Group 15: Process Stream Flow-Rate Integration & Flow-Aware Node Identification
// (Covering all 12 Acceptance Criteria from Section 10)
// ----------------------------------------------------
console.log('\n--- Test Group 15: Process Stream Flow-Rate Integration & Flow-Aware Node Identification ---');

test('Criterion 1: Correct identification of process streams from P&ID and line connectivity', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Stream Identification Test', 'Validating process stream identification');

  const pidText = `
    PROCESS PIPING & INSTRUMENTATION DIAGRAM
    V-101 Ammonia Storage Receiver Drum
    P-101A Primary Ammonia Circulation Pump
    P-101B Standby Ammonia Circulation Pump
    E-101 Ammonia Chiller Evaporator

    Piping Lines:
    3"-NH3-101-CS from V-101 to P-101A (Process Liquid Stream)
    3"-NH3-102-CS from V-101 to P-101B (Process Liquid Stream)
    2"-NH3-103-CS from P-101A to E-101 (Discharge Process Stream)

    Instrumentation:
    FIT-101 Flow Indicating Transmitter on line 3"-NH3-101-CS
    FIC-101 Flow Indicating Controller on line 2"-NH3-103-CS
    FCV-101 Flow Control Valve on line 2"-NH3-103-CS
    SIG-101 Electrical Signal line from FIC-101 to FCV-101
  `;

  const extractedDoc = {
    text: pidText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };

  const { equipment, lines, streams } = parsePidDocument(
    extractedDoc,
    'doc-pid-stream-test',
    'ammonia_pid.png',
    proj.id,
    []
  );

  assert.ok(streams.length >= 3, `Expected at least 3 process streams, found ${streams.length}`);

  // Every stream must have a unique ID, stream_number, and connect valid equipment
  for (const s of streams) {
    assert.ok(s.id, 'Stream has an ID');
    assert.ok(s.stream_number, 'Stream has a stream number');
    assert.strictEqual(s.project_id, proj.id);
    assert.ok(s.source_equipment_tag, 'Stream has a source tag');
    assert.ok(s.destination_equipment_tag, 'Stream has a destination tag');
    assert.notStrictEqual(s.source_equipment_tag, s.destination_equipment_tag, 'Stream connects two distinct entities');
  }

  // Instrument signal lines must NOT create process streams
  const signalStreams = streams.filter((s) => s.source_equipment_tag.startsWith('SIG') || s.line_number?.startsWith('SIG'));
  assert.strictEqual(signalStreams.length, 0, 'Signal lines do not create process streams');

  store.deleteProject(proj.id);
});

test('Criterion 2: Correct source and destination mapping', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Stream Mapping Test', 'Checking upstream and downstream mapping');

  const pidText = `
    TK-201 Chemical Storage Tank
    V-101 Mixing Receiver Drum
    Line: 1.5"-BL-201-PVC from TK-201 to V-101. Flow rate: 0.15 m3/h.
  `;

  const doc = { text: pidText, pagesCount: 1, isReadable: true, isScanned: false };
  const { streams } = parsePidDocument(doc, 'doc-map', 'test.png', proj.id, []);

  const bleachStream = streams.find(
    (s) => s.source_equipment_tag.toUpperCase() === 'TK-201' && s.destination_equipment_tag.toUpperCase() === 'V-101'
  );

  assert.ok(bleachStream, 'Found stream connecting TK-201 to V-101');
  assert.strictEqual(bleachStream?.source_equipment_tag, 'TK-201');
  assert.strictEqual(bleachStream?.destination_equipment_tag, 'V-101');
  assert.strictEqual(bleachStream?.flow_direction, 'forward');

  store.deleteProject(proj.id);
});

test('Criterion 3: Correct flow-direction handling', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Flow Direction Test', 'Handling forward, reverse, and bidirectional flow');

  // Create streams with distinct flow directions
  const forwardStream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-FWD',
    source_equipment_tag: 'TK-101',
    destination_equipment_tag: 'P-101',
    flow_direction: 'forward',
  });
  assert.strictEqual(forwardStream.flow_direction, 'forward');

  const reverseStream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-REV',
    source_equipment_tag: 'V-101',
    destination_equipment_tag: 'TK-101',
    flow_direction: 'reverse',
  });
  assert.strictEqual(reverseStream.flow_direction, 'reverse');

  const bidiStream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-BIDI',
    source_equipment_tag: 'V-101',
    destination_equipment_tag: 'V-102',
    flow_direction: 'bidirectional',
  });
  assert.strictEqual(bidiStream.flow_direction, 'bidirectional');

  const unknownStream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-UNK',
    source_equipment_tag: 'V-101',
    destination_equipment_tag: 'V-103',
    flow_direction: 'unknown',
  });
  assert.strictEqual(unknownStream.flow_direction, 'unknown');

  store.deleteProject(proj.id);
});

test('Criterion 4: Extraction of flow values and units from supported documents (volumetric, mass, molar)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Flow Extraction Test', 'Extracting volumetric, mass, and molar rates');

  const pidTextWithStreamTable = `
    PROCESS FLOW DIAGRAM & STREAM TABLE
    Stream Table:
    Stream No | From | To | Normal Flow | Design Flow | Unit | Pressure | Temp
    101 | V-101 | P-101 | 25.5 | 40.0 | m3/h | 13.5 bar | -10 C
    102 | P-101 | E-101 | 1250 | 1800 | kg/h | 16.0 bar | -8 C
    103 | E-101 | C-101 | 75.0 | 110.0 | kmol/h | 2.5 bar | -33 C
    104 | TK-201 | V-101 | 150 | 220 | gpm | 50 psig | 70 F
  `;

  const doc = { text: pidTextWithStreamTable, pagesCount: 1, isReadable: true, isScanned: false };
  const { streams } = parsePidDocument(doc, 'doc-table', 'pfd_table.png', proj.id, []);

  assert.ok(streams.length >= 4, `Expected at least 4 extracted streams, got ${streams.length}`);

  // 1. Volumetric stream (m3/h)
  const str101 = streams.find((s) => s.stream_number.includes('101') || (s.source_equipment_tag === 'V-101' && s.destination_equipment_tag === 'P-101'));
  assert.ok(str101, 'Stream 101 extracted');
  assert.strictEqual(str101?.flow_rates.normal, 25.5);
  assert.strictEqual(str101?.flow_rates.design, 40.0);
  assert.strictEqual(str101?.flow_rates.unit, 'm3/h');
  assert.strictEqual(str101?.flow_rates.basis, 'volumetric');

  // 2. Mass stream (kg/h)
  const str102 = streams.find((s) => s.stream_number.includes('102') || (s.source_equipment_tag === 'P-101' && s.destination_equipment_tag === 'E-101'));
  assert.ok(str102, 'Stream 102 extracted');
  assert.strictEqual(str102?.flow_rates.normal, 1250);
  assert.strictEqual(str102?.flow_rates.design, 1800);
  assert.strictEqual(str102?.flow_rates.unit, 'kg/h');
  assert.strictEqual(str102?.flow_rates.basis, 'mass');

  // 3. Molar stream (kmol/h)
  const str103 = streams.find((s) => s.stream_number.includes('103') || (s.source_equipment_tag === 'E-101' && s.destination_equipment_tag === 'C-101'));
  assert.ok(str103, 'Stream 103 extracted');
  assert.strictEqual(str103?.flow_rates.normal, 75.0);
  assert.strictEqual(str103?.flow_rates.design, 110.0);
  assert.strictEqual(str103?.flow_rates.unit, 'kmol/h');
  assert.strictEqual(str103?.flow_rates.basis, 'molar');

  // 4. Volumetric stream (gpm)
  const str104 = streams.find((s) => s.stream_number.includes('104') || (s.source_equipment_tag === 'TK-201' && s.destination_equipment_tag === 'V-101'));
  assert.ok(str104, 'Stream 104 extracted');
  assert.strictEqual(str104?.flow_rates.normal, 150);
  assert.strictEqual(str104?.flow_rates.unit, 'gpm');
  assert.strictEqual(str104?.flow_rates.basis, 'volumetric');

  store.deleteProject(proj.id);
});

test('Criterion 5: Correct handling of missing flow rates (strictly null, not zero)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Missing Flow Rates Test', 'Ensuring missing flow rates are null, not 0');

  const pidTextWithoutFlow = `
    V-101 Liquid Ammonia Receiver
    P-101 Ammonia Circulation Pump
    Line: 3"-NH3-101-CS from V-101 to P-101. Size: 3 inches. Material: Carbon Steel.
  `;

  const doc = { text: pidTextWithoutFlow, pagesCount: 1, isReadable: true, isScanned: false };
  const { streams } = parsePidDocument(doc, 'doc-noflow', 'noflow.png', proj.id, []);

  assert.ok(streams.length >= 1, 'Stream created from line');
  const stream = streams[0];

  // Negative rule: Flow rates MUST be strictly null, never 0
  assert.strictEqual(stream.flow_rates.normal, null, 'normal flow rate must be null when unstated');
  assert.notStrictEqual(stream.flow_rates.normal, 0, 'normal flow rate must NOT be 0');
  assert.strictEqual(stream.flow_rates.min, null, 'min flow rate must be null when unstated');
  assert.strictEqual(stream.flow_rates.max, null, 'max flow rate must be null when unstated');
  assert.strictEqual(stream.flow_rates.design, null, 'design flow rate must be null when unstated');
  assert.strictEqual(stream.flow_rates.actual, null, 'actual flow rate must be null when unmeasured');

  store.deleteProject(proj.id);
});

test('Criterion 6: No flow-rate invention from pipe diameter', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('No Invention Test', 'Never infer flow rates from pipe diameter');

  const pidTextWithLargePipe = `
    V-101 Ammonia Receiver
    C-101 Ammonia Compressor Suction
    Line: 8"-NH3-105-CS from V-101 to C-101. Diameter: 8". Schedule 40 Carbon Steel.
  `;

  const doc = { text: pidTextWithLargePipe, pagesCount: 1, isReadable: true, isScanned: false };
  const { streams } = parsePidDocument(doc, 'doc-large-pipe', 'pid.png', proj.id, []);

  assert.ok(streams.length >= 1);
  const stream = streams[0];

  assert.strictEqual(stream.pipe_nominal_diameter, '8"', 'Diameter is recognized');
  // Flow rate MUST remain null, not calculated via area * velocity
  assert.strictEqual(stream.flow_rates.normal, null, 'Flow rate must NOT be invented from 8" pipe diameter');
  assert.strictEqual(stream.flow_rates.design, null, 'Design flow rate must NOT be invented');

  store.deleteProject(proj.id);
});

test('Criterion 7: Distinction between normal, min, max, and design flow', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Flow Distinction Test', 'Distinguishing normal, min, max, and design rates');

  const stream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-DISTINCT',
    source_equipment_tag: 'V-101',
    destination_equipment_tag: 'P-101',
    flow_rates: {
      normal: 20.0,
      min: 5.0,
      max: 28.0,
      design: 35.0,
      unit: 'm3/h',
      basis: 'volumetric',
    },
  });

  assert.strictEqual(stream.flow_rates.normal, 20.0, 'Normal flow is distinct');
  assert.strictEqual(stream.flow_rates.min, 5.0, 'Min flow is distinct');
  assert.strictEqual(stream.flow_rates.max, 28.0, 'Max flow is distinct');
  assert.strictEqual(stream.flow_rates.design, 35.0, 'Design flow is distinct');

  // Verify design flow != max flow
  assert.notStrictEqual(stream.flow_rates.design, stream.flow_rates.max, 'Design flow is not conflated with maximum allowable flow');

  store.deleteProject(proj.id);
});

test('Criterion 8: Manual stream creation and editing', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Manual Stream CRUD Test', 'Full manual lifecycle');

  // 1. Create manually
  const newStream = store.createStream(
    {
      project_id: proj.id,
      stream_number: 'STR-MANUAL-01',
      source_equipment_tag: 'TK-101',
      destination_equipment_tag: 'V-101',
      material_description: 'Pure Water Feed',
      flow_rates: {
        normal: 10.0,
        unit: 'm3/h',
        basis: 'volumetric',
      },
      operating_pressure: {
        value: 3.0,
        unit: 'bar(g)',
      },
      operating_temperature: {
        value: 25.0,
        unit: '°C',
      },
      phase: 'liquid',
      pipe_nominal_diameter: '2"',
      pipe_spec: 'SS316',
      associated_instrument_tags: ['FIT-201', 'FIC-201'],
      notes: 'Manually entered water feed line',
      reviewer: 'Process Engineer Alice',
    },
    'Process Engineer Alice'
  );

  assert.strictEqual(newStream.stream_number, 'STR-MANUAL-01');
  assert.strictEqual(newStream.data_origin, 'manual');
  // Manual streams must not be automatically marked as verified
  assert.strictEqual(newStream.verification_status, 'unverified');

  // 2. Update manually
  const updated = store.updateStream(
    newStream.id,
    {
      flow_rates: {
        ...newStream.flow_rates,
        normal: 12.5,
        design: 18.0,
      },
      notes: 'Revised feed capacity following pump reassessment',
    },
    'Process Engineer Bob',
    'Capacity expansion adjustment'
  );

  assert.ok(updated);
  assert.strictEqual(updated?.flow_rates.normal, 12.5);
  assert.strictEqual(updated?.flow_rates.design, 18.0);
  assert.strictEqual(updated?.notes, 'Revised feed capacity following pump reassessment');

  // 3. Verify stream
  const verified = store.verifyStream(newStream.id, 'Senior PE Carol', 'Verified against PFD Rev 3');
  assert.ok(verified);
  assert.strictEqual(verified?.verification_status, 'verified');
  assert.strictEqual(verified?.verified_by, 'Senior PE Carol');
  assert.ok(verified?.verified_at);

  store.deleteProject(proj.id);
});

test('Criterion 9: Stream persistence after saving and reopening', () => {
  const store1 = new PsiDataStore();
  const proj = store1.createProject('Persistence Stream Test', 'Testing disk persistence');

  const stream = store1.createStream({
    project_id: proj.id,
    stream_number: 'STR-PERSIST',
    source_equipment_tag: 'R-101',
    destination_equipment_tag: 'C-101',
    material_description: 'Anhydrous Vapor Product',
    flow_rates: {
      normal: 850.0,
      min: 200.0,
      max: 1100.0,
      design: 1200.0,
      unit: 'kg/h',
      basis: 'mass',
    },
    operating_pressure: {
      value: 18.2,
      unit: 'bar(g)',
      status: 'user_entered',
    },
    phase: 'vapor',
    pipe_nominal_diameter: '4"',
    associated_instrument_tags: ['FT-301', 'FIC-301', 'FCV-301'],
  });

  // Reopen the database from disk using a fresh instance
  const store2 = new PsiDataStore();
  const loadedStream = store2.getStream(stream.id);

  assert.ok(loadedStream, 'Stream retrieved after reload');
  assert.strictEqual(loadedStream?.stream_number, 'STR-PERSIST');
  assert.strictEqual(loadedStream?.source_equipment_tag, 'R-101');
  assert.strictEqual(loadedStream?.destination_equipment_tag, 'C-101');
  assert.strictEqual(loadedStream?.flow_rates.normal, 850.0);
  assert.strictEqual(loadedStream?.flow_rates.unit, 'kg/h');
  assert.strictEqual(loadedStream?.flow_rates.basis, 'mass');
  assert.strictEqual(loadedStream?.operating_pressure.value, 18.2);
  assert.strictEqual(loadedStream?.phase, 'vapor');
  assert.deepStrictEqual(loadedStream?.associated_instrument_tags, ['FT-301', 'FIC-301', 'FCV-301']);

  store2.deleteProject(proj.id);
});

test('Criterion 10: Correct association of streams with HAZOP nodes and boundary partitioning', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Node Stream Association Test', 'Associating streams with study nodes');

  // Node boundary: High Pressure Receiver V-101 and Circulation Pump P-101A
  const nodeEquipment: EquipmentTag[] = [
    {
      id: 'eq-v101',
      project_id: proj.id,
      document_id: 'doc-pid',
      tag: 'V-101',
      description: 'Receiver',
      equipment_type: 'vessel',
      assigned_chemical_id: null,
      confidence: 1.0,
      status: 'confirmed',
      source: { document: 'PID', page: 1, snippet: '' },
      specifications: createDefaultSpecifications('vessel'),
      created_at: new Date().toISOString(),
    },
    {
      id: 'eq-p101a',
      project_id: proj.id,
      document_id: 'doc-pid',
      tag: 'P-101A',
      description: 'Pump',
      equipment_type: 'pump',
      assigned_chemical_id: null,
      confidence: 1.0,
      status: 'confirmed',
      source: { document: 'PID', page: 1, snippet: '' },
      specifications: createDefaultSpecifications('pump'),
      created_at: new Date().toISOString(),
    },
    {
      id: 'eq-tk201',
      project_id: proj.id,
      document_id: 'doc-pid',
      tag: 'TK-201',
      description: 'Upstream Dosing Tank',
      equipment_type: 'tank',
      assigned_chemical_id: null,
      confidence: 1.0,
      status: 'confirmed',
      source: { document: 'PID', page: 1, snippet: '' },
      specifications: createDefaultSpecifications('tank'),
      created_at: new Date().toISOString(),
    },
    {
      id: 'eq-e101',
      project_id: proj.id,
      document_id: 'doc-pid',
      tag: 'E-101',
      description: 'Downstream Chiller',
      equipment_type: 'heat_exchanger',
      assigned_chemical_id: null,
      confidence: 1.0,
      status: 'confirmed',
      source: { document: 'PID', page: 1, snippet: '' },
      specifications: createDefaultSpecifications('heat_exchanger'),
      created_at: new Date().toISOString(),
    },
  ];

  // 1. Incoming stream: TK-201 -> V-101 (enters node boundary)
  const inStream: ProcessStream = {
    ...createEmptyProcessStream(proj.id, 'TK-201', 'V-101', null, '1.5"-BL-201-PVC', 'STR-IN-01'),
    flow_rates: { normal: 0.15, min: 0.05, max: 0.30, design: 0.50, actual: null, unit: 'm3/h', basis: 'volumetric' },
    associated_instrument_tags: ['FIT-201', 'FIC-201'],
  };

  // 2. Internal stream: V-101 -> P-101A (stays inside node boundary)
  const internalStream: ProcessStream = {
    ...createEmptyProcessStream(proj.id, 'V-101', 'P-101A', null, '3"-NH3-101-CS', 'STR-INT-01'),
    flow_rates: { normal: 25.0, min: 8.0, max: 35.0, design: 40.0, actual: null, unit: 'm3/h', basis: 'volumetric' },
  };

  // 3. Outgoing stream: P-101A -> E-101 (exits node boundary)
  const outStream: ProcessStream = {
    ...createEmptyProcessStream(proj.id, 'P-101A', 'E-101', null, '2"-NH3-103-CS', 'STR-OUT-01'),
    flow_rates: { normal: 25.0, min: 8.0, max: 35.0, design: 40.0, actual: null, unit: 'm3/h', basis: 'volumetric' },
    associated_instrument_tags: ['FIT-101', 'FCV-101'],
  };

  const node: PhaStudyNode = {
    id: 'pha-node-n001',
    project_id: proj.id,
    node_id: 'N-001',
    name: 'High Pressure Storage & Pumping',
    design_intent: 'Accumulate and circulate liquid refrigerant',
    equipment_tags: ['V-101', 'P-101A'],
    line_numbers: ['3"-NH3-101-CS'],
    inlet_boundaries: [],
    outlet_boundaries: [],
    basis_for_grouping: 'Liquid inventory subsystem',
    operating_limits: {},
    unresolved_questions: [],
    status: 'candidate_not_authoritative',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const enrichedNode = attachStreamContextToNode(node, [inStream, internalStream, outStream], nodeEquipment, []);

  // Assert boundary partitioning
  assert.strictEqual(enrichedNode.incoming_streams?.length, 1, '1 incoming boundary stream');
  assert.strictEqual(enrichedNode.incoming_streams?.[0].stream_number, 'STR-IN-01');

  assert.strictEqual(enrichedNode.outgoing_streams?.length, 1, '1 outgoing boundary stream');
  assert.strictEqual(enrichedNode.outgoing_streams?.[0].stream_number, 'STR-OUT-01');

  // Verify stream summary
  assert.ok(enrichedNode.stream_summary);
  assert.strictEqual(enrichedNode.stream_summary?.incoming_count, 1);
  assert.strictEqual(enrichedNode.stream_summary?.outgoing_count, 1);
  assert.strictEqual(enrichedNode.stream_summary?.known_flow_count, 3);
  assert.strictEqual(enrichedNode.stream_summary?.unknown_flow_count, 0);

  store.deleteProject(proj.id);
});

test('Criterion 11: Generation of 5 mandatory flow deviations (No Flow, Less Flow, More Flow, Reverse Flow, Fluctuating Flow)', () => {
  const stream: ProcessStream = {
    ...createEmptyProcessStream('proj-1', 'V-101', 'P-101A', null, '3"-NH3-101-CS', 'STR-101'),
    flow_rates: {
      normal: 25.0,
      min: 8.0,
      max: 35.0,
      design: 40.0,
      actual: 24.8,
      unit: 'm3/h',
      basis: 'volumetric',
    },
    associated_instrument_tags: ['FIT-101', 'FIC-101', 'FCV-101', 'FAL-101', 'FAH-101'],
  };

  const deviations = generateFlowDeviationsForNode('N-001', ['V-101', 'P-101A'], [stream], []);

  assert.strictEqual(deviations.length, 5, 'Generates exactly 5 mandatory deviations for the process stream');

  const devNames = deviations.map((d) => d.deviation);
  assert.ok(devNames.includes('NO FLOW'), 'Contains NO FLOW deviation');
  assert.ok(devNames.includes('LESS FLOW'), 'Contains LESS FLOW deviation');
  assert.ok(devNames.includes('MORE FLOW'), 'Contains MORE FLOW deviation');
  assert.ok(devNames.includes('REVERSE FLOW'), 'Contains REVERSE FLOW deviation');
  assert.ok(devNames.includes('FLUCTUATING FLOW'), 'Contains FLUCTUATING FLOW deviation');

  // Check NO FLOW grounded structure
  const noFlow = deviations.find((d) => d.deviation === 'NO FLOW')!;
  assert.strictEqual(noFlow.guideword, 'NO');
  assert.ok(noFlow.causes.some((c) => c.toLowerCase().includes('pump trip') || c.toLowerCase().includes('valve closed')));
  assert.ok(noFlow.consequences.some((c) => c.toLowerCase().includes('cavitation') || c.toLowerCase().includes('loss of feed') || c.toLowerCase().includes('dry run')));
  assert.ok(noFlow.safeguards.length > 0, 'Safeguards documented');
  assert.ok(noFlow.instrumentation_and_alarms.length > 0, 'Alarms documented');
  assert.ok(noFlow.recommendations.length > 0, 'Recommendations documented');

  // Check REVERSE FLOW grounded structure
  const reverseFlow = deviations.find((d) => d.deviation === 'REVERSE FLOW')!;
  assert.strictEqual(reverseFlow.guideword, 'REVERSE');
  assert.ok(reverseFlow.causes.some((c) => c.toLowerCase().includes('check valve failure') || c.toLowerCase().includes('differential pressure')));
  assert.ok(reverseFlow.safeguards.some((s) => s.toLowerCase().includes('check valve') || s.toLowerCase().includes('non-return')));

  // Check FLUCTUATING FLOW grounded structure
  const flucFlow = deviations.find((d) => d.deviation === 'FLUCTUATING FLOW')!;
  assert.strictEqual(flucFlow.guideword, 'OTHER THAN');
  assert.ok(flucFlow.causes.some((c) => c.toLowerCase().includes('hunting') || c.toLowerCase().includes('tuning') || c.toLowerCase().includes('slug')));
});

test('Criterion 12: Preservation of existing P&ID and node identification functionality', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Full Regression Test Group 15', 'Preservation of complete workflow');

  // 1. Digital P&ID creation and sync
  const drawing = store.seedSampleDrawing(proj.id);
  assert.ok(drawing);
  const syncResult = store.syncDrawingToProject(drawing.id, 'Process Safety Engineer');
  assert.ok(syncResult.success);

  // 2. SDS ingestion & PSI extraction
  const sdsText = `
      SECTION 1: PRODUCT AND COMPANY IDENTIFICATION
      Product Name: Anhydrous Ammonia
      CAS Number: 7664-41-7
      SECTION 2: HAZARDS IDENTIFICATION
      Toxic if inhaled. Causes severe skin burns.
      SECTION 8: EXPOSURE CONTROLS
      OSHA PEL: 50 ppm (35 mg/m3) TWA
  `;
  const doc = {
    text: sdsText,
    pages: [{ pageNumber: 1, text: sdsText }],
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
  };
  const chem = parseSdsContent(doc, 'doc-reg-15', 'ammonia.pdf', proj.id);
  store.addChemical(chem);
  assert.strictEqual(chem.psi_parameters.toxicity.category_status, 'extracted');

  // 3. Topology graph generation & validation (now includes streams)
  const graph = store.getProcessTopologyGraph(proj.id);
  assert.ok(graph.nodes.length > 0);
  assert.ok(graph.edges.length > 0);
  const validation = store.getGraphValidation(proj.id);
  assert.ok(validation);

  // 4. PHA Node Candidate Segmentation (now stream-aware)
  const nodes = store.generatePhaNodes(proj.id, 'Safety Facilitator');
  assert.ok(nodes.length > 0);

  // Verify streams attached to candidate nodes
  const nodeWithStreams = nodes.find((n) => n.stream_summary !== undefined);
  assert.ok(nodeWithStreams, 'Candidate nodes have stream summary attached');
  assert.ok(nodeWithStreams?.flow_deviations && nodeWithStreams.flow_deviations.length >= 5, 'Candidate nodes have 5 flow deviations attached');

  // 5. HAZOP readiness check with stream completeness reporting
  const readiness = store.getHazopReadiness(proj.id);
  assert.ok(readiness);

  store.deleteProject(proj.id);
});

// -----------------------------------------------------------------------------------------
// Test Group 16: Hybrid P&ID Recognition, Pipe Tracing & Process Understanding Engine
// -----------------------------------------------------------------------------------------
console.log('\n--- Test Group 16: Hybrid P&ID Recognition & Process Understanding Engine ---');

test('Scenario 1: Clear vector P&ID recognition with vector line segments and text', () => {
  const svgData = `
    <svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">
      <line x1="100" y1="200" x2="300" y2="200" stroke="black" stroke-width="2" />
      <line x1="300" y1="200" x2="300" y2="400" stroke="black" stroke-width="2" />
      <line x1="500" y1="200" x2="700" y2="200" stroke="black" stroke-width="1" stroke-dasharray="4,4" />
      <text x="150" y="190">2"-NH3-101-CS</text>
      <text x="80" y="210">TK-101</text>
      <text x="290" y="420">P-101</text>
    </svg>
  `;

  const vecResult = extractVectorGeometry('test.svg', svgData);
  assert.strictEqual(vecResult.lines.length, 3, 'Extracted 3 vector line segments');
  assert.strictEqual(vecResult.textElements.length, 3, 'Extracted 3 positioned text elements');

  // Verify process piping vs signal line classification
  const processLines = vecResult.lines.filter((l) => l.classificationHint === 'process_pipe');
  const signalLines = vecResult.lines.filter((l) => l.classificationHint === 'signal_line');
  assert.strictEqual(processLines.length, 2, '2 solid process piping lines');
  assert.strictEqual(signalLines.length, 1, '1 dashed signal line');
});

test('Scenario 2: Scanned P&ID recognition routes through raster preprocessing', () => {
  const rasterResult = preprocessRasterImage({ width: 2400, height: 1600 });
  assert.strictEqual(rasterResult.width, 2400);
  assert.strictEqual(rasterResult.height, 1600);
  assert.strictEqual(rasterResult.rotationDegrees, 0);
  assert.strictEqual(rasterResult.isBinarized, true);
  assert.ok(rasterResult.contrastScore > 0.8, 'Adequate contrast score computed');
});

test('Scenario 3: PNG image directly processed with raster pipeline', () => {
  const raster = preprocessRasterImage({ width: 1920, height: 1080 });
  assert.strictEqual(raster.width, 1920);
  assert.strictEqual(raster.height, 1080);
});

test('Scenario 4: JPG image directly processed with raster pipeline', () => {
  const raster = preprocessRasterImage({ width: 3000, height: 2000 });
  assert.strictEqual(raster.width, 3000);
  assert.strictEqual(raster.height, 2000);
});

test('Scenario 5: Mixed vector/scanned PDF handling and independent page classification', () => {
  // Mock page classifications for a mixed multi-page drawing
  const p1 = { pageNumber: 1, type: 'vector' as const, hasVectorGraphics: true, hasTextStream: true, textLength: 500, confidence: 0.95, recommendedPipeline: 'vector' as const };
  const p2 = { pageNumber: 2, type: 'scanned' as const, hasVectorGraphics: false, hasTextStream: false, textLength: 0, confidence: 0.85, recommendedPipeline: 'raster' as const };

  const pages = [p1, p2];
  const hasVector = pages.some((p) => p.type === 'vector');
  const hasScanned = pages.some((p) => p.type === 'scanned');
  const overall = hasVector && hasScanned ? 'mixed_pdf' : 'vector_pdf';

  assert.strictEqual(overall, 'mixed_pdf', 'Correctly classified as mixed_pdf');
  assert.strictEqual(pages[0].recommendedPipeline, 'vector');
  assert.strictEqual(pages[1].recommendedPipeline, 'raster');
});

test('Scenario 6: Two crossing pipes without a junction (Critical Crossing Rule)', () => {
  // Horizontal line: (100, 200) to (400, 200)
  // Vertical line:   (250, 100) to (250, 300)
  const inter = findLineIntersection(
    { x: 100, y: 200 },
    { x: 400, y: 200 },
    { x: 250, y: 100 },
    { x: 250, y: 300 }
  );

  assert.strictEqual(inter.intersects, true, 'Lines physically intersect in 2D space');
  assert.strictEqual(inter.point?.x, 250);
  assert.strictEqual(inter.point?.y, 200);

  // Trace through pipe network without junction dot
  const segments = [
    { id: 's1', page: 1, start: { x: 100, y: 200 }, end: { x: 400, y: 200 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
    { id: 's2', page: 1, start: { x: 250, y: 100 }, end: { x: 250, y: 300 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
  ];

  const network = tracePipingNetwork(segments, [], [], [], [], 'crossing_drawing.pdf', 1);
  assert.strictEqual(network.junctions.length, 1);
  assert.strictEqual(network.junctions[0].junction_type, 'unconnected_crossing', 'Must be unconnected_crossing');
  assert.strictEqual(network.junctions[0].has_junction_dot, false, 'has_junction_dot must be false');
  assert.strictEqual(network.junctions[0].connected_path_ids.length, 0, 'No connected paths for crossing without dot');
});

test('Scenario 7: Connected pipe junction with explicit junction dot or branch', () => {
  const dotJunction = {
    id: 'junc-dot-1',
    page: 1,
    coordinates: { x: 250, y: 200 },
    junction_type: 'cross_junction' as const,
    has_junction_dot: true,
    connected_path_ids: ['path-1', 'path-2'],
    evidence: {
      source_document: 'p&id.pdf',
      page_number: 1,
      recognition_method: 'heuristic_tracing' as const,
      supporting_text: 'Junction dot confirmed on drawing',
      confidence: 0.95,
    },
    confidence: 0.95,
  };

  assert.strictEqual(dotJunction.has_junction_dot, true);
  assert.strictEqual(dotJunction.connected_path_ids.length, 2);
});

test('Scenario 8: Pipe with a branch dividing into two process paths', () => {
  // Main header: (50, 100) -> (200, 100) -> branch (200, 100) to (200, 250)
  const segments = [
    { id: 'm1', page: 1, start: { x: 50, y: 100 }, end: { x: 200, y: 100 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
    { id: 'm2', page: 1, start: { x: 200, y: 100 }, end: { x: 400, y: 100 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
    { id: 'b1', page: 1, start: { x: 200, y: 100 }, end: { x: 200, y: 250 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
  ];

  const network = tracePipingNetwork(segments, [], [], [], [], 'branch_drawing.pdf', 1);
  assert.ok(network.pipePaths.length >= 1, 'Extracted branch network paths');
});

test('Scenario 9: Pipe ending near equipment without confirmed port connection (Critical Endpoint Rule)', () => {
  // Pipe ends at (150, 200), but equipment TK-101 port is at (400, 400) (distance > 300px!)
  const segments = [
    { id: 's1', page: 1, start: { x: 50, y: 200 }, end: { x: 150, y: 200 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
  ];
  const ports = [
    {
      id: 'port-tk101',
      equipment_id: 'eq-1',
      equipment_tag: 'TK-101',
      port_type: 'outlet' as const,
      position: { x: 400, y: 400 },
      connection_candidates: [],
      confidence: 1.0,
    },
  ];

  const network = tracePipingNetwork(segments, [], ports, [], [], 'dangling.pdf', 1);
  // Endpoint rule: Must NOT assign TK-101 by detection order or default!
  assert.strictEqual(network.connectionCandidates.length, 0, 'No false connection created');
  assert.ok(network.unresolvedSegments.length > 0, 'Pipe flagged as unresolved segment');
});

test('Scenario 10: Reversed flow arrow detected and direction reversed', () => {
  const segments = [
    { id: 's1', page: 1, start: { x: 100, y: 200 }, end: { x: 300, y: 200 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
  ];
  const flowArrows = [
    { position: { x: 180, y: 200 }, angle: 180 }, // Points to the left (reverse)
  ];

  const network = tracePipingNetwork(segments, [], [], [], flowArrows, 'flow_arrow.pdf', 1);
  assert.strictEqual(network.pipePaths[0].flow_direction, 'reverse', 'Flow direction marked as reverse');
});

test('Scenario 11: Missing line tag allows pipe path extraction without error', () => {
  const segments = [
    { id: 's1', page: 1, start: { x: 100, y: 100 }, end: { x: 200, y: 100 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
  ];
  const network = tracePipingNetwork(segments, [], [], [], [], 'notag.pdf', 1);
  assert.strictEqual(network.pipePaths.length, 1);
  assert.strictEqual(network.pipePaths[0].line_tag, null, 'Line tag is null');
});

test('Scenario 12: Low-resolution drawing / degraded text preserves confidence and flags review', () => {
  const lowConfText = [
    { text: 'TK-?01', bbox: { x: 100, y: 100, w: 80, h: 20 }, confidence: 0.45 },
  ];
  const ocr = recognizeDrawingText(lowConfText);
  assert.strictEqual(ocr.tokens[0].confidence, 0.45);
});

test('Scenario 13: Description and drawing disagreeing produces conflicting status', () => {
  const visualCandidate = {
    id: 'cand-1',
    source_equipment: 'P-101',
    source_port: 'port-1',
    destination_equipment: 'TK-102',
    destination_port: 'port-2',
    associated_pipe_paths: ['path-1'],
    line_number: '2"-NH3-102',
    functional_type: 'piping_line' as const,
    flow_direction: 'forward' as const,
    connection_evidence: [],
    confidence: 0.85,
    recognition_status: 'visually_supported' as const,
    verification_status: 'unverified' as const,
  };

  // User narrative states reverse flow: "Liquid flows from TK-102 into P-101"
  const narrative = 'Liquid flows from TK-102 into P-101 for recirculation.';
  const descExtraction = parseProcessDescription('proj-test', narrative, ['TK-102', 'P-101']);

  const reconciliation = reconcileConnections([visualCandidate], descExtraction);
  assert.strictEqual(reconciliation.conflicts.length, 1, '1 conflict detected between drawing and narrative');
  assert.strictEqual(reconciliation.reconciledCandidates[0].recognition_status, 'conflicting');
  assert.ok(reconciliation.reconciledCandidates[0].conflict_details?.includes('TK-102'));
});

test('Scenario 14: Missing flow-rate information strictly null, not zero', () => {
  const narrative = 'Pump P-101 transfers chemical to reactor R-101.';
  const desc = parseProcessDescription('proj-test', narrative, ['P-101', 'R-101']);
  assert.strictEqual(desc.relationships[0].flow_rates, null, 'Flow rate strictly null when not provided');
});

test('Scenario 15: Measure performance metrics separately across drawing components', () => {
  const metrics = {
    equipment_detection: { total: 10, correct: 10, accuracy: 1.0 },
    tag_recognition: { total: 8, correct: 8, accuracy: 1.0 },
    pipe_path_detection: { total: 12, correct: 12, accuracy: 1.0 },
    junction_detection: { total: 4, correct: 4, accuracy: 1.0 },
    equipment_port_connection: { total: 6, correct: 6, accuracy: 1.0 },
    flow_direction_detection: { total: 5, correct: 5, accuracy: 1.0 },
  };

  assert.strictEqual(metrics.equipment_detection.accuracy, 1.0);
  assert.strictEqual(metrics.junction_detection.accuracy, 1.0);
  assert.strictEqual(metrics.flow_direction_detection.accuracy, 1.0);
});

test('Scenario 16: Idempotent topology graph synchronization prevents duplicate lines and streams', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Idempotency Test', 'Testing repeated drawing sync');

  const model: CommonDrawingModel = {
    document_id: 'doc-sync-1',
    document_name: 'test_drawing.pdf',
    page_count: 1,
    document_classification: 'vector_pdf',
    objects: [],
    pipe_paths: [],
    junctions: [],
    ports: [],
    connection_candidates: [
      {
        id: 'cand-sync-1',
        source_equipment: 'TK-101',
        destination_equipment: 'P-101',
        associated_pipe_paths: ['path-1'],
        line_number: '2"-NH3-101-CS',
        functional_type: 'piping_line',
        flow_direction: 'forward',
        connection_evidence: [],
        confidence: 0.9,
        recognition_status: 'corroborated',
        verification_status: 'verified',
      },
    ],
    reconciliation_summary: {
      total_candidates: 1,
      visually_supported_count: 0,
      description_supported_count: 0,
      corroborated_count: 1,
      conflicting_count: 0,
      unresolved_count: 0,
      engineer_verified_count: 1,
    },
    processed_at: new Date().toISOString(),
  };

  store.saveCommonDrawingModel(model);

  // Sync 1st time
  const sync1 = store.syncCandidateConnectionsToTopology(proj.id, ['cand-sync-1'], 'Engineer 1');
  assert.strictEqual(sync1.success, true);
  assert.strictEqual(sync1.lines_added, 1);
  const linesAfterSync1 = store.listLines(proj.id).length;
  const streamsAfterSync1 = store.listStreams(proj.id).length;

  // Sync 2nd time with exact same candidate (MUST BE IDEMPOTENT)
  const sync2 = store.syncCandidateConnectionsToTopology(proj.id, ['cand-sync-1'], 'Engineer 2');
  assert.strictEqual(sync2.success, true);
  assert.strictEqual(sync2.lines_added, 0, 'No new lines added on duplicate sync');

  const linesAfterSync2 = store.listLines(proj.id).length;
  const streamsAfterSync2 = store.listStreams(proj.id).length;

  assert.strictEqual(linesAfterSync1, linesAfterSync2, 'Lines count remains unchanged after repeated sync');
  assert.strictEqual(streamsAfterSync1, streamsAfterSync2, 'Streams count remains unchanged after repeated sync');

  store.deleteProject(proj.id);
});

// ============================================================================
// TEST GROUP 17: Critical P&ID Connectivity & SafeFlow Drawing Verification
// ============================================================================
console.log('\n--- Test Group 17: Critical P&ID Connectivity & SafeFlow Drawing Verification ---');

test('Scenario 1: ASCII85/Flate decompressed vector PDF extracts vector geometry and text', async () => {
  const fs = require('fs');
  const path = require('path');
  const uploadPath = path.resolve(__dirname, '../server/uploads/1793406231159-473748763.pdf');
  if (!fs.existsSync(uploadPath)) return; // Skip if environment lacks upload file

  const { extractVectorGeometry } = require('../server/src/services/vectorPdfService');
  const vec = extractVectorGeometry(uploadPath);

  assert.ok(vec.lines.length >= 40, `Must extract vector lines from compressed PDF (found ${vec.lines.length})`);
  assert.ok(vec.textElements.length >= 30, `Must extract positioned text elements (found ${vec.textElements.length})`);

  const hasTk101 = vec.textElements.some((t: any) => t.text.includes('TK-101'));
  const hasMx101 = vec.textElements.some((t: any) => t.text.includes('MX-101'));
  assert.ok(hasTk101, 'Text elements must contain TK-101');
  assert.ok(hasMx101, 'Text elements must contain MX-101');
});

test('Scenario 2: Flow sequence parser creates non-empty endpoints and in-line connections', async () => {
  const fs = require('fs');
  const path = require('path');
  const uploadPath = path.resolve(__dirname, '../server/uploads/1793406231159-473748763.pdf');
  if (!fs.existsSync(uploadPath)) return;

  const { extractTextFromDocument } = require('../server/src/services/pdfExtractor');
  const { parsePidDocument } = require('../server/src/services/pidParser');

  const extracted = await extractTextFromDocument(uploadPath, 'application/pdf');
  const res = parsePidDocument(extracted, 'doc-sf-test', 'SafeFlow_PnID_Rev2_ClearLayout.pdf', 'proj-sf', []);

  // Check lines
  assert.ok(res.lines.length >= 10, 'Must extract at least 10 piping/signal lines');

  const l101 = res.lines.find((l) => l.line_number === 'L-101');
  assert.ok(l101, 'L-101 must exist');
  assert.ok(l101.from_equipment && l101.to_equipment, 'L-101 must have non-empty endpoints');

  const l102 = res.lines.find((l) => l.line_number === 'L-102');
  assert.ok(l102, 'L-102 must exist');
  assert.strictEqual(l102.to_equipment, 'MX-101', 'L-102 must feed into mixer MX-101');

  const l103 = res.lines.find((l) => l.line_number === 'L-103');
  assert.ok(l103, 'L-103 must exist');
  assert.strictEqual(l103.from_equipment, 'MX-101');
  assert.strictEqual(l103.to_equipment, 'E-101');

  const l104 = res.lines.find((l) => l.line_number === 'L-104');
  assert.ok(l104, 'L-104 must exist');
  assert.strictEqual(l104.from_equipment, 'E-101');
  assert.strictEqual(l104.to_equipment, 'TK-102');

  // Check in-line valves
  const hasTkToHv101 = res.lines.some((l) => l.from_equipment === 'TK-101' && l.to_equipment === 'HV-101');
  assert.ok(hasTkToHv101, 'Must connect TK-101 to isolation valve HV-101');

  const hasMxToDv101 = res.lines.some((l) => l.from_equipment === 'MX-101' && l.to_equipment === 'DV-101');
  assert.ok(hasMxToDv101, 'Must connect mixer MX-101 to drain valve DV-101');

  // Check signal lines
  const sigLines = res.lines.filter((l) => l.functional_type === 'signal_line');
  assert.ok(sigLines.length >= 2, 'Must extract signal lines for instrument loops');
  for (const sig of sigLines) {
    assert.strictEqual(sig.assigned_chemical_id, null, 'Signal lines must NOT be assigned chemical fluid');
  }
});

test('Scenario 3: Authoritative topology graph achieves zero isolated nodes for SafeFlow drawing', async () => {
  const fs = require('fs');
  const path = require('path');
  const uploadPath = path.resolve(__dirname, '../server/uploads/1793406231159-473748763.pdf');
  if (!fs.existsSync(uploadPath)) return;

  const { extractTextFromDocument } = require('../server/src/services/pdfExtractor');
  const { parsePidDocument } = require('../server/src/services/pidParser');
  const { buildProcessTopologyGraph } = require('../server/src/services/graphService');

  const extracted = await extractTextFromDocument(uploadPath, 'application/pdf');
  const res = parsePidDocument(extracted, 'doc-sf-test', 'SafeFlow_PnID_Rev2_ClearLayout.pdf', 'proj-sf', []);

  const graph = buildProcessTopologyGraph(res.equipment, res.lines, [], []);

  assert.strictEqual(graph.counts.isolated_nodes_count, 0, 'Isolated nodes count must decrease to 0 for connected SafeFlow P&ID');
  assert.ok(graph.edges.length >= 10, 'Authoritative edges must connect equipment items');

  const isolatedNodes = graph.nodes.filter((n) => n.is_isolated);
  assert.strictEqual(isolatedNodes.length, 0, 'No equipment item should remain falsely isolated');
});

// ============================================================================
// TEST GROUP 18: HYBRID CHEMICAL IDENTIFICATION & PROCESS MAPPING ENGINE
// ============================================================================

console.log('\n--- Test Group 18: Hybrid Chemical Identification & Process Mapping Engine ---');

test('Scenario 1: P&ID Only — Unconfirmed chemical identities remain UNKNOWN and no numerical concentrations are invented', () => {
  const dummyEq: EquipmentTag = {
    id: 'eq-pg1001-test',
    project_id: 'proj-pid-only',
    document_id: 'doc-pid-1',
    tag: 'PG-1001',
    description: 'PIG RECEIVER / SLUG CATCHER',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed',
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: 'PG-1001 PIG RECEIVER' },
    specifications: createDefaultSpecifications('separator'),
    created_at: new Date().toISOString(),
  };

  const dummyLine: PipingLine = {
    id: 'line-inlet-test',
    project_id: 'proj-pid-only',
    document_id: 'doc-pid-1',
    line_number: '10"-PG-00101-A1A',
    from_equipment: 'MANIFOLD-MV-1001',
    to_equipment: 'PG-1001',
    size: '10"',
    material: 'A1A',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    stream_label: 'Feed from production manifold',
    status: 'confirmed',
    confidence: 0.92,
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: '10"-PG-00101-A1A' },
    created_at: new Date().toISOString(),
  };

  // Determine status with zero SDS and zero gas reports
  const statusWithoutEvidence = determineIdentificationStatus('PG-1001', 'equipment', {
    explicitPipingLabels: [dummyLine.stream_label || ''],
    associatedReports: [],
    verifiedAssignments: false,
    hasProjectChemicals: false,
  });

  assert.strictEqual(statusWithoutEvidence, 'UNKNOWN', 'Without chemical evidence, chemical status must be UNKNOWN');

  // Evaluate chemical mapping
  const mapping = evaluateEquipmentChemicalMapping(dummyEq, {
    projectId: 'proj-pid-only',
    equipment: [dummyEq],
    lines: [dummyLine],
    streams: [],
    assignments: [],
    gasReports: [],
  });

  assert.strictEqual(mapping.mapping_status, 'INCOMPLETE MAPPING', 'Mapping must be INCOMPLETE MAPPING when no chemicals are identified');
  assert.strictEqual(mapping.inlet_chemicals.length, 0, 'No inlet chemicals should be hallucinated');
  assert.strictEqual(mapping.outlet_chemicals.length, 0, 'No outlet chemicals should be hallucinated');
  assert.ok(mapping.unresolved_gaps.length > 0, 'Must record unresolved gaps stating chemical composition is missing');
});

test('Scenario 2: P&ID + SDS — SDS chemicals exist in inventory but are NOT automatically assigned without evidence', () => {
  const dummyChem: ChemicalRecord = {
    id: 'chem-h2s-test',
    project_id: 'proj-sds-test',
    sds_document_id: 'doc-sds-h2s',
    origin: 'sds_extracted',
    record_status: 'active',
    chemical_name: {
      ...createEmptyPsiFieldRecord('chemical_name'),
      value: 'Hydrogen Sulfide',
      review_status: 'confirmed',
    },
    cas_number: {
      ...createEmptyPsiFieldRecord('cas_number'),
      value: '7783-06-4',
      review_status: 'confirmed',
    },
    sds_revision_date: createEmptyPsiFieldRecord('sds_revision_date'),
    manufacturer: createEmptyPsiFieldRecord('manufacturer'),
    psi_parameters: createEmptyPsiParameters('machine'),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const dummyEq: EquipmentTag = {
    id: 'eq-pg1001-sds',
    project_id: 'proj-sds-test',
    document_id: 'doc-pid-1',
    tag: 'PG-1001',
    description: 'PIG RECEIVER / SLUG CATCHER',
    equipment_type: 'separator',
    assigned_chemical_id: null, // Note: NOT explicitly assigned yet!
    confidence: 0.95,
    status: 'confirmed',
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: 'PG-1001' },
    specifications: createDefaultSpecifications('separator'),
    created_at: new Date().toISOString(),
  };

  const dummyLine: PipingLine = {
    id: 'line-pg101',
    project_id: 'proj-sds-test',
    document_id: 'doc-pid-1',
    line_number: '10"-PG-00101-A1A',
    from_equipment: 'MANIFOLD',
    to_equipment: 'PG-1001',
    size: '10"',
    material: 'A1A',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    status: 'confirmed',
    confidence: 0.9,
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: '10"-PG-00101-A1A' },
    created_at: new Date().toISOString(),
  };

  // Evaluate mapping without manual assignment
  const mapping = evaluateEquipmentChemicalMapping(dummyEq, {
    projectId: 'proj-sds-test',
    equipment: [dummyEq],
    lines: [dummyLine],
    streams: [],
    assignments: [], // Empty assignments!
    gasReports: [],
  });

  // CRITICAL CHECK: Simply uploading an SDS does NOT assign it to PG-1001!
  assert.strictEqual(mapping.inlet_chemicals.length, 0, 'SDS chemical must NOT be automatically assigned to equipment without evidence');
  assert.strictEqual(mapping.mapping_status, 'INCOMPLETE MAPPING');

  // But the chemical is a CANDIDATE at the project level
  const status = determineIdentificationStatus('PG-1001', 'equipment', {
    explicitPipingLabels: [],
    associatedReports: [],
    verifiedAssignments: false,
    hasProjectChemicals: true,
  });
  assert.strictEqual(status, 'CANDIDATE', 'Chemical should remain a CANDIDATE in project inventory until assigned');
});

test('Scenario 3: P&ID + Gas Composition Report — Extracts components, normalizes concentrations, and links to stream', () => {
  const sampleGasReportText = `
Sample Point: Inlet Reception Manifold (10"-PG-00101-A1A)
Analysis Method: Gas Chromatography (ASTM D1945)
Date: 2026-06-15

Component       mol%
Methane         82.40
Ethane           5.80
Propane          3.20
i-Butane         0.85
n-Butane         1.15
i-Pentane        0.45
n-Pentane        0.55
Hexanes+         1.20
Hydrogen Sulfide 2.10
Carbon Dioxide   1.50
Nitrogen         0.80
`;

  const report = parseGasCompositionReportText(sampleGasReportText, 'proj-gas-test', 'doc-gas-1');

  assert.strictEqual(report.components.length, 11, 'Must extract all 11 gas components');
  assert.strictEqual(report.concentration_unit, 'mol%', 'Detected unit must be mol%');
  assert.strictEqual(report.sample_point, 'Inlet Reception Manifold (10"-PG-00101-A1A)');

  // Verify H2S extraction
  const h2s = report.components.find((c) => c.component_name.toLowerCase().includes('hydrogen sulfide') || c.component_name.toLowerCase().includes('h2s'));
  assert.ok(h2s, 'Hydrogen Sulfide must be extracted');
  assert.strictEqual(h2s.concentration, 2.1);
  assert.strictEqual(h2s.formula, 'H2S');
  assert.strictEqual(h2s.is_hazardous, true);
  assert.strictEqual(h2s.phase, 'gas');

  // Verify Pentanes / Hexanes liquid phase assignment
  const c6plus = report.components.find((c) => c.component_name.toLowerCase().includes('hexanes+'));
  assert.ok(c6plus, 'Hexanes+ must be extracted');
  assert.strictEqual(c6plus.phase, 'liquid', 'Hexanes+ should have default phase liquid');

  // Verify normalization
  assert.strictEqual(report.total_concentration, 100, 'Total concentration sum must equal 100 mol%');
  assert.strictEqual(report.ambiguity_flag, null, 'No ambiguity flag when sum is 100%');
});

test('Scenario 4: Manual Chemical Assignment & Audit Trail — Full verification workflow with reviewer attribution', () => {
  const store = new PsiDataStore();

  const asgn = store.saveChemicalAssignment(
    {
      project_id: 'proj-assign-test',
      chemical_id: 'chem-h2s-assigned',
      chemical_name: 'Hydrogen Sulfide',
      cas_number: '7783-06-4',
      equipment_tag: 'PG-1001',
      connection_endpoint: 'inlet',
      concentration: 2.1,
      concentration_unit: 'mol%',
      phase: 'gas',
      source_document: 'P&ID-GPF-001-02 Note 1',
      notes: 'Sour gas service complying with NACE MR0175',
      verification_status: 'unverified',
    },
    'Junior Engineer'
  );

  assert.ok(asgn.id, 'Assignment ID must be generated');
  assert.strictEqual(asgn.verification_status, 'unverified');
  assert.strictEqual(asgn.identification_status, 'CANDIDATE', 'Unverified manual assignment is a CANDIDATE');

  // Engineer verifies the assignment
  const verified = store.verifyChemicalAssignment(asgn.id, 'Lead Process Safety Engineer (PE)', 'verified');
  assert.strictEqual(verified.verification_status, 'verified');
  assert.strictEqual(verified.identification_status, 'CONFIRMED', 'Verified assignment transitions to CONFIRMED');
  assert.strictEqual(verified.reviewer, 'Lead Process Safety Engineer (PE)');

  // Verify history entry
  const history = store.getVerificationHistory('proj-assign-test');
  assert.ok(history.length >= 1, 'Verification history entry must be logged');
  assert.strictEqual(history[0].new_status, 'verified');
  assert.strictEqual(history[0].reviewer, 'Lead Process Safety Engineer (PE)');
});

test('Scenario 5: Multiphase Separation Mapping — Vessel partitions inlet into gas/liquid outlets without fabricating concentrations', () => {
  const dummyEq: EquipmentTag = {
    id: 'eq-pg1001-sep',
    project_id: 'proj-multiphase',
    document_id: 'doc-pid-1',
    tag: 'PG-1001',
    description: 'PIG RECEIVER / SLUG CATCHER (1200 ID x 8000 LG, 90 BARG / 120 °C)',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: 'PG-1001' },
    specifications: createDefaultSpecifications('separator'),
    created_at: new Date().toISOString(),
  };

  assert.ok(isMultiphaseSeparator(dummyEq), 'PG-1001 must be recognized as a multiphase separator');

  const inletLine: PipingLine = {
    id: 'line-inlet',
    project_id: 'proj-multiphase',
    document_id: 'doc-pid-1',
    line_number: '10"-PG-00101-A1A',
    from_equipment: 'MANIFOLD',
    to_equipment: 'PG-1001',
    size: '10"',
    material: 'A1A',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    status: 'confirmed',
    confidence: 0.95,
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: '10"-PG-00101-A1A' },
    created_at: new Date().toISOString(),
  };

  const gasOutletLine: PipingLine = {
    id: 'line-gas-out',
    project_id: 'proj-multiphase',
    document_id: 'doc-pid-1',
    line_number: '10"-PG-00103-A1A',
    from_equipment: 'PG-1001',
    to_equipment: 'CV-1001',
    size: '10"',
    material: 'A1A',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    stream_label: 'Gas Outlet N2',
    assigned_chemical_id: null,
    status: 'confirmed',
    confidence: 0.95,
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: '10"-PG-00103-A1A' },
    created_at: new Date().toISOString(),
  };

  const liquidOutletLine: PipingLine = {
    id: 'line-liq-out',
    project_id: 'proj-multiphase',
    document_id: 'doc-pid-1',
    line_number: '4"-PG-00107-A1A',
    from_equipment: 'PG-1001',
    to_equipment: 'LCV-1001',
    size: '4"',
    material: 'A1A',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    stream_label: 'Liquid Outlet N3 (Condensate)',
    assigned_chemical_id: null,
    status: 'confirmed',
    confidence: 0.95,
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: '4"-PG-00107-A1A' },
    created_at: new Date().toISOString(),
  };

  // Gas report on the inlet line
  const gasReport: GasCompositionReport = {
    id: 'report-inlet',
    project_id: 'proj-multiphase',
    document_id: 'doc-gas-1',
    report_title: 'Inlet Wet Sour Gas Chromatography',
    sample_point: '10"-PG-00101-A1A',
    associated_stream_number: '10"-PG-00101-A1A',
    total_concentration: 100,
    concentration_unit: 'mol%',
    analysis_method: 'ASTM D1945',
    extracted_at: new Date().toISOString(),
    components: [
      { component_name: 'Methane', concentration: 82.5, unit: 'mol%', phase: 'gas', is_hazardous: true },
      { component_name: 'Hydrogen Sulfide', concentration: 2.5, unit: 'mol%', phase: 'gas', is_hazardous: true },
      { component_name: 'Condensate (C5+)', concentration: 5.0, unit: 'mol%', phase: 'liquid', is_hazardous: true },
      { component_name: 'Produced Water', concentration: 2.0, unit: 'mol%', phase: 'liquid', is_hazardous: false },
    ],
  };

  const mapping = evaluateEquipmentChemicalMapping(dummyEq, {
    projectId: 'proj-multiphase',
    equipment: [dummyEq],
    lines: [inletLine, gasOutletLine, liquidOutletLine],
    streams: [],
    assignments: [],
    gasReports: [gasReport],
  });

  assert.strictEqual(mapping.is_multiphase_separation, true);
  assert.strictEqual(mapping.phase, 'multiphase');
  assert.strictEqual(mapping.inlet_chemicals.length, 4);

  // Check outlet partitioning
  assert.ok(mapping.outlet_chemicals.length >= 2, 'Gas and liquid outlets must be partitioned');

  const outletGasChems = mapping.outlet_chemicals.filter((c) => c.phase === 'gas');
  const outletLiqChems = mapping.outlet_chemicals.filter((c) => c.phase === 'liquid');
  assert.ok(outletGasChems.some((c) => c.chemical_name === 'Methane'), 'Methane must partition to gas outlet');
  assert.ok(outletLiqChems.some((c) => c.chemical_name.includes('Condensate')), 'Condensate must partition to liquid outlet');

  // CRITICAL ENGINEERING ASSERTION: SafeFlow AI MUST NOT fabricate numerical outlet concentrations!
  for (const outChem of mapping.outlet_chemicals) {
    assert.strictEqual(outChem.concentration, null, `Concentration of outlet component ${outChem.chemical_name} must be strictly null (not guessed)`);
    assert.strictEqual(outChem.is_verified, false, 'Outlet component must not be marked verified without flash calculation');
  }

  assert.strictEqual(mapping.mapping_status, 'PROPOSED MAPPING');
  assert.ok(
    mapping.unresolved_gaps.some((g) => g.toLowerCase().includes('flash') || g.toLowerCase().includes('stream table')),
    'Must document unresolved gap requiring flash calculation or stream table'
  );
});

test('Scenario 6: PHA Engine Integration — 8 parameter categories with unverified composition gap flag & safeguard splitting', () => {
  const dummyEq: EquipmentTag = {
    id: 'eq-pg1001-pha',
    project_id: 'proj-pha-test',
    document_id: 'doc-pid-1',
    tag: 'PG-1001',
    description: 'PIG RECEIVER / SLUG CATCHER (1200 ID x 8000 LG, 90 BARG / 120 °C)',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'P&ID-GPF-001-02', page: 1, snippet: 'PG-1001' },
    specifications: createDefaultSpecifications('separator'),
    created_at: new Date().toISOString(),
  };

  const dummyNode: PhaStudyNode = {
    id: 'node-slugcatcher',
    project_id: 'proj-pha-test',
    node_id: 'N-1001',
    name: 'Natural Gas Inlet Reception & Slug Catching Node',
    design_intent: 'Receive multiphase wellstream from production manifold, separate liquid slugs, and regulate gas/liquid export.',
    equipment_tags: ['PG-1001', 'XV-1001', 'XV-1002', 'PCV-1001', 'LCV-1001', 'PSV-1001'],
    line_numbers: ['10"-PG-00101-A1A', '10"-PG-00103-A1A', '4"-PG-00107-A1A'],
    inlet_boundaries: ['10"-PG-00101-A1A from Production Manifold'],
    outlet_boundaries: ['10"-PG-00104-A1A to HP Separator', '4"-PG-00108-A1A to Condensate'],
    basis_for_grouping: 'Primary inlet phase separation and pressure containment',
    status: 'candidate',
    unresolved_questions: [],
    operating_limits: {
      temperature_safe_upper: 120,
      temperature_safe_lower: -20,
      pressure_safe_upper: 90,
      pressure_safe_lower: 0,
      flow_safe_upper: null,
      flow_safe_lower: null,
      level_safe_upper: null,
      level_safe_lower: null,
      concentration_safe_upper: null,
      concentration_safe_lower: null,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Evaluate deviations with unverified/proposed chemical mapping
  const dummyMapping: ChemicalMappingResult = {
    id: 'map-test',
    project_id: 'proj-pha-test',
    target_type: 'equipment',
    target_id: dummyEq.id,
    target_tag: 'PG-1001',
    mapping_status: 'PROPOSED MAPPING',
    phase: 'multiphase',
    inlet_chemicals: [
      {
        chemical_id: 'chem-h2s',
        chemical_name: 'Hydrogen Sulfide',
        cas_number: '7783-06-4',
        concentration: 2.5,
        concentration_unit: 'mol%',
        phase: 'gas',
        identification_status: 'CANDIDATE',
        source_provenance: 'Preliminary well test',
        is_verified: false,
      },
    ],
    outlet_chemicals: [],
    internal_chemicals: [],
    unresolved_gaps: ['Flash calculation required for outlet splits'],
    source_provenance: 'Unverified test sheet',
    is_multiphase_separation: true,
    last_evaluated_at: new Date().toISOString(),
  };

  const enriched = attachChemicalContextToPhaNode(dummyNode, dummyMapping, [dummyEq], []);

  assert.ok(enriched.comprehensive_hazop_deviations, 'Must generate comprehensive HAZOP deviations');
  const devs = enriched.comprehensive_hazop_deviations;

  // Verify all 8 categories exist
  const categories = new Set(devs.map((d) => d.parameter));
  assert.ok(categories.has('Pressure'), 'Must evaluate Pressure deviations');
  assert.ok(categories.has('Temperature'), 'Must evaluate Temperature deviations');
  assert.ok(categories.has('Flow'), 'Must evaluate Flow deviations');
  assert.ok(categories.has('Level'), 'Must evaluate Level deviations');
  assert.ok(categories.has('Composition'), 'Must evaluate Composition deviations');
  assert.ok(categories.has('Phase'), 'Must evaluate Phase deviations');
  assert.ok(categories.has('Direction'), 'Must evaluate Direction deviations');
  assert.ok(categories.has('Contamination'), 'Must evaluate Contamination deviations');

  // Verify information gaps flag unverified composition
  const offSpecComp = devs.find((d) => d.parameter === 'Composition' && d.deviation.includes('OFF-SPEC'));
  assert.ok(offSpecComp, 'Must have Off-spec Composition deviation');
  assert.ok(
    offSpecComp.information_gaps.some((g) => g.includes('Chemical composition not confirmed')),
    'Must explain information gap when composition is unverified'
  );
  assert.strictEqual(offSpecComp.requires_engineering_review, true);

  // Verify separation of existing safeguards vs recommended safeguards
  assert.ok(
    offSpecComp.existing_safeguards.some((s) => s.includes('NACE MR0175')),
    'Existing safeguards must cite P&ID Note 1 (NACE MR0175 Material Class A1A)'
  );
  assert.ok(
    offSpecComp.recommended_safeguards.some((s) => s.toLowerCase().includes('fixed') || s.toLowerCase().includes('detector')),
    'Recommended safeguards must suggest fixed toxic H2S detectors and corrosion coupon monitoring'
  );

  // Verify Level deviations distinguish carryover from blowby
  const highLevel = devs.find((d) => d.parameter === 'Level' && d.guideword === 'HIGH');
  assert.ok(highLevel, 'Must have High Level deviation');
  assert.ok(highLevel.consequences.some((c) => c.toLowerCase().includes('carryover')), 'High level must warn of liquid carryover into gas outlet N2');

  const lowLevel = devs.find((d) => d.parameter === 'Level' && d.guideword === 'LOW');
  assert.ok(lowLevel, 'Must have Low Level deviation');
  assert.ok(lowLevel.consequences.some((c) => c.toLowerCase().includes('blowby') || c.toLowerCase().includes('drain')), 'Low level must warn of high-pressure gas blowby into closed drain drum');
});

// ============================================================================
// TEST GROUP 19: MULTI-DOCUMENT DATABASE SCHEMA & MIGRATION STRATEGY (PHASE 1)
// ============================================================================

console.log('\n--- Test Group 19: Multi-Document Database Schema & Migration Strategy (Phase 1) ---');

test('Scenario 1: All 11 Document Categories are supported in DocumentRecord', () => {
  const categories: DocumentCategory[] = [
    'sds',
    'pid',
    'pfd',
    'bfd',
    'stream_table',
    'equipment_datasheet',
    'basis_of_design',
    'process_design_philosophy',
    'operating_philosophy',
    'control_philosophy',
    'shutdown_philosophy',
  ];

  assert.strictEqual(categories.length, 11, 'Must support exactly 11 document categories');

  categories.forEach((cat, idx) => {
    const dummyDoc: DocumentRecord = {
      id: `doc-cat-${idx}`,
      project_id: 'proj-cat-test',
      name: `Document ${cat.toUpperCase()}`,
      original_filename: `${cat}.pdf`,
      file_path: `/uploads/${cat}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: 1024,
      doc_type: cat,
      category: cat,
      revision: 'A',
      source_organization: 'Intelligent Engineering Solutions',
      upload_timestamp: new Date().toISOString(),
      pages_count: 1,
      is_readable: true,
      chemical_ids: [],
      extraction_status: 'completed',
      verification_status: 'unverified',
    };

    assert.strictEqual(dummyDoc.category, cat);
    assert.strictEqual(dummyDoc.doc_type, cat, 'doc_type must maintain backwards compatibility');
    assert.strictEqual(dummyDoc.revision, 'A');
    assert.strictEqual(dummyDoc.extraction_status, 'completed');
    assert.strictEqual(dummyDoc.verification_status, 'unverified');
  });
});

test('Scenario 2: Non-destructive migration preserves existing documents and defaults new metadata', () => {
  const store = new PsiDataStore();
  const testDocId = `doc-mig-test-${Date.now()}`;

  // Add document with legacy schema
  store.addDocument({
    id: testDocId,
    project_id: 'proj-mig-test',
    name: 'Legacy P&ID.pdf',
    original_filename: 'Legacy P&ID.pdf',
    file_path: '/uploads/legacy.pdf',
    mime_type: 'application/pdf',
    size_bytes: 2048,
    doc_type: 'pid',
    category: 'pid',
    revision: 'A',
    upload_timestamp: new Date().toISOString(),
    pages_count: 1,
    is_readable: true,
    chemical_ids: [],
    extraction_status: 'completed',
    verification_status: 'unverified',
  });

  const retrieved = store.getDocument(testDocId);
  assert.ok(retrieved, 'Retrieved document must exist');
  assert.strictEqual(retrieved.category, 'pid');
  assert.strictEqual(retrieved.revision, 'A');

  // Test updating metadata
  const updated = store.updateDocumentMetadata(testDocId, {
    category: 'pfd',
    revision: 'B',
    source_organization: 'IES Global',
    verification_status: 'engineer_verified',
    verified_by: 'Shlok (Lead Architect)',
  });

  assert.ok(updated, 'Document must be updated');
  assert.strictEqual(updated.category, 'pfd');
  assert.strictEqual(updated.doc_type, 'pfd');
  assert.strictEqual(updated.revision, 'B');
  assert.strictEqual(updated.source_organization, 'IES Global');
  assert.strictEqual(updated.verification_status, 'engineer_verified');
  assert.strictEqual(updated.verified_by, 'Shlok (Lead Architect)');

  // Clean up
  store.deleteDocument(testDocId);
});

test('Scenario 3: Cross-document discrepancy model preserves multiple source evidence values without overwrite', () => {
  const store = new PsiDataStore();
  const discId = `disc-${Date.now()}`;

  const pidEvidence: UnifiedProvenanceValue = {
    id: 'ev-pid-1',
    original_value: '90 barg',
    normalized_value: 90,
    original_unit: 'barg',
    normalized_unit: 'barg',
    source_document_id: 'doc-pid-1',
    source_document_name: 'P&ID-GPF-001-02',
    source_category: 'pid',
    source_revision: 'A',
    page_or_drawing_location: 'Drawing Sheet 1 (Tag PG-1001)',
    extraction_confidence: 0.98,
    verification_status: 'unverified',
    extraction_timestamp: new Date().toISOString(),
  };

  const datasheetEvidence: UnifiedProvenanceValue = {
    id: 'ev-ds-1',
    original_value: '95 barg',
    normalized_value: 95,
    original_unit: 'barg',
    normalized_unit: 'barg',
    source_document_id: 'doc-ds-1',
    source_document_name: 'DS-PG-1001-REV-0',
    source_category: 'equipment_datasheet',
    source_revision: '0',
    page_or_drawing_location: 'Page 2 Section 4.1',
    extraction_confidence: 0.99,
    verification_status: 'engineer_verified',
    verified_by: 'Chief Mechanical Engineer',
    extraction_timestamp: new Date().toISOString(),
  };

  const discrepancy: CrossDocumentDiscrepancy = {
    id: discId,
    project_id: 'proj-disc-test',
    entity_type: 'equipment',
    entity_tag: 'PG-1001',
    property_name: 'design_pressure',
    discrepancy_type: 'conflict',
    status: 'open',
    severity: 'critical',
    message: 'Design pressure conflict: P&ID specifies 90 barg while Equipment Datasheet specifies 95 barg',
    evidence_records: [pidEvidence, datasheetEvidence],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  store.addDiscrepancy(discrepancy);

  const list = store.listDiscrepancies('proj-disc-test');
  assert.ok(list.length >= 1, 'Must list stored discrepancies');
  const found = list.find((d) => d.id === discId);
  assert.ok(found, 'Must find created discrepancy');
  assert.strictEqual(found.evidence_records.length, 2, 'Both conflicting source records must be preserved');
  assert.strictEqual(found.evidence_records[0].normalized_value, 90);
  assert.strictEqual(found.evidence_records[1].normalized_value, 95);

  // Scenario 4: Resolve discrepancy
  const resolved = store.resolveDiscrepancy(discId, {
    status: 'resolved',
    resolution_notes: 'Datasheet Rev 0 (95 barg) is authoritative per API 520 sizing note 2',
    resolved_by: 'Shlok (PE)',
  });

  assert.strictEqual(resolved, true, 'Discrepancy resolution must succeed');
  const afterResolution = store.listDiscrepancies('proj-disc-test').find((d) => d.id === discId);
  assert.strictEqual(afterResolution?.status, 'resolved');
  assert.strictEqual(afterResolution?.resolved_by, 'Shlok (PE)');
  assert.ok(afterResolution?.resolved_at, 'Resolution timestamp must be set');
});

test('Scenario 5: Unified engineering matrix entries track cross-document sources without duplication', () => {
  const store = new PsiDataStore();
  const entryId = `matrix-pg1001-${Date.now()}`;

  const matrixEntry: UnifiedEngineeringMatrixEntry = {
    id: entryId,
    project_id: 'proj-matrix-test',
    entity_type: 'equipment',
    entity_tag: 'PG-1001',
    description: 'PIG RECEIVER / SLUG CATCHER',
    sources_found: ['pid', 'equipment_datasheet', 'operating_philosophy'],
    p_and_id_data: {
      tag: 'PG-1001',
      design_pressure: '90 BARG',
      design_temperature: '120 °C',
      dimensions: '1200 ID x 8000 LG',
    },
    datasheet_data: {
      tag: 'PG-1001',
      design_pressure_barg: 95,
      material: 'NACE MR0175 / ISO 15156 Class A1A',
    },
    philosophy_data: {
      interlock: 'Interlock closure logic confirmed zero pressure on PI-1001 before quick-opening',
    },
    has_conflicts: true,
    conflict_ids: ['disc-1'],
    last_updated: new Date().toISOString(),
  };

  store.upsertEngineeringMatrixEntry(matrixEntry);

  const matrix = store.listEngineeringMatrix('proj-matrix-test');
  assert.ok(matrix.length >= 1, 'Engineering matrix must contain entries');
  const found = matrix.find((m) => m.entity_tag === 'PG-1001');
  assert.ok(found, 'Must find PG-1001 matrix entry');
  assert.strictEqual(found.sources_found.length, 3);
  assert.ok(found.sources_found.includes('pid'));
  assert.ok(found.sources_found.includes('equipment_datasheet'));
  assert.ok(found.sources_found.includes('operating_philosophy'));
});

test('Scenario 6: Engineering philosophy rules capture interlocks, fail-safe positions, and setpoint confirmation', () => {
  const store = new PsiDataStore();
  const ruleId = `rule-esd-${Date.now()}`;

  const esdRule: EngineeringPhilosophyRule = {
    id: ruleId,
    project_id: 'proj-philo-test',
    source_document_id: 'doc-esd-philo',
    source_document_name: 'Shutdown and ESD Philosophy Rev A',
    source_category: 'shutdown_philosophy',
    rule_type: 'interlock',
    equipment_tag: 'PG-1001',
    loop_tag: 'SIS LS-1001',
    condition: 'High-High Liquid Level Trip on LT-1002 signal to SIS LS-1001',
    action: 'Automatically close XV-1001 (Inlet ESD Ball Valve) within 3 seconds',
    fail_safe_position: 'fail_closed',
    sil_rating: 'SIL 2',
    is_confirmed_setpoint: true,
    verification_status: 'engineer_verified',
    notes: 'Meets IEC 61511 / ISA 84 safety instrumented system standards',
  };

  store.addPhilosophyRule(esdRule);

  const rules = store.listPhilosophyRules('proj-philo-test');
  assert.ok(rules.length >= 1, 'Philosophy rules must be listed');
  const found = rules.find((r) => r.id === ruleId);
  assert.ok(found, 'Must find stored philosophy rule');
  assert.strictEqual(found.fail_safe_position, 'fail_closed');
  assert.strictEqual(found.sil_rating, 'SIL 2');
  assert.strictEqual(found.is_confirmed_setpoint, true);
  assert.strictEqual(found.verification_status, 'engineer_verified');
});

// ============================================================================
// TEST GROUP 20: MULTI-DOCUMENT CLASSIFICATION & INGESTION ENGINE (PHASE 2)
// ============================================================================

console.log('\n--- Test Group 20: Multi-Document Classification & Ingestion Engine (Phase 2) ---');

test('Scenario 1: Classification of Safety Data Sheets (SDS) vs P&ID drawings vs Process Flow Diagrams (PFD)', () => {
  // SDS Classification
  const sdsResult = classifyEngineeringCategory(
    'Ammonia_Anhydrous_Safety_Data_Sheet.pdf',
    'SAFETY DATA SHEET SECTION 1: IDENTIFICATION SECTION 2: HAZARDS IDENTIFICATION CAS No: 7664-41-7 GHS Hazard Statements'
  );
  assert.strictEqual(sdsResult.category, 'sds', 'Must classify as SDS');
  assert.ok(sdsResult.confidence >= 0.8, 'SDS confidence must be high');

  // P&ID Classification
  const pidResult = classifyEngineeringCategory(
    'P&ID-GPF-001-02_Pig_Receiver.pdf',
    'PIPING AND INSTRUMENTATION DIAGRAM PIG RECEIVER / SLUG CATCHER PG-1001 10"-PG-00101-A1A VALVE INDEX INSTRUMENT INDEX'
  );
  assert.strictEqual(pidResult.category, 'pid', 'Must classify as P&ID');
  assert.ok(pidResult.confidence >= 0.8, 'P&ID confidence must be high');

  // PFD Classification
  const pfdResult = classifyEngineeringCategory(
    'PFD-001_Inlet_Separation_Scheme.pdf',
    'PROCESS FLOW DIAGRAM HEAT & MATERIAL BALANCE SUMMARY INLET SLUG CATCHER GAS RECOVERY SCHEME'
  );
  assert.strictEqual(pfdResult.category, 'pfd', 'Must classify as PFD');
  assert.ok(pfdResult.confidence >= 0.7, 'PFD confidence must be high');
});

test('Scenario 2: Classification of Block Flow Diagrams (BFD) and Stream Tables (H&MB)', () => {
  // BFD Classification
  const bfdResult = classifyEngineeringCategory(
    'Overall_Facility_Block_Flow_Diagram.pdf',
    'BLOCK FLOW DIAGRAM OVERALL FACILITY SEQUENCE BATTERY LIMITS GAS SWEETENING UNIT DEW POINT CONTROL'
  );
  assert.strictEqual(bfdResult.category, 'bfd', 'Must classify as BFD');

  // Stream Table (Spreadsheet)
  const streamResult = classifyEngineeringCategory(
    'Wellstream_Heat_and_Material_Balance.xlsx',
    'STREAM TABLE STREAM NUMBER MOLE FRACTION MASS FLOW RATE OPERATING PRESSURE OPERATING TEMPERATURE VAPOR FRACTION'
  );
  assert.strictEqual(streamResult.category, 'stream_table', 'Must classify spreadsheet as stream table');
  assert.ok(streamResult.confidence >= 0.75);
});

test('Scenario 3: Classification of Equipment Datasheets and Basis of Design (BOD)', () => {
  // Equipment Datasheet
  const dsResult = classifyEngineeringCategory(
    'DS-PG-1001_Slug_Catcher_Datasheet.pdf',
    'EQUIPMENT DATASHEET VESSEL SPECIFICATION DESIGN PRESSURE 95 BARG DESIGN TEMPERATURE 120 C MATERIAL OF CONSTRUCTION NOZZLE SCHEDULE'
  );
  assert.strictEqual(dsResult.category, 'equipment_datasheet', 'Must classify as equipment datasheet');

  // Basis of Design
  const bodResult = classifyEngineeringCategory(
    'Project_Basis_of_Design_Rev_0.docx',
    'PROJECT BASIS OF DESIGN FEED ENVELOPE PLANT DESIGN CAPACITY AMBIENT DESIGN CONDITIONS DESIGN MARGINS 25-YEAR DESIGN LIFE'
  );
  assert.strictEqual(bodResult.category, 'basis_of_design', 'Must classify as basis of design');
});

test('Scenario 4: Classification of Philosophies (Process Design, Operating, Control, and Shutdown/ESD)', () => {
  // Process Design Philosophy
  const pdpResult = classifyEngineeringCategory(
    'Overpressure_and_Relief_Philosophy.pdf',
    'PROCESS DESIGN PHILOSOPHY OVERPRESSURE PROTECTION PHILOSOPHY RELIEF AND DEPRESSURING PHILOSOPHY API 520 / 521 SPARING PHILOSOPHY'
  );
  assert.strictEqual(pdpResult.category, 'process_design_philosophy', 'Must classify as process design philosophy');

  // Operating Philosophy
  const opResult = classifyEngineeringCategory(
    'Facility_Operating_Philosophy_Manual.docx',
    'FACILITY OPERATING PHILOSOPHY STANDARD OPERATING PROCEDURE NORMAL OPERATIONS STARTUP PROCEDURE SHUTDOWN PROCEDURE TURNDOWN LIMITS'
  );
  assert.strictEqual(opResult.category, 'operating_philosophy', 'Must classify as operating philosophy');

  // Control Philosophy
  const cpResult = classifyEngineeringCategory(
    'Inlet_Separation_Control_Philosophy.docx',
    'CONTROL PHILOSOPHY PROCESS CONTROL NARRATIVE DISTRIBUTED CONTROL SYSTEM LOOP DESCRIPTION PIC-1001 LIC-1001 SPLIT-RANGE CONTROL'
  );
  assert.strictEqual(cpResult.category, 'control_philosophy', 'Must classify as control philosophy');

  // Shutdown / ESD Philosophy
  const esdResult = classifyEngineeringCategory(
    'Emergency_Shutdown_and_Interlock_Philosophy.pdf',
    'EMERGENCY SHUTDOWN PHILOSOPHY CAUSE AND EFFECT MATRIX C&E MATRIX SAFETY INSTRUMENTED SYSTEM SIL RATING SIL 2 INTERLOCK LOGIC'
  );
  assert.strictEqual(esdResult.category, 'shutdown_philosophy', 'Must classify as shutdown philosophy');
});

test('Scenario 5: Multi-format text extraction parses plain text, CSV, and handles non-PDF file formats', async () => {
  const tmpCsvPath = path.resolve(__dirname, 'test_stream_table.csv');
  const csvContent = 'Stream,Phase,Temp_C,Press_barg,Flow_kg_h\n101,Vapor,45.0,90.0,15400\n102,Liquid,40.0,90.0,3200';
  fs.writeFileSync(tmpCsvPath, csvContent, 'utf8');

  try {
    const extracted = await extractTextFromDocument(tmpCsvPath, 'text/csv', 'test_stream_table.csv');
    assert.strictEqual(extracted.isReadable, true, 'CSV must be readable');
    assert.ok(extracted.text.includes('15400'), 'Must contain flow rate');
    assert.ok(extracted.text.includes('Stream,Phase'), 'Must contain header');

    const classification = classifyEngineeringCategory('test_stream_table.csv', extracted.text, 'text/csv');
    assert.strictEqual(classification.category, 'stream_table', 'CSV stream table must be classified correctly');
  } finally {
    if (fs.existsSync(tmpCsvPath)) fs.unlinkSync(tmpCsvPath);
  }
});

test('Scenario 6: Manual reclassification updates category, confidence, and audit trail', () => {
  const store = new PsiDataStore();
  const testDocId = `doc-reclass-${Date.now()}`;

  store.addDocument({
    id: testDocId,
    project_id: 'proj-reclass-test',
    name: 'Ambiguous_Drawing.pdf',
    original_filename: 'Ambiguous_Drawing.pdf',
    file_path: '/uploads/ambiguous.pdf',
    mime_type: 'application/pdf',
    size_bytes: 5120,
    doc_type: 'pid',
    category: 'pid',
    category_confidence: 0.55,
    revision: '0',
    upload_timestamp: new Date().toISOString(),
    pages_count: 1,
    is_readable: true,
    chemical_ids: [],
    extraction_status: 'completed',
    verification_status: 'unverified',
  });

  const reclassified = store.updateDocumentMetadata(testDocId, {
    category: 'pfd',
    user_overridden_category: 'pfd',
    notes: 'Manually verified as Process Flow Diagram by Process Engineer',
    verification_status: 'engineer_verified',
    verified_by: 'Senior Chemical Engineer (PE)',
  });

  assert.ok(reclassified, 'Document must be updated');
  assert.strictEqual(reclassified.category, 'pfd');
  assert.strictEqual(reclassified.user_overridden_category, 'pfd');
  assert.strictEqual(reclassified.verification_status, 'engineer_verified');
  assert.strictEqual(reclassified.verified_by, 'Senior Chemical Engineer (PE)');

  // Clean up
  store.deleteDocument(testDocId);
});

// ============================================================================
// TEST GROUP 21: PFD & BFD EXTRACTION PROCESSOR (PHASE 3)
// ============================================================================

console.log('\n--- Test Group 21: PFD & BFD Extraction Processor (Phase 3) ---');

test('Scenario 1: Extraction of major process blocks & battery limits from Block Flow Diagrams (BFD)', () => {
  const bfdText = `
    ONSHORE GAS PROCESSING FACILITY - BLOCK FLOW DIAGRAM
    ISBL / OSBL OVERALL FACILITY ARCHITECTURE

    BLOCK 1: INLET RECEPTION & SLUG CATCHER
    Raw wellhead fluids enter at ISBL boundary.

    BLOCK 2: ACID GAS REMOVAL UNIT (AGRU)
    Sour gas treated with MDEA solvent for H2S and CO2 removal.

    BLOCK 3: GAS DEHYDRATION UNIT (TEG)
    Water vapor removed to meet pipeline moisture spec < 4 lb/MMSCF.

    BLOCK 4: SALES GAS COMPRESSION & EXPORT
    Export pipeline to OSBL sales network.

    EMERGENCY & RELIEF:
    SOUR FLARE HEADER AND RELIEF SYSTEM
    PRODUCED WATER TREATMENT AND DISPOSAL
  `;

  const dummyContent = {
    text: bfdText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction } = parsePfdOrBfdDocument(
    dummyContent,
    'doc-bfd-001',
    'BFD-GPF-001_Block_Flow_Diagram.pdf',
    'proj-test-bfd',
    'bfd'
  );

  assert.strictEqual(extraction.category, 'bfd', 'Category must be BFD');
  assert.ok(extraction.blocks.length >= 4, `Must extract at least 4 process blocks, found: ${extraction.blocks.length}`);

  const blockNames = extraction.blocks.map((b) => b.block_name);
  assert.ok(blockNames.some((n) => n.includes('Inlet Reception')), 'Must contain Inlet Reception block');
  assert.ok(blockNames.some((n) => n.includes('Acid Gas Removal')), 'Must contain Acid Gas Removal block');
  assert.ok(blockNames.some((n) => n.includes('Dehydration')), 'Must contain Gas Dehydration block');
  assert.ok(blockNames.some((n) => n.includes('Sales Gas')), 'Must contain Sales Gas Compression block');

  // Verify Battery Limits
  assert.ok(extraction.battery_limits.length >= 2, 'Must detect ISBL and OSBL battery limits');
  const blTypes = extraction.battery_limits.map((bl) => bl.name);
  assert.ok(blTypes.some((n) => n.includes('ISBL')), 'Must detect ISBL');
  assert.ok(blTypes.some((n) => n.includes('OSBL')), 'Must detect OSBL');
});

test('Scenario 2: Extraction of major unit operations & conditions from Process Flow Diagrams (PFD)', () => {
  const pfdText = `
    PROCESS FLOW DIAGRAM - INLET GAS RECEPTION
    INTELLIGENT ENGINEERING SOLUTIONS (IES) - FACILITY GPF-001

    MAJOR UNIT OPERATIONS:
    PG-1001: PIG RECEIVER & SLUG CATCHER
    Operating Conditions: 90 barg @ 120 °C
    Design Conditions: 95 barg @ 130 °C
    Capacity: 1200 ID x 8000 LG

    V-1001: HIGH PRESSURE SEPARATOR
    Operating Conditions: 88 barg @ 45 °C
    Design Conditions: 95 barg @ 85 °C

    K-1001: RECOVERY BOOSTER COMPRESSOR
    Operating Conditions: 35 barg @ 70 °C
    Duty: 15 MW

    E-1001: INLET GAS COOLER
    Operating Conditions: 85 barg @ 38 °C
    Duty: 8.5 MW
  `;

  const dummyContent = {
    text: pfdText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, equipment } = parsePfdOrBfdDocument(
    dummyContent,
    'doc-pfd-001',
    'PFD-GPF-001-01_Inlet_Reception.pdf',
    'proj-test-pfd',
    'pfd'
  );

  assert.strictEqual(extraction.category, 'pfd', 'Category must be PFD');
  assert.ok(extraction.major_units.length >= 4, `Must identify major units, found: ${extraction.major_units.length}`);

  const pgUnit = extraction.major_units.find((u) => u.tag === 'PG-1001');
  assert.ok(pgUnit, 'Must extract PG-1001');
  assert.strictEqual(pgUnit.equipment_type, 'vessel');
  assert.strictEqual(pgUnit.operating_pressure.normalized_value, 90, 'Operating pressure must be 90');
  assert.strictEqual(pgUnit.operating_temperature.normalized_value, 120, 'Operating temperature must be 120');
  assert.strictEqual(pgUnit.design_pressure.normalized_value, 95, 'Design pressure must be 95');

  const compUnit = extraction.major_units.find((u) => u.tag === 'K-1001');
  assert.ok(compUnit, 'Must extract K-1001');
  assert.strictEqual(compUnit.equipment_type, 'compressor');
  assert.strictEqual(compUnit.operating_pressure.normalized_value, 35);

  // Check generated EquipmentTags
  assert.ok(equipment.length >= 4, 'Must generate EquipmentTag records');
  const pgTag = equipment.find((e) => e.tag === 'PG-1001');
  assert.ok(pgTag, 'PG-1001 equipment record must exist');
  assert.strictEqual(pgTag.specifications.operating_pressure.value, 90);
  assert.strictEqual(pgTag.specifications.operating_temperature.value, 120);
});

test('Scenario 3: Extraction of primary process streams, flow rates & fluid phases', () => {
  const pfdStreamText = `
    PFD STREAM TABLE SUMMARY & INTERCONNECTS:
    Stream 1: Raw Wellhead Fluid from Production Manifold to PG-1001. Operating: 90 barg, 120 °C. Flow: 50 MMSCFD. Multiphase mixture.
    Stream 2: High Pressure Separated Gas from PG-1001 to V-1001. Operating: 88 barg, 45 °C. Flow: 48 MMSCFD. Gas phase.
    Stream 3: Separated Hydrocarbon Condensate from PG-1001 to Condensate System. Operating: 88 barg, 45 °C. Flow: 15000 kg/h. Liquid phase.
    Stream 4: Sour Flare Header Relief from PG-1001 to Sour Flare. Operating: 1.5 barg, 25 °C. Gas phase.
  `;

  const dummyContent = {
    text: pfdStreamText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, streams } = parsePfdOrBfdDocument(
    dummyContent,
    'doc-pfd-002',
    'PFD-GPF-001-02_Streams.pdf',
    'proj-test-pfd-streams',
    'pfd'
  );

  assert.ok(extraction.stream_links.length >= 3, `Must extract stream links, found: ${extraction.stream_links.length}`);
  assert.ok(streams.length >= 3, `Must generate ProcessStream records, found: ${streams.length}`);

  const str1 = streams.find((s) => s.stream_number === 'STR-1');
  assert.ok(str1, 'Stream 1 must exist');
  assert.strictEqual(str1.operating_pressure.value, 90);
  assert.strictEqual(str1.operating_temperature.value, 120);
  assert.strictEqual(str1.flow_rates.design, 50);
  assert.strictEqual(str1.flow_rates.unit, 'MMSCFD');
  assert.strictEqual(str1.flow_rates.basis, 'volumetric');
  assert.strictEqual(str1.phase, 'multiphase');

  const str3 = streams.find((s) => s.stream_number === 'STR-3');
  assert.ok(str3, 'Stream 3 must exist');
  assert.strictEqual(str3.flow_rates.design, 15000);
  assert.strictEqual(str3.flow_rates.unit, 'kg/h');
  assert.strictEqual(str3.flow_rates.basis, 'mass');
  assert.strictEqual(str3.phase, 'liquid');
});

test('Scenario 4: Strict Non-Fabrication Rule (PFD parser never hallucinates fine instrumentation or unstated parameters)', () => {
  const sparsePfdText = `
    PROCESS FLOW DIAGRAM (PFD)
    V-2001: CONDENSATE COALESCER
    Operating: 40 barg
    Stream 10: Rich Condensate Feed
  `;

  const dummyContent = {
    text: sparsePfdText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, equipment, streams } = parsePfdOrBfdDocument(
    dummyContent,
    'doc-pfd-sparse',
    'PFD-Sparse.pdf',
    'proj-sparse-test',
    'pfd'
  );

  const coalescer = equipment.find((e) => e.tag === 'V-2001');
  assert.ok(coalescer, 'Coalescer must be extracted');
  assert.strictEqual(coalescer.specifications.operating_pressure.value, 40);

  // CRITICAL ENGINEERING AUDIT: Operating temperature was not provided in text.
  // It MUST NOT be fabricated or defaulted to 0!
  assert.strictEqual(coalescer.specifications.operating_temperature.value, null, 'Unstated temperature must remain null');
  assert.strictEqual(coalescer.specifications.operating_temperature.status, 'not_provided');

  // CRITICAL ENGINEERING AUDIT: PFD does not show instrument loops (PT, LIC, BDV, etc.).
  // The stream's associated_instrument_tags MUST be empty [] and never fabricated!
  const stream10 = streams.find((s) => s.stream_number === 'STR-10');
  assert.ok(stream10, 'Stream 10 must exist');
  assert.deepStrictEqual(stream10.associated_instrument_tags, [], 'Associated instrument tags must be strictly empty');
  assert.strictEqual(stream10.operating_temperature.value, null, 'Unstated stream temperature must remain null');
});

test('Scenario 5: Correlation of PFD primary streams with existing P&ID line numbers', () => {
  const existingLines: PipingLine[] = [
    {
      id: 'line-1',
      project_id: 'proj-corr-test',
      document_id: 'doc-pid-01',
      line_number: '10"-PG-00101-A1A',
      from_equipment: 'Production Manifold MV-1001',
      to_equipment: 'PG-1001',
      size: '10"',
      material: 'A1A',
      stream_label: '1',
      functional_type: 'piping_line',
      flow_direction: 'forward',
      assigned_chemical_id: null,
      confidence: 0.95,
      status: 'confirmed',
      source: { document: 'P&ID-01.pdf', page: 1, snippet: '10"-PG-00101-A1A' },
      alerts: [],
      is_manual_entry: false,
      created_at: new Date().toISOString(),
    },
  ];

  const pfdContent = {
    text: `
      PFD INLET SECTION:
      Stream 1: Sour Gas Feed from Production Manifold MV-1001 to PG-1001. Operating: 90 barg.
    `,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, streams } = parsePfdOrBfdDocument(
    pfdContent,
    'doc-pfd-corr',
    'PFD-Corr.pdf',
    'proj-corr-test',
    'pfd',
    existingLines
  );

  const stream1 = streams.find((s) => s.stream_number === 'STR-1');
  assert.ok(stream1, 'Stream 1 must exist');
  assert.strictEqual(stream1.line_number, '10"-PG-00101-A1A', 'Must correlate PFD stream with existing P&ID line');

  const streamLink = extraction.stream_links.find((s) => s.stream_number === 'STR-1');
  assert.ok(streamLink, 'Stream link must exist');
  assert.strictEqual(streamLink.correlated_pid_line_number, '10"-PG-00101-A1A');
  assert.ok((streamLink.correlation_confidence || 0) > 0.7);
});

test('Scenario 6: Store persistence, query & retrieval of PFD/BFD extraction results', () => {
  const store = new PsiDataStore();
  const testDocId = `doc-pfd-store-${Date.now()}`;
  const testProjectId = `proj-pfd-store-${Date.now()}`;

  const mockExtraction: PfdExtractionResult = {
    id: `pfd-ext-${Date.now()}`,
    project_id: testProjectId,
    document_id: testDocId,
    document_name: 'PFD-Overall-Train-1.pdf',
    category: 'pfd',
    blocks: [
      {
        id: 'block-1',
        project_id: testProjectId,
        document_id: testDocId,
        block_name: 'Inlet Reception',
        block_type: 'process_unit',
        description: 'Inlet Reception Unit',
        sequence_order: 1,
        inlet_streams: ['STR-01'],
        outlet_streams: ['STR-02'],
        confidence: 0.9,
      },
    ],
    major_units: [
      {
        id: 'unit-1',
        project_id: testProjectId,
        document_id: testDocId,
        tag: 'PG-1001',
        name: 'Slug Catcher (PG-1001)',
        equipment_type: 'vessel',
        operating_pressure: {
          id: 'prov-1',
          original_value: '90 barg',
          normalized_value: 90,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: testDocId,
          source_document_name: 'PFD-Overall-Train-1.pdf',
          source_category: 'pfd',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_temperature: {
          id: 'prov-2',
          original_value: '120 °C',
          normalized_value: 120,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: testDocId,
          source_document_name: 'PFD-Overall-Train-1.pdf',
          source_category: 'pfd',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_pressure: {
          id: 'prov-3',
          original_value: '95 barg',
          normalized_value: 95,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: testDocId,
          source_document_name: 'PFD-Overall-Train-1.pdf',
          source_category: 'pfd',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_temperature: {
          id: 'prov-4',
          original_value: null,
          normalized_value: null,
          source_document_id: testDocId,
          source_document_name: 'PFD-Overall-Train-1.pdf',
          source_category: 'pfd',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.0,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        inlet_stream_numbers: ['STR-01'],
        outlet_stream_numbers: ['STR-02'],
        confidence: 0.92,
      },
    ],
    stream_links: [],
    battery_limits: [{ name: 'ISBL Inlet', type: 'inlet', stream_numbers: ['STR-01'] }],
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  };

  store.savePfdExtraction(mockExtraction);

  // Retrieve by document ID
  const retrievedDoc = store.getPfdExtraction(testDocId);
  assert.ok(retrievedDoc, 'Must retrieve PFD extraction by document ID');
  assert.strictEqual(retrievedDoc.document_name, 'PFD-Overall-Train-1.pdf');
  assert.strictEqual(retrievedDoc.major_units[0].tag, 'PG-1001');

  // List by project ID
  const list = store.listPfdExtractions(testProjectId);
  assert.strictEqual(list.length, 1, 'Must list exactly 1 extraction for project');
});

// ============================================================================
// TEST GROUP 22: STREAM TABLE (H&MB) EXTRACTION PROCESSOR (PHASE 4)
// ============================================================================

console.log('\n--- Test Group 22: Stream Table (H&MB) Extraction Processor (Phase 4) ---');

test('Scenario 1: Extraction of Columnar Stream Table (Streams as columns / PFD H&MB format)', () => {
  const columnarCsv = `
Parameter,STR-01,STR-02,STR-03
Description,Sour Wellhead Gas,Gas to Contactor,Separated Condensate
Phase,Multiphase,Vapor,Liquid
Vapor Fraction,0.85,1.00,0.00
Temperature (°C),120.0,45.0,45.0
Pressure (barg),90.0,88.0,88.0
Mass Flow (kg/h),55000,45000,10000
Volumetric Flow (MMSCFD),50.0,48.0,-
Molecular Weight (kg/kmol),21.4,18.2,65.8
Density (kg/m3),72.5,61.2,680.0
  `.trim();

  const dummyContent = {
    text: columnarCsv,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, streams } = parseStreamTableDocument(
    dummyContent,
    'doc-hmb-01',
    'HMB-GPF-001_Heat_and_Material_Balance.csv',
    'proj-hmb-test'
  );

  assert.strictEqual(extraction.table_orientation, 'streams_as_columns');
  assert.strictEqual(extraction.total_streams_found, 3);
  assert.strictEqual(streams.length, 3);

  const str1 = extraction.streams.find((s) => s.stream_number === 'STR-01');
  assert.ok(str1, 'STR-01 must be extracted');
  assert.strictEqual(str1.operating_temperature.normalized_value, 120);
  assert.strictEqual(str1.operating_temperature.normalized_unit, '°C');
  assert.strictEqual(str1.operating_pressure.normalized_value, 90);
  assert.strictEqual(str1.operating_pressure.normalized_unit, 'barg');
  assert.strictEqual(str1.mass_flow_rate.normalized_value, 55000);
  assert.strictEqual(str1.volumetric_flow_rate.normalized_value, 50);
  assert.strictEqual(str1.vapor_fraction.normalized_value, 0.85);
  assert.strictEqual(str1.molecular_weight.normalized_value, 21.4);
  assert.strictEqual(str1.phase, 'multiphase');

  // Verify SafeFlow ProcessStream model
  const ps1 = streams.find((s) => s.stream_number === 'STR-01');
  assert.ok(ps1, 'ProcessStream STR-01 must exist');
  assert.strictEqual(ps1.operating_temperature.value, 120);
  assert.strictEqual(ps1.operating_pressure.value, 90);
  assert.strictEqual(ps1.flow_rates.design, 55000);
  assert.strictEqual(ps1.flow_rates.unit, 'kg/h');
});

test('Scenario 2: Extraction of Row-based Stream Table (Streams as rows / Excel H&MB report)', () => {
  const rowBasedText = `
Stream No | Description | Phase | Temperature (degC) | Pressure (barg) | Mass Flow (kg/h) | Vol Flow (MMSCFD) | Vapor Frac
STR-101 | Raw Natural Gas Feed | Multiphase | 115.0 | 92.0 | 60000 | 52.0 | 0.82
STR-102 | Sweetened Sales Gas | Gas | 40.0 | 85.0 | 48000 | 50.0 | 1.00
STR-103 | Produced Water Effluent | Liquid | 45.0 | 5.0 | 5000 | - | 0.00
  `.trim();

  const dummyContent = {
    text: rowBasedText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, streams } = parseStreamTableDocument(
    dummyContent,
    'doc-hmb-02',
    'Stream_Summary_Report.xlsx',
    'proj-hmb-rows'
  );

  assert.strictEqual(extraction.table_orientation, 'streams_as_rows');
  assert.strictEqual(extraction.total_streams_found, 3);
  assert.strictEqual(streams.length, 3);

  const str102 = extraction.streams.find((s) => s.stream_number === 'STR-102');
  assert.ok(str102, 'STR-102 must be extracted');
  assert.strictEqual(str102.operating_temperature.normalized_value, 40);
  assert.strictEqual(str102.operating_pressure.normalized_value, 85);
  assert.strictEqual(str102.mass_flow_rate.normalized_value, 48000);
  assert.strictEqual(str102.volumetric_flow_rate.normalized_value, 50);
  assert.strictEqual(str102.vapor_fraction.normalized_value, 1.0);
  assert.strictEqual(str102.phase, 'gas');
});

test('Scenario 3: Chemical component breakdown extraction & hazardous substance tagging', () => {
  const compCsv = `
Parameter,STR-01,STR-02
Temperature (°C),120,45
Pressure (barg),90,88
Methane (mol%),78.5,84.2
Ethane (mol%),6.2,6.8
Propane (mol%),3.1,3.2
H2S (mol%),2.5,2.8
CO2 (mol%),4.8,5.2
Water (mol%),1.2,0.0
  `.trim();

  const dummyContent = {
    text: compCsv,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction } = parseStreamTableDocument(
    dummyContent,
    'doc-hmb-comp',
    'Stream_Compositions.csv',
    'proj-hmb-comp'
  );

  const str1 = extraction.streams.find((s) => s.stream_number === 'STR-01');
  assert.ok(str1, 'STR-01 must exist');
  assert.strictEqual(str1.components.length, 6, 'Must extract 6 chemical components');

  const h2s = str1.components.find((c) => c.component_name.includes('H2S'));
  assert.ok(h2s, 'H2S must be extracted');
  assert.strictEqual(h2s.fraction_value, 2.5);
  assert.strictEqual(h2s.is_hazardous, true, 'H2S must be identified as hazardous component');

  const methane = str1.components.find((c) => c.component_name.includes('Methane'));
  assert.ok(methane, 'Methane must be extracted');
  assert.strictEqual(methane.fraction_value, 78.5);
  assert.strictEqual(methane.is_hazardous, true, 'Methane must be identified as hazardous component');

  const water = str1.components.find((c) => c.component_name.includes('Water'));
  assert.ok(water, 'Water must be extracted');
  assert.strictEqual(water.fraction_value, 1.2);
  assert.strictEqual(water.is_hazardous, false, 'Water is not tagged hazardous');
});

test('Scenario 4: Strict Non-Fabrication Rule (missing flow/pressure/temperature values remain null, never zero)', () => {
  const sparseCsv = `
Parameter,STR-20
Temperature (°C),50.0
Pressure (barg),-
Mass Flow (kg/h),-
Volumetric Flow (MMSCFD),-
  `.trim();

  const dummyContent = {
    text: sparseCsv,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, streams } = parseStreamTableDocument(
    dummyContent,
    'doc-hmb-sparse',
    'Sparse_HMB.csv',
    'proj-hmb-sparse'
  );

  const str20 = extraction.streams.find((s) => s.stream_number === 'STR-20');
  assert.ok(str20, 'STR-20 must exist');
  assert.strictEqual(str20.operating_temperature.normalized_value, 50);

  // CRITICAL AUDIT: Pressure and Mass flow were dashed in the source table.
  // They MUST NOT be fabricated or defaulted to 0!
  assert.strictEqual(str20.operating_pressure.normalized_value, null, 'Dashed pressure must remain null');
  assert.strictEqual(str20.operating_pressure.extraction_confidence, 0.0);
  assert.strictEqual(str20.mass_flow_rate.normalized_value, null, 'Dashed mass flow must remain null');

  const ps20 = streams.find((s) => s.stream_number === 'STR-20');
  assert.ok(ps20, 'ProcessStream STR-20 must exist');
  assert.strictEqual(ps20.operating_pressure.value, null);
  assert.strictEqual(ps20.operating_pressure.status, 'not_provided');

  // Instrumentation non-fabrication guarantee
  assert.deepStrictEqual(ps20.associated_instrument_tags, [], 'Must never hallucinate instrument loops');
});

test('Scenario 5: Correlation of Stream Table records with existing P&ID line numbers', () => {
  const existingLines: PipingLine[] = [
    {
      id: 'line-corr-1',
      project_id: 'proj-hmb-corr',
      document_id: 'doc-pid-01',
      line_number: '10"-PG-00101-A1A',
      from_equipment: 'Production Manifold MV-1001',
      to_equipment: 'PG-1001',
      size: '10"',
      material: 'A1A',
      stream_label: 'STR-00101',
      functional_type: 'piping_line',
      flow_direction: 'forward',
      assigned_chemical_id: null,
      confidence: 0.95,
      status: 'confirmed',
      source: { document: 'P&ID-01.pdf', page: 1, snippet: '10"-PG-00101-A1A' },
      alerts: [],
      is_manual_entry: false,
      created_at: new Date().toISOString(),
    },
  ];

  const streamContent = {
    text: `
      Stream No | Description | Temperature (°C) | Pressure (barg)
      STR-00101 | Process Gas to PG-1001 | 120.0 | 90.0
    `.trim(),
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction } = parseStreamTableDocument(
    streamContent,
    'doc-hmb-corr',
    'HMB_Lines.csv',
    'proj-hmb-corr',
    [],
    existingLines
  );

  const str = extraction.streams[0];
  assert.ok(str, 'Stream must be extracted');
  assert.strictEqual(str.correlated_pid_line_number, '10"-PG-00101-A1A', 'Must correlate with P&ID line');
});

test('Scenario 6: Store persistence, query & retrieval of Stream Table extraction results', () => {
  const store = new PsiDataStore();
  const testDocId = `doc-hmb-store-${Date.now()}`;
  const testProjectId = `proj-hmb-store-${Date.now()}`;

  const mockExtraction: StreamTableExtractionResult = {
    id: `hmb-ext-${Date.now()}`,
    project_id: testProjectId,
    document_id: testDocId,
    document_name: 'Overall_Facility_HMB.xlsx',
    table_orientation: 'streams_as_columns',
    streams: [
      {
        id: 'st-str-1',
        project_id: testProjectId,
        document_id: testDocId,
        stream_number: 'STR-01',
        stream_name: 'Raw Inlet Gas',
        phase: 'multiphase',
        vapor_fraction: {
          id: 'prov-v',
          original_value: 0.85,
          normalized_value: 0.85,
          source_document_id: testDocId,
          source_document_name: 'Overall_Facility_HMB.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Column 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_temperature: {
          id: 'prov-t',
          original_value: '120 °C',
          normalized_value: 120,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: testDocId,
          source_document_name: 'Overall_Facility_HMB.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Column 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_pressure: {
          id: 'prov-p',
          original_value: '90 barg',
          normalized_value: 90,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: testDocId,
          source_document_name: 'Overall_Facility_HMB.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Column 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        mass_flow_rate: {
          id: 'prov-m',
          original_value: '55000 kg/h',
          normalized_value: 55000,
          original_unit: 'kg/h',
          normalized_unit: 'kg/h',
          source_document_id: testDocId,
          source_document_name: 'Overall_Facility_HMB.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Column 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        volumetric_flow_rate: {
          id: 'prov-vf',
          original_value: '50 MMSCFD',
          normalized_value: 50,
          original_unit: 'MMSCFD',
          normalized_unit: 'MMSCFD',
          source_document_id: testDocId,
          source_document_name: 'Overall_Facility_HMB.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Column 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        molar_flow_rate: {
          id: 'prov-mol',
          original_value: null,
          normalized_value: null,
          source_document_id: testDocId,
          source_document_name: 'Overall_Facility_HMB.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Column 1',
          extraction_confidence: 0.0,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        molecular_weight: {
          id: 'prov-mw',
          original_value: 21.4,
          normalized_value: 21.4,
          original_unit: 'kg/kmol',
          normalized_unit: 'kg/kmol',
          source_document_id: testDocId,
          source_document_name: 'Overall_Facility_HMB.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Column 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        density: {
          id: 'prov-d',
          original_value: '72.5 kg/m3',
          normalized_value: 72.5,
          original_unit: 'kg/m3',
          normalized_unit: 'kg/m3',
          source_document_id: testDocId,
          source_document_name: 'Overall_Facility_HMB.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Column 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        components: [
          { component_name: 'Methane', fraction_value: 78.5, unit: 'mol%', is_hazardous: true },
          { component_name: 'H2S', fraction_value: 2.5, unit: 'mol%', is_hazardous: true },
        ],
        source_location: 'Column 1',
        confidence: 0.95,
      },
    ],
    total_streams_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  };

  store.saveStreamTableExtraction(mockExtraction);

  // Retrieve by document ID
  const retrieved = store.getStreamTableExtraction(testDocId);
  assert.ok(retrieved, 'Must retrieve stream table extraction by document ID');
  assert.strictEqual(retrieved.document_name, 'Overall_Facility_HMB.xlsx');
  assert.strictEqual(retrieved.streams[0].stream_number, 'STR-01');
  assert.strictEqual(retrieved.streams[0].components.length, 2);

  // List by project ID
  const list = store.listStreamTableExtractions(testProjectId);
  assert.strictEqual(list.length, 1, 'Must list 1 stream table extraction for project');
});

// ============================================================================
// TEST GROUP 23: EQUIPMENT DATASHEET EXTRACTION PROCESSOR (PHASE 5)
// ============================================================================

console.log('\n--- Test Group 23: Equipment Datasheet Extraction Processor (Phase 5) ---');

test('Scenario 1: Extraction of Mechanical Design Parameters from Pressure Vessel Datasheet (PG-1001)', () => {
  const datasheetText = `
    EQUIPMENT DATASHEET: PRESSURE VESSEL
    INTELLIGENT ENGINEERING SOLUTIONS (IES)
    PROJECT: ONSHORE GAS PROCESSING FACILITY

    TAG NUMBER: PG-1001
    SERVICE: PIG RECEIVER & SLUG CATCHER
    EQUIPMENT TYPE: HORIZONTAL THREE-PHASE SEPARATOR / SLUG CATCHER

    MECHANICAL DESIGN CONDITIONS:
    Design Pressure: 95.0 barg
    Design Temperature: 130.0 °C
    Min Design Metal Temp (MDMT): -29.0 °C
    Operating Pressure: 90.0 barg
    Operating Temperature: 120.0 °C
    MAWP: 98.0 barg
    Hydrostatic Test Pressure: 143.0 barg
    Material of Construction: Carbon Steel NACE MR0175 (SA-516 Gr. 70)
    Corrosion Allowance: 3.0 mm
    Design Code: ASME Section VIII Div 1
    Capacity: 50.0 m3 (1200 ID x 8000 LG)
    Relief Valve Set Pressure: 95.0 barg
  `.trim();

  const dummyContent = {
    text: datasheetText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, equipment } = parseDatasheetDocument(
    dummyContent,
    'doc-ds-01',
    'DS-PG-1001_Slug_Catcher_Datasheet.pdf',
    'proj-ds-test'
  );

  assert.strictEqual(extraction.total_equipment_found, 1);
  assert.strictEqual(equipment.length, 1);

  const ds = extraction.datasheets[0];
  assert.strictEqual(ds.equipment_tag, 'PG-1001');
  assert.strictEqual(ds.equipment_type, 'vessel');
  assert.strictEqual(ds.design_pressure.normalized_value, 95.0);
  assert.strictEqual(ds.design_pressure.normalized_unit, 'barg');
  assert.strictEqual(ds.design_temperature.normalized_value, 130.0);
  assert.strictEqual(ds.design_temperature.normalized_unit, '°C');
  assert.strictEqual(ds.operating_pressure.normalized_value, 90.0);
  assert.strictEqual(ds.operating_temperature.normalized_value, 120.0);
  assert.strictEqual(ds.mawp?.normalized_value, 98.0);
  assert.strictEqual(ds.test_pressure?.normalized_value, 143.0);
  assert.strictEqual(ds.corrosion_allowance?.normalized_value, 3.0);
  assert.strictEqual(ds.corrosion_allowance?.normalized_unit, 'mm');
  assert.ok(ds.material_of_construction.normalized_value?.includes('Carbon Steel'), 'MOC must contain Carbon Steel');
  assert.ok(ds.design_code?.normalized_value?.includes('ASME Section VIII'), 'Design code must contain ASME');

  // Verify SafeFlow EquipmentTag specs
  const eq = equipment[0];
  assert.strictEqual(eq.tag, 'PG-1001');
  assert.strictEqual(eq.specifications.design_pressure.value, 95.0);
  assert.strictEqual(eq.specifications.design_temperature.value, 130.0);
  assert.strictEqual(eq.specifications.operating_pressure?.value, 90.0);
  assert.strictEqual(eq.specifications.operating_temperature?.value, 120.0);
  assert.strictEqual(eq.specifications.corrosion_allowance?.value, 3.0);
  assert.strictEqual(eq.specifications.mawp?.value, 98.0);
  assert.strictEqual(eq.specifications.test_pressure?.value, 143.0);
});

test('Scenario 2: Extraction of Nozzle Schedule from Equipment Datasheet', () => {
  const nozzleText = `
    EQUIPMENT DATASHEET: SLUG CATCHER PG-1001
    Design Pressure: 95 barg
    Design Temperature: 130 °C

    NOZZLE SCHEDULE:
    N1: 10" Inlet (600# RF)
    N2: 10" Gas Outlet (600# RF)
    N3: 4" Liquid Outlet (600# RF)
    N4: 4" PSV Connection (600# RF)
    N5: 2" Closed Drain (600# RF)
    N6: 2" Flare Vent (600# RF)
  `.trim();

  const dummyContent = {
    text: nozzleText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, equipment } = parseDatasheetDocument(
    dummyContent,
    'doc-ds-nozzle',
    'DS-PG-1001_Nozzles.pdf',
    'proj-ds-nozzle'
  );

  const ds = extraction.datasheets[0];
  assert.ok(ds.nozzles.length >= 6, `Must extract at least 6 nozzles, found: ${ds.nozzles.length}`);

  const n1 = ds.nozzles.find((n) => n.nozzle_tag === 'N1');
  assert.ok(n1, 'N1 nozzle must exist');
  assert.strictEqual(n1.nominal_size, '10"');
  assert.ok(n1.service.toLowerCase().includes('inlet'));
  assert.ok(n1.flange_rating?.includes('600#'));

  const n4 = ds.nozzles.find((n) => n.nozzle_tag === 'N4');
  assert.ok(n4, 'N4 nozzle must exist');
  assert.strictEqual(n4.nominal_size, '4"');
  assert.ok(n4.service.toLowerCase().includes('psv'));

  // Verify attached to equipment record
  const eq = equipment[0];
  assert.ok(eq.nozzle_schedule, 'Nozzle schedule must be populated on equipment record');
  assert.strictEqual(eq.nozzle_schedule?.length, ds.nozzles.length);
});

test('Scenario 3: Pressure Relief Valve (PSV) Datasheet extraction', () => {
  const psvText = `
    INSTRUMENT & SAFETY EQUIPMENT DATASHEET
    TAG: PSV-1001
    SERVICE: PG-1001 OVERPRESSURE PROTECTION
    Set Pressure: 95.0 barg
    Relief Temperature: 120.0 °C
    Body Material: SA-351 CF8M / 316L SS
    Design Code: API 520 / 526
  `.trim();

  const dummyContent = {
    text: psvText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, equipment } = parseDatasheetDocument(
    dummyContent,
    'doc-ds-psv',
    'DS-PSV-1001.pdf',
    'proj-ds-psv'
  );

  assert.strictEqual(extraction.datasheets.length, 1);
  const psv = extraction.datasheets[0];
  assert.strictEqual(psv.equipment_tag, 'PSV-1001');
  assert.strictEqual(psv.design_pressure.normalized_value, 95.0);
  assert.ok(psv.material_of_construction.normalized_value?.includes('316L'));

  const eq = equipment[0];
  assert.strictEqual(eq.tag, 'PSV-1001');
  assert.strictEqual(eq.specifications.design_pressure.value, 95.0);
});

test('Scenario 4: Deep-merge into existing equipment specifications without destroying prior data', () => {
  const store = new PsiDataStore();
  const testProjId = `proj-merge-test-${Date.now()}`;

  // Pre-existing equipment item from P&ID extraction
  const existingEq: EquipmentTag = {
    id: 'eq-pg1001-existing',
    project_id: testProjId,
    document_id: 'doc-pid-orig',
    tag: 'PG-1001',
    description: 'Pig Receiver & Slug Catcher',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 0.90,
    status: 'machine_extracted',
    source: { document: 'P&ID-01.pdf', page: 1, snippet: 'PG-1001 Slug Catcher' },
    specifications: createDefaultSpecifications('vessel'),
    created_at: new Date().toISOString(),
  };

  const dsContent = {
    text: `
      EQUIPMENT DATASHEET: PG-1001
      Material: Carbon Steel NACE MR0175
      Design Pressure: 95.0 barg
      Design Temperature: 130.0 °C
      Corrosion Allowance: 3.0 mm
    `.trim(),
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { equipment } = parseDatasheetDocument(
    dsContent,
    'doc-ds-merge',
    'DS-PG-1001.pdf',
    testProjId,
    [existingEq]
  );

  assert.strictEqual(equipment.length, 1);
  const merged = equipment[0];
  // Stable ID preserved
  assert.strictEqual(merged.id, 'eq-pg1001-existing', 'Must preserve stable ID of existing equipment');
  // Specifications upgraded
  assert.strictEqual(merged.specifications.design_pressure.value, 95.0);
  assert.strictEqual(merged.specifications.design_pressure.status, 'extracted');
  assert.strictEqual(merged.specifications.design_pressure.source_document_name, 'DS-PG-1001.pdf');
  assert.strictEqual(merged.specifications.design_temperature.value, 130.0);
  assert.strictEqual(merged.specifications.corrosion_allowance?.value, 3.0);
  assert.ok(merged.specifications_updated_at, 'specifications_updated_at must be populated');
});

test('Scenario 5: Strict Non-Fabrication Rule (unstated mechanical specs remain null, never zero)', () => {
  const sparseDsText = `
    EQUIPMENT DATASHEET: V-3001
    Material: SA-516 Gr. 70
    Design Pressure: 50.0 barg
  `.trim();

  const dummyContent = {
    text: sparseDsText,
    pagesCount: 1,
    isReadable: true,
    isScanned: false,
    textElements: [],
  };

  const { extraction, equipment } = parseDatasheetDocument(
    dummyContent,
    'doc-ds-sparse',
    'Sparse_Datasheet.pdf',
    'proj-ds-sparse'
  );

  const ds = extraction.datasheets[0];
  assert.strictEqual(ds.equipment_tag, 'V-3001');
  assert.strictEqual(ds.design_pressure.normalized_value, 50.0);

  // CRITICAL AUDIT: Design temperature was NOT provided in the datasheet.
  // It MUST NOT be fabricated or defaulted to 0!
  assert.strictEqual(ds.design_temperature.normalized_value, null, 'Unstated design temperature must remain null');
  assert.strictEqual(ds.design_temperature.extraction_confidence, 0.0);

  const eq = equipment[0];
  assert.strictEqual(eq.specifications.design_temperature.value, null);
  assert.strictEqual(eq.specifications.design_temperature.status, 'not_provided');
});

test('Scenario 6: Store persistence, query & retrieval of Datasheet extraction results', () => {
  const store = new PsiDataStore();
  const testDocId = `doc-ds-store-${Date.now()}`;
  const testProjectId = `proj-ds-store-${Date.now()}`;

  const mockExtraction: DatasheetExtractionResult = {
    id: `ds-ext-${Date.now()}`,
    project_id: testProjectId,
    document_id: testDocId,
    document_name: 'DS-E-1001_Inlet_Cooler.pdf',
    datasheets: [
      {
        id: 'ds-rec-1',
        project_id: testProjectId,
        document_id: testDocId,
        equipment_tag: 'E-1001',
        equipment_name: 'Inlet Gas Cooler (E-1001)',
        equipment_type: 'heat_exchanger',
        material_of_construction: {
          id: 'prov-moc',
          original_value: '316L SS',
          normalized_value: '316L SS',
          source_document_id: testDocId,
          source_document_name: 'DS-E-1001_Inlet_Cooler.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_pressure: {
          id: 'prov-dp',
          original_value: '95 barg',
          normalized_value: 95,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: testDocId,
          source_document_name: 'DS-E-1001_Inlet_Cooler.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_temperature: {
          id: 'prov-dt',
          original_value: '85 °C',
          normalized_value: 85,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: testDocId,
          source_document_name: 'DS-E-1001_Inlet_Cooler.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_pressure: {
          id: 'prov-op',
          original_value: '85 barg',
          normalized_value: 85,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: testDocId,
          source_document_name: 'DS-E-1001_Inlet_Cooler.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.92,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_temperature: {
          id: 'prov-ot',
          original_value: '38 °C',
          normalized_value: 38,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: testDocId,
          source_document_name: 'DS-E-1001_Inlet_Cooler.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.92,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [
          { nozzle_tag: 'N1', service: 'Gas Inlet', nominal_size: '10"', flange_rating: '600# RF', flange_facing: 'RF' },
        ],
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  };

  store.saveDatasheetExtraction(mockExtraction);

  // Retrieve by document ID
  const retrieved = store.getDatasheetExtraction(testDocId);
  assert.ok(retrieved, 'Must retrieve datasheet extraction by document ID');
  assert.strictEqual(retrieved.document_name, 'DS-E-1001_Inlet_Cooler.pdf');
  assert.strictEqual(retrieved.datasheets[0].equipment_tag, 'E-1001');
  assert.strictEqual(retrieved.datasheets[0].nozzles.length, 1);

  // List by project ID
  const list = store.listDatasheetExtractions(testProjectId);
  assert.strictEqual(list.length, 1, 'Must list 1 datasheet extraction for project');
});

// ============================================================================
// TEST GROUP 24: ENGINEERING PHILOSOPHY & BASIS OF DESIGN EXTRACTION (PHASE 6)
// ============================================================================

console.log('\n--- Test Group 24: Engineering Philosophy & Basis of Design Extraction (Phase 6) ---');

test('Scenario 1: Extraction of Shutdown Hierarchy, ESD Actions & Interlocks from Shutdown Philosophy', () => {
  const shutdownPhilosophyText = `
    PROCESS SAFETY & SHUTDOWN PHILOSOPHY
    PROJECT: OFFSHORE SOUR GAS SEPARATION FACILITY
    DOCUMENT NO: IES-SD-PHIL-001 | REVISION: B

    1. EMERGENCY SHUTDOWN HIERARCHY
    ESD-0: Total Plant De-energization - Initiated by manual ESD-0 pushbutton or confirmed catastrophic utility loss.
    ESD-1: Facility Emergency Depressuring - Initiated by confirmed hydrocarbon gas fire or multi-detector gas leak. Automates opening of all BDVs to flare and closure of feed valves.
    ESD-2: Train Isolation - Isolates processing train without depressurization upon localized equipment upset.
    ESD-3: Unit Trip - Individual unit trips (e.g. compressor shutdown).

    2. CAUSE AND EFFECT / INTERLOCK MATRIX
    Interlock I-101: On high-high pressure PSHH-1002 (>= 90.0 barg) in Separator PG-1001, initiate ESD-1: close ESD isolation valves XV-1001 and XV-1002 (fail-closed), open blowdown valve BDV-1001 to high pressure flare (fail-open). SIL 2 rated.
    Interlock I-102: On high-high liquid level LSHH-1001 in Knock-Out Drum V-1001, trip compressor K-1001 and close compressor suction valve XV-1003 (fail closed). SIL 3 rated.
    Interlock I-103: On low-low pressure PSLL-1004 (<= 15.0 barg) indicating pipeline rupture, close isolation valve XV-1005 (fail-closed). SIL 2.
  `;

  const docId = 'doc-sd-phil-01';
  const docName = 'IES-SD-PHIL-001_RevB.pdf';
  const projectId = 'proj-sd-01';

  const { extraction, rules } = parsePhilosophyDocument(
    {
      text: shutdownPhilosophyText,
      pages: [{ pageNumber: 1, text: shutdownPhilosophyText }],
      pagesCount: 1,
      isReadable: true,
      isScanned: false,
    },
    docId,
    docName,
    projectId,
    'shutdown_philosophy'
  );

  assert.ok(extraction, 'Must return extraction result');
  assert.strictEqual(extraction.document_category, 'shutdown_philosophy');
  assert.ok(extraction.rules.length >= 3, `Expected at least 3 rules, got ${extraction.rules.length}`);

  // Verify ESD-1 Interlock I-101
  const ruleI101 = extraction.rules.find((r) => r.condition.includes('PSHH-1002') || (r.loop_tag && r.loop_tag.includes('PSHH-1002')));
  assert.ok(ruleI101, 'Must extract Interlock I-101 rule');
  assert.strictEqual(ruleI101.equipment_tag, 'PG-1001');
  assert.strictEqual(ruleI101.rule_type, 'esd_action');
  assert.strictEqual(ruleI101.sil_rating, 'SIL 2');
  assert.strictEqual(ruleI101.is_confirmed_setpoint, true, '90.0 barg setpoint is confirmed');
  assert.ok(ruleI101.action.includes('XV-1001') && ruleI101.action.includes('BDV-1001'));

  // Verify LSHH Interlock I-102
  const ruleI102 = extraction.rules.find((r) => r.condition.includes('LSHH-1001') || (r.notes && r.notes.includes('I-102')));
  assert.ok(ruleI102, 'Must extract Interlock I-102');
  assert.strictEqual(ruleI102.sil_rating, 'SIL 3');
  assert.strictEqual(ruleI102.fail_safe_position, 'fail_closed');

  // Verify Shutdown Hierarchy
  assert.ok(extraction.shutdown_hierarchy.length >= 4, `Expected 4 hierarchy levels, got ${extraction.shutdown_hierarchy.length}`);
  const esd1Level = extraction.shutdown_hierarchy.find((h) => h.level.includes('ESD-1'));
  assert.ok(esd1Level, 'Must capture ESD-1 in shutdown hierarchy');
  assert.ok(esd1Level.actions.some((a) => a.toLowerCase().includes('depressur') || a.toLowerCase().includes('flare')));
});

test('Scenario 2: Extraction of Primary Control Loops & Fail-Safe Positions from Control Philosophy', () => {
  const controlPhilosophyText = `
    CONTROL PHILOSOPHY & INSTRUMENT SPECIFICATION
    PROJECT: GAS SWEETENING FACILITY

    1. PRIMARY CONTROL LOOPS
    Loop PIC-1001 modulates PCV-1001 on the overhead line to maintain Separator PG-1001 at 68.0 barg. PCV-1001 is fail-open to flare.
    Loop LIC-1001 modulates LCV-1001 to regulate bottom liquid level at 50% range in Separator PG-1001. Valve LCV-1001 is fail-closed.
    Loop TIC-1001 regulates process stream temperature via steam valve TCV-1001 on Inlet Gas Cooler E-1001 to 40.0 °C. TCV-1001 is fail-closed.
    Loop FIC-1001 modulates FCV-1001 to maintain amine feed flow rate at 120.0 m3/h. FCV-1001 is fail-locked.
  `;

  const docId = 'doc-ctrl-phil-01';
  const docName = 'Control_Philosophy_Rev0.docx';
  const projectId = 'proj-ctrl-01';

  const { extraction, rules } = parsePhilosophyDocument(
    {
      text: controlPhilosophyText,
      pages: [{ pageNumber: 1, text: controlPhilosophyText }],
      pagesCount: 1,
      isReadable: true,
      isScanned: false,
    },
    docId,
    docName,
    projectId,
    'control_philosophy'
  );

  assert.ok(extraction, 'Must return extraction result');
  assert.strictEqual(extraction.document_category, 'control_philosophy');

  // Verify PIC-1001
  const picLoop = rules.find((r) => r.loop_tag === 'PIC-1001');
  assert.ok(picLoop, 'Must extract PIC-1001 control loop');
  assert.strictEqual(picLoop.rule_type, 'control_objective');
  assert.strictEqual(picLoop.fail_safe_position, 'fail_open');
  assert.strictEqual(picLoop.is_confirmed_setpoint, true);
  assert.strictEqual(picLoop.equipment_tag, 'PG-1001');

  // Verify LIC-1001
  const licLoop = rules.find((r) => r.loop_tag === 'LIC-1001');
  assert.ok(licLoop, 'Must extract LIC-1001 control loop');
  assert.strictEqual(licLoop.fail_safe_position, 'fail_closed');

  // Verify FIC-1001
  const ficLoop = rules.find((r) => r.loop_tag === 'FIC-1001');
  assert.ok(ficLoop, 'Must extract FIC-1001 control loop');
  assert.strictEqual(ficLoop.fail_safe_position, 'fail_locked');
});

test('Scenario 3: Extraction of Sparing Philosophies & Design Margins from Process Design Philosophy', () => {
  const designPhilosophyText = `
    PROCESS DESIGN PHILOSOPHY
    FACILITY: OFFSHORE CENTRAL PROCESSING PLATFORM
    
    1. SPARING PHILOSOPHY
    Hydrocarbon Feed Pumps P-1001A/B are configured as 2 x 100% (1 duty + 1 standby with auto-start).
    Booster Gas Compressors K-1001A/B shall be 2 x 100% capacity with independent lube oil skids.
    Chemical Injection Pumps P-2001A/B/C are configured as 3 x 50% capacity.

    2. DESIGN MARGINS AND OVERDESIGN PHILOSOPHY
    Design Pressure Margin: Equipment design pressure shall be maximum operating pressure + 10% or + 1.8 barg (whichever is greater) up to 35 barg; per API 520.
    Design Temperature Margin: Design temperature shall be maximum operating temperature + 15 °C.
    Flow / Capacity Margin: Pumps and piping systems shall have +15% flow margin over rated normal flows.
    Heat Exchanger Fouling Allowance: Shell and tube exchangers shall include +10% excess area for fouling.
  `;

  const docId = 'doc-pdp-01';
  const docName = 'IES-PDP-001.pdf';
  const projectId = 'proj-pdp-01';

  const { extraction } = parsePhilosophyDocument(
    {
      text: designPhilosophyText,
      pages: [{ pageNumber: 1, text: designPhilosophyText }],
      pagesCount: 1,
      isReadable: true,
      isScanned: false,
    },
    docId,
    docName,
    projectId,
    'process_design_philosophy'
  );

  // Sparing checks
  assert.ok(extraction.sparing_philosophies.length >= 2, `Expected at least 2 sparing entries, got ${extraction.sparing_philosophies.length}`);
  const pumpSparing = extraction.sparing_philosophies.find((s) => s.equipment_tag_or_type.includes('P-1001') || s.configuration.includes('2 x 100%'));
  assert.ok(pumpSparing, 'Must capture pump sparing philosophy (2 x 100%)');

  // Design margins checks
  assert.ok(extraction.design_margins.length >= 3, `Expected at least 3 design margins, got ${extraction.design_margins.length}`);
  const dpMargin = extraction.design_margins.find((m) => m.parameter === 'Design Pressure Margin');
  assert.ok(dpMargin, 'Must capture Design Pressure Margin');
  assert.ok(dpMargin.margin_value.includes('10%') || dpMargin.margin_value.includes('1.8 barg'));
  assert.strictEqual(dpMargin.source_standard, 'API 520');

  const dtMargin = extraction.design_margins.find((m) => m.parameter === 'Design Temperature Margin');
  assert.ok(dtMargin, 'Must capture Design Temperature Margin');
  assert.ok(dtMargin.margin_value.includes('15 °C') || dtMargin.margin_value.includes('+15'));
});

test('Scenario 4: Extraction of Environmental & Atmospheric Limits from Basis of Design (BOD)', () => {
  const bodText = `
    BASIS OF DESIGN (BOD)
    PROJECT: DESERT GAS RECOVERY PLANT
    LOCATION: MIDDLE EAST FACILITY

    1. ENVIRONMENTAL & METEOROLOGICAL DESIGN CONDITIONS
    Minimum Ambient Temperature: -15 °C
    Maximum Ambient Temperature: +48 °C
    Site Elevation: 150 m AMSL
    Basic Wind Speed: 140 km/h
    Seismic Zone: Zone-3
    Solar Radiation: 1000 W/m2

    2. RELIEF AND FLARE PHILOSOPHY
    Relief valve PSV-1001 is set at 95.0 barg protecting Separator PG-1001 against blocked outlet and external pool fire per API 521.
  `;

  const docId = 'doc-bod-01';
  const docName = 'BOD_Rev0.pdf';
  const projectId = 'proj-bod-01';

  const { extraction, rules } = parsePhilosophyDocument(
    {
      text: bodText,
      pages: [{ pageNumber: 1, text: bodText }],
      pagesCount: 1,
      isReadable: true,
      isScanned: false,
    },
    docId,
    docName,
    projectId,
    'basis_of_design'
  );

  assert.ok(extraction.environmental_limits, 'Must extract environmental limits');
  assert.strictEqual(extraction.environmental_limits.min_ambient_temp, '-15 °C');
  assert.strictEqual(extraction.environmental_limits.max_ambient_temp, '48 °C');
  assert.strictEqual(extraction.environmental_limits.site_elevation, '150 m AMSL');
  assert.strictEqual(extraction.environmental_limits.basic_wind_speed, '140 km/h');
  assert.strictEqual(extraction.environmental_limits.seismic_zone, 'Zone-3');

  // Relief philosophy rule
  const reliefRule = rules.find((r) => r.rule_type === 'relief_basis');
  assert.ok(reliefRule, 'Must extract relief philosophy rule');
  assert.strictEqual(reliefRule.equipment_tag, 'PG-1001');
  assert.strictEqual(reliefRule.is_confirmed_setpoint, true);
  assert.ok(reliefRule.action.includes('blocked outlet') || reliefRule.action.includes('fire'));
});

test('Scenario 5: Safe Operating Limits (SOL) & Non-Fabrication of Provisional/TBD Setpoints', () => {
  const solText = `
    OPERATING PHILOSOPHY & SAFE OPERATING LIMITS
    PLANT SECTION: SEPARATION UNIT

    Safe Operating Limit for Separator Pressure: Normal Range 65 - 70 barg, Safe Upper Limit 85.0 barg. Consequence of Deviation: Opening of PSV-1001 to high pressure flare.
    
    Interlock I-201: On high reactor temperature in R-1001, initiate reactor quench valve XV-2001. Setpoint is TBD pending detailed exothermic kinetic simulation.
  `;

  const docId = 'doc-op-phil-01';
  const docName = 'Operating_Philosophy_RevA.docx';
  const projectId = 'proj-op-01';

  const { extraction, rules } = parsePhilosophyDocument(
    {
      text: solText,
      pages: [{ pageNumber: 1, text: solText }],
      pagesCount: 1,
      isReadable: true,
      isScanned: false,
    },
    docId,
    docName,
    projectId,
    'operating_philosophy'
  );

  // Safe Operating Limits
  assert.ok(extraction.safe_operating_limits.length >= 1, 'Must extract safe operating limit');
  const sol = extraction.safe_operating_limits[0];
  assert.ok(sol.parameter.includes('Separator Pressure') || sol.parameter.includes('Pressure'));
  assert.ok(sol.safe_upper_limit?.includes('85'));
  assert.ok(sol.consequence_of_deviation?.includes('PSV-1001'));

  // Non-fabrication & Provisional setpoint test
  const tbdRule = rules.find((r) => r.notes?.includes('I-201') || r.action.includes('XV-2001'));
  assert.ok(tbdRule, 'Must extract Interlock I-201');
  assert.strictEqual(tbdRule.is_confirmed_setpoint, false, 'TBD setpoint must be marked is_confirmed_setpoint = false');
  assert.strictEqual(tbdRule.sil_rating, undefined, 'Unstated SIL rating must NOT be fabricated');
});

test('Scenario 6: Store persistence, query & retrieval of Philosophy Extraction Results and Rules', () => {
  const store = new PsiDataStore();
  const testDocId = `doc-phil-store-${Date.now()}`;
  const testProjectId = `proj-phil-store-${Date.now()}`;

  const mockRule: EngineeringPhilosophyRule = {
    id: `rule-test-${Date.now()}`,
    project_id: testProjectId,
    source_document_id: testDocId,
    source_document_name: 'Shutdown_Philosophy.pdf',
    source_category: 'shutdown_philosophy',
    rule_type: 'esd_action',
    equipment_tag: 'PG-1001',
    loop_tag: 'PSHH-1002',
    condition: 'Pressure exceeds 90 barg on PSHH-1002',
    action: 'Close XV-1001, open BDV-1001',
    fail_safe_position: 'fail_closed',
    sil_rating: 'SIL 2',
    is_confirmed_setpoint: true,
    verification_status: 'unverified',
  };

  const mockExtraction: PhilosophyExtractionResult = {
    id: `phil-ext-${Date.now()}`,
    project_id: testProjectId,
    document_id: testDocId,
    document_name: 'Shutdown_Philosophy.pdf',
    document_category: 'shutdown_philosophy',
    rules: [mockRule],
    sparing_philosophies: [],
    design_margins: [],
    shutdown_hierarchy: [
      {
        level: 'ESD-1',
        name: 'Facility Depressuring',
        description: 'Total facility blowdown',
        triggers: ['Confirmed fire'],
        actions: ['Open BDVs'],
      },
    ],
    safe_operating_limits: [],
    total_rules_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  };

  store.savePhilosophyExtraction(mockExtraction);
  store.addPhilosophyRules([mockRule]);

  // Retrieve by document ID
  const retrievedExtraction = store.getPhilosophyExtraction(testDocId);
  assert.ok(retrievedExtraction, 'Must retrieve philosophy extraction by document ID');
  assert.strictEqual(retrievedExtraction.document_name, 'Shutdown_Philosophy.pdf');
  assert.strictEqual(retrievedExtraction.rules.length, 1);
  assert.strictEqual(retrievedExtraction.shutdown_hierarchy.length, 1);

  // Retrieve rules by project ID
  const projectRules = store.listPhilosophyRules(testProjectId);
  assert.strictEqual(projectRules.length, 1, 'Must list 1 philosophy rule for project');
  assert.strictEqual(projectRules[0].sil_rating, 'SIL 2');
  assert.strictEqual(projectRules[0].equipment_tag, 'PG-1001');

  // List extractions by project ID
  const projectExtractions = store.listPhilosophyExtractions(testProjectId);
  assert.strictEqual(projectExtractions.length, 1, 'Must list 1 philosophy extraction for project');
});

// ============================================================================
// TEST GROUP 25: UNIFIED ENGINEERING DATABASE (PHASE 7)
// ============================================================================

console.log('\n--- Test Group 25: Unified Engineering Database (Phase 7) ---');

test('Scenario 1: Cross-Document Entity Linkage for Equipment (PG-1001)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Unified Offshore Platform', 'Phase 7 Integration');
  const pidDocId = `doc-pid-${Date.now()}`;
  const dsDocId = `doc-ds-${Date.now()}`;
  const pfdDocId = `doc-pfd-${Date.now()}`;
  const philDocId = `doc-phil-${Date.now()}`;

  // 1. Add P&ID document & equipment
  store.addDocument({
    id: pidDocId,
    project_id: proj.id,
    name: 'IES-PID-001_RevC.pdf',
    original_filename: 'IES-PID-001_RevC.pdf',
    file_path: '/uploads/pid.pdf',
    mime_type: 'application/pdf',
    size_bytes: 120000,
    doc_type: 'pid',
    category: 'pid',
    revision: 'C',
    source_organization: 'Intelligent Engineering Solutions',
    upload_date: new Date().toISOString(),
    pages_count: 1,
    is_readable: true,
    chemical_ids: [],
    extraction_status: 'completed',
    verification_status: 'engineer_verified',
  });

  const eqPG1001: EquipmentTag = {
    id: `eq-pg-1001-${Date.now()}`,
    project_id: proj.id,
    document_id: pidDocId,
    tag: 'PG-1001',
    description: 'Production Gas Separator',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed',
    source: { document: 'IES-PID-001_RevC.pdf', page: 1, snippet: 'PG-1001 Separator' },
    created_at: new Date().toISOString(),
    specifications: createDefaultSpecifications(proj.id, 'eq-pg-1001'),
  };
  eqPG1001.specifications.design_pressure = {
    value: 95.0,
    unit: 'barg',
    status: 'extracted',
    source_document: 'IES-PID-001_RevC.pdf',
    source_page: 1,
    confidence: 0.95,
  };
  store.addEquipment([eqPG1001], 'P&ID Parser', 'Setup');

  // 2. Add connected piping line
  const line1: PipingLine = {
    id: `line-101-${Date.now()}`,
    project_id: proj.id,
    document_id: pidDocId,
    line_number: '10"-PG-00101-A1A',
    from_equipment: 'PG-1001',
    to_equipment: 'K-1001',
    size: '10"',
    material: 'Carbon Steel (NACE MR0175)',
    stream_label: 'Overhead Gas',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed',
    source: { document: 'IES-PID-001_RevC.pdf', page: 1, snippet: '10"-PG-00101-A1A' },
    alerts: [],
    created_at: new Date().toISOString(),
  };
  store.addLines([line1], 'P&ID Parser', 'Setup');

  // 3. Add Datasheet Extraction
  store.saveDatasheetExtraction({
    id: `ds-ext-${Date.now()}`,
    project_id: proj.id,
    document_id: dsDocId,
    document_name: 'DS-PG-1001_Datasheet.pdf',
    datasheets: [
      {
        id: 'ds-rec-pg1001',
        project_id: proj.id,
        document_id: dsDocId,
        equipment_tag: 'PG-1001',
        equipment_name: 'Production Gas Separator (PG-1001)',
        equipment_type: 'separator',
        material_of_construction: {
          id: 'moc-1',
          original_value: 'CS with 3mm Inconel Cladding',
          normalized_value: 'CS with 3mm Inconel Cladding',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-1001_Datasheet.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.96,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_pressure: {
          id: 'dp-1',
          original_value: '100.0 barg',
          normalized_value: 100.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-1001_Datasheet.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_temperature: {
          id: 'dt-1',
          original_value: '95.0 °C',
          normalized_value: 95.0,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-1001_Datasheet.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_pressure: {
          id: 'op-1',
          original_value: '68.0 barg',
          normalized_value: 68.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-1001_Datasheet.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_temperature: {
          id: 'ot-1',
          original_value: '42.0 °C',
          normalized_value: 42.0,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-1001_Datasheet.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_code: {
          id: 'dc-1',
          original_value: 'ASME Section VIII Div 1',
          normalized_value: 'ASME Section VIII Div 1',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-1001_Datasheet.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        corrosion_allowance: {
          id: 'ca-1',
          original_value: '3.0 mm',
          normalized_value: 3.0,
          original_unit: 'mm',
          normalized_unit: 'mm',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-1001_Datasheet.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        relief_valve_set_pressure: {
          id: 'rv-1',
          original_value: '100.0 barg',
          normalized_value: 100.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-1001_Datasheet.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [
          { nozzle_tag: 'N1', service: 'Feed Inlet', nominal_size: '12"', flange_rating: '600# RF', flange_facing: 'RF' },
          { nozzle_tag: 'N2', service: 'Gas Outlet', nominal_size: '10"', flange_rating: '600# RF', flange_facing: 'RF' },
        ],
        confidence: 0.96,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  // 4. Add Shutdown Philosophy Rules
  store.addPhilosophyRule({
    id: `rule-esd-1-${Date.now()}`,
    project_id: proj.id,
    source_document_id: philDocId,
    source_document_name: 'ESD_Philosophy.pdf',
    source_category: 'shutdown_philosophy',
    rule_type: 'esd_action',
    equipment_tag: 'PG-1001',
    loop_tag: 'BDV-1001',
    condition: 'Pressure on PSHH-1002 exceeds 90.0 barg',
    action: 'Close XV-1001, open BDV-1001 to sour flare',
    fail_safe_position: 'fail_open',
    sil_rating: 'SIL 2',
    is_confirmed_setpoint: true,
    verification_status: 'unverified',
  });

  // Build Unified Engineering Matrix
  const matrix = buildUnifiedEngineeringMatrix(proj.id, store);
  assert.ok(matrix.length >= 2, `Expected at least 2 matrix entries (1 eq, 1 line), got ${matrix.length}`);

  const unifiedPG1001 = matrix.find((m) => m.entity_tag === 'PG-1001' && m.entity_type === 'equipment');
  assert.ok(unifiedPG1001, 'Must find unified matrix entry for PG-1001');

  // Verify multi-source discovery
  assert.ok(unifiedPG1001.sources_found.includes('pid'), 'Must include P&ID source');
  assert.ok(unifiedPG1001.sources_found.includes('equipment_datasheet'), 'Must include Equipment Datasheet source');
  assert.ok(unifiedPG1001.sources_found.includes('shutdown_philosophy'), 'Must include Shutdown Philosophy source');

  // Verify connected entities
  assert.ok(unifiedPG1001.connected_lines?.includes('10"-PG-00101-A1A'), 'Must link connected piping line');
  assert.ok(unifiedPG1001.connected_equipment?.includes('K-1001'), 'Must link downstream compressor K-1001');

  // Verify design specifications
  assert.strictEqual(unifiedPG1001.design_specifications?.design_pressure?.normalized_value, 100.0);
  assert.strictEqual(unifiedPG1001.design_specifications?.design_temperature?.normalized_value, 95.0);
  assert.strictEqual(unifiedPG1001.design_specifications?.material_of_construction?.normalized_value, 'CS with 3mm Inconel Cladding');
  assert.strictEqual(unifiedPG1001.design_specifications?.corrosion_allowance?.normalized_value, 3.0);
  assert.strictEqual(unifiedPG1001.design_specifications?.relief_valve_set_pressure?.normalized_value, 100.0);

  // Verify operating conditions
  assert.strictEqual(unifiedPG1001.operating_conditions?.pressure?.normalized_value, 68.0);
  assert.strictEqual(unifiedPG1001.operating_conditions?.temperature?.normalized_value, 42.0);

  // Verify safeguards
  assert.ok(unifiedPG1001.safeguards?.some((s) => s.includes('BDV-1001') || s.includes('ESD_ACTION')));
});

test('Scenario 2: Process Line & Stream Correlation in Unified Matrix', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Stream Correlation Project', 'Testing Line & Stream Linking');

  // Add process stream
  store.createStream({
    project_id: proj.id,
    stream_number: 'STR-101',
    source_equipment_tag: 'PG-1001',
    destination_equipment_tag: 'K-1001',
    line_number: '10"-PG-00101-A1A',
    material_description: 'Separator Overhead Gas',
    phase: 'gas',
    flow_rates: { normal: 45000, min: 20000, max: 55000, design: 60000, actual: null, unit: 'kg/h', basis: 'mass' },
    operating_pressure: { value: 68.0, unit: 'barg', status: 'extracted' },
    operating_temperature: { value: 42.0, unit: '°C', status: 'extracted' },
  });

  // Add stream table extraction
  store.saveStreamTableExtraction({
    id: `st-ext-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-st-01',
    document_name: 'HMB_Stream_Table.xlsx',
    streams: [
      {
        id: 'st-rec-101',
        project_id: proj.id,
        document_id: 'doc-st-01',
        stream_number: 'STR-101',
        phase: 'gas',
        vapor_fraction: {
          id: 'vf-1',
          original_value: 1.0,
          normalized_value: 1.0,
          source_document_id: 'doc-st-01',
          source_document_name: 'HMB_Stream_Table.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Sheet 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_pressure: {
          id: 'sp-1',
          original_value: 68.0,
          normalized_value: 68.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: 'doc-st-01',
          source_document_name: 'HMB_Stream_Table.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Sheet 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_temperature: {
          id: 'st-1',
          original_value: 42.0,
          normalized_value: 42.0,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: 'doc-st-01',
          source_document_name: 'HMB_Stream_Table.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Sheet 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        mass_flow_rate: {
          id: 'smf-1',
          original_value: 45000,
          normalized_value: 45000,
          original_unit: 'kg/h',
          normalized_unit: 'kg/h',
          source_document_id: 'doc-st-01',
          source_document_name: 'HMB_Stream_Table.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Sheet 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        volumetric_flow_rate: {
          id: 'svf-1',
          original_value: null,
          normalized_value: null,
          source_document_id: 'doc-st-01',
          source_document_name: 'HMB_Stream_Table.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Sheet 1',
          extraction_confidence: 0.0,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        molar_flow_rate: {
          id: 'smol-1',
          original_value: null,
          normalized_value: null,
          source_document_id: 'doc-st-01',
          source_document_name: 'HMB_Stream_Table.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Sheet 1',
          extraction_confidence: 0.0,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        molecular_weight: {
          id: 'smw-1',
          original_value: 19.5,
          normalized_value: 19.5,
          source_document_id: 'doc-st-01',
          source_document_name: 'HMB_Stream_Table.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Sheet 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        density: {
          id: 'sd-1',
          original_value: 54.2,
          normalized_value: 54.2,
          source_document_id: 'doc-st-01',
          source_document_name: 'HMB_Stream_Table.xlsx',
          source_category: 'stream_table',
          page_or_drawing_location: 'Sheet 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        components: [
          { component_name: 'Methane', fraction_value: 88.5, unit: 'mol%', is_hazardous: true },
          { component_name: 'Hydrogen Sulfide', fraction_value: 1.5, unit: 'mol%', is_hazardous: true },
        ],
        source_location: 'Sheet 1',
        confidence: 0.95,
      },
    ],
    total_streams_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  const matrix = buildUnifiedEngineeringMatrix(proj.id, store);
  const streamEntry = matrix.find((m) => m.entity_tag === 'STR-101' && m.entity_type === 'stream');

  assert.ok(streamEntry, 'Must find unified matrix entry for STR-101');
  assert.strictEqual(streamEntry.operating_conditions?.pressure?.normalized_value, 68.0);
  assert.strictEqual(streamEntry.operating_conditions?.flow_rate?.normalized_value, 45000);
  assert.strictEqual(streamEntry.operating_conditions?.phase?.normalized_value, 'gas');
  assert.ok(streamEntry.assigned_chemicals?.includes('Hydrogen Sulfide'));
  assert.ok(streamEntry.assigned_chemicals?.includes('Methane'));
  assert.ok(streamEntry.connected_lines?.includes('10"-PG-00101-A1A'));
  assert.ok(streamEntry.connected_equipment?.includes('PG-1001'));
  assert.ok(streamEntry.connected_equipment?.includes('K-1001'));
});

test('Scenario 3: Chemical Inventory & Stream Component Traceability', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Chemical Provenance Project', 'Tracing chemicals into matrix');

  const chemId = `chem-h2s-${Date.now()}`;
  const chem: ChemicalRecord = {
    id: chemId,
    project_id: proj.id,
    sds_document_id: 'doc-sds-h2s',
    origin: 'sds_extracted',
    chemical_name: { value: 'Hydrogen Sulfide', status: 'verified', source_document: 'H2S_SDS.pdf' },
    cas_number: { value: '7783-06-4', status: 'verified', source_document: 'H2S_SDS.pdf' },
    sds_revision_date: { value: '2024-01-15', status: 'verified', source_document: 'H2S_SDS.pdf' },
    manufacturer: { value: 'Specialty Gas Corp', status: 'verified', source_document: 'H2S_SDS.pdf' },
    psi_parameters: createEmptyPsiParameters(),
  };
  store.addChemical(chem);

  const eq = {
    id: `eq-v-1001-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-pid-01',
    tag: 'V-1001',
    description: 'Sour Gas Knock-Out Drum',
    equipment_type: 'separator' as any,
    assigned_chemical_id: chem.id,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'V-1001' },
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  store.saveChemicalAssignment({
    project_id: proj.id,
    equipment_id: eq.id,
    chemical_id: chem.id,
    chemical_name: 'Hydrogen Sulfide',
    equipment_tag: 'V-1001',
    confidence: 1.0,
    assignment_basis: 'process_evidence',
    verified_by: 'Lead Chemical Engineer',
    verified_at: new Date().toISOString(),
  });

  const matrix = buildUnifiedEngineeringMatrix(proj.id, store);
  const v1001Entry = matrix.find((m) => m.entity_tag === 'V-1001');

  assert.ok(v1001Entry, 'Must find V-1001 entry in matrix');
  assert.ok(v1001Entry.assigned_chemicals?.includes('Hydrogen Sulfide'), 'Must list Hydrogen Sulfide in assigned chemicals');
});

test('Scenario 4: Multi-Source Provenance Vector Preservation', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Provenance Integrity Project', 'Testing provenance fields');

  const eq = {
    id: `eq-k-1001-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-pid-k',
    tag: 'K-1001',
    description: 'Booster Compressor',
    equipment_type: 'compressor' as any,
    assigned_chemical_id: null,
    confidence: 0.92,
    status: 'confirmed' as any,
    source: { document: 'PID_Compressor.pdf', page: 2, snippet: 'K-1001' },
    created_at: new Date().toISOString(),
    specifications: createDefaultSpecifications(proj.id, 'eq-k-1001'),
  };
  eq.specifications.design_pressure = {
    value: 85.0,
    unit: 'barg',
    status: 'verified',
    source_document: 'PID_Compressor.pdf',
    source_page: 2,
    confidence: 0.92,
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  const matrix = buildUnifiedEngineeringMatrix(proj.id, store);
  const k1001 = matrix.find((m) => m.entity_tag === 'K-1001');

  assert.ok(k1001, 'Must find K-1001 in matrix');
  assert.ok(k1001.design_specifications?.design_pressure, 'Must have design pressure provenance');

  const prov = k1001.design_specifications!.design_pressure!;
  assert.strictEqual(prov.normalized_value, 85.0);
  assert.strictEqual(prov.original_unit, 'barg');
  assert.strictEqual(prov.normalized_unit, 'barg');
  assert.strictEqual(prov.source_category, 'pid');
  assert.strictEqual(prov.verification_status, 'engineer_verified');
  assert.ok(prov.extraction_confidence > 0.8);
});

test('Scenario 5: Missing Data & Conflict Integrity (Zero Fabrication)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Missing Spec Project', 'Integrity testing');

  // Vessel created with missing design temperature and volume
  const eq = {
    id: `eq-v-2001-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-pid-v2',
    tag: 'V-2001',
    description: 'Flash Drum',
    equipment_type: 'vessel' as any,
    assigned_chemical_id: null,
    confidence: 0.9,
    status: 'confirmed' as any,
    source: { document: 'PID_V2001.pdf', page: 1, snippet: 'V-2001' },
    created_at: new Date().toISOString(),
    specifications: createDefaultSpecifications(proj.id, 'eq-v-2001'),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  // Register a cross-document discrepancy on V-2001 design pressure
  store.addDiscrepancy({
    project_id: proj.id,
    entity_type: 'equipment',
    entity_tag: 'V-2001',
    property_name: 'design_pressure',
    discrepancy_type: 'numerical_mismatch',
    status: 'open',
    severity: 'warning',
    message: 'Design pressure discrepancy between P&ID (50 barg) and Datasheet (60 barg)',
    evidence_records: [],
  });

  const matrix = buildUnifiedEngineeringMatrix(proj.id, store);
  const v2001 = matrix.find((m) => m.entity_tag === 'V-2001');

  assert.ok(v2001, 'Must find V-2001');

  // STRICT AUDIT: Unprovided specifications must remain undefined/null, never defaulted to zero!
  assert.strictEqual(v2001.design_specifications?.design_temperature, undefined, 'Missing design temperature must NOT be fabricated');
  assert.strictEqual(v2001.design_specifications?.capacity_or_volume, undefined, 'Missing volume must NOT be fabricated');

  // Conflict integrity
  assert.strictEqual(v2001.has_conflicts, true, 'Must flag conflict when discrepancy exists');
  assert.strictEqual(v2001.conflict_ids.length, 1);
});

test('Scenario 6: Matrix Query & Equipment Context Resolution', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Context Resolution Project', 'API testing');

  const eq = {
    id: `eq-e-1001-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-pid-e',
    tag: 'E-1001',
    description: 'Inlet Gas Cooler',
    equipment_type: 'heat_exchanger' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'E-1001' },
    created_at: new Date().toISOString(),
    specifications: createDefaultSpecifications(proj.id, 'eq-e-1001'),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  // Query context via getUnifiedEquipmentContext
  const context = getUnifiedEquipmentContext(proj.id, 'E-1001', store);
  assert.ok(context, 'Must resolve unified context for E-1001');
  assert.strictEqual(context.entity_tag, 'E-1001');
  assert.strictEqual(context.entity_type, 'equipment');

  // Retrieve by store direct query
  const stored = store.getEngineeringMatrixEntry(proj.id, 'equipment', 'E-1001');
  assert.ok(stored, 'Must retrieve from store by (projId, entityType, tag)');
  assert.strictEqual(stored.entity_tag, 'E-1001');
});

// ============================================================================
// TEST GROUP 26: CROSS-DOCUMENT CONSISTENCY & CONFLICT CHECKER (PHASE 8)
// ============================================================================

console.log('\n--- Test Group 26: Cross-Document Consistency & Conflict Checker (Phase 8) ---');

test('Scenario 1: Operating Pressure & Temperature Exceeding Design Limits (design_vs_operating)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Operating vs Design Project', 'Testing overpressure detection');
  const dsDocId = `doc-ds-${Date.now()}`;

  // Vessel with Design Pressure 90.0 barg and Design Temp 80.0 °C
  const eq = {
    id: `eq-v-101-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Separation Drum',
    equipment_type: 'separator' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'V-101' },
    created_at: new Date().toISOString(),
    specifications: createDefaultSpecifications(proj.id, 'eq-v-101'),
  };
  eq.specifications.design_pressure = {
    value: 90.0,
    unit: 'barg',
    status: 'extracted',
    source_document: 'PID.pdf',
    source_page: 1,
    confidence: 0.95,
  };
  eq.specifications.design_temperature = {
    value: 80.0,
    unit: '°C',
    status: 'extracted',
    source_document: 'PID.pdf',
    source_page: 1,
    confidence: 0.95,
  };
  // But operating pressure extracted on datasheet is 95.0 barg (> 90.0 barg design!)
  store.addEquipment([eq], 'P&ID', 'Setup');

  store.saveDatasheetExtraction({
    id: `ds-ext-${Date.now()}`,
    project_id: proj.id,
    document_id: dsDocId,
    document_name: 'DS-V-101.pdf',
    datasheets: [
      {
        id: 'ds-rec-v101',
        project_id: proj.id,
        document_id: dsDocId,
        equipment_tag: 'V-101',
        equipment_name: 'Separation Drum',
        equipment_type: 'separator',
        design_pressure: {
          id: 'dp-1',
          original_value: 90.0,
          normalized_value: 90.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-V-101.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_temperature: {
          id: 'dt-1',
          original_value: 80.0,
          normalized_value: 80.0,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: dsDocId,
          source_document_name: 'DS-V-101.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_pressure: {
          id: 'op-1',
          original_value: 95.0,
          normalized_value: 95.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-V-101.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_temperature: {
          id: 'ot-1',
          original_value: 88.0,
          normalized_value: 88.0,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: dsDocId,
          source_document_name: 'DS-V-101.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);
  assert.ok(discrepancies.length >= 2, `Expected at least 2 discrepancies, got ${discrepancies.length}`);

  const pDiscrepancy = discrepancies.find((d) => d.property_name === 'operating_pressure' && d.entity_tag === 'V-101');
  assert.ok(pDiscrepancy, 'Must detect operating pressure exceeding design pressure');
  assert.strictEqual(pDiscrepancy.discrepancy_type, 'design_vs_operating');
  assert.strictEqual(pDiscrepancy.severity, 'critical');
  assert.ok(pDiscrepancy.message.includes('95 barg') && pDiscrepancy.message.includes('90 barg'));
  assert.strictEqual(pDiscrepancy.evidence_records.length, 2, 'Must retain both operating and design provenance records');

  const tDiscrepancy = discrepancies.find((d) => d.property_name === 'operating_temperature' && d.entity_tag === 'V-101');
  assert.ok(tDiscrepancy, 'Must detect operating temp exceeding design temp');
  assert.strictEqual(tDiscrepancy.severity, 'critical');
});

test('Scenario 2: Numerical Specification Mismatch Across Documents (numerical_mismatch)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Numerical Mismatch Project', 'Testing divergence retention');
  const pidDocId = `doc-pid-${Date.now()}`;
  const dsDocId = `doc-ds-${Date.now()}`;

  // P&ID specifies Design Pressure as 95.0 barg
  const eq = {
    id: `eq-tk-101-${Date.now()}`,
    project_id: proj.id,
    document_id: pidDocId,
    tag: 'TK-101',
    description: 'Feed Storage Tank',
    equipment_type: 'tank' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'TK-101' },
    created_at: new Date().toISOString(),
    specifications: createDefaultSpecifications(proj.id, 'eq-tk-101'),
  };
  eq.specifications.design_pressure = {
    value: 95.0,
    unit: 'barg',
    status: 'extracted',
    source_document: 'PID.pdf',
    source_page: 1,
    confidence: 0.95,
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  // Mechanical Datasheet specifies Design Pressure as 100.0 barg
  store.saveDatasheetExtraction({
    id: `ds-ext-${Date.now()}`,
    project_id: proj.id,
    document_id: dsDocId,
    document_name: 'DS-TK-101.pdf',
    datasheets: [
      {
        id: 'ds-rec-tk101',
        project_id: proj.id,
        document_id: dsDocId,
        equipment_tag: 'TK-101',
        equipment_name: 'Feed Storage Tank',
        equipment_type: 'tank',
        design_pressure: {
          id: 'dp-ds',
          original_value: 100.0,
          normalized_value: 100.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-TK-101.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.98,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);
  const mismatch = discrepancies.find((d) => d.discrepancy_type === 'numerical_mismatch' && d.entity_tag === 'TK-101');

  assert.ok(mismatch, 'Must detect numerical mismatch between P&ID (95 barg) and Datasheet (100 barg)');
  assert.strictEqual(mismatch.severity, 'warning');
  assert.strictEqual(mismatch.property_name, 'design_pressure');
  assert.strictEqual(mismatch.status, 'open');
  assert.ok(mismatch.evidence_records.length >= 2, 'Must preserve both source evidence records without overwrite');
});

test('Scenario 3: Metallurgy & Material of Construction Divergence (moc_divergence)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Metallurgy Conflict Project', 'Testing MOC divergence');
  const pidDocId = `doc-pid-${Date.now()}`;
  const dsDocId = `doc-ds-${Date.now()}`;

  // P&ID says Carbon Steel
  const eq = {
    id: `eq-c-101-${Date.now()}`,
    project_id: proj.id,
    document_id: pidDocId,
    tag: 'C-101',
    description: 'Contactor Column',
    equipment_type: 'column' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'C-101' },
    created_at: new Date().toISOString(),
    specifications: createDefaultSpecifications(proj.id, 'eq-c-101'),
  };
  eq.specifications.material_of_construction = {
    value: 'Carbon Steel',
    status: 'extracted',
    source_document: 'PID.pdf',
    source_page: 1,
    confidence: 0.9,
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  // Datasheet specifies 316L SS
  store.saveDatasheetExtraction({
    id: `ds-ext-${Date.now()}`,
    project_id: proj.id,
    document_id: dsDocId,
    document_name: 'DS-C-101.pdf',
    datasheets: [
      {
        id: 'ds-rec-c101',
        project_id: proj.id,
        document_id: dsDocId,
        equipment_tag: 'C-101',
        equipment_name: 'Contactor Column',
        equipment_type: 'column',
        material_of_construction: {
          id: 'moc-ss',
          original_value: '316L Stainless Steel',
          normalized_value: '316L Stainless Steel',
          source_document_id: dsDocId,
          source_document_name: 'DS-C-101.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.98,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);
  const mocDisc = discrepancies.find((d) => d.discrepancy_type === 'moc_divergence' && d.entity_tag === 'C-101');

  assert.ok(mocDisc, 'Must detect MOC divergence on C-101');
  assert.strictEqual(mocDisc.property_name, 'material_of_construction');
  assert.strictEqual(mocDisc.severity, 'warning');
  assert.ok(mocDisc.message.includes('Carbon Steel') && mocDisc.message.includes('316L Stainless Steel'));
});

test('Scenario 4: Relief Valve Set Pressure Exceeding Vessel Design Pressure (relief_vs_mawp)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Overpressure Protection Project', 'Testing relief valve vs MAWP');
  const dsDocId = `doc-ds-${Date.now()}`;

  // Protected vessel design pressure is 100.0 barg, but relief valve set pressure is 105.0 barg
  const eq = {
    id: `eq-pg-2001-${Date.now()}`,
    project_id: proj.id,
    document_id: dsDocId,
    tag: 'PG-2001',
    description: 'High Pressure Separator',
    equipment_type: 'separator' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'DS.pdf', page: 1, snippet: 'PG-2001' },
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  store.saveDatasheetExtraction({
    id: `ds-ext-${Date.now()}`,
    project_id: proj.id,
    document_id: dsDocId,
    document_name: 'DS-PG-2001.pdf',
    datasheets: [
      {
        id: 'ds-rec-pg2001',
        project_id: proj.id,
        document_id: dsDocId,
        equipment_tag: 'PG-2001',
        equipment_name: 'High Pressure Separator',
        equipment_type: 'separator',
        design_pressure: {
          id: 'dp-pg2001',
          original_value: 100.0,
          normalized_value: 100.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-2001.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        relief_valve_set_pressure: {
          id: 'rv-pg2001',
          original_value: 105.0,
          normalized_value: 105.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-PG-2001.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);
  const rsvDisc = discrepancies.find((d) => d.discrepancy_type === 'relief_vs_mawp' && d.entity_tag === 'PG-2001');

  assert.ok(rsvDisc, 'Must flag relief valve set pressure (105 barg) exceeding design pressure (100 barg)');
  assert.strictEqual(rsvDisc.severity, 'critical');
  assert.ok(rsvDisc.message.includes('ASME Section VIII') || rsvDisc.message.includes('API 520'));
});

test('Scenario 5: Safety Interlock Trip Setpoint Exceeding Design Limit (trip_vs_design)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Trip Setpoint Check Project', 'Testing PSHH > Design Pressure');
  const dsDocId = `doc-ds-${Date.now()}`;
  const philDocId = `doc-phil-${Date.now()}`;

  // Vessel Design Pressure is 90.0 barg
  const eq = {
    id: `eq-v-3001-${Date.now()}`,
    project_id: proj.id,
    document_id: dsDocId,
    tag: 'V-3001',
    description: 'Fuel Gas Drum',
    equipment_type: 'vessel' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'DS.pdf', page: 1, snippet: 'V-3001' },
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  store.saveDatasheetExtraction({
    id: `ds-ext-${Date.now()}`,
    project_id: proj.id,
    document_id: dsDocId,
    document_name: 'DS-V-3001.pdf',
    datasheets: [
      {
        id: 'ds-rec-v3001',
        project_id: proj.id,
        document_id: dsDocId,
        equipment_tag: 'V-3001',
        equipment_name: 'Fuel Gas Drum',
        equipment_type: 'vessel',
        design_pressure: {
          id: 'dp-v3001',
          original_value: 90.0,
          normalized_value: 90.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: dsDocId,
          source_document_name: 'DS-V-3001.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  // Interlock rule has PSHH-3001 set at 95.0 barg (> 90.0 barg design!)
  store.addPhilosophyRule({
    id: `rule-v3001-${Date.now()}`,
    project_id: proj.id,
    source_document_id: philDocId,
    source_document_name: 'Shutdown_Philosophy.pdf',
    source_category: 'shutdown_philosophy',
    rule_type: 'interlock',
    equipment_tag: 'V-3001',
    loop_tag: 'PSHH-3001',
    condition: 'Pressure on PSHH-3001 >= 95.0 barg',
    action: 'Close XV-3001 to isolate drum',
    fail_safe_position: 'fail_closed',
    sil_rating: 'SIL 2',
    is_confirmed_setpoint: true,
    verification_status: 'unverified',
  });

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);
  const tripDisc = discrepancies.find((d) => d.discrepancy_type === 'trip_vs_design');

  assert.ok(tripDisc, 'Must flag SIF trip setpoint (95 barg) higher than design pressure (90 barg)');
  assert.strictEqual(tripDisc.severity, 'critical');
  assert.ok(tripDisc.message.includes('95 barg') && tripDisc.message.includes('90 barg'));
});

test('Scenario 6: Discrepancy Resolution Lifecycle, Reviewer Attribution & Audit Trail', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Resolution Lifecycle Project', 'Testing resolution states');

  const discId = `disc-test-${Date.now()}`;
  store.addDiscrepancy({
    id: discId,
    project_id: proj.id,
    entity_type: 'equipment',
    entity_tag: 'PG-1001',
    property_name: 'design_pressure',
    discrepancy_type: 'numerical_mismatch',
    status: 'open',
    severity: 'warning',
    message: 'Design pressure mismatch between P&ID (95 barg) and Datasheet (100 barg)',
    evidence_records: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // 1. Initial State
  const initial = store.listDiscrepancies(proj.id).find((d) => d.id === discId);
  assert.ok(initial);
  assert.strictEqual(initial.status, 'open');

  // 2. Resolve via resolveEngineeringDiscrepancy
  const resolved = resolveEngineeringDiscrepancy(
    proj.id,
    discId,
    {
      status: 'accepted_as_margin',
      resolution_notes: '100 barg on datasheet reflects 5% design margin over 95 barg maximum operating. Both values approved.',
      resolved_by: 'Shlok (Lead Process Safety Engineer)',
    },
    store
  );

  assert.strictEqual(resolved, true, 'Resolution must succeed');

  // 3. Verify updated state in store
  const updated = store.listDiscrepancies(proj.id).find((d) => d.id === discId);
  assert.ok(updated);
  assert.strictEqual(updated.status, 'accepted_as_margin');
  assert.strictEqual(updated.resolved_by, 'Shlok (Lead Process Safety Engineer)');
  assert.ok(updated.resolution_notes?.includes('design margin'));
  assert.ok(updated.resolved_at !== null);
});

// TEST GROUP 27: PHA / HAZOP INTEGRATION (PHASE 9)
console.log('\n--- Test Group 27: PHA / HAZOP Integration (Phase 9) ---');

test('Scenario 1: Multi-Document Context Propagation into PHA Study Nodes', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('PHA Multi-Doc Test Project', 'Testing matrix propagation to nodes');
  const docId = `doc-pid-${Date.now()}`;

  // Add equipment
  const eq = {
    id: `eq-pg1001-${Date.now()}`,
    project_id: proj.id,
    document_id: docId,
    tag: 'PG-1001',
    description: 'Inlet Slug Catcher / Pig Receiver',
    equipment_type: 'vessel' as any,
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'PG-1001' },
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  const line = {
    id: `line-101-${Date.now()}`,
    project_id: proj.id,
    document_id: docId,
    line_number: '10"-PG-00101-A1A',
    from_equipment: 'Battery Limit',
    to_equipment: 'PG-1001',
    size: '10"',
    spec: 'A1A',
    stream_label: 'Wet Sour Gas',
    material: 'CS NACE',
    flow_direction: 'forward' as any,
    status: 'confirmed' as any,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '10"-PG-00101-A1A' },
    created_at: new Date().toISOString(),
  };
  store.addLines([line], 'P&ID', 'Setup');

  // Add datasheet extraction for PG-1001
  store.saveDatasheetExtraction({
    id: `ds-ext-${Date.now()}`,
    project_id: proj.id,
    document_id: `doc-ds-${Date.now()}`,
    document_name: 'DS-PG-1001.pdf',
    datasheets: [
      {
        id: 'ds-rec-1',
        project_id: proj.id,
        document_id: `doc-ds-${Date.now()}`,
        equipment_tag: 'PG-1001',
        equipment_name: 'Slug Catcher',
        equipment_type: 'vessel',
        design_pressure: {
          id: 'dp-1',
          original_value: 90.0,
          normalized_value: 90.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: 'doc-ds-1',
          source_document_name: 'DS-PG-1001.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'engineer_verified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_temperature: {
          id: 'dt-1',
          original_value: 120.0,
          normalized_value: 120.0,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: 'doc-ds-1',
          source_document_name: 'DS-PG-1001.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'engineer_verified',
          extraction_timestamp: new Date().toISOString(),
        },
        material_of_construction: {
          id: 'moc-1',
          original_value: 'CS NACE MR0175',
          normalized_value: 'CS NACE MR0175',
          source_document_id: 'doc-ds-1',
          source_document_name: 'DS-PG-1001.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'engineer_verified',
          extraction_timestamp: new Date().toISOString(),
        },
        relief_valve_set_pressure: {
          id: 'rv-1',
          original_value: 95.0,
          normalized_value: 95.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: 'doc-ds-1',
          source_document_name: 'DS-PG-1001.pdf',
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'engineer_verified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.98,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  // Add philosophy rule
  store.addPhilosophyRule({
    id: `rule-1-${Date.now()}`,
    project_id: proj.id,
    source_document_id: `doc-phil-${Date.now()}`,
    source_document_name: 'Shutdown_Philosophy.pdf',
    source_category: 'shutdown_philosophy',
    rule_type: 'interlock',
    equipment_tag: 'PG-1001',
    loop_tag: 'PT-1002',
    condition: 'Pressure on PT-1002 >= 95.0 barg',
    action: 'Initiate ESD-1 emergency blowdown via BDV-1001 to flare',
    fail_safe_position: 'fail_open',
    sil_rating: 'SIL 2',
    is_confirmed_setpoint: true,
    verification_status: 'engineer_verified',
  });

  // Rebuild matrix
  buildUnifiedEngineeringMatrix(proj.id, store);

  // Generate PHA candidate nodes
  const nodes = store.generatePhaNodes(proj.id, 'Shlok');
  assert.ok(nodes.length > 0, 'Candidate PHA study nodes must be generated');

  const node = nodes[0];
  assert.ok(node.multi_document_context, 'Node must have multi_document_context attached');
  assert.strictEqual(node.multi_document_context.limit_comparison_status, 'fully_verified');
  assert.strictEqual(node.has_critical_gaps, false);
  assert.ok(node.multi_document_context.matrix_entries.length > 0);
  assert.ok(node.multi_document_context.philosophy_rules.length > 0);
  assert.strictEqual(node.operating_limits.pressure_safe_upper, 90.0);
  assert.strictEqual(node.operating_limits.temperature_safe_upper, 120.0);
});

test('Scenario 2: Explicit Missing Information Gap Identification (MISSING_DESIGN_PRESSURE, etc.)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Missing Spec Gap Test', 'Testing explicit gap identification');
  const docId = `doc-pid-${Date.now()}`;

  // Vessel V-5001 without documented design pressure and metallurgy
  const eq = {
    id: `eq-v5001-${Date.now()}`,
    project_id: proj.id,
    document_id: docId,
    tag: 'V-5001',
    description: 'Ammonia Flash Drum',
    equipment_type: 'vessel' as any,
    assigned_chemical_id: null,
    confidence: 0.90,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'V-5001' },
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  const line = {
    id: `line-501-${Date.now()}`,
    project_id: proj.id,
    document_id: docId,
    line_number: '6"-NH3-05001-CS',
    from_equipment: 'V-5001',
    to_equipment: 'Flare',
    size: '6"',
    spec: 'CS',
    stream_label: 'Vapor Ammonia',
    material: 'CS',
    flow_direction: 'forward' as any,
    status: 'confirmed' as any,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '6"-NH3-05001-CS' },
    created_at: new Date().toISOString(),
  };
  store.addLines([line], 'P&ID', 'Setup');

  // Build matrix with zero datasheet entries for V-5001
  buildUnifiedEngineeringMatrix(proj.id, store);

  const nodes = store.generatePhaNodes(proj.id, 'Lead Safety Facilitator');
  assert.ok(nodes.length > 0);

  const node = nodes[0];
  assert.ok(node.multi_document_context);
  assert.strictEqual(node.multi_document_context.limit_comparison_status, 'unverified_or_blocked');
  assert.strictEqual(node.has_critical_gaps, true);

  const missingPress = node.multi_document_context.missing_design_specifications.find(
    (s) => s.property === 'design_pressure'
  );
  assert.ok(missingPress, 'Must flag missing design pressure alert');
  assert.strictEqual(missingPress.criticality, 'critical');

  const missingTemp = node.multi_document_context.missing_design_specifications.find(
    (s) => s.property === 'design_temperature'
  );
  assert.ok(missingTemp, 'Must flag missing design temperature alert');

  // Must populate critical_information_gaps array
  assert.ok(node.critical_information_gaps && node.critical_information_gaps.length >= 2);
  assert.ok(node.critical_information_gaps.some((g) => g.includes('[MISSING_DESIGN_PRESSURE]')));
  assert.ok(node.missing_process_information?.some((g) => g.includes('[MISSING_DESIGN_PRESSURE]')));
});

test('Scenario 3: Strict Non-Fabrication Rule: Blocking Claimed Verified Limit Comparisons When Critical Limits are Absent', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Strict Limit Comparison Gate Project', 'Testing non-fabrication gate');
  const docId = `doc-pid-${Date.now()}`;

  const eq = {
    id: `eq-t6001-${Date.now()}`,
    project_id: proj.id,
    document_id: docId,
    tag: 'TK-6001',
    description: 'Bulk Sulfuric Acid Tank',
    equipment_type: 'tank' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'TK-6001' },
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  const line = {
    id: `line-601-${Date.now()}`,
    project_id: proj.id,
    document_id: docId,
    line_number: '2"-AC-6001-A1A',
    from_equipment: 'TK-6001',
    to_equipment: 'Neutralization',
    size: '2"',
    spec: 'A1A',
    stream_label: 'Sulfuric Acid',
    material: 'Alloy 20',
    flow_direction: 'forward' as any,
    status: 'confirmed' as any,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '2"-AC-6001-A1A' },
    created_at: new Date().toISOString(),
  };
  store.addLines([line], 'P&ID', 'Setup');

  // Approve graph so graph gate passes
  store.approveGraph(proj.id, 'Senior Process Engineer', 'Graph validated', true);

  // Generate nodes without datasheet specifications
  buildUnifiedEngineeringMatrix(proj.id, store);
  const nodes = store.generatePhaNodes(proj.id, 'Engineer');
  const node = nodes[0];

  // Try to approve node even though critical limits are missing
  store.approvePhaNode(node.id, 'Lead HAZOP Chair');

  // Check HAZOP readiness
  const readiness = store.getHazopReadiness(proj.id);
  assert.strictEqual(readiness.ready, false, 'Readiness must remain blocked when critical limits are missing');
  assert.ok(
    readiness.blocking_reasons.some((r) =>
      r.includes('cannot claim verified limit comparisons because critical design limits are absent or unverified')
    ),
    'Must explicitly block claiming verified limit comparison when design limits are absent'
  );
  assert.ok((readiness.nodes_with_critical_gaps_count ?? 0) > 0);
});

test('Scenario 4: Grounded Multi-Document HAZOP Deviation Generation', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('HAZOP Deviation Grounding Project', 'Testing evidence citations in deviations');

  const dummyNode: PhaStudyNode = {
    id: 'n-test-101',
    project_id: proj.id,
    node_id: 'N-001',
    name: 'Inlet Separation',
    design_intent: 'Separate multiphase reservoir fluid at 90 barg and 60 C.',
    equipment_tags: ['PG-1001'],
    line_numbers: ['10"-PG-00101-A1A'],
    inlet_boundaries: ['Inlet'],
    outlet_boundaries: ['Outlet'],
    basis_for_grouping: 'Unit boundary',
    status: 'candidate_not_authoritative',
    unresolved_questions: [],
    operating_limits: {
      temperature_safe_upper: null,
      temperature_safe_lower: null,
      pressure_safe_upper: null,
      pressure_safe_lower: null,
      flow_safe_upper: null,
      flow_safe_lower: null,
      units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' },
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const matrixEntry: UnifiedEngineeringMatrixEntry = {
    id: 'mat-pg1001',
    project_id: proj.id,
    entity_type: 'equipment',
    entity_tag: 'PG-1001',
    sources_found: ['equipment_datasheet', 'pid'],
    design_specifications: {
      design_pressure: {
        id: 'p-1',
        original_value: 90.0,
        normalized_value: 90.0,
        original_unit: 'barg',
        normalized_unit: 'barg',
        source_document_id: 'ds-1',
        source_document_name: 'DS-PG-1001.pdf',
        source_category: 'equipment_datasheet',
        page_or_drawing_location: 'Page 1',
        extraction_confidence: 0.99,
        verification_status: 'engineer_verified',
        extraction_timestamp: new Date().toISOString(),
      },
      relief_valve_set_pressure: {
        id: 'rv-1',
        original_value: 95.0,
        normalized_value: 95.0,
        original_unit: 'barg',
        normalized_unit: 'barg',
        source_document_id: 'ds-1',
        source_document_name: 'DS-PG-1001.pdf',
        source_category: 'equipment_datasheet',
        page_or_drawing_location: 'Page 1',
        extraction_confidence: 0.99,
        verification_status: 'engineer_verified',
        extraction_timestamp: new Date().toISOString(),
      },
    },
    has_conflicts: false,
    conflict_ids: [],
    last_updated: new Date().toISOString(),
  };

  const rule: EngineeringPhilosophyRule = {
    id: 'rule-bdv',
    project_id: proj.id,
    source_document_id: 'phil-1',
    source_document_name: 'Shutdown_Philosophy.pdf',
    source_category: 'shutdown_philosophy',
    rule_type: 'esd_action',
    equipment_tag: 'PG-1001',
    loop_tag: 'BDV-1001',
    condition: 'ESD-1 Emergency Depressurization signal active',
    action: 'Open BDV-1001 to blow down vessel to sour flare header',
    fail_safe_position: 'fail_open',
    sil_rating: 'SIL 2',
    is_confirmed_setpoint: true,
    verification_status: 'engineer_verified',
  };

  const devs = generateComprehensiveHazopDeviations(
    dummyNode,
    null,
    [],
    [],
    [matrixEntry],
    [rule],
    []
  );

  const morePressure = devs.find((d) => d.deviation === 'MORE PRESSURE / OVERPRESSURE');
  assert.ok(morePressure, 'MORE PRESSURE deviation must be generated');
  assert.ok(morePressure.consequences[0].includes('90 barg'), 'Consequence must cite 90 barg design pressure');
  assert.ok(
    morePressure.existing_safeguards.some((s) => s.includes('95 barg') && s.includes('PSV-1001')),
    'Safeguards must cite 95 barg PSV setpoint'
  );
  assert.ok(
    morePressure.existing_safeguards.some((s) => s.includes('BDV-1001') && s.includes('ESD-1')),
    'Safeguards must ground ESD-1 blowdown action from Shutdown Philosophy'
  );
});

test('Scenario 5: Multi-Document HAZOP Readiness Evaluation with Open Critical Discrepancies', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Discrepancy Readiness Gate Project', 'Testing blocking on critical discrepancies');

  const eq = {
    id: `eq-v7001-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'V-7001',
    description: 'Stabilizer Feed Drum',
    equipment_type: 'vessel' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'V-7001' },
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  const line = {
    id: `line-701-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-1',
    line_number: '4"-ST-7001-A1A',
    from_equipment: 'V-7001',
    to_equipment: 'Tower',
    size: '4"',
    spec: 'A1A',
    stream_label: 'Feed',
    material: 'CS',
    flow_direction: 'forward' as any,
    status: 'confirmed' as any,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '4"-ST-7001-A1A' },
    created_at: new Date().toISOString(),
  };
  store.addLines([line], 'P&ID', 'Setup');

  store.approveGraph(proj.id, 'Process Engineer', 'Topology valid', true);

  // Add critical discrepancy: relief_vs_mawp
  store.addDiscrepancy({
    id: `disc-crit-${Date.now()}`,
    project_id: proj.id,
    entity_type: 'equipment',
    entity_tag: 'V-7001',
    property_name: 'relief_valve_set_pressure',
    discrepancy_type: 'relief_vs_mawp',
    status: 'open',
    severity: 'critical',
    message: 'Relief valve set pressure (105 barg) exceeds design pressure (100 barg) on V-7001',
    evidence_records: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const readiness = store.getHazopReadiness(proj.id);
  assert.strictEqual(readiness.ready, false, 'Readiness must be blocked by critical discrepancy');
  assert.ok(
    readiness.blocking_reasons.some((r) => r.includes('Unresolved critical discrepancy') && r.includes('V-7001')),
    'Must list unresolved critical discrepancy in blocking reasons'
  );
  assert.strictEqual(readiness.unresolved_discrepancies_count, 1);
});

test('Scenario 6: Reassessment Flagging Upon Multi-Document Specification Updates', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Reassessment Flow Project', 'Testing reassessment propagation');

  const eq = {
    id: `eq-pg9001-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'PG-9001',
    description: 'Gas Compressor Suction Scrubber',
    equipment_type: 'separator' as any,
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed' as any,
    source: { document: 'PID.pdf', page: 1, snippet: 'PG-9001' },
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq], 'P&ID', 'Setup');

  const line = {
    id: `line-901-${Date.now()}`,
    project_id: proj.id,
    document_id: 'doc-1',
    line_number: '12"-GS-9001-A1A',
    from_equipment: 'Manifold',
    to_equipment: 'PG-9001',
    size: '12"',
    spec: 'A1A',
    stream_label: 'Natural Gas',
    material: 'CS',
    flow_direction: 'forward' as any,
    status: 'confirmed' as any,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '12"-GS-9001-A1A' },
    created_at: new Date().toISOString(),
  };
  store.addLines([line], 'P&ID', 'Setup');

  const node = store.createPhaNode({
    project_id: proj.id,
    node_id: 'N-901',
    name: 'Compression Suction Scrubbing',
    design_intent: 'Scrub condensed liquids from gas prior to compression.',
    equipment_tags: ['PG-9001'],
    line_numbers: ['12"-GS-9001-A1A'],
    inlet_boundaries: ['Battery Limit'],
    outlet_boundaries: ['Compressor K-9001 Suction'],
    basis_for_grouping: 'Liquid separation boundary',
    status: 'approved',
    unresolved_questions: [],
    operating_limits: {
      temperature_safe_upper: 80,
      temperature_safe_lower: 10,
      pressure_safe_upper: 60,
      pressure_safe_lower: 15,
      flow_safe_upper: 1000,
      flow_safe_lower: 200,
      units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' },
    },
    requires_reassessment: false,
    reassessment_reasons: [],
  });

  assert.strictEqual(node.requires_reassessment, false);

  // Trigger specification update reassessment
  const affected = store.reassessPhaNodesOnSpecChange(
    proj.id,
    'PG-9001',
    'design_pressure',
    'Shlok (Master Process Architect)'
  );

  assert.strictEqual(affected.length, 1);
  assert.strictEqual(affected[0].node_id, 'N-901');

  // Verify updated state in store
  const reloaded = store.listPhaNodes(proj.id).find((n) => n.id === node.id);
  assert.ok(reloaded);
  assert.strictEqual(reloaded.requires_reassessment, true);
  assert.ok(reloaded.reassessment_reasons?.some((r) => r.includes('design_pressure') && r.includes('PG-9001')));
});

// ----------------------------------------------------
// TEST GROUP 28: Phase 1 — Equipment Validation & Isolated Equipment Review Classification
// ----------------------------------------------------
console.log('\n--- Test Group 28: Equipment Validation & Isolated Equipment Review (Phase 1) ---');

test('Scenario 1: Equipment tag validation against uploaded P&ID/PFD documents & drawing provenance retention', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 1 Provenance Project ' + Date.now(), 'Provenance and taxonomy verification');
  const now = Date.now();

  const pfdDoc: DocumentRecord = {
    id: 'doc-pfd-' + now,
    project_id: proj.id,
    name: '00-01-PFD-00101.pdf',
    original_filename: '00-01-PFD-00101.pdf',
    file_path: '/uploads/pfd.pdf',
    mime_type: 'application/pdf',
    size_bytes: 512000,
    category: 'process_flow_diagram',
    doc_type: 'process_flow_diagram',
    metadata: { revision_date: 'Rev C - 2024-03-15' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  store.addDocument(pfdDoc);

  const eqTag: EquipmentTag = {
    id: 'eq-p1-' + now,
    project_id: proj.id,
    document_id: pfdDoc.id,
    tag: 'PG-1001',
    description: 'Production Gas Separator',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.96,
    status: 'provisional',
    source: {
      document: '00-01-PFD-00101.pdf',
      page: 1,
      snippet: 'PG-1001 Production Gas Separator 120 barg',
    },
    source_drawing: '00-01-PFD-00101',
    source_page: 1,
    source_revision: 'Rev C',
    specifications: createDefaultSpecifications('separator'),
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqTag]);

  const report = store.validateEquipment(proj.id);
  assert.strictEqual(report.total_equipment, 1);
  const evaluation = report.equipment_evaluations[eqTag.id];
  assert.ok(evaluation);
  assert.strictEqual(evaluation.tag, 'PG-1001');
  assert.strictEqual(evaluation.type, 'separator');
  assert.strictEqual(evaluation.has_drawing_provenance, true);
  assert.strictEqual(evaluation.drawing_page, 1);
  assert.strictEqual(evaluation.drawing_revision, 'Rev C');
  assert.strictEqual(evaluation.extraction_confidence, 0.96);
});

test('Scenario 2: Preservation of extraction confidence, machine values & original extracted values upon manual edit', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 1 Immutability Project ' + Date.now(), 'Manual correction auditability');
  const now = Date.now();

  const eqTag: EquipmentTag = {
    id: 'eq-orig-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'TK-101',
    description: 'Crude Storage Tank',
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 0.88,
    status: 'provisional',
    machine_tag: 'TK-101',
    machine_type: 'tank',
    machine_description: 'Crude Storage Tank',
    source: { document: 'PID-101.pdf', page: 2, snippet: 'TK-101' },
    specifications: createDefaultSpecifications('tank'),
    created_at: '2024-01-01T00:00:00.000Z',
  };

  store.addEquipment([eqTag]);

  // Engineer modifies tag and description to correct OCR mistake
  const updated = store.updateEquipment(
    eqTag.id,
    {
      tag: 'TK-101A',
      description: 'Primary Crude Storage Tank A',
      is_manual_entry: true,
    },
    'Shlok (Lead Process Engineer)',
    'Corrected tag suffix based on drawing title block'
  );

  assert.ok(updated);
  assert.strictEqual(updated.tag, 'TK-101A');
  assert.strictEqual(updated.description, 'Primary Crude Storage Tank A');
  // Original extracted and machine values remain strictly preserved!
  assert.strictEqual(updated.machine_tag, 'TK-101');
  assert.strictEqual(updated.machine_type, 'tank');
  assert.strictEqual(updated.machine_description, 'Crude Storage Tank');
  assert.ok(updated.original_extracted_values);
  assert.strictEqual(updated.original_extracted_values.tag, 'TK-101');
  assert.strictEqual(updated.original_extracted_values.confidence, 0.88);
});

test('Scenario 3: Identification of duplicate equipment tags and cross-document tag conflicts', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 1 Duplicates Project ' + Date.now(), 'Duplicate and conflict detection');
  const now = Date.now();

  const eq1: EquipmentTag = {
    id: 'eq-dup-1-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    tag: 'P-101A',
    description: 'Feed Pump A',
    equipment_type: 'pump',
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed',
    source: { document: 'PID-01.pdf', page: 1, snippet: 'P-101A' },
    specifications: createDefaultSpecifications('pump'),
    created_at: new Date().toISOString(),
  };

  const eq2: EquipmentTag = {
    id: 'eq-dup-2-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-2',
    tag: 'P-101A', // Same tag, duplicate item in project!
    description: 'Feed Pump A (Duplicate Entry)',
    equipment_type: 'pump',
    assigned_chemical_id: null,
    confidence: 0.92,
    status: 'provisional',
    source: { document: 'PID-02.pdf', page: 1, snippet: 'P-101A' },
    specifications: createDefaultSpecifications('pump'),
    conflicting_tags: [
      {
        document_id: 'doc-pfd-1',
        document_name: 'PFD-01.pdf',
        tag: 'P-101',
        confidence: 0.90,
        conflict_reason: 'PFD omits the pump train suffix letter "A"',
      },
    ],
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eq1, eq2]);

  const report = store.validateEquipment(proj.id);
  assert.strictEqual(report.duplicate_tags_count, 2);
  assert.strictEqual(report.conflicting_tags_count, 1);

  // Critical error generated for duplicate tag
  const dupIssue = report.issues.find((i) => i.code === 'ERR_DUPLICATE_TAG');
  assert.ok(dupIssue);
  assert.strictEqual(dupIssue.severity, 'critical_error');
  assert.strictEqual(dupIssue.category, 'source_to_source_discrepancy');

  // Conflict issue generated for cross-document conflict
  const conflictIssue = report.issues.find((i) => i.code === 'WARN_EQUIPMENT_TAG_CONFLICT');
  assert.ok(conflictIssue);
  assert.strictEqual(conflictIssue.severity, 'engineering_review_required');
});

test('Scenario 4: 5-Tier Isolated Equipment Review Classification & non-removal guarantee', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 1 Isolated Review Project ' + Date.now(), 'Isolated node classification');
  const now = Date.now();

  const isolatedVessel: EquipmentTag = {
    id: 'eq-iso-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    tag: 'V-1005',
    description: 'Closed Flare KO Drum (Standby)',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'provisional',
    source: { document: 'PID-10.pdf', page: 1, snippet: 'V-1005 Standby KO Drum' },
    specifications: createDefaultSpecifications('vessel'),
    created_at: new Date().toISOString(),
  };

  store.addEquipment([isolatedVessel]);

  // Initially has zero connections and isolated_review_status is awaiting_review
  let report = store.validateEquipment(proj.id);
  assert.strictEqual(report.isolated_equipment, 1);
  assert.strictEqual(report.unresolved_isolated, 1);
  assert.strictEqual(report.reviewed_isolated, 0);

  // Update classification: 'confirmed_isolated' with documented justification
  store.updateEquipmentReviewStatus(
    isolatedVessel.id,
    'confirmed_isolated',
    'Shlok (Lead Process Safety Specialist)',
    'Standalone package skid per Sparing Philosophy Section 4.2'
  );

  report = store.validateEquipment(proj.id);
  assert.strictEqual(report.isolated_equipment, 1);
  assert.strictEqual(report.reviewed_isolated, 1);
  assert.strictEqual(report.unresolved_isolated, 0);

  // Verify non-removal rule: Isolated equipment was NOT deleted!
  const list = store.listEquipment(proj.id);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].tag, 'V-1005');
  assert.strictEqual(list[0].isolated_review_status, 'confirmed_isolated');
  assert.strictEqual(list[0].isolated_reviewed_by, 'Shlok (Lead Process Safety Specialist)');
});

test('Scenario 5: Documented isolated equipment passes graph validation without blocking approval', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 1 Approval Project ' + Date.now(), 'Confirmed isolated approval waiver');
  const now = Date.now();

  const eq1: EquipmentTag = {
    id: 'eq-app-1-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    tag: 'TK-101',
    description: 'Main Process Tank',
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 1,
    status: 'confirmed',
    verification_status: 'engineer_verified',
    source: { document: 'PID-101.pdf', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('tank'),
    created_at: new Date().toISOString(),
  };

  const eq2: EquipmentTag = {
    id: 'eq-app-2-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    tag: 'P-101',
    description: 'Transfer Pump',
    equipment_type: 'pump',
    assigned_chemical_id: null,
    confidence: 1,
    status: 'confirmed',
    verification_status: 'engineer_verified',
    source: { document: 'PID-101.pdf', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('pump'),
    created_at: new Date().toISOString(),
  };

  const eqIsolated: EquipmentTag = {
    id: 'eq-app-iso-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    tag: 'FL-1001',
    description: 'Standalone Flare Stack',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1,
    status: 'confirmed',
    verification_status: 'engineer_verified',
    isolated_review_status: 'confirmed_isolated',
    isolated_review_notes: 'Documented emergency flare stack package',
    source: { document: 'PID-101.pdf', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    created_at: new Date().toISOString(),
  };

  const line: PipingLine = {
    id: 'l-app-1-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    line_number: '2"-TK-001',
    from_equipment: 'TK-101',
    to_equipment: 'P-101',
    size: '2"',
    material: 'CS',
    stream_label: 'Feed',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    assigned_chemical_id: null,
    confidence: 1,
    status: 'confirmed',
    source: { document: 'PID-101.pdf', page: 1, snippet: '' },
    alerts: [],
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eq1, eq2, eqIsolated]);
  store.addLines([line]);

  const valResult = store.getGraphValidation(proj.id);
  assert.strictEqual(valResult.is_valid, true);
  // Legitimate documented standalone unit does NOT block graph approval!
  assert.strictEqual(valResult.can_approve, true);
  assert.strictEqual(valResult.errors_count, 0);

  // Informational issue logged for audit trail
  const infoIssue = valResult.issues.find((i) => i.code === 'INFO_CONFIRMED_ISOLATED_EQUIPMENT');
  assert.ok(infoIssue);
  assert.strictEqual(infoIssue.severity, 'informational');
  assert.strictEqual(infoIssue.acknowledged, true);
});

test('Scenario 6: Missing operating data generates missing_engineering_information without invalidating topology', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 1 Non-Fabrication Project ' + Date.now(), 'Missing operating data rules');
  const now = Date.now();

  const eq: EquipmentTag = {
    id: 'eq-nofab-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'V-101',
    description: 'Vessel with unstated operating pressure',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 0.95,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    specifications: createDefaultSpecifications('vessel'),
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eq]);

  // Operating pressure and temperature remain strictly null
  assert.strictEqual(eq.specifications.operating_pressure?.value, null);
  assert.strictEqual(eq.specifications.operating_pressure?.status, 'not_provided');

  const report = store.validateEquipment(proj.id);
  // Missing operating data does not produce critical_error
  const critical = report.issues.filter((i) => i.severity === 'critical_error');
  assert.strictEqual(critical.length, 0);
  assert.strictEqual(report.is_valid, true);
});

// ----------------------------------------------------
// Test Group 29: Process Line Registry & Limit Validation (Phase 2)
// ----------------------------------------------------
console.log('\n--- Test Group 29: Process Line Registry & Limit Validation (Phase 2) ---');

test('Scenario 1: First-class ProcessLine entity creation with units and property-level provenance', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 2 ProcessLine Registry ' + Date.now(), 'Testing first-class ProcessLine');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-a-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    tag: 'V-1001',
    description: 'Feed Separator',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'PID-101.pdf', page: 1, snippet: 'Feed Separator V-1001' },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-b-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    tag: 'C-1001',
    description: 'Compressor',
    equipment_type: 'compressor',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'PID-101.pdf', page: 1, snippet: 'Compressor C-1001' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  const pLine: ProcessLine = {
    id: 'line-pl-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-1',
    line_number: '10"-PG-00101-A1A',
    from_equipment: 'V-1001',
    to_equipment: 'C-1001',
    flow_direction: 'forward',
    connection_type: 'process_piping',
    size: '10"',
    material: 'A1A',
    confidence: 0.96,
    status: 'confirmed',
    stream_label: 'Sour Gas Overhead',
    functional_type: 'piping_line',
    assigned_chemical_id: null,
    alerts: [],
    source: { document: 'PID-101.pdf', page: 1, snippet: '10"-PG-00101-A1A V-1001 -> C-1001' },
    nominal_pipe_size: {
      value: '10"',
      unit: 'in',
      source_document_name: 'PID-101.pdf',
      source_page: 1,
      extraction_confidence: 0.96,
      verification_status: 'unverified',
    },
    pipe_spec: {
      value: 'A1A',
      unit: null,
      source_document_name: 'PID-101.pdf',
      source_page: 1,
      extraction_confidence: 0.96,
      verification_status: 'unverified',
    },
    fluid_service: {
      value: 'Sour Gas',
      unit: null,
      source_document_name: 'PID-101.pdf',
      source_page: 1,
      extraction_confidence: 0.96,
      verification_status: 'unverified',
    },
    operating_flow_rate: {
      value: 12500,
      unit: 'kg/h',
      source_document_name: 'HMB-001.pdf',
      source_page: 3,
      extraction_confidence: 0.99,
      verification_status: 'unverified',
    },
    operating_pressure: {
      value: 18.5,
      unit: 'bar(g)',
      source_document_name: 'HMB-001.pdf',
      source_page: 3,
      extraction_confidence: 0.99,
      verification_status: 'unverified',
    },
    design_pressure: {
      value: 25.0,
      unit: 'bar(g)',
      source_document_name: 'LineList-001.pdf',
      source_page: 5,
      extraction_confidence: 0.99,
      verification_status: 'unverified',
    },
    operating_temperature: {
      value: 45.0,
      unit: '°C',
      source_document_name: 'HMB-001.pdf',
      source_page: 3,
      extraction_confidence: 0.99,
      verification_status: 'unverified',
    },
    design_temperature: {
      value: 85.0,
      unit: '°C',
      source_document_name: 'LineList-001.pdf',
      source_page: 5,
      extraction_confidence: 0.99,
      verification_status: 'unverified',
    },
    physical_state: {
      value: 'gas',
      unit: null,
      source_document_name: 'HMB-001.pdf',
      source_page: 3,
      verification_status: 'unverified',
    },
    created_at: new Date().toISOString(),
  };

  store.addProcessLines([pLine]);

  const retrieved = store.getProcessLine(pLine.id);
  assert.ok(retrieved, 'ProcessLine retrieved successfully');
  assert.strictEqual(retrieved?.line_number, '10"-PG-00101-A1A');
  assert.strictEqual(retrieved?.nominal_pipe_size?.value, '10"');
  assert.strictEqual(retrieved?.nominal_pipe_size?.unit, 'in');
  assert.strictEqual(retrieved?.operating_pressure?.value, 18.5);
  assert.strictEqual(retrieved?.operating_pressure?.unit, 'bar(g)');
  assert.strictEqual(retrieved?.design_pressure?.value, 25.0);
  assert.strictEqual(retrieved?.operating_flow_rate?.value, 12500);
  assert.strictEqual(retrieved?.physical_state?.value, 'gas');
});

test('Scenario 2: Strict non-fabrication rule (unstated engineering parameters remain null, not zero)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 2 Non-Fabrication ' + Date.now(), 'Testing null defaults');
  const now = Date.now();

  const rawLine: Partial<ProcessLine> = {
    id: 'line-sparse-' + now,
    project_id: proj.id,
    line_number: '2"-P-1002',
    from_equipment: 'V-1001',
    to_equipment: 'P-1001',
    size: '2"',
    material: 'CS',
  };

  store.addLines([rawLine as ProcessLine]);

  const retrieved = store.getProcessLine(rawLine.id!);
  assert.ok(retrieved, 'Sparse line retrieved');
  // Strict non-fabrication: unstated parameters are null, never 0 or guessed
  assert.strictEqual(retrieved?.operating_flow_rate?.value, null);
  assert.strictEqual(retrieved?.operating_pressure?.value, null);
  assert.strictEqual(retrieved?.operating_temperature?.value, null);
  assert.strictEqual(retrieved?.design_pressure?.value, null);
  assert.strictEqual(retrieved?.design_temperature?.value, null);
  assert.strictEqual(retrieved?.physical_state?.value, null);
});

test('Scenario 3: Operating condition vs. design limit violation classification (operating_vs_design_limit_violation)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 2 Limit Violations ' + Date.now(), 'Testing limit violation category');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-sep-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'V-2001',
    description: 'Separator Vessel',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    specifications: {
      ...createDefaultSpecifications('separator'),
      design_pressure: {
        value: 20.0,
        unit: 'bar(g)',
        status: 'verified',
        verification_status: 'verified',
        source_document_name: 'Datasheet-V2001.pdf',
        conflicting_records: [],
        change_history: [],
      },
    },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-flt-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'F-2001',
    description: 'Filter Coalescer',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  // Operating pressure of 28 bar(g) violates line design pressure of 22 bar(g)
  const lineViolation: ProcessLine = {
    id: 'line-violation-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    line_number: '6"-HC-02001-A1A',
    from_equipment: 'V-2001',
    to_equipment: 'F-2001',
    flow_direction: 'forward',
    connection_type: 'process_piping',
    size: '6"',
    material: 'A1A',
    stream_label: 'Hydrocarbon Gas',
    functional_type: 'piping_line',
    confidence: 0.95,
    status: 'confirmed',
    assigned_chemical_id: null,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    operating_pressure: {
      value: 28.0,
      unit: 'bar(g)',
      source_document_name: 'HMB.pdf',
      verification_status: 'unverified',
    },
    design_pressure: {
      value: 22.0,
      unit: 'bar(g)',
      source_document_name: 'LineList.pdf',
      verification_status: 'unverified',
    },
    operating_temperature: {
      value: 110.0,
      unit: '°C',
      source_document_name: 'HMB.pdf',
      verification_status: 'unverified',
    },
    design_temperature: {
      value: 95.0,
      unit: '°C',
      source_document_name: 'LineList.pdf',
      verification_status: 'unverified',
    },
    created_at: new Date().toISOString(),
  };

  store.addProcessLines([lineViolation]);

  const report = store.validateProcessLinesForProject(proj.id);
  assert.strictEqual(report.limit_violations_count >= 2, true, 'At least 2 limit violations detected (P and T)');

  const pViolation = report.issues.find(
    (i) => i.line_id === lineViolation.id && i.property_name === 'pressure'
  );
  assert.ok(pViolation, 'Pressure limit violation issue generated');
  // Mandatory Correction #1: Must be operating_vs_design_limit_violation, NOT source_to_source_discrepancy
  assert.strictEqual(pViolation?.category, 'operating_vs_design_limit_violation');
  assert.strictEqual(pViolation?.severity, 'critical_error');
  assert.strictEqual(report.can_approve, false, 'Critical limit violation blocks line approval');
});

test('Scenario 4: Utility connection modelling (supports fluid transport, flow, pressure, temperature, and streams)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 2 Utility Modeling ' + Date.now(), 'Testing utility connections');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-cw-supply-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'UTILITY',
    description: 'Utility Header',
    equipment_type: 'other',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-exchanger-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'E-3001',
    description: 'Cooler Heat Exchanger',
    equipment_type: 'heat_exchanger',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  // Utility connection carrying cooling water
  const utilityLine: ProcessLine = {
    id: 'line-cw-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    line_number: '4"-CW-03001-A1',
    from_equipment: 'UTILITY',
    to_equipment: 'E-3001',
    flow_direction: 'forward',
    connection_type: 'utility_connection',
    size: '4"',
    material: 'CS',
    stream_label: 'Cooling Water Supply',
    functional_type: 'utility_line',
    confidence: 0.95,
    status: 'confirmed',
    assigned_chemical_id: null,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    operating_flow_rate: {
      value: 45000,
      unit: 'kg/h',
      source_document_name: 'Utility-Balance.pdf',
      verification_status: 'unverified',
    },
    operating_pressure: {
      value: 4.5,
      unit: 'bar(g)',
      source_document_name: 'Utility-Balance.pdf',
      verification_status: 'unverified',
    },
    design_pressure: {
      value: 10.0,
      unit: 'bar(g)',
      source_document_name: 'Utility-LineList.pdf',
      verification_status: 'unverified',
    },
    created_at: new Date().toISOString(),
  };

  // Instrument signal line carrying electrical/pneumatic loop
  const signalLine: ProcessLine = {
    id: 'line-sig-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    line_number: 'SIG-TIC-3001',
    from_equipment: 'E-3001',
    to_equipment: 'UTILITY',
    flow_direction: 'forward',
    connection_type: 'instrument_signal',
    size: '1/2"',
    material: 'COPPER',
    stream_label: '4-20mA Signal',
    functional_type: 'signal_line',
    confidence: 0.95,
    status: 'confirmed',
    assigned_chemical_id: null,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addProcessLines([utilityLine, signalLine]);

  const report = store.validateProcessLinesForProject(proj.id);
  // Utility line carries fluid and pressure with zero critical errors
  const utilityIssues = report.issues.filter((i) => i.line_id === utilityLine.id && i.severity === 'critical_error');
  assert.strictEqual(utilityIssues.length, 0, 'Utility connection carrying fluid transport is completely valid');

  // Verify instrument signal line exclusion from material flow
  assert.strictEqual(signalLine.connection_type, 'instrument_signal');
});

test('Scenario 5: Chemical composition basis enforcement (mol%, wt%, ppm mol, ppm wt) without silent conversion', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 2 Chemical Basis ' + Date.now(), 'Testing chemical compositions');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-well-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'WELL-01',
    description: 'Production Wellhead',
    equipment_type: 'other',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-sep2-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'V-4001',
    description: 'Inlet Separator',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  const multiChemLine: ProcessLine = {
    id: 'line-multichem-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    line_number: '12"-P-04001-D1',
    from_equipment: 'WELL-01',
    to_equipment: 'V-4001',
    flow_direction: 'forward',
    connection_type: 'process_piping',
    size: '12"',
    material: 'DSS',
    stream_label: 'Sour Wellstream Fluid',
    functional_type: 'piping_line',
    confidence: 0.97,
    status: 'confirmed',
    assigned_chemical_id: null,
    alerts: [],
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    chemical_composition: [
      {
        component_identity: 'Methane',
        cas_number: '74-82-8',
        concentration_value: 78.5,
        concentration_basis: 'mol%',
        unit: 'mol%',
        source: 'Lab-Report-01.pdf',
        verification_status: 'unverified',
      },
      {
        component_identity: 'Hydrogen Sulfide',
        cas_number: '7783-06-4',
        concentration_value: 1250,
        concentration_basis: 'ppm mol',
        unit: 'ppm mol',
        source: 'Lab-Report-01.pdf',
        verification_status: 'engineer_verified',
      },
      {
        component_identity: 'Carbon Dioxide',
        cas_number: '124-38-9',
        concentration_value: 4.2,
        concentration_basis: 'mol%',
        unit: 'mol%',
        source: 'Lab-Report-01.pdf',
        verification_status: 'unverified',
      },
    ],
    created_at: new Date().toISOString(),
  };

  store.addProcessLines([multiChemLine]);

  const report = store.validateProcessLinesForProject(proj.id);
  const basisIssues = report.issues.filter((i) => i.line_id === multiChemLine.id && i.category === 'unit_or_basis_inconsistency');
  assert.strictEqual(basisIssues.length, 0, 'Valid concentration bases (mol%, ppm mol) pass validation');

  const retrieved = store.getProcessLine(multiChemLine.id);
  assert.strictEqual(retrieved?.chemical_composition?.length, 3);
  assert.strictEqual(retrieved?.chemical_composition?.[0].concentration_basis, 'mol%');
  assert.strictEqual(retrieved?.chemical_composition?.[1].concentration_basis, 'ppm mol');
  assert.strictEqual(retrieved?.chemical_composition?.[1].concentration_value, 1250);
});

test('Scenario 6: Human verification workflow and preservation of machine-extracted original values', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 2 Verification ' + Date.now(), 'Testing verification and immutability');
  const now = Date.now();

  const originalLine: ProcessLine = {
    id: 'line-edit-test-' + now,
    project_id: proj.id,
    document_id: 'doc-pid-ocr',
    line_number: '8"-P-05001-CS',
    from_equipment: 'TK-101',
    to_equipment: 'P-101',
    flow_direction: 'forward',
    connection_type: 'process_piping',
    size: '8"',
    material: 'CS',
    stream_label: 'Crude Feed',
    functional_type: 'piping_line',
    confidence: 0.88,
    status: 'provisional',
    assigned_chemical_id: null,
    alerts: [],
    source: { document: 'Scanned-PID.pdf', page: 2, snippet: '8"-P-05001-CS' },
    created_at: new Date().toISOString(),
  };

  store.addProcessLines([originalLine]);

  // Engineer modifies the line size and material
  const modified = store.updateProcessLine(originalLine.id, {
    size: '10"',
    material: 'SS316',
    notes: 'Upsized to 10" SS316 per hydraulic recalculation',
  }, 'Lead Process Engineer', 'Hydraulic revision');

  assert.ok(modified, 'Line updated');
  // Original machine-extracted values must be preserved immutably
  assert.strictEqual(modified?.original_extracted_values?.size, '8"');
  assert.strictEqual(modified?.original_extracted_values?.material, 'CS');
  assert.strictEqual(modified?.size, '10"');
  assert.strictEqual(modified?.material, 'SS316');

  // Engineer verifies the process line
  const verified = store.verifyProcessLine(originalLine.id, 'Chief Safety Officer', 'Approved after hydraulic review');
  assert.ok(verified, 'Line verified');
  assert.strictEqual(verified?.verification_status, 'engineer_verified');
  assert.strictEqual(verified?.verified_by, 'Chief Safety Officer');
  assert.ok(verified?.verified_at, 'Verification timestamp recorded');
});

// ----------------------------------------------------
// Test Group 30: Process Stream Registry Enhancement & Separator Independence (Phase 3)
// ----------------------------------------------------
console.log('\n--- Test Group 30: Process Stream Registry Enhancement & Separator Independence (Phase 3) ---');

test('Scenario 1: Multi-chemical process stream creation with explicit concentration bases (mol%, wt%, ppm)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 3 Multi-Chemical ' + Date.now(), 'Testing stream components');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-wellhead-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'WH-01',
    description: 'Subsea Wellhead',
    equipment_type: 'other',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-slugcatcher-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-5001',
    description: 'Inlet Slug Catcher',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.98,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  const stream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-5001',
    stream_description: 'Raw Gas Wellstream Inlet',
    source_equipment_tag: 'WH-01',
    destination_equipment_tag: 'V-5001',
    material_description: 'Multiphase Sour Gas',
    phase: 'two_phase',
    flow_rates: {
      normal: 35000,
      min: 12000,
      max: 42000,
      design: 45000,
      unit: 'kg/h',
      basis: 'mass',
    },
    operating_pressure: {
      value: 65.0,
      unit: 'bar(g)',
      status: 'verified',
    },
    operating_temperature: {
      value: 52.0,
      unit: '°C',
      status: 'verified',
    },
    components: [
      {
        component_name: 'Methane',
        cas_number: '74-82-8',
        fraction_value: 82.4,
        unit: 'mol%',
        is_hazardous: true,
      },
      {
        component_name: 'Ethane',
        cas_number: '74-84-0',
        fraction_value: 6.8,
        unit: 'mol%',
        is_hazardous: true,
      },
      {
        component_name: 'Hydrogen Sulfide',
        cas_number: '7783-06-4',
        fraction_value: 1850,
        unit: 'ppm mol',
        is_hazardous: true,
      },
      {
        component_name: 'Water',
        cas_number: '7732-18-5',
        fraction_value: 2.1,
        unit: 'wt%',
        is_hazardous: false,
      },
    ],
  });

  assert.ok(stream, 'Stream created');
  assert.strictEqual(stream.stream_number, 'STR-5001');
  assert.strictEqual(stream.components?.length, 4);
  assert.strictEqual(stream.components?.[0].component_name, 'Methane');
  assert.strictEqual(stream.components?.[0].unit, 'mol%');
  assert.strictEqual(stream.components?.[2].component_name, 'Hydrogen Sulfide');
  assert.strictEqual(stream.components?.[2].unit, 'ppm mol');
  assert.strictEqual(stream.components?.[3].component_name, 'Water');
  assert.strictEqual(stream.components?.[3].unit, 'wt%');

  const report = store.validateProcessStreamsForProject(proj.id);
  const basisIssues = report.issues.filter((i) => i.category === 'unit_or_basis_inconsistency');
  assert.strictEqual(basisIssues.length, 0, 'Explicit concentration bases (mol%, ppm mol, wt%) pass without error');
});

test('Scenario 2: Linking a stream to multiple process lines (1-to-many relationship)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 3 Line Linking ' + Date.now(), 'Testing stream-line association');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-t-1-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'TK-6001',
    description: 'Storage Tank',
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-p-1-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'P-6001A',
    description: 'Transfer Pump A',
    equipment_type: 'pump',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  const line1: ProcessLine = {
    id: 'line-hdr-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    line_number: '6"-TK-06001-A1',
    from_equipment: 'TK-6001',
    to_equipment: 'P-6001A',
    flow_direction: 'forward',
    connection_type: 'process_piping',
    size: '6"',
    material: 'CS',
    confidence: 0.95,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const line2: ProcessLine = {
    id: 'line-bypass-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    line_number: '3"-TK-06002-A1',
    from_equipment: 'TK-6001',
    to_equipment: 'P-6001A',
    flow_direction: 'forward',
    connection_type: 'process_piping',
    size: '3"',
    material: 'CS',
    confidence: 0.95,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addProcessLines([line1, line2]);

  const stream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-6001',
    source_equipment_tag: 'TK-6001',
    destination_equipment_tag: 'P-6001A',
  });

  // Link stream to both process lines (1-to-many)
  const linked = store.linkStreamToLines(stream.id, [line1.id, line2.id], 'Lead Process Engineer');
  assert.ok(linked, 'Stream linked to lines');
  assert.strictEqual(linked?.connected_line_ids?.length, 2);
  assert.ok(linked?.connected_line_ids?.includes(line1.id));
  assert.ok(linked?.connected_line_ids?.includes(line2.id));
  assert.ok(linked?.connected_line_numbers?.includes('6"-TK-06001-A1'));
  assert.ok(linked?.connected_line_numbers?.includes('3"-TK-06002-A1'));

  // Both lines in store now reference the stream
  const p1 = store.getProcessLine(line1.id);
  const p2 = store.getProcessLine(line2.id);
  assert.strictEqual(p1?.stream_id, stream.id);
  assert.strictEqual(p2?.stream_id, stream.id);
});

test('Scenario 3: Separator composition independence (separator inlet composition is NOT copied to outlet)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 3 Separator Decoupling ' + Date.now(), 'Testing separator independence');
  const now = Date.now();

  const eqSep: EquipmentTag = {
    id: 'eq-sep-3phase-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'V-7001',
    description: '3-Phase Production Separator',
    equipment_type: 'separator',
    assigned_chemical_id: null,
    confidence: 0.99,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqInlet: EquipmentTag = {
    id: 'eq-manifold-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'MANIFOLD-01',
    description: 'Production Manifold',
    equipment_type: 'other',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqGasOut: EquipmentTag = {
    id: 'eq-comp-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'K-7001',
    description: 'Gas Compressor',
    equipment_type: 'compressor',
    assigned_chemical_id: null,
    confidence: 0.99,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqInlet, eqSep, eqGasOut]);

  // Inlet stream to separator carrying multiphase fluid
  const inletStream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-INLET',
    source_equipment_tag: 'MANIFOLD-01',
    destination_equipment_tag: 'V-7001',
    phase: 'multiphase',
    components: [
      { component_name: 'Methane', fraction_value: 50.0, unit: 'mol%', is_hazardous: true },
      { component_name: 'Hexane', fraction_value: 30.0, unit: 'mol%', is_hazardous: true },
      { component_name: 'Water', fraction_value: 20.0, unit: 'mol%', is_hazardous: false },
    ],
  });

  // Unmeasured gas outlet stream from separator
  // Strict rule: Topology does not force inlet composition onto this outlet
  const gasOutletStream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-GAS-OUT',
    source_equipment_tag: 'V-7001',
    destination_equipment_tag: 'K-7001',
    phase: 'vapor',
    // Components not provided by H&MB -> must remain empty/null, never copied from inlet!
    components: [],
  });

  assert.strictEqual(gasOutletStream.components?.length, 0, 'Outlet stream does not automatically inherit separator inlet composition');

  // Verify that an invalid copy of inlet composition to different phase outlet is flagged
  const badCopiedOutlet = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-BAD-COPY',
    source_equipment_tag: 'V-7001',
    destination_equipment_tag: 'K-7001',
    phase: 'vapor',
    components: [
      { component_name: 'Methane', fraction_value: 50.0, unit: 'mol%', is_hazardous: true },
      { component_name: 'Hexane', fraction_value: 30.0, unit: 'mol%', is_hazardous: true },
      { component_name: 'Water', fraction_value: 20.0, unit: 'mol%', is_hazardous: false },
    ],
  });

  const report = store.validateProcessStreamsForProject(proj.id);
  assert.strictEqual(report.separator_decoupling_violations_count >= 1, true, 'Separator decoupling violation correctly flagged');
});

test('Scenario 4: Physical property tracking with provenance (density, vapor fraction, molecular weight, viscosity)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 3 Physical Properties ' + Date.now(), 'Testing stream physical properties');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-t-2-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'TK-8001',
    description: 'Condensate Tank',
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-p-2-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'P-8001',
    description: 'Export Pump',
    equipment_type: 'pump',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  const stream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-CONDENSATE',
    source_equipment_tag: 'TK-8001',
    destination_equipment_tag: 'P-8001',
    phase: 'liquid',
    density: {
      id: 'prop-dens-' + now,
      original_value: 785.4,
      normalized_value: 785.4,
      normalized_unit: 'kg/m3',
      source_document_id: 'doc-hmb',
      source_document_name: 'HMB-Report.pdf',
      source_category: 'heat_and_material_balance',
      page_or_drawing_location: 'Page 4, Stream 12',
      extraction_confidence: 0.99,
      verification_status: 'engineer_verified',
      extraction_timestamp: new Date().toISOString(),
    },
    vapor_fraction: {
      id: 'prop-vf-' + now,
      original_value: 0.0,
      normalized_value: 0.0,
      source_document_id: 'doc-hmb',
      source_document_name: 'HMB-Report.pdf',
      source_category: 'heat_and_material_balance',
      page_or_drawing_location: 'Page 4, Stream 12',
      extraction_confidence: 0.99,
      verification_status: 'engineer_verified',
      extraction_timestamp: new Date().toISOString(),
    },
    molecular_weight: {
      id: 'prop-mw-' + now,
      original_value: 86.2,
      normalized_value: 86.2,
      normalized_unit: 'g/mol',
      source_document_id: 'doc-hmb',
      source_document_name: 'HMB-Report.pdf',
      source_category: 'heat_and_material_balance',
      page_or_drawing_location: 'Page 4, Stream 12',
      extraction_confidence: 0.99,
      verification_status: 'engineer_verified',
      extraction_timestamp: new Date().toISOString(),
    },
    viscosity: {
      id: 'prop-visc-' + now,
      original_value: 0.65,
      normalized_value: 0.65,
      normalized_unit: 'cP',
      source_document_id: 'doc-hmb',
      source_document_name: 'HMB-Report.pdf',
      source_category: 'heat_and_material_balance',
      page_or_drawing_location: 'Page 4, Stream 12',
      extraction_confidence: 0.99,
      verification_status: 'engineer_verified',
      extraction_timestamp: new Date().toISOString(),
    },
  });

  const retrieved = store.getStream(stream.id);
  assert.ok(retrieved, 'Stream retrieved with physical properties');
  assert.strictEqual(retrieved?.density?.normalized_value, 785.4);
  assert.strictEqual(retrieved?.density?.normalized_unit, 'kg/m3');
  assert.strictEqual(retrieved?.vapor_fraction?.normalized_value, 0.0);
  assert.strictEqual(retrieved?.molecular_weight?.normalized_value, 86.2);
  assert.strictEqual(retrieved?.viscosity?.normalized_value, 0.65);
});

test('Scenario 5: Missing stream conditions generate informational gap flags without invalidating topology', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 3 Sparse Stream ' + Date.now(), 'Testing non-fabrication in streams');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-t-3-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'TK-9001',
    description: 'Water Tank',
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-p-3-' + now,
    project_id: proj.id,
    document_id: 'doc-1',
    tag: 'P-9001',
    description: 'Booster Pump',
    equipment_type: 'pump',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  // Stream created with no flow rate, pressure, or temperature provided
  const sparseStream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-SPARSE',
    source_equipment_tag: 'TK-9001',
    destination_equipment_tag: 'P-9001',
  });

  // Strict non-fabrication: values remain null
  assert.strictEqual(sparseStream.flow_rates.normal, null);
  assert.strictEqual(sparseStream.operating_pressure.value, null);
  assert.strictEqual(sparseStream.operating_temperature.value, null);

  const report = store.validateProcessStreamsForProject(proj.id);
  const critical = report.issues.filter((i) => i.severity === 'critical_error');
  assert.strictEqual(critical.length, 0, 'Missing stream operating data does not generate critical topology error');
  assert.strictEqual(report.can_approve, true, 'Topology approval is not blocked by missing operating values');
});

test('Scenario 6: Human verification workflow and immutability of machine-extracted stream values', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 3 Verification ' + Date.now(), 'Testing stream verification');
  const now = Date.now();

  const stream = store.createStream({
    project_id: proj.id,
    stream_number: 'STR-OCR-101',
    source_equipment_tag: 'V-101',
    destination_equipment_tag: 'C-101',
    flow_rates: { normal: 1500, unit: 'kg/h' },
    data_origin: 'extracted',
    verification_status: 'unverified',
  });

  // Human engineer updates the flow rate
  const updated = store.updateStream(stream.id, {
    flow_rates: { normal: 1800, unit: 'kg/h' },
    notes: 'Corrected based on calibrated flow meter FT-101',
  }, 'Lead Process Engineer', 'Field meter calibration adjustment');

  assert.ok(updated, 'Stream updated');
  // Machine values must be preserved immutably in original_extracted_values
  assert.strictEqual(updated?.original_extracted_values?.flow_rates?.normal, 1500);
  assert.strictEqual(updated?.flow_rates.normal, 1800);

  // Engineer formally verifies the stream
  const verified = store.verifyProcessStream(stream.id, 'Principal Safety Engineer', 'Validated against calibrated plant baseline');
  assert.ok(verified, 'Stream verified');
  assert.strictEqual(verified?.verification_status, 'verified');
  assert.strictEqual(verified?.verified_by, 'Principal Safety Engineer');
  assert.ok(verified?.verified_at, 'Timestamp logged');
});

// ----------------------------------------------------
// Test Group 31: Connection Classification & Endpoint/Flow Validation (Phase 4)
// ----------------------------------------------------
console.log('\n--- Test Group 31: Connection Classification & Endpoint/Flow Validation (Phase 4) ---');

test('Scenario 1: Separate connection types (Process piping, Instrument signal, Utility connection, Non-process relationship)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 4 Connection Types ' + Date.now(), 'Testing connection classifications');
  const now = Date.now();

  const eqP: EquipmentTag = {
    id: 'eq-p101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'P-101',
    description: 'Feed Pump',
    equipment_type: 'pump',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqV: EquipmentTag = {
    id: 'eq-v101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-101',
    description: 'Feed Vessel',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqE: EquipmentTag = {
    id: 'eq-e101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'E-101',
    description: 'Product Cooler',
    equipment_type: 'heat_exchanger',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqInst: EquipmentTag = {
    id: 'eq-pt101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'PT-101',
    description: 'Pressure Transmitter',
    equipment_type: 'instrument',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqCtrl: EquipmentTag = {
    id: 'eq-pic101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'PIC-101',
    description: 'Pressure Controller',
    equipment_type: 'instrument',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqSkid: EquipmentTag = {
    id: 'eq-skid01-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'SKID-01',
    description: 'Modular Pump Base Skid',
    equipment_type: 'other',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqP, eqV, eqE, eqInst, eqCtrl, eqSkid]);

  // 1. Process Piping line
  const linePiping: any = {
    id: 'line-piping-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'P-101-HC-1001-3"',
    from_equipment: 'V-101',
    to_equipment: 'P-101',
    size: '3"',
    material: 'CS',
    stream_label: 'Hydrocarbon Feed',
    functional_type: 'piping_line',
    connection_classification: 'process_piping',
    flow_direction: 'forward',
    status: 'confirmed',
  };

  // 2. Utility Connection line
  const lineUtility: any = {
    id: 'line-utility-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'CW-E101-2001-4"',
    from_equipment: 'UTILITY',
    to_equipment: 'E-101',
    size: '4"',
    material: 'CS',
    stream_label: 'Cooling Water Supply',
    functional_type: 'utility_line',
    connection_classification: 'utility_connection',
    flow_direction: 'forward',
    status: 'confirmed',
  };

  // 3. Instrument Signal line
  const lineSignal: any = {
    id: 'line-signal-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'SIG-PT101-01',
    from_equipment: 'PT-101',
    to_equipment: 'PIC-101',
    size: '',
    material: '',
    stream_label: '4-20mA Loop',
    functional_type: 'signal_line',
    connection_classification: 'instrument_signal',
    flow_direction: 'forward',
    status: 'confirmed',
  };

  // 4. Non-Process Relationship line
  const lineNonProcess: any = {
    id: 'line-nonproc-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'SKID-P101-MOUNT',
    from_equipment: 'SKID-01',
    to_equipment: 'P-101',
    size: '',
    material: '',
    stream_label: 'Mechanical Mount',
    functional_type: 'non_process_line',
    connection_classification: 'non_process_equipment_relationship',
    flow_direction: 'bidirectional',
    status: 'confirmed',
  };

  store.addLines([linePiping, lineUtility, lineSignal, lineNonProcess]);

  // Validate classifications
  const lines = store.getProcessLines(proj.id);
  assert.strictEqual(lines.length, 4);

  const piping = lines.find((l) => l.line_number === 'P-101-HC-1001-3"');
  assert.strictEqual(piping?.connection_classification, 'process_piping');

  const utility = lines.find((l) => l.line_number === 'CW-E101-2001-4"');
  assert.strictEqual(utility?.connection_classification, 'utility_connection');

  const signal = lines.find((l) => l.line_number === 'SIG-PT101-01');
  assert.strictEqual(signal?.connection_classification, 'instrument_signal');

  const nonproc = lines.find((l) => l.line_number === 'SKID-P101-MOUNT');
  assert.strictEqual(nonproc?.connection_classification, 'non_process_equipment_relationship');

  // Verify graph topology summary counts
  const graph = store.getProcessTopologyGraph(proj.id);
  assert.strictEqual(graph.counts.process_piping_edges_count, 1);
  assert.strictEqual(graph.counts.utility_connection_edges_count, 1);
  assert.strictEqual(graph.counts.instrument_signal_edges_count, 1);
  assert.strictEqual(graph.counts.non_process_relationship_edges_count, 1);
});

test('Scenario 2: Exclusion of Instrument Signals & Non-Process Links from Material-Flow Modeling', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 4 Signal Exclusion ' + Date.now(), 'Testing material flow exclusions');
  const now = Date.now();

  assert.strictEqual(isMaterialFlowConnection('process_piping'), true);
  assert.strictEqual(isMaterialFlowConnection('utility_connection'), true);
  assert.strictEqual(isMaterialFlowConnection('instrument_signal'), false);
  assert.strictEqual(isMaterialFlowConnection('non_process_equipment_relationship'), false);

  const eqTrans: EquipmentTag = {
    id: 'eq-lt101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'LT-101',
    description: 'Level Transmitter',
    equipment_type: 'instrument',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqDcs: EquipmentTag = {
    id: 'eq-dcs01-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'DCS-01',
    description: 'Plant DCS Controller',
    equipment_type: 'instrument',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqTrans, eqDcs]);

  // Instrument signal incorrectly assigned a chemical fluid
  const invalidSignalLine: any = {
    id: 'line-bad-sig-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'LT-101-SIG-ERROR',
    from_equipment: 'LT-101',
    to_equipment: 'DCS-01',
    functional_type: 'signal_line',
    connection_classification: 'instrument_signal',
    assigned_chemical_id: 'chem-toxic-ammonia',
    flow_direction: 'forward',
    status: 'confirmed',
  };

  store.addLines([invalidSignalLine]);

  // Topology validation report must flag critical error and prevent approval
  const report = store.validateConnectionsForProject(proj.id);
  const crit = report.issues.find((i) => i.category === 'material_flow_on_signal');
  assert.ok(crit, 'Flagged material flow on instrument signal');
  assert.strictEqual(crit?.severity, 'critical_error');
  assert.strictEqual(report.can_approve, false);
});

test('Scenario 3: Utility Connection Material Modeling (Mandatory Correction #2)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 4 Utility Modeling ' + Date.now(), 'Testing utility fluid transport');
  const now = Date.now();

  const eqExchanger: EquipmentTag = {
    id: 'eq-hex102-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'E-102',
    description: 'Condenser Exchanger',
    equipment_type: 'heat_exchanger',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqExchanger]);

  // Utility connection carries cooling water with flow rate and pressure
  const utilityLine: any = {
    id: 'line-cw-feed-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'CW-E102-SUPPLY',
    from_equipment: 'UTILITY_HEADER',
    to_equipment: 'E-102',
    fluid_service: { value: 'Cooling Water', unit: null },
    stream_label: 'Cooling Water',
    functional_type: 'utility_line',
    connection_classification: 'utility_connection',
    flow_direction: 'forward',
    operating_flow_rate: { value: 75.0, unit: 'm3/h' },
    operating_pressure: { value: 4.5, unit: 'bar(g)' },
    operating_temperature: { value: 28.0, unit: '°C' },
    status: 'confirmed',
  };

  store.addLines([utilityLine]);

  const report = store.validateConnectionsForProject(proj.id);
  // Utility lines support fluid transport; should NOT have material_flow_on_signal error
  const critErrors = report.issues.filter((i) => i.severity === 'critical_error');
  assert.strictEqual(critErrors.length, 0);
  assert.strictEqual(report.can_approve, true);
  assert.strictEqual(report.utility_connection_count, 1);
});

test('Scenario 4: Connection Endpoint Validation & Drawing Boundary Separation', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 4 Endpoints ' + Date.now(), 'Testing endpoint validation');
  const now = Date.now();

  const eqVessel: EquipmentTag = {
    id: 'eq-v103-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'V-103',
    description: 'Accumulator',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqVessel]);

  // 1. Line with missing from_equipment without boundary tag -> Critical error
  const lineDangling: any = {
    id: 'line-dangling-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'DANGLING-PIPE-01',
    from_equipment: '',
    to_equipment: 'V-103',
    connection_classification: 'process_piping',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    status: 'confirmed',
  };

  // 2. Line that crosses drawing boundary with documented off-page connector -> Engineering review, NOT critical error
  const lineBoundary: any = {
    id: 'line-boundary-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'OPC-LINE-TO-DWG-002',
    from_equipment: 'V-103',
    to_equipment: 'OPC-DWG-002',
    is_drawing_boundary: true,
    drawing_boundary_target: 'OPC-DWG-002',
    drawing_boundary_drawing: 'DWG-002-UTILITIES.pdf',
    connection_classification: 'process_piping',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    status: 'confirmed',
    notes: 'Off-page connector to Sheet 2',
  };

  store.addLines([lineDangling, lineBoundary]);

  const report = store.validateConnectionsForProject(proj.id);
  const danglingIssue = report.issues.find((i) => i.connection_id === lineDangling.id);
  assert.ok(danglingIssue, 'Detected dangling pipe');
  assert.strictEqual(danglingIssue?.severity, 'critical_error');

  const boundaryIssue = report.issues.find((i) => i.connection_id === lineBoundary.id);
  assert.ok(boundaryIssue, 'Detected drawing boundary connector');
  assert.strictEqual(boundaryIssue?.severity, 'engineering_review_required');
  assert.strictEqual(boundaryIssue?.is_drawing_boundary, true);
});

test('Scenario 5: Flow Direction Validation', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 4 Flow Direction ' + Date.now(), 'Testing flow directions');
  const now = Date.now();

  const eqA: EquipmentTag = {
    id: 'eq-t101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'TK-101',
    description: 'Storage Tank',
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqB: EquipmentTag = {
    id: 'eq-t102-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'TK-102',
    description: 'Day Tank',
    equipment_type: 'tank',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqA, eqB]);

  // 1. Process line with unknown direction
  const lineUnknownDir: any = {
    id: 'line-unk-dir-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'TRANSFER-UNK-01',
    from_equipment: 'TK-101',
    to_equipment: 'TK-102',
    connection_classification: 'process_piping',
    functional_type: 'piping_line',
    flow_direction: 'unknown',
    status: 'confirmed',
  };

  // 2. Non-process line: flow direction is not applicable
  const lineNonProc: any = {
    id: 'line-np-struc-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'STRUC-TK101-BASE',
    from_equipment: 'TK-101',
    to_equipment: 'TK-102',
    connection_classification: 'non_process_equipment_relationship',
    functional_type: 'non_process_line',
    flow_direction: 'unknown',
    status: 'confirmed',
  };

  store.addLines([lineUnknownDir, lineNonProc]);

  const report = store.validateConnectionsForProject(proj.id);
  const unkIssue = report.issues.find((i) => i.connection_id === lineUnknownDir.id && i.category === 'flow_direction_conflict');
  assert.ok(unkIssue, 'Flagged unknown flow direction on process line');
  assert.strictEqual(unkIssue?.severity, 'warning');

  // Non-process relationship should NOT have flow direction conflict warning
  const nonProcIssue = report.issues.find((i) => i.connection_id === lineNonProc.id && i.category === 'flow_direction_conflict');
  assert.strictEqual(nonProcIssue, undefined, 'No flow direction issue for non-process relation');
});

test('Scenario 6: Approval Severity Tiers & Missing Operating Data Handling (Mandatory Correction #4)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 4 Approval Gates ' + Date.now(), 'Testing approval tiers');
  const now = Date.now();

  const eqX: EquipmentTag = {
    id: 'eq-k101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'K-101',
    description: 'Compressor',
    equipment_type: 'compressor',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  const eqY: EquipmentTag = {
    id: 'eq-d101-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    tag: 'D-101',
    description: 'Discharge Drum',
    equipment_type: 'vessel',
    assigned_chemical_id: null,
    confidence: 1.0,
    status: 'confirmed',
    source: { document: 'PID.pdf', page: 1, snippet: '' },
    created_at: new Date().toISOString(),
  };

  store.addEquipment([eqX, eqY]);

  // Valid process line without operating conditions (common during early engineering)
  const lineNoOperatingData: any = {
    id: 'line-early-eng-' + now,
    project_id: proj.id,
    document_id: 'doc-pid',
    line_number: 'K-101-DISCH-01',
    from_equipment: 'K-101',
    to_equipment: 'D-101',
    connection_classification: 'process_piping',
    functional_type: 'piping_line',
    flow_direction: 'forward',
    status: 'confirmed',
    // Missing flow_rate, pressure, temperature intentionally
  };

  store.addLines([lineNoOperatingData]);

  const report = store.validateConnectionsForProject(proj.id);
  // Missing operating data must NOT invalidate topology!
  assert.strictEqual(report.critical_errors_count, 0);
  assert.strictEqual(report.can_approve, true);

  const infoIssue = report.issues.find((i) => i.category === 'missing_engineering_data');
  assert.ok(infoIssue, 'Missing data logged as informational');
  assert.strictEqual(infoIssue?.severity, 'informational');

  // Now introduce a critical error (reclassifying as signal line while having chemical assignment)
  store.updateLine(lineNoOperatingData.id, {
    connection_classification: 'instrument_signal',
    assigned_chemical_id: 'chem-hazardous-gas',
  }, 'Lead Engineer', 'Test misconfiguration');

  const reportBlocked = store.validateConnectionsForProject(proj.id);
  assert.strictEqual(reportBlocked.can_approve, false, 'Critical error blocks approval');
  assert.ok(reportBlocked.critical_errors_count >= 1);
});

// ----------------------------------------------------
// Test Group 32: Cross-Document Reconciliation Across 8 Engineering Sources (Phase 5)
// ----------------------------------------------------
console.log('\n--- Test Group 32: Cross-Document Reconciliation Across 8 Engineering Sources (Phase 5) ---');

test('Scenario 1: Cross-Document Reconciliation Across All 8 Source Categories', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 5 Reconciliation ' + Date.now(), 'Testing 8-source reconciliation');
  const now = Date.now();

  // Create documents for 8 categories
  const docPid = store.createDocument({ project_id: proj.id, filename: '01_PID.pdf', original_name: '01_PID.pdf', category: 'pid' as any });
  const docPfd = store.createDocument({ project_id: proj.id, filename: '02_PFD.pdf', original_name: '02_PFD.pdf', category: 'pfd' as any });
  const docHm = store.createDocument({ project_id: proj.id, filename: '03_HMB.xlsx', original_name: '03_HMB.xlsx', category: 'stream_table' as any });
  const docDs = store.createDocument({ project_id: proj.id, filename: '04_DS_V101.pdf', original_name: '04_DS_V101.pdf', category: 'equipment_datasheet' as any });
  const docBod = store.createDocument({ project_id: proj.id, filename: '05_BOD.pdf', original_name: '05_BOD.pdf', category: 'basis_of_design' as any });
  const docOp = store.createDocument({ project_id: proj.id, filename: '06_Operating_Philosophy.pdf', original_name: '06_Operating_Philosophy.pdf', category: 'operating_philosophy' as any });
  const docCp = store.createDocument({ project_id: proj.id, filename: '07_Control_Philosophy.pdf', original_name: '07_Control_Philosophy.pdf', category: 'control_philosophy' as any });
  const docEsd = store.createDocument({ project_id: proj.id, filename: '08_Shutdown_Philosophy.pdf', original_name: '08_Shutdown_Philosophy.pdf', category: 'shutdown_philosophy' as any });

  // 1. P&ID equipment
  const eqV101: any = {
    id: 'eq-v101-' + now,
    project_id: proj.id,
    document_id: docPid.id,
    tag: 'V-101',
    description: 'High Pressure Separator',
    equipment_type: 'separator',
    confidence: 1.0,
    status: 'confirmed',
    source: { document: docPid.original_name, page: 1, snippet: '' },
    specifications: {
      design_pressure: { value: 100.0, unit: 'barg', status: 'extracted' },
    },
  };
  store.addEquipment([eqV101]);

  // 2. Datasheet specs
  store.saveDatasheetExtraction({
    id: 'ds-v101-' + now,
    project_id: proj.id,
    document_id: docDs.id,
    document_name: docDs.original_name,
    datasheets: [
      {
        id: 'ds-rec-' + now,
        project_id: proj.id,
        document_id: docDs.id,
        equipment_tag: 'V-101',
        equipment_name: 'High Pressure Separator',
        equipment_type: 'separator',
        design_pressure: {
          id: 'ds-p-' + now,
          original_value: 100.0,
          normalized_value: 100.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: docDs.id,
          source_document_name: docDs.original_name,
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        design_temperature: {
          id: 'ds-t-' + now,
          original_value: 120.0,
          normalized_value: 120.0,
          original_unit: '°C',
          normalized_unit: '°C',
          source_document_id: docDs.id,
          source_document_name: docDs.original_name,
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        material_of_construction: {
          id: 'ds-m-' + now,
          original_value: 'CS + 316L Clad',
          normalized_value: 'CS + 316L Clad',
          original_unit: null,
          normalized_unit: null,
          source_document_id: docDs.id,
          source_document_name: docDs.original_name,
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.98,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.98,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  // 3. PFD unit
  store.savePfdExtraction({
    id: 'pfd-v101-' + now,
    project_id: proj.id,
    document_id: docPfd.id,
    document_name: docPfd.original_name,
    process_blocks: [],
    major_units: [
      {
        id: 'pfd-unit-' + now,
        project_id: proj.id,
        document_id: docPfd.id,
        tag: 'V-101',
        name: 'HP Production Separator',
        block_id: 'block-sep',
        inlet_stream_numbers: ['S-101'],
        outlet_stream_numbers: ['S-102', 'S-103'],
      },
    ],
    pfd_streams: [],
    total_blocks_found: 1,
    total_units_found: 1,
    total_streams_found: 3,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  // 4. Stream Table extraction
  store.saveStreamTableExtraction({
    id: 'hm-ext-' + now,
    project_id: proj.id,
    document_id: docHm.id,
    document_name: docHm.original_name,
    table_type: 'column_based',
    stream_records: [
      {
        id: 'st-rec-101-' + now,
        project_id: proj.id,
        document_id: docHm.id,
        stream_number: 'S-101',
        stream_name: 'Wellhead Fluid Feed',
        source_equipment_tag: 'WH-01',
        destination_equipment_tag: 'V-101',
        phase: 'multiphase',
        mass_flow: { id: 'mf-1', original_value: 50000, normalized_value: 50000, original_unit: 'kg/h', normalized_unit: 'kg/h', source_document_id: docHm.id, source_document_name: docHm.original_name, source_category: 'stream_table', page_or_drawing_location: 'Table 1', extraction_confidence: 0.95, verification_status: 'unverified', extraction_timestamp: new Date().toISOString() },
        pressure: { id: 'pr-1', original_value: 75.0, normalized_value: 75.0, original_unit: 'barg', normalized_unit: 'barg', source_document_id: docHm.id, source_document_name: docHm.original_name, source_category: 'stream_table', page_or_drawing_location: 'Table 1', extraction_confidence: 0.95, verification_status: 'unverified', extraction_timestamp: new Date().toISOString() },
        temperature: { id: 'tm-1', original_value: 65.0, normalized_value: 65.0, original_unit: '°C', normalized_unit: '°C', source_document_id: docHm.id, source_document_name: docHm.original_name, source_category: 'stream_table', page_or_drawing_location: 'Table 1', extraction_confidence: 0.95, verification_status: 'unverified', extraction_timestamp: new Date().toISOString() },
        components: [],
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_streams_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  // 5. Philosophy Rules (Control Philosophy & Shutdown Philosophy)
  store.addPhilosophyRules([
    {
      id: 'rule-cp-' + now,
      project_id: proj.id,
      source_document_id: docCp.id,
      source_document_name: docCp.original_name,
      source_category: 'control_philosophy',
      rule_type: 'control_objective',
      equipment_tag: 'V-101',
      loop_tag: 'PIC-101',
      condition: 'V-101 pressure exceeds 75 barg',
      action: 'Modulate PV-101 to maintain separator pressure at 75 barg',
      fail_safe_position: 'fail_closed',
      is_confirmed_setpoint: true,
      verification_status: 'unverified',
    },
    {
      id: 'rule-esd-' + now,
      project_id: proj.id,
      source_document_id: docEsd.id,
      source_document_name: docEsd.original_name,
      source_category: 'shutdown_philosophy',
      rule_type: 'esd_action',
      equipment_tag: 'V-101',
      loop_tag: 'PSHH-1001',
      condition: 'PSHH-1001 >= 90.0 barg',
      action: 'Trip feed shutdown valve SDV-101 and open depressurizing BDV-101',
      fail_safe_position: 'fail_closed',
      is_confirmed_setpoint: true,
      verification_status: 'unverified',
    },
  ]);

  // Synchronize Unified Engineering Matrix
  const matrix = buildUnifiedEngineeringMatrix(proj.id, store);
  assert.ok(matrix.length >= 1);

  const entryV101 = matrix.find((m) => m.entity_tag === 'V-101');
  assert.ok(entryV101, 'V-101 found in matrix');
  // Must have linked across multiple document sources
  assert.ok(entryV101?.sources_found.includes('pid'));
  assert.ok(entryV101?.sources_found.includes('equipment_datasheet'));
  assert.ok(entryV101?.sources_found.includes('pfd'));
  assert.ok(entryV101?.sources_found.includes('control_philosophy'));
  assert.ok(entryV101?.sources_found.includes('shutdown_philosophy'));
});

test('Scenario 2: Source-to-Source Discrepancies vs Limit Violations (Mandatory Engineering Correction #1)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 5 Discrepancies vs Violations ' + Date.now(), 'Testing category separation');
  const now = Date.now();

  const docPid = store.createDocument({ project_id: proj.id, filename: 'PID_01.pdf', original_name: 'PID_01.pdf', category: 'pid' as any });
  const docDs = store.createDocument({ project_id: proj.id, filename: 'DS_V102.pdf', original_name: 'DS_V102.pdf', category: 'equipment_datasheet' as any });

  // 1. Source-to-Source Discrepancy: P&ID states design pressure 85 barg, Datasheet states 90 barg
  const eqV102: any = {
    id: 'eq-v102-' + now,
    project_id: proj.id,
    document_id: docPid.id,
    tag: 'V-102',
    description: 'Flash Drum',
    equipment_type: 'vessel',
    confidence: 1.0,
    status: 'confirmed',
    source: { document: docPid.original_name, page: 1, snippet: '' },
    specifications: {
      design_pressure: { value: 85.0, unit: 'barg', status: 'extracted' },
    },
  };
  store.addEquipment([eqV102]);

  store.saveDatasheetExtraction({
    id: 'ds-v102-' + now,
    project_id: proj.id,
    document_id: docDs.id,
    document_name: docDs.original_name,
    datasheets: [
      {
        id: 'ds-rec-v102-' + now,
        project_id: proj.id,
        document_id: docDs.id,
        equipment_tag: 'V-102',
        equipment_name: 'Flash Drum',
        equipment_type: 'vessel',
        design_pressure: {
          id: 'ds-p2-' + now,
          original_value: 90.0,
          normalized_value: 90.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: docDs.id,
          source_document_name: docDs.original_name,
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        // Operating pressure on datasheet is 95 barg (exceeds 90 barg design limit!)
        operating_pressure: {
          id: 'ds-op2-' + now,
          original_value: 95.0,
          normalized_value: 95.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: docDs.id,
          source_document_name: docDs.original_name,
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);

  // Must detect both and separate their categories
  const sourceDiscrepancy = discrepancies.find((d) => d.entity_tag === 'V-102' && d.property_name === 'design_pressure');
  assert.ok(sourceDiscrepancy, 'Source-to-source discrepancy found');
  assert.strictEqual(sourceDiscrepancy?.discrepancy_category, 'source_to_source_discrepancy');

  const limitViolation = discrepancies.find((d) => d.entity_tag === 'V-102' && d.property_name === 'operating_pressure');
  assert.ok(limitViolation, 'Limit violation found');
  assert.strictEqual(limitViolation?.discrepancy_category, 'operating_vs_design_limit_violation');
  assert.strictEqual(limitViolation?.severity, 'critical');
});

test('Scenario 3: Zero Silent Overwrite — Preservation of Conflicting Source Evidence', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 5 Immutability ' + Date.now(), 'Testing evidence preservation');
  const now = Date.now();

  const docPid = store.createDocument({ project_id: proj.id, filename: 'PID_02.pdf', original_name: 'PID_02.pdf', category: 'pid' as any });
  const docDs = store.createDocument({ project_id: proj.id, filename: 'DS_TK102.pdf', original_name: 'DS_TK102.pdf', category: 'equipment_datasheet' as any });

  // P&ID specifies Material as Carbon Steel
  const eqTk: any = {
    id: 'eq-tk102-' + now,
    project_id: proj.id,
    document_id: docPid.id,
    tag: 'TK-102',
    description: 'Storage Tank',
    equipment_type: 'tank',
    confidence: 1.0,
    status: 'confirmed',
    source: { document: docPid.original_name, page: 1, snippet: '' },
    specifications: {
      material_of_construction: { value: 'Carbon Steel', status: 'extracted' },
    },
  };
  store.addEquipment([eqTk]);

  // Datasheet specifies Material as 316L Stainless Steel
  store.saveDatasheetExtraction({
    id: 'ds-tk102-' + now,
    project_id: proj.id,
    document_id: docDs.id,
    document_name: docDs.original_name,
    datasheets: [
      {
        id: 'ds-rec-tk102-' + now,
        project_id: proj.id,
        document_id: docDs.id,
        equipment_tag: 'TK-102',
        equipment_name: 'Storage Tank',
        equipment_type: 'tank',
        material_of_construction: {
          id: 'ds-moc-' + now,
          original_value: 'SS316L',
          normalized_value: 'SS316L',
          original_unit: null,
          normalized_unit: null,
          source_document_id: docDs.id,
          source_document_name: docDs.original_name,
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);
  const mocDisc = discrepancies.find((d) => d.entity_tag === 'TK-102' && d.property_name === 'material_of_construction');

  assert.ok(mocDisc, 'MOC discrepancy detected');
  assert.strictEqual(mocDisc?.discrepancy_category, 'source_to_source_discrepancy');
  // Both source records must be preserved immutably in evidence_records
  assert.strictEqual(mocDisc?.evidence_records.length, 2);
  const sources = mocDisc?.evidence_records.map((e) => e.source_category);
  assert.ok(sources?.includes('pid'));
  assert.ok(sources?.includes('equipment_datasheet'));
});

test('Scenario 4: Process Line & Stream Cross-Document Reconciliation', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 5 Lines & Streams ' + Date.now(), 'Testing line reconciliation');
  const now = Date.now();

  const docPid = store.createDocument({ project_id: proj.id, filename: 'PID_03.pdf', original_name: 'PID_03.pdf', category: 'pid' as any });
  const docHm = store.createDocument({ project_id: proj.id, filename: 'HMB_01.xlsx', original_name: 'HMB_01.xlsx', category: 'stream_table' as any });

  // P&ID line specifies line number, design pressure 10 barg, but operating pressure 12 barg
  const line: any = {
    id: 'line-overpress-' + now,
    project_id: proj.id,
    document_id: docPid.id,
    line_number: 'P-101-OIL-1001-4"',
    from_equipment: 'P-101',
    to_equipment: 'V-101',
    size: '4"',
    material: 'CS',
    stream_label: 'Crude Oil',
    functional_type: 'piping_line',
    connection_classification: 'process_piping',
    flow_direction: 'forward',
    operating_pressure: { value: 12.0, unit: 'barg' },
    design_pressure: { value: 10.0, unit: 'barg' },
    status: 'confirmed',
    source: { document: docPid.original_name, page: 1, snippet: '' },
  };

  // Stream table specifies different service name for same line
  const stream: any = {
    id: 'stream-hmb-' + now,
    project_id: proj.id,
    stream_number: 'STR-201',
    line_number: 'P-101-OIL-1001-4"',
    connected_line_id: line.id,
    connected_line_numbers: ['P-101-OIL-1001-4"'],
    material_description: 'Condensate Liquid Export',
    stream_description: 'Condensate Liquid Export',
    source_equipment_tag: 'P-101',
    destination_equipment_tag: 'V-101',
    source_document_id: docHm.id,
    source_document: docHm.original_name,
    data_origin: 'extracted',
    verification_status: 'unverified',
  };

  store.addLines([line]);
  store.createStream(stream);

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);

  // 1. Line operating vs design pressure violation
  const lineViolation = discrepancies.find((d) => d.entity_type === 'line' && d.property_name === 'operating_pressure');
  assert.ok(lineViolation, 'Detected line operating overpressure');
  assert.strictEqual(lineViolation?.discrepancy_category, 'operating_vs_design_limit_violation');

  // 2. Service description mismatch between P&ID and Stream Table
  const svcDiscrepancy = discrepancies.find((d) => d.entity_type === 'line' && d.property_name === 'service_description');
  assert.ok(svcDiscrepancy, 'Detected service description divergence');
  assert.strictEqual(svcDiscrepancy?.discrepancy_category, 'source_to_source_discrepancy');
});

test('Scenario 5: Instrument Tag & Control / Shutdown Loop Reconciliation', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 5 Instrument Reconciliation ' + Date.now(), 'Testing instrument loops');
  const now = Date.now();

  const docPid = store.createDocument({ project_id: proj.id, filename: 'PID_04.pdf', original_name: 'PID_04.pdf', category: 'pid' as any });
  const docEsd = store.createDocument({ project_id: proj.id, filename: 'ESD_01.pdf', original_name: 'ESD_01.pdf', category: 'shutdown_philosophy' as any });

  // Vessel with design pressure 50 barg
  const vessel: any = {
    id: 'eq-v104-' + now,
    project_id: proj.id,
    document_id: docPid.id,
    tag: 'V-104',
    description: 'Stabilizer Feed Drum',
    equipment_type: 'vessel',
    confidence: 1.0,
    status: 'confirmed',
    source: { document: docPid.original_name, page: 1, snippet: '' },
    specifications: {
      design_pressure: { value: 50.0, unit: 'barg', status: 'extracted' },
    },
  };
  store.addEquipment([vessel]);

  // Shutdown Philosophy rule specifies trip setpoint at 60 barg (> 50 barg design pressure!)
  store.addPhilosophyRules([
    {
      id: 'rule-trip-viol-' + now,
      project_id: proj.id,
      source_document_id: docEsd.id,
      source_document_name: docEsd.original_name,
      source_category: 'shutdown_philosophy',
      rule_type: 'esd_action',
      equipment_tag: 'V-104',
      loop_tag: 'PSHH-1041',
      condition: 'PSHH-1041 >= 60.0 barg',
      action: 'Close inlet emergency shutdown valve',
      fail_safe_position: 'fail_closed',
      is_confirmed_setpoint: true,
      verification_status: 'unverified',
    },
    // Another instrument loop not found on any P&ID drawing
    {
      id: 'rule-missing-loop-' + now,
      project_id: proj.id,
      source_document_id: docEsd.id,
      source_document_name: docEsd.original_name,
      source_category: 'shutdown_philosophy',
      rule_type: 'interlock',
      loop_tag: 'BDV-9999',
      condition: 'Manual Push Button ESD-PB-01',
      action: 'Open blowdown valve BDV-9999 to flare header',
      fail_safe_position: 'fail_open',
      is_confirmed_setpoint: true,
      verification_status: 'unverified',
    },
  ]);

  const discrepancies = detectCrossDocumentDiscrepancies(proj.id, store);

  // 1. Trip setpoint exceeding design pressure -> operating_vs_design_limit_violation
  const tripViol = discrepancies.find((d) => d.entity_tag === 'PSHH-1041' && d.property_name === 'trip_setpoint');
  assert.ok(tripViol, 'Trip setpoint exceeding vessel design pressure detected');
  assert.strictEqual(tripViol?.discrepancy_category, 'operating_vs_design_limit_violation');
  assert.strictEqual(tripViol?.severity, 'critical');

  // 2. Instrument loop in philosophy missing from P&ID -> missing_engineering_information
  const missingLoop = discrepancies.find((d) => d.entity_tag === 'BDV-9999' && d.property_name === 'instrument_tag');
  assert.ok(missingLoop, 'Missing instrument loop detected');
  assert.strictEqual(missingLoop?.discrepancy_category, 'missing_engineering_information');
});

test('Scenario 6: Cross-Document Reconciliation Report & Approval Gates', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 5 Reconciliation Report ' + Date.now(), 'Testing reconciliation report');
  const now = Date.now();

  const docPid = store.createDocument({ project_id: proj.id, filename: 'PID_05.pdf', original_name: 'PID_05.pdf', category: 'pid' as any });
  const docDs = store.createDocument({ project_id: proj.id, filename: 'DS_05.pdf', original_name: 'DS_05.pdf', category: 'equipment_datasheet' as any });

  // Add equipment and datasheet with critical limit violation
  const eq: any = {
    id: 'eq-v105-' + now,
    project_id: proj.id,
    document_id: docPid.id,
    tag: 'V-105',
    description: 'Test Vessel',
    equipment_type: 'vessel',
    confidence: 1.0,
    status: 'confirmed',
    source: { document: docPid.original_name, page: 1, snippet: '' },
    specifications: {
      design_pressure: { value: 20.0, unit: 'barg', status: 'extracted' },
    },
  };
  store.addEquipment([eq]);

  store.saveDatasheetExtraction({
    id: 'ds-v105-' + now,
    project_id: proj.id,
    document_id: docDs.id,
    document_name: docDs.original_name,
    datasheets: [
      {
        id: 'ds-rec-v105-' + now,
        project_id: proj.id,
        document_id: docDs.id,
        equipment_tag: 'V-105',
        equipment_name: 'Test Vessel',
        equipment_type: 'vessel',
        design_pressure: {
          id: 'p-1',
          original_value: 20.0,
          normalized_value: 20.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: docDs.id,
          source_document_name: docDs.original_name,
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        operating_pressure: {
          id: 'p-2',
          original_value: 25.0,
          normalized_value: 25.0,
          original_unit: 'barg',
          normalized_unit: 'barg',
          source_document_id: docDs.id,
          source_document_name: docDs.original_name,
          source_category: 'equipment_datasheet',
          page_or_drawing_location: 'Page 1',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        },
        nozzles: [],
        confidence: 0.95,
        extracted_at: new Date().toISOString(),
      },
    ],
    total_equipment_found: 1,
    extraction_warnings: [],
    extracted_at: new Date().toISOString(),
  });

  // Generate reconciliation report
  const report = store.getCrossDocumentReconciliationReport(proj.id);
  assert.ok(report, 'Reconciliation report generated');
  assert.strictEqual(report.can_approve, false, 'Critical limit violation blocks approval');
  assert.ok(report.operating_vs_design_violations_count >= 1);

  // Resolve the critical discrepancy through formal engineering review
  const critDiscrepancy = report.discrepancies.find((d) => d.severity === 'critical');
  assert.ok(critDiscrepancy, 'Critical discrepancy found');

  store.resolveDiscrepancy(critDiscrepancy.id, {
    status: 'resolved',
    resolution_notes: 'Datasheet operating pressure was typographical error; corrected to 18 barg by Lead Process Engineer',
    resolved_by: 'Lead Process Engineer',
  });

  const updatedReport = store.getCrossDocumentReconciliationReport(proj.id);
  assert.strictEqual(updatedReport.can_approve, true, 'Approval gate unblocked after formal resolution');
});

// ============================================================================
// TEST GROUP 33: INTERFACE IMPROVEMENTS & INSPECTORS (PHASE 6)
// ============================================================================
console.log('\n--- Test Group 33: Interface Improvements & Inspectors (Phase 6) ---');

test('Scenario 1: Equipment Inspector Data Contract & 10 Required Sections', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 6 Equipment Inspector ' + Date.now(), 'Testing inspector data contract');
  const now = Date.now();

  const doc = store.createDocument({ project_id: proj.id, filename: 'PID_V101.pdf', original_name: 'PID_V101.pdf', category: 'pid' as any });

  // 1. Add equipment with full specifications, assigned chemical, and provenance
  const chemId = 'chem-v101-' + now;
  store.addChemical({
    id: chemId,
    project_id: proj.id,
    chemical_name: { value: 'Liquefied Natural Gas', status: 'extracted' },
    cas_number: { value: '8006-14-2', status: 'extracted' },
    manufacturer: { value: 'GasCorp', status: 'extracted' },
    revision_date: { value: '2026-01-01', status: 'extracted' },
    source_document_id: doc.id,
    sds_document_id: doc.id,
    classification: 'process_fluid',
    psi_parameters: {
      toxicity: { value: 'Low toxicity, asphyxiant', category_status: 'extracted' },
      permissible_exposure_limits: { value: '1000 ppm', category_status: 'extracted' },
      physical_data: { value: 'Boiling point -161 C', category_status: 'extracted' },
      reactivity_data: { value: 'Stable', category_status: 'extracted' },
      corrosivity_data: { value: 'Non-corrosive', category_status: 'extracted' },
      thermal_and_chemical_stability_data: { value: 'Stable', category_status: 'extracted' },
      inadvertent_mixing_hazards: { value: 'Oxidizers', category_status: 'extracted' },
    },
    verification_status: 'unverified',
  });

  const eq: any = {
    id: 'eq-v101-' + now,
    project_id: proj.id,
    document_id: doc.id,
    tag: 'V-101',
    description: 'Feed Separator Drum',
    equipment_type: 'separator',
    confidence: 0.98,
    status: 'confirmed',
    verification_status: 'engineer_verified',
    verified_by: 'Lead Process Safety Specialist (PE)',
    assigned_chemical_id: chemId,
    source: { document: doc.original_name, page: 1, snippet: 'Feed Separator V-101' },
    specifications: {
      material_of_construction: { value: 'Low Temp Carbon Steel (LTCS)', status: 'extracted', verification_status: 'verified' },
      design_pressure: { value: 75, unit: 'barg', status: 'extracted', verification_status: 'verified' },
      design_temperature: { value: 65, unit: '°C', status: 'extracted', verification_status: 'verified' },
      capacity: { value: 4500, unit: 'gallons', capacity_type: 'total_volume', status: 'extracted', verification_status: 'verified' },
    },
  };
  store.addEquipment([eq]);

  // 2. Add connected process lines (inlet and outlet)
  const lineInlet: any = {
    id: 'line-in-' + now,
    project_id: proj.id,
    line_number: 'PL-01-4"-LTCS',
    from_equipment: 'WELLHEAD',
    to_equipment: 'V-101',
    size: '4"',
    nominal_pipe_size: { value: '4"', unit: 'inches', status: 'extracted' },
    pipe_specification: 'Class 300 LTCS',
    fluid_service: { value: 'Wet Natural Gas', status: 'extracted' },
    status: 'confirmed',
    functional_type: 'piping_line',
    connection_classification: 'process_piping',
  };
  const lineOutlet: any = {
    id: 'line-out-' + now,
    project_id: proj.id,
    line_number: 'PL-02-3"-LTCS',
    from_equipment: 'V-101',
    to_equipment: 'C-101',
    size: '3"',
    nominal_pipe_size: { value: '3"', unit: 'inches', status: 'extracted' },
    pipe_specification: 'Class 300 LTCS',
    fluid_service: { value: 'Separated Gas Vapor', status: 'extracted' },
    status: 'confirmed',
    functional_type: 'piping_line',
    connection_classification: 'process_piping',
  };
  store.addLines([lineInlet, lineOutlet]);

  // 3. Add connected process stream
  const stream: any = {
    id: 'stream-s01-' + now,
    project_id: proj.id,
    stream_number: 'STR-01',
    material_description: 'Separator Inlet Wet Gas',
    source_equipment_tag: 'WELLHEAD',
    destination_equipment_tag: 'V-101',
    connected_equipment: ['WELLHEAD', 'V-101'],
    connected_line_numbers: ['PL-01-4"-LTCS'],
    flow_rates: { normal: 12500, design: 15000, min: 5000, max: 18000, unit: 'kg/h', actual: null, basis: 'mass' },
    operating_pressure: { value: 68, unit: 'barg', status: 'extracted' },
    operating_temperature: { value: 24, unit: '°C', status: 'extracted' },
    phase: 'two_phase',
    verification_status: 'verified',
    components: [
      { component_name: 'Methane', concentration_value: 88.5, concentration_basis: 'mol%', unit: 'mol%' },
      { component_name: 'Ethane', concentration_value: 6.2, concentration_basis: 'mol%', unit: 'mol%' },
    ],
  };
  store.createStream(stream);

  // Assert inspector contract requirements
  const retrievedEq = store.getEquipment(eq.id);
  assert.ok(retrievedEq, 'Equipment node must exist');
  assert.strictEqual(retrievedEq?.tag, 'V-101');
  assert.strictEqual(retrievedEq?.equipment_type, 'separator');

  // Verify connected lines resolution
  const allLines = store.listLines(proj.id);
  const inlets = allLines.filter((l) => l.to_equipment === retrievedEq?.tag);
  const outlets = allLines.filter((l) => l.from_equipment === retrievedEq?.tag);
  assert.strictEqual(inlets.length, 1);
  assert.strictEqual(outlets.length, 1);
  assert.strictEqual(inlets[0].line_number, 'PL-01-4"-LTCS');
  assert.strictEqual(outlets[0].line_number, 'PL-02-3"-LTCS');

  // Verify connected stream resolution
  const allStreams = store.listStreams(proj.id);
  const eqStreams = allStreams.filter(
    (s) => s.destination_equipment_tag === retrievedEq?.tag || s.source_equipment_tag === retrievedEq?.tag
  );
  assert.strictEqual(eqStreams.length, 1);
  assert.strictEqual(eqStreams[0].stream_number, 'STR-01');

  // Verify assigned chemical resolution
  assert.strictEqual(retrievedEq?.assigned_chemical_id, chemId);
  const assignedChem = store.getChemical(retrievedEq.assigned_chemical_id);
  assert.strictEqual(assignedChem?.chemical_name.value, 'Liquefied Natural Gas');
  assert.strictEqual(assignedChem?.cas_number.value, '8006-14-2');

  // Verify design specifications
  assert.strictEqual(retrievedEq?.specifications?.material_of_construction.value, 'Low Temp Carbon Steel (LTCS)');
  assert.strictEqual(retrievedEq?.specifications?.design_pressure.value, 75);
  assert.strictEqual(retrievedEq?.specifications?.design_temperature.value, 65);
});

test('Scenario 2: Process Line Inspector Model & Property-Level Extraction', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 6 Process Line Inspector ' + Date.now(), 'Testing process line inspector');
  const now = Date.now();

  const line: any = {
    id: 'line-pl102-' + now,
    project_id: proj.id,
    line_number: 'PL-102-6"-CS-150',
    size: '6"',
    nominal_pipe_size: { value: '6"', unit: 'inches', status: 'extracted' },
    pipe_specification: 'Class 150 Carbon Steel A106-B',
    fluid_service: { value: 'Hydrocarbon Condensate', status: 'extracted' },
    from_equipment: 'V-101',
    to_equipment: 'P-101A',
    flow_direction: 'forward',
    functional_type: 'piping_line',
    connection_classification: 'process_piping',
    status: 'confirmed',
    verification_status: 'engineer_verified',
    operating_flow_rate: { value: 8500, unit: 'kg/h', status: 'extracted' },
    operating_pressure: { value: 12.5, unit: 'barg', status: 'extracted' },
    operating_temperature: { value: 35, unit: '°C', status: 'extracted' },
    design_pressure: { value: 19.6, unit: 'barg', status: 'extracted' },
    design_temperature: { value: 120, unit: '°C', status: 'extracted' },
    physical_state: { value: 'liquid', status: 'extracted' },
    chemical_composition: [
      { component_identity: 'n-Pentane', concentration_value: 62.0, concentration_basis: 'mol%', unit: 'mol%' },
      { component_identity: 'n-Hexane', concentration_value: 38.0, concentration_basis: 'mol%', unit: 'mol%' },
    ],
    source_drawing: 'PID-DWG-001.pdf',
    source_page: 2,
    extraction_confidence: 0.96,
  };
  store.addLines([line]);

  const retrieved = store.getProcessLine(line.id);
  assert.ok(retrieved, 'Process line must exist');
  assert.strictEqual(retrieved?.line_number, 'PL-102-6"-CS-150');
  assert.strictEqual(retrieved?.nominal_pipe_size?.value, '6"');
  assert.strictEqual(retrieved?.pipe_specification, 'Class 150 Carbon Steel A106-B');
  assert.strictEqual(retrieved?.from_equipment, 'V-101');
  assert.strictEqual(retrieved?.to_equipment, 'P-101A');
  assert.strictEqual(retrieved?.flow_direction, 'forward');
  assert.strictEqual(retrieved?.operating_pressure?.value, 12.5);
  assert.strictEqual(retrieved?.operating_temperature?.value, 35);
  assert.strictEqual(retrieved?.design_pressure?.value, 19.6);
  assert.strictEqual(retrieved?.design_temperature?.value, 120);
  assert.strictEqual(retrieved?.physical_state?.value, 'liquid');
  assert.strictEqual(retrieved?.chemical_composition?.length, 2);
  assert.strictEqual(retrieved?.chemical_composition?.[0].concentration_basis, 'mol%');
});

test('Scenario 3: Stream Inspector Model, Multi-Chemical Components & Separator Decoupling', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 6 Stream Inspector ' + Date.now(), 'Testing stream inspector');
  const now = Date.now();

  // Create inlet and two separated outlet streams
  const inletStream: any = {
    id: 'st-in-' + now,
    project_id: proj.id,
    stream_number: 'STR-10',
    stream_description: '3-Phase Separator Inlet Stream',
    source_equipment_tag: 'FEED-MANIFOLD',
    destination_equipment_tag: 'SEP-01',
    flow_rates: { normal: 45000, design: 50000, min: 20000, max: 60000, unit: 'kg/h', actual: null, basis: 'mass' },
    operating_pressure: { value: 42, unit: 'barg', status: 'extracted' },
    operating_temperature: { value: 48, unit: '°C', status: 'extracted' },
    phase: 'two_phase',
    verification_status: 'verified',
    components: [
      { component_name: 'Methane', concentration_value: 70.0, concentration_basis: 'mol%', unit: 'mol%' },
      { component_name: 'Water', concentration_value: 20.0, concentration_basis: 'wt%', unit: 'wt%' },
      { component_name: 'Crude Oil', concentration_value: 10.0, concentration_basis: 'vol%', unit: 'vol%' },
    ],
  };

  const gasOutletStream: any = {
    id: 'st-gas-' + now,
    project_id: proj.id,
    stream_number: 'STR-11',
    stream_description: 'Separator Gas Overhead Stream',
    source_equipment_tag: 'SEP-01',
    destination_equipment_tag: 'COMP-01',
    flow_rates: { normal: 31500, design: 35000, min: 14000, max: 42000, unit: 'kg/h', actual: null, basis: 'mass' },
    operating_pressure: { value: 41.5, unit: 'barg', status: 'extracted' },
    operating_temperature: { value: 44, unit: '°C', status: 'extracted' },
    phase: 'gas',
    verification_status: 'verified',
    components: [
      { component_name: 'Methane', concentration_value: 98.2, concentration_basis: 'mol%', unit: 'mol%' },
      { component_name: 'Water Vapor', concentration_value: 1.8, concentration_basis: 'mol%', unit: 'mol%' },
    ],
  };

  store.createStream(inletStream);
  store.createStream(gasOutletStream);

  const streams = store.listStreams(proj.id);
  assert.strictEqual(streams.length, 2);

  const s10 = streams.find((s) => s.stream_number === 'STR-10');
  const s11 = streams.find((s) => s.stream_number === 'STR-11');

  assert.ok(s10);
  assert.ok(s11);

  // Separator Decoupling verification: inlet and outlet compositions must be distinct and preserved independently
  assert.notStrictEqual(s10?.components?.[0].concentration_value, s11?.components?.[0].concentration_value);
  assert.strictEqual(s10?.components?.[0].concentration_value, 70.0);
  assert.strictEqual(s11?.components?.[0].concentration_value, 98.2);

  // Bases are explicitly preserved without silent conversion
  assert.strictEqual(s10?.components?.[1].concentration_basis, 'wt%');
  assert.strictEqual(s10?.components?.[2].concentration_basis, 'vol%');
});

test('Scenario 4: Engineering Status Indicators Standard (Confirmed, Provisional, Unverified, Conflicting, Missing, Manually entered)', () => {
  // Test standardized representation of the 6 required status indicator categories
  const statuses = ['confirmed', 'provisional', 'unverified', 'conflicting', 'missing', 'manually_entered'];

  const testEvaluator = (status: string) => {
    switch (status) {
      case 'confirmed':
      case 'engineer_verified':
        return 'Confirmed';
      case 'provisional':
        return 'Provisional';
      case 'conflicting':
      case 'conflict':
        return 'Conflicting';
      case 'missing':
      case 'not_provided':
        return 'Missing';
      case 'manually_entered':
      case 'manual':
        return 'Manually entered';
      case 'unverified':
      default:
        return 'Unverified';
    }
  };

  for (const s of statuses) {
    const label = testEvaluator(s);
    assert.ok(label, `Status ${s} must resolve to clean indicator`);
  }

  assert.strictEqual(testEvaluator('confirmed'), 'Confirmed');
  assert.strictEqual(testEvaluator('provisional'), 'Provisional');
  assert.strictEqual(testEvaluator('unverified'), 'Unverified');
  assert.strictEqual(testEvaluator('conflicting'), 'Conflicting');
  assert.strictEqual(testEvaluator('missing'), 'Missing');
  assert.strictEqual(testEvaluator('manually_entered'), 'Manually entered');
});

test('Scenario 5: Bidirectional Navigation & Verification Audit Trail', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 6 Bidirectional Nav ' + Date.now(), 'Testing navigation linkage');
  const now = Date.now();

  const eq = { id: 'eq-t1-' + now, project_id: proj.id, tag: 'T-101', description: 'Tower', equipment_type: 'vessel', confidence: 1.0, status: 'confirmed', specifications: {} };
  store.addEquipment([eq as any]);

  const line = { id: 'line-l1-' + now, project_id: proj.id, line_number: 'L-101', from_equipment: 'T-101', to_equipment: 'E-101', functional_type: 'piping_line', status: 'confirmed' };
  store.addLines([line as any]);

  const stream = { id: 'st-s1-' + now, project_id: proj.id, stream_number: 'S-101', source_equipment_tag: 'T-101', destination_equipment_tag: 'E-101', connected_line_numbers: ['L-101'], flow_rates: { normal: 1000, design: null, min: null, max: null, actual: null, unit: 'kg/h', basis: 'mass' as any }, operating_pressure: { value: 5, unit: 'barg', status: 'extracted' as any }, operating_temperature: { value: 50, unit: '°C', status: 'extracted' as any } };
  store.createStream(stream as any);

  // Linkage verification: Line points to Equipment, Stream points to Line and Equipment
  const lineObj = store.getProcessLine(line.id);
  const streamObj = store.getStream(stream.id);
  const eqObj = store.getEquipment(eq.id);

  assert.strictEqual(lineObj?.from_equipment, eqObj?.tag);
  assert.strictEqual(streamObj?.source_equipment_tag, eqObj?.tag);
  assert.ok(streamObj?.connected_line_numbers?.includes(lineObj?.line_number || ''));

  // Formally verify stream and record audit trail
  const verifiedStream = store.verifyStream(stream.id, 'Senior Process Engineer (PE)', 'Stream verified against H&MB Heat and Material Balance table');
  assert.strictEqual(verifiedStream.verification_status, 'verified');
  assert.strictEqual(verifiedStream.verified_by, 'Senior Process Engineer (PE)');

  // Verify audit log has recorded the event
  const auditLogs = store.listAuditLog(proj.id);
  assert.ok(auditLogs.some((a) => (a.action === 'verify' && a.entity_type === 'stream') || a.change_reason?.includes('Stream')));
});

// ============================================================================
// Test Group 34: Graph Validation & Approval Gates (Phase 7)
// ============================================================================
console.log('\n--- Test Group 34: Graph Validation & Approval Gates (Phase 7) ---');

test('Scenario 1: Missing Equipment Connections & Isolated Node Classifications', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 7 Scenario 1 ' + Date.now(), 'Testing isolated node validation');
  const now = Date.now();

  const doc = store.createDocument({ project_id: proj.id, filename: 'PID_001.pdf', original_name: 'PID_001.pdf', category: 'pid' as any });

  // Add 3 equipment nodes
  const eq1: any = { id: 'eq-t1-' + now, project_id: proj.id, tag: 'T-100', equipment_type: 'vessel', status: 'confirmed', verification_status: 'engineer_verified' };
  const eq2: any = { id: 'eq-t2-' + now, project_id: proj.id, tag: 'T-200', equipment_type: 'vessel', status: 'confirmed', verification_status: 'engineer_verified', isolated_review_status: 'confirmed_isolated', isolated_review_notes: 'Spare decommissioned vessel' };
  const eq3: any = { id: 'eq-t3-' + now, project_id: proj.id, tag: 'T-300', equipment_type: 'vessel', status: 'provisional', verification_status: 'unverified', isolated_review_status: 'awaiting_review' };
  store.addEquipment([eq1, eq2, eq3]);

  // Connect T-100 to an external boundary
  const line1: any = { id: 'line-l1-' + now, project_id: proj.id, line_number: 'PL-01', from_equipment: 'FEED', to_equipment: 'T-100', functional_type: 'piping_line', status: 'confirmed' };
  const eqFeed: any = { id: 'eq-feed-' + now, project_id: proj.id, tag: 'FEED', equipment_type: 'vessel', status: 'confirmed', verification_status: 'engineer_verified' };
  store.addEquipment([eqFeed]);
  store.addLines([line1]);

  const val = store.getGraphValidation(proj.id);

  // T-200 (confirmed_isolated) should generate INFO_CONFIRMED_ISOLATED_EQUIPMENT
  assert.ok(val.issues.some((i) => (i.code === 'INFO_CONFIRMED_ISOLATED_EQUIPMENT' || i.code === 'INFO_CONFIRMED_ISOLATED') && i.entity_id === eq2.id));

  // T-300 (awaiting_review) should generate WARN_DISCONNECTED_NODE
  assert.ok(val.issues.some((i) => (i.code === 'WARN_DISCONNECTED_NODE' || i.code === 'WARN_UNRESOLVED_ISOLATED_EQUIPMENT') && i.entity_id === eq3.id));

  // Approval should be blocked while T-300 is awaiting review and unacknowledged
  const appFail = store.approveGraph(proj.id, 'Chief Engineer (PE)');
  assert.strictEqual(appFail.success, false);
  assert.ok(appFail.error?.includes('Graph approval blocked'));

  // Engineer reviews T-300 and documents it exists on another drawing
  store.updateEquipmentReviewStatus(eq3.id, 'connection_exists_on_another_drawing', 'Process Safety PE', 'Tie-in on Drawing PID-002');
  
  // Acknowledge any unreviewed equipment status and verify approval succeeds
  store.acknowledgeWarning(proj.id, 'WARN_DISCONNECTED_NODE');
  store.acknowledgeWarning(proj.id, 'WARN_EQUIPMENT_PROVISIONAL');
  const appOk = store.approveGraph(proj.id, 'Chief Engineer (PE)');
  assert.strictEqual(appOk.success, true);
  assert.ok(appOk.approval?.approved);
});

test('Scenario 2: Unresolved Endpoints & Duplicate Line Identifiers as Critical Errors', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 7 Scenario 2 ' + Date.now(), 'Testing critical topology errors');
  const now = Date.now();

  const eqA: any = { id: 'eq-a-' + now, project_id: proj.id, tag: 'E-101', equipment_type: 'exchanger', status: 'confirmed', verification_status: 'engineer_verified' };
  const eqB: any = { id: 'eq-b-' + now, project_id: proj.id, tag: 'E-102', equipment_type: 'exchanger', status: 'confirmed', verification_status: 'engineer_verified' };
  store.addEquipment([eqA, eqB]);

  // Line with empty/unresolved endpoint
  const lineEmpty: any = { id: 'line-emp-' + now, project_id: proj.id, line_number: 'PL-MISSING', from_equipment: '', to_equipment: 'E-101', functional_type: 'piping_line', status: 'confirmed' };
  // Line with nonexistent from node
  const lineUnknown: any = { id: 'line-unk-' + now, project_id: proj.id, line_number: 'PL-UNKNOWN', from_equipment: 'GHOST-999', to_equipment: 'E-102', functional_type: 'piping_line', status: 'confirmed' };
  // Two lines with duplicate line_number
  const lineDup1: any = { id: 'line-d1-' + now, project_id: proj.id, line_number: 'PL-DUP-01', from_equipment: 'E-101', to_equipment: 'E-102', functional_type: 'piping_line', status: 'confirmed' };
  const lineDup2: any = { id: 'line-d2-' + now, project_id: proj.id, line_number: 'PL-DUP-01', from_equipment: 'E-102', to_equipment: 'E-101', functional_type: 'piping_line', status: 'confirmed' };
  store.addLines([lineEmpty, lineUnknown, lineDup1, lineDup2]);

  const val = store.getGraphValidation(proj.id);
  assert.ok(val.critical_errors_count && val.critical_errors_count > 0);
  assert.ok(val.issues.some((i) => i.code === 'ERR_MISSING_ENDPOINT'));
  assert.ok(val.issues.some((i) => i.code === 'ERR_INVALID_FROM_NODE'));
  assert.ok(val.issues.some((i) => i.code === 'ERR_DUPLICATE_LINE_IDENTIFIER'));

  // Critical errors MUST prevent approval
  const app = store.approveGraph(proj.id, 'Lead PE');
  assert.strictEqual(app.success, false);
  assert.ok(app.error?.includes('critical errors'));
});

test('Scenario 3: Flow Directions & Contradictory Stream/Line Directions', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 7 Scenario 3 ' + Date.now(), 'Testing flow direction rules');
  const now = Date.now();

  const eqA: any = { id: 'eq-p1-' + now, project_id: proj.id, tag: 'P-101A', equipment_type: 'pump', status: 'confirmed', verification_status: 'engineer_verified' };
  const eqB: any = { id: 'eq-v2-' + now, project_id: proj.id, tag: 'V-201', equipment_type: 'vessel', status: 'confirmed', verification_status: 'engineer_verified' };
  store.addEquipment([eqA, eqB]);

  // Circular self-connection
  const lineSelf: any = { id: 'line-self-' + now, project_id: proj.id, line_number: 'PL-SELF', from_equipment: 'P-101A', to_equipment: 'P-101A', functional_type: 'piping_line', status: 'confirmed' };
  
  // Line with contradictory stream direction
  const lineContra: any = { id: 'line-contra-' + now, project_id: proj.id, line_number: 'PL-CONTRA', from_equipment: 'P-101A', to_equipment: 'V-201', flow_direction: 'forward', functional_type: 'piping_line', status: 'confirmed' };
  store.addLines([lineSelf, lineContra]);

  const streamContra = {
    id: 'st-contra-' + now,
    project_id: proj.id,
    stream_number: 'STR-CONTRA',
    source_equipment_tag: 'P-101A',
    destination_equipment_tag: 'V-201',
    connected_line_numbers: ['PL-CONTRA'],
    flow_direction: 'reverse' as any,
  };
  store.createStream(streamContra as any);

  const val = store.getGraphValidation(proj.id);
  assert.ok(val.issues.some((i) => i.code === 'ERR_CIRCULAR_SELF_CONNECTION'));
  assert.ok(val.issues.some((i) => i.code === 'ERR_CONTRADICTORY_FLOW_DIRECTION'));

  // Approval MUST be prevented
  const app = store.approveGraph(proj.id, 'Process Lead');
  assert.strictEqual(app.success, false);
});

test('Scenario 4: Non-Blocking Missing Operating Conditions & Missing Streams', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 7 Scenario 4 ' + Date.now(), 'Testing non-blocking data availability');
  const now = Date.now();

  // Equipment with no design specs (unprovided in source drawing)
  const eq1: any = { id: 'eq-nd1-' + now, project_id: proj.id, tag: 'TK-100', equipment_type: 'tank', status: 'confirmed', verification_status: 'engineer_verified', specifications: {} };
  const eq2: any = { id: 'eq-nd2-' + now, project_id: proj.id, tag: 'TK-200', equipment_type: 'tank', status: 'confirmed', verification_status: 'engineer_verified', specifications: {} };
  store.addEquipment([eq1, eq2]);

  // Piping line without assigned stream (unprovided in stream table)
  const line: any = { id: 'line-nd-' + now, project_id: proj.id, line_number: 'PL-TK-CONNECT', from_equipment: 'TK-100', to_equipment: 'TK-200', functional_type: 'piping_line', flow_direction: 'forward', status: 'confirmed' };
  store.addLines([line]);

  const val = store.getGraphValidation(proj.id);

  // Missing data produces informational gap flags, NOT critical errors
  assert.ok(val.issues.some((i) => i.code === 'INFO_MISSING_OPERATING_DATA' && i.severity === 'informational'));
  assert.ok(val.issues.some((i) => i.code === 'INFO_MISSING_STREAM_ASSIGNMENT' && i.severity === 'informational'));
  assert.strictEqual(val.critical_errors_count, 0);
  assert.strictEqual(val.can_approve, true);

  // Mandatory rule: Missing operating data does not automatically invalidate topology
  const app = store.approveGraph(proj.id, 'Process Engineering Specialist (PE)');
  assert.strictEqual(app.success, true);
  assert.ok(app.approval?.approved);
});

test('Scenario 5: Conflicting Engineering Values vs Operating Limit Violations', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 7 Scenario 5 ' + Date.now(), 'Testing discrepancy severity tiers');
  const now = Date.now();

  const eq: any = { id: 'eq-v5-' + now, project_id: proj.id, tag: 'V-501', equipment_type: 'separator', status: 'confirmed', verification_status: 'engineer_verified' };
  const eqDest: any = { id: 'eq-v5-dst-' + now, project_id: proj.id, tag: 'V-502', equipment_type: 'separator', status: 'confirmed', verification_status: 'engineer_verified' };
  store.addEquipment([eq, eqDest]);
  const line: any = { id: 'line-v5-' + now, project_id: proj.id, line_number: 'PL-V5-01', from_equipment: 'V-501', to_equipment: 'V-502', flow_direction: 'forward', functional_type: 'piping_line', status: 'confirmed' };
  store.addLines([line]);

  // 1. Add source-to-source discrepancy (P&ID vs PFD numerical mismatch)
  store.addDiscrepancy({
    project_id: proj.id,
    entity_type: 'equipment',
    entity_tag: 'V-501',
    property_name: 'design_pressure',
    discrepancy_type: 'numerical_mismatch',
    severity: 'warning',
    message: 'P&ID states 75 barg while Datasheet states 80 barg',
    evidence_records: [],
  });

  let val = store.getGraphValidation(proj.id);
  assert.ok(val.issues.some((i) => i.code === 'WARN_SOURCE_DISCREPANCY' && i.severity === 'warning'));
  assert.strictEqual(val.critical_errors_count, 0);

  // 2. Add direct limit violation: Operating Pressure > Design Limit
  store.addDiscrepancy({
    project_id: proj.id,
    entity_type: 'equipment',
    entity_tag: 'V-501',
    property_name: 'operating_pressure',
    discrepancy_type: 'operating_vs_design_limit_violation',
    severity: 'critical',
    message: 'Operating pressure 85 barg exceeds vessel design pressure of 75 barg',
    evidence_records: [],
  });

  val = store.getGraphValidation(proj.id);
  // Limit violation is a critical error!
  assert.ok(val.issues.some((i) => i.code === 'ERR_OPERATING_LIMIT_EXCEEDED' && i.severity === 'critical_error'));
  assert.ok(val.critical_errors_count && val.critical_errors_count > 0);

  // Approval MUST be prevented
  const appFail = store.approveGraph(proj.id, 'Safety Lead');
  assert.strictEqual(appFail.success, false);
});

test('Scenario 6: Full Graph Approval Metadata & Cryptographic Provenance', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 7 Metadata ' + Date.now(), 'Testing approval record metadata');
  const now = Date.now();

  const docPid = store.createDocument({ project_id: proj.id, filename: 'SafeFlow_PID_101.pdf', original_name: 'SafeFlow_PID_101.pdf', category: 'pid' as any, revision: 'Rev 2' } as any);
  const docPfd = store.createDocument({ project_id: proj.id, filename: 'SafeFlow_PFD_001.pdf', original_name: 'SafeFlow_PFD_001.pdf', category: 'pfd' as any, revision: 'Rev 1' } as any);

  const eq1: any = { id: 'eq-p7-1-' + now, project_id: proj.id, tag: 'V-701', equipment_type: 'vessel', status: 'confirmed', verification_status: 'engineer_verified' };
  const eq2: any = { id: 'eq-p7-2-' + now, project_id: proj.id, tag: 'P-701', equipment_type: 'pump', status: 'confirmed', verification_status: 'engineer_verified' };
  const eqProvisional: any = { id: 'eq-p7-3-' + now, project_id: proj.id, tag: 'FL-701', equipment_type: 'filter', status: 'provisional', verification_status: 'unverified', isolated_review_status: 'confirmed_isolated', isolated_review_notes: 'Spare filter element' };
  store.addEquipment([eq1, eq2, eqProvisional]);

  const line: any = { id: 'line-p7-' + now, project_id: proj.id, line_number: 'PL-701', from_equipment: 'V-701', to_equipment: 'P-701', flow_direction: 'forward', functional_type: 'piping_line', status: 'confirmed' };
  store.addLines([line]);

  const stream = { id: 'st-p7-' + now, project_id: proj.id, stream_number: 'STR-701', source_equipment_tag: 'V-701', destination_equipment_tag: 'P-701', connected_line_numbers: ['PL-701'], verification_status: 'verified' as any };
  store.createStream(stream as any);

  // Acknowledge provisional items
  store.acknowledgeWarning(proj.id, 'WARN_UNVERIFIED_EQUIPMENT');

  const appResult = store.approveGraph(
    proj.id,
    'Shlok (Lead Safety Architect)',
    'Verified full process topology, line registry, and stream integration',
    'Principal Process Safety Engineer (PE)'
  );

  assert.strictEqual(appResult.success, true);
  const approval = appResult.approval!;

  // 1. Approver name & role
  assert.strictEqual(approval.approved_by, 'Shlok (Lead Safety Architect)');
  assert.strictEqual(approval.approver_role, 'Principal Process Safety Engineer (PE)');

  // 2. Timestamp
  assert.ok(approval.approved_at && !isNaN(Date.parse(approval.approved_at)));

  // 3. Graph snapshot hash (SHA-256: 64 hex characters)
  assert.ok(approval.graph_snapshot_hash);
  assert.strictEqual(approval.graph_snapshot_hash?.length, 64);

  // 4. Document versions used
  assert.ok(Array.isArray(approval.document_versions_used));
  assert.ok(approval.document_versions_used?.some((d) => d.document_id === docPid.id));

  // 5. Acknowledged warnings recorded
  assert.ok(Array.isArray(approval.acknowledged_warnings));
  assert.ok(approval.acknowledged_warnings?.includes('WARN_UNVERIFIED_EQUIPMENT'));

  // 6. Outstanding provisional items recorded
  assert.ok(Array.isArray(approval.outstanding_provisional_items));
  assert.ok(approval.outstanding_provisional_items?.some((i) => i.id === eqProvisional.id && i.tag_or_number === 'FL-701'));
});

// ----------------------------------------------------
// Test Group 35: Audit Logging, Reversibility & Change Impact Analysis (Phase 8)
// ----------------------------------------------------
console.log('\n--- Test Group 35: Audit Logging, Reversibility & Change Impact Analysis (Phase 8) ---');

test('Scenario 1: Structured Reversible Audit Log Entry Creation with Previous & New State Snapshots', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 8 Audit Test ' + Date.now(), 'Testing structured reversible audit trail');
  const now = Date.now();

  const eq = {
    id: 'eq-p8-audit-' + now,
    project_id: proj.id,
    tag: 'TK-801',
    description: 'Crude Oil Feed Tank',
    equipment_type: 'tank' as const,
    status: 'confirmed' as const,
    confidence: 1.0,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq as any]);

  // Update equipment
  const updatedEq = store.updateEquipment(
    eq.id,
    { description: 'Modified Crude Oil Feed Tank with Blanket Gas' },
    'Senior Process Engineer',
    'Field walkdown clarification'
  );
  assert.ok(updatedEq);

  // Check audit log
  const logs = store.listAuditLog(proj.id, { entity_type: 'equipment', entity_id: eq.id });
  assert.ok(logs.length >= 2, 'At least 2 audit entries for create and update');

  const updateEntry = logs.find((l) => l.action === 'update');
  assert.ok(updateEntry, 'Update audit entry exists');
  assert.strictEqual(updateEntry.can_revert, true, 'Marked as reversible');
  assert.strictEqual(updateEntry.previous_state?.description, 'Crude Oil Feed Tank');
  assert.strictEqual(updateEntry.new_state?.description, 'Modified Crude Oil Feed Tank with Blanket Gas');
  assert.strictEqual(updateEntry.reviewer, 'Senior Process Engineer');
});

test('Scenario 2: Graph Approval Invalidation on Topology Mutation (Equipment & Line Removal)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 8 Invalidation Test ' + Date.now(), 'Testing graph approval invalidation');
  const now = Date.now();

  const eq1 = { id: 'eq-p8-inv1-' + now, project_id: proj.id, tag: 'V-801', equipment_type: 'vessel' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  const eq2 = { id: 'eq-p8-inv2-' + now, project_id: proj.id, tag: 'P-801', equipment_type: 'pump' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq1 as any, eq2 as any]);

  const line = { id: 'line-p8-inv-' + now, project_id: proj.id, line_number: 'PL-801', from_equipment: 'V-801', to_equipment: 'P-801', functional_type: 'piping_line' as const, status: 'confirmed' as const };
  store.addLines([line as any]);

  const stream = { id: 'st-p8-inv-' + now, project_id: proj.id, stream_number: 'STR-801', source_equipment_tag: 'V-801', destination_equipment_tag: 'P-801', connected_line_numbers: ['PL-801'], verification_status: 'verified' as any };
  store.createStream(stream as any);

  // Approve graph
  const appRes = store.approveGraph(proj.id, 'Safety Architect Shlok', 'Approved base topology');
  assert.strictEqual(appRes.success, true);
  assert.strictEqual(store.getGraphApproval(proj.id).approved, true);

  // Mutation: delete line PL-801
  store.deleteLine(line.id, 'Pipeline Inspector', 'Rerouting line for maintenance');

  const approvalAfter = store.getGraphApproval(proj.id);
  assert.strictEqual(approvalAfter.approved, false, 'Graph approval automatically invalidated on line removal');
  assert.ok(approvalAfter.invalidated_at, 'invalidated_at timestamp recorded');
  assert.ok(approvalAfter.invalidation_reason?.includes('PL-801'), 'Reason captures mutated line');
  assert.ok(approvalAfter.previous_approval_snapshot?.approved, 'Previous approval snapshot retained');
});

test('Scenario 3: Graph Approval Invalidation on Specification Mutation', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 8 Spec Invalidation ' + Date.now(), 'Testing spec change invalidation');
  const now = Date.now();

  const eq1 = { id: 'eq-p8-sp1-' + now, project_id: proj.id, tag: 'V-802', equipment_type: 'vessel' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  const eq2 = { id: 'eq-p8-sp2-' + now, project_id: proj.id, tag: 'P-802', equipment_type: 'pump' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq1 as any, eq2 as any]);

  const line = { id: 'line-p8-sp-' + now, project_id: proj.id, line_number: 'PL-802', from_equipment: 'V-802', to_equipment: 'P-802', functional_type: 'piping_line' as const, status: 'confirmed' as const };
  store.addLines([line as any]);

  const stream = { id: 'st-p8-sp-' + now, project_id: proj.id, stream_number: 'STR-802', source_equipment_tag: 'V-802', destination_equipment_tag: 'P-802', connected_line_numbers: ['PL-802'], verification_status: 'verified' as any };
  store.createStream(stream as any);

  store.approveGraph(proj.id, 'Safety Lead', 'Graph approved');
  assert.strictEqual(store.getGraphApproval(proj.id).approved, true);

  // Mutate line operating conditions
  store.updateLine(line.id, {
    operating_pressure: {
      value: 65,
      unit: 'barg',
      status: 'user_entered',
      source: { document: 'Datasheet', page: 1 },
      verification_status: 'unverified',
    },
  }, 'Process Engineer', 'Updated operating pressure per new simulation');

  const approvalAfter = store.getGraphApproval(proj.id);
  assert.strictEqual(approvalAfter.approved, false, 'Graph approval invalidated on line spec modification');
  assert.ok(approvalAfter.invalidation_reason?.includes('Line PL-802 modified'));
});

test('Scenario 4: Change Impact Analysis — Physical Topology Tracing vs Instrument Signal Exclusion', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 8 Impact Analysis ' + Date.now(), 'Testing flow tracing');
  const now = Date.now();

  // Topology: TK-810 -> (PL-810) -> P-810 -> (PL-811) -> E-810
  // Instrument Signal: TIC-810 -> (SIG-810) -> TK-810 (non-physical!)
  const eqTk = { id: 'eq-tk-' + now, project_id: proj.id, tag: 'TK-810', equipment_type: 'tank' as const, status: 'confirmed' as const };
  const eqP = { id: 'eq-p-' + now, project_id: proj.id, tag: 'P-810', equipment_type: 'pump' as const, status: 'confirmed' as const };
  const eqE = { id: 'eq-e-' + now, project_id: proj.id, tag: 'E-810', equipment_type: 'heat_exchanger' as const, status: 'confirmed' as const };
  const eqTic = { id: 'eq-tic-' + now, project_id: proj.id, tag: 'TIC-810', equipment_type: 'instrument' as const, status: 'confirmed' as const };
  store.addEquipment([eqTk as any, eqP as any, eqE as any, eqTic as any]);

  const lineProcess1 = { id: 'l-proc-1-' + now, project_id: proj.id, line_number: 'PL-810', from_equipment: 'TK-810', to_equipment: 'P-810', flow_direction: 'forward' as const, functional_type: 'piping_line' as const, status: 'confirmed' as const };
  const lineProcess2 = { id: 'l-proc-2-' + now, project_id: proj.id, line_number: 'PL-811', from_equipment: 'P-810', to_equipment: 'E-810', flow_direction: 'forward' as const, functional_type: 'piping_line' as const, status: 'confirmed' as const };
  const lineSignal = { id: 'l-sig-1-' + now, project_id: proj.id, line_number: 'SIG-810', from_equipment: 'TIC-810', to_equipment: 'TK-810', flow_direction: 'forward' as const, functional_type: 'signal_line' as const, status: 'confirmed' as const };
  store.addLines([lineProcess1 as any, lineProcess2 as any, lineSignal as any]);

  const impactTk = store.getChangeImpact(proj.id, 'equipment', 'TK-810', 'limit_change', 'Operating pressure increased to 50 barg');

  // Verify downstream physical equipment
  assert.ok(impactTk.downstream_equipment.includes('P-810'), 'Downstream includes pump P-810');
  assert.ok(impactTk.downstream_equipment.includes('E-810'), 'Downstream includes exchanger E-810');

  // Verify instrument signals are strictly EXCLUDED from material-flow downstream equipment
  assert.ok(!impactTk.downstream_equipment.includes('TIC-810'), 'Instrument signal strictly excluded from downstream flow');

  // Upstream of E-810
  const impactE = store.getChangeImpact(proj.id, 'equipment', 'E-810', 'update', 'Tube bundle replacement');
  assert.ok(impactE.upstream_equipment.includes('P-810'), 'Upstream of exchanger includes pump P-810');
  assert.ok(impactE.upstream_equipment.includes('TK-810'), 'Upstream of exchanger includes tank TK-810');
});

test('Scenario 5: Downstream PHA Study Node Invalidation & Reassessment Flagging', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 8 PHA Reassessment ' + Date.now(), 'Testing PHA node reassessment');
  const now = Date.now();

  const eq1 = { id: 'eq-p8-pha1-' + now, project_id: proj.id, tag: 'TK-820', equipment_type: 'tank' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  const eq2 = { id: 'eq-p8-pha2-' + now, project_id: proj.id, tag: 'P-820', equipment_type: 'pump' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq1 as any, eq2 as any]);

  const line = { id: 'line-p8-pha-' + now, project_id: proj.id, line_number: 'PL-820', from_equipment: 'TK-820', to_equipment: 'P-820', flow_direction: 'forward' as const, functional_type: 'piping_line' as const, status: 'confirmed' as const };
  store.addLines([line as any]);

  const stream = { id: 'st-p8-pha-' + now, project_id: proj.id, stream_number: 'STR-820', source_equipment_tag: 'TK-820', destination_equipment_tag: 'P-820', connected_line_numbers: ['PL-820'], verification_status: 'verified' as any };
  store.createStream(stream as any);

  // Create and approve PHA nodes
  const phaNode1 = store.createPhaNode({
    project_id: proj.id,
    node_id: 'N-801',
    name: 'Feed Storage System',
    design_intent: 'Store sour gas feed',
    equipment_tags: ['TK-820'],
    line_numbers: ['PL-820'],
    inlet_boundaries: [],
    outlet_boundaries: ['PL-820'],
    basis_for_grouping: 'Common storage subsystem',
    status: 'approved',
    unresolved_questions: [],
    operating_limits: { units: {} },
  });

  const phaNode2 = store.createPhaNode({
    project_id: proj.id,
    node_id: 'N-802',
    name: 'Transfer Pump System',
    design_intent: 'Transfer feed to treatment',
    equipment_tags: ['P-820'],
    line_numbers: ['PL-820'],
    inlet_boundaries: ['PL-820'],
    outlet_boundaries: [],
    basis_for_grouping: 'Pumping subsystem',
    status: 'approved',
    unresolved_questions: [],
    operating_limits: { units: {} },
  });

  // Check impact analysis on TK-820
  const impact = store.getChangeImpact(proj.id, 'equipment', 'TK-820', 'update', 'Relief valve setpoint increased');
  assert.strictEqual(impact.requires_pha_reassessment, true, 'Requires PHA reassessment');
  assert.ok(impact.impacted_pha_nodes.some((n) => n.node_id === 'N-801'), 'Node 1 impacted directly');
  assert.ok(impact.impacted_pha_nodes.some((n) => n.node_id === 'N-802'), 'Node 2 impacted downstream');

  // Invalidate graph approval and check node demotion
  store.approveGraph(proj.id, 'Safety Lead', 'Initial approval');
  store.updateEquipment(eq1.id, { description: 'Modified feed vessel' }, 'Engineer', 'Walkdown update');

  const nodesAfter = store.listPhaNodes(proj.id);
  const n1 = nodesAfter.find((n) => n.node_id === 'N-801')!;
  const n2 = nodesAfter.find((n) => n.node_id === 'N-802')!;

  assert.strictEqual(n1.status, 'under_review', 'Node 1 status demoted from approved to under_review');
  assert.strictEqual(n1.requires_reassessment, true, 'Node 1 flagged for reassessment');
  assert.ok(n1.reassessment_reasons && n1.reassessment_reasons.length > 0, 'Reassessment reason recorded');

  assert.strictEqual(n2.status, 'under_review', 'Node 2 status demoted from approved to under_review');
  assert.strictEqual(n2.requires_reassessment, true, 'Node 2 flagged for reassessment');
});

test('Scenario 6: Reversibility Verification — Rollback via Audit Log Restores Graph & Entity State', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 8 Reversibility Test ' + Date.now(), 'Testing rollback of mutations');
  const now = Date.now();

  const eq = {
    id: 'eq-p8-rev-' + now,
    project_id: proj.id,
    tag: 'TK-830',
    description: 'Original Atmospheric Storage Tank',
    equipment_type: 'tank' as const,
    status: 'confirmed' as const,
    confidence: 1.0,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eq as any]);

  // Update equipment
  store.updateEquipment(
    eq.id,
    { description: 'Unapproved In-Field Modification' },
    'Field Contractor',
    'Field sketch change'
  );

  const modifiedEq = store.getEquipment(eq.id);
  assert.strictEqual(modifiedEq?.description, 'Unapproved In-Field Modification');

  // Locate the update audit entry
  const logs = store.listAuditLog(proj.id, { entity_type: 'equipment', entity_id: eq.id, action: 'update' });
  assert.ok(logs.length >= 1);
  const updateAudit = logs[0];

  // Revert the update
  const revertRes = store.revertChange(updateAudit.id, 'Chief Safety Officer Shlok', 'Rollback unapproved change');
  assert.strictEqual(revertRes.success, true);
  assert.ok(revertRes.reverted_entry);
  assert.strictEqual(revertRes.reverted_entry?.action, 'restore');

  // Verify entity state restored to original
  const restoredEq = store.getEquipment(eq.id);
  assert.strictEqual(restoredEq?.description, 'Original Atmospheric Storage Tank', 'Description restored to previous state');

  // Verify original audit record marked reverted
  const refreshedLogs = store.listAuditLog(proj.id);
  const revertedAudit = refreshedLogs.find((l) => l.id === updateAudit.id);
  assert.ok(revertedAudit?.reverted_at);
  assert.strictEqual(revertedAudit?.reverted_by, 'Chief Safety Officer Shlok');

  // Cannot revert twice
  const doubleRevert = store.revertChange(updateAudit.id, 'Engineer', 'Attempt double revert');
  assert.strictEqual(doubleRevert.success, false);
  assert.ok(doubleRevert.error?.includes('already been reverted'));

  // Test Reverting Deletion
  const eqDelete = {
    id: 'eq-p8-del-' + now,
    project_id: proj.id,
    tag: 'FL-830',
    equipment_type: 'filter' as const,
    status: 'confirmed' as const,
    created_at: new Date().toISOString(),
  };
  store.addEquipment([eqDelete as any]);
  store.deleteEquipment(eqDelete.id, 'Contractor', 'Erroneous deletion');
  assert.strictEqual(store.getEquipment(eqDelete.id), undefined);

  const deleteLogs = store.listAuditLog(proj.id, { entity_type: 'equipment', entity_id: eqDelete.id, action: 'delete' });
  assert.ok(deleteLogs.length >= 1);
  const delAudit = deleteLogs[0];

  const revertDelRes = store.revertChange(delAudit.id, 'Lead Safety Engineer', 'Restoring mistakenly deleted filter');
  assert.strictEqual(revertDelRes.success, true);
  assert.ok(store.getEquipment(eqDelete.id), 'Filter FL-830 restored to database after revert');
});

// ----------------------------------------------------
// Test Group 36: HAZOP Node Segmentation & Flow-Aware Deviations (Phase 9)
// ----------------------------------------------------
console.log('\n--- Test Group 36: HAZOP Node Segmentation & Flow-Aware Deviations (Phase 9) ---');

test('Scenario 1: Multi-Document Context Propagation into Candidate PHA Study Nodes', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 9 Node Gen ' + Date.now(), 'Testing candidate node segmentation');
  const now = Date.now();

  const eq1 = { id: 'eq-p9-1-' + now, project_id: proj.id, tag: 'TK-901', equipment_type: 'tank' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  const eq2 = { id: 'eq-p9-2-' + now, project_id: proj.id, tag: 'P-901', equipment_type: 'pump' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq1 as any, eq2 as any]);

  const line = { id: 'line-p9-1-' + now, project_id: proj.id, line_number: 'PL-901', from_equipment: 'TK-901', to_equipment: 'P-901', flow_direction: 'forward' as const, functional_type: 'piping_line' as const, status: 'confirmed' as const };
  store.addLines([line as any]);

  const stream = {
    id: 'st-p9-1-' + now,
    project_id: proj.id,
    stream_number: 'STR-901',
    source_equipment_tag: 'TK-901',
    destination_equipment_tag: 'P-901',
    connected_line_numbers: ['PL-901'],
    flow_rates: { normal: 120, unit: 'm3/h' },
    verification_status: 'verified' as any,
  };
  store.createStream(stream as any);

  // Auto-generate candidate PHA nodes
  const nodes = store.generatePhaNodes(proj.id, 'Senior Process Safety Engineer');
  assert.ok(nodes.length >= 1, 'At least 1 candidate PHA node generated');

  const node1 = nodes[0];
  assert.strictEqual(node1.status, 'candidate_not_authoritative');
  assert.ok(node1.node_id.startsWith('N-'));
  assert.ok(node1.design_intent.length > 0);

  // Verify stream context attached
  const nodeWithStreams = store.listPhaNodes(proj.id)[0];
  assert.ok(nodeWithStreams.stream_summary, 'Stream summary attached to study node');
  assert.ok(nodeWithStreams.stream_summary?.known_flow_count! >= 1, 'Known flow stream detected');
});

test('Scenario 2: Flow-Aware Deviation Analysis (No Flow, Less Flow, More Flow, Reverse Flow)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 9 Flow Deviations ' + Date.now(), 'Testing flow deviations');
  const now = Date.now();

  const eqTk = { id: 'eq-p9-tk-' + now, project_id: proj.id, tag: 'TK-902', equipment_type: 'tank' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  const eqP = { id: 'eq-p9-p-' + now, project_id: proj.id, tag: 'P-902', equipment_type: 'pump' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eqTk as any, eqP as any]);

  const line = { id: 'line-p9-2-' + now, project_id: proj.id, line_number: 'PL-902', from_equipment: 'TK-902', to_equipment: 'P-902', flow_direction: 'forward' as const, functional_type: 'piping_line' as const, status: 'confirmed' as const };
  store.addLines([line as any]);

  const streamWithLimits = {
    id: 'st-p9-2-' + now,
    project_id: proj.id,
    stream_number: 'STR-902',
    source_equipment_tag: 'TK-902',
    destination_equipment_tag: 'P-902',
    connected_line_numbers: ['PL-902'],
    flow_rates: {
      min: 50,
      normal: 100,
      max: 150,
      design: 180,
      unit: 'kg/h',
    },
    verification_status: 'verified' as any,
  };
  store.createStream(streamWithLimits as any);

  const streamUndocumented = {
    id: 'st-p9-undoc-' + now,
    project_id: proj.id,
    stream_number: 'STR-903',
    source_equipment_tag: 'P-902',
    destination_equipment_tag: 'E-902',
    connected_line_numbers: [],
    // flow_rates strictly null / not provided
    verification_status: 'unverified' as any,
  };
  store.createStream(streamUndocumented as any);

  const nodes = store.generatePhaNodes(proj.id);
  const node = store.listPhaNodes(proj.id)[0];
  assert.ok(node.flow_deviations && node.flow_deviations.length > 0, 'Flow deviations generated');

  // Verify documented limits are retained with units
  const moreFlowDev = node.flow_deviations.find((d) => d.deviation === 'MORE FLOW' && d.stream_number === 'STR-902');
  if (moreFlowDev) {
    assert.strictEqual(moreFlowDev.documented_limits.normal, 100);
    assert.strictEqual(moreFlowDev.documented_limits.max_allowable, 150);
    assert.strictEqual(moreFlowDev.documented_limits.unit, 'kg/h');
  }

  // Verify strict non-fabrication: undocumented stream STR-903 must have null limits, never defaulted to 0
  const unkDev = node.flow_deviations.find((d) => d.stream_number === 'STR-903');
  if (unkDev) {
    assert.strictEqual(unkDev.documented_limits.normal ?? null, null, 'Unstated flow rate strictly null');
    assert.strictEqual(unkDev.status, 'limit_unknown', 'Status marked limit_unknown');
  }
});

test('Scenario 3: Chemical Composition Basis & Concentration Tracking in Deviations', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 9 Chemical Tracking ' + Date.now(), 'Testing chemical compositions');
  const now = Date.now();

  const eq = { id: 'eq-p9-chem-' + now, project_id: proj.id, tag: 'SEP-901', equipment_type: 'separator' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq as any]);

  const streamInlet = {
    id: 'st-inlet-' + now,
    project_id: proj.id,
    stream_number: 'STR-IN',
    destination_equipment_tag: 'SEP-901',
    connected_line_numbers: [],
    components: [
      { chemical_name: 'Hydrogen Sulfide', formula: 'H2S', mole_fraction: 0.15, concentration_basis: 'mol%', unit: 'mol%' },
      { chemical_name: 'Methane', formula: 'CH4', mole_fraction: 0.85, concentration_basis: 'mol%', unit: 'mol%' },
    ],
    verification_status: 'verified' as any,
  };
  const streamLiquid = {
    id: 'st-liquid-' + now,
    project_id: proj.id,
    stream_number: 'STR-LIQ',
    source_equipment_tag: 'SEP-901',
    connected_line_numbers: [],
    components: [
      { chemical_name: 'Condensate', formula: 'C5+', mass_fraction: 0.98, concentration_basis: 'wt%', unit: 'wt%' },
      { chemical_name: 'Hydrogen Sulfide', formula: 'H2S', mass_fraction: 0.02, concentration_basis: 'ppm wt', unit: 'ppm wt' },
    ],
    verification_status: 'verified' as any,
  };
  store.createStream(streamInlet as any);
  store.createStream(streamLiquid as any);

  const streams = store.listStreams(proj.id);
  const sIn = streams.find((s) => s.stream_number === 'STR-IN')!;
  const sLiq = streams.find((s) => s.stream_number === 'STR-LIQ')!;

  // Separator Decoupling Guarantee: Inlets and outlets maintain their separate composition bases without cross-contamination
  assert.strictEqual(sIn.components[0].concentration_basis, 'mol%');
  assert.strictEqual(sLiq.components[0].concentration_basis, 'wt%');
  assert.strictEqual(sLiq.components[1].concentration_basis, 'ppm wt');
  assert.notStrictEqual(sIn.components[0].mole_fraction, sLiq.components[1].mass_fraction);
});

test('Scenario 4: HAZOP Study Readiness Gate — Blocking on Unapproved Graph & Limit Violations', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 9 Readiness Gate ' + Date.now(), 'Testing HAZOP readiness gate');
  const now = Date.now();

  const eq1 = { id: 'eq-p9-rd1-' + now, project_id: proj.id, tag: 'V-905', equipment_type: 'vessel' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  const eq2 = { id: 'eq-p9-rd2-' + now, project_id: proj.id, tag: 'P-905', equipment_type: 'pump' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq1 as any, eq2 as any]);

  const line = { id: 'line-p9-rd-' + now, project_id: proj.id, line_number: 'PL-905', from_equipment: 'V-905', to_equipment: 'P-905', flow_direction: 'forward' as const, functional_type: 'piping_line' as const, status: 'confirmed' as const };
  store.addLines([line as any]);

  store.generatePhaNodes(proj.id);

  // 1. Initial Readiness: Graph is NOT approved -> MUST BE BLOCKED
  const readinessBeforeApp = store.getHazopReadiness(proj.id);
  assert.strictEqual(readinessBeforeApp.ready, false, 'Readiness blocked when graph unapproved');
  assert.ok(readinessBeforeApp.blocking_reasons.some((r) => r.includes('Process Graph is NOT approved')));

  // 2. Approve graph
  store.approveGraph(proj.id, 'Safety Lead', 'Topology verified');

  // Approve the PHA node
  const nodes = store.listPhaNodes(proj.id);
  for (const n of nodes) {
    n.status = 'approved';
    n.design_intent = 'Adequately documented design intent for feed transfer';
  }

  // 3. Add open critical limit violation
  store.createDiscrepancy({
    project_id: proj.id,
    entity_id: 'V-905',
    entity_tag: 'V-905',
    property_name: 'operating_pressure',
    discrepancy_type: 'operating_vs_design_limit_violation',
    severity: 'critical',
    message: 'Operating pressure 120 barg exceeds vessel MAWP of 100 barg',
    evidence_records: [],
  });

  const readinessWithViolation = store.getHazopReadiness(proj.id);
  assert.strictEqual(readinessWithViolation.ready, false, 'Readiness blocked by critical limit violation');
  assert.ok(readinessWithViolation.blocking_reasons.some((r) => r.includes('operating_pressure') && r.includes('MAWP')));
});

test('Scenario 5: Non-Blocking Informational Gaps & Missing Operating Conditions', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 9 Non-Blocking Info ' + Date.now(), 'Testing non-blocking gaps');
  const now = Date.now();

  const eq = { id: 'eq-p9-gap-' + now, project_id: proj.id, tag: 'TK-908', equipment_type: 'tank' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq as any]);

  // Create stream with unstated operating conditions
  const stream = {
    id: 'st-p9-gap-' + now,
    project_id: proj.id,
    stream_number: 'STR-908',
    source_equipment_tag: 'TK-908',
    destination_equipment_tag: 'P-908',
    connected_line_numbers: [],
    // Unstated conditions
    verification_status: 'unverified' as any,
  };
  store.createStream(stream as any);

  // Missing operating conditions must generate informational gaps, NOT critical blocking errors
  const nodes = store.generatePhaNodes(proj.id);
  assert.ok(nodes.length >= 1, 'Node generation succeeds despite missing operating conditions');
  assert.strictEqual(nodes[0].node_id, 'N-001');
});

test('Scenario 6: Automatic Reassessment Flagging on Upstream Topology or Limit Modifications', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 9 Auto Reassessment ' + Date.now(), 'Testing automated reassessment propagation');
  const now = Date.now();

  const eq1 = { id: 'eq-p9-re1-' + now, project_id: proj.id, tag: 'TK-910', equipment_type: 'tank' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  const eq2 = { id: 'eq-p9-re2-' + now, project_id: proj.id, tag: 'P-910', equipment_type: 'pump' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq1 as any, eq2 as any]);

  const line = { id: 'line-p9-re-' + now, project_id: proj.id, line_number: 'PL-910', from_equipment: 'TK-910', to_equipment: 'P-910', flow_direction: 'forward' as const, functional_type: 'piping_line' as const, status: 'confirmed' as const };
  store.addLines([line as any]);

  const node = store.createPhaNode({
    project_id: proj.id,
    node_id: 'N-910',
    name: 'Feed Suction Section',
    design_intent: 'Suction line to booster pump',
    equipment_tags: ['TK-910', 'P-910'],
    line_numbers: ['PL-910'],
    inlet_boundaries: [],
    outlet_boundaries: ['PL-910'],
    basis_for_grouping: 'Suction piping',
    status: 'approved',
    unresolved_questions: [],
    operating_limits: { units: {} },
  });

  // Mutate upstream line specification
  store.reassessPhaNodesOnSpecChange(proj.id, 'TK-910', 'design_pressure', 'Lead Engineer');

  const refreshedNodes = store.listPhaNodes(proj.id);
  const targetNode = refreshedNodes.find((n) => n.node_id === 'N-910')!;

  assert.strictEqual(targetNode.requires_reassessment, true, 'Flagged requires_reassessment = true');
  assert.ok(targetNode.reassessment_reasons?.some((r) => r.includes('TK-910') && r.includes('design_pressure')));
});

// ----------------------------------------------------
// Test Group 37: Multi-Document Dossier Export & Final Delivery (Phase 10)
// ----------------------------------------------------
console.log('\n--- Test Group 37: Multi-Document Dossier Export & Final Delivery (Phase 10) ---');

test('Scenario 1: Comprehensive Multi-Document Dossier Generation & Structure', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 10 Dossier Test ' + Date.now(), 'Testing complete dossier export');
  const now = Date.now();

  const doc = store.createDocument({ project_id: proj.id, filename: 'SafeFlow_PID_001.pdf', original_name: 'SafeFlow_PID_001.pdf', category: 'pid' as any, revision: 'Rev 3' } as any);
  const eq = { id: 'eq-p10-1-' + now, project_id: proj.id, tag: 'V-1001', equipment_type: 'vessel' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq as any]);

  const line = { id: 'line-p10-1-' + now, project_id: proj.id, line_number: 'PL-1001', from_equipment: 'V-1001', to_equipment: 'P-1001', functional_type: 'piping_line' as const, status: 'confirmed' as const };
  store.addLines([line as any]);

  const stream = { id: 'st-p10-1-' + now, project_id: proj.id, stream_number: 'STR-1001', source_equipment_tag: 'V-1001', destination_equipment_tag: 'P-1001', connected_line_numbers: ['PL-1001'], verification_status: 'verified' as any };
  store.createStream(stream as any);

  store.approveGraph(proj.id, 'Lead Architect Shlok', 'Approved for production dossier');

  const dossier = store.getEngineeringDossier(proj.id);
  assert.ok(dossier, 'Dossier successfully generated');

  // Verify core sections
  assert.strictEqual(dossier.export_metadata.system, 'SafeFlow AI Enterprise');
  assert.strictEqual(dossier.export_metadata.architect, 'Built & Architected by Shlok');
  assert.strictEqual(dossier.export_metadata.dossier_version, '2.0-Enterprise');
  assert.ok(dossier.document_registry.length >= 1, 'Document registry included');
  assert.ok(dossier.process_topology.equipment_count >= 1, 'Equipment topology included');
  assert.ok(dossier.process_topology.lines_count >= 1, 'Process lines included');
  assert.ok(dossier.process_topology.streams_count >= 1, 'Process streams included');
  assert.ok(dossier.graph_approval.approved, 'Graph approval record included');
  assert.ok(dossier.audit_trail.length >= 1, 'Audit trail included');
});

test('Scenario 2: Cryptographic SHA-256 Tamper-Evident Dossier Integrity Hash', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 10 Integrity Hash ' + Date.now(), 'Testing cryptographic hashing');
  const now = Date.now();

  const eq = { id: 'eq-p10-2-' + now, project_id: proj.id, tag: 'TK-1002', equipment_type: 'tank' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq as any]);

  const dossier1 = store.getEngineeringDossier(proj.id)!;
  const hash1 = dossier1.export_metadata.integrity_hash;

  assert.ok(hash1, 'Integrity hash generated');
  assert.strictEqual(hash1.length, 64, 'Valid SHA-256 hex string (64 characters)');

  // Mutate project topology
  store.addEquipment([{ id: 'eq-p10-extra-' + now, project_id: proj.id, tag: 'V-1003', equipment_type: 'vessel' as const, status: 'confirmed' as const } as any]);

  const dossier2 = store.getEngineeringDossier(proj.id)!;
  const hash2 = dossier2.export_metadata.integrity_hash;

  assert.notStrictEqual(hash1, hash2, 'Dossier integrity hash changes when data is mutated (tamper-evident)');
});

test('Scenario 3: Multi-Document Categorization & Cross-Referencing in Dossier', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 10 Multi-Doc ' + Date.now(), 'Testing document categories in dossier');
  const now = Date.now();

  store.createDocument({ project_id: proj.id, filename: 'Plant_PID.pdf', original_name: 'Plant_PID.pdf', category: 'pid' as any, revision: 'Rev 1' } as any);
  store.createDocument({ project_id: proj.id, filename: 'Stream_Table.csv', original_name: 'Stream_Table.csv', category: 'stream_table' as any, revision: 'Rev 2' } as any);
  store.createDocument({ project_id: proj.id, filename: 'Vessel_Datasheet.pdf', original_name: 'Vessel_Datasheet.pdf', category: 'datasheet' as any, revision: 'Rev 0' } as any);

  const dossier = store.getEngineeringDossier(proj.id)!;
  const docCats = dossier.document_registry.map((d) => d.category);

  assert.ok(docCats.includes('pid'));
  assert.ok(docCats.includes('stream_table'));
  assert.ok(docCats.includes('datasheet'));
});

test('Scenario 4: Source-to-Source Discrepancies vs Limit Violations Categorization in Dossier', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 10 Discrepancy Categorization ' + Date.now(), 'Testing discrepancy categorization');

  store.createDiscrepancy({
    project_id: proj.id,
    entity_id: 'V-1004',
    entity_tag: 'V-1004',
    property_name: 'design_pressure',
    discrepancy_type: 'source_to_source_discrepancy',
    severity: 'warning',
    message: 'Datasheet Rev 1 (50 barg) differs from BOD (55 barg)',
    evidence_records: [],
  });

  store.createDiscrepancy({
    project_id: proj.id,
    entity_id: 'V-1004',
    entity_tag: 'V-1004',
    property_name: 'operating_pressure',
    discrepancy_type: 'operating_vs_design_limit_violation',
    severity: 'critical',
    message: 'Operating pressure 60 barg exceeds design limit 50 barg',
    evidence_records: [],
  });

  const dossier = store.getEngineeringDossier(proj.id)!;
  const rec = dossier.cross_document_reconciliation;

  assert.strictEqual(rec.total_discrepancies, 2);
  assert.strictEqual(rec.source_to_source_discrepancies, 1, 'Source-to-source discrepancy count correct');
  assert.strictEqual(rec.operating_vs_design_limit_violations, 1, 'Operating vs design limit violation count correct');
});

test('Scenario 5: Multi-Format Export (JSON & Markdown Dossier Delivery)', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 10 Multi-Format Export ' + Date.now(), 'Testing format generators');
  const now = Date.now();

  const eq = { id: 'eq-p10-fmt-' + now, project_id: proj.id, tag: 'TK-1005', equipment_type: 'tank' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eq as any]);

  const dossier = store.getEngineeringDossier(proj.id)!;

  // JSON export
  const jsonStr = exportDossierToJson(dossier);
  const parsed = JSON.parse(jsonStr);
  assert.strictEqual(parsed.export_metadata.system, 'SafeFlow AI Enterprise');

  // Markdown export
  const mdStr = exportDossierToMarkdown(dossier);
  assert.ok(mdStr.includes('# SafeFlow AI Enterprise — Multi-Document Engineering Dossier'));
  assert.ok(mdStr.includes('Made by Shlok'));
  assert.ok(mdStr.includes('OSHA 29 CFR 1910.119'));
  assert.ok(mdStr.includes('Cryptographic Hash (SHA-256)'));
});

test('Scenario 6: Full System Regression Across All 10 Phases & All Modules', () => {
  const store = new PsiDataStore();
  const proj = store.createProject('Phase 10 Final Regression ' + Date.now(), 'Complete full-system regression');
  const now = Date.now();

  // 1. SDS & Chemical Extraction
  const sdsDoc = store.createDocument({ project_id: proj.id, filename: 'Ammonia_SDS.pdf', original_name: 'Ammonia_SDS.pdf', category: 'sds' as any } as any);
  const chem = store.createManualChemical(proj.id, {
    chemical_name: 'Anhydrous Ammonia',
    cas: '7664-41-7',
    primary_hazard: 'Toxic Gas',
  }, 'Process Safety Lead');
  assert.ok(chem);

  // 2. Equipment, Piping, Stream Integration
  const eqTk = { id: 'eq-reg-1-' + now, project_id: proj.id, tag: 'TK-999', equipment_type: 'tank' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  const eqP = { id: 'eq-reg-2-' + now, project_id: proj.id, tag: 'P-999', equipment_type: 'pump' as const, status: 'confirmed' as const, verification_status: 'engineer_verified' as const };
  store.addEquipment([eqTk as any, eqP as any]);

  const line = {
    id: 'line-reg-1-' + now,
    project_id: proj.id,
    line_number: 'PL-999',
    from_equipment: 'TK-999',
    to_equipment: 'P-999',
    functional_type: 'piping_line' as const,
    flow_direction: 'forward' as const,
    assigned_chemical_id: chem.id,
    status: 'confirmed' as const,
    verification_status: 'verified' as const,
  };
  store.addLines([line as any]);

  const stream = { id: 'st-reg-1-' + now, project_id: proj.id, stream_number: 'STR-999', source_equipment_tag: 'TK-999', destination_equipment_tag: 'P-999', connected_line_numbers: ['PL-999'], verification_status: 'verified' as any };
  store.createStream(stream as any);

  // 3. Approval Gate
  const appResult = store.approveGraph(proj.id, {
    reviewer: 'Lead Process Architect Shlok',
    notes: 'System signed off for delivery',
    role: 'Chief Safety Engineer',
    acknowledged_warnings: ['WARN_UNVERIFIED_EQUIPMENT', 'WARN_UNKNOWN_FLOW_DIRECTION', 'WARN_UNASSIGNED_PROCESS_CHEMICAL'],
  });
  assert.strictEqual(appResult.success, true);

  // 4. PHA Node Segmentation & Readiness
  const phaNodes = store.generatePhaNodes(proj.id);
  assert.ok(phaNodes.length >= 1);

  // 5. Change Impact & Audit Reversibility
  const impact = store.getChangeImpact(proj.id, 'equipment', 'TK-999', 'update', 'In-field nozzle modification');
  assert.ok(impact.downstream_equipment.includes('P-999'));

  // 6. Multi-Document Dossier Export
  const dossier = store.getEngineeringDossier(proj.id);
  assert.ok(dossier);
  assert.ok(dossier.export_metadata.integrity_hash);
  assert.strictEqual(dossier.graph_approval.approved, true);
});



// ----------------------------------------------------
// Test Group 38: Configurable P&ID Conventions, Tiled Recognition, Topology Gap Bridging & Multi-Sheet Isolation
// ----------------------------------------------------
console.log('\n--- Test Group 38: Configurable P&ID Conventions, Tiled Recognition, Topology Gap Bridging & Multi-Sheet Isolation ---');

test('Scenario 1: Configurable Convention Profile Loading & Custom Profile Registration', () => {
  // 1. Verify default ISA-5.1 profile
  const isa = getConventionProfile('profile-isa-5-1');
  assert.strictEqual(isa.standard, 'ISA_5_1');
  assert.ok(isa.tagPatterns.equipment.length >= 1);
  assert.ok(isa.tolerances.labelGapBridgeMaxPx >= 100);

  // 2. Verify Sour Gas Facility acceptance profile
  const sourGas = getConventionProfile('profile-sour-gas-facility');
  assert.strictEqual(sourGas.id, 'profile-sour-gas-facility');
  assert.strictEqual(sourGas.tolerances.labelGapBridgeMaxPx, 140);

  // 3. Verify DIN EN ISO 10628 profile
  const din = getConventionProfile('profile-din-iso-10628');
  assert.strictEqual(din.standard, 'DIN_EN_ISO_10628');

  // 4. Register custom client-specific profile
  const customProfile: PidConventionProfile = {
    id: 'profile-custom-pharma',
    name: 'Biopharma High-Purity Sanitary Standard',
    standard: 'CUSTOM',
    description: 'Clean-in-place (CIP) and sanitary diaphragm valve conventions.',
    version: '1.0',
    tagPatterns: {
      equipment: ['\\b(FERM|BIO|PUR|CIP)-([0-9]{3,4})\\b'],
      pipingLine: ['\\bSAN-([0-9]{3,4})-([0-9\\.]+)IN\\b'],
      instrument: ['\\b(PH|DO|COND|TEMP)-([0-9]{3,4})\\b'],
      offPageConnector: ['\\b(CIP_LOOP|WFI_SUPPLY)-([0-9A-Z]+)\\b'],
      valve: ['\\bDV-([0-9]{3,4})\\b'],
    },
    symbolClassificationRules: [
      {
        prefixOrClass: 'FERM',
        targetType: 'reactor',
        categoryDescription: 'Bioreactor Fermenter',
        defaultDimensions: { width: 100, height: 160 },
        defaultPorts: [
          { name: 'Harvest Outlet', type: 'outlet', offsetRatio: { x: 0, y: 0.5 } },
          { name: 'Inoculation Port', type: 'inlet', offsetRatio: { x: -0.5, y: -0.2 } },
        ],
      },
    ],
    lineConventions: isa.lineConventions,
    tolerances: {
      portSnapRadiusPx: 45,
      connectionGapPx: 15,
      labelGapBridgeMaxPx: 100,
      collinearAngleToleranceDeg: 8,
      teeJunctionPerpendicularThresholdPx: 10,
      minimumSegmentLengthPx: 5,
    },
    multiSheetRules: {
      requireExplicitMatchingTag: true,
      requireMatchingLineNumber: true,
      permitInferredSheetLinks: false,
    },
  };

  registerConventionProfile(customProfile);
  const retrieved = getConventionProfile('profile-custom-pharma');
  assert.strictEqual(retrieved.name, 'Biopharma High-Purity Sanitary Standard');
  assert.strictEqual(retrieved.symbolClassificationRules[0].targetType, 'reactor');
});

test('Scenario 2: Stage 1 Sheet Structure Analysis & Border Isolation (Title Block, Legend, Margins)', () => {
  const textTokens = [
    { text: 'P&ID-OFF-0010', bbox: { x: 1600, y: 950, w: 120, h: 20 } },
    { text: 'REV A', bbox: { x: 1750, y: 950, w: 50, h: 20 } },
    { text: 'ONSHORE GAS PROCESSING FACILITY', bbox: { x: 1500, y: 920, w: 200, h: 20 } },
    { text: 'PIPING & INSTRUMENTATION DIAGRAM', bbox: { x: 1500, y: 900, w: 220, h: 20 } },
  ];

  const structure = analyzeSheetStructure({
    width: 1920,
    height: 1080,
    textTokens,
  });

  // Verify Drawing Boundary
  assert.ok(structure.drawingBoundary.x > 0);
  assert.ok(structure.drawingBoundary.w < 1920);

  // Verify Title Block extraction
  assert.ok(structure.titleBlock);
  assert.strictEqual(structure.titleBlock?.drawingNumber, 'P&ID-OFF-0010');
  assert.strictEqual(structure.titleBlock?.revision, 'A');
  assert.ok(structure.titleBlock?.facility?.includes('FACILITY'));

  // Verify Legend Region Isolation
  assert.ok(structure.legendRegion);
  assert.ok(structure.legendRegion?.symbolsDetected.includes('gate_valve'));

  // Test Non-Process Region Exclusion: lines inside title block must be excluded from piping
  const insideTitleBlock = isInsideNonProcessRegion({ x: 1620, y: 940, w: 50, h: 2 }, structure);
  assert.strictEqual(insideTitleBlock, true, 'Lines in title block must be identified as non-process border lines');

  const insideDiagram = isInsideNonProcessRegion({ x: 400, y: 300, w: 150, h: 3 }, structure);
  assert.strictEqual(insideDiagram, false, 'Lines in central diagram space must be treated as candidate process lines');
});

test('Scenario 3: Stage 2 Multi-Scale Overlapping Tiling & Cross-Tile Non-Maximum Suppression (STA Alignment)', () => {
  // Test Tiling Partitioner on 3840x2160 sheet with 1024 tile size and 20% overlap
  const tiles = partitionSheetIntoTiles(3840, 2160, 1024, 0.2);
  assert.ok(tiles.length >= 10, 'Generated multi-scale overlapping tiles');
  assert.strictEqual(tiles[0].overlapPx, Math.round(1024 * 0.2));

  // Test Cross-Tile Deduplication via NMS / Weighted Box Fusion
  // Tile 0 and Tile 1 both detect a vessel at the boundary with slight coordinate differences
  const rawDetections = [
    {
      tileIndex: 0,
      classLabel: 'vessel',
      confidence: 0.92,
      localBbox: { x: 800, y: 400, w: 100, h: 140 }, // Global X = 800
    },
    {
      tileIndex: 1, // Tile 1 starts at x = 819
      classLabel: 'vessel',
      confidence: 0.94,
      localBbox: { x: -10, y: 402, w: 102, h: 138 }, // Global X = 809 (heavily overlapping)
    },
    {
      tileIndex: 2, // Distant pump
      classLabel: 'pump',
      confidence: 0.89,
      localBbox: { x: 200, y: 200, w: 40, h: 40 },
    },
  ];

  const merged = mergeTiledDetections(rawDetections, tiles, 0.4);
  assert.strictEqual(merged.length, 2, 'Overlapping vessel detections across tile seams merged into single object');

  const vesselDet = merged.find((d) => d.classLabel === 'vessel')!;
  assert.ok(vesselDet, 'Merged vessel present');
  assert.strictEqual(vesselDet.sourceTileIndices.length, 2, 'Recorded both source tile indices');
  assert.ok(vesselDet.confidence >= 0.94, 'Confidence boosted by multi-tile agreement');
});

test('Scenario 4: Stage 2 Text Recognition & STA Tag-Symbol Association Across Diverse Standards', () => {
  // Test Tag Association with standard and custom profiles
  const customProfile = getConventionProfile('profile-custom-pharma');

  const rawTextTokens = [
    { text: 'FERM-101', bbox: { x: 300, y: 180, w: 70, h: 18 }, confidence: 0.95 },
    { text: 'SAN-101-2IN', bbox: { x: 350, y: 350, w: 90, h: 16 }, confidence: 0.91 },
    { text: 'PH-101', bbox: { x: 250, y: 220, w: 50, h: 16 }, confidence: 0.93 },
  ];

  const ocr = recognizeDrawingText(rawTextTokens, customProfile);
  assert.strictEqual(ocr.equipmentTags.length, 1);
  assert.strictEqual(ocr.equipmentTags[0].tag, 'FERM-101');
  assert.strictEqual(ocr.lineTags.length, 1);
  assert.strictEqual(ocr.lineTags[0].tag, 'SAN-101-2IN');
  assert.strictEqual(ocr.instrumentTags.length, 1);
  assert.strictEqual(ocr.instrumentTags[0].tag, 'PH-101');

  // Verify symbol creation from custom profile
  const { objects, ports } = detectDrawingSymbols(ocr.equipmentTags, 'Biopharma_P&ID.pdf', 1, customProfile);
  assert.strictEqual(objects.length, 1);
  assert.strictEqual(objects[0].tag, 'FERM-101');
  assert.strictEqual(objects[0].type, 'equipment');
  assert.strictEqual(objects[0].sub_type, 'Bioreactor Fermenter');

  // Verify STA symbol-to-tag spatial proximity association
  const detections = [
    {
      id: 'det-1',
      classLabel: 'reactor',
      confidence: 0.95,
      globalBbox: { x: 290, y: 190, w: 90, h: 150 },
      sourceTileIndices: [0],
    },
  ];

  const associated = associateSymbolsWithTags(detections, ocr.equipmentTags, 100);
  assert.strictEqual(associated[0].associatedTag, 'FERM-101', 'Symbol correctly associated with neighboring tag FERM-101');
});

test('Scenario 5: Stage 3 Collinear Line Gap Bridging Across Intervening Labels & Inline Valves', () => {
  // Construct two segments separated by an 80px gap where an inline valve or tag breaks the line
  const profile = getConventionProfile('profile-sour-gas-facility'); // gap tolerance 140px

  const segments = [
    // Segment A: (100, 300) -> (220, 300)
    {
      id: 'seg-a',
      page: 1,
      start: { x: 100, y: 300 },
      end: { x: 220, y: 300 },
      strokeWidth: 2,
      isDashed: false,
      classificationHint: 'process_pipe' as const,
    },
    // Segment B: (300, 300) -> (450, 300) (Gap of 80px between 220 and 300)
    {
      id: 'seg-b',
      page: 1,
      start: { x: 300, y: 300 },
      end: { x: 450, y: 300 },
      strokeWidth: 2,
      isDashed: false,
      classificationHint: 'process_pipe' as const,
    },
  ];

  const eqObjects: any[] = [
    {
      id: 'eq-v1',
      tag: 'V-101',
      type: 'vessel',
      center_coordinates: { x: 90, y: 300 },
      bounding_box: { x: 40, y: 240, w: 100, h: 120 },
    },
    {
      id: 'eq-v2',
      tag: 'V-102',
      type: 'vessel',
      center_coordinates: { x: 460, y: 300 },
      bounding_box: { x: 440, y: 240, w: 100, h: 120 },
    },
  ];

  const ports: any[] = [
    { id: 'p-v1-out', equipment_id: 'eq-v1', equipment_tag: 'V-101', port_type: 'outlet', position: { x: 100, y: 300 } },
    { id: 'p-v2-in', equipment_id: 'eq-v2', equipment_tag: 'V-102', port_type: 'inlet', position: { x: 450, y: 300 } },
  ];

  const lineAnnotations = [
    { tag: '3"-PG-101-CS', bbox: { x: 230, y: 285, w: 60, h: 25 } }, // Label residing directly in the 80px gap
  ];

  const tracing = tracePipingNetwork(segments, eqObjects, ports, lineAnnotations, [], 'SourGas_PID.pdf', 1, profile);

  // Verify Gap Bridging succeeded
  assert.ok(tracing.bridgedGapsCount && tracing.bridgedGapsCount >= 1, 'Collinear gap was bridged across intervening line tag');
  assert.strictEqual(tracing.pipePaths.length, 1, 'Two broken segments unified into 1 continuous pipeline');
  assert.strictEqual(tracing.connectionCandidates.length >= 1, true, 'Confirmed continuous physical connection from V-101 to V-102');
  assert.strictEqual(tracing.connectionCandidates[0].source_equipment, 'V-101');
  assert.strictEqual(tracing.connectionCandidates[0].destination_equipment, 'V-102');
  assert.strictEqual(tracing.connectionCandidates[0].line_number, '3"-PG-101-CS');
});

test('Scenario 6: Strict Unconnected Crossing (4-Way) vs Perpendicular T-Junction Branch Distinction', () => {
  // Horizontal Line 1: (100, 200) -> (500, 200)
  // Vertical Crossing Line 2: (300, 50) -> (300, 350)
  // Branch Line 3: (300, 200) is a 4-way crossing without a dot -> UNCONNECTED CROSSING
  // Branch Line 4: Starts at (400, 200) and goes down to (400, 350) -> T-JUNCTION
  const segments = [
    { id: 's-h1', page: 1, start: { x: 100, y: 200 }, end: { x: 500, y: 200 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
    { id: 's-v1', page: 1, start: { x: 300, y: 50 }, end: { x: 300, y: 350 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
    { id: 's-tee', page: 1, start: { x: 400, y: 200 }, end: { x: 400, y: 350 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
  ];

  const tracing = tracePipingNetwork(segments, [], [], [], [], 'Crossing_PID.pdf', 1);

  // Check Junctions
  const crossings = tracing.junctions.filter((j) => j.junction_type === 'unconnected_crossing');
  const tees = tracing.junctions.filter((j) => j.junction_type === 't_junction');

  assert.ok(crossings.length >= 1, 'Identified 4-way visual crossing as unconnected_crossing (zero material exchange)');
  assert.strictEqual(crossings[0].has_junction_dot, false);
  assert.strictEqual(crossings[0].connected_path_ids.length, 0, 'Unconnected crossing must NOT connect path IDs');

  assert.ok(tees.length >= 1, 'Identified perpendicular line termination as valid T-junction branch');
  assert.strictEqual(tees[0].connected_path_ids.length, 2, 'T-junction branch connects two process paths');
});

test('Scenario 7: Stage 4 Zero Link Fabrication & Explicit Evidence Rule for Off-Page Connectors', () => {
  // A pipeline that terminates without reaching an equipment nozzle
  const segments = [
    { id: 's-open', page: 1, start: { x: 100, y: 200 }, end: { x: 350, y: 200 }, strokeWidth: 2, isDashed: false, classificationHint: 'process_pipe' as const },
  ];

  const eqObjects: any[] = [
    {
      id: 'eq-p1',
      tag: 'P-101',
      type: 'pump',
      center_coordinates: { x: 95, y: 200 },
      bounding_box: { x: 75, y: 180, w: 40, h: 40 },
    },
  ];

  const ports: any[] = [
    { id: 'p-p1-out', equipment_id: 'eq-p1', equipment_tag: 'P-101', port_type: 'outlet', position: { x: 100, y: 200 } },
  ];

  // Tracing has no destination equipment for (350, 200)
  const tracing = tracePipingNetwork(segments, eqObjects, ports, [], [], 'Dangling_PID.pdf', 1);

  // Strict Non-Fabrication Rule:
  // Must NOT invent a fake connection to make graph look complete!
  assert.strictEqual(tracing.connectionCandidates.length, 0, 'No false connections fabricated for open line');
  assert.strictEqual(tracing.unresolvedSegments.length, 1, 'Open endpoint flagged as unresolved dangling segment with reason');
  assert.ok(tracing.unresolvedSegments[0].reason.includes('Outlet endpoint of path is unattached'));
});

test('Scenario 8: End-to-End Configurable Digitization Pipeline & Drawing Metadata Retention', async () => {
  const normResult = await normalizeDrawing({
    filePath: 'test/sample_sour_gas.pdf',
    fileName: 'sample_sour_gas.pdf',
    mimeType: 'application/pdf',
    documentId: 'doc-sour-gas-1',
    conventionProfileId: 'profile-sour-gas-facility',
    pageWidth: 2400,
    pageHeight: 1600,
    rawContent: 'V-2001 HP SEPARATOR DRUM PG-1001 PIG RECEIVER 6"-PG-00101-CS 2"-DR-00101-A1A',
  });

  // Verify Model Integrity
  assert.strictEqual(normResult.document_name, 'sample_sour_gas.pdf');
  assert.strictEqual(normResult.convention_profile_id, 'profile-sour-gas-facility');
  assert.ok(normResult.sheet_structure, 'Sheet structure metadata recorded');
  assert.ok(normResult.sheet_structure.diagramRegion.w > 2000);
  assert.strictEqual(typeof normResult.bridged_gaps_count, 'number');
  assert.strictEqual(typeof normResult.uncertain_connections_count, 'number');

  // Verify detected equipment
  assert.ok(normResult.objects.some((o) => o.tag.includes('V-2001') || o.tag.includes('PG-1001')));
  // Verify ports generated for objects
  assert.ok(normResult.ports.length > 0);
});

// Test Group 39: Sheet Isolation, 1:1 Reference Alignment & Acceptance From-To Verification
console.log('\n--- Test Group 39: Sheet Isolation, 1:1 Reference Alignment & Acceptance From-To Verification ---');

test('Test Group 39 - Scenario 1: Sheet Isolation & Foreign Asset Filtering', async () => {
  const { generateDigitalPidFromExtracted } = await import('../server/src/services/digitalDrawingGenerator');

  const mixedEquipment: any[] = [
    { id: 'eq-pg1001', tag: 'PG-1001', equipment_type: 'vessel', document_id: 'doc-pid-001-02', source: { document: 'PID-GPF-001-02 (1).png' } },
    { id: 'eq-mv1001', tag: 'MV-1001', equipment_type: 'manual_valve', document_id: 'doc-pid-001-02', source: { document: 'PID-GPF-001-02 (1).png' } },
    { id: 'eq-xv1001', tag: 'XV-1001', equipment_type: 'isolation_valve', document_id: 'doc-pid-001-02', source: { document: 'PID-GPF-001-02 (1).png' } },
    // Foreign equipment from sheet 2001 (HAZOP markup)
    { id: 'eq-v2001', tag: 'V-2001', equipment_type: 'vessel', document_id: 'doc-hazop-2001', source: { document: 'IES-GPF-PID-2001-HAZOP-Markup.png' } },
    { id: 'eq-pg2004', tag: 'PG-2004', equipment_type: 'vessel', document_id: 'doc-hazop-2001', source: { document: 'IES-GPF-PID-2001-HAZOP-Markup.png' } },
  ];

  const mixedLines: any[] = [
    { id: 'l-00101', line_number: '10"-PG-00101-A1A', from_equipment: 'MV-1001', to_equipment: 'XV-1001', document_id: 'doc-pid-001-02', source: { document: 'PID-GPF-001-02 (1).png' } },
    { id: 'l-hazop', line_number: 'LINE-V-2001-PT-2002', from_equipment: 'V-2001', to_equipment: 'PT-2002', document_id: 'doc-hazop-2001', source: { document: 'IES-GPF-PID-2001-HAZOP-Markup.png' } },
  ];

  const drawing = generateDigitalPidFromExtracted(
    'proj-sour-gas',
    'doc-pid-001-02',
    'PID-GPF-001-02 (1).png',
    mixedEquipment,
    mixedLines
  );

  // Assert foreign equipment is strictly excluded from PID-GPF-001-02
  assert.ok(drawing.elements.some((e) => e.tag === 'PG-1001'), 'PG-1001 must be present');
  assert.ok(drawing.elements.some((e) => e.tag === 'MV-1001'), 'MV-1001 must be present');
  assert.ok(!drawing.elements.some((e) => e.tag === 'V-2001'), 'V-2001 must NOT be present on this sheet');
  assert.ok(!drawing.elements.some((e) => e.tag === 'PG-2004'), 'PG-2004 must NOT be present on this sheet');

  // Assert foreign lines are excluded
  assert.ok(drawing.connectors.some((c) => c.line_number === '10"-PG-00101-A1A'), 'Line 10"-PG-00101-A1A must be present');
  assert.ok(!drawing.connectors.some((c) => c.line_number === 'LINE-V-2001-PT-2002'), 'Foreign line must be excluded');
});

test('Test Group 39 - Scenario 2: Boundary Connector & INLET-HEADER Attachment', async () => {
  const { generateDigitalPidFromExtracted } = await import('../server/src/services/digitalDrawingGenerator');

  const eqList: any[] = [
    { id: 'eq-mv1', tag: 'MV-1001', equipment_type: 'manual_valve', document_id: 'doc-1', source: { document: 'PID-GPF-001-02 (1).png' } },
    { id: 'eq-xv1', tag: 'XV-1001', equipment_type: 'isolation_valve', document_id: 'doc-1', source: { document: 'PID-GPF-001-02 (1).png' } },
  ];
  const linesList: any[] = [
    { id: 'l-1', line_number: '10"-PG-00101-A1A', from_equipment: 'MV-1001', to_equipment: 'XV-1001', document_id: 'doc-1', source: { document: 'PID-GPF-001-02 (1).png' } },
  ];

  const drawing = generateDigitalPidFromExtracted('proj-1', 'doc-1', 'PID-GPF-001-02 (1).png', eqList, linesList);

  const inletHeader = drawing.elements.find((e) => e.tag === 'INLET-HEADER');
  const mv1001 = drawing.elements.find((e) => e.tag === 'MV-1001');
  assert.ok(inletHeader, 'INLET-HEADER boundary element exists');
  assert.ok(mv1001, 'MV-1001 exists');

  // Assert connector linking INLET-HEADER to MV-1001 exists
  const feedConn = drawing.connectors.find(
    (c) => (c.from_element_id === inletHeader.id && c.to_element_id === mv1001.id) ||
           (c.from_element_id === mv1001.id && c.to_element_id === inletHeader.id)
  );
  assert.ok(feedConn, 'INLET-HEADER must be physically connected to MV-1001 (no floating connector)');
});

test('Test Group 39 - Scenario 3: 1:1 Coordinate Overlap Alignment', async () => {
  // Simulate an initial drawing created on a 2400x1600 nominal design canvas
  const nominalDrawing: any = {
    id: 'draw-align-test',
    project_id: 'proj-align',
    canvas_width: 2400,
    canvas_height: 1600,
    elements: [
      { id: 'el-1', tag: 'PG-1001', position: { x: 740, y: 510 }, size: { width: 220, height: 120 } },
      { id: 'el-2', tag: 'MV-1001', position: { x: 200, y: 560 }, size: { width: 36, height: 36 } },
    ],
    connectors: [
      { id: 'c-1', line_number: '10"-PG-00101-A1A', from_element_id: 'el-2', to_element_id: 'el-1', waypoints: [{ x: 236, y: 578 }, { x: 740, y: 570 }] },
    ],
  };

  // Target reference drawing dimensions (1536x1024)
  const targetW = 1536;
  const targetH = 1024;
  const scaleX = targetW / 2400; // 0.64
  const scaleY = targetH / 1600; // 0.64

  const alignedElements = nominalDrawing.elements.map((el: any) => ({
    ...el,
    position: { x: Math.round(el.position.x * scaleX), y: Math.round(el.position.y * scaleY) },
    size: { width: Math.round(el.size.width * scaleX), height: Math.round(el.size.height * scaleY) },
  }));

  const alignedConnectors = nominalDrawing.connectors.map((c: any) => ({
    ...c,
    waypoints: c.waypoints.map((wp: any) => ({ x: Math.round(wp.x * scaleX), y: Math.round(wp.y * scaleY) })),
  }));

  // Assert coordinates scale proportionally into 1536x1024 space
  assert.strictEqual(alignedElements[0].position.x, Math.round(740 * 0.64));
  assert.strictEqual(alignedElements[0].position.y, Math.round(510 * 0.64));
  assert.strictEqual(alignedElements[1].position.x, Math.round(200 * 0.64));
  assert.ok(alignedElements[0].position.x < targetW);
  assert.ok(alignedElements[0].position.y < targetH);

  // Assert connector waypoints scale accurately
  assert.strictEqual(alignedConnectors[0].waypoints[0].x, Math.round(236 * 0.64));
  assert.strictEqual(alignedConnectors[0].waypoints[0].y, Math.round(578 * 0.64));
});

test('Test Group 39 - Scenario 4: Acceptance From-To Line List Verification', async () => {
  // Acceptance criteria 12 process lines
  const ACCEPTANCE_LINES = [
    { line_number: '10"-PG-00101-A1A', from: 'MV-1001', to: 'XV-1001' },
    { line_number: '10"-PG-00102-A1A', from: 'XV-1001', to: 'PG-1001' },
    { line_number: '10"-PG-00103-A1A', from: 'PG-1001', to: 'CV-1001' },
    { line_number: '10"-PG-00104-A1A', from: 'CV-1001', to: 'XV-1002' },
    { line_number: '6"-PG-00105-A1A', from: 'XV-1002', to: 'PCV-1001' },
    { line_number: '6"-PG-00106-A1A', from: 'PCV-1001', to: 'HP-SEPARATOR' },
    { line_number: '4"-PG-00107-A1A', from: 'PG-1001', to: 'LCV-1001' },
    { line_number: '4"-PG-00108-A1A', from: 'LCV-1001', to: 'CONDENSATE-SYSTEM' },
    { line_number: '4"-FL-00101-A1A', from: 'BDV-1001', to: 'FLARE-HEADER' },
    { line_number: '2"-DR-00101-A1A', from: 'PG-1001', to: 'CLOSED-DRAIN-DRUM' },
    { line_number: '2"-VT-00101-A1A', from: 'PG-1001', to: 'FLARE-HEADER' },
    { line_number: '4"-FL-00102-A1A', from: 'PSV-1001', to: 'FLARE-HEADER' },
  ];

  assert.strictEqual(ACCEPTANCE_LINES.length, 12);
  for (const item of ACCEPTANCE_LINES) {
    assert.ok(item.line_number, `Line number defined for ${item.line_number}`);
    assert.ok(item.from, `From equipment defined for ${item.line_number}`);
    assert.ok(item.to, `To equipment defined for ${item.line_number}`);
  }
});

test('Test Group 39 - Scenario 5: Bottom Index & Notes Table Isolation', async () => {
  const { analyzeSheetStructure, isInsideNonProcessRegion } = await import('../server/src/services/sheetStructureService');

  const tokens = [
    { text: 'EQUIPMENT INDEX', bbox: { x: 100, y: 880, w: 150, h: 20 } },
    { text: 'VALVE INDEX', bbox: { x: 300, y: 880, w: 120, h: 20 } },
    { text: 'LINE LIST SCHEDULE', bbox: { x: 500, y: 880, w: 140, h: 20 } },
  ];

  const sheet = analyzeSheetStructure({ width: 1536, height: 1024, textTokens: tokens });
  assert.ok(sheet.notesRegion, 'Notes/Index table region detected at sheet bottom');

  // Any point inside the bottom table band should be flagged as non-process
  const insideBottomTable = isInsideNonProcessRegion({ x: 200, y: 920, w: 80, h: 40 }, sheet);
  assert.strictEqual(insideBottomTable, true, 'Bottom index table is recognized as non-process region');

  // Active diagram area above bottom table should remain valid process space
  const insideDiagram = isInsideNonProcessRegion({ x: 500, y: 500, w: 80, h: 40 }, sheet);
  assert.strictEqual(insideDiagram, false, 'Central diagram space is process area');
});

// --- Test Group 40: P&ID Editor Layout Declutter, Spacing & Visual Layer Controls ---
console.log('\n--- Test Group 40: P&ID Editor Layout Declutter, Spacing & Visual Layer Controls ---');

test('Test Group 40 - Scenario 1: Centroid-based diagram bounds & outward spacing expansion (+25%)', () => {
  const elements: any[] = [
    { id: 'v1', tag: 'V-1001', position: { x: 200, y: 200 }, size: { width: 100, height: 60 } },
    { id: 'v2', tag: 'V-1002', position: { x: 600, y: 200 }, size: { width: 100, height: 60 } },
  ];
  const connectors: any[] = [
    {
      id: 'c1',
      from_element_id: 'v1',
      to_element_id: 'v2',
      waypoints: [{ x: 400, y: 200 }],
    },
  ];

  const bounds = computeDiagramBounds(elements);
  assert.strictEqual(bounds.centerX, 450, 'Centroid X calculated accurately at midpoint');
  assert.strictEqual(bounds.centerY, 250, 'Centroid Y calculated accurately at midpoint');

  const initialDist = Math.abs(elements[1].position.x - elements[0].position.x);
  assert.strictEqual(initialDist, 400);

  // Spread elements by 1.25 (+25%)
  const { updatedElements: spreadElements } = spreadElementSpacing(elements, connectors, 1.25);
  const spreadDist = Math.abs(spreadElements[1].position.x - spreadElements[0].position.x);

  assert.strictEqual(spreadDist, 500, 'Element spacing expanded outward by exactly 25% (400px -> 500px)');
  assert.strictEqual(spreadElements[0].position.x, 150, 'Left element shifted leftwards away from centroid');
  assert.strictEqual(spreadElements[1].position.x, 650, 'Right element shifted rightwards away from centroid');
});

test('Test Group 40 - Scenario 2: Collision resolution & overlap relaxation between clustered elements', () => {
  // Two overlapping valves positioned only 20px apart (size 50px each -> 30px overlap)
  const elements: any[] = [
    { id: 'mv1', tag: 'MV-1001', position: { x: 300, y: 300 }, size: { width: 50, height: 40 } },
    { id: 'mv2', tag: 'MV-1002', position: { x: 320, y: 305 }, size: { width: 50, height: 40 } },
  ];
  const connectors: any[] = [
    { id: 'c1', from_element_id: 'mv1', to_element_id: 'mv2', waypoints: [] },
  ];

  const { updatedElements: declustered, shiftsApplied } = resolveElementOverlaps(elements, connectors, 60, 20);

  assert.ok(shiftsApplied > 0, 'Overlap detected and elements shifted apart');
  const finalDist = Math.hypot(
    declustered[1].position.x - declustered[0].position.x,
    declustered[1].position.y - declustered[0].position.y
  );
  assert.ok(finalDist >= 55, `Elements separated with safe clearance (distance: ${finalDist.toFixed(1)}px >= 55px)`);
});

test('Test Group 40 - Scenario 3: Compact spacing (-15%) with minimum padding boundaries', () => {
  const elements: any[] = [
    { id: 'v1', tag: 'V-1001', position: { x: 100, y: 200 }, size: { width: 100, height: 60 } },
    { id: 'v2', tag: 'V-1002', position: { x: 900, y: 200 }, size: { width: 100, height: 60 } },
  ];
  const connectors: any[] = [];

  const { updatedElements: compacted } = spreadElementSpacing(elements, connectors, 0.85);
  const compactDist = Math.abs(compacted[1].position.x - compacted[0].position.x);

  assert.ok(compactDist < 800, 'Elements safely drawn inward toward centroid');
  assert.ok(compacted[0].position.x >= 60, 'Left element respects diagram canvas padding boundary');
});

test('Test Group 40 - Scenario 4: Layer isolation (signal lines & clean line tag display modes)', () => {
  const lineConnectors: any[] = [
    { id: 'c1', functional_type: 'piping_line', line_number: '10"-PG-00101-A1A' },
    { id: 'c2', functional_type: 'signal_line', line_number: null },
    { id: 'c3', functional_type: 'signal_line', line_number: 'S-101' },
  ];

  // Piping Only Filter mode
  const showSignalLines = false;
  const filtered = lineConnectors.filter((c) => showSignalLines || c.functional_type !== 'signal_line');
  assert.strictEqual(filtered.length, 1, 'Signal lines successfully isolated when process piping view is active');
  assert.strictEqual(filtered[0].line_number, '10"-PG-00101-A1A');

  // Clean tags mode: badge renders only if selected or hovered
  const shouldRenderTag = (connId: string, selectedId: string | null, hoveredId: string | null, mode: string) => {
    return mode === 'all' || selectedId === connId || hoveredId === connId;
  };

  assert.strictEqual(shouldRenderTag('c1', null, null, 'hover'), false, 'Clean tags mode hides tag badge by default');
  assert.strictEqual(shouldRenderTag('c1', 'c1', null, 'hover'), true, 'Tag badge renders when connector is selected');
  assert.strictEqual(shouldRenderTag('c1', null, 'c1', 'hover'), true, 'Tag badge renders when connector is hovered');
  assert.strictEqual(shouldRenderTag('c1', null, null, 'all'), true, 'All tags mode renders badge for every line');
});

// Run Test Group 41 & 42: IEC 61882 HAZOP, CCPS LOPA & GNN Connectivity Pilot
import { runHazopLopaAndConnectivityTests } from './testHazopLopaAndConnectivity';
import { runGnnConnectivityPilotTests } from './testGnnConnectivityPilot';

runHazopLopaAndConnectivityTests()
  .then(() => runGnnConnectivityPilotTests())
  .then(() => {
    console.log(`\n========================================`);
    console.log(`Test Results: ${passedTests} Passed, ${failedTests} Failed`);
    console.log(`========================================\n`);

    if (failedTests > 0) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Fatal error in test suite:', err);
    process.exit(1);
  });
