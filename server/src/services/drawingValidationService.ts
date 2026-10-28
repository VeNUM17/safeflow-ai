import {
  DigitalPidDrawing,
  DrawingValidationResult,
  DrawingValidationIssue,
} from '../types';

/**
 * Validates a Digital P&ID Drawing model for topological integrity,
 * tag uniqueness, valid connection endpoints, and regulatory compliance.
 */
export function validateDigitalDrawing(
  drawing: DigitalPidDrawing,
  acknowledgedWarnings: Set<string> = new Set()
): DrawingValidationResult {
  const issues: DrawingValidationIssue[] = [];
  const elementMap = new Map<string, typeof drawing.elements[0]>();
  const tagCounts = new Map<string, number>();

  // 1. Check Elements
  for (const elem of drawing.elements) {
    elementMap.set(elem.id, elem);

    const cleanTag = (elem.tag || '').trim().toUpperCase();
    if (!cleanTag) {
      issues.push({
        id: `err-missing-tag-${elem.id}`,
        severity: 'error',
        code: 'ERR_MISSING_TAG',
        message: `Equipment or component of type "${elem.type}" has no engineering tag identifier.`,
        element_id: elem.id,
      });
    } else {
      tagCounts.set(cleanTag, (tagCounts.get(cleanTag) || 0) + 1);
    }

    if (elem.status === 'provisional' || elem.status === 'machine_extracted') {
      issues.push({
        id: `warn-provisional-${elem.id}`,
        severity: 'warning',
        code: 'WARN_PROVISIONAL_ELEMENT',
        message: `Element "${elem.tag || elem.id}" is provisional from automated extraction and requires engineer verification.`,
        element_id: elem.id,
      });
    }
  }

  // Check duplicate tags
  for (const [tag, count] of tagCounts.entries()) {
    if (count > 1) {
      const dupeElements = drawing.elements.filter(
        (e) => (e.tag || '').trim().toUpperCase() === tag
      );
      for (const d of dupeElements) {
        issues.push({
          id: `err-duplicate-tag-${d.id}`,
          severity: 'error',
          code: 'ERR_DUPLICATE_TAG',
          message: `Duplicate engineering tag "${tag}" detected on multiple drawing elements. Tags must be globally unique within the drawing.`,
          element_id: d.id,
        });
      }
    }
  }

  // 2. Check Connectors (Piping & Signals)
  const connectedElementIds = new Set<string>();

  for (const conn of drawing.connectors) {
    const fromElem = elementMap.get(conn.from_element_id);
    const toElem = elementMap.get(conn.to_element_id);

    // Endpoint integrity
    if (!fromElem) {
      issues.push({
        id: `err-dangling-source-${conn.id}`,
        severity: 'error',
        code: 'ERR_DANGLING_CONNECTOR_SOURCE',
        message: `Line "${conn.line_number || conn.id}" has invalid or missing source element.`,
        connector_id: conn.id,
      });
    } else {
      connectedElementIds.add(fromElem.id);
    }

    if (!toElem) {
      issues.push({
        id: `err-dangling-target-${conn.id}`,
        severity: 'error',
        code: 'ERR_DANGLING_CONNECTOR_TARGET',
        message: `Line "${conn.line_number || conn.id}" has invalid or missing destination element.`,
        connector_id: conn.id,
      });
    } else {
      connectedElementIds.add(toElem.id);
    }

    // Line identifier requirement for process piping
    if (conn.functional_type === 'piping_line' && (!conn.line_number || !conn.line_number.trim())) {
      issues.push({
        id: `warn-missing-line-id-${conn.id}`,
        severity: 'warning',
        code: 'WARN_MISSING_LINE_NUMBER',
        message: `Process piping connector between "${fromElem?.tag || '?'}" and "${toElem?.tag || '?'}" has no line identifier.`,
        connector_id: conn.id,
      });
    }

    // Flow direction
    if (conn.functional_type === 'piping_line' && conn.flow_direction === 'unknown') {
      issues.push({
        id: `warn-unknown-flow-${conn.id}`,
        severity: 'warning',
        code: 'WARN_UNKNOWN_FLOW_DIRECTION',
        message: `Line "${conn.line_number || 'Unnamed'}" has unknown flow direction. Verify drawing flow arrows.`,
        connector_id: conn.id,
      });
    }

    // Critical Rule: Signal line must NEVER carry chemical fluid
    if (conn.functional_type === 'signal_line' && conn.assigned_chemical_id) {
      issues.push({
        id: `err-signal-with-chemical-${conn.id}`,
        severity: 'error',
        code: 'ERR_SIGNAL_LINE_HAS_CHEMICAL',
        message: `Instrument signal loop "${conn.line_number || conn.id}" is assigned a chemical process fluid. Signal loops only transmit electrical/pneumatic signals.`,
        connector_id: conn.id,
      });
    }

    if (conn.status === 'provisional' || conn.status === 'machine_extracted') {
      issues.push({
        id: `warn-provisional-line-${conn.id}`,
        severity: 'warning',
        code: 'WARN_PROVISIONAL_LINE',
        message: `Line "${conn.line_number || conn.id}" connection is provisional and unconfirmed.`,
        connector_id: conn.id,
      });
    }
  }

  // 3. Isolated / Disconnected Equipment Check
  for (const elem of drawing.elements) {
    // Instruments, offpage connectors, and junctions can be standalone or wired
    if (
      elem.type !== 'instrument' &&
      elem.type !== 'offpage_connector' &&
      elem.type !== 'junction'
    ) {
      if (!connectedElementIds.has(elem.id)) {
        issues.push({
          id: `warn-disconnected-${elem.id}`,
          severity: 'warning',
          code: 'WARN_DISCONNECTED_EQUIPMENT',
          message: `Equipment node "${elem.tag}" has zero connected process lines. Verify if intentionally isolated or if connections were missed.`,
          element_id: elem.id,
        });
      }
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  // Warnings that are not yet acknowledged block approval
  const unacknowledgedWarnings = warnings.filter(
    (w) =>
      !acknowledgedWarnings.has(w.code) &&
      !acknowledgedWarnings.has(w.id) &&
      !(w.element_id && acknowledgedWarnings.has(w.element_id))
  );

  const canApprove = errors.length === 0 && unacknowledgedWarnings.length === 0;

  return {
    is_valid: errors.length === 0,
    can_approve: canApprove,
    errors_count: errors.length,
    warnings_count: warnings.length,
    issues,
    checked_at: new Date().toISOString(),
  };
}
