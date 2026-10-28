import { v4 as uuidv4 } from 'uuid';
import {
  EquipmentTag,
  PipingLine,
  ChemicalRecord,
  PhaStudyNode,
  HazopReadinessResult,
  PhaMissingSpecAlert,
  PhaDeviationScenario,
} from '../types';

/**
 * Evaluates equipment specifications attached to a PHA study node.
 * Generates applicable deviation scenarios and missing specification alerts.
 * Distinguishes verified limits from unverified and unknown limits.
 */
export function evaluateNodeSpecifications(
  node: PhaStudyNode,
  equipmentList: EquipmentTag[]
): {
  missing_specifications: PhaMissingSpecAlert[];
  applicable_deviations: PhaDeviationScenario[];
} {
  const missingSpecs: PhaMissingSpecAlert[] = [];
  const deviations: PhaDeviationScenario[] = [];

  const nodeEquipment = equipmentList.filter((e) =>
    node.equipment_tags.some((t) => t.toUpperCase() === e.tag.toUpperCase())
  );

  for (const eq of nodeEquipment) {
    const specs = eq.specifications;

    // 1. Design Pressure Evaluation
    const press = specs?.design_pressure;
    if (!press || press.value === null || press.status === 'not_provided') {
      missingSpecs.push({
        equipment_tag: eq.tag,
        property: 'design_pressure',
        criticality: 'critical',
        impact: `Design pressure missing on ${eq.tag}: System cannot claim a quantitative pressure limit comparison has been completed for deviation MORE PRESSURE.`,
      });
      deviations.push({
        id: uuidv4(),
        deviation: 'MORE PRESSURE',
        parameter: 'Pressure',
        guideword: 'MORE',
        status: 'limit_unknown',
        equipment_tag: eq.tag,
        design_limit_reference: null,
        potential_scenario: `Potential overpressurization of ${eq.tag} during process upset, blocked outlet, or thermal expansion.`,
        requires_additional_info: true,
        notes: `Design pressure not provided. Quantitative overpressure limit comparison cannot be claimed; scenario remains unverified until MAWP is documented.`,
      });
    } else {
      const isVerified = press.verification_status === 'verified';
      deviations.push({
        id: uuidv4(),
        deviation: 'MORE PRESSURE',
        parameter: 'Pressure',
        guideword: 'MORE',
        status: isVerified ? 'verified_limit' : 'unverified_limit',
        equipment_tag: eq.tag,
        design_limit_reference: `${press.value} ${press.unit || 'psig'} (${isVerified ? 'verified' : 'unverified'})`,
        potential_scenario: `Pressure exceedance beyond design rating of ${press.value} ${press.unit || 'psig'}.`,
        requires_additional_info: !isVerified,
        notes: isVerified
          ? `Design pressure verified by authorized engineering review.`
          : `Design pressure entered but unverified. Formal datasheet verification recommended.`,
      });
    }

    // 2. Design Temperature Evaluation
    const temp = specs?.design_temperature;
    if (!temp || temp.value === null || temp.status === 'not_provided') {
      missingSpecs.push({
        equipment_tag: eq.tag,
        property: 'design_temperature',
        criticality: 'critical',
        impact: `Design temperature missing on ${eq.tag}: Cannot perform verified design-temperature exceedance comparison for deviation MORE TEMPERATURE.`,
      });
      deviations.push({
        id: uuidv4(),
        deviation: 'MORE TEMPERATURE',
        parameter: 'Temperature',
        guideword: 'MORE',
        status: 'limit_unknown',
        equipment_tag: eq.tag,
        design_limit_reference: null,
        potential_scenario: `Thermal excursion in ${eq.tag} from loss of cooling or exothermic reaction.`,
        requires_additional_info: true,
        notes: `Design temperature not provided. Exceedance comparison incomplete; scenario remains unverified.`,
      });
    } else {
      const isVerified = temp.verification_status === 'verified';
      deviations.push({
        id: uuidv4(),
        deviation: 'MORE TEMPERATURE',
        parameter: 'Temperature',
        guideword: 'MORE',
        status: isVerified ? 'verified_limit' : 'unverified_limit',
        equipment_tag: eq.tag,
        design_limit_reference: `${temp.value} ${temp.unit || '°F'} (${isVerified ? 'verified' : 'unverified'})`,
        potential_scenario: `Temperature exceedance beyond design limit of ${temp.value} ${temp.unit || '°F'}.`,
        requires_additional_info: !isVerified,
      });
    }

    // 3. Material of Construction Evaluation
    const mat = specs?.material_of_construction;
    if (
      !mat ||
      mat.value === null ||
      mat.value.trim().toLowerCase() === 'unknown' ||
      mat.status === 'not_provided'
    ) {
      missingSpecs.push({
        equipment_tag: eq.tag,
        property: 'material_of_construction',
        criticality: 'critical',
        impact: `Material of construction unknown on ${eq.tag}: System cannot assert chemical compatibility or incompatibility with process fluids.`,
      });
      deviations.push({
        id: uuidv4(),
        deviation: 'CORROSION / MATERIAL INCOMPATIBILITY',
        parameter: 'Composition',
        guideword: 'OTHER THAN',
        status: 'limit_unknown',
        equipment_tag: eq.tag,
        design_limit_reference: null,
        potential_scenario: `Loss of containment from chemical corrosion, stress corrosion cracking, or embrittlement of ${eq.tag}.`,
        requires_additional_info: true,
        notes: `Material of construction is unknown. Metallurgy datasheet must be reviewed to assert chemical compatibility.`,
      });
    } else {
      const isVerified = mat.verification_status === 'verified';
      deviations.push({
        id: uuidv4(),
        deviation: 'CORROSION / MATERIAL COMPATIBILITY',
        parameter: 'Composition',
        guideword: 'OTHER THAN',
        status: isVerified ? 'verified_limit' : 'unverified_limit',
        equipment_tag: eq.tag,
        design_limit_reference: `${mat.value} (${isVerified ? 'verified' : 'unverified'})`,
        potential_scenario: `Process fluid contact with specified metallurgy (${mat.value}).`,
        requires_additional_info: !isVerified,
      });
    }

    // 4. Capacity / Volume Evaluation
    const cap = specs?.capacity;
    if (!cap || cap.value === null || cap.status === 'not_provided') {
      missingSpecs.push({
        equipment_tag: eq.tag,
        property: 'capacity',
        criticality: 'warning',
        impact: `Capacity not provided on ${eq.tag}: Inventory holdup and time to spill cannot be quantitatively evaluated.`,
      });
      deviations.push({
        id: uuidv4(),
        deviation: 'MORE LEVEL / OVERFILL',
        parameter: 'Level',
        guideword: 'MORE',
        status: 'limit_unknown',
        equipment_tag: eq.tag,
        design_limit_reference: null,
        potential_scenario: `Inlet flow exceeding outflow leading to liquid accumulation and vessel overfill.`,
        requires_additional_info: true,
        notes: `Capacity type and volume not provided. Cannot compute liquid holdup or spill time.`,
      });
    } else {
      const isVerified = cap.verification_status === 'verified';
      deviations.push({
        id: uuidv4(),
        deviation: 'MORE LEVEL / OVERFILL',
        parameter: 'Level',
        guideword: 'MORE',
        status: isVerified ? 'verified_limit' : 'unverified_limit',
        equipment_tag: eq.tag,
        design_limit_reference: `${cap.value} ${cap.unit || 'gal'} [${cap.capacity_type || 'total_volume'}]`,
        potential_scenario: `Liquid accumulation exceeding rated capacity (${cap.value} ${cap.unit || 'gal'}).`,
        requires_additional_info: !isVerified,
      });
    }
  }

  return {
    missing_specifications: missingSpecs,
    applicable_deviations: deviations,
  };
}

export function generateCandidatePhaNodes(
  projectId: string,
  equipment: EquipmentTag[],
  lines: PipingLine[]
): PhaStudyNode[] {
  const nodes: PhaStudyNode[] = [];
  const now = new Date().toISOString();

  if (equipment.length === 0) return [];

  // Group by process intent
  // Node 1: Feed Storage & Transfer
  const feedEq = equipment.filter((e) =>
    ['TK-101', 'TK-100', 'V-101', 'P-101', 'P-101A', 'P-101B', 'HV-101', 'XV-101'].some((tag) =>
      e.tag.toUpperCase().includes(tag)
    ) || (e.equipment_type === 'tank' && e.tag.includes('101')) || (e.equipment_type === 'pump' && e.tag.includes('101'))
  );

  const feedLines = lines.filter((l) =>
    ['L-101', 'L-102', '3"-NH3-101-CS'].some((tag) => l.line_number.toUpperCase().includes(tag))
  );

  if (feedEq.length > 0) {
    const nodeObj: PhaStudyNode = {
      id: uuidv4(),
      project_id: projectId,
      node_id: 'N-001',
      name: 'Feed storage and transfer',
      design_intent: 'Store raw feed material at ambient temperature and pump via transfer pump to reaction/mixing section at controlled flow rate.',
      equipment_tags: feedEq.map((e) => e.tag),
      line_numbers: feedLines.map((l) => l.line_number),
      inlet_boundaries: ['Raw material truck unloading connection', 'Storage tank inlet'],
      outlet_boundaries: ['Transfer pump discharge isolation valve'],
      basis_for_grouping: 'Feed material inventory boundary and primary motive transfer section.',
      status: 'candidate_not_authoritative',
      unresolved_questions: [
        'Confirm pump deadhead pressure vs pipe design pressure',
        'Verify high-level interlock trip on feed tank'
      ],
      operating_limits: {
        temperature_safe_upper: null,
        temperature_safe_lower: null,
        pressure_safe_upper: null,
        pressure_safe_lower: null,
        flow_safe_upper: null,
        flow_safe_lower: null,
        units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' }
      },
      requires_reassessment: false,
      reassessment_reasons: [],
      created_at: now,
      updated_at: now,
    };
    const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(nodeObj, equipment);
    nodeObj.missing_specifications = missing_specifications;
    nodeObj.applicable_deviations = applicable_deviations;
    nodes.push(nodeObj);
  }

  // Node 2: Mixing & Heat Exchange
  const mixEq = equipment.filter((e) =>
    ['MX-101', 'AG-101', 'E-101', 'HX-101', 'C-101', 'HV-102', 'HV-103'].some((tag) =>
      e.tag.toUpperCase().includes(tag)
    ) || (e.equipment_type === 'mixing_tank' || e.equipment_type === 'heat_exchanger' || e.equipment_type === 'reactor')
  );

  const mixLines = lines.filter((l) =>
    ['L-103', 'L-104'].some((tag) => l.line_number.toUpperCase().includes(tag))
  );

  if (mixEq.length > 0) {
    const nodeObj: PhaStudyNode = {
      id: uuidv4(),
      project_id: projectId,
      node_id: 'N-002',
      name: 'Mixing and heat exchange',
      design_intent: 'Blend raw materials under controlled agitation and maintain process temperature within specified limits using heat exchange utility.',
      equipment_tags: mixEq.map((e) => e.tag),
      line_numbers: mixLines.map((l) => l.line_number),
      inlet_boundaries: ['Feed line into mixer MX-101', 'Utility coolant inlet'],
      outlet_boundaries: ['Mixer discharge transfer line to product storage'],
      basis_for_grouping: 'Agitated mixing and thermal management subsystem.',
      status: 'candidate_not_authoritative',
      unresolved_questions: [
        'Determine maximum heat of reaction during inadvertent overcharging',
        'Verify loss of coolant scenario consequences'
      ],
      operating_limits: {
        temperature_safe_upper: null,
        temperature_safe_lower: null,
        pressure_safe_upper: null,
        pressure_safe_lower: null,
        flow_safe_upper: null,
        flow_safe_lower: null,
        units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' }
      },
      requires_reassessment: false,
      reassessment_reasons: [],
      created_at: now,
      updated_at: now,
    };
    const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(nodeObj, equipment);
    nodeObj.missing_specifications = missing_specifications;
    nodeObj.applicable_deviations = applicable_deviations;
    nodes.push(nodeObj);
  }

  // Node 3: Product Storage & Outlet
  const prodEq = equipment.filter((e) =>
    ['TK-102', 'TK-201', 'HV-104', 'DV-101', 'VENT-101', 'VENT-102'].some((tag) =>
      e.tag.toUpperCase().includes(tag)
    ) || (e.equipment_type === 'tank' && e.tag.includes('102'))
  );

  const prodLines = lines.filter((l) =>
    ['L-105', '1.5"-BL-201-PVC'].some((tag) => l.line_number.toUpperCase().includes(tag))
  );

  if (prodEq.length > 0) {
    const nodeObj: PhaStudyNode = {
      id: uuidv4(),
      project_id: projectId,
      node_id: 'N-003',
      name: 'Product storage and outlet',
      design_intent: 'Accumulate treated/mixed product solution and transfer to downstream battery limit or packaging line.',
      equipment_tags: prodEq.map((e) => e.tag),
      line_numbers: prodLines.map((l) => l.line_number),
      inlet_boundaries: ['Cooler discharge line into product tank'],
      outlet_boundaries: ['Final product discharge isolation valve HV-104'],
      basis_for_grouping: 'Final product containment and battery limit boundary.',
      status: 'candidate_not_authoritative',
      unresolved_questions: [
        'Verify atmospheric tank venting capacity',
        'Confirm secondary containment dike sizing'
      ],
      operating_limits: {
        temperature_safe_upper: null,
        temperature_safe_lower: null,
        pressure_safe_upper: null,
        pressure_safe_lower: null,
        flow_safe_upper: null,
        flow_safe_lower: null,
        units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' }
      },
      requires_reassessment: false,
      reassessment_reasons: [],
      created_at: now,
      updated_at: now,
    };
    const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(nodeObj, equipment);
    nodeObj.missing_specifications = missing_specifications;
    nodeObj.applicable_deviations = applicable_deviations;
    nodes.push(nodeObj);
  }

  // Fallback: If tags don't match specific suffixes, partition remaining equipment into a single candidate node
  if (nodes.length === 0 && equipment.length > 0) {
    const fallbackNode: PhaStudyNode = {
      id: uuidv4(),
      project_id: projectId,
      node_id: 'N-001',
      name: 'Complete Process Loop',
      design_intent: 'Primary process flow through unit equipment.',
      equipment_tags: equipment.map((e) => e.tag),
      line_numbers: lines.map((l) => l.line_number),
      inlet_boundaries: ['Unit battery limit'],
      outlet_boundaries: ['Unit outlet'],
      basis_for_grouping: 'Candidate node grouping all detected equipment items.',
      status: 'candidate_not_authoritative',
      unresolved_questions: ['Define individual study node boundaries'],
      operating_limits: {
        temperature_safe_upper: null,
        temperature_safe_lower: null,
        pressure_safe_upper: null,
        pressure_safe_lower: null,
        flow_safe_upper: null,
        flow_safe_lower: null,
        units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' }
      },
      requires_reassessment: false,
      reassessment_reasons: [],
      created_at: now,
      updated_at: now,
    };
    const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(fallbackNode, equipment);
    fallbackNode.missing_specifications = missing_specifications;
    fallbackNode.applicable_deviations = applicable_deviations;
    nodes.push(fallbackNode);
  }

  return nodes;
}

export function checkHazopReadiness(
  equipment: EquipmentTag[],
  lines: PipingLine[],
  chemicals: ChemicalRecord[],
  phaNodes: PhaStudyNode[],
  graphApproved: boolean
): HazopReadinessResult {
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  // 1. Process Graph Approval Gate
  if (!graphApproved) {
    blockingReasons.push('Process Graph is NOT approved. P&ID topology must be validated and signed off by an engineer before HAZOP.');
  }

  // 2. Minimum Equipment and Connections
  if (equipment.length === 0) {
    blockingReasons.push('No equipment nodes found in the process graph.');
  }
  if (lines.length === 0) {
    blockingReasons.push('Process graph has zero piping lines. Disconnected topology cannot be evaluated for loss of containment deviations.');
  }

  // 3. PHA Node Segmentation Gates
  if (phaNodes.length === 0) {
    blockingReasons.push('No PHA study nodes defined. Approved graph must be segmented into HAZOP study nodes.');
  }

  let readyNodesCount = 0;
  for (const node of phaNodes) {
    if (node.status !== 'approved') {
      blockingReasons.push(`PHA Node ${node.node_id} ("${node.name}") is in "${node.status}" status. Engineer review and approval is required.`);
    } else {
      readyNodesCount++;
    }

    if (!node.design_intent || node.design_intent.trim().length < 10) {
      blockingReasons.push(`PHA Node ${node.node_id} has no documented Design Intent. HAZOP guidewords require clear design intent.`);
    }

    // Check if node requires reassessment due to specification changes
    if (node.requires_reassessment) {
      warnings.push(`PHA Node ${node.node_id} requires reassessment: ${(node.reassessment_reasons || []).join('; ') || 'Equipment specifications modified.'}`);
    }

    // Missing critical specifications warning
    if (node.missing_specifications && node.missing_specifications.length > 0) {
      const criticalCount = node.missing_specifications.filter((m) => m.criticality === 'critical').length;
      if (criticalCount > 0) {
        warnings.push(`PHA Node ${node.node_id} has ${criticalCount} unverified critical specification(s) (e.g. MAWP/design pressure or metallurgy). Quantitative limit comparison is incomplete.`);
      }
    }

    // Operating limits check: Safe Upper/Lower limits
    const lim = node.operating_limits;
    const hasAnyLimit =
      lim.temperature_safe_upper !== null ||
      lim.pressure_safe_upper !== null ||
      lim.flow_safe_upper !== null;

    if (!hasAnyLimit) {
      warnings.push(`PHA Node ${node.node_id} has no verified Safe Upper Operating Limits (SUL). Deviations (MORE TEMP / MORE PRESSURE) will lack quantitative threshold evaluation.`);
    }
  }

  // 4. Chemical Hazard Verification
  if (chemicals.length === 0) {
    warnings.push('No chemical Safety Data Sheets (SDSs) linked. Toxicity and exposure limits will not propagate into HAZOP consequences.');
  } else {
    const unconfirmedChems = chemicals.filter((c) => c.chemical_name.review_status !== 'confirmed');
    if (unconfirmedChems.length > 0) {
      warnings.push(`${unconfirmedChems.length} chemical record(s) contain unconfirmed PSI parameters.`);
    }
  }

  const isReady = blockingReasons.length === 0 && readyNodesCount > 0 && readyNodesCount === phaNodes.length;

  return {
    ready: isReady,
    blocking_reasons: blockingReasons,
    warnings,
    nodes_ready_count: readyNodesCount,
    total_nodes_count: phaNodes.length,
    evaluated_at: new Date().toISOString(),
  };
}
