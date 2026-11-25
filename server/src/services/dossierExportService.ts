/**
 * SafeFlow AI Enterprise - Multi-Document Engineering Dossier Export Service (Phase 10)
 * Built & Architected by Shlok
 *
 * Implements comprehensive unified engineering dossier export:
 * - OSHA 29 CFR 1910.119 Process Safety Management compliance
 * - Multi-document cross-referencing (P&ID, PFD, Stream Tables, Datasheets, Philosophies, BOD, SDS)
 * - Chemical inventory with OSHA 7-parameter dataset and explicit concentration bases
 * - First-class ProcessLine and ProcessStream integration with property-level provenance
 * - Cross-document reconciliation & limit violation categorization
 * - Cryptographic SHA-256 graph approval snapshot and audit trail
 * - HAZOP study node candidate package and readiness gate
 */

import crypto from 'crypto';
import {
  ProcessProject,
  DocumentRecord,
  ChemicalRecord,
  EquipmentTag,
  ProcessLine,
  ProcessStream,
  GraphApprovalRecord,
  GraphValidationResult,
  PhaStudyNode,
  HazopReadinessResult,
  CrossDocumentDiscrepancy,
  UnifiedEngineeringMatrixEntry,
  EngineeringPhilosophyRule,
  AuditTrailEntry,
} from '../types';

export interface EngineeringDossierPayload {
  export_metadata: {
    system: string;
    architect: string;
    standard: string;
    notice: string;
    generated_at: string;
    project_id: string;
    project_name: string;
    dossier_version: string;
    integrity_hash?: string;
  };
  project: ProcessProject;
  document_registry: Array<{
    id: string;
    name: string;
    category?: string;
    revision?: string;
    size_bytes: number;
    pages_count: number;
    upload_timestamp: string;
  }>;
  chemical_inventory: Array<{
    id: string;
    name: string;
    cas_number: string;
    origin: string;
    record_status: string;
    psi_parameters: any;
  }>;
  process_topology: {
    equipment_count: number;
    lines_count: number;
    streams_count: number;
    equipment: EquipmentTag[];
    process_lines: ProcessLine[];
    process_streams: ProcessStream[];
    connection_classes_summary: {
      process_piping: number;
      instrument_signals: number;
      utility_connections: number;
      non_process_relationships: number;
    };
  };
  mechanical_specifications: Array<{
    equipment_tag: string;
    equipment_type: string;
    specifications: any;
  }>;
  engineering_philosophies: {
    rules_count: number;
    rules: EngineeringPhilosophyRule[];
  };
  cross_document_reconciliation: {
    total_discrepancies: number;
    source_to_source_discrepancies: number;
    operating_vs_design_limit_violations: number;
    missing_engineering_information: number;
    discrepancies: CrossDocumentDiscrepancy[];
  };
  graph_approval: GraphApprovalRecord & {
    status: 'approved' | 'not_approved' | 'invalidated';
  };
  pha_study_package: {
    nodes_count: number;
    nodes: PhaStudyNode[];
    hazop_readiness: HazopReadinessResult;
  };
  audit_trail: AuditTrailEntry[];
}

export function buildEngineeringDossier(
  project: ProcessProject,
  documents: DocumentRecord[],
  chemicals: ChemicalRecord[],
  equipment: EquipmentTag[],
  lines: ProcessLine[],
  streams: ProcessStream[],
  matrix: UnifiedEngineeringMatrixEntry[],
  rules: EngineeringPhilosophyRule[],
  discrepancies: CrossDocumentDiscrepancy[],
  approval: GraphApprovalRecord,
  validation: GraphValidationResult,
  phaNodes: PhaStudyNode[],
  readiness: HazopReadinessResult,
  auditLog: AuditTrailEntry[]
): EngineeringDossierPayload {
  const connClasses = {
    process_piping: lines.filter((l) => (l.functional_type || 'piping_line') === 'piping_line').length,
    instrument_signals: lines.filter((l) => (l.functional_type || '').includes('signal')).length,
    utility_connections: lines.filter((l) => (l.functional_type || '').includes('utility')).length,
    non_process_relationships: lines.filter((l) => (l.functional_type || '').includes('non_process')).length,
  };

  const discCounts = {
    source_to_source: discrepancies.filter((d) => d.discrepancy_type === 'source_to_source_discrepancy' || d.discrepancy_type === 'numerical_mismatch' || d.discrepancy_type === 'moc_divergence').length,
    limit_violations: discrepancies.filter((d) => d.discrepancy_type === 'operating_vs_design_limit_violation' || d.discrepancy_type === 'design_vs_operating' || d.discrepancy_type === 'relief_vs_mawp' || d.discrepancy_type === 'trip_vs_design').length,
    missing_info: discrepancies.filter((d) => d.discrepancy_type === 'missing_engineering_information' || (d as any).discrepancy_type === 'missing_data').length,
  };

  let approvalStatus: 'approved' | 'not_approved' | 'invalidated' = 'not_approved';
  if (approval.approved) {
    approvalStatus = 'approved';
  } else if (approval.invalidated_at) {
    approvalStatus = 'invalidated';
  }

  const payload: EngineeringDossierPayload = {
    export_metadata: {
      system: 'SafeFlow AI Enterprise',
      architect: 'Built & Architected by Shlok',
      standard: 'OSHA 29 CFR 1910.119 Process Safety Management (PSM) & Process Safety Information (PSI)',
      notice:
        'DISCLAIMER: This Multi-Document Engineering Dossier is compiled from automated extraction, cross-document reconciliation, and engineering evidence management. It is designed for process safety review and must be independently verified by a licensed Professional Engineer (PE) prior to operational execution.',
      generated_at: new Date().toISOString(),
      project_id: project.id,
      project_name: project.name,
      dossier_version: '2.0-Enterprise',
    },
    project,
    document_registry: documents.map((d) => ({
      id: d.id,
      name: d.name,
      category: d.doc_type || (d as any).category,
      revision: (d as any).revision || 'Rev 0',
      size_bytes: d.size_bytes,
      pages_count: d.pages_count,
      upload_timestamp: d.upload_timestamp,
    })),
    chemical_inventory: chemicals.map((c) => ({
      id: c.id,
      name: c.chemical_name.user_value || c.chemical_name.value || 'Unknown',
      cas_number: c.cas_number.user_value || c.cas_number.value || 'N/A',
      origin: (c as any).data_origin || c.origin || 'sds_extraction',
      record_status: c.record_status || 'draft',
      psi_parameters: c.psi_parameters,
    })),
    process_topology: {
      equipment_count: equipment.length,
      lines_count: lines.length,
      streams_count: streams.length,
      equipment,
      process_lines: lines,
      process_streams: streams,
      connection_classes_summary: connClasses,
    },
    mechanical_specifications: equipment.map((e) => ({
      equipment_tag: e.tag,
      equipment_type: e.equipment_type,
      specifications: e.specifications || null,
    })),
    engineering_philosophies: {
      rules_count: rules.length,
      rules,
    },
    cross_document_reconciliation: {
      total_discrepancies: discrepancies.length,
      source_to_source_discrepancies: discCounts.source_to_source,
      operating_vs_design_limit_violations: discCounts.limit_violations,
      missing_engineering_information: discCounts.missing_info,
      discrepancies,
    },
    graph_approval: {
      ...approval,
      status: approvalStatus,
    },
    pha_study_package: {
      nodes_count: phaNodes.length,
      nodes: phaNodes,
      hazop_readiness: readiness,
    },
    audit_trail: auditLog,
  };

  // Compute cryptographic SHA-256 integrity hash for dossier tamper-evidence
  const contentToHash = JSON.stringify({
    project: payload.project,
    topology: payload.process_topology,
    specifications: payload.mechanical_specifications,
    reconciliation: payload.cross_document_reconciliation,
    approval: payload.graph_approval,
  });
  payload.export_metadata.integrity_hash = crypto.createHash('sha256').update(contentToHash).digest('hex');

  return payload;
}

export function exportDossierToJson(dossier: EngineeringDossierPayload): string {
  return JSON.stringify(dossier, null, 2);
}

export function exportDossierToMarkdown(dossier: EngineeringDossierPayload): string {
  const m = dossier.export_metadata;
  const p = dossier.project;
  const t = dossier.process_topology;
  const a = dossier.graph_approval;
  const r = dossier.cross_document_reconciliation;
  const pha = dossier.pha_study_package;

  let md = `# SafeFlow AI Enterprise — Multi-Document Engineering Dossier\n\n`;
  md += `**Project:** ${p.name}  \n`;
  md += `**Architect / Creator:** ${m.architect}  \n`;
  md += `**Generated At:** ${m.generated_at}  \n`;
  md += `**Standard:** ${m.standard}  \n`;
  md += `**Cryptographic Hash (SHA-256):** \`${m.integrity_hash}\`  \n\n`;

  md += `> [!NOTE]\n> ${m.notice}\n\n`;

  md += `## 1. Process Topology & Verification Summary\n\n`;
  md += `- **Equipment Count:** ${t.equipment_count}\n`;
  md += `- **Process Lines:** ${t.lines_count} (Process Piping: ${t.connection_classes_summary.process_piping}, Signals: ${t.connection_classes_summary.instrument_signals}, Utilities: ${t.connection_classes_summary.utility_connections})\n`;
  md += `- **Process Streams:** ${t.streams_count}\n`;
  md += `- **Approval Status:** **${a.status.toUpperCase()}** ${a.approved ? `(Approved by ${a.approved_by} - ${a.approver_role})` : ''}\n\n`;

  md += `## 2. Cross-Document Reconciliation & Engineering Integrity\n\n`;
  md += `- **Total Discrepancies:** ${r.total_discrepancies}\n`;
  md += `- **Source-to-Source Discrepancies:** ${r.source_to_source_discrepancies}\n`;
  md += `- **Operating Condition vs Design Limit Violations:** ${r.operating_vs_design_limit_violations}\n`;
  md += `- **Missing Engineering Information:** ${r.missing_engineering_information}\n\n`;

  md += `## 3. PHA / HAZOP Study Readiness Gate\n\n`;
  md += `- **Study Nodes Segmented:** ${pha.nodes_count}\n`;
  md += `- **HAZOP Readiness:** **${pha.hazop_readiness.ready ? 'READY FOR STUDY' : 'BLOCKED / ACTION REQUIRED'}**\n`;
  if (pha.hazop_readiness.blocking_reasons.length > 0) {
    md += `\n### Blocking Action Items:\n`;
    for (const b of pha.hazop_readiness.blocking_reasons) {
      md += `- ⛔ ${b}\n`;
    }
  }

  md += `\n---\n*SafeFlow AI Enterprise Architecture — Made by Shlok*\n`;
  return md;
}
