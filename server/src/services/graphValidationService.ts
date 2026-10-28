import { v4 as uuidv4 } from 'uuid';
import { EquipmentTag, PipingLine, ChemicalRecord, GraphValidationResult, ValidationIssue } from '../types';

export function validateProcessGraph(
  equipment: EquipmentTag[],
  lines: PipingLine[],
  chemicals: ChemicalRecord[],
  acknowledgedWarningIds: Set<string> = new Set()
): GraphValidationResult {
  const issues: ValidationIssue[] = [];

  const eqTagMap = new Map<string, EquipmentTag>();
  const duplicateTags = new Set<string>();

  // 1. Check Equipment Tags
  for (const eq of equipment) {
    const cleanTag = (eq.tag || '').trim().toUpperCase();

    // Missing tag check
    if (!cleanTag) {
      issues.push({
        id: uuidv4(),
        severity: 'error',
        code: 'ERR_EMPTY_TAG',
        message: `Equipment node (ID: ${eq.id.substring(0, 8)}) has an empty or missing tag identifier.`,
        entity_type: 'equipment',
        entity_id: eq.id,
      });
      continue;
    }

    // Duplicate tag check
    if (eqTagMap.has(cleanTag)) {
      duplicateTags.add(cleanTag);
      issues.push({
        id: uuidv4(),
        severity: 'error',
        code: 'ERR_DUPLICATE_TAG',
        message: `Duplicate equipment tag detected: "${cleanTag}". Each equipment item must have a unique identifier.`,
        entity_type: 'equipment',
        entity_id: eq.id,
      });
    } else {
      eqTagMap.set(cleanTag, eq);
    }

    // Unresolved classification
    if (eq.equipment_type === 'other' || eq.status === 'unresolved') {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        code: 'WARN_UNRESOLVED_EQUIPMENT_TYPE',
        message: `Equipment "${eq.tag}" has an unresolved classification ("${eq.equipment_type}"). Confirm proper taxonomy before PHA.`,
        entity_type: 'equipment',
        entity_id: eq.id,
      });
    }
  }

  // 2. Check 0 Edges / Disconnected Graph
  if (equipment.length >= 2 && lines.length === 0) {
    issues.push({
      id: uuidv4(),
      severity: 'error',
      code: 'ERR_DISCONNECTED_GRAPH_NO_EDGES',
      message: `Process graph contains ${equipment.length} equipment nodes but ZERO piping connections. Graph cannot be approved without verified process connectivity.`,
      entity_type: 'graph',
    });
  }

  // 3. Check Piping Lines and Edges
  const seenLinePairs = new Set<string>();

  for (const line of lines) {
    const cleanLineNum = (line.line_number || '').trim();

    // Missing line identifier
    if (!cleanLineNum) {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        code: 'WARN_EMPTY_LINE_NUMBER',
        message: `Line connection (ID: ${line.id.substring(0, 8)}) is missing a line identifier tag.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    const fromTag = (line.from_equipment || '').trim().toUpperCase();
    const toTag = (line.to_equipment || '').trim().toUpperCase();

    // Empty endpoints
    if (!fromTag || !toTag) {
      issues.push({
        id: uuidv4(),
        severity: 'error',
        code: 'ERR_MISSING_ENDPOINT',
        message: `Line "${line.line_number || 'Unnamed'}" has an incomplete connection (From: "${line.from_equipment || 'EMPTY'}", To: "${line.to_equipment || 'EMPTY'}"). Both endpoints are required.`,
        entity_type: 'line',
        entity_id: line.id,
      });
      continue;
    }

    // Invalid / Nonexistent endpoint check
    if (!eqTagMap.has(fromTag)) {
      issues.push({
        id: uuidv4(),
        severity: 'error',
        code: 'ERR_INVALID_FROM_NODE',
        message: `Line "${line.line_number}" originates from unknown equipment "${line.from_equipment}". Source equipment does not exist in the graph.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    if (!eqTagMap.has(toTag)) {
      issues.push({
        id: uuidv4(),
        severity: 'error',
        code: 'ERR_INVALID_TO_NODE',
        message: `Line "${line.line_number}" connects to unknown destination equipment "${line.to_equipment}". Destination equipment does not exist in the graph.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Duplicate edge check
    const pairKey = `${fromTag}->${toTag}:${cleanLineNum}`;
    if (seenLinePairs.has(pairKey)) {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        code: 'WARN_DUPLICATE_EDGE',
        message: `Duplicate connection detected: Line "${line.line_number}" between "${fromTag}" and "${toTag}" is defined multiple times.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    } else {
      seenLinePairs.add(pairKey);
    }

    // Flow direction check
    if (line.flow_direction === 'unknown') {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        code: 'WARN_UNKNOWN_FLOW_DIRECTION',
        message: `Line "${line.line_number}" has an UNKNOWN flow direction. Flow direction must be confirmed or acknowledged for HAZOP deviation analysis.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Signal Line safety rule: must NOT carry process chemicals
    if (line.functional_type === 'signal_line' && line.assigned_chemical_id) {
      issues.push({
        id: uuidv4(),
        severity: 'error',
        code: 'ERR_SIGNAL_LINE_HAS_CHEMICAL',
        message: `Signal line "${line.line_number}" has an assigned process chemical. Instrument signal loops cannot be treated as chemical process streams.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Missing chemical on process piping lines
    if (line.functional_type === 'piping_line' && !line.assigned_chemical_id && chemicals.length > 0) {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        code: 'WARN_UNASSIGNED_PROCESS_CHEMICAL',
        message: `Process piping line "${line.line_number}" does not have an assigned process chemical profile.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Unresolved connection status
    if (line.status === 'unresolved' || line.status === 'provisional') {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        code: 'WARN_PROVISIONAL_CONNECTION',
        message: `Line "${line.line_number}" remains provisional/unresolved. Field engineer review required before approval.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }
  }

  // 4. Check for Disconnected / Isolated Nodes
  if (lines.length > 0) {
    const connectedTags = new Set<string>();
    lines.forEach((l) => {
      if (l.from_equipment) connectedTags.add(l.from_equipment.toUpperCase());
      if (l.to_equipment) connectedTags.add(l.to_equipment.toUpperCase());
    });

    for (const [tag, eq] of eqTagMap.entries()) {
      if (!connectedTags.has(tag) && eq.equipment_type !== 'instrument') {
        issues.push({
          id: uuidv4(),
          severity: 'warning',
          code: 'WARN_DISCONNECTED_NODE',
          message: `Equipment node "${tag}" (${eq.description}) has zero incoming or outgoing piping connections. Verify if this is an isolated unit or missing lines.`,
          entity_type: 'equipment',
          entity_id: eq.id,
        });
      }
    }
  }

  // Mark acknowledged warnings
  issues.forEach((iss) => {
    if (
      iss.severity === 'warning' &&
      (acknowledgedWarningIds.has(iss.code) ||
       (iss.entity_id && acknowledgedWarningIds.has(`${iss.code}:${iss.entity_id}`)) ||
       (iss.entity_id && acknowledgedWarningIds.has(iss.entity_id)))
    ) {
      iss.acknowledged = true;
    }
  });

  const errors = issues.filter((i) => i.severity === 'error');
  const unacknowledgedWarnings = issues.filter((i) => i.severity === 'warning' && !i.acknowledged);

  const isValid = errors.length === 0;
  // Approval blocked by errors; warnings can be acknowledged
  const canApprove = errors.length === 0 && unacknowledgedWarnings.length === 0 && equipment.length > 0 && lines.length > 0;

  return {
    is_valid: isValid,
    can_approve: canApprove,
    errors_count: errors.length,
    warnings_count: unacknowledgedWarnings.length,
    issues,
    checked_at: new Date().toISOString(),
  };
}
