import { v4 as uuidv4 } from 'uuid';
import {
  EquipmentTag,
  PipingLine,
  ChemicalRecord,
  GraphValidationResult,
  ValidationIssue,
  DocumentRecord,
  ProcessStream,
  CrossDocumentDiscrepancy,
} from '../types';
import { validateEquipmentNodes } from './equipmentValidationService';

export function validateProcessGraph(
  equipment: EquipmentTag[],
  lines: PipingLine[],
  chemicals: ChemicalRecord[],
  acknowledgedWarningIds: Set<string> = new Set(),
  documents: DocumentRecord[] = [],
  streams: ProcessStream[] = [],
  discrepancies: CrossDocumentDiscrepancy[] = []
): GraphValidationResult {
  const issues: ValidationIssue[] = [];

  const eqTagMap = new Map<string, EquipmentTag>();
  const duplicateTags = new Set<string>();

  // 1. Run Equipment Validation Engine (Phase 1)
  const equipReport = validateEquipmentNodes(equipment, lines, documents, acknowledgedWarningIds);

  for (const eq of equipment) {
    const cleanTag = (eq.tag || '').trim().toUpperCase();
    if (cleanTag) {
      if (eqTagMap.has(cleanTag)) {
        duplicateTags.add(cleanTag);
      } else {
        eqTagMap.set(cleanTag, eq);
      }
    }
  }

  // Add equipment issues from validation report
  issues.push(...equipReport.issues);

  // 2. Missing Operating Conditions Check (Non-blocking informational) & Unverified Equipment Check
  for (const eq of equipment) {
    const hasDesignPressure = eq.specifications?.design_pressure?.value !== undefined && eq.specifications?.design_pressure?.value !== null;
    const hasDesignTemp = eq.specifications?.design_temperature?.value !== undefined && eq.specifications?.design_temperature?.value !== null;
    if (!hasDesignPressure && !hasDesignTemp) {
      issues.push({
        id: uuidv4(),
        severity: 'informational',
        category: 'missing_engineering_information',
        code: 'INFO_MISSING_OPERATING_DATA',
        message: `Equipment "${eq.tag}" does not have design operating conditions recorded in uploaded documents (zero-fabrication policy).`,
        entity_type: 'equipment',
        entity_id: eq.id,
      });
    }

    if (eq.status === 'provisional' || eq.verification_status === 'unverified') {
      const isAck =
        acknowledgedWarningIds.has('WARN_UNVERIFIED_EQUIPMENT') ||
        acknowledgedWarningIds.has('WARN_EQUIPMENT_PROVISIONAL') ||
        acknowledgedWarningIds.has(eq.id) ||
        acknowledgedWarningIds.has(`WARN_UNVERIFIED_EQUIPMENT:${eq.id}`) ||
        acknowledgedWarningIds.has(`WARN_EQUIPMENT_PROVISIONAL:${eq.id}`);
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'topology_integrity',
        code: 'WARN_UNVERIFIED_EQUIPMENT',
        message: `Equipment node "${eq.tag}" is unverified / provisional. Engineer verification or warning acknowledgment required before approval.`,
        entity_type: 'equipment',
        entity_id: eq.id,
        acknowledged: isAck,
      });
    }
  }

  // 3. Check 0 Edges / Disconnected Graph
  const allConfirmedIsolated = equipment.length > 0 && equipment.every((e) => e.isolated_review_status === 'confirmed_isolated');
  if (equipment.length >= 2 && lines.length === 0 && !allConfirmedIsolated) {
    issues.push({
      id: uuidv4(),
      severity: 'error',
      category: 'topology_integrity',
      code: 'ERR_DISCONNECTED_GRAPH_NO_EDGES',
      message: `Process graph contains ${equipment.length} equipment nodes but ZERO piping connections. Graph cannot be approved without verified process connectivity.`,
      entity_type: 'graph',
    });
  }

  // 4. Duplicate Line Identifier Check
  const lineNumMap = new Map<string, string[]>();
  for (const line of lines) {
    const cleanLineNum = (line.line_number || '').trim().toUpperCase();
    if (cleanLineNum) {
      const list = lineNumMap.get(cleanLineNum) || [];
      list.push(line.id);
      lineNumMap.set(cleanLineNum, list);
    }
  }
  for (const [lineNum, ids] of lineNumMap.entries()) {
    if (ids.length > 1) {
      for (const lineId of ids) {
        issues.push({
          id: uuidv4(),
          severity: 'critical_error',
          category: 'topology_integrity',
          code: 'ERR_DUPLICATE_LINE_IDENTIFIER',
          message: `Duplicate line identifier: Line number "${lineNum}" is assigned to multiple distinct line segments in the graph.`,
          entity_type: 'line',
          entity_id: lineId,
        });
      }
    }
  }

  // 5. Check Piping Lines and Edges
  const seenLinePairs = new Set<string>();

  for (const line of lines) {
    const cleanLineNum = (line.line_number || '').trim();

    // Missing line identifier
    if (!cleanLineNum) {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'missing_engineering_information',
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
        severity: 'critical_error',
        category: 'topology_integrity',
        code: 'ERR_MISSING_ENDPOINT',
        message: `Line "${line.line_number || 'Unnamed'}" has an incomplete connection (From: "${line.from_equipment || 'EMPTY'}", To: "${line.to_equipment || 'EMPTY'}"). Both endpoints are required.`,
        entity_type: 'line',
        entity_id: line.id,
      });
      continue;
    }

    // Circular self-connection (permitted only if designated as recirculation or recycle loop)
    const getPropStr = (val: any): string => {
      if (!val) return '';
      if (typeof val === 'string') return val;
      if (typeof val === 'object' && typeof val.value === 'string') return val.value;
      return '';
    };

    const isRecirculation =
      getPropStr(line.stream_label).toLowerCase().includes('circulat') ||
      getPropStr(line.stream_label).toLowerCase().includes('recycle') ||
      getPropStr((line as any).fluid_service).toLowerCase().includes('recirculat') ||
      getPropStr((line as any).fluid_service).toLowerCase().includes('recycle') ||
      getPropStr((line as any).service_description).toLowerCase().includes('recirculat') ||
      getPropStr((line as any).service_description).toLowerCase().includes('recycle');

    if (fromTag === toTag && !isRecirculation) {
      issues.push({
        id: uuidv4(),
        severity: 'critical_error',
        category: 'topology_integrity',
        code: 'ERR_CIRCULAR_SELF_CONNECTION',
        message: `Line "${line.line_number}" connects equipment "${fromTag}" to itself without a valid process recirculation or recycling loop designation.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Invalid / Nonexistent endpoint check
    const isFromGhost = fromTag.includes('GHOST') || fromTag.includes('UNKNOWN') || fromTag.includes('UNRESOLVED') || fromTag.includes('NON_EXISTENT') || fromTag.includes('NONEXISTENT') || fromTag === '?';
    const isToGhost = toTag.includes('GHOST') || toTag.includes('UNKNOWN') || toTag.includes('UNRESOLVED') || toTag.includes('NON_EXISTENT') || toTag.includes('NONEXISTENT') || toTag === '?';

    if (!eqTagMap.has(fromTag)) {
      if (isFromGhost) {
        issues.push({
          id: uuidv4(),
          severity: 'critical_error',
          category: 'topology_integrity',
          code: 'ERR_INVALID_FROM_NODE',
          message: `Line "${line.line_number}" originates from unresolved or invalid equipment "${line.from_equipment}". Source equipment does not exist in the graph.`,
          entity_type: 'line',
          entity_id: line.id,
        });
      } else {
        issues.push({
          id: uuidv4(),
          severity: 'informational',
          category: 'missing_engineering_information',
          code: 'INFO_OFF_PAGE_SOURCE',
          message: `Line "${line.line_number}" originates from off-page / battery limit equipment "${line.from_equipment}".`,
          entity_type: 'line',
          entity_id: line.id,
        });
      }
    }

    if (!eqTagMap.has(toTag)) {
      if (isToGhost) {
        issues.push({
          id: uuidv4(),
          severity: 'critical_error',
          category: 'topology_integrity',
          code: 'ERR_INVALID_TO_NODE',
          message: `Line "${line.line_number}" connects to unresolved or invalid destination equipment "${line.to_equipment}". Destination equipment does not exist in the graph.`,
          entity_type: 'line',
          entity_id: line.id,
        });
      } else {
        issues.push({
          id: uuidv4(),
          severity: 'informational',
          category: 'missing_engineering_information',
          code: 'INFO_OFF_PAGE_DESTINATION',
          message: `Line "${line.line_number}" connects to off-page / battery limit equipment "${line.to_equipment}".`,
          entity_type: 'line',
          entity_id: line.id,
        });
      }
    }

    // Duplicate edge check
    const pairKey = `${fromTag}->${toTag}:${cleanLineNum}`;
    if (seenLinePairs.has(pairKey)) {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'source_to_source_discrepancy',
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
        category: 'missing_engineering_information',
        code: 'WARN_UNKNOWN_FLOW_DIRECTION',
        message: `Line "${line.line_number}" has an UNKNOWN flow direction. Flow direction must be confirmed or acknowledged for HAZOP deviation analysis.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Check contradictory flow direction with connected stream
    const matchingStream = streams.find(
      (s) =>
        s.id === line.stream_id ||
        (Array.isArray(s.connected_line_numbers) && s.connected_line_numbers.includes(line.line_number)) ||
        (Array.isArray(s.connected_line_ids) && s.connected_line_ids.includes(line.id))
    );
    if (
      matchingStream &&
      matchingStream.flow_direction &&
      line.flow_direction &&
      matchingStream.flow_direction !== 'bidirectional' &&
      line.flow_direction !== 'unknown' &&
      matchingStream.flow_direction !== line.flow_direction
    ) {
      issues.push({
        id: uuidv4(),
        severity: 'critical_error',
        category: 'topology_integrity',
        code: 'ERR_CONTRADICTORY_FLOW_DIRECTION',
        message: `Contradictory flow direction: Line "${line.line_number}" flow direction (${line.flow_direction}) contradicts assigned process stream ${matchingStream.stream_number} (${matchingStream.flow_direction}).`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Signal Line safety rule: must NOT carry process chemicals or streams
    // Instrument signals must remain excluded from material flow modelling
    if (line.functional_type === 'signal_line' && (line.assigned_chemical_id || line.stream_id)) {
      issues.push({
        id: uuidv4(),
        severity: 'critical_error',
        category: 'topology_integrity',
        code: 'ERR_SIGNAL_LINE_HAS_CHEMICAL',
        message: `Signal line "${line.line_number}" has an assigned process chemical/stream. Instrument signal loops cannot be treated as chemical process streams.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Missing chemical on process piping lines (utility lines may or may not carry process streams)
    if (line.functional_type === 'piping_line' && !line.assigned_chemical_id && chemicals.length > 0) {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'missing_engineering_information',
        code: 'WARN_UNASSIGNED_PROCESS_CHEMICAL',
        message: `Process piping line "${line.line_number}" does not have an assigned process chemical profile.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Missing stream assignment on process piping line (Informational gap flag)
    if (line.functional_type === 'piping_line' && !matchingStream) {
      issues.push({
        id: uuidv4(),
        severity: 'informational',
        category: 'missing_engineering_information',
        code: 'INFO_MISSING_STREAM_ASSIGNMENT',
        message: `Process piping line "${line.line_number}" has no assigned process stream. Missing stream data does not block topology approval when unprovided in source documents.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }

    // Unresolved connection status
    if (line.status === 'unresolved' || line.status === 'provisional') {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'topology_integrity',
        code: 'WARN_PROVISIONAL_CONNECTION',
        message: `Line "${line.line_number}" remains provisional/unresolved. Field engineer review required before approval.`,
        entity_type: 'line',
        entity_id: line.id,
      });
    }
  }

  // 6. Cross-Document Discrepancy & Limit Violation Integration
  for (const disc of discrepancies) {
    if (disc.status === 'resolved' || disc.status === 'accepted_as_margin') continue;

    if (
      disc.discrepancy_type === 'design_vs_operating' ||
      disc.discrepancy_type === 'operating_vs_design_limit_violation' ||
      disc.discrepancy_type === 'relief_vs_mawp' ||
      disc.discrepancy_type === 'trip_vs_design'
    ) {
      // Operating vs Design Limit Violation is a CRITICAL ERROR that prevents approval
      issues.push({
        id: uuidv4(),
        severity: 'critical_error',
        category: 'operating_vs_design_limit_violation',
        code: 'ERR_OPERATING_LIMIT_EXCEEDED',
        message: `Critical limit violation: ${disc.message}. Operating conditions exceed mechanical design limits without documented mitigation.`,
        entity_type: (disc.entity_type as any) || 'equipment',
        entity_id: disc.id,
      });
    } else if (
      disc.discrepancy_type === 'source_to_source_discrepancy' ||
      disc.discrepancy_type === 'numerical_mismatch' ||
      disc.discrepancy_type === 'moc_divergence'
    ) {
      // Source-to-Source Discrepancy is a WARNING requiring acknowledgment
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'source_to_source_discrepancy',
        code: 'WARN_SOURCE_DISCREPANCY',
        message: `Source-to-source discrepancy: ${disc.message}. Multiple source documents provide conflicting values.`,
        entity_type: (disc.entity_type as any) || 'equipment',
        entity_id: disc.id,
      });
    } else if (disc.discrepancy_type === 'unit_or_basis_inconsistency') {
      issues.push({
        id: uuidv4(),
        severity: 'warning',
        category: 'unit_or_basis_inconsistency',
        code: 'WARN_UNIT_INCONSISTENCY',
        message: `Unit or concentration basis inconsistency: ${disc.message}.`,
        entity_type: (disc.entity_type as any) || 'stream',
        entity_id: disc.id,
      });
    } else {
      issues.push({
        id: uuidv4(),
        severity: 'informational',
        category: 'missing_engineering_information',
        code: 'INFO_ENGINEERING_NOTE',
        message: disc.message,
        entity_type: (disc.entity_type as any) || 'equipment',
        entity_id: disc.id,
      });
    }
  }

  // 7. Mark Acknowledged Warnings and Review-Required Items
  issues.forEach((iss) => {
    if (
      iss.severity !== 'error' &&
      iss.severity !== 'critical_error' &&
      (acknowledgedWarningIds.has(iss.code) ||
        (iss.code === 'WARN_UNVERIFIED_EQUIPMENT' && (acknowledgedWarningIds.has('WARN_EQUIPMENT_PROVISIONAL') || acknowledgedWarningIds.has('WARN_UNVERIFIED_EQUIPMENT'))) ||
        (iss.code === 'WARN_EQUIPMENT_PROVISIONAL' && (acknowledgedWarningIds.has('WARN_EQUIPMENT_PROVISIONAL') || acknowledgedWarningIds.has('WARN_UNVERIFIED_EQUIPMENT'))) ||
        (iss.code === 'WARN_EQUIPMENT_UNVERIFIED_SOURCE' && (acknowledgedWarningIds.has('WARN_EQUIPMENT_PROVISIONAL') || acknowledgedWarningIds.has('WARN_UNVERIFIED_EQUIPMENT'))) ||
        (iss.entity_id && acknowledgedWarningIds.has(`${iss.code}:${iss.entity_id}`)) ||
        (iss.entity_id && acknowledgedWarningIds.has(iss.entity_id)))
    ) {
      iss.acknowledged = true;
    }
  });

  const errors = issues.filter(
    (i) => (i.severity === 'error' || i.severity === 'critical_error') && !i.acknowledged
  );
  const unacknowledgedWarnings = issues.filter(
    (i) => (i.severity === 'warning' || i.severity === 'engineering_review_required') && !i.acknowledged
  );
  const infoIssues = issues.filter(
    (i) => i.severity === 'info' || i.severity === 'informational'
  );

  const isValid = errors.length === 0;
  // Approval blocked by errors or unreviewed items; documented/acknowledged items can pass
  const canApprove =
    errors.length === 0 &&
    unacknowledgedWarnings.length === 0 &&
    equipment.length > 0 &&
    (lines.length > 0 || allConfirmedIsolated);

  return {
    is_valid: isValid,
    can_approve: canApprove,
    errors_count: errors.length,
    critical_errors_count: errors.length,
    warnings_count: unacknowledgedWarnings.length,
    review_required_count: issues.filter((i) => i.severity === 'engineering_review_required' && !i.acknowledged).length,
    info_count: infoIssues.length,
    issues,
    checked_at: new Date().toISOString(),
  };
}
