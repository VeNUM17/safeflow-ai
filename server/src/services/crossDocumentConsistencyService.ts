import { v4 as uuidv4 } from 'uuid';
import {
  CrossDocumentDiscrepancy,
  DiscrepancyType,
  DiscrepancyCategory,
  DiscrepancyStatus,
  UnifiedProvenanceValue,
  UnifiedEngineeringMatrixEntry,
} from '../types';
import { PsiDataStore } from '../storage/store';
import { buildUnifiedEngineeringMatrix } from './unifiedEngineeringService';

/**
 * Maps a discrepancy type to one of the 4 mandatory validation categories
 * (Mandatory Engineering Correction #1):
 * 1. source_to_source_discrepancy
 * 2. operating_vs_design_limit_violation
 * 3. missing_engineering_information
 * 4. unit_or_basis_inconsistency
 */
export function mapToDiscrepancyCategory(type: DiscrepancyType): DiscrepancyCategory {
  if (
    type === 'design_vs_operating' ||
    type === 'relief_vs_mawp' ||
    type === 'trip_vs_design' ||
    type === 'operating_vs_design_limit_violation'
  ) {
    return 'operating_vs_design_limit_violation';
  }
  if (
    type === 'numerical_mismatch' ||
    type === 'moc_divergence' ||
    type === 'conflict' ||
    type === 'flow_imbalance' ||
    type === 'source_to_source_discrepancy'
  ) {
    return 'source_to_source_discrepancy';
  }
  if (
    type === 'unit_difference' ||
    type === 'unit_or_basis_inconsistency'
  ) {
    return 'unit_or_basis_inconsistency';
  }
  return 'missing_engineering_information';
}

export interface CrossDocumentReconciliationReport {
  project_id: string;
  total_matched_equipment: number;
  total_matched_lines: number;
  total_matched_streams: number;
  total_matched_instruments: number;
  total_discrepancies: number;
  source_to_source_count: number;
  operating_vs_design_violations_count: number;
  missing_engineering_info_count: number;
  unit_or_basis_inconsistencies_count: number;
  can_approve: boolean;
  discrepancies: CrossDocumentDiscrepancy[];
  reconciled_at: string;
}

/**
 * Cross-Document Consistency & Conflict Detection Engine.
 * Evaluates engineering parameters across all 8 document categories:
 * - P&ID (Physical topology and instrumentation)
 * - PFD (Process sequence)
 * - Stream tables (Process flow and operating conditions)
 * - Equipment datasheets (Equipment specifications)
 * - Basis of Design (Design basis and limits)
 * - Operating Philosophy (Normal operating conditions)
 * - Control Philosophy (Control loops and interlocks)
 * - Shutdown & ESD Philosophy (Shutdown logic and safeguards)
 *
 * Guarantees zero silent overwrite: all conflicting sources are retained as immutable evidence.
 */
export function detectCrossDocumentDiscrepancies(
  projectId: string,
  store: PsiDataStore
): CrossDocumentDiscrepancy[] {
  const discrepancies: CrossDocumentDiscrepancy[] = [];

  // Ensure matrix is up to date
  let matrix = store.listEngineeringMatrix(projectId);
  if (!matrix || matrix.length === 0) {
    matrix = buildUnifiedEngineeringMatrix(projectId, store);
  }

  const existingDiscrepancies = store.listDiscrepancies(projectId);
  const existingMap = new Map<string, CrossDocumentDiscrepancy>();
  for (const ed of existingDiscrepancies) {
    const key = `${ed.entity_type}|${ed.entity_tag.toLowerCase()}|${ed.property_name}|${ed.discrepancy_type}`;
    existingMap.set(key, ed);
  }

  // --------------------------------------------------------------------------
  // 1. EQUIPMENT LEVEL CONSISTENCY CHECKS
  // --------------------------------------------------------------------------
  const equipmentEntries = matrix.filter((m) => m.entity_type === 'equipment');

  for (const eq of equipmentEntries) {
    const tag = eq.entity_tag;
    const specs = eq.design_specifications;
    const op = eq.operating_conditions;
    const pidData = eq.p_and_id_data;
    const dsData = eq.datasheet_data;

    // 1.1 Operating Pressure vs Design Pressure Check (operating_vs_design_limit_violation)
    if (
      op?.pressure?.normalized_value !== null &&
      op?.pressure?.normalized_value !== undefined &&
      specs?.design_pressure?.normalized_value !== null &&
      specs?.design_pressure?.normalized_value !== undefined
    ) {
      const pOp = Number(op.pressure.normalized_value);
      const pDes = Number(specs.design_pressure.normalized_value);

      if (pOp > pDes) {
        addOrUpdateDiscrepancy(
          discrepancies,
          existingMap,
          projectId,
          'equipment',
          tag,
          'operating_pressure',
          'design_vs_operating',
          'critical',
          `Limit Violation: Operating pressure (${pOp} ${op.pressure.normalized_unit || 'barg'}) exceeds design pressure (${pDes} ${specs.design_pressure.normalized_unit || 'barg'}) on ${tag}`,
          [op.pressure, specs.design_pressure],
          'operating_vs_design_limit_violation'
        );
      }
    }

    // 1.2 Operating Temperature vs Design Temperature Check (operating_vs_design_limit_violation)
    if (
      op?.temperature?.normalized_value !== null &&
      op?.temperature?.normalized_value !== undefined &&
      specs?.design_temperature?.normalized_value !== null &&
      specs?.design_temperature?.normalized_value !== undefined
    ) {
      const tOp = Number(op.temperature.normalized_value);
      const tDes = Number(specs.design_temperature.normalized_value);

      if (tOp > tDes) {
        addOrUpdateDiscrepancy(
          discrepancies,
          existingMap,
          projectId,
          'equipment',
          tag,
          'operating_temperature',
          'design_vs_operating',
          'critical',
          `Limit Violation: Operating temperature (${tOp} ${op.temperature.normalized_unit || '°C'}) exceeds design temperature (${tDes} ${specs.design_temperature.normalized_unit || '°C'}) on ${tag}`,
          [op.temperature, specs.design_temperature],
          'operating_vs_design_limit_violation'
        );
      }
    }

    // 1.3 Numerical Mismatch between P&ID specification and Mechanical Datasheet (source_to_source_discrepancy)
    if (
      pidData?.specifications?.design_pressure?.value !== null &&
      pidData?.specifications?.design_pressure?.value !== undefined &&
      dsData?.design_pressure?.normalized_value !== null &&
      dsData?.design_pressure?.normalized_value !== undefined
    ) {
      const pPid = Number(pidData.specifications.design_pressure.value);
      const pDs = Number(dsData.design_pressure.normalized_value);

      if (Math.abs(pPid - pDs) > 0.05) {
        const evidence: UnifiedProvenanceValue[] = [];
        const pidSourceDoc: string = (pidData as any)?.document_name || (pidData as any)?.source?.document || 'P&ID Drawing';
        const pidDocId: string = (pidData as any)?.document_id || '';
        const pidPressureEvidence: UnifiedProvenanceValue = {
          id: `pid-${tag}-dp`,
          original_value: pidData.specifications.design_pressure.value,
          normalized_value: pidData.specifications.design_pressure.value,
          original_unit: pidData.specifications.design_pressure.unit || null,
          normalized_unit: pidData.specifications.design_pressure.unit || null,
          source_document_id: pidDocId,
          source_document_name: pidSourceDoc,
          source_category: 'pid',
          page_or_drawing_location: (pidData as any)?.source?.page ? `Page ${(pidData as any).source.page}` : 'Drawing Canvas',
          extraction_confidence: (pidData as any)?.confidence || 1.0,
          verification_status: pidData.specifications.design_pressure.verification_status || 'unverified',
          extraction_timestamp: new Date().toISOString(),
        };
        evidence.push(pidPressureEvidence);
        if (dsData.design_pressure) evidence.push(dsData.design_pressure);

        addOrUpdateDiscrepancy(
          discrepancies,
          existingMap,
          projectId,
          'equipment',
          tag,
          'design_pressure',
          'numerical_mismatch',
          'warning',
          `Cross-Document Divergence: Design pressure mismatch on ${tag}. P&ID specifies ${pPid} ${pidData.specifications.design_pressure.unit || 'barg'}, whereas Datasheet specifies ${pDs} ${dsData.design_pressure.normalized_unit || 'barg'}`,
          evidence,
          'source_to_source_discrepancy'
        );
      }
    }

    // 1.4 Material of Construction (MOC) Divergence (source_to_source_discrepancy)
    if (pidData?.specifications?.material_of_construction?.value && dsData?.material_of_construction?.normalized_value) {
      const mocPid = String(pidData.specifications.material_of_construction.value).trim().toLowerCase();
      const mocDs = String(dsData.material_of_construction.normalized_value).trim().toLowerCase();

      if (mocPid !== mocDs && !mocDs.includes(mocPid) && !mocPid.includes(mocDs)) {
        const evidence: UnifiedProvenanceValue[] = [];
        const pidSourceDoc: string = (pidData as any)?.document_name || (pidData as any)?.source?.document || 'P&ID Drawing';
        const pidDocId: string = (pidData as any)?.document_id || '';
        const pidMocEvidence: UnifiedProvenanceValue = {
          id: `pid-${tag}-moc`,
          original_value: pidData.specifications.material_of_construction.value,
          normalized_value: pidData.specifications.material_of_construction.value,
          original_unit: null,
          normalized_unit: null,
          source_document_id: pidDocId,
          source_document_name: pidSourceDoc,
          source_category: 'pid',
          page_or_drawing_location: (pidData as any)?.source?.page ? `Page ${(pidData as any).source.page}` : 'Drawing Canvas',
          extraction_confidence: (pidData as any)?.confidence || 1.0,
          verification_status: pidData.specifications.material_of_construction.verification_status || 'unverified',
          extraction_timestamp: new Date().toISOString(),
        };
        evidence.push(pidMocEvidence);
        if (dsData.material_of_construction) evidence.push(dsData.material_of_construction);

        addOrUpdateDiscrepancy(
          discrepancies,
          existingMap,
          projectId,
          'equipment',
          tag,
          'material_of_construction',
          'moc_divergence',
          'warning',
          `Metallurgy Divergence: Material of Construction mismatch on ${tag}. P&ID specifies "${pidData.specifications.material_of_construction.value}", while Datasheet specifies "${dsData.material_of_construction.normalized_value}"`,
          evidence,
          'source_to_source_discrepancy'
        );
      }
    }

    // 1.5 Relief Valve Set Pressure vs Equipment MAWP / Design Pressure Check (operating_vs_design_limit_violation)
    if (
      specs?.relief_valve_set_pressure?.normalized_value !== null &&
      specs?.relief_valve_set_pressure?.normalized_value !== undefined &&
      specs?.design_pressure?.normalized_value !== null &&
      specs?.design_pressure?.normalized_value !== undefined
    ) {
      const pRsv = Number(specs.relief_valve_set_pressure.normalized_value);
      const pDes = Number(specs.design_pressure.normalized_value);

      if (pRsv > pDes) {
        addOrUpdateDiscrepancy(
          discrepancies,
          existingMap,
          projectId,
          'equipment',
          tag,
          'relief_valve_set_pressure',
          'relief_vs_mawp',
          'critical',
          `Overpressure Protection Violation: Relief valve set pressure (${pRsv} barg) exceeds equipment design pressure / MAWP (${pDes} barg) on ${tag} per ASME Section VIII / API 520`,
          [specs.relief_valve_set_pressure, specs.design_pressure],
          'operating_vs_design_limit_violation'
        );
      }
    }

    // 1.6 SIF / Interlock High-High Trip Setpoint vs Design Pressure Check (operating_vs_design_limit_violation)
    if (eq.rules && eq.rules.length > 0 && specs?.design_pressure?.normalized_value !== null && specs?.design_pressure?.normalized_value !== undefined) {
      const pDes = Number(specs.design_pressure.normalized_value);
      for (const rule of eq.rules) {
        if (rule.rule_type === 'esd_action' || rule.rule_type === 'interlock') {
          const tripMatch = rule.condition.match(/(?:>=|>|exceeds|reaches)\s*(\d+(?:\.\d+)?)\s*(barg?|bar|psig?)/i);
          if (tripMatch) {
            const pTrip = parseFloat(tripMatch[1]);
            const unit = tripMatch[2].toLowerCase();
            if (unit.startsWith('bar') && pTrip > pDes) {
              addOrUpdateDiscrepancy(
                discrepancies,
                existingMap,
                projectId,
                'safeguard',
                rule.loop_tag || tag,
                'trip_setpoint',
                'trip_vs_design',
                'critical',
                `Safety Interlock Fault: Trip initiator setpoint (${pTrip} barg) in ${rule.source_document_name} is set higher than vessel design pressure (${pDes} barg) on ${tag}`,
                [specs.design_pressure],
                'operating_vs_design_limit_violation'
              );
            }
          }
        }
      }
    }

    // 1.7 Missing Critical Design Parameters (missing_engineering_information)
    if (specs && (specs.design_pressure === undefined || specs.design_pressure.normalized_value === null)) {
      addOrUpdateDiscrepancy(
        discrepancies,
        existingMap,
        projectId,
        'equipment',
        tag,
        'design_pressure',
        'missing_in_source',
        'warning',
        `Information Gap: Design pressure is not provided in any uploaded document for major unit ${tag}`,
        [],
        'missing_engineering_information'
      );
    }
  }

  // --------------------------------------------------------------------------
  // 2. STREAM FLOW & OPERATING CONDITIONS VS EQUIPMENT LIMITS
  // --------------------------------------------------------------------------
  const streamEntries = matrix.filter((m) => m.entity_type === 'stream');

  for (const st of streamEntries) {
    const sTag = st.entity_tag;
    const op = st.operating_conditions;

    // Stream Table pressure vs Destination / Source Equipment Design Pressure (operating_vs_design_limit_violation)
    if (op?.pressure?.normalized_value !== null && op?.pressure?.normalized_value !== undefined && st.connected_equipment && st.connected_equipment.length > 0) {
      const pStream = Number(op.pressure.normalized_value);
      for (const eqTag of st.connected_equipment) {
        const connectedEq = equipmentEntries.find((e) => e.entity_tag.toLowerCase() === eqTag.toLowerCase());
        if (
          connectedEq?.design_specifications?.design_pressure?.normalized_value !== null &&
          connectedEq?.design_specifications?.design_pressure?.normalized_value !== undefined
        ) {
          const pEqDes = Number(connectedEq.design_specifications.design_pressure.normalized_value);
          if (pStream > pEqDes) {
            addOrUpdateDiscrepancy(
              discrepancies,
              existingMap,
              projectId,
              'stream',
              sTag,
              'operating_pressure',
              'design_vs_operating',
              'critical',
              `Operating Overpressure: Stream ${sTag} operating pressure (${pStream} barg) exceeds connected equipment ${eqTag} design pressure (${pEqDes} barg)`,
              [op.pressure, connectedEq.design_specifications.design_pressure],
              'operating_vs_design_limit_violation'
            );
          }
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 3. PROCESS LINE RECONCILIATION ACROSS P&ID, PFD, AND STREAM TABLES
  // --------------------------------------------------------------------------
  const linesList = store.getProcessLines(projectId);
  const streamsList = store.listStreams(projectId);

  for (const line of linesList) {
    const lTag = line.line_number;
    const lowerLTag = lTag.toLowerCase();

    // 3.1 Line operating pressure vs line design pressure (operating_vs_design_limit_violation)
    const lOpPress = line.operating_pressure?.value;
    const lDesPress = line.design_pressure?.value;
    if (typeof lOpPress === 'number' && typeof lDesPress === 'number' && lDesPress > 0 && lOpPress > lDesPress) {
      const opEvidence: UnifiedProvenanceValue = {
        id: `ev-line-op-${line.id}`,
        original_value: lOpPress,
        normalized_value: lOpPress,
        original_unit: line.operating_pressure?.unit || 'barg',
        normalized_unit: line.operating_pressure?.unit || 'barg',
        source_document_id: line.document_id,
        source_document_name: line.source?.document || 'P&ID',
        source_category: 'pid',
        page_or_drawing_location: `Page ${line.source?.page || 1}`,
        extraction_confidence: line.confidence || 0.95,
        verification_status: 'unverified',
        extraction_timestamp: new Date().toISOString(),
      };
      const desEvidence: UnifiedProvenanceValue = {
        id: `ev-line-des-${line.id}`,
        original_value: lDesPress,
        normalized_value: lDesPress,
        original_unit: line.design_pressure?.unit || 'barg',
        normalized_unit: line.design_pressure?.unit || 'barg',
        source_document_id: line.document_id,
        source_document_name: line.source?.document || 'P&ID Line Spec',
        source_category: 'pid',
        page_or_drawing_location: `Page ${line.source?.page || 1}`,
        extraction_confidence: line.confidence || 0.95,
        verification_status: 'unverified',
        extraction_timestamp: new Date().toISOString(),
      };

      addOrUpdateDiscrepancy(
        discrepancies,
        existingMap,
        projectId,
        'line',
        lTag,
        'operating_pressure',
        'operating_vs_design_limit_violation',
        'critical',
        `Limit Violation: Line ${lTag} operating pressure (${lOpPress} barg) exceeds line design pressure (${lDesPress} barg)`,
        [opEvidence, desEvidence],
        'operating_vs_design_limit_violation'
      );
    }

    // 3.2 Service/Fluid Discrepancy between P&ID and Stream Table (source_to_source_discrepancy)
    const matchingStream = streamsList.find(
      (s) =>
        (s.line_number && s.line_number.toLowerCase() === lowerLTag) ||
        (s.connected_line_id && s.connected_line_id === line.id) ||
        (s.connected_line_numbers && s.connected_line_numbers.some((cln) => cln.toLowerCase() === lowerLTag))
    );

    const streamDesc = matchingStream?.material_description || matchingStream?.stream_description;
    if (matchingStream && line.stream_label && streamDesc) {
      const lblLine = line.stream_label.toLowerCase().trim();
      const lblStream = streamDesc.toLowerCase().trim();
      if (lblLine.length > 3 && lblStream.length > 3 && !lblStream.includes(lblLine) && !lblLine.includes(lblStream)) {
        const evLine: UnifiedProvenanceValue = {
          id: `ev-line-svc-${line.id}`,
          original_value: line.stream_label,
          normalized_value: line.stream_label,
          original_unit: null,
          normalized_unit: null,
          source_document_id: line.document_id,
          source_document_name: line.source?.document || 'P&ID',
          source_category: 'pid',
          page_or_drawing_location: `Page ${line.source?.page || 1}`,
          extraction_confidence: line.confidence || 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        };
        const evStream: UnifiedProvenanceValue = {
          id: `ev-stream-svc-${matchingStream.id}`,
          original_value: streamDesc,
          normalized_value: streamDesc,
          original_unit: null,
          normalized_unit: null,
          source_document_id: matchingStream.source?.document_id || '',
          source_document_name: matchingStream.source?.document || 'Stream Table',
          source_category: 'stream_table',
          page_or_drawing_location: `Page ${matchingStream.source?.page || 1}`,
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        };

        addOrUpdateDiscrepancy(
          discrepancies,
          existingMap,
          projectId,
          'line',
          lTag,
          'service_description',
          'source_to_source_discrepancy',
          'warning',
          `Source Discrepancy: Service description mismatch for line ${lTag}. P&ID specifies "${line.stream_label}", but Stream Table specifies "${streamDesc}"`,
          [evLine, evStream],
          'source_to_source_discrepancy'
        );
      }
    }
  }

  // --------------------------------------------------------------------------
  // 4. INSTRUMENT & CONTROL / SHUTDOWN PHILOSOPHY RECONCILIATION
  // --------------------------------------------------------------------------
  const allRules = store.listPhilosophyRules(projectId);
  const allEquipment = store.listEquipment(projectId);

  for (const rule of allRules) {
    if (rule.loop_tag) {
      const loopUpper = rule.loop_tag.toUpperCase().trim();
      const matchedEq = allEquipment.find(
        (e) => e.tag.toUpperCase().trim() === loopUpper
      );

      // Check if instrument tag from philosophy exists in P&ID drawings
      if (!matchedEq && allEquipment.length > 0) {
        const ruleEvidence: UnifiedProvenanceValue = {
          id: `ev-rule-inst-${rule.id}`,
          original_value: rule.loop_tag,
          normalized_value: rule.loop_tag,
          original_unit: null,
          normalized_unit: null,
          source_document_id: rule.source_document_id,
          source_document_name: rule.source_document_name,
          source_category: rule.source_category,
          page_or_drawing_location: 'Philosophy Specification',
          extraction_confidence: 0.95,
          verification_status: 'unverified',
          extraction_timestamp: new Date().toISOString(),
        };

        addOrUpdateDiscrepancy(
          discrepancies,
          existingMap,
          projectId,
          'safeguard',
          rule.loop_tag,
          'instrument_tag',
          'missing_in_source',
          'warning',
          `Cross-Document Gap: Instrument loop "${rule.loop_tag}" is specified in ${rule.source_document_name} (${rule.source_category}) but is not found in P&ID topology drawings.`,
          [ruleEvidence],
          'missing_engineering_information'
        );
      }
    }
  }

  // Persist detected discrepancies into store
  store.addDiscrepancies(discrepancies);

  return discrepancies;
}

/**
 * Resolves a discrepancy with engineer verification attribution.
 */
export function resolveEngineeringDiscrepancy(
  projectId: string,
  discrepancyId: string,
  resolution: {
    status: DiscrepancyStatus;
    resolution_notes?: string;
    resolved_by?: string;
  },
  store: PsiDataStore
): boolean {
  return store.resolveDiscrepancy(discrepancyId, resolution);
}

/**
 * Generates an aggregated Cross-Document Reconciliation Report across all 8 sources.
 */
export function generateCrossDocumentReconciliationReport(
  projectId: string,
  store: PsiDataStore
): CrossDocumentReconciliationReport {
  const discrepancies = detectCrossDocumentDiscrepancies(projectId, store);
  const matrix = store.listEngineeringMatrix(projectId);
  const equipment = matrix.filter((m) => m.entity_type === 'equipment');
  const lines = matrix.filter((m) => m.entity_type === 'line');
  const streams = matrix.filter((m) => m.entity_type === 'stream');
  const rules = store.listPhilosophyRules(projectId);

  const sourceToSourceCount = discrepancies.filter(
    (d) => d.discrepancy_category === 'source_to_source_discrepancy'
  ).length;

  const limitViolationsCount = discrepancies.filter(
    (d) => d.discrepancy_category === 'operating_vs_design_limit_violation'
  ).length;

  const missingInfoCount = discrepancies.filter(
    (d) => d.discrepancy_category === 'missing_engineering_information'
  ).length;

  const unitInconsistenciesCount = discrepancies.filter(
    (d) => d.discrepancy_category === 'unit_or_basis_inconsistency'
  ).length;

  const criticalCount = discrepancies.filter(
    (d) => d.severity === 'critical' && d.status === 'open'
  ).length;

  return {
    project_id: projectId,
    total_matched_equipment: equipment.length,
    total_matched_lines: lines.length,
    total_matched_streams: streams.length,
    total_matched_instruments: rules.filter((r) => r.loop_tag).length,
    total_discrepancies: discrepancies.length,
    source_to_source_count: sourceToSourceCount,
    operating_vs_design_violations_count: limitViolationsCount,
    missing_engineering_info_count: missingInfoCount,
    unit_or_basis_inconsistencies_count: unitInconsistenciesCount,
    can_approve: criticalCount === 0,
    discrepancies,
    reconciled_at: new Date().toISOString(),
  };
}

/**
 * Helper to add or preserve reviewed/resolved state of discrepancies.
 */
function addOrUpdateDiscrepancy(
  list: CrossDocumentDiscrepancy[],
  existingMap: Map<string, CrossDocumentDiscrepancy>,
  projectId: string,
  entityType: CrossDocumentDiscrepancy['entity_type'],
  entityTag: string,
  propertyName: string,
  discrepancyType: DiscrepancyType,
  severity: 'critical' | 'warning' | 'info',
  message: string,
  evidenceRecords: UnifiedProvenanceValue[],
  customCategory?: DiscrepancyCategory
) {
  const category = customCategory || mapToDiscrepancyCategory(discrepancyType);
  const key = `${entityType}|${entityTag.toLowerCase()}|${propertyName}|${discrepancyType}`;
  const existing = existingMap.get(key);

  const now = new Date().toISOString();

  if (existing) {
    existing.message = message;
    existing.severity = severity;
    existing.evidence_records = evidenceRecords;
    existing.discrepancy_category = category;
    existing.updated_at = now;
    list.push(existing);
  } else {
    const newDiscrepancy: CrossDocumentDiscrepancy = {
      id: uuidv4(),
      project_id: projectId,
      entity_type: entityType,
      entity_tag: entityTag,
      property_name: propertyName,
      discrepancy_type: discrepancyType,
      discrepancy_category: category,
      status: 'open',
      severity,
      message,
      evidence_records: evidenceRecords,
      created_at: now,
      updated_at: now,
    };
    list.push(newDiscrepancy);
  }
}
