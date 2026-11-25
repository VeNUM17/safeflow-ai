import { v4 as uuidv4 } from 'uuid';
import {
  EquipmentTag,
  DocumentRecord,
  PipingLine,
  ValidationIssue,
  IsolatedReviewStatus,
  PropertyProvenance,
} from '../types';

export interface EquipmentValidationReport {
  is_valid: boolean;
  can_approve: boolean;
  total_equipment: number;
  confirmed_equipment: number;
  provisional_equipment: number;
  isolated_equipment: number;
  reviewed_isolated: number;
  unresolved_isolated: number;
  duplicate_tags_count: number;
  conflicting_tags_count: number;
  issues: ValidationIssue[];
  equipment_evaluations: Record<string, EquipmentEvaluationSummary>;
}

export interface EquipmentEvaluationSummary {
  equipment_id: string;
  tag: string;
  type: string;
  description: string;
  is_isolated: boolean;
  isolated_review_status?: IsolatedReviewStatus | null;
  verification_status: 'unverified' | 'engineer_verified';
  has_drawing_provenance: boolean;
  drawing_reference?: string | null;
  drawing_page?: number | null;
  drawing_revision?: string | null;
  extraction_confidence: number;
  original_extracted_values?: {
    tag?: string;
    equipment_type?: string;
    description?: string;
    confidence?: number;
    extracted_at?: string;
  };
  has_duplicates: boolean;
  has_conflicts: boolean;
  issues: ValidationIssue[];
}

/**
 * Validates equipment tags and isolated nodes across uploaded P&ID/PFD documents.
 * 
 * Enforces Phase 1 requirements:
 * 1. Validate tag against uploaded P&ID/PFD documents and maintain drawing/page/revision provenance.
 * 2. Identify equipment type and description with taxonomy validation.
 * 3. Preserve extraction confidence and human verification status.
 * 4. Detect duplicate and conflicting equipment tags across sources without silent overwrites.
 * 5. Allow manual corrections while strictly preserving original extracted values.
 * 6. Provide 5-tier isolated equipment review classifications without ever deleting isolated equipment:
 *    - confirmed_isolated (does not block approval when documented)
 *    - missing_connection_suspected
 *    - connection_exists_on_another_drawing
 *    - incorrect_equipment_identification
 *    - awaiting_review
 * 7. Assign proper severity: critical_error, warning, engineering_review_required, informational.
 */
export function validateEquipmentNodes(
  equipment: EquipmentTag[],
  lines: PipingLine[] = [],
  documents: DocumentRecord[] = [],
  acknowledgedIssueIds: Set<string> = new Set()
): EquipmentValidationReport {
  const issues: ValidationIssue[] = [];
  const evaluations: Record<string, EquipmentEvaluationSummary> = {};

  // Build connection map to identify isolated nodes
  const connectedEquipmentTags = new Set<string>();
  for (const line of lines) {
    if (line.from_equipment) {
      connectedEquipmentTags.add(line.from_equipment.trim().toUpperCase());
    }
    if (line.to_equipment) {
      connectedEquipmentTags.add(line.to_equipment.trim().toUpperCase());
    }
  }

  // Build document index for provenance cross-check
  const docMap = new Map<string, DocumentRecord>();
  const docNameMap = new Map<string, DocumentRecord>();
  for (const doc of documents) {
    docMap.set(doc.id, doc);
    const fname = (doc.name || doc.original_filename || '').toLowerCase();
    if (fname) docNameMap.set(fname, doc);
  }

  // Tag tracking for duplicates
  const tagFrequency = new Map<string, EquipmentTag[]>();
  for (const eq of equipment) {
    const cleanTag = (eq.tag || '').trim().toUpperCase();
    if (cleanTag) {
      const list = tagFrequency.get(cleanTag) || [];
      list.push(eq);
      tagFrequency.set(cleanTag, list);
    }
  }

  let totalIsolated = 0;
  let reviewedIsolated = 0;
  let unresolvedIsolated = 0;
  let duplicateCount = 0;
  let conflictingCount = 0;

  for (const eq of equipment) {
    const cleanTag = (eq.tag || '').trim().toUpperCase();
    const itemIssues: ValidationIssue[] = [];

    // Check if isolated
    const isInstrument = eq.equipment_type === 'instrument';
    const isIsolated = !isInstrument && cleanTag !== '' && !connectedEquipmentTags.has(cleanTag);
    if (isIsolated) {
      totalIsolated++;
    }

    // 1. Tag Identifier Checks
    if (!cleanTag) {
      const issue: ValidationIssue = {
        id: uuidv4(),
        severity: 'critical_error',
        category: 'topology_integrity',
        code: 'ERR_EMPTY_TAG',
        message: `Equipment node (ID: ${eq.id.substring(0, 8)}) has an empty or missing tag identifier.`,
        entity_type: 'equipment',
        entity_id: eq.id,
      };
      issues.push(issue);
      itemIssues.push(issue);
    }

    // 2. Duplicate Tag Check
    const duplicates = tagFrequency.get(cleanTag) || [];
    const hasDuplicates = duplicates.length > 1;
    if (hasDuplicates) {
      duplicateCount++;
      eq.duplicate_detected = true;
      eq.duplicate_tag_ids = duplicates.map((d) => d.id).filter((id) => id !== eq.id);

      const issue: ValidationIssue = {
        id: uuidv4(),
        severity: 'critical_error',
        category: 'source_to_source_discrepancy',
        code: 'ERR_DUPLICATE_TAG',
        message: `Duplicate equipment tag detected: "${cleanTag}". Tag appears on ${duplicates.length} equipment entities in project. Unique equipment identification is required.`,
        entity_type: 'equipment',
        entity_id: eq.id,
      };
      issues.push(issue);
      itemIssues.push(issue);
    }

    // 3. Document Provenance Check
    let hasDrawingProvenance = false;
    let drawingRef: string | null = eq.source_drawing || eq.drawing_id || eq.source?.document || null;
    let drawingPage: number | null = eq.source_page || eq.source?.page || null;
    let drawingRevision: string | null = eq.source_revision || eq.drawing_revision || null;

    if (eq.document_id && docMap.has(eq.document_id)) {
      const doc = docMap.get(eq.document_id)!;
      hasDrawingProvenance = true;
      if (!drawingRef) drawingRef = doc.name || doc.original_filename;
      if (!drawingRevision && doc.metadata?.revision_date) {
        drawingRevision = doc.metadata.revision_date;
      }
    } else if (eq.source?.document) {
      hasDrawingProvenance = true;
    }

    if (documents.length > 0 && !hasDrawingProvenance && eq.status !== 'confirmed') {
      const isAck =
        acknowledgedIssueIds.has('WARN_EQUIPMENT_UNVERIFIED_SOURCE') ||
        acknowledgedIssueIds.has('WARN_UNVERIFIED_EQUIPMENT') ||
        acknowledgedIssueIds.has('WARN_EQUIPMENT_PROVISIONAL') ||
        acknowledgedIssueIds.has(eq.id);
      const issue: ValidationIssue = {
        id: uuidv4(),
        severity: 'engineering_review_required',
        category: 'missing_engineering_information',
        code: 'WARN_EQUIPMENT_UNVERIFIED_SOURCE',
        message: `Equipment "${cleanTag || 'Unnamed'}" lacks verified source drawing provenance. Validate against uploaded P&ID/PFD documents.`,
        entity_type: 'equipment',
        entity_id: eq.id,
        acknowledged: isAck,
      };
      issues.push(issue);
      itemIssues.push(issue);
    }

    // 4. Equipment Taxonomy & Description Check
    if (!eq.description || eq.description.trim() === '') {
      const issue: ValidationIssue = {
        id: uuidv4(),
        severity: 'informational',
        category: 'missing_engineering_information',
        code: 'INFO_MISSING_EQUIPMENT_DESCRIPTION',
        message: `Equipment "${cleanTag}" has no service description. Provide functional equipment description before final PHA review.`,
        entity_type: 'equipment',
        entity_id: eq.id,
      };
      issues.push(issue);
      itemIssues.push(issue);
    }

    if (eq.equipment_type === 'other' || eq.status === 'unresolved') {
      const issue: ValidationIssue = {
        id: uuidv4(),
        severity: 'engineering_review_required',
        category: 'source_to_source_discrepancy',
        code: 'WARN_UNRESOLVED_EQUIPMENT_TYPE',
        message: `Equipment "${cleanTag}" has an unresolved classification ("${eq.equipment_type}"). Confirm proper engineering taxonomy.`,
        entity_type: 'equipment',
        entity_id: eq.id,
      };
      issues.push(issue);
      itemIssues.push(issue);
    }

    // 5. Conflicting Tags Check
    const hasConflicts = (eq.conflicting_tags && eq.conflicting_tags.length > 0) || false;
    if (hasConflicts) {
      conflictingCount++;
      const conflictDocs = eq.conflicting_tags!.map((c) => `${c.document_name} ("${c.tag}")`).join(', ');
      const issue: ValidationIssue = {
        id: uuidv4(),
        severity: 'engineering_review_required',
        category: 'source_to_source_discrepancy',
        code: 'WARN_EQUIPMENT_TAG_CONFLICT',
        message: `Equipment "${cleanTag}" has conflicting cross-document designations in: ${conflictDocs}. Engineer reconciliation required.`,
        entity_type: 'equipment',
        entity_id: eq.id,
      };
      issues.push(issue);
      itemIssues.push(issue);
    }

    // 6. Isolated Node Review Classification Check
    if (isIsolated) {
      const reviewStatus = eq.isolated_review_status;

      if (!reviewStatus || reviewStatus === 'awaiting_review') {
        unresolvedIsolated++;
        const issue: ValidationIssue = {
          id: uuidv4(),
          severity: 'warning',
          category: 'topology_integrity',
          code: 'WARN_DISCONNECTED_NODE',
          message: `Equipment node "${cleanTag}" (${eq.description || 'No description'}) has zero incoming or outgoing piping connections. Verify if this is an isolated unit or missing lines.`,
          entity_type: 'equipment',
          entity_id: eq.id,
        };
        issues.push(issue);
        itemIssues.push(issue);
      } else if (reviewStatus === 'confirmed_isolated') {
        reviewedIsolated++;
        // Documented isolated node (spare, standalone package, decommissioned) is allowed!
        const issue: ValidationIssue = {
          id: uuidv4(),
          severity: 'informational',
          category: 'topology_integrity',
          code: 'INFO_CONFIRMED_ISOLATED_EQUIPMENT',
          message: `Equipment "${cleanTag}" is confirmed standalone/isolated with documented justification: "${eq.isolated_review_notes || 'Reviewed standalone equipment'}".`,
          entity_type: 'equipment',
          entity_id: eq.id,
          acknowledged: true,
          acknowledgment_reason: eq.isolated_review_notes || 'Confirmed isolated equipment',
        };
        issues.push(issue);
        itemIssues.push(issue);
      } else if (reviewStatus === 'missing_connection_suspected') {
        unresolvedIsolated++;
        const issue: ValidationIssue = {
          id: uuidv4(),
          severity: 'warning',
          category: 'missing_engineering_information',
          code: 'WARN_MISSING_CONNECTION_SUSPECTED',
          message: `Equipment "${cleanTag}" is flagged as missing suspected piping connections: "${eq.isolated_review_notes || 'Piping omitted on drawing'}". Review P&ID drawings.`,
          entity_type: 'equipment',
          entity_id: eq.id,
        };
        issues.push(issue);
        itemIssues.push(issue);
      } else if (reviewStatus === 'connection_exists_on_another_drawing') {
        reviewedIsolated++;
        const issue: ValidationIssue = {
          id: uuidv4(),
          severity: 'informational',
          category: 'topology_integrity',
          code: 'INFO_CONNECTION_ON_OTHER_DRAWING',
          message: `Equipment "${cleanTag}" connects via inter-drawing tie-in on another drawing: "${eq.isolated_review_notes || 'Off-page connector'}".`,
          entity_type: 'equipment',
          entity_id: eq.id,
          acknowledged: true,
          acknowledgment_reason: eq.isolated_review_notes || 'Inter-drawing connection verified',
        };
        issues.push(issue);
        itemIssues.push(issue);
      } else if (reviewStatus === 'incorrect_equipment_identification') {
        unresolvedIsolated++;
        const issue: ValidationIssue = {
          id: uuidv4(),
          severity: 'engineering_review_required',
          category: 'source_to_source_discrepancy',
          code: 'WARN_INCORRECT_EQUIPMENT_IDENTIFICATION',
          message: `Symbol "${cleanTag}" was marked as incorrect equipment identification: "${eq.isolated_review_notes || 'False positive extraction'}". Confirm reclassification or exclusion.`,
          entity_type: 'equipment',
          entity_id: eq.id,
        };
        issues.push(issue);
        itemIssues.push(issue);
      }
    }

    // 7. Human Verification & Confidence Preservation
    const verificationStatus = eq.verification_status || (eq.status === 'confirmed' ? 'engineer_verified' : 'unverified');

    evaluations[eq.id] = {
      equipment_id: eq.id,
      tag: cleanTag,
      type: eq.equipment_type,
      description: eq.description,
      is_isolated: isIsolated,
      isolated_review_status: eq.isolated_review_status || null,
      verification_status: verificationStatus,
      has_drawing_provenance: hasDrawingProvenance,
      drawing_reference: drawingRef,
      drawing_page: drawingPage,
      drawing_revision: drawingRevision,
      extraction_confidence: eq.confidence ?? 1.0,
      original_extracted_values: eq.original_extracted_values || {
        tag: eq.machine_tag || eq.tag,
        equipment_type: eq.machine_type || eq.equipment_type,
        description: eq.machine_description || eq.description,
        confidence: eq.confidence ?? 1.0,
        extracted_at: eq.created_at,
      },
      has_duplicates: hasDuplicates,
      has_conflicts: hasConflicts,
      issues: itemIssues,
    };
  }

  // Acknowledge flagged issues
  for (const iss of issues) {
    if (
      iss.severity !== 'critical_error' &&
      (acknowledgedIssueIds.has(iss.code) ||
        (iss.entity_id && acknowledgedIssueIds.has(iss.entity_id)) ||
        (iss.entity_id && acknowledgedIssueIds.has(`${iss.code}:${iss.entity_id}`)))
    ) {
      iss.acknowledged = true;
    }
  }

  const criticalErrors = issues.filter(
    (i) => (i.severity === 'critical_error' || i.severity === 'error') && !i.acknowledged
  );
  const reviewRequired = issues.filter(
    (i) => i.severity === 'engineering_review_required' && !i.acknowledged
  );
  const warnings = issues.filter((i) => i.severity === 'warning' && !i.acknowledged);

  const isValid = criticalErrors.length === 0;
  const canApprove = criticalErrors.length === 0 && reviewRequired.length === 0;

  return {
    is_valid: isValid,
    can_approve: canApprove,
    total_equipment: equipment.length,
    confirmed_equipment: equipment.filter((e) => e.status === 'confirmed' || e.verification_status === 'engineer_verified').length,
    provisional_equipment: equipment.filter((e) => e.status === 'provisional' || e.verification_status === 'unverified').length,
    isolated_equipment: totalIsolated,
    reviewed_isolated: reviewedIsolated,
    unresolved_isolated: unresolvedIsolated,
    duplicate_tags_count: duplicateCount,
    conflicting_tags_count: conflictingCount,
    issues,
    equipment_evaluations: evaluations,
  };
}

/**
 * Creates or updates an equipment property with full property-level provenance.
 */
export function createPropertyProvenance<T>(
  value: T | null,
  options: {
    unit?: string | null;
    document_id?: string | null;
    document_name?: string | null;
    revision?: string | null;
    page?: number | null;
    drawing_location?: string | null;
    original_extracted_text?: string | null;
    confidence?: number | null;
    verification_status?: 'unverified' | 'engineer_verified';
    verified_by?: string | null;
  } = {}
): PropertyProvenance<T> {
  return {
    value,
    normalized_value: value,
    unit: options.unit || null,
    source_document_id: options.document_id || null,
    source_document_name: options.document_name || null,
    source_revision: options.revision || null,
    source_page: options.page || null,
    drawing_location: options.drawing_location || null,
    original_extracted_text: options.original_extracted_text || null,
    extraction_confidence: options.confidence ?? 1.0,
    verification_status: options.verification_status || 'unverified',
    verification_history: options.verified_by
      ? [
          {
            verified_by: options.verified_by,
            verified_at: new Date().toISOString(),
            action: options.verification_status === 'engineer_verified' ? 'verified' : 'reviewed',
            notes: 'Initial property creation / verification',
          },
        ]
      : [],
  };
}
