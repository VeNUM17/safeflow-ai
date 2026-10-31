import { v4 as uuidv4 } from 'uuid';
import {
  ConnectionCandidate,
  ProcessDescriptionExtraction,
  ConnectionReconciliationStatus,
  DrawingEvidence,
} from '../types';

export interface ReconciliationResult {
  reconciledCandidates: ConnectionCandidate[];
  summary: {
    total_candidates: number;
    visually_supported_count: number;
    description_supported_count: number;
    corroborated_count: number;
    conflicting_count: number;
    unresolved_count: number;
    engineer_verified_count: number;
  };
  conflicts: {
    candidateId: string;
    description: string;
    visualConnection: string;
    descriptionConnection: string;
  }[];
}

/**
 * Hybrid Connection Reconciliation Engine.
 * Cross-references visual P&ID connectivity with natural language process descriptions.
 * Applies the 6-way classification matrix and enforces non-silent override rules.
 */
export function reconcileConnections(
  visualCandidates: ConnectionCandidate[],
  descriptionExtraction?: ProcessDescriptionExtraction | null
): ReconciliationResult {
  const result: ConnectionCandidate[] = [];
  const conflicts: ReconciliationResult['conflicts'] = [];

  const matchedDescRelIds = new Set<string>();

  // Map description relationships by source -> destination
  const descRelMap = new Map<string, ProcessDescriptionExtraction['relationships'][0]>();
  if (descriptionExtraction && descriptionExtraction.relationships) {
    for (const rel of descriptionExtraction.relationships) {
      const key = `${rel.source_tag.toUpperCase()}->${rel.destination_tag.toUpperCase()}`;
      descRelMap.set(key, rel);

      // Also map reverse key to detect flow reversal conflicts
      const revKey = `${rel.destination_tag.toUpperCase()}->${rel.source_tag.toUpperCase()}`;
      if (!descRelMap.has(revKey)) {
        // store marker
      }
    }
  }

  // 1. Process all visual candidates
  for (const vis of visualCandidates) {
    const src = vis.source_equipment.toUpperCase();
    const dest = vis.destination_equipment.toUpperCase();
    const key = `${src}->${dest}`;
    const reverseKey = `${dest}->${src}`;

    const descRel = descRelMap.get(key);
    const reverseDescRel = descRelMap.get(reverseKey);

    let status: ConnectionReconciliationStatus = 'visually_supported';
    const textEvidence: string[] = [];
    let conflictDetails: string | null = null;

    if (vis.verification_status === 'verified') {
      status = 'engineer_verified';
    } else if (descRel) {
      // CORROBORATED: Both drawing and description explicitly confirm connection!
      status = 'corroborated';
      matchedDescRelIds.add(descRel.id);
      textEvidence.push(`Process narrative confirmed: "${descRel.supporting_sentence}"`);

      // Enrich with flow rates from description if visual stream lacked them
      if (!vis.flow_rates?.normal && descRel.flow_rates?.normal) {
        vis.flow_rates = {
          normal: descRel.flow_rates.normal,
          min: null,
          max: null,
          design: null,
          actual: null,
          unit: descRel.flow_rates.unit || 'm3/h',
          basis: descRel.flow_rates.basis || 'volumetric',
        };
      }
    } else if (reverseDescRel) {
      // CONFLICTING: Drawing indicates A -> B, but process description states B -> A!
      status = 'conflicting';
      matchedDescRelIds.add(reverseDescRel.id);
      conflictDetails = `Drawing indicates flow from ${src} to ${dest}, but process narrative states opposite flow (${dest} to ${src}): "${reverseDescRel.supporting_sentence}"`;
      textEvidence.push(conflictDetails);
      conflicts.push({
        candidateId: vis.id,
        description: conflictDetails,
        visualConnection: `${src} -> ${dest}`,
        descriptionConnection: `${dest} -> ${src}`,
      });
    } else {
      // VISUALLY SUPPORTED: Detected from drawing, not mentioned in text description
      status = 'visually_supported';
    }

    result.push({
      ...vis,
      recognition_status: status,
      text_evidence: textEvidence,
      conflict_details: conflictDetails,
    });
  }

  // 2. Process Description Relationships not found in drawing
  if (descriptionExtraction && descriptionExtraction.relationships) {
    for (const rel of descriptionExtraction.relationships) {
      if (matchedDescRelIds.has(rel.id)) continue;

      // RULE: Never silently create a physical connection based ONLY on description!
      // Create a description_supported candidate flagged for review and engineering verification.
      const candId = `cand-desc-${uuidv4().substring(0, 8)}`;
      result.push({
        id: candId,
        source_equipment: rel.source_tag,
        source_port: null,
        destination_equipment: rel.destination_tag,
        destination_port: null,
        associated_pipe_paths: [],
        line_number: null,
        functional_type: 'piping_line',
        flow_direction: 'forward',
        flow_rates: rel.flow_rates
          ? {
              normal: rel.flow_rates.normal || null,
              min: null,
              max: null,
              design: null,
              actual: null,
              unit: rel.flow_rates.unit || 'm3/h',
              basis: rel.flow_rates.basis || 'volumetric',
            }
          : undefined,
        connection_evidence: [],
        text_evidence: [`Stated in process narrative: "${rel.supporting_sentence}". Physical piping not yet traced in drawing.`],
        confidence: 0.65,
        recognition_status: 'description_supported',
        verification_status: 'unverified',
        is_manually_corrected: false,
      });
    }
  }

  // Calculate summary counts
  const summary = {
    total_candidates: result.length,
    visually_supported_count: result.filter((c) => c.recognition_status === 'visually_supported').length,
    description_supported_count: result.filter((c) => c.recognition_status === 'description_supported').length,
    corroborated_count: result.filter((c) => c.recognition_status === 'corroborated').length,
    conflicting_count: result.filter((c) => c.recognition_status === 'conflicting').length,
    unresolved_count: result.filter((c) => c.recognition_status === 'unresolved').length,
    engineer_verified_count: result.filter((c) => c.recognition_status === 'engineer_verified' || c.verification_status === 'verified').length,
  };

  return {
    reconciledCandidates: result,
    summary,
    conflicts,
  };
}
