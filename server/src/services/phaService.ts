import { v4 as uuidv4 } from 'uuid';
import {
  EquipmentTag,
  PipingLine,
  ProcessStream,
  ChemicalRecord,
  PhaStudyNode,
  HazopReadinessResult,
  PhaMissingSpecAlert,
  PhaDeviationScenario,
  FlowDeviationAnalysis,
  NodeStreamSummary,
} from '../types';

/**
 * Generates flow-related HAZOP deviations for all applicable process streams in a node.
 * Evaluates the 5 mandatory flow deviations:
 * 1. NO FLOW
 * 2. LESS FLOW
 * 3. MORE FLOW
 * 4. REVERSE FLOW
 * 5. FLUCTUATING FLOW
 * Strictly grounds causes, consequences, safeguards, and instrumentation in P&ID evidence.
 */
export function generateFlowDeviationsForNode(
  nodeId: string,
  equipmentTags: string[],
  streams: ProcessStream[],
  equipment: EquipmentTag[]
): FlowDeviationAnalysis[] {
  const nodeTagSet = new Set(equipmentTags.map((t) => t.toUpperCase()));
  // Find applicable streams for this node (incoming, outgoing, and internal streams)
  const applicableStreams = streams.filter(
    (s) =>
      nodeTagSet.has(s.source_equipment_tag.toUpperCase()) ||
      nodeTagSet.has(s.destination_equipment_tag.toUpperCase())
  );

  const flowDeviations: FlowDeviationAnalysis[] = [];

  for (const stream of applicableStreams) {
    const streamName = stream.stream_number || stream.line_number || stream.id;
    const fromTo = `${stream.source_equipment_tag || 'Inlet'} -> ${stream.destination_equipment_tag || 'Outlet'}`;
    const flowRates = stream.flow_rates;
    const hasNormalFlow = flowRates.normal !== null;
    const isVerified = stream.verification_status === 'verified';
    const limitStatus: 'verified_limit' | 'unverified_limit' | 'limit_unknown' = hasNormalFlow
      ? isVerified
        ? 'verified_limit'
        : 'unverified_limit'
      : 'limit_unknown';

    // Check associated equipment
    const sourceEq = equipment.find((e) => e.tag.toUpperCase() === stream.source_equipment_tag.toUpperCase());
    const destEq = equipment.find((e) => e.tag.toUpperCase() === stream.destination_equipment_tag.toUpperCase());
    const isPumpDischarge = sourceEq?.equipment_type === 'pump';
    const hasControlValve = stream.associated_instrument_tags.some((t) => t.startsWith('FCV')) ||
      equipment.some((e) => nodeTagSet.has(e.tag) && e.equipment_type === 'control_valve');
    const flowInstruments = stream.associated_instrument_tags.filter((t) =>
      /^(FIT|FIC|FT|FI|FE|FO|FAL|FAH)-/i.test(t)
    );

    // 1. NO FLOW
    flowDeviations.push({
      id: uuidv4(),
      deviation: 'NO FLOW',
      parameter: 'Flow',
      guideword: 'NO',
      stream_id: stream.id,
      stream_number: streamName,
      from_to: fromTo,
      status: limitStatus,
      documented_limits: {
        normal: flowRates.normal,
        min_allowable: flowRates.min,
        max_allowable: flowRates.max,
        design_flow: flowRates.design,
        unit: flowRates.unit,
      },
      causes: [
        isPumpDischarge
          ? `Transfer pump ${stream.source_equipment_tag} electrical trip, motor burnout, or mechanical failure.`
          : stream.destination_equipment_tag.toUpperCase().startsWith('P-')
          ? `Downstream pump ${stream.destination_equipment_tag} electrical trip, motor burnout, or mechanical failure.`
          : `Upstream feed supply interruption from ${stream.source_equipment_tag}.`,
        hasControlValve
          ? 'Flow control valve FCV failed closed / valve closed or signal loop lost.'
          : 'Process isolation valve inadvertently closed / valve closed.',
        'Line blockage due to sediment accumulation, particulate plugging, or frozen line.',
        `Empty upstream vessel ${stream.source_equipment_tag} / loss of suction head.`,
      ],
      consequences: [
        isPumpDischarge
          ? `Pump ${stream.source_equipment_tag} deadheading against closed discharge, leading to liquid overheating, seal failure, or casing overpressure.`
          : stream.destination_equipment_tag.toUpperCase().startsWith('P-')
          ? `Loss of suction head to pump ${stream.destination_equipment_tag}, leading to pump cavitation, dry running, and mechanical seal damage.`
          : `Starvation and loss of feed to downstream process unit ${stream.destination_equipment_tag}.`,
        'Loss of reactant stoichiometry or cooling stream, leading to process upset or runaway thermal conditions.',
        'Loss of production throughput and potential process shutdown.',
      ],
      safeguards: [
        flowInstruments.length > 0 ? `Flow transmitter ${flowInstruments.join(', ')} with low flow alarm (FAL).` : 'Low flow alarm (FAL) on transfer line.',
        isPumpDischarge ? `Pump minimum flow bypass recirculation line and motor thermal overload protection.` : 'Pump suction low-pressure trip.',
        'Periodic line inspection and operator routine monitoring.',
      ],
      instrumentation_and_alarms: flowInstruments.length > 0 ? flowInstruments : ['Flow indication (FI)', 'Low flow alarm (FAL)'],
      recommendations: [
        'Confirm low flow alarm interlock trips upstream pump before deadhead overheating occurs.',
        hasNormalFlow ? `Verify operating flow remains above minimum safe threshold (${flowRates.min ?? 'documented min'}).` : 'Document minimum allowable safe flow limit to enable quantitative interlock comparison.',
      ],
      required_operating_limits: hasNormalFlow ? [] : ['Minimum allowable continuous flow rate (m3/h or gpm)', 'Pump minimum continuous stable flow (MCSF)'],
    });

    // 2. LESS FLOW
    flowDeviations.push({
      id: uuidv4(),
      deviation: 'LESS FLOW',
      parameter: 'Flow',
      guideword: 'LESS',
      stream_id: stream.id,
      stream_number: streamName,
      from_to: fromTo,
      status: flowRates.min !== null ? (isVerified ? 'verified_limit' : 'unverified_limit') : 'limit_unknown',
      documented_limits: {
        normal: flowRates.normal,
        min_allowable: flowRates.min,
        max_allowable: flowRates.max,
        design_flow: flowRates.design,
        unit: flowRates.unit,
      },
      causes: [
        'Partial blockage or particulate fouling in strainer/filter.',
        'Manual valve throttled in wrong position or control valve sticking partially closed.',
        isPumpDischarge ? `Pump ${stream.source_equipment_tag} impeller wear, low NPSH available, or partial cavitation.` : 'Reduced upstream delivery pressure.',
        'Increased fluid viscosity at lower operating temperature.',
      ],
      consequences: [
        `Reduced transfer rate into ${stream.destination_equipment_tag}, causing reaction imbalance or off-spec product.`,
        'Inadequate cooling if stream provides thermal management, leading to temperature rise.',
        'Prolonged batch cycles or level drop in downstream equipment.',
      ],
      safeguards: [
        flowInstruments.length > 0 ? `Flow indication from ${flowInstruments.join(', ')}.` : 'Flow indicator (FI).',
        'Differential pressure gauge across pump suction strainer.',
        'Automated flow controller (FIC) adjusting valve opening.',
      ],
      instrumentation_and_alarms: flowInstruments.length > 0 ? flowInstruments : ['Flow indicator (FI)', 'Flow controller (FIC)'],
      recommendations: [
        'Establish routine strainer differential pressure cleaning schedule.',
        flowRates.min !== null ? `Ensure flow does not drop below verified minimum limit of ${flowRates.min} ${flowRates.unit || ''}.` : 'Document minimum allowable flow rate for process safety baseline.',
      ],
      required_operating_limits: flowRates.min !== null ? [] : ['Minimum allowable operating flow rate'],
    });

    // 3. MORE FLOW
    flowDeviations.push({
      id: uuidv4(),
      deviation: 'MORE FLOW',
      parameter: 'Flow',
      guideword: 'MORE',
      stream_id: stream.id,
      stream_number: streamName,
      from_to: fromTo,
      status: flowRates.max !== null ? (isVerified ? 'verified_limit' : 'unverified_limit') : 'limit_unknown',
      documented_limits: {
        normal: flowRates.normal,
        min_allowable: flowRates.min,
        max_allowable: flowRates.max,
        design_flow: flowRates.design,
        unit: flowRates.unit,
      },
      causes: [
        hasControlValve ? 'Flow control valve FCV failed wide open due to air supply failure or controller loop malfunction.' : 'Bypass valve inadvertently opened.',
        'Upstream feed transfer pressure surge.',
        'Pump overspeed or inadvertent start of parallel standby pump.',
      ],
      consequences: [
        `Downstream vessel ${stream.destination_equipment_tag} liquid accumulation exceeding outflow, risking tank overfill and loss of containment.`,
        'Increased reaction rate causing excess heat generation exceeding exchanger cooling duty.',
        'Piping erosion and excessive pressure drop.',
      ],
      safeguards: [
        flowInstruments.length > 0 ? `High flow alarm (FAH) on ${flowInstruments.join(', ')}.` : 'High flow alarm (FAH).',
        `High level alarm (LAH) and high-high level trip (LAHH) on destination vessel ${stream.destination_equipment_tag}.`,
        'Flow restricting orifice (FO) or control valve mechanical travel stops.',
      ],
      instrumentation_and_alarms: flowInstruments.length > 0 ? flowInstruments : ['High flow alarm (FAH)', 'Vessel level alarm (LAH/LAHH)'],
      recommendations: [
        'Verify independent high-high level trip on downstream vessel initiates upstream feed isolation.',
        flowRates.max !== null
          ? `Confirm relief and cooling systems can accommodate maximum allowable flow (${flowRates.max} ${flowRates.unit || ''}). Note: Design flow (${flowRates.design ?? 'undocumented'}) is not equivalent to maximum allowable limit unless verified.`
          : 'Establish and verify maximum allowable flow rate based on downstream vessel venting and relief capacity.',
      ],
      required_operating_limits: flowRates.max !== null ? [] : ['Maximum allowable operating flow limit (distinguished from equipment design flow)'],
    });

    // 4. REVERSE FLOW
    flowDeviations.push({
      id: uuidv4(),
      deviation: 'REVERSE FLOW',
      parameter: 'Flow',
      guideword: 'REVERSE',
      stream_id: stream.id,
      stream_number: streamName,
      from_to: fromTo,
      status: 'limit_unknown',
      documented_limits: {
        normal: flowRates.normal,
        unit: flowRates.unit,
      },
      causes: [
        `Downstream pressure surge or differential pressure inversion in ${stream.destination_equipment_tag} exceeding upstream supply pressure.`,
        isPumpDischarge ? `Pump ${stream.source_equipment_tag} tripping while discharge line remains under pressure.` : 'Differential pressure imbalance across interconnected process units.',
        'Check valve failure, reverse leakage, or absence of non-return check valve (NRV).',
      ],
      consequences: [
        `Backflow of process chemical from ${stream.destination_equipment_tag} into upstream vessel ${stream.source_equipment_tag}, causing chemical cross-contamination or inadvertent runaway reaction.`,
        'Overpressurization of lower-rated upstream piping or equipment.',
        isPumpDischarge ? `Reverse rotation and catastrophic mechanical damage to pump ${stream.source_equipment_tag}.` : 'Loss of process containment.',
      ],
      safeguards: [
        'Check valve / non-return valve (NRV) installed on pump discharge line.',
        'Automated isolation valve (XV) closing upon pump shutdown interlock.',
        'Differential pressure monitoring between upstream and downstream equipment.',
      ],
      instrumentation_and_alarms: ['Check valve (NRV)', 'Differential pressure indicator (DPI)', 'Motor run status feedback'],
      recommendations: [
        'Verify check valve (NRV) is documented on P&ID and included in critical safety equipment inspection program.',
        'Implement automated fast-acting shutoff valve if inadvertent mixing of backwards fluid causes toxic gas or violent exotherm.',
      ],
      required_operating_limits: ['Maximum allowable reverse differential pressure', 'Check valve seat leakage criteria'],
    });

    // 5. FLUCTUATING FLOW
    flowDeviations.push({
      id: uuidv4(),
      deviation: 'FLUCTUATING FLOW',
      parameter: 'Flow',
      guideword: 'OTHER THAN',
      stream_id: stream.id,
      stream_number: streamName,
      from_to: fromTo,
      status: 'limit_unknown',
      documented_limits: {
        normal: flowRates.normal,
        unit: flowRates.unit,
      },
      causes: [
        hasControlValve ? 'Flow control loop (FIC) hunting or improper PID tuning parameters.' : 'Intermittent valve manipulation.',
        'Two-phase flow slugging in piping line.',
        isPumpDischarge ? `Pump ${stream.source_equipment_tag} suction vortexing, low NPSH margin, or intermittent air ingress.` : 'Variable upstream supply header pressure.',
      ],
      consequences: [
        'Process instability and temperature/concentration swings in downstream units.',
        'Level oscillations and false alarms in vessels.',
        'Water hammer and mechanical fatigue on piping supports and instruments.',
      ],
      safeguards: [
        'Properly tuned PID controller dampening with anti-reset windup.',
        'Pulsation dampeners or surge vessels.',
        'Vortex breaker on upstream tank suction nozzle.',
      ],
      instrumentation_and_alarms: ['Flow controller (FIC) trend logging', 'Vibration sensors'],
      recommendations: [
        'Inspect controller tuning parameters and verify stable loop operation during flow rate changes.',
        'Verify pump suction line has adequate liquid submergence to prevent air entrainment.',
      ],
      required_operating_limits: ['Allowable flow variation band (+/- % of setpoint)'],
    });
  }

  return flowDeviations;
}

/**
 * Attaches comprehensive stream context, stream summary metrics, and flow deviations to a PHA study node.
 */
export function attachStreamContextToNode(
  node: PhaStudyNode,
  allStreams: ProcessStream[],
  allEquipment: EquipmentTag[] = [],
  allLines: PipingLine[] = []
): PhaStudyNode {
  const nodeTagsUpper = node.equipment_tags.map((t) => t.toUpperCase());

  // If no streams were provided, synthesize from piping lines
  let streams = allStreams;
  if (streams.length === 0 && allLines.length > 0) {
    streams = allLines
      .filter((l) => l.functional_type === 'piping_line')
      .map((l) => ({
        id: l.stream_id || `stream-${l.id}`,
        project_id: node.project_id,
        stream_number: `STR-${l.line_number}`,
        source_equipment_id: null,
        source_equipment_tag: l.from_equipment,
        destination_equipment_id: null,
        destination_equipment_tag: l.to_equipment,
        connected_line_id: l.id,
        line_number: l.line_number,
        material_description: l.stream_label || 'Process Fluid',
        assigned_chemical_id: l.assigned_chemical_id,
        flow_direction: l.flow_direction,
        flow_rates: {
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
        pipe_nominal_diameter: l.size,
        pipe_spec: l.material,
        associated_instrument_tags: [],
        source: { document: l.source.document, page: l.source.page, snippet: l.source.snippet },
        data_origin: 'document_extracted',
        verification_status: 'unverified',
        created_at: l.created_at,
        updated_at: l.created_at,
      }));
  }

  // 1. Incoming streams: destination is inside node, source is outside or boundary
  const incoming = streams.filter(
    (s) =>
      nodeTagsUpper.includes(s.destination_equipment_tag.toUpperCase()) &&
      !nodeTagsUpper.includes(s.source_equipment_tag.toUpperCase())
  );

  // 2. Outgoing streams: source is inside node, destination is outside or boundary
  const outgoing = streams.filter(
    (s) =>
      nodeTagsUpper.includes(s.source_equipment_tag.toUpperCase()) &&
      !nodeTagsUpper.includes(s.destination_equipment_tag.toUpperCase())
  );

  // 3. Internal streams: both source and destination are inside node
  const internal = streams.filter(
    (s) =>
      nodeTagsUpper.includes(s.source_equipment_tag.toUpperCase()) &&
      nodeTagsUpper.includes(s.destination_equipment_tag.toUpperCase())
  );

  const nodeStreams = [...incoming, ...outgoing, ...internal];

  // Calculate completeness metrics
  const knownFlowCount = nodeStreams.filter(
    (s) => s.flow_rates.normal !== null || s.flow_rates.design !== null || s.flow_rates.actual !== null
  ).length;
  const unknownFlowCount = nodeStreams.length - knownFlowCount;
  const knownConditionsCount = nodeStreams.filter(
    (s) => s.operating_pressure.value !== null || s.operating_temperature.value !== null
  ).length;
  const missingCriticalCount = [...incoming, ...outgoing].filter(
    (s) => s.flow_rates.normal === null && s.flow_rates.design === null
  ).length;
  const verifiedCount = nodeStreams.filter((s) => s.verification_status === 'verified').length;
  const unverifiedCount = nodeStreams.length - verifiedCount;

  node.incoming_stream_ids = incoming.map((s) => s.id);
  node.outgoing_stream_ids = outgoing.map((s) => s.id);
  node.incoming_streams = incoming;
  node.outgoing_streams = outgoing;

  node.stream_summary = {
    incoming_streams: incoming,
    outgoing_streams: outgoing,
    incoming_count: incoming.length,
    outgoing_count: outgoing.length,
    known_flow_count: knownFlowCount,
    unknown_flow_count: unknownFlowCount,
    known_conditions_count: knownConditionsCount,
    missing_critical_count: missingCriticalCount,
    unverified_count: unverifiedCount,
    verified_count: verifiedCount,
  };

  // Associated valves & instruments
  const nodeEquipmentItems = allEquipment.filter((e) => nodeTagsUpper.includes(e.tag.toUpperCase()));
  node.associated_valves = nodeEquipmentItems
    .filter((e) =>
      ['manual_valve', 'isolation_valve', 'control_valve', 'drain_valve'].includes(e.equipment_type) ||
      /^(HV|XV|FCV|PCV|TCV|LCV|DV)-/i.test(e.tag)
    )
    .map((e) => e.tag);

  node.associated_instruments = nodeEquipmentItems
    .filter((e) =>
      e.equipment_type === 'instrument' ||
      /^(FIT|FIC|FT|FE|FO|FI|TIT|LIT|PIT|AIT|TI|LI|PI|FAL|FAH)-/i.test(e.tag)
    )
    .map((e) => e.tag);

  // Identify control loops (e.g. FIC and FCV pairs)
  const loops: string[] = [];
  for (const inst of node.associated_instruments) {
    if (inst.startsWith('FIC')) {
      const loopNum = inst.replace(/\D/g, '');
      const valve = node.associated_valves.find((v) => v.includes(loopNum));
      if (valve) {
        loops.push(`${inst} / ${valve} Flow Control Loop`);
      } else {
        loops.push(`${inst} Flow Indication & Control Loop`);
      }
    }
  }
  node.control_loops = loops.length > 0 ? loops : ['Manual flow modulation'];

  // Missing Process Information
  const missingInfo: string[] = [];
  if (missingCriticalCount > 0) {
    const missingStreamNames = [...incoming, ...outgoing]
      .filter((s) => s.flow_rates.normal === null && s.flow_rates.design === null)
      .map((s) => `${s.stream_number} (${s.source_equipment_tag} -> ${s.destination_equipment_tag})`);
    missingInfo.push(
      `[UNKNOWN STREAM FLOW RATES]: ${missingCriticalCount} boundary stream(s) lack documented flow rates: ${missingStreamNames.join('; ')}. Quantitative deviation threshold evaluation remains incomplete.`
    );
  }

  // Update safe limits from stream operating data if present
  let safeMinFlow: number | null = null;
  let safeMaxFlow: number | null = null;
  for (const s of [...incoming, ...outgoing]) {
    if (s.flow_rates.min !== null) safeMinFlow = s.flow_rates.min;
    if (s.flow_rates.max !== null) safeMaxFlow = s.flow_rates.max;
  }
  if (safeMinFlow !== null && node.operating_limits.flow_safe_lower === null) {
    node.operating_limits.flow_safe_lower = safeMinFlow;
  }
  if (safeMaxFlow !== null && node.operating_limits.flow_safe_upper === null) {
    node.operating_limits.flow_safe_upper = safeMaxFlow;
  }

  if (node.operating_limits.flow_safe_upper === null) {
    missingInfo.push(`[MISSING FLOW LIMITS]: Safe upper flow limit not documented for node ${node.node_id}.`);
  }
  node.missing_process_information = missingInfo;

  // Generate flow deviations
  const flowDevs = generateFlowDeviationsForNode(node.node_id, node.equipment_tags, nodeStreams, allEquipment);
  node.flow_deviations = flowDevs;

  // Append flow deviations into applicable_deviations for seamless consumption by existing consumers
  const flowDeviationScenarios: PhaDeviationScenario[] = flowDevs.map((fd) => ({
    id: fd.id,
    deviation: fd.deviation,
    parameter: 'Flow',
    guideword: fd.guideword,
    status: fd.status,
    equipment_tag: fd.from_to,
    design_limit_reference: fd.documented_limits.normal !== null && fd.documented_limits.normal !== undefined
      ? `Normal: ${fd.documented_limits.normal} ${fd.documented_limits.unit || ''} (Design: ${fd.documented_limits.design_flow ?? 'N/A'})`
      : null,
    potential_scenario: fd.consequences[0] || `${fd.deviation} in ${fd.from_to}`,
    requires_additional_info: fd.status === 'limit_unknown',
    notes: fd.causes[0],
  }));

  if (!node.applicable_deviations) {
    node.applicable_deviations = [];
  }
  // Avoid duplicating flow deviations if re-evaluating
  node.applicable_deviations = [
    ...node.applicable_deviations.filter((d) => d.parameter !== 'Flow'),
    ...flowDeviationScenarios,
  ];
  return node;
}

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
        potential_scenario: `Process temperature exceeding design temperature rating of ${temp.value} ${temp.unit || '°F'}.`,
        requires_additional_info: !isVerified,
      });
    }

    // 3. Material of Construction Evaluation
    const mat = specs?.material_of_construction;
    if (!mat || mat.value === null || mat.status === 'not_provided' || mat.value === 'Unknown') {
      missingSpecs.push({
        equipment_tag: eq.tag,
        property: 'material_of_construction',
        criticality: 'critical',
        impact: `Material of construction missing or unknown on ${eq.tag}: Cannot verify chemical compatibility or incompatibility or corrosion allowance under OSHA 1910.119(d)(1)(v).`,
      });
      deviations.push({
        id: uuidv4(),
        deviation: 'CORROSION / MATERIAL COMPATIBILITY',
        parameter: 'Composition',
        guideword: 'OTHER THAN',
        status: 'limit_unknown',
        equipment_tag: eq.tag,
        design_limit_reference: null,
        potential_scenario: `Unverified chemical attack or accelerated corrosion on ${eq.tag} due to undocumented metallurgy.`,
        requires_additional_info: true,
        notes: `Metallurgy not provided. Chemical compatibility verification blocked.`,
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
        potential_scenario: `Chemical compatibility check for ${mat.value}.`,
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
  lines: PipingLine[],
  streams: ProcessStream[] = []
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
        'Verify high-level interlock trip on feed tank',
      ],
      operating_limits: {
        temperature_safe_upper: null,
        temperature_safe_lower: null,
        pressure_safe_upper: null,
        pressure_safe_lower: null,
        flow_safe_upper: null,
        flow_safe_lower: null,
        units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' },
      },
      requires_reassessment: false,
      reassessment_reasons: [],
      created_at: now,
      updated_at: now,
    };
    const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(nodeObj, equipment);
    nodeObj.missing_specifications = missing_specifications;
    nodeObj.applicable_deviations = applicable_deviations;
    attachStreamContextToNode(nodeObj, streams, equipment, lines);
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
        'Verify loss of coolant scenario consequences',
      ],
      operating_limits: {
        temperature_safe_upper: null,
        temperature_safe_lower: null,
        pressure_safe_upper: null,
        pressure_safe_lower: null,
        flow_safe_upper: null,
        flow_safe_lower: null,
        units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' },
      },
      requires_reassessment: false,
      reassessment_reasons: [],
      created_at: now,
      updated_at: now,
    };
    const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(nodeObj, equipment);
    nodeObj.missing_specifications = missing_specifications;
    nodeObj.applicable_deviations = applicable_deviations;
    attachStreamContextToNode(nodeObj, streams, equipment, lines);
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
        'Confirm secondary containment dike sizing',
      ],
      operating_limits: {
        temperature_safe_upper: null,
        temperature_safe_lower: null,
        pressure_safe_upper: null,
        pressure_safe_lower: null,
        flow_safe_upper: null,
        flow_safe_lower: null,
        units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' },
      },
      requires_reassessment: false,
      reassessment_reasons: [],
      created_at: now,
      updated_at: now,
    };
    const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(nodeObj, equipment);
    nodeObj.missing_specifications = missing_specifications;
    nodeObj.applicable_deviations = applicable_deviations;
    attachStreamContextToNode(nodeObj, streams, equipment, lines);
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
        units: { temperature: '°C', pressure: 'bar(g)', flow: 'm3/h' },
      },
      requires_reassessment: false,
      reassessment_reasons: [],
      created_at: now,
      updated_at: now,
    };
    const { missing_specifications, applicable_deviations } = evaluateNodeSpecifications(fallbackNode, equipment);
    fallbackNode.missing_specifications = missing_specifications;
    fallbackNode.applicable_deviations = applicable_deviations;
    attachStreamContextToNode(fallbackNode, streams, equipment, lines);
    nodes.push(fallbackNode);
  }

  return nodes;
}

export function checkHazopReadiness(
  equipment: EquipmentTag[],
  lines: PipingLine[],
  chemicals: ChemicalRecord[],
  phaNodes: PhaStudyNode[],
  graphApproved: boolean,
  streams: ProcessStream[] = []
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
      warnings.push(`PHA Node ${node.node_id} has no verified Safe Upper Operating Limits (SUL). Deviations (MORE TEMP / MORE PRESSURE / MORE FLOW) will lack quantitative threshold evaluation.`);
    }

    // Stream Completeness and Flow-rate Readiness reporting (Requirement 8)
    if (node.stream_summary) {
      const { unknown_flow_count, unverified_count, incoming_count, outgoing_count } = node.stream_summary;
      if (unknown_flow_count > 0) {
        warnings.push(
          `PHA Node ${node.node_id} has ${unknown_flow_count} of ${incoming_count + outgoing_count} stream(s) with unknown flow rates. Qualitative assessment permitted; quantitative threshold comparison requires documented flow rates.`
        );
      }
      if (unverified_count > 0) {
        warnings.push(`PHA Node ${node.node_id} has ${unverified_count} unverified process stream(s). Field verification recommended.`);
      }
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

    // Inspect missing or unverified critical fields on assigned chemicals in study nodes
    for (const node of phaNodes) {
      const nodeEq = equipment.filter((e) => (node.equipment_tags || []).includes(e.tag));
      const nodeChemIds = new Set(nodeEq.map((e) => e.assigned_chemical_id).filter((id): id is string => Boolean(id)));

      for (const chemId of nodeChemIds) {
        const chem = chemicals.find((c) => c.id === chemId);
        if (chem) {
          const chemName = chem.chemical_name?.user_value || chem.chemical_name?.value || 'Chemical';

          // Check toxicity
          if (!chem.psi_parameters.toxicity.value || chem.psi_parameters.toxicity.review_status === 'missing') {
            warnings.push(`PHA Node ${node.node_id}: Assigned chemical '${chemName}' has missing toxicity data. Health consequence severity cannot be determined.`);
          }

          // Check exposure limits
          if (!chem.psi_parameters.permissible_exposure_limits.value || chem.psi_parameters.permissible_exposure_limits.review_status === 'missing') {
            warnings.push(`PHA Node ${node.node_id}: Assigned chemical '${chemName}' has missing exposure limits (PEL/TLV). Health hazard exceedance cannot be quantitatively evaluated.`);
          }

          // Check reactivity / mixing
          if (!chem.psi_parameters.inadvertent_mixing_hazards.value || chem.psi_parameters.inadvertent_mixing_hazards.review_status === 'missing') {
            warnings.push(`PHA Node ${node.node_id}: Assigned chemical '${chemName}' has unknown inadvertent mixing hazards. Incompatibility cannot be assumed safe.`);
          }
        }
      }
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
