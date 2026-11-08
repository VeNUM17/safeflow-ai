import {
  ProcessProject,
  ChemicalRecord,
  ChemicalAssignment,
  ProjectPsiDashboardValidation,
  ChemicalPsiCompletenessReport,
  PsiCompletenessCategoryReport,
  PsiParameters,
  PsiParameterDataState,
  ChemicalIdentificationStatus,
} from '../types';

export interface PsiValidationInput {
  project: ProcessProject;
  chemicals: ChemicalRecord[];
  assignments: ChemicalAssignment[];
}

export const OSHA_7_TOPICS: { key: keyof PsiParameters; label: string; critical: boolean; guidance: string }[] = [
  {
    key: 'toxicity',
    label: 'Toxicity',
    critical: true,
    guidance: 'Document acute and chronic toxic effects, IDLH values, oral/dermal/inhalation LD50/LC50, and target organs.',
  },
  {
    key: 'permissible_exposure_limits',
    label: 'Permissible Exposure Limits (PEL)',
    critical: true,
    guidance: 'Document regulatory OSHA PEL (8-hr TWA), ceiling limits, and recommended ACGIH TLV / NIOSH REL.',
  },
  {
    key: 'physical_data',
    label: 'Physical Data',
    critical: true,
    guidance: 'Document boiling point, vapor pressure, flash point, vapor density, LEL/UEL flammability limits, and solubility.',
  },
  {
    key: 'reactivity_data',
    label: 'Reactivity Data',
    critical: true,
    guidance: 'Document conditions contributing to instability, self-polymerization risks, and hazardous reaction conditions.',
  },
  {
    key: 'corrosivity_data',
    label: 'Corrosivity Data',
    critical: false,
    guidance: 'Document corrosivity to metals, elastomeric seals, pH, and materials selection requirements (e.g., NACE MR0175 / ISO 15156 for sour service).',
  },
  {
    key: 'thermal_and_chemical_stability_data',
    label: 'Thermal and Chemical Stability Data',
    critical: true,
    guidance: 'Document maximum safe storage/operating temperatures, thermal decomposition thresholds, and toxic breakdown products.',
  },
  {
    key: 'inadvertent_mixing_hazards',
    label: 'Inadvertent Mixing / Incompatibility Hazards',
    critical: true,
    guidance: 'Document hazardous chemical incompatibilities, violently exothermic reactions, or toxic gas evolution upon mixing.',
  },
];

/**
 * Validates the 7 OSHA PSI topics for all chemicals in a project.
 * Distinctly separates completeness percentage from verification percentage.
 */
export function validateProjectPsiCompleteness(input: PsiValidationInput): ProjectPsiDashboardValidation {
  const { project, chemicals, assignments } = input;
  const now = new Date().toISOString();

  const chemicalReports: ChemicalPsiCompletenessReport[] = [];
  const globalChecklist: {
    chemical_name: string;
    missing_topic: string;
    priority: 'high' | 'medium' | 'low';
    description: string;
  }[] = [];

  let totalPopulatedCategories = 0;
  let totalVerifiedCategories = 0;
  const totalPossibleCategories = chemicals.length * OSHA_7_TOPICS.length;

  let confirmedCount = 0;
  let candidateCount = 0;
  let unknownCount = 0;
  let fullyVerifiedCount = 0;
  let partiallyVerifiedCount = 0;
  let unverifiedCount = 0;

  for (const chem of chemicals) {
    const chemName =
      typeof chem.chemical_name?.value === 'string' && chem.chemical_name.value
        ? chem.chemical_name.value
        : 'Unknown Chemical';
    const casNum = typeof chem.cas_number?.value === 'string' ? chem.cas_number.value : null;

    // Check assignments
    const relatedAssignments = assignments.filter((a) => a.chemical_id === chem.id);
    let idStatus: ChemicalIdentificationStatus = 'CANDIDATE';
    if (relatedAssignments.some((a) => a.verification_status === 'verified')) {
      idStatus = 'CONFIRMED';
      confirmedCount++;
    } else if (chem.origin === 'sds_extracted' || chem.origin === 'manual_entry' || chem.origin === 'hybrid' || relatedAssignments.length > 0) {
      idStatus = 'CANDIDATE';
      candidateCount++;
    } else {
      idStatus = 'UNKNOWN';
      unknownCount++;
    }

    const catReports: PsiCompletenessCategoryReport[] = [];
    const missingCritical: string[] = [];
    const chemChecklist: string[] = [];
    let populatedInChem = 0;
    let verifiedInChem = 0;

    for (const topic of OSHA_7_TOPICS) {
      const field = chem.psi_parameters ? chem.psi_parameters[topic.key] : null;
      const val = field ? field.value : null;
      const isPopulated =
        val !== null &&
        val !== undefined &&
        val !== '' &&
        val !== 'Not Provided' &&
        val !== 'N/A' &&
        val !== 'Unknown';
      const isVerified = field?.verification_status === 'verified';

      let dataState: PsiParameterDataState = 'MISSING';
      if (isVerified) {
        dataState = 'VERIFIED';
        verifiedInChem++;
      } else if (isPopulated) {
        dataState = field?.review_status === 'needs_review' ? 'REQUIRES_REVIEW' : 'UNVERIFIED';
      } else {
        dataState = 'MISSING';
      }

      if (isPopulated) {
        populatedInChem++;
      } else {
        if (topic.critical) {
          missingCritical.push(topic.label);
          chemChecklist.push(`Missing critical safety information: ${topic.label}`);
          globalChecklist.push({
            chemical_name: chemName,
            missing_topic: topic.label,
            priority: 'high',
            description: `${topic.guidance} for ${chemName}.`,
          });
        } else {
          globalChecklist.push({
            chemical_name: chemName,
            missing_topic: topic.label,
            priority: 'medium',
            description: `${topic.guidance} for ${chemName}.`,
          });
        }
      }

      const valueSummary =
        typeof val === 'object' && val !== null ? JSON.stringify(val) : val ? String(val) : null;

      catReports.push({
        category_key: topic.key,
        category_name: topic.label,
        is_populated: isPopulated,
        is_verified: isVerified,
        data_state: dataState,
        findings_count: isPopulated ? 1 : 0,
        value_summary: valueSummary,
        source_evidence: field?.source?.snippet || field?.source?.document || null,
        notes: field?.missing_reason || null,
      });
    }

    totalPopulatedCategories += populatedInChem;
    totalVerifiedCategories += verifiedInChem;

    const completenessPct = Math.round((populatedInChem / OSHA_7_TOPICS.length) * 100);
    const verificationPct = Math.round((verifiedInChem / OSHA_7_TOPICS.length) * 100);
    const isFullyVerified = verifiedInChem === OSHA_7_TOPICS.length;

    if (isFullyVerified) {
      fullyVerifiedCount++;
    } else if (verifiedInChem > 0) {
      partiallyVerifiedCount++;
    } else {
      unverifiedCount++;
    }

    chemicalReports.push({
      chemical_id: chem.id,
      chemical_name: chemName,
      cas_number: casNum,
      identification_status: idStatus,
      categories: catReports,
      total_categories: OSHA_7_TOPICS.length,
      populated_categories_count: populatedInChem,
      verified_categories_count: verifiedInChem,
      completeness_percentage: completenessPct,
      verification_percentage: verificationPct,
      is_fully_verified: isFullyVerified,
      missing_critical_topics: missingCritical,
      conflicts_count: catReports.filter((c) => c.data_state === 'REQUIRES_REVIEW').length,
      actionable_engineering_checklist: chemChecklist,
    });
  }

  const overallCompleteness =
    totalPossibleCategories > 0 ? Math.round((totalPopulatedCategories / totalPossibleCategories) * 100) : 0;
  const overallVerification =
    totalPossibleCategories > 0 ? Math.round((totalVerifiedCategories / totalPossibleCategories) * 100) : 0;

  return {
    project_id: project.id,
    total_chemicals: chemicals.length,
    confirmed_chemicals_count: confirmedCount,
    candidate_chemicals_count: candidateCount,
    unknown_chemicals_count: unknownCount,
    fully_verified_psi_count: fullyVerifiedCount,
    partially_verified_psi_count: partiallyVerifiedCount,
    unverified_psi_count: unverifiedCount,
    overall_completeness_pct: overallCompleteness,
    overall_verification_pct: overallVerification,
    chemical_reports: chemicalReports,
    global_engineering_checklist: globalChecklist,
    evaluated_at: now,
  };
}
