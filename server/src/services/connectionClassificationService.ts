import {
  ProcessLine,
  EquipmentTag,
  ConnectionClassification,
  ConnectionType,
  ConnectionValidationIssue,
  ConnectionValidationReport,
  FlowDirection,
} from '../types';

/**
 * Standard boundary tags that are valid physical connection endpoints
 * without requiring a dedicated internal equipment node.
 */
const KNOWN_BOUNDARY_TAGS = new Set([
  'ATMOSPHERE',
  'FLARE',
  'FLARE_HEADER',
  'SEWER',
  'BATTERY_LIMIT',
  'BL',
  'UTILITY',
  'UTILITY_HEADER',
  'HEADER',
  'OFF-PAGE',
  'OPC',
  'DRAIN',
  'VENT',
]);

/**
 * Normalizes and determines the connection classification for any line.
 * Distinguishes:
 * 1. process_piping (physical process fluid transport)
 * 2. instrument_signal (control, transmitter, DCS loop — NO material flow)
 * 3. utility_connection (cooling water, steam, instrument air, nitrogen — physical fluid transport)
 * 4. non_process_equipment_relationship (skid, structural, mechanical, ground — NO material flow)
 */
export function classifyConnection(line: Partial<ProcessLine>): ConnectionClassification {
  // 1. Explicit connection classification
  if (line.connection_classification) {
    return line.connection_classification;
  }

  // 2. Explicit connection type
  if (line.connection_type) {
    if (line.connection_type === 'non_process' || line.connection_type === 'non_process_equipment_relationship') {
      return 'non_process_equipment_relationship';
    }
    if (line.connection_type === 'instrument_signal') return 'instrument_signal';
    if (line.connection_type === 'utility_connection') return 'utility_connection';
    if (line.connection_type === 'process_piping') return 'process_piping';
  }

  // 3. Functional type mapping
  if (line.functional_type === 'signal_line') return 'instrument_signal';
  if (line.functional_type === 'utility_line') return 'utility_connection';
  if (line.functional_type === 'non_process_line') return 'non_process_equipment_relationship';

  // 4. Line identifier heuristic analysis
  const lineNum = String(line.line_number || '').trim().toUpperCase();
  const service = String(line.stream_label || line.fluid_service?.value || '').trim().toUpperCase();

  // Instrument signals
  const signalPrefixes = ['TT-', 'PT-', 'LT-', 'FT-', 'SIC-', 'TIC-', 'PIC-', 'LIC-', 'FIC-', 'ESD-', 'XV-', 'HS-', 'ZS-', 'DPS-'];
  if (signalPrefixes.some((p) => lineNum.startsWith(p)) || service.includes('SIGNAL') || service.includes('4-20MA')) {
    return 'instrument_signal';
  }

  // Utility connections
  const utilityTokens = ['CW', 'CWR', 'CWS', 'STM', 'STEAM', 'IA', 'INSTRUMENT AIR', 'N2', 'NITROGEN', 'FW', 'FIRE WATER', 'DW', 'RW', 'UTILITY'];
  if (utilityTokens.some((t) => lineNum.startsWith(t + '-') || lineNum.includes('-' + t + '-') || service.includes(t))) {
    return 'utility_connection';
  }

  // Non-process relationships
  const nonProcessTokens = ['SKID', 'STRUC', 'GND', 'EARTH', 'MOUNT', 'STRUCTURAL', 'MECHANICAL'];
  if (nonProcessTokens.some((t) => lineNum.startsWith(t + '-') || service.includes(t))) {
    return 'non_process_equipment_relationship';
  }

  return 'process_piping';
}

/**
 * Checks whether a connection type supports physical material/fluid flow.
 * Mandatory Correction #2:
 * - process_piping: TRUE
 * - utility_connection: TRUE (Supports physical fluid transport and can carry process streams)
 * - instrument_signal: FALSE (Strictly excluded from material flow)
 * - non_process_equipment_relationship: FALSE (Strictly excluded from material flow)
 */
export function isMaterialFlowConnection(classification: ConnectionClassification): boolean {
  return classification === 'process_piping' || classification === 'utility_connection';
}

/**
 * Validates connection endpoints, classifications, material flow restrictions, and flow directions.
 * Adheres strictly to the 4 severity tiers:
 * - critical_error (blocks approval)
 * - warning (requires awareness/action)
 * - engineering_review_required (requires human confirmation)
 * - informational (does not block approval)
 */
export function validateConnectionTopology(
  lines: ProcessLine[],
  equipment: EquipmentTag[],
  projectId: string
): ConnectionValidationReport {
  const issues: ConnectionValidationIssue[] = [];
  const equipmentTagMap = new Set<string>(equipment.map((e) => e.tag.toUpperCase().trim()));

  let processPipingCount = 0;
  let instrumentSignalCount = 0;
  let utilityConnectionCount = 0;
  let nonProcessCount = 0;

  for (const line of lines) {
    const classification = classifyConnection(line);
    const lineNum = line.line_number || 'UNTAGGED-LINE';
    const fromEq = String(line.from_equipment || '').trim().toUpperCase();
    const toEq = String(line.to_equipment || '').trim().toUpperCase();

    // Increment classification counts
    switch (classification) {
      case 'process_piping':
        processPipingCount++;
        break;
      case 'instrument_signal':
        instrumentSignalCount++;
        break;
      case 'utility_connection':
        utilityConnectionCount++;
        break;
      case 'non_process_equipment_relationship':
        nonProcessCount++;
        break;
    }

    const isBoundary =
      line.is_drawing_boundary ||
      line.drawing_boundary_target != null ||
      line.source?.snippet?.toLowerCase().includes('boundary') ||
      line.source?.snippet?.toLowerCase().includes('off-page') ||
      line.notes?.toLowerCase().includes('off-page') ||
      line.notes?.toLowerCase().includes('boundary');

    // -------------------------------------------------------------
    // RULE 1: Connection Endpoint Validation
    // -------------------------------------------------------------
    // Source endpoint check
    if (!fromEq || fromEq === 'UNKNOWN') {
      if (isBoundary) {
        issues.push({
          id: `review-boundary-from-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'engineering_review_required',
          category: 'cross_drawing_boundary',
          message: `Connection ${lineNum} is a cross-drawing boundary connector awaiting external drawing resolution.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          is_drawing_boundary: true,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      } else {
        issues.push({
          id: `crit-endpoint-from-missing-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'critical_error',
          category: 'unresolved_endpoint',
          message: `Connection ${lineNum} has an unresolved source endpoint (from_equipment is missing or UNKNOWN).`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: false,
          created_at: new Date().toISOString(),
        });
      }
    } else if (equipment.length > 0 && !equipmentTagMap.has(fromEq) && !KNOWN_BOUNDARY_TAGS.has(fromEq)) {
      if (isBoundary) {
        issues.push({
          id: `review-boundary-from-ext-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'engineering_review_required',
          category: 'cross_drawing_boundary',
          message: `Connection ${lineNum} originates from external boundary '${fromEq}' on another drawing.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          is_drawing_boundary: true,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      } else {
        issues.push({
          id: `crit-endpoint-from-notfound-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'critical_error',
          category: 'unresolved_endpoint',
          message: `Connection ${lineNum} specifies unregistered source equipment '${fromEq}'.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: false,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Destination endpoint check
    if (!toEq || toEq === 'UNKNOWN') {
      if (isBoundary) {
        issues.push({
          id: `review-boundary-to-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'engineering_review_required',
          category: 'cross_drawing_boundary',
          message: `Connection ${lineNum} is a cross-drawing boundary connector awaiting external drawing resolution.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          is_drawing_boundary: true,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      } else {
        issues.push({
          id: `crit-endpoint-to-missing-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'critical_error',
          category: 'unresolved_endpoint',
          message: `Connection ${lineNum} has an unresolved destination endpoint (to_equipment is missing or UNKNOWN).`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: false,
          created_at: new Date().toISOString(),
        });
      }
    } else if (equipment.length > 0 && !equipmentTagMap.has(toEq) && !KNOWN_BOUNDARY_TAGS.has(toEq)) {
      if (isBoundary) {
        issues.push({
          id: `review-boundary-to-ext-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'engineering_review_required',
          category: 'cross_drawing_boundary',
          message: `Connection ${lineNum} terminates at external boundary '${toEq}' on another drawing.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          is_drawing_boundary: true,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      } else {
        issues.push({
          id: `crit-endpoint-to-notfound-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'critical_error',
          category: 'unresolved_endpoint',
          message: `Connection ${lineNum} specifies unregistered destination equipment '${toEq}'.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: false,
          created_at: new Date().toISOString(),
        });
      }
    }

    // Circular connection / self loop check
    if (fromEq && toEq && fromEq === toEq) {
      const isDesignatedRecirc =
        lineNum.toLowerCase().includes('recirc') ||
        lineNum.toLowerCase().includes('bypass') ||
        line.notes?.toLowerCase().includes('recirculation') ||
        line.notes?.toLowerCase().includes('bypass') ||
        line.stream_label?.toLowerCase().includes('recirc');

      if (isDesignatedRecirc) {
        issues.push({
          id: `info-recirc-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'informational',
          category: 'self_loop',
          message: `Equipment ${fromEq} features a designated recirculation/minimum-flow bypass loop.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      } else {
        issues.push({
          id: `warn-circular-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'warning',
          category: 'circular_connection',
          message: `Connection ${lineNum} connects equipment ${fromEq} to itself without designated recirculation labeling.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      }
    }

    // -------------------------------------------------------------
    // RULE 2: Material Flow Restrictions (Mandatory Correction #2)
    // -------------------------------------------------------------
    const hasChemicalAssignment = Boolean(
      line.assigned_chemical_id ||
      (line.chemical_composition && line.chemical_composition.length > 0)
    );
    const hasStreamAssignment = Boolean(line.stream_id);
    const hasOperatingFlow =
      typeof line.operating_flow_rate?.value === 'number' && line.operating_flow_rate.value > 0;

    if (classification === 'instrument_signal') {
      if (hasChemicalAssignment || hasStreamAssignment || hasOperatingFlow) {
        issues.push({
          id: `crit-signal-material-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'critical_error',
          category: 'material_flow_on_signal',
          message: `Instrument signal connection ${lineNum} is strictly excluded from physical material-flow modeling and cannot carry chemical fluids or process streams.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: false,
          created_at: new Date().toISOString(),
        });
      }
    } else if (classification === 'non_process_equipment_relationship') {
      if (hasChemicalAssignment || hasStreamAssignment || hasOperatingFlow) {
        issues.push({
          id: `crit-nonprocess-material-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'critical_error',
          category: 'material_flow_on_non_process',
          message: `Non-process equipment relationship ${lineNum} cannot carry physical fluid or chemical process streams.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: false,
          created_at: new Date().toISOString(),
        });
      }
    } else if (classification === 'utility_connection') {
      // Utility connections support physical fluid transport!
      // Check if fluid identity is missing
      const utilityFluid = line.fluid_service?.value || line.stream_label;
      if (!utilityFluid || utilityFluid.trim() === '') {
        issues.push({
          id: `warn-utility-fluid-missing-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'warning',
          category: 'utility_fluid_gap',
          message: `Utility connection ${lineNum} does not specify utility fluid identity (e.g., CW, Steam, N2, IA).`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      }
    }

    // -------------------------------------------------------------
    // RULE 3: Flow Direction Validation
    // -------------------------------------------------------------
    if (isMaterialFlowConnection(classification)) {
      if (!line.flow_direction || line.flow_direction === 'unknown') {
        issues.push({
          id: `warn-flowdir-unknown-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'warning',
          category: 'flow_direction_conflict',
          message: `Fluid transport connection ${lineNum} has unknown or unconfirmed flow direction.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      } else if (line.flow_direction === 'bidirectional') {
        issues.push({
          id: `info-flowdir-bidi-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'informational',
          category: 'flow_direction_conflict',
          message: `Connection ${lineNum} is operating in bidirectional mode (e.g. equalization or relief).`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      }
    }

    // -------------------------------------------------------------
    // RULE 4: Missing Operating Data (Mandatory Correction #4)
    // Missing operating data must NOT invalidate topology.
    // -------------------------------------------------------------
    if (isMaterialFlowConnection(classification)) {
      const hasFlow = line.operating_flow_rate?.value != null;
      const hasPress = line.operating_pressure?.value != null;
      const hasTemp = line.operating_temperature?.value != null;

      if (!hasFlow || !hasPress || !hasTemp) {
        const missingFields = [
          !hasFlow && 'flow rate',
          !hasPress && 'operating pressure',
          !hasTemp && 'operating temperature',
        ]
          .filter(Boolean)
          .join(', ');

        issues.push({
          id: `info-missing-data-${line.id}`,
          connection_id: line.id,
          line_number: lineNum,
          severity: 'informational',
          category: 'missing_engineering_data',
          message: `Connection ${lineNum} operating conditions not fully provided (${missingFields}); topology remains valid.`,
          source_equipment: fromEq,
          target_equipment: toEq,
          connection_classification: classification,
          can_approve: true,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  const criticalErrorsCount = issues.filter((i) => i.severity === 'critical_error').length;
  const warningsCount = issues.filter((i) => i.severity === 'warning').length;
  const reviewRequiredCount = issues.filter((i) => i.severity === 'engineering_review_required').length;
  const informationalCount = issues.filter((i) => i.severity === 'informational').length;

  return {
    project_id: projectId,
    total_connections_count: lines.length,
    process_piping_count: processPipingCount,
    instrument_signal_count: instrumentSignalCount,
    utility_connection_count: utilityConnectionCount,
    non_process_count: nonProcessCount,
    critical_errors_count: criticalErrorsCount,
    warnings_count: warningsCount,
    review_required_count: reviewRequiredCount,
    informational_count: informationalCount,
    issues,
    can_approve: criticalErrorsCount === 0,
    validated_at: new Date().toISOString(),
  };
}
