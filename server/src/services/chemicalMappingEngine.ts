import { v4 as uuidv4 } from 'uuid';
import {
  ChemicalMappingResult,
  MappedChemicalItem,
  ChemicalMappingStatus,
  ChemicalIdentificationStatus,
  StreamPhase,
  ProcessStream,
  EquipmentTag,
  PipingLine,
  ChemicalAssignment,
  GasCompositionReport,
} from '../types';

export interface ChemicalMappingEvaluationInput {
  projectId: string;
  equipment: EquipmentTag[];
  lines: PipingLine[];
  streams: ProcessStream[];
  assignments: ChemicalAssignment[];
  gasReports: GasCompositionReport[];
}

/**
 * Checks if an equipment item functions as a multiphase separator,
 * such as a slug catcher, flash drum, knockout drum, or 2/3-phase separator.
 */
export function isMultiphaseSeparator(equipment: EquipmentTag): boolean {
  const desc = (equipment.description || '').toLowerCase();
  const tag = (equipment.tag || '').toUpperCase();
  const type = equipment.equipment_type;

  return (
    desc.includes('slug catcher') ||
    desc.includes('separator') ||
    desc.includes('knockout') ||
    desc.includes('flash drum') ||
    desc.includes('pig receiver') ||
    type === 'separator' ||
    tag.startsWith('PG-') ||
    tag.startsWith('V-') ||
    tag.startsWith('SEP-')
  );
}

/**
 * Evaluates chemical mapping for an equipment item or process stream.
 * Enforces phase-awareness and prevents unverified outlet concentration fabrication.
 */
export function evaluateEquipmentChemicalMapping(
  equipment: EquipmentTag,
  context: ChemicalMappingEvaluationInput
): ChemicalMappingResult {
  const eqTag = equipment.tag.toUpperCase();
  const eqId = equipment.id;

  // 1. Identify connected lines and streams
  const incomingStreams = context.streams.filter(
    (s) => s.destination_equipment_tag.toUpperCase() === eqTag
  );
  const outgoingStreams = context.streams.filter(
    (s) => s.source_equipment_tag.toUpperCase() === eqTag
  );

  // Fallback: examine piping lines if streams are empty
  const incomingLines = context.lines.filter(
    (l) => l.functional_type === 'piping_line' && l.to_equipment.toUpperCase() === eqTag
  );
  const outgoingLines = context.lines.filter(
    (l) => l.functional_type === 'piping_line' && l.from_equipment.toUpperCase() === eqTag
  );

  // 2. Look for manual assignments targeting this equipment
  const eqAssignments = context.assignments.filter(
    (a) => a.equipment_id === eqId || (a.equipment_tag && a.equipment_tag.toUpperCase() === eqTag)
  );

  // 3. Look for gas composition reports associated with incoming streams or equipment
  const incomingStreamNumbers = new Set([
    ...incomingStreams.map((s) => s.stream_number.toUpperCase()),
    ...incomingLines.map((l) => l.line_number.toUpperCase()),
  ]);

  const relatedGasReports = context.gasReports.filter(
    (r) =>
      (r.associated_stream_number && incomingStreamNumbers.has(r.associated_stream_number.toUpperCase())) ||
      r.sample_point.toUpperCase().includes(eqTag) ||
      r.sample_point.toUpperCase().includes('INLET')
  );

  const isSeparator = isMultiphaseSeparator(equipment);
  const inletChemicals: MappedChemicalItem[] = [];
  const outletChemicals: MappedChemicalItem[] = [];
  const internalChemicals: MappedChemicalItem[] = [];
  const unresolvedGaps: string[] = [];

  // Populate inlet chemicals from Gas Reports
  for (const report of relatedGasReports) {
    for (const comp of report.components) {
      inletChemicals.push({
        chemical_id: `gas-comp-${comp.component_name.toLowerCase().replace(/\s+/g, '-')}`,
        chemical_name: comp.component_name,
        cas_number: comp.cas_number || null,
        concentration: comp.normalized_mol_pct ?? comp.concentration,
        concentration_unit: comp.unit,
        phase: comp.phase,
        identification_status: 'CONFIRMED',
        source_provenance: `Gas Composition Report: ${report.report_title} (${report.sample_point})`,
        connection_tag: report.associated_stream_number || incomingLines[0]?.line_number || 'INLET',
        is_verified: true,
      });
    }
  }

  // Populate from explicit assignments
  for (const asgn of eqAssignments) {
    const item: MappedChemicalItem = {
      chemical_id: asgn.chemical_id,
      chemical_name: asgn.chemical_name,
      cas_number: asgn.cas_number || null,
      concentration: asgn.concentration !== undefined ? asgn.concentration : null,
      concentration_unit: asgn.concentration_unit || 'mol%',
      phase: asgn.phase || (isSeparator ? 'multiphase' : 'liquid'),
      identification_status: asgn.identification_status,
      source_provenance: asgn.source_document || 'Manual Engineer Assignment',
      connection_tag: asgn.connection_endpoint || 'ALL',
      is_verified: asgn.verification_status === 'verified',
    };

    if (asgn.connection_endpoint === 'inlet') {
      if (!inletChemicals.some((c) => c.chemical_name.toLowerCase() === asgn.chemical_name.toLowerCase())) {
        inletChemicals.push(item);
      }
    } else if (asgn.connection_endpoint === 'outlet') {
      if (!outletChemicals.some((c) => c.chemical_name.toLowerCase() === asgn.chemical_name.toLowerCase())) {
        outletChemicals.push(item);
      }
    } else {
      internalChemicals.push(item);
    }
  }

  // 4. Handle Phase-Aware Separation Logic
  let separationSummary: string | null = null;
  let overallPhase: StreamPhase | 'multiphase' | 'unknown' = 'unknown';

  if (isSeparator) {
    overallPhase = 'multiphase';
    separationSummary =
      `${equipment.tag} functions as a multiphase separation vessel (Slug Catcher / Pig Receiver). ` +
      `Incoming multiphase feed is separated into vapor/gas overhead and liquid bottoms.`;

    // Partition inlet components into proposed outlet streams if outlets are not already explicitly assigned
    if (inletChemicals.length > 0 && outletChemicals.length === 0) {
      // Find gas outlet lines (e.g. line numbers with N2 gas outlet or continuing to separator/compressor)
      const gasLines = outgoingLines.filter(
        (l) =>
          l.stream_label?.toLowerCase().includes('gas') ||
          l.line_number.includes('PG-00103') ||
          l.line_number.includes('PG-00104')
      );
      const liquidLines = outgoingLines.filter(
        (l) =>
          l.stream_label?.toLowerCase().includes('liquid') ||
          l.stream_label?.toLowerCase().includes('condensate') ||
          l.line_number.includes('PG-00107') ||
          l.line_number.includes('PG-00108') ||
          l.line_number.includes('DR-')
      );

      // Gas phase components -> Gas outlet
      for (const chem of inletChemicals.filter((c) => c.phase === 'gas')) {
        outletChemicals.push({
          chemical_id: chem.chemical_id,
          chemical_name: chem.chemical_name,
          cas_number: chem.cas_number,
          concentration: null, // CRITICAL: NEVER FABRICATE NUMERICAL CONCENTRATIONS!
          concentration_unit: chem.concentration_unit,
          phase: 'gas',
          identification_status: 'CANDIDATE',
          source_provenance: `Proposed phase separation from ${equipment.tag} inlet. Flash simulation required for verified concentration.`,
          connection_tag: gasLines[0]?.line_number || 'GAS OUTLET (N2)',
          is_verified: false,
        });
      }

      // Liquid phase components -> Liquid outlet
      for (const chem of inletChemicals.filter((c) => c.phase === 'liquid' || c.chemical_name.toLowerCase().includes('condensate') || c.chemical_name.toLowerCase().includes('water'))) {
        outletChemicals.push({
          chemical_id: chem.chemical_id,
          chemical_name: chem.chemical_name,
          cas_number: chem.cas_number,
          concentration: null, // CRITICAL: NEVER FABRICATE NUMERICAL CONCENTRATIONS!
          concentration_unit: chem.concentration_unit,
          phase: 'liquid',
          identification_status: 'CANDIDATE',
          source_provenance: `Proposed liquid phase accumulation from ${equipment.tag} bottoms. Stream table required for verified composition.`,
          connection_tag: liquidLines[0]?.line_number || 'LIQUID OUTLET (N3)',
          is_verified: false,
        });
      }

      unresolvedGaps.push(
        'Multiphase separation detected: Outlet stream compositions are proposed based on phase partitioning. Rigorous flash calculation or stream table is required to verify numerical outlet concentrations.'
      );
    }
  } else {
    // Single phase vessel or inline item
    if (inletChemicals.length > 0) {
      overallPhase = inletChemicals[0].phase || 'liquid';
      if (outletChemicals.length === 0) {
        // Carry forward with unverified candidate status
        for (const chem of inletChemicals) {
          outletChemicals.push({
            ...chem,
            source_provenance: `Carried forward from ${equipment.tag} inlet.`,
            is_verified: false,
            identification_status: 'CANDIDATE',
          });
        }
      }
    }
  }

  // 5. Determine Overall Mapping Status
  let mappingStatus: ChemicalMappingStatus = 'INCOMPLETE MAPPING';

  const hasAnyChemicals = inletChemicals.length > 0 || outletChemicals.length > 0 || internalChemicals.length > 0;
  if (!hasAnyChemicals) {
    mappingStatus = 'INCOMPLETE MAPPING';
    unresolvedGaps.push(`No chemical identity or composition assigned or extracted for ${equipment.tag}.`);
  } else {
    const allVerified =
      (inletChemicals.length > 0 ? inletChemicals.every((c) => c.is_verified) : true) &&
      (outletChemicals.length > 0 ? outletChemicals.every((c) => c.is_verified && c.concentration !== null) : false);

    if (allVerified && unresolvedGaps.length === 0) {
      mappingStatus = 'VERIFIED MAPPING';
    } else {
      mappingStatus = 'PROPOSED MAPPING';
    }
  }

  return {
    id: uuidv4(),
    project_id: context.projectId,
    target_type: 'equipment',
    target_id: eqId,
    target_tag: eqTag,
    mapping_status: mappingStatus,
    phase: overallPhase,
    inlet_chemicals: inletChemicals,
    outlet_chemicals: outletChemicals,
    internal_chemicals: internalChemicals,
    separation_summary: separationSummary,
    unresolved_gaps: unresolvedGaps,
    source_provenance: relatedGasReports.length > 0
      ? `Gas Report (${relatedGasReports[0].report_title}) & P&ID Topology`
      : eqAssignments.length > 0
      ? 'Manual Chemical Assignment & P&ID Topology'
      : 'P&ID Topology (Unassigned)',
    is_multiphase_separation: isSeparator,
    last_evaluated_at: new Date().toISOString(),
  };
}

/**
 * Evaluates chemical mapping for an entire project.
 */
export function evaluateProjectChemicalMappings(
  context: ChemicalMappingEvaluationInput
): ChemicalMappingResult[] {
  const results: ChemicalMappingResult[] = [];
  for (const eq of context.equipment) {
    // Only map major equipment items
    if (
      [
        'vessel',
        'tank',
        'separator',
        'column',
        'reactor',
        'heat_exchanger',
        'filter',
      ].includes(eq.equipment_type) ||
      isMultiphaseSeparator(eq)
    ) {
      results.push(evaluateEquipmentChemicalMapping(eq, context));
    }
  }
  return results;
}
