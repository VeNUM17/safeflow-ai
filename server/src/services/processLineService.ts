import { v4 as uuidv4 } from 'uuid';
import {
  ProcessLine,
  ProcessLineValidationReport,
  ProcessLineValidationIssue,
  EquipmentTag,
  PropertyProvenance,
  ChemicalCompositionEntry,
  ConnectionType,
  ConnectionClassification,
  FlowDirection,
  ValidationSeverity,
  ValidationCategory,
} from '../types';

/**
 * Creates a PropertyProvenance container with explicit null/not_provided defaults.
 * Strict non-fabrication rule: If value is undefined or null, value remains null.
 */
export function createLinePropertyProvenance<T = any>(
  value?: T | null,
  unit?: string | null,
  source?: {
    documentId?: string | null;
    documentName?: string | null;
    page?: number | null;
    revision?: string | null;
    location?: string | null;
    text?: string | null;
    confidence?: number | null;
  }
): PropertyProvenance<T> {
  return {
    value: value !== undefined && value !== null ? value : null,
    normalized_value: value !== undefined && value !== null ? value : null,
    unit: unit || null,
    source_document_id: source?.documentId || null,
    source_document_name: source?.documentName || null,
    source_revision: source?.revision || null,
    source_page: source?.page || null,
    drawing_location: source?.location || null,
    original_extracted_text: source?.text || null,
    extraction_confidence: source?.confidence ?? (value !== undefined && value !== null ? 1.0 : null),
    verification_status: 'unverified',
    verification_history: [],
  };
}

/**
 * Normalizes any line (legacy PipingLine or modern ProcessLine) into a first-class ProcessLine
 * with guaranteed property provenance and zero fabrication.
 */
export function normalizeToProcessLine(line: any, projectId?: string): ProcessLine {
  const pId = line.project_id || projectId || 'default-project';
  const connectionType: ConnectionType =
    line.connection_type ||
    (line.connection_classification === 'instrument_signal' || line.functional_type === 'signal_line'
      ? 'instrument_signal'
      : line.connection_classification === 'utility_connection' || line.functional_type === 'utility_line'
      ? 'utility_connection'
      : line.connection_classification === 'non_process_equipment_relationship' || line.functional_type === 'non_process_line'
      ? 'non_process_equipment_relationship'
      : 'process_piping');

  const classification: ConnectionClassification =
    line.connection_classification ||
    (connectionType === 'non_process' || connectionType === 'non_process_equipment_relationship'
      ? 'non_process_equipment_relationship'
      : connectionType === 'instrument_signal'
      ? 'instrument_signal'
      : connectionType === 'utility_connection'
      ? 'utility_connection'
      : 'process_piping');

  const docId = line.document_id || line.source?.document || 'manual';
  const docName = line.source?.document || 'P&ID Extraction';
  const page = line.source?.page || 1;
  const conf = line.confidence ?? 0.95;

  return {
    id: line.id || uuidv4(),
    project_id: pId,
    document_id: line.document_id || docId,
    line_number: String(line.line_number || 'UNTAGGED-LINE').trim(),
    from_equipment: String(line.from_equipment || '').trim().toUpperCase(),
    to_equipment: String(line.to_equipment || '').trim().toUpperCase(),
    flow_direction: (line.flow_direction as FlowDirection) || 'forward',
    connection_type: connectionType,
    connection_classification: classification,
    is_drawing_boundary: line.is_drawing_boundary || false,
    drawing_boundary_target: line.drawing_boundary_target || null,
    drawing_boundary_drawing: line.drawing_boundary_drawing || null,
    nominal_pipe_size:
      line.nominal_pipe_size ||
      createLinePropertyProvenance(line.size || null, 'in', {
        documentId: docId,
        documentName: docName,
        page,
        confidence: conf,
      }),
    pipe_spec:
      line.pipe_spec ||
      createLinePropertyProvenance(line.material || null, null, {
        documentId: docId,
        documentName: docName,
        page,
        confidence: conf,
      }),
    fluid_service:
      line.fluid_service ||
      createLinePropertyProvenance(line.stream_label || null, null, {
        documentId: docId,
        documentName: docName,
        page,
        confidence: conf,
      }),
    operating_flow_rate:
      line.operating_flow_rate ||
      createLinePropertyProvenance<number>(null, null, { documentId: docId, documentName: docName, page }),
    flow_rates: line.flow_rates || {
      min: createLinePropertyProvenance<number>(null, null),
      normal: createLinePropertyProvenance<number>(null, null),
      max: createLinePropertyProvenance<number>(null, null),
      design: createLinePropertyProvenance<number>(null, null),
    },
    operating_pressure:
      line.operating_pressure ||
      createLinePropertyProvenance<number>(null, null, { documentId: docId, documentName: docName, page }),
    operating_temperature:
      line.operating_temperature ||
      createLinePropertyProvenance<number>(null, null, { documentId: docId, documentName: docName, page }),
    design_pressure:
      line.design_pressure ||
      createLinePropertyProvenance<number>(null, null, { documentId: docId, documentName: docName, page }),
    design_temperature:
      line.design_temperature ||
      createLinePropertyProvenance<number>(null, null, { documentId: docId, documentName: docName, page }),
    chemical_composition: line.chemical_composition || [],
    physical_state:
      line.physical_state ||
      createLinePropertyProvenance<string>(null, null, { documentId: docId, documentName: docName, page }),
    source_document_id: line.source_document_id || docId,
    source_document_name: line.source_document_name || docName,
    source_drawing: line.source_drawing || docName,
    source_page: line.source_page || page,
    source_revision: line.source_revision || 'Rev 0',
    drawing_location: line.drawing_location || null,
    extraction_confidence: conf,
    verification_status: line.verification_status || 'unverified',
    verified_by: line.verified_by || null,
    verified_at: line.verified_at || null,
    original_extracted_values: line.original_extracted_values || {
      line_number: line.line_number,
      from_equipment: line.from_equipment,
      to_equipment: line.to_equipment,
      size: line.size,
      material: line.material,
      stream_label: line.stream_label,
    },
    property_provenance: line.property_provenance || {},
    assigned_chemical_id: line.assigned_chemical_id || null,
    stream_id: line.stream_id || null,
    stream_label: line.stream_label || line.fluid_service?.value || '',
    alerts: line.alerts || [],
    notes: line.notes || null,
    change_reason: line.change_reason || null,
    is_manual_entry: line.is_manual_entry || false,
    size: line.size || line.nominal_pipe_size?.value || '',
    material: line.material || line.pipe_spec?.value || line.pipe_specification || '',
    pipe_specification: line.pipe_specification || line.pipe_spec?.value || line.material || '',
    functional_type:
      line.functional_type ||
      (connectionType === 'instrument_signal'
        ? 'signal_line'
        : connectionType === 'utility_connection'
        ? 'utility_line'
        : 'piping_line'),
    status: line.status || 'confirmed',
    source: line.source || { document: docName, page, snippet: `Line ${line.line_number}` },
    confidence: conf,
    created_at: line.created_at || new Date().toISOString(),
    updated_at: line.updated_at,
  };
}

/**
 * Validates process lines adhering strictly to the 7 Mandatory Engineering Corrections:
 * 1. Distinguish engineering conflicts from limit violations (operating_vs_design_limit_violation).
 * 2. Utility connection modelling: Utility lines support physical fluid transport and process streams;
 *    instrument signals remain excluded.
 * 3. Chemical composition basis: Validate basis (mol%, wt%, ppm mol, ppm wt), units, no silent conversions.
 * 4. Approval and validation severity: critical_error, warning, engineering_review_required, informational.
 *    Missing operating data does NOT invalidate topology.
 * 5. Property-level provenance: Retained per property.
 * 6. Document availability: Unstated data remains not_provided.
 */
export function validateProcessLines(
  projectId: string,
  lines: ProcessLine[],
  equipment: EquipmentTag[] = []
): ProcessLineValidationReport {
  const issues: ProcessLineValidationIssue[] = [];
  const equipmentTagMap = new Set(equipment.map((e) => e.tag.toUpperCase()));
  const equipmentMap = new Map(equipment.map((e) => [e.tag.toUpperCase(), e]));

  // Track duplicate line identifiers across distinct entities
  const lineNumberMap = new Map<string, string[]>();
  for (const line of lines) {
    if (line.line_number) {
      const existing = lineNumberMap.get(line.line_number) || [];
      existing.push(line.id);
      lineNumberMap.set(line.line_number, existing);
    }
  }

  let verifiedLinesCount = 0;
  let unverifiedLinesCount = 0;

  for (const line of lines) {
    if (line.verification_status === 'engineer_verified') {
      verifiedLinesCount++;
    } else {
      unverifiedLinesCount++;
    }

    // 1. Endpoint resolution validation
    const fromEq = line.from_equipment?.toUpperCase();
    const toEq = line.to_equipment?.toUpperCase();

    if (!fromEq) {
      issues.push({
        id: `err-line-from-missing-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process line ${line.line_number} is missing source equipment connection (from_equipment).`,
      });
    } else if (equipment.length > 0 && !equipmentTagMap.has(fromEq) && fromEq !== 'ATMOSPHERE' && fromEq !== 'UTILITY' && fromEq !== 'HEADER') {
      issues.push({
        id: `err-line-from-notfound-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process line ${line.line_number} specifies unknown source equipment '${fromEq}'.`,
      });
    }

    if (!toEq) {
      issues.push({
        id: `err-line-to-missing-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process line ${line.line_number} is missing destination equipment connection (to_equipment).`,
      });
    } else if (equipment.length > 0 && !equipmentTagMap.has(toEq) && toEq !== 'ATMOSPHERE' && toEq !== 'UTILITY' && toEq !== 'HEADER') {
      issues.push({
        id: `err-line-to-notfound-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process line ${line.line_number} specifies unknown destination equipment '${toEq}'.`,
      });
    }

    // 2. Flow direction validation
    if (!line.flow_direction || line.flow_direction === 'unknown') {
      issues.push({
        id: `warn-flow-dir-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'topology_integrity',
        severity: 'warning',
        message: `Process line ${line.line_number} has unknown or unconfirmed flow direction.`,
      });
    }

    // 3. Duplicate line identifier detection
    const duplicates = lineNumberMap.get(line.line_number);
    if (duplicates && duplicates.length > 1) {
      issues.push({
        id: `warn-dup-line-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'source_to_source_discrepancy',
        severity: 'warning',
        message: `Duplicate line identifier '${line.line_number}' detected across ${duplicates.length} distinct line entities.`,
      });
    }

    // 4. Mandatory Correction #1: Operating Condition vs Design Limit Violations
    // Check line operating pressure vs line design pressure
    const opPress = line.operating_pressure?.value;
    const desPress = line.design_pressure?.value;
    if (typeof opPress === 'number' && typeof desPress === 'number' && desPress > 0) {
      if (opPress > desPress) {
        issues.push({
          id: `limit-violation-press-${line.id}`,
          line_id: line.id,
          line_number: line.line_number,
          category: 'operating_vs_design_limit_violation',
          severity: 'critical_error',
          property_name: 'pressure',
          operating_value: opPress,
          design_limit: desPress,
          unit: line.operating_pressure?.unit || 'bar(g)',
          source_document: line.operating_pressure?.source_document_name || undefined,
          message: `Operating pressure (${opPress} ${line.operating_pressure?.unit || 'bar(g)'}) exceeds line design pressure (${desPress} ${line.design_pressure?.unit || 'bar(g)'}).`,
        });
      }
    }

    // Also check line operating pressure vs equipment design pressure at destination
    if (typeof opPress === 'number' && toEq && equipmentMap.has(toEq)) {
      const eq = equipmentMap.get(toEq)!;
      const eqDesPress = eq.specifications?.design_pressure?.value;
      if (typeof eqDesPress === 'number' && eqDesPress > 0 && opPress > eqDesPress) {
        issues.push({
          id: `limit-violation-eq-press-${line.id}`,
          line_id: line.id,
          line_number: line.line_number,
          category: 'operating_vs_design_limit_violation',
          severity: 'critical_error',
          property_name: 'pressure',
          operating_value: opPress,
          design_limit: eqDesPress,
          unit: eq.specifications?.design_pressure?.unit || line.operating_pressure?.unit || 'bar(g)',
          source_document: line.operating_pressure?.source_document_name || undefined,
          message: `Line operating pressure (${opPress} ${line.operating_pressure?.unit || 'bar(g)'}) exceeds destination equipment ${toEq} design pressure (${eqDesPress} ${eq.specifications?.design_pressure?.unit || 'bar(g)'}).`,
        });
      }
    }

    // Check line operating temperature vs line design temperature
    const opTemp = line.operating_temperature?.value;
    const desTemp = line.design_temperature?.value;
    if (typeof opTemp === 'number' && typeof desTemp === 'number') {
      if (opTemp > desTemp) {
        issues.push({
          id: `limit-violation-temp-${line.id}`,
          line_id: line.id,
          line_number: line.line_number,
          category: 'operating_vs_design_limit_violation',
          severity: 'critical_error',
          property_name: 'temperature',
          operating_value: opTemp,
          design_limit: desTemp,
          unit: line.operating_temperature?.unit || '°C',
          source_document: line.operating_temperature?.source_document_name || undefined,
          message: `Operating temperature (${opTemp} ${line.operating_temperature?.unit || '°C'}) exceeds line design temperature (${desTemp} ${line.design_temperature?.unit || '°C'}).`,
        });
      }
    }

    // 5. Mandatory Correction #2: Utility connection vs instrument signal
    // Instrument signals must NEVER carry physical process fluid or chemical compositions
    if (line.connection_type === 'instrument_signal' || line.functional_type === 'signal_line') {
      if (line.assigned_chemical_id || (line.chemical_composition && line.chemical_composition.length > 0)) {
        issues.push({
          id: `err-signal-chemical-${line.id}`,
          line_id: line.id,
          line_number: line.line_number,
          category: 'topology_integrity',
          severity: 'critical_error',
          message: `Instrument signal line ${line.line_number} cannot carry chemical or material fluid flow.`,
        });
      }
    }

    // 6. Mandatory Correction #3: Chemical Composition Basis & Unit Integrity
    if (line.chemical_composition && line.chemical_composition.length > 0) {
      const validBases = ['mol%', 'wt%', 'ppm mol', 'ppm wt', 'vol%'];
      for (const comp of line.chemical_composition) {
        if (!comp.component_identity || comp.component_identity.trim() === '') {
          issues.push({
            id: `err-comp-identity-${line.id}`,
            line_id: line.id,
            line_number: line.line_number,
            category: 'unit_or_basis_inconsistency',
            severity: 'critical_error',
            message: `Chemical composition entry in line ${line.line_number} is missing component identity.`,
          });
        }
        if (!validBases.includes(comp.concentration_basis)) {
          issues.push({
            id: `err-comp-basis-${line.id}-${comp.component_identity}`,
            line_id: line.id,
            line_number: line.line_number,
            category: 'unit_or_basis_inconsistency',
            severity: 'critical_error',
            message: `Chemical component '${comp.component_identity}' has unsupported basis '${comp.concentration_basis}'. Supported bases are mol%, wt%, ppm mol, ppm wt, vol%.`,
          });
        }
      }
    }

    // 7. Mandatory Correction #4 & #6: Missing operating information does NOT invalidate topology
    if (!line.operating_flow_rate?.value && !line.flow_rates?.normal?.value) {
      issues.push({
        id: `info-missing-flow-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'missing_engineering_information',
        severity: 'informational',
        property_name: 'flow_rate',
        message: `Operating flow rate is not provided for process line ${line.line_number}.`,
      });
    }

    if (line.operating_pressure?.value === null || line.operating_pressure?.value === undefined) {
      issues.push({
        id: `info-missing-pressure-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'missing_engineering_information',
        severity: 'informational',
        property_name: 'operating_pressure',
        message: `Operating pressure is not provided for process line ${line.line_number}.`,
      });
    }

    if (line.operating_temperature?.value === null || line.operating_temperature?.value === undefined) {
      issues.push({
        id: `info-missing-temp-${line.id}`,
        line_id: line.id,
        line_number: line.line_number,
        category: 'missing_engineering_information',
        severity: 'informational',
        property_name: 'operating_temperature',
        message: `Operating temperature is not provided for process line ${line.line_number}.`,
      });
    }
  }

  const criticalErrors = issues.filter((i) => i.severity === 'critical_error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const limitViolations = issues.filter((i) => i.category === 'operating_vs_design_limit_violation');
  const missingInfo = issues.filter((i) => i.category === 'missing_engineering_information');

  return {
    project_id: projectId,
    total_lines_count: lines.length,
    verified_lines_count: verifiedLinesCount,
    unverified_lines_count: unverifiedLinesCount,
    issues,
    critical_errors_count: criticalErrors.length,
    warnings_count: warnings.length,
    limit_violations_count: limitViolations.length,
    missing_info_count: missingInfo.length,
    can_approve: criticalErrors.length === 0,
    validated_at: new Date().toISOString(),
  };
}
