import { v4 as uuidv4 } from 'uuid';
import {
  HazopRiskMatrixConfig,
  HazopWorksheetRow,
  HazopSafeguard,
  HazopActionItem,
  HazopParameterCategory,
  PhaStudyNode,
  EquipmentTag,
  PipingLine,
  ProcessStream,
  ChemicalRecord,
  DocumentRecord,
} from '../types';
import { findComponentForTag } from './componentRegistryService';

/**
 * Creates the default IEC 61882 standard 5x5 Risk Matrix configuration.
 */
export function createDefaultRiskMatrixConfig(projectId: string): HazopRiskMatrixConfig {
  const severity_levels = [
    {
      level: 1,
      label: 'Negligible',
      description: 'Minor or superficial event with negligible consequence',
      safety_impact: 'First aid treatment on site; no lost work days',
      environmental_impact: 'Negligible release contained within equipment',
      economic_impact: '< $10,000 asset damage or production loss',
    },
    {
      level: 2,
      label: 'Minor',
      description: 'Minor injury or localized on-site release',
      safety_impact: 'Medical treatment case; reversible health effect',
      environmental_impact: 'Localized spill contained in secondary bund',
      economic_impact: '$10,000 - $100,000 repair cost',
    },
    {
      level: 3,
      label: 'Moderate',
      description: 'Lost time injury or release beyond containment',
      safety_impact: 'Lost time injury (LTI); temporary disability',
      environmental_impact: 'On-site release exceeding regulatory reportable quantity',
      economic_impact: '$100,000 - $1,000,000 production downtime',
    },
    {
      level: 4,
      label: 'Major',
      description: 'Severe injury or off-site toxic/flammable impact',
      safety_impact: 'Single fatality or permanent total disability',
      environmental_impact: 'Off-site release causing measurable environmental harm',
      economic_impact: '$1,000,000 - $10,000,000 plant shutdown',
    },
    {
      level: 5,
      label: 'Catastrophic',
      description: 'Multiple fatalities or massive public impact',
      safety_impact: 'Multiple fatalities on-site or off-site community casualty',
      environmental_impact: 'Extensive long-term toxic contamination or major fire',
      economic_impact: '> $10,000,000 severe financial & legal liability',
    },
  ];

  const likelihood_levels = [
    {
      level: 1,
      label: 'Rare',
      description: 'Practically improbable during facility life cycle',
      frequency_per_year: '< 10^-4 /yr',
    },
    {
      level: 2,
      label: 'Unlikely',
      description: 'Conceivable but not known to have occurred in facility history',
      frequency_per_year: '10^-4 to 10^-3 /yr',
    },
    {
      level: 3,
      label: 'Possible',
      description: 'Expected to occur at least once during plant lifetime',
      frequency_per_year: '10^-3 to 10^-2 /yr',
    },
    {
      level: 4,
      label: 'Likely',
      description: 'Occurs periodically (several times per facility lifecycle)',
      frequency_per_year: '10^-2 to 10^-1 /yr',
    },
    {
      level: 5,
      label: 'Frequent',
      description: 'Occurs multiple times per year during normal operation',
      frequency_per_year: '> 10^-1 /yr',
    },
  ];

  // Map 5x5 cells according to IEC 61882 standard risk ranking
  const cells: HazopRiskMatrixConfig['cells'] = [];
  for (let s = 1; s <= 5; s++) {
    for (let l = 1; l <= 5; l++) {
      const score = s * l;
      let risk_level: 'Low' | 'Medium' | 'High' | 'Critical';
      let acceptance_action: string;

      if (score >= 16 || s === 5 && l >= 3) {
        risk_level = 'Critical';
        acceptance_action = 'Intolerable risk. Operation prohibited until engineering design change is approved.';
      } else if (score >= 10 || s >= 4 && l >= 2) {
        risk_level = 'High';
        acceptance_action = 'Unacceptable without verified independent protection layers (IPL/SIL assessment mandatory).';
      } else if (score >= 5 || s >= 3) {
        risk_level = 'Medium';
        acceptance_action = 'ALARP region: Review and maintain existing safeguards; consider cost-effective actions.';
      } else {
        risk_level = 'Low';
        acceptance_action = 'Broadly acceptable: Standard operating procedures and regular maintenance sufficient.';
      }

      cells.push({ severity: s, likelihood: l, risk_level, acceptance_action });
    }
  }

  const now = new Date().toISOString();
  return {
    id: `matrix-${uuidv4().substring(0, 8)}`,
    project_id: projectId,
    version: 1,
    standard_reference: 'IEC 61882 (Hazard and operability studies - Application guide)',
    severity_levels,
    likelihood_levels,
    cells,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Calculates the Risk Level (Low/Medium/High/Critical) given severity, likelihood, and matrix config.
 */
export function calculateRiskLevel(
  severity: number,
  likelihood: number,
  matrixConfig?: HazopRiskMatrixConfig | null
): 'Low' | 'Medium' | 'High' | 'Critical' {
  if (matrixConfig && matrixConfig.cells) {
    const match = matrixConfig.cells.find((c) => c.severity === severity && c.likelihood === likelihood);
    if (match) return match.risk_level;
  }
  // Default IEC calculation
  const score = severity * likelihood;
  if (score >= 16 || severity === 5 && likelihood >= 3) return 'Critical';
  if (score >= 10 || severity >= 4 && likelihood >= 2) return 'High';
  if (score >= 5 || severity >= 3) return 'Medium';
  return 'Low';
}

/**
 * Generates IEC 61882 compliant HAZOP Worksheet rows for a given PHA study node.
 * Strictly separates Prevention Safeguards from Emergency Mitigation Safeguards.
 * Links findings to drawing number, revision, node boundaries, and PSI documentation.
 */
export function generateIec61882HazopWorksheet(
  node: PhaStudyNode,
  equipment: EquipmentTag[],
  lines: PipingLine[],
  streams: ProcessStream[],
  chemicals: ChemicalRecord[],
  documents: DocumentRecord[],
  matrixConfig?: HazopRiskMatrixConfig | null,
  drawingNumber = 'P&ID-104-NH3-REV-0',
  drawingRevision = 'REV 1'
): HazopWorksheetRow[] {
  const rows: HazopWorksheetRow[] = [];
  const now = new Date().toISOString();

  const nodeTagSet = new Set(node.equipment_tags.map((t) => t.toUpperCase()));
  const nodeEquipment = equipment.filter((eq) => nodeTagSet.has(eq.tag.toUpperCase()));
  const registryReferences = Array.from(new Map(
    nodeEquipment
      .map((eq) => findComponentForTag(eq.tag, eq.equipment_type))
      .filter((component) => component && (component.typical_failure_modes.length > 0 || component.typical_safeguards.length > 0))
      .map((component) => [component!.class_id, {
        component_class_id: component!.class_id,
        component_name: component!.name,
        typical_failure_modes: component!.typical_failure_modes,
        typical_safeguards: component!.typical_safeguards,
        verification_status: 'generic_unverified' as const,
      }])
  ).values());
  const hasVessel = nodeEquipment.some((eq) => eq.equipment_type === 'vessel' || eq.equipment_type === 'tank');
  const hasPump = nodeEquipment.some((eq) => eq.equipment_type === 'pump' || eq.equipment_type === 'compressor');
  const hasHeater = nodeEquipment.some((eq) => eq.equipment_type === 'heat_exchanger');

  // Identify applicable chemical hazards
  const assignedChem = chemicals.find((c) =>
    nodeEquipment.some((eq) => eq.assigned_chemical_id === c.id)
  ) || chemicals[0];

  const chemName = assignedChem?.chemical_name?.value || 'Process Fluid';
  const isAmmonia = chemName.toLowerCase().includes('ammonia');
  const isToxic = Boolean(assignedChem?.psi_parameters?.toxicity?.value);

  // Default supporting document references
  const supportingDocs = documents.map((d) => ({
    document_id: d.id,
    document_name: d.name,
    page: 1,
    section: d.doc_type === 'sds' ? 'Section 8 & 11' : 'Process Flow',
  }));

  // Standard IEC 61882 Deviation Matrix Definitions
  interface DeviationTemplate {
    parameter: HazopParameterCategory;
    guideword: string;
    deviation: string;
    causes: string[];
    consequences: string[];
    prevention: { tag?: string; desc: string; pid_ref?: string }[];
    mitigation: { tag?: string; desc: string; pid_ref?: string }[];
    severity: number;
    likelihood: number;
    suggested_actions: { rec: string; cat: HazopActionItem['category']; priority: HazopActionItem['priority'] }[];
  }

  const templates: DeviationTemplate[] = [
    {
      parameter: 'Flow',
      guideword: 'NO',
      deviation: 'No Flow',
      causes: [
        hasPump ? 'Pump motor power loss or trip on canned pump P-101A' : 'Upstream supply failure',
        'Manual valve closed in error or control valve failed closed',
        'Line blockage, frozen valve seat, or strainer blinding',
      ],
      consequences: [
        hasPump ? 'Pump deadheading, severe cavitation, temperature rise and canned motor overheating' : 'Loss of feed to downstream process',
        'Downstream cooling loss and potential thermal excursion in evaporative condenser',
      ],
      prevention: [
        { tag: 'FIC-101', desc: 'Low flow alarm (FAL) on discharge line', pid_ref: 'PID-104-NH3' },
        { tag: 'P-101A', desc: 'Minimum flow recirculation bypass line back to vessel', pid_ref: 'PID-104-NH3' },
      ],
      mitigation: [
        { tag: 'ESD-01', desc: 'Emergency motor trip on low-low flow interlock', pid_ref: 'ESD-PH-01' },
      ],
      severity: 3,
      likelihood: 3,
      suggested_actions: [
        {
          rec: 'Verify low-flow trip setpoint ensures adequate NPSH margin above cavitation limit.',
          cat: 'engineering_design',
          priority: 'high',
        },
      ],
    },
    {
      parameter: 'Flow',
      guideword: 'MORE',
      deviation: 'More Flow',
      causes: [
        'Flow control valve failed full open',
        'Operating error during line priming or bypass open',
        'Surge from upstream pressure surge drum',
      ],
      consequences: [
        'Overfilling of downstream vessel or condenser liquid carryover',
        'Erosion of piping elbows and cavitation at downstream control elements',
      ],
      prevention: [
        { tag: 'FCV-101', desc: 'Flow control valve mechanical travel stop at 115% design flow', pid_ref: 'PID-104-NH3' },
        { tag: 'FIT-101', desc: 'High flow alarm (FAH) on DCS console', pid_ref: 'PID-104-NH3' },
      ],
      mitigation: [
        { tag: 'LAHH-101', desc: 'High-high level interlock tripping supply isolation valve XV-1001', pid_ref: 'ESD-PH-01' },
      ],
      severity: 3,
      likelihood: 2,
      suggested_actions: [
        {
          rec: 'Inspect flow control valve travel limiters during next turnaround inspection.',
          cat: 'maintenance_inspection',
          priority: 'medium',
        },
      ],
    },
    {
      parameter: 'Flow',
      guideword: 'REVERSE',
      deviation: 'Reverse Flow',
      causes: [
        'Downstream pressure higher than supply pressure during pump stop',
        'Check valve failure or stuck open due to particulate binding',
      ],
      consequences: [
        'Reverse rotation and mechanical damage to pump impeller/bearings',
        'Back-contamination of low-pressure upstream storage vessel with warm process fluids',
      ],
      prevention: [
        { tag: 'NRV-101', desc: 'Dual check valve (NRV) on pump discharge line', pid_ref: 'PID-104-NH3' },
        { tag: 'PT-101', desc: 'Differential pressure alarm between discharge header and suction', pid_ref: 'PID-104-NH3' },
      ],
      mitigation: [
        { tag: 'XV-1001', desc: 'Automated fast-closing check/isolation valve actuated on pump trip', pid_ref: 'ESD-PH-01' },
      ],
      severity: 3,
      likelihood: 2,
      suggested_actions: [
        {
          rec: 'Add annual acoustic leak testing for check valve NRV-101 to verify positive backflow sealing.',
          cat: 'maintenance_inspection',
          priority: 'medium',
        },
      ],
    },
    {
      parameter: 'Pressure',
      guideword: 'MORE',
      deviation: 'More Pressure (Overpressure)',
      causes: [
        'Blocked outlet with continuing pump discharge or vapor generation',
        'External thermal fire exposure to liquid-full vessel V-101',
        'Inadvertent mixing with incompatible oxidizer generating exothermic gas release',
      ],
      consequences: [
        'Exceeding vessel MAWP (Design Pressure: 18.5 bar(g))',
        'Catastrophic rupture of vessel, brittle fracture, and massive release of toxic anhydrous ammonia gas',
      ],
      prevention: [
        { tag: 'PSHH-101', desc: 'High-high pressure sensor tripping pump and closing feed XV', pid_ref: 'PID-104-NH3' },
        { tag: 'PIC-101', desc: 'BPCS high pressure alarm (PAH)', pid_ref: 'PID-104-NH3' },
      ],
      mitigation: [
        { tag: 'PSV-1001', desc: 'Certified ASME Section VIII safety relief valve routed to closed flare header', pid_ref: 'PID-104-NH3' },
        { tag: 'DELUGE-01', desc: 'Water deluge spray system for ammonia vapor knockdown', pid_ref: 'SAFETY-01' },
      ],
      severity: 4,
      likelihood: 3,
      suggested_actions: [
        {
          rec: 'Verify PSV-1001 relief sizing calculation covers external pool fire exposure scenario per API 520/521.',
          cat: 'engineering_design',
          priority: 'critical',
        },
        {
          rec: 'Perform LOPA assessment on overpressure scenario to confirm SIL requirement for PSHH interlock.',
          cat: 'engineering_design',
          priority: 'critical',
        },
      ],
    },
    {
      parameter: 'Pressure',
      guideword: 'LESS',
      deviation: 'Less Pressure (Vacuum / Depressurization)',
      causes: [
        'Subcooling of liquid inventory below atmospheric boiling point (-33.3°C)',
        'Rapid pump-out of vessel without gas makeup equalization',
        'Condensation of ammonia vapor during ambient cooling storm',
      ],
      consequences: [
        'Vacuum condition inside vessel designed for positive pressure (vessel collapse/buckling)',
        'Air ingress into system forming explosive ammonia-air atmosphere (LFL: 15%)',
      ],
      prevention: [
        { tag: 'PALL-101', desc: 'Low-low pressure interlock tripping discharge pump P-101A', pid_ref: 'PID-104-NH3' },
        { tag: 'PCV-102', desc: 'Hot gas bypass equalization regulator from condenser discharge', pid_ref: 'PID-104-NH3' },
      ],
      mitigation: [
        { tag: 'VAC-01', desc: 'Vacuum relief valve or dry nitrogen pad regulator', pid_ref: 'PID-104-NH3' },
      ],
      severity: 3,
      likelihood: 2,
      suggested_actions: [
        {
          rec: 'Confirm vessel V-101 ASME nameplate allows full vacuum or install dedicated vacuum breaker.',
          cat: 'engineering_design',
          priority: 'high',
        },
      ],
    },
    {
      parameter: 'Temperature',
      guideword: 'MORE',
      deviation: 'More Temperature (High Temperature)',
      causes: [
        'Loss of evaporative condenser cooling water circulation',
        'Compressor superheat discharge without desuperheating quench',
        'Sun exposure and high ambient summer temperature (>38°C)',
      ],
      consequences: [
        'Rapid increase in vapor pressure exceeding normal operating limits (up to 15 bar)',
        'Thermal degradation of gasket materials and flange seal leaks',
      ],
      prevention: [
        { tag: 'TT-101', desc: 'Temperature transmitter with high temperature alarm (TAH) at 32°C', pid_ref: 'PID-104-NH3' },
        { tag: 'TCV-101', desc: 'Condenser fan speed modulating controller', pid_ref: 'PID-104-NH3' },
      ],
      mitigation: [
        { tag: 'TSHH-101', desc: 'High-high temperature shutdown tripping compressor', pid_ref: 'ESD-PH-01' },
      ],
      severity: 3,
      likelihood: 3,
      suggested_actions: [
        {
          rec: 'Validate condenser cooling duty margin during peak 99.6% ASHRAE summer ambient conditions.',
          cat: 'engineering_design',
          priority: 'medium',
        },
      ],
    },
    {
      parameter: 'Composition',
      guideword: 'OTHER THAN',
      deviation: 'Inadvertent Mixing / Contamination',
      causes: [
        'Cross-connection between sodium hypochlorite biocide dosing line and ammonia receiver loop',
        'Water leakage across evaporative condenser tube bundle into anhydrous ammonia refrigerant',
        'Maintenance cross-tie line left open without physical spectacle blind isolation',
      ],
      consequences: [
        isAmmonia
          ? 'CRITICAL REACTION: Hypochlorite + Ammonia reacts to generate toxic and explosive chloramines (NH2Cl, NHCl2, NCl3)'
          : 'Contamination causing exothermic runaway or severe equipment corrosion',
        'Loss of containment and lethal toxic vapor cloud release',
      ],
      prevention: [
        { tag: 'BLIND-01', desc: 'Physical spectacle blind and double block & bleed on chemical tie-ins', pid_ref: 'PID-104-NH3' },
        { tag: 'PROC-04', desc: 'Operating procedure requiring lock-out/tag-out prior to chemical addition', pid_ref: 'SOP-OPS-12' },
      ],
      mitigation: [
        { tag: 'TOX-DET', desc: 'Fixed optical open-path toxic gas detectors linked to plant-wide ESD alarm', pid_ref: 'F&G-01' },
      ],
      severity: 5,
      likelihood: 2,
      suggested_actions: [
        {
          rec: 'Permanently remove physical cross-tie spool between bleach dosing skid and ammonia receiver jacket.',
          cat: 'engineering_design',
          priority: 'critical',
        },
        {
          rec: 'Initiate immediate LOPA study for inadvertent mixing scenario (IEC 61882 finding M-01).',
          cat: 'operating_procedure',
          priority: 'critical',
        },
      ],
    },
  ];

  for (let idx = 0; idx < templates.length; idx++) {
    const t = templates[idx];
    const initialRisk = calculateRiskLevel(t.severity, t.likelihood, matrixConfig);
    const rowId = `hazop-${node.id}-${idx + 1}`;

    const prevention_safeguards: HazopSafeguard[] = t.prevention.map((p, pIdx) => ({
      id: `sg-prev-${rowId}-${pIdx + 1}`,
      type: 'prevention',
      tag: p.tag,
      description: p.desc,
      pid_reference: p.pid_ref || drawingNumber,
      verification_status: 'unverified',
    }));

    const mitigation_safeguards: HazopSafeguard[] = t.mitigation.map((m, mIdx) => ({
      id: `sg-mit-${rowId}-${mIdx + 1}`,
      type: 'mitigation',
      tag: m.tag,
      description: m.desc,
      pid_reference: m.pid_ref || drawingNumber,
      verification_status: 'unverified',
    }));

    const actions: HazopActionItem[] = t.suggested_actions.map((act, aIdx) => ({
      id: `act-${rowId}-${aIdx + 1}`,
      hazop_row_id: rowId,
      project_id: node.project_id,
      node_id: node.id,
      action_number: `ACT-${node.node_id}-${idx + 1}.${aIdx + 1}`,
      recommendation: act.rec,
      category: act.cat,
      owner: 'Process Safety Engineer',
      target_date: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString().split('T')[0],
      priority: act.priority,
      status: 'open',
      requires_review_on_change: true,
    }));

    // Post-mitigation residual risk (assumes action closure reduces likelihood by 1 level)
    const residualSeverity = t.severity;
    const residualLikelihood = Math.max(1, t.likelihood - 1);
    const residualRisk = calculateRiskLevel(residualSeverity, residualLikelihood, matrixConfig);

    rows.push({
      id: rowId,
      project_id: node.project_id,
      node_id: node.id,
      node_name: node.name,
      drawing_number: drawingNumber,
      drawing_revision: drawingRevision,
      parameter: t.parameter,
      guideword: t.guideword,
      deviation: t.deviation,
      causes: t.causes,
      consequences: t.consequences,
      registry_references: registryReferences,
      prevention_safeguards,
      mitigation_safeguards,
      initial_severity: t.severity,
      initial_likelihood: t.likelihood,
      initial_risk_level: initialRisk,
      residual_severity: residualSeverity,
      residual_likelihood: residualLikelihood,
      residual_risk_level: residualRisk,
      actions,
      supporting_documents: supportingDocs,
      linked_lopa_id: initialRisk === 'Critical' || initialRisk === 'High' ? `lopa-${rowId}` : null,
      review_status: 'draft',
      reviewed_by: undefined,
      created_at: now,
      updated_at: now,
    });
  }

  return rows;
}
