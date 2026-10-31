import { ConnectionCandidate, CommonDrawingModel, ValidationIssue } from '../types';

export interface TopologyCandidateValidationResult {
  is_valid: boolean;
  errors_count: number;
  warnings_count: number;
  approved_candidates: ConnectionCandidate[];
  unresolved_candidates: ConnectionCandidate[];
  conflicting_candidates: ConnectionCandidate[];
  issues: ValidationIssue[];
}

/**
 * Validates candidate connections before authoritative process graph synchronization.
 * Enforces negative rules:
 * - Uncorroborated / unverified description-only connections do not enter authoritative graph.
 * - Crossing lines without junction dots remain unconnected.
 * - Missing or guessed endpoints remain unresolved.
 */
export function validateCandidateTopology(
  drawingModel: CommonDrawingModel,
  allowProvisional = false
): TopologyCandidateValidationResult {
  const issues: ValidationIssue[] = [];
  const approved_candidates: ConnectionCandidate[] = [];
  const unresolved_candidates: ConnectionCandidate[] = [];
  const conflicting_candidates: ConnectionCandidate[] = [];

  for (const cand of drawingModel.connection_candidates) {
    // 1. Check for Conflicting Status
    if (cand.recognition_status === 'conflicting') {
      conflicting_candidates.push(cand);
      issues.push({
        id: `err-conflict-${cand.id}`,
        severity: 'error',
        code: 'ERR_CONNECTION_CONFLICT',
        message: cand.conflict_details || `Drawing connectivity conflicts with process narrative for ${cand.source_equipment} -> ${cand.destination_equipment}.`,
        entity_type: 'line',
        entity_id: cand.id,
      });
      continue;
    }

    // 2. Check for Description-Supported Only (No physical pipe traced!)
    if (cand.recognition_status === 'description_supported' && cand.verification_status !== 'verified') {
      unresolved_candidates.push(cand);
      issues.push({
        id: `warn-desc-only-${cand.id}`,
        severity: 'warning',
        code: 'WARN_DESCRIPTION_ONLY_CONNECTION',
        message: `Connection from ${cand.source_equipment} to ${cand.destination_equipment} is stated in process description but has NO traced physical pipe in the drawing. Engineering verification required before adding to topology.`,
        entity_type: 'line',
        entity_id: cand.id,
      });
      continue;
    }

    // 3. Check for Unresolved / Dangling Endpoints
    if (
      !cand.source_equipment ||
      !cand.destination_equipment ||
      cand.source_equipment === 'UNKNOWN' ||
      cand.destination_equipment === 'UNKNOWN'
    ) {
      unresolved_candidates.push(cand);
      issues.push({
        id: `err-dangling-${cand.id}`,
        severity: 'error',
        code: 'ERR_DANGLING_PIPE',
        message: `Piping connection has unresolved source or destination endpoints. Must be physically attached or manually corrected.`,
        entity_type: 'line',
        entity_id: cand.id,
      });
      continue;
    }

    // 4. Approved / Confirmed Candidates
    if (
      cand.verification_status === 'verified' ||
      cand.recognition_status === 'corroborated' ||
      (allowProvisional && cand.recognition_status === 'visually_supported')
    ) {
      approved_candidates.push(cand);
    } else {
      unresolved_candidates.push(cand);
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return {
    is_valid: errors.length === 0,
    errors_count: errors.length,
    warnings_count: warnings.length,
    approved_candidates,
    unresolved_candidates,
    conflicting_candidates,
    issues,
  };
}
