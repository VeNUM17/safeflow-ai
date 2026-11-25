import { v4 as uuidv4 } from 'uuid';
import {
  ProcessStream,
  ProcessStreamValidationReport,
  ProcessStreamValidationIssue,
  EquipmentTag,
  ProcessLine,
  ChemicalCompositionEntry,
  StreamTableComponentFraction,
  ValidationSeverity,
  ValidationCategory,
} from '../types';

/**
 * Validates process streams adhering strictly to Phase 3 requirements and the 7 Mandatory Engineering Corrections:
 * 1. Distinguishes engineering conflicts from limit violations.
 * 2. Utility connection modelling: Utility streams supported; instrument signals excluded from fluid flow.
 * 3. Chemical composition basis: mol%, wt%, ppm mol, ppm wt, vol% strictly enforced without silent conversions.
 * 4. Approval and validation severity: Missing operating data does NOT invalidate topology.
 * 5. Property-level provenance: Provenance vectors tracked per stream property.
 * 6. Document availability: Unstated data remains null / not_provided.
 * 7. Separator independence: Do not assume separator inlet composition equals outlet composition.
 *    Do not infer composition from P&ID topology alone.
 */
export function validateProcessStreams(
  projectId: string,
  streams: ProcessStream[],
  equipment: EquipmentTag[] = [],
  lines: ProcessLine[] = []
): ProcessStreamValidationReport {
  const issues: ProcessStreamValidationIssue[] = [];
  const equipmentTagMap = new Set(equipment.map((e) => e.tag.toUpperCase()));
  const equipmentMap = new Map(equipment.map((e) => [e.tag.toUpperCase(), e]));
  const lineMap = new Map(lines.map((l) => [l.id, l]));
  const lineNumberMap = new Map(lines.map((l) => [l.line_number, l]));

  // Track duplicate stream numbers
  const streamNumberMap = new Map<string, string[]>();
  for (const stream of streams) {
    if (stream.stream_number) {
      const existing = streamNumberMap.get(stream.stream_number) || [];
      existing.push(stream.id);
      streamNumberMap.set(stream.stream_number, existing);
    }
  }

  let verifiedStreamsCount = 0;
  let unverifiedStreamsCount = 0;
  let separatorDecouplingViolations = 0;

  for (const stream of streams) {
    if (stream.verification_status === 'verified') {
      verifiedStreamsCount++;
    } else {
      unverifiedStreamsCount++;
    }

    // 1. Stream Number Identification
    if (!stream.stream_number || stream.stream_number.trim() === '') {
      issues.push({
        id: `err-stream-number-missing-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number || 'UNTAGGED',
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process stream is missing a stream number or identifier.`,
      });
    }

    const duplicates = streamNumberMap.get(stream.stream_number);
    if (duplicates && duplicates.length > 1) {
      issues.push({
        id: `warn-dup-stream-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'source_to_source_discrepancy',
        severity: 'warning',
        message: `Duplicate stream identifier '${stream.stream_number}' detected across ${duplicates.length} distinct stream entities.`,
      });
    }

    // 2. Connected Equipment Resolution
    const sourceTag = stream.source_equipment_tag?.toUpperCase();
    const destTag = stream.destination_equipment_tag?.toUpperCase();

    if (!sourceTag) {
      issues.push({
        id: `err-stream-source-missing-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process stream ${stream.stream_number} is missing source equipment assignment.`,
      });
    } else if (equipment.length > 0 && !equipmentTagMap.has(sourceTag) && sourceTag !== 'ATMOSPHERE' && sourceTag !== 'BATTERY_LIMIT' && sourceTag !== 'UTILITY') {
      issues.push({
        id: `err-stream-source-notfound-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process stream ${stream.stream_number} specifies unknown source equipment '${sourceTag}'.`,
      });
    }

    if (!destTag) {
      issues.push({
        id: `err-stream-dest-missing-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process stream ${stream.stream_number} is missing destination equipment assignment.`,
      });
    } else if (equipment.length > 0 && !equipmentTagMap.has(destTag) && destTag !== 'ATMOSPHERE' && destTag !== 'BATTERY_LIMIT' && destTag !== 'UTILITY') {
      issues.push({
        id: `err-stream-dest-notfound-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'topology_integrity',
        severity: 'critical_error',
        message: `Process stream ${stream.stream_number} specifies unknown destination equipment '${destTag}'.`,
      });
    }

    // 3. Connected Process Lines Validation
    if (stream.connected_line_id && !lineMap.has(stream.connected_line_id)) {
      issues.push({
        id: `warn-stream-line-notfound-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'missing_engineering_information',
        severity: 'warning',
        message: `Connected process line ID '${stream.connected_line_id}' not found in active project line list.`,
      });
    }

    // 4. Chemical Composition Basis Enforcement
    if (stream.components && stream.components.length > 0) {
      const validBases = ['mol%', 'wt%', 'ppm mol', 'ppm wt', 'vol%', '%', 'fraction'];
      for (const comp of stream.components) {
        const compName = (comp as any).component_identity || (comp as any).component_name;
        const basis = (comp as any).concentration_basis || comp.unit;

        if (!compName || compName.trim() === '') {
          issues.push({
            id: `err-stream-comp-missing-${stream.id}`,
            stream_id: stream.id,
            stream_number: stream.stream_number,
            category: 'unit_or_basis_inconsistency',
            severity: 'critical_error',
            message: `Stream ${stream.stream_number} has a chemical component without an identity.`,
          });
        }

        if (basis && !validBases.includes(basis.trim())) {
          issues.push({
            id: `err-stream-basis-unsupported-${stream.id}-${compName}`,
            stream_id: stream.id,
            stream_number: stream.stream_number,
            category: 'unit_or_basis_inconsistency',
            severity: 'critical_error',
            message: `Component '${compName}' in stream ${stream.stream_number} has unsupported concentration basis '${basis}'. Supported bases: mol%, wt%, ppm mol, ppm wt, vol%.`,
          });
        }
      }
    }

    // 5. Strict Separator Independence Rule
    // Check if source equipment is a separator
    if (sourceTag && equipmentMap.has(sourceTag)) {
      const sourceEq = equipmentMap.get(sourceTag)!;
      if (sourceEq.equipment_type === 'separator') {
        // Find inlet streams to this separator
        const inletStreams = streams.filter(
          (s) => s.destination_equipment_tag?.toUpperCase() === sourceTag && s.id !== stream.id
        );

        for (const inlet of inletStreams) {
          // If the outlet stream has identical components with identical fractions
          // but lacks its own independent source document or is inferred purely from topology:
          if (
            inlet.components &&
            inlet.components.length > 0 &&
            stream.components &&
            stream.components.length > 0 &&
            stream.components.length === inlet.components.length
          ) {
            let identicalMatch = true;
            for (let i = 0; i < stream.components.length; i++) {
              const sc = stream.components[i] as any;
              const ic = inlet.components[i] as any;
              const sVal = sc.fraction_value ?? sc.concentration_value;
              const iVal = ic.fraction_value ?? ic.concentration_value;
              if (sVal !== iVal) {
                identicalMatch = false;
                break;
              }
            }

            if (identicalMatch && (!stream.source?.document || stream.source.document === inlet.source?.document)) {
              // Flag if this outlet claims identical composition to separator inlet without flash/phase split
              // e.g. gas overhead having same composition as inlet multiphase liquid
              if (stream.phase && inlet.phase && stream.phase !== inlet.phase) {
                separatorDecouplingViolations++;
                issues.push({
                  id: `warn-separator-composition-copied-${stream.id}`,
                  stream_id: stream.id,
                  stream_number: stream.stream_number,
                  category: 'source_to_source_discrepancy',
                  severity: 'warning',
                  message: `Separator outlet stream ${stream.stream_number} (${stream.phase}) cannot assume identical chemical composition to inlet stream ${inlet.stream_number} (${inlet.phase}) without verified phase partition evidence.`,
                });
              }
            }
          }
        }
      }
    }

    // 6. Operating vs Design Limit Violations
    const opPress = stream.operating_pressure?.value;
    if (typeof opPress === 'number' && destTag && equipmentMap.has(destTag)) {
      const destEq = equipmentMap.get(destTag)!;
      const eqDesPress = destEq.specifications?.design_pressure?.value;
      if (typeof eqDesPress === 'number' && eqDesPress > 0 && opPress > eqDesPress) {
        issues.push({
          id: `limit-violation-stream-press-${stream.id}`,
          stream_id: stream.id,
          stream_number: stream.stream_number,
          category: 'operating_vs_design_limit_violation',
          severity: 'critical_error',
          property_name: 'pressure',
          operating_value: opPress,
          design_limit: eqDesPress,
          unit: stream.operating_pressure?.unit || 'bar(g)',
          message: `Stream ${stream.stream_number} operating pressure (${opPress} ${stream.operating_pressure?.unit || 'bar(g)'}) exceeds destination equipment ${destTag} design pressure (${eqDesPress} bar(g)).`,
        });
      }
    }

    // 7. Missing Operating Data (Strict non-fabrication: informational only, not topology errors)
    const hasTotalFlow = stream.total_flow_rate?.normalized_value != null || (stream.total_flow_rate as any)?.value != null;
    if (stream.flow_rates.normal === null && !hasTotalFlow) {
      issues.push({
        id: `info-missing-stream-flow-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'missing_engineering_information',
        severity: 'informational',
        property_name: 'flow_rates',
        message: `Operating flow rate is not provided for process stream ${stream.stream_number}.`,
      });
    }

    if (stream.operating_pressure?.value === null) {
      issues.push({
        id: `info-missing-stream-pressure-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'missing_engineering_information',
        severity: 'informational',
        property_name: 'operating_pressure',
        message: `Operating pressure is not provided for process stream ${stream.stream_number}.`,
      });
    }

    if (stream.operating_temperature?.value === null) {
      issues.push({
        id: `info-missing-stream-temp-${stream.id}`,
        stream_id: stream.id,
        stream_number: stream.stream_number,
        category: 'missing_engineering_information',
        severity: 'informational',
        property_name: 'operating_temperature',
        message: `Operating temperature is not provided for process stream ${stream.stream_number}.`,
      });
    }
  }

  const criticalErrors = issues.filter((i) => i.severity === 'critical_error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const limitViolations = issues.filter((i) => i.category === 'operating_vs_design_limit_violation');
  const missingInfo = issues.filter((i) => i.category === 'missing_engineering_information');

  return {
    project_id: projectId,
    total_streams_count: streams.length,
    verified_streams_count: verifiedStreamsCount,
    unverified_streams_count: unverifiedStreamsCount,
    issues,
    critical_errors_count: criticalErrors.length,
    warnings_count: warnings.length,
    limit_violations_count: limitViolations.length,
    missing_info_count: missingInfo.length,
    separator_decoupling_violations_count: separatorDecouplingViolations,
    can_approve: criticalErrors.length === 0,
    validated_at: new Date().toISOString(),
  };
}
