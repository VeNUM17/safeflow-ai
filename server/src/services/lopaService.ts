import { v4 as uuidv4 } from 'uuid';
import {
  LopaRecord,
  IndependentProtectionLayer,
  HazopWorksheetRow,
  PhaStudyNode,
} from '../types';

/**
 * Validates and qualifies an Independent Protection Layer (IPL) strictly against CCPS criteria.
 * Core Principle: A P&ID symbol, alarm, or HAZOP finding ALONE never qualifies as an IPL.
 * An IPL must explicitly satisfy:
 * 1. Independence
 * 2. Functionality
 * 3. Reliability
 * 4. Auditability
 */
export function evaluateIplQualification(ipl: IndependentProtectionLayer): IndependentProtectionLayer {
  const indep = Boolean(ipl.criterion_independence_met !== undefined ? ipl.criterion_independence_met : ipl.independence_verified);
  const func = Boolean(ipl.criterion_functionality_met !== undefined ? ipl.criterion_functionality_met : ipl.functionality_verified);
  const rel = Boolean(ipl.criterion_reliability_met !== undefined ? ipl.criterion_reliability_met : ipl.reliability_verified);
  const audit = Boolean(ipl.criterion_auditability_met !== undefined ? ipl.criterion_auditability_met : ipl.auditability_verified);

  const indepEv = ipl.independence_evidence?.trim() || '';
  const funcEv = ipl.functionality_evidence?.trim() || '';
  const relEv = ipl.reliability_evidence?.trim() || '';
  const auditEv = ipl.auditability_evidence?.trim() || '';

  const hasIndependence = indep && indepEv.length > 5;
  const hasFunctionality = func && funcEv.length > 5;
  const hasReliability = rel && relEv.length > 5;
  const hasAuditability = audit && auditEv.length > 5;

  const isQualified = hasIndependence && hasFunctionality && hasReliability && hasAuditability && ipl.pfd > 0 && ipl.pfd < 1.0;

  return {
    ...ipl,
    independence_verified: indep,
    criterion_independence_met: indep,
    functionality_verified: func,
    criterion_functionality_met: func,
    reliability_verified: rel,
    criterion_reliability_met: rel,
    auditability_verified: audit,
    criterion_auditability_met: audit,
    is_qualified_ipl: isQualified,
  };
}

/**
 * Re-calculates LOPA frequencies, total PFD, risk tolerance status, and SIL requirement.
 */
export function recalculateLopa(lopa: LopaRecord): LopaRecord {
  // 1. Unmitigated consequence frequency: f0 = f_IE * prod(modifiers)
  let f0 = lopa.initiating_event.frequency_per_year;
  if (Array.isArray(lopa.conditional_modifiers)) {
    for (const mod of lopa.conditional_modifiers) {
      if (mod.probability > 0 && mod.probability <= 1.0) {
        f0 *= mod.probability;
      }
    }
  }

  // 2. Evaluate each IPL and calculate total credited PFD
  // STRICT RULE: Only qualified IPLs provide risk reduction credit!
  let totalPfd = 1.0;
  const updatedIpls = lopa.ipls.map((ipl) => {
    const evaluated = evaluateIplQualification(ipl);
    if (evaluated.is_qualified_ipl) {
      totalPfd *= evaluated.pfd;
    }
    return evaluated;
  });

  // 3. Mitigated Event Frequency (MEF)
  const mef = f0 * totalPfd;

  // 4. Risk Tolerance Evaluation
  const toleranceMet = mef <= lopa.target_frequency;

  // 5. SIL Requirement Allocation based on residual risk gap (IEC 61511 / CCPS)
  let silRequirement: LopaRecord['sil_requirement'] = 'None';
  if (!toleranceMet) {
    const requiredRrf = mef / lopa.target_frequency;
    if (requiredRrf <= 10) {
      silRequirement = 'None';
    } else if (requiredRrf <= 100) {
      silRequirement = 'SIL 1';
    } else if (requiredRrf <= 1000) {
      silRequirement = 'SIL 2';
    } else if (requiredRrf <= 10000) {
      silRequirement = 'SIL 3';
    } else {
      silRequirement = 'SIL 4';
    }
  }

  return {
    ...lopa,
    unmitigated_frequency: f0,
    unmitigated_frequency_per_year: f0,
    total_pfd: totalPfd,
    total_credited_pfd: totalPfd,
    mitigated_frequency: mef,
    mitigated_frequency_per_year: mef,
    target_mitigated_frequency_per_year: lopa.target_frequency,
    risk_tolerance_met: toleranceMet,
    sil_requirement: silRequirement,
    ipls: updatedIpls,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Creates a new LOPA record from an IEC 61882 HAZOP worksheet finding.
 */
export function createLopaFromHazopFinding(
  hazopRow: HazopWorksheetRow,
  node: PhaStudyNode,
  targetFrequency = 1e-4 // Default 1 in 10,000 years for severe industrial incidents
): LopaRecord {
  const now = new Date().toISOString();

  // Initial candidate IPLs synthesized from existing safeguards
  // Initially UNVERIFIED with empty evidence, requiring analyst evaluation!
  const candidateIpls: IndependentProtectionLayer[] = [
    ...hazopRow.prevention_safeguards.map((sg, idx) => ({
      id: `ipl-prev-${uuidv4().substring(0, 8)}`,
      tag: sg.tag || `SAFEGUARD-P${idx + 1}`,
      description: sg.description,
      ipl_type: (sg.tag?.startsWith('PSV') ? 'prv_relief' : sg.tag?.startsWith('SIS') ? 'sis_sif' : 'bpcs') as IndependentProtectionLayer['ipl_type'],
      pfd: sg.tag?.startsWith('PSV') ? 0.05 : 0.1,
      independence_verified: false,
      independence_evidence: '',
      functionality_verified: false,
      functionality_evidence: '',
      reliability_verified: false,
      reliability_evidence: '',
      auditability_verified: false,
      auditability_evidence: '',
      is_qualified_ipl: false, // Never qualified until analyst confirms!
    })),
    ...hazopRow.mitigation_safeguards.map((sg, idx) => ({
      id: `ipl-mit-${uuidv4().substring(0, 8)}`,
      tag: sg.tag || `SAFEGUARD-M${idx + 1}`,
      description: sg.description,
      ipl_type: (sg.tag?.includes('DELUGE') ? 'passive_containment' : 'other') as IndependentProtectionLayer['ipl_type'],
      pfd: 0.1,
      independence_verified: false,
      independence_evidence: '',
      functionality_verified: false,
      functionality_evidence: '',
      reliability_verified: false,
      reliability_evidence: '',
      auditability_verified: false,
      auditability_evidence: '',
      is_qualified_ipl: false, // Never qualified until analyst confirms!
    })),
  ];

  const lopa: LopaRecord = {
    id: `lopa-${hazopRow.id}`,
    project_id: hazopRow.project_id,
    node_id: hazopRow.node_id,
    hazop_row_id: hazopRow.id,
    scenario_title: `${hazopRow.deviation} in ${hazopRow.node_name}`,
    drawing_number: hazopRow.drawing_number,
    drawing_revision: hazopRow.drawing_revision,
    consequence_description: hazopRow.consequences.join('; '),
    severity_level: hazopRow.initial_severity,
    initiating_event: {
      description: hazopRow.causes[0] || 'Equipment failure or process upset',
      category: 'Equipment Mechanical Failure',
      frequency_per_year: 0.1, // 1 in 10 years typical generic failure rate
      evidence: `P&ID failure mode for ${hazopRow.deviation}`,
    },
    conditional_modifiers: [
      {
        id: `mod-${uuidv4().substring(0, 8)}`,
        name: 'Probability of Personnel Presence',
        probability: 0.25,
        justification: 'Unmanned pump skid; operator rounds occur 2 hours per 8-hour shift.',
      },
      {
        id: `mod-${uuidv4().substring(0, 8)}`,
        name: 'Probability of Toxic Cloud Escalation',
        probability: 0.5,
        justification: 'Atmospheric dispersion under prevailing wind conditions.',
      },
    ],
    unmitigated_frequency: 0.0125, // 0.1 * 0.25 * 0.5
    target_frequency: targetFrequency,
    ipls: candidateIpls,
    total_pfd: 1.0, // Since unverified, initial credited PFD is 1.0
    mitigated_frequency: 0.0125,
    risk_tolerance_met: false,
    sil_requirement: 'SIL 2',
    analyst_signoff: undefined,
    created_at: now,
    updated_at: now,
  };

  return recalculateLopa(lopa);
}
