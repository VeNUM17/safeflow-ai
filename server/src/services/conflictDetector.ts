import { v4 as uuidv4 } from 'uuid';
import { ChemicalRecord, ChemicalConflict, PsiParameters } from '../types';

export function detectConflictsForProject(
  chemicals: ChemicalRecord[],
  projectId: string,
  existingConflicts: ChemicalConflict[] = []
): ChemicalConflict[] {
  const conflicts: ChemicalConflict[] = [...existingConflicts];

  // Group chemicals by CAS number or normalized chemical name
  const chemicalGroups = new Map<string, ChemicalRecord[]>();

  for (const chem of chemicals) {
    const cas = chem.cas_number.value?.trim();
    const name = chem.chemical_name.value?.trim().toLowerCase();
    const key = cas || name;

    if (!key) continue;

    if (!chemicalGroups.has(key)) {
      chemicalGroups.set(key, []);
    }
    chemicalGroups.get(key)!.push(chem);
  }

  const psiKeys: (keyof PsiParameters)[] = [
    'permissible_exposure_limits',
    'toxicity',
    'physical_data',
    'reactivity_data',
    'corrosivity_data',
    'thermal_and_chemical_stability_data',
    'inadvertent_mixing_hazards',
  ];

  const fieldLabels: Record<string, string> = {
    permissible_exposure_limits: 'Permissible Exposure Limits (PEL / TLV)',
    toxicity: 'Toxicity Information',
    physical_data: 'Physical Data (Boiling pt, Vapor pressure, etc.)',
    reactivity_data: 'Reactivity Data',
    corrosivity_data: 'Corrosivity Data',
    thermal_and_chemical_stability_data: 'Thermal & Chemical Stability Data',
    inadvertent_mixing_hazards: 'Hazardous Effects of Inadvertent Mixing',
    cas_number: 'CAS Number',
  };

  // Inspect groups that have 2 or more SDS records
  for (const [groupKey, group] of chemicalGroups.entries()) {
    if (group.length < 2) continue;

    const primaryChemName = group[0].chemical_name.value || groupKey;
    const casNum = group[0].cas_number.value || 'N/A';

    for (const fieldKey of psiKeys) {
      // Gather values from all SDSs for this field using the extracted source document value
      const validEntries = group
        .map((chem) => {
          const field = chem.psi_parameters[fieldKey];
          const val = field.value || field.machine_value || field.user_value;
          if (!val) return null;
          return {
            chemical_id: chem.id,
            document_id: chem.sds_document_id,
            document_name: field.source.document,
            revision_date: chem.sds_revision_date.value || 'Undated',
            value: val,
            snippet: field.source.snippet || val,
            confidence: field.confidence,
          };
        })
        .filter((e): e is NonNullable<typeof e> => e !== null);

      if (validEntries.length < 2) continue;

      // Check if source values meaningfully differ (normalize whitespace and case)
      const normalized0 = validEntries[0].value.replace(/\s+/g, ' ').trim().toLowerCase();
      const hasDivergence = validEntries.slice(1).some(
        (e) => e.value.replace(/\s+/g, ' ').trim().toLowerCase() !== normalized0
      );

      if (hasDivergence) {
        // Look for existing conflict for this group and field
        const existingIdx = conflicts.findIndex(
          (c) =>
            c.project_id === projectId &&
            (c.cas_number === casNum || c.chemical_name.toLowerCase() === primaryChemName.toLowerCase()) &&
            c.field_key === fieldKey
        );

        if (existingIdx >= 0) {
          // If already resolved, keep resolved status, but update entries snapshot
          conflicts[existingIdx].entries = validEntries;
        } else {
          conflicts.push({
            id: uuidv4(),
            project_id: projectId,
            chemical_name: primaryChemName,
            cas_number: casNum,
            field_key: fieldKey,
            field_label: fieldLabels[fieldKey] || fieldKey,
            status: 'unresolved',
            entries: validEntries,
            resolved_value: null,
            resolution_notes: null,
            resolved_at: null,
          });
        }
      }
    }
  }

  return conflicts;
}
