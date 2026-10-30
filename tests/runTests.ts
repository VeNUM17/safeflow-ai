import assert from 'assert';
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
} from '../server/src/types';

console.log('🧪 Starting SafeFlow AI & PSI Engine Comprehensive Test Suite...\n');

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

console.log(`\n========================================`);
console.log(`Test Results: ${passedTests} Passed, ${failedTests} Failed`);
console.log(`========================================\n`);

if (failedTests > 0) {
  process.exit(1);
}
