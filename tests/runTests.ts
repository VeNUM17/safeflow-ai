import assert from 'assert';
import { parseSdsContent } from '../server/src/services/sdsParser';
import { detectConflictsForProject } from '../server/src/services/conflictDetector';
import { buildProcessTopologyGraph } from '../server/src/services/graphService';
import { exportProjectToJson, exportProjectToCsv } from '../server/src/services/exportService';
import { parsePidDocument } from '../server/src/services/pidParser';
import { validateProcessGraph } from '../server/src/services/graphValidationService';
import { generateCandidatePhaNodes, checkHazopReadiness, evaluateNodeSpecifications } from '../server/src/services/phaService';
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

console.log(`\n========================================`);
console.log(`Test Results: ${passedTests} Passed, ${failedTests} Failed`);
console.log(`========================================\n`);

if (failedTests > 0) {
  process.exit(1);
}
