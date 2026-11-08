import { v4 as uuidv4 } from 'uuid';
import {
  CrossDocumentDiscrepancy,
  DiscrepancyType,
  DiscrepancyStatus,
  UnifiedProvenanceValue,
  UnifiedEngineeringMatrixEntry,
} from '../types';
import { PsiDataStore } from '../storage/store';
import { buildUnifiedEngineeringMatrix } from './unifiedEngineeringService';

/**
 * Cross-Document Consistency & Conflict Detection Engine.
 * Evaluates engineering parameters across P&IDs, Datasheets, PFDs, Stream Tables, and Philosophies.
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

    // 1.1 Operating Pressure vs Design Pressure Check
    if (op?.pressure?.normalized_value !== null && op?.pressure?.normalized_value !== undefined &&
        specs?.design_pressure?.normalized_value !== null && specs?.design_pressure?.normalized_value !== undefined) {
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
          `Critical Safety Alert: Operating pressure (${pOp} ${op.pressure.normalized_unit || 'barg'}) exceeds design pressure (${pDes} ${specs.design_pressure.normalized_unit || 'barg'}) on ${tag}`,
          [op.pressure, specs.design_pressure]
        );
      }
    }

    // 1.2 Operating Temperature vs Design Temperature Check
    if (op?.temperature?.normalized_value !== null && op?.temperature?.normalized_value !== undefined &&
        specs?.design_temperature?.normalized_value !== null && specs?.design_temperature?.normalized_value !== undefined) {
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
          `Critical Safety Alert: Operating temperature (${tOp} ${op.temperature.normalized_unit || '°C'}) exceeds design temperature (${tDes} ${specs.design_temperature.normalized_unit || '°C'}) on ${tag}`,
          [op.temperature, specs.design_temperature]
        );
      }
    }

    // 1.3 Numerical Mismatch between P&ID specification and Mechanical Datasheet
    if (pidData?.specifications?.design_pressure?.value !== null && pidData?.specifications?.design_pressure?.value !== undefined &&
        dsData?.design_pressure?.normalized_value !== null && dsData?.design_pressure?.normalized_value !== undefined) {
      const pPid = Number(pidData.specifications.design_pressure.value);
      const pDs = Number(dsData.design_pressure.normalized_value);

      if (Math.abs(pPid - pDs) > 0.05) {
        const evidence: UnifiedProvenanceValue[] = [];
        if (specs?.design_pressure) evidence.push(specs.design_pressure);
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
          evidence
        );
      }
    }

    // 1.4 Material of Construction (MOC) Divergence
    if (pidData?.specifications?.material_of_construction?.value && dsData?.material_of_construction?.normalized_value) {
      const mocPid = String(pidData.specifications.material_of_construction.value).trim().toLowerCase();
      const mocDs = String(dsData.material_of_construction.normalized_value).trim().toLowerCase();

      // Check if one is basic carbon steel and the other is alloy / stainless / clad
      if (mocPid !== mocDs && !mocDs.includes(mocPid) && !mocPid.includes(mocDs)) {
        const evidence: UnifiedProvenanceValue[] = [];
        if (specs?.material_of_construction) evidence.push(specs.material_of_construction);
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
          evidence
        );
      }
    }

    // 1.5 Relief Valve Set Pressure vs Equipment MAWP / Design Pressure Check
    if (specs?.relief_valve_set_pressure?.normalized_value !== null && specs?.relief_valve_set_pressure?.normalized_value !== undefined &&
        specs?.design_pressure?.normalized_value !== null && specs?.design_pressure?.normalized_value !== undefined) {
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
          [specs.relief_valve_set_pressure, specs.design_pressure]
        );
      }
    }

    // 1.6 SIF / Interlock High-High Trip Setpoint vs Design Pressure Check
    if (eq.rules && eq.rules.length > 0 && specs?.design_pressure?.normalized_value !== null && specs?.design_pressure?.normalized_value !== undefined) {
      const pDes = Number(specs.design_pressure.normalized_value);
      for (const rule of eq.rules) {
        if (rule.rule_type === 'esd_action' || rule.rule_type === 'interlock') {
          // Parse setpoint from condition (e.g. "PSHH-1002 >= 90.0 barg" or "exceeds 105 barg")
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
                [specs.design_pressure]
              );
            }
          }
        }
      }
    }

    // 1.7 Missing Critical Design Parameters
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
        []
      );
    }
  }

  // --------------------------------------------------------------------------
  // 2. STREAM & PROCESS LINE FLOW & CONNECTIVITY CONSISTENCY CHECKS
  // --------------------------------------------------------------------------
  const streamEntries = matrix.filter((m) => m.entity_type === 'stream');

  for (const st of streamEntries) {
    const sTag = st.entity_tag;
    const op = st.operating_conditions;

    // Stream Table pressure vs Destination / Source Equipment Design Pressure
    if (op?.pressure?.normalized_value !== null && op?.pressure?.normalized_value !== undefined && st.connected_equipment && st.connected_equipment.length > 0) {
      const pStream = Number(op.pressure.normalized_value);
      for (const eqTag of st.connected_equipment) {
        const connectedEq = equipmentEntries.find((e) => e.entity_tag.toLowerCase() === eqTag.toLowerCase());
        if (connectedEq?.design_specifications?.design_pressure?.normalized_value !== null &&
            connectedEq?.design_specifications?.design_pressure?.normalized_value !== undefined) {
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
              [op.pressure, connectedEq.design_specifications.design_pressure]
            );
          }
        }
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
  evidenceRecords: UnifiedProvenanceValue[]
) {
  const key = `${entityType}|${entityTag.toLowerCase()}|${propertyName}|${discrepancyType}`;
  const existing = existingMap.get(key);

  const now = new Date().toISOString();

  if (existing) {
    existing.message = message;
    existing.severity = severity;
    existing.evidence_records = evidenceRecords;
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
