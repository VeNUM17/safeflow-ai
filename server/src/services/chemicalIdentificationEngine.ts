import { v4 as uuidv4 } from 'uuid';
import {
  GasCompositionReport,
  GasCompositionComponent,
  ChemicalIdentificationStatus,
  ConcentrationUnit,
  StreamPhase,
  ChemicalRecord,
  ProcessStream,
  PipingLine,
  EquipmentTag,
} from '../types';

/**
 * Standard known hydrocarbon and sour gas components with standard phase at ambient/process conditions.
 */
export const KNOWN_GAS_COMPONENTS: Record<
  string,
  { formula: string; cas: string; defaultPhase: StreamPhase; isHazardous: boolean }
> = {
  methane: { formula: 'CH4', cas: '74-82-8', defaultPhase: 'gas', isHazardous: true },
  ethane: { formula: 'C2H6', cas: '74-84-0', defaultPhase: 'gas', isHazardous: true },
  propane: { formula: 'C3H8', cas: '74-98-6', defaultPhase: 'gas', isHazardous: true },
  'i-butane': { formula: 'C4H10', cas: '75-28-5', defaultPhase: 'gas', isHazardous: true },
  isobutane: { formula: 'C4H10', cas: '75-28-5', defaultPhase: 'gas', isHazardous: true },
  'n-butane': { formula: 'C4H10', cas: '106-97-8', defaultPhase: 'gas', isHazardous: true },
  butane: { formula: 'C4H10', cas: '106-97-8', defaultPhase: 'gas', isHazardous: true },
  'i-pentane': { formula: 'C5H12', cas: '78-78-4', defaultPhase: 'liquid', isHazardous: true },
  isopentane: { formula: 'C5H12', cas: '78-78-4', defaultPhase: 'liquid', isHazardous: true },
  'n-pentane': { formula: 'C5H12', cas: '109-66-0', defaultPhase: 'liquid', isHazardous: true },
  pentane: { formula: 'C5H12', cas: '109-66-0', defaultPhase: 'liquid', isHazardous: true },
  hexane: { formula: 'C6H14', cas: '110-54-3', defaultPhase: 'liquid', isHazardous: true },
  'hexanes+': { formula: 'C6+', cas: '68476-43-7', defaultPhase: 'liquid', isHazardous: true },
  'c6+': { formula: 'C6+', cas: '68476-43-7', defaultPhase: 'liquid', isHazardous: true },
  condensate: { formula: 'C5+', cas: '64741-47-5', defaultPhase: 'liquid', isHazardous: true },
  'hydrogen sulfide': { formula: 'H2S', cas: '7783-06-4', defaultPhase: 'gas', isHazardous: true },
  h2s: { formula: 'H2S', cas: '7783-06-4', defaultPhase: 'gas', isHazardous: true },
  'carbon dioxide': { formula: 'CO2', cas: '124-38-9', defaultPhase: 'gas', isHazardous: false },
  co2: { formula: 'CO2', cas: '124-38-9', defaultPhase: 'gas', isHazardous: false },
  nitrogen: { formula: 'N2', cas: '7727-37-9', defaultPhase: 'gas', isHazardous: false },
  n2: { formula: 'N2', cas: '7727-37-9', defaultPhase: 'gas', isHazardous: false },
  water: { formula: 'H2O', cas: '7732-18-5', defaultPhase: 'liquid', isHazardous: false },
  h2o: { formula: 'H2O', cas: '7732-18-5', defaultPhase: 'liquid', isHazardous: false },
  ammonia: { formula: 'NH3', cas: '7664-41-7', defaultPhase: 'gas', isHazardous: true },
  chlorine: { formula: 'Cl2', cas: '7782-50-5', defaultPhase: 'gas', isHazardous: true },
};

/**
 * Parses raw text from a laboratory gas analysis report, well stream test, or chromatographic sheet.
 */
export function parseGasCompositionReportText(
  text: string,
  projectId: string,
  documentId: string,
  reportTitle = 'Wellhead Gas Composition Analysis'
): GasCompositionReport {
  const lines = text.split(/\r?\n/);
  const components: GasCompositionComponent[] = [];
  let detectedUnit: ConcentrationUnit = 'mol%';
  let samplePoint = 'Inlet Reception Manifold';
  let sampleDate: string | null = null;
  let ambiguityFlag: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check for sample location metadata
    const sampleMatch = trimmed.match(/(?:sample\s+point|sampling\s+point|location|source|stream)\s*[:=-]\s*([^\r\n;,]+)/i);
    if (sampleMatch) {
      samplePoint = sampleMatch[1].trim();
    }

    // Check for date
    const dateMatch = trimmed.match(/(?:date|sampled\s+on)\s*[:=-]\s*(\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})/i);
    if (dateMatch) {
      sampleDate = dateMatch[1].trim();
    }

    // Check unit
    if (/mole?\s*%/i.test(trimmed) || /mol%/i.test(trimmed)) {
      detectedUnit = 'mol%';
    } else if (/vol(?:ume)?\s*%/i.test(trimmed)) {
      detectedUnit = 'vol%';
    } else if (/wt\s*%|weight\s*%/i.test(trimmed)) {
      detectedUnit = 'wt%';
    } else if (/ppm/i.test(trimmed)) {
      detectedUnit = 'ppm';
    }

    // Component rows: e.g. "Methane (C1)  82.50 mol%" or "H2S: 2.15 %"
    const compMatch = trimmed.match(
      /^([A-Za-z0-9\s\-+]+?)(?:\s*\([A-Za-z0-9]+\))?\s*[:=\t,]\s*([0-9]+(?:\.[0-9]+)?)\s*(%|mol%|vol%|wt%|ppm)?/i
    ) || trimmed.match(
      /^([A-Za-z0-9\s\-+]{2,30})\s+([0-9]+(?:\.[0-9]+)?)\s*(%|mol%|vol%|wt%|ppm)?$/i
    );

    if (compMatch) {
      const rawName = compMatch[1].trim();
      const numVal = parseFloat(compMatch[2]);
      if (!isNaN(numVal) && !/^(total|sum|sample|pressure|temperature|date|batch|method|page|analyst)$/i.test(rawName)) {
        const lowerName = rawName.toLowerCase();
        const known = KNOWN_GAS_COMPONENTS[lowerName] || Object.entries(KNOWN_GAS_COMPONENTS).find(
          ([k]) => lowerName.includes(k)
        )?.[1];

        components.push({
          component_name: rawName,
          formula: known?.formula || null,
          cas_number: known?.cas || null,
          concentration: numVal,
          unit: detectedUnit,
          normalized_mol_pct: numVal, // Will normalize below if mol%
          phase: known?.defaultPhase || 'gas',
          is_hazardous: known?.isHazardous ?? false,
        });
      }
    }
  }

  // Sum total
  const total = components.reduce((acc, c) => acc + c.concentration, 0);

  // Normalization if within reasonable range (e.g. 95% - 105%)
  if (total > 0 && Math.abs(total - 100) > 0.01) {
    if (total >= 90 && total <= 110) {
      for (const c of components) {
        c.normalized_mol_pct = Number(((c.concentration / total) * 100).toFixed(3));
      }
    } else {
      ambiguityFlag = `Total concentration sum is ${total.toFixed(2)}${detectedUnit} (expected ~100%). Composition may be incomplete or unnormalized.`;
    }
  }

  return {
    id: uuidv4(),
    project_id: projectId,
    document_id: documentId,
    report_title: reportTitle,
    sample_point: samplePoint,
    sample_date: sampleDate,
    analysis_method: 'Gas Chromatography (ASTM D1945)',
    components,
    total_concentration: Number(total.toFixed(2)),
    concentration_unit: detectedUnit,
    associated_stream_number: null,
    associated_stream_id: null,
    ambiguity_flag: ambiguityFlag,
    extracted_at: new Date().toISOString(),
  };
}

/**
 * Determines chemical identification status for a process entity (stream or equipment)
 * strictly enforcing the 3 statuses: CONFIRMED, CANDIDATE, UNKNOWN.
 *
 * Engineering Rule: Never convert an assumed or AI-inferred identity into verified process data.
 */
export function determineIdentificationStatus(
  targetTag: string,
  targetType: 'equipment' | 'stream',
  evidence: {
    explicitPipingLabels: string[];
    associatedReports: GasCompositionReport[];
    verifiedAssignments: boolean;
    hasProjectChemicals: boolean;
  }
): ChemicalIdentificationStatus {
  // 1. Direct engineer verification or verified assignment
  if (evidence.verifiedAssignments) {
    return 'CONFIRMED';
  }

  // 2. Direct document evidence from P&ID line list / stream table for this specific entity
  const hasDirectTagEvidence = evidence.explicitPipingLabels.some((lbl) => {
    const l = lbl.toUpperCase();
    return (
      l.includes('SOUR GAS') ||
      l.includes('HYDROCARBON') ||
      l.includes('CONDENSATE') ||
      l.includes('AMMONIA') ||
      l.includes('CHLORINE') ||
      l.includes('NATURAL GAS')
    );
  });

  if (hasDirectTagEvidence && evidence.associatedReports.length > 0) {
    return 'CONFIRMED';
  }

  // 3. Candidate: Chemical is in project inventory or generic label present, but not verified
  if (hasDirectTagEvidence || evidence.associatedReports.length > 0 || evidence.hasProjectChemicals) {
    return 'CANDIDATE';
  }

  // 4. Default: No chemical established
  return 'UNKNOWN';
}
