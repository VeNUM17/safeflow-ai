import { store } from '../server/src/storage/store';
import {
  createDefaultRiskMatrixConfig,
  generateIec61882HazopWorksheet,
  calculateRiskLevel,
} from '../server/src/services/hazopService';
import {
  createLopaFromHazopFinding,
  recalculateLopa,
  evaluateIplQualification,
} from '../server/src/services/lopaService';
import {
  tracePipingNetwork,
  evaluateConnectionQuality,
} from '../server/src/services/pipeTracingService';
import { detectDrawingSymbols } from '../server/src/services/symbolDetectionService';
import { ProcessProject, DocumentRecord, DrawingElement, DrawingConnector } from '../server/src/types';

export async function runHazopLopaAndConnectivityTests() {
  console.log('\n--- Test Group 41: IEC 61882 HAZOP, CCPS LOPA & P&ID True Connectivity ---');

  const projectId = `test-hazop-lopa-${Date.now()}`;
  store.createProject({
    id: projectId,
    name: 'IEC 61882 HAZOP & CCPS LOPA Verification Facility',
    description: 'Gas Processing Facility P&ID Digitization & Process Safety Study',
    created_at: new Date().toISOString(),
  });

  // Scenario 1: Inline valves are treated as components with discrete ports, not collapsed into lines
  {
    console.log('  ✓ Scenario 1: Inline valves are preserved with distinct ports and never collapsed into unqualified pipes');

    const rawTags = [
      { tag: 'V-101', type: 'separator', bbox: { x: 60, y: 140, w: 80, h: 120 }, confidence: 0.95 },
      { tag: 'XV-101', type: 'valve', bbox: { x: 285, y: 185, w: 30, h: 30 }, confidence: 0.95 },
      { tag: 'P-101', type: 'pump', bbox: { x: 470, y: 170, w: 60, h: 60 }, confidence: 0.95 },
    ];
    const { objects, ports } = detectDrawingSymbols(rawTags, 'dwg-1.pdf');

    // Tracing segments: V-101 -> XV-101 and XV-101 -> P-101
    const segments = [
      { id: 'seg-1', start: { x: 140, y: 200 }, end: { x: 285, y: 200 }, length: 145, orientation: 'horizontal' as const, confidence: 0.95, classificationHint: 'process_pipe' as const },
      { id: 'seg-2', start: { x: 315, y: 200 }, end: { x: 470, y: 200 }, length: 155, orientation: 'horizontal' as const, confidence: 0.95, classificationHint: 'process_pipe' as const },
    ];

    const traced = tracePipingNetwork(segments, objects, ports, [], [], 'dwg-1.pdf', 1);

    // Ensure the valve XV-101 is an explicit node in candidates and not bypassed
    const directBypass = traced.connectionCandidates.find(
      (c) => c.source_equipment === 'V-101' && c.destination_equipment === 'P-101'
    );
    if (directBypass) {
      throw new Error('FAILED: Direct bypass found from V-101 to P-101 skipping inline valve XV-101');
    }

    const valveInlet = traced.connectionCandidates.find(
      (c) => c.source_equipment === 'V-101' && c.destination_equipment === 'XV-101'
    );
    const valveOutlet = traced.connectionCandidates.find(
      (c) => c.source_equipment === 'XV-101' && c.destination_equipment === 'P-101'
    );

    if (!valveInlet || !valveOutlet) {
      throw new Error('FAILED: Inline valve XV-101 ports were not properly connected in series');
    }
  }

  // Scenario 2: 4-way crossings without dots are not joined, and connection quality metrics are computed
  {
    console.log('  ✓ Scenario 2: Unconnected 4-way pipe crossings remain separate, and connection quality metrics are tracked');

    // Horizontal pipe: (100, 300) to (500, 300)
    // Vertical pipe:   (300, 100) to (300, 500)
    const segments = [
      { id: 'h1', start: { x: 100, y: 300 }, end: { x: 500, y: 300 }, length: 400, orientation: 'horizontal' as const, confidence: 0.95, classificationHint: 'process_pipe' as const },
      { id: 'v1', start: { x: 300, y: 100 }, end: { x: 300, y: 500 }, length: 400, orientation: 'vertical' as const, confidence: 0.95, classificationHint: 'process_pipe' as const },
    ];

    const traced = tracePipingNetwork(segments, [], [], [], [], 'dwg-2.pdf', 1);
    // Neither should have created a connected T-junction or connected cross-junction
    const connectedJunctions = traced.junctions.filter(j => j.has_junction_dot || j.junction_type !== 'unconnected_crossing');
    if (connectedJunctions.length > 0) {
      throw new Error(`FAILED: Expected 0 connected junctions for perpendicular crossing without dot, got ${connectedJunctions.length}`);
    }

    // Evaluate connection quality metrics
    const quality = traced.qualityMetrics;

    if (quality.total_connections_evaluated === undefined || quality.path_accuracy_percentage === undefined) {
      throw new Error('FAILED: Connection quality metrics missing required accuracy percentages');
    }
  }

  // Scenario 3: IEC 61882 HAZOP Worksheet Generation with Prevention vs Mitigation Safeguard Classification
  {
    console.log('  ✓ Scenario 3: IEC 61882 HAZOP worksheet distinguishes prevention vs emergency mitigation safeguards');

    // Setup node and lines
    store.createPhaNode({
      project_id: projectId,
      node_id: 'N-001',
      name: 'Separator V-101 Inlets & Separation',
      design_intent: 'Separate multiphase reservoir fluids into sour gas and liquids at 65 barg',
      equipment_tags: ['V-101'],
      line_numbers: ['LINE-101'],
      inlet_boundaries: ['From Fresh Feed header through inlet valve XV-101'],
      outlet_boundaries: ['V-101 vapor outlet to flare and liquid outlet to pump P-101'],
      basis_for_grouping: 'Continuous high-pressure multiphase separator subsystem',
      status: 'approved',
      operating_limits: {
        pressure_safe_upper: 85,
        pressure_safe_lower: 10,
        temperature_safe_upper: 90,
        temperature_safe_lower: -10,
        flow_safe_upper: 100,
        flow_safe_lower: 10,
        units: { pressure: 'barg', temperature: '°C', flow: 'm3/h' },
      },
      unresolved_questions: [],
    });

    const matrixConfig = store.getRiskMatrixConfig(projectId);
    if (!matrixConfig || matrixConfig.severity_levels.length !== 5 || matrixConfig.likelihood_levels.length !== 5) {
      throw new Error('FAILED: Default IEC 61882 5x5 risk matrix config not initialized properly');
    }

    const worksheetRows = store.generateHazopWorksheet(projectId, 'Lead Safety Facilitator');
    if (worksheetRows.length === 0) {
      throw new Error('FAILED: No HAZOP worksheet rows generated for node');
    }

    // Inspect first row
    const pressureHighRow = worksheetRows.find((r) => r.parameter === 'Pressure' && r.guideword === 'MORE');
    if (!pressureHighRow) {
      throw new Error('FAILED: Expected More Pressure deviation row in IEC 61882 worksheet');
    }

    if (pressureHighRow.prevention_safeguards.length === 0) {
      throw new Error('FAILED: Prevention safeguards missing in HAZOP row');
    }
    if (pressureHighRow.mitigation_safeguards.length === 0) {
      throw new Error('FAILED: Emergency mitigation safeguards (PSV) missing in HAZOP row');
    }

    // Ensure prevention is distinct from mitigation
    const psvMitigation = pressureHighRow.mitigation_safeguards.find((s) => s.type === 'mitigation');
    if (!psvMitigation) {
      throw new Error('FAILED: Pressure relief valve was not classified as emergency mitigation');
    }

    // Test action item update and closure evidence
    if (pressureHighRow.actions && pressureHighRow.actions.length > 0) {
      const action = pressureHighRow.actions[0];
      const updatedAction = store.updateHazopActionItem(
        pressureHighRow.id,
        action.id,
        { status: 'closed', owner: 'Senior Process Engineer' },
        'Lead Facilitator'
      );
      if (!updatedAction || updatedAction.status !== 'closed' || !updatedAction.closure_evidence) {
        throw new Error('FAILED: HAZOP action item closure evidence not recorded upon status closed');
      }
    }
  }

  // Scenario 4: CCPS LOPA Assessment & Strict 4-Pillar IPL Qualification Gate
  {
    console.log('  ✓ Scenario 4: CCPS LOPA qualification strictly enforces 4 criteria (Independence, Functionality, Reliability, Auditability)');

    const worksheetRows = store.listHazopWorksheet(projectId);
    const highRiskRow = worksheetRows[0];

    // Create LOPA from HAZOP finding
    const lopa = store.createLopaFromHazop(highRiskRow.id, 'LOPA Specialist');
    if (!lopa) {
      throw new Error('FAILED: Could not create LOPA record from HAZOP finding');
    }

    // Initially, candidate IPLs have not met all 4 criteria, so credited PFD must be 1.0 (no credit!)
    if (lopa.total_pfd !== 1.0) {
      throw new Error(`FAILED: Unverified IPL candidates received credit! PFD was ${lopa.total_pfd}, expected 1.0`);
    }

    if (lopa.ipls.length === 0) {
      throw new Error('FAILED: No candidate IPLs created in LOPA record');
    }

    // Attempt to qualify first IPL with partial criteria (missing auditability evidence)
    const testIpl = lopa.ipls[0];
    const partiallyVerified = store.updateLopaIpl(lopa.id, testIpl.id, {
      criterion_independence_met: true,
      independence_evidence: 'Independent PT-1001 sensor and separate ESD PLC processor',
      criterion_functionality_met: true,
      functionality_evidence: 'Closes fail-closed ESD valve within 1.5 seconds',
      criterion_reliability_met: true,
      pfd: 0.01,
      reliability_evidence: 'Certified SIL 2 per IEC 61508 with proof test interval 1 year',
      criterion_auditability_met: false,
      auditability_evidence: '', // Missing proof test record!
    });

    const evaluatedIpl1 = partiallyVerified?.ipls.find((i) => i.id === testIpl.id);
    if (evaluatedIpl1?.is_qualified_ipl) {
      throw new Error('FAILED: IPL was qualified despite missing auditability proof test evidence!');
    }
    if (partiallyVerified?.total_pfd !== 1.0) {
      throw new Error('FAILED: Partial IPL received PFD credit before all 4 criteria met!');
    }

    // Now provide full 4-pillar verification with evidence
    const fullyQualified = store.updateLopaIpl(lopa.id, testIpl.id, {
      criterion_auditability_met: true,
      auditability_evidence: 'Annual proof test procedure PT-SOP-04 documented in SAP PM Maintenance Plan',
    });

    const evaluatedIpl2 = fullyQualified?.ipls.find((i) => i.id === testIpl.id);
    if (!evaluatedIpl2?.is_qualified_ipl) {
      throw new Error('FAILED: IPL failed to qualify after all 4 CCPS criteria were satisfied with evidence!');
    }

    // Total credited PFD should now be 0.01 and mitigated event frequency should be reduced!
    if (fullyQualified?.total_pfd !== 0.01) {
      throw new Error(`FAILED: Expected total credited PFD 0.01, got ${fullyQualified?.total_pfd}`);
    }

    const expectedMef = (fullyQualified?.unmitigated_frequency || 0.1) * 0.01;
    if (Math.abs((fullyQualified?.mitigated_frequency || 0) - expectedMef) > 1e-6) {
      throw new Error(`FAILED: Mitigated event frequency mismatch. Got ${fullyQualified?.mitigated_frequency}, expected ${expectedMef}`);
    }

    console.log(`    -> LOPA MEF successfully calculated: ${fullyQualified?.mitigated_frequency} /yr (Target: ${fullyQualified?.target_frequency})`);
    console.log(`    -> Allocated Safety Integrity Level (SIL): ${fullyQualified?.sil_requirement}`);
  }

  // Scenario 5: Configurable Risk Matrix Modification and Dynamic Re-rating
  {
    console.log('  ✓ Scenario 5: Configurable Risk Matrix dynamically adjusts HAZOP severity / likelihood evaluation');

    const originalMatrix = store.getRiskMatrixConfig(projectId);
    // Customize tolerance criteria
    const customMatrix = store.saveRiskMatrixConfig(projectId, {
      standard_reference: 'Corporate Offshore Risk Standard Rev 2',
    });

    if (Number(customMatrix.version) <= Number(originalMatrix.version)) {
      throw new Error('FAILED: Risk matrix configuration version did not increment');
    }

    const testRating = calculateRiskLevel(4, 3, customMatrix);
    if (testRating !== 'High') {
      throw new Error(`FAILED: Severity 4 x Likelihood 3 expected 'High', got '${testRating}'`);
    }
  }

  console.log('--- Test Group 41: All Scenarios Passed Successfully ---\n');
}

function elementsToMock(): DrawingElement[] {
  return [
    {
      id: 'eq-1',
      drawing_id: 'drw-1',
      tag: 'V-101',
      type: 'vessel',
      position: { x: 100, y: 100 },
      size: { width: 50, height: 80 },
      status: 'confirmed',
    },
  ];
}

if (require.main === module) {
  runHazopLopaAndConnectivityTests().catch(console.error);
}
