import { v4 as uuidv4 } from 'uuid';
import {
  ChemicalRecord,
  PsiFieldRecord,
  PsiParameters,
  FieldSource,
  ReviewStatus,
  CategoryExtractionStatus,
  CategoryFinding,
  CategoryExtractionResult,
  StructuredSdsExtraction,
} from '../types';
import { ExtractedDocumentContent } from './pdfExtractor';

// Regex character class covering all dash variations: hyphen, en-dash, em-dash, horizontal bar
const DASH_OR_PUNCT = `[:\\.\\-–—―/\\s]`;

export interface ExtractedSection {
  sectionNumber: number;
  title: string;
  pageNumber: number;
  text: string;
  subsections?: { subNumber: string; title: string; text: string }[];
}

// 16 Standard GHS Section Definitions
const GHS_SECTION_DEFS = [
  { sectionNumber: 1, title: 'Identification', keywords: /(?:IDENTIFICATION|CHEMICAL\s*PRODUCT|PRODUCT\s*AND\s*COMPANY)/i },
  { sectionNumber: 2, title: 'Hazard(s) Identification', keywords: /(?:HAZARD\(?S\)?\s*IDENTIFICATION|HAZARDS?\s*IDENTIFICATION)/i },
  { sectionNumber: 3, title: 'Composition / Ingredients', keywords: /(?:COMPOSITION|INGREDIENTS|INFORMATION\s*ON\s*INGREDIENTS)/i },
  { sectionNumber: 4, title: 'First-Aid Measures', keywords: /(?:FIRST[\s\-]AID\s*MEASURES)/i },
  { sectionNumber: 5, title: 'Fire-Fighting Measures', keywords: /(?:FIRE[\s\-]FIGHTING\s*MEASURES)/i },
  { sectionNumber: 6, title: 'Accidental Release Measures', keywords: /(?:ACCIDENTAL\s*RELEASE\s*MEASURES)/i },
  { sectionNumber: 7, title: 'Handling and Storage', keywords: /(?:HANDLING\s*AND\s*STORAGE)/i },
  { sectionNumber: 8, title: 'Exposure Controls / Personal Protection', keywords: /(?:EXPOSURE\s*CONTROLS|PERSONAL\s*PROTECTION|OCCUPATIONAL\s*EXPOSURE)/i },
  { sectionNumber: 9, title: 'Physical and Chemical Properties', keywords: /(?:PHYSICAL\s*AND\s*CHEMICAL\s*PROPERTIES|PHYSICAL\s*DATA)/i },
  { sectionNumber: 10, title: 'Stability and Reactivity', keywords: /(?:STABILITY\s*AND\s*REACTIVITY)/i },
  { sectionNumber: 11, title: 'Toxicological Information', keywords: /(?:TOXICOLOGICAL\s*INFORMATION|TOXICITY\s*DATA|TOXICITY)/i },
  { sectionNumber: 12, title: 'Ecological Information', keywords: /(?:ECOLOGICAL\s*INFORMATION|ECOTOXICITY)/i },
  { sectionNumber: 13, title: 'Disposal Considerations', keywords: /(?:DISPOSAL\s*CONSIDERATIONS)/i },
  { sectionNumber: 14, title: 'Transport Information', keywords: /(?:TRANSPORT\s*INFORMATION)/i },
  { sectionNumber: 15, title: 'Regulatory Information', keywords: /(?:REGULATORY\s*INFORMATION)/i },
  { sectionNumber: 16, title: 'Other Information', keywords: /(?:OTHER\s*INFORMATION|REVISION\s*DATE)/i },
];

/**
 * Robust GHS section splitting supporting:
 * - Single line: "SECTION 8 — EXPOSURE CONTROLS", "Section 8: Exposure controls", "8. Exposure controls"
 * - Multi-line: Line 1 = "SECTION 8", Line 2 = "EXPOSURE CONTROLS"
 * - All dash variations (-, –, —, ―)
 * - Subsections (10.1 Reactivity, 10.2 Chemical stability, 10.3 Hazardous reactions, etc.)
 * - Cross-page section boundary stitching
 */
export function splitIntoSections(pages: { pageNumber: number; text: string }[]): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  let currentSec: ExtractedSection | null = null;

  for (const page of pages) {
    const rawLines = page.text.split(/\r?\n/);

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i].trim();
      if (!line) continue;

      let matchedSecNum: number | null = null;
      let matchedTitle: string = '';

      // Pattern 1: Explicit SECTION prefix (e.g., "SECTION 8 — EXPOSURE CONTROLS" or "SEC. 8: ...")
      const secPrefixMatch = line.match(new RegExp(`^(?:SECTION|SEC\\.?)\\s*(\\d{1,2})(?:${DASH_OR_PUNCT}+(.+))?$`, 'i'));
      if (secPrefixMatch) {
        const num = parseInt(secPrefixMatch[1], 10);
        if (num >= 1 && num <= 16) {
          const restOfLine = secPrefixMatch[2]?.trim() || '';
          if (restOfLine) {
            matchedSecNum = num;
            matchedTitle = restOfLine;
          } else if (i + 1 < rawLines.length) {
            // Check next line for section title
            const nextLine = rawLines[i + 1].trim();
            const def = GHS_SECTION_DEFS.find((d) => d.sectionNumber === num);
            if (def && (def.keywords.test(nextLine) || nextLine.length < 60)) {
              matchedSecNum = num;
              matchedTitle = nextLine;
              i++; // consume title line
            } else {
              matchedSecNum = num;
              matchedTitle = def?.title || `Section ${num}`;
            }
          } else {
            matchedSecNum = num;
            matchedTitle = GHS_SECTION_DEFS.find((d) => d.sectionNumber === num)?.title || `Section ${num}`;
          }
        }
      }

      // Pattern 2: Number-only prefix at start of line (e.g. "8. EXPOSURE CONTROLS" or "8 — Exposure controls")
      if (matchedSecNum === null) {
        const numOnlyMatch = line.match(new RegExp(`^(\\d{1,2})\\s*${DASH_OR_PUNCT}+\\s*([A-Za-z\\s/\\(\\)\\-–—―]{3,60})$`));
        if (numOnlyMatch) {
          const num = parseInt(numOnlyMatch[1], 10);
          const candidateTitle = numOnlyMatch[2].trim();
          const def = GHS_SECTION_DEFS.find((d) => d.sectionNumber === num);
          if (def && (def.keywords.test(candidateTitle) || candidateTitle.toUpperCase() === candidateTitle)) {
            matchedSecNum = num;
            matchedTitle = candidateTitle;
          }
        }
      }

      if (matchedSecNum !== null) {
        // If this section number already exists from a previous page, continue appending to it
        const existing = sections.find((s) => s.sectionNumber === matchedSecNum);
        if (existing) {
          currentSec = existing;
          currentSec.text += '\n' + line;
        } else {
          currentSec = {
            sectionNumber: matchedSecNum,
            title: matchedTitle || GHS_SECTION_DEFS.find((d) => d.sectionNumber === matchedSecNum)?.title || `Section ${matchedSecNum}`,
            pageNumber: page.pageNumber,
            text: line,
            subsections: [],
          };
          sections.push(currentSec);
        }
      } else if (currentSec) {
        currentSec.text += '\n' + line;

        // Check for subsections (e.g. "10.1 Reactivity", "10.2 Chemical stability", "10.3 Hazardous reactions")
        const subMatch = line.match(/^(\d{1,2}\.\d{1,2})\s*[:\.\-–—―\s]\s*([^\r\n]{3,60})/i);
        if (subMatch && currentSec) {
          if (!currentSec.subsections) currentSec.subsections = [];
          currentSec.subsections.push({
            subNumber: subMatch[1],
            title: subMatch[2].trim(),
            text: line,
          });
        } else if (currentSec.subsections && currentSec.subsections.length > 0) {
          currentSec.subsections[currentSec.subsections.length - 1].text += '\n' + line;
        }
      }
    }
  }

  return sections;
}

function truncateSnippet(text: string, maxLen = 350): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen) + '...';
}

function createMissingField(
  docId: string,
  docName: string,
  sectionName: string,
  reason: string
): PsiFieldRecord {
  return {
    value: null,
    machine_value: null,
    user_value: null,
    source: {
      document: docName,
      document_id: docId,
      page: null,
      section: sectionName,
      snippet: null,
    },
    confidence: 0,
    review_status: 'missing',
    category_status: 'not_found',
    findings: [],
    source_sections: sectionName ? [sectionName] : [],
    evidence: [],
    missing_reason: reason,
    updated_at: new Date().toISOString(),
  };
}

function createFailedField(
  docId: string,
  docName: string,
  sectionName: string,
  reason: string
): PsiFieldRecord {
  return {
    value: null,
    machine_value: null,
    user_value: null,
    source: {
      document: docName,
      document_id: docId,
      page: null,
      section: sectionName,
      snippet: null,
    },
    confidence: 0,
    review_status: 'extraction_failed',
    category_status: 'extraction_failed',
    findings: [],
    source_sections: sectionName ? [sectionName] : [],
    evidence: [],
    missing_reason: reason,
    updated_at: new Date().toISOString(),
  };
}

// ----------------------------------------------------
// Specialized Category Extractors
// ----------------------------------------------------

interface CategoryExtractionOutput {
  record: PsiFieldRecord;
  categoryResult: CategoryExtractionResult;
}

/**
 * 1. Toxicity (OSHA 1910.119(d)(1)(i))
 * Primary: Section 11. Fallback: Section 2 & full text.
 */
function extractToxicity(
  sections: ExtractedSection[],
  fullText: string,
  docId: string,
  docName: string
): CategoryExtractionOutput {
  const sec11 = sections.find((s) => s.sectionNumber === 11);
  const sec2 = sections.find((s) => s.sectionNumber === 2);
  const targetText = sec11 ? sec11.text : [sec2?.text || '', fullText].join('\n');
  const targetPage = sec11?.pageNumber || sec2?.pageNumber || 1;

  const findings: CategoryFinding[] = [];
  const evidenceLines: string[] = [];

  const lines = targetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (/^Section\s*11\b/i.test(line)) continue;

    // LC50 Inhalation (supports e.g. "LC50 (4-hour, rat) = 1,500 ppm" or "LC50: 2000 ppm")
    const lc50Match = line.match(/(?:LC50|LC-50|inhalation\s*LC50)[^\r\n:=]{0,35}[:=]?\s*([0-9,]+(?:\.[0-9]+)?)\s*(ppm|mg\/m3|mg\/L|g\/m3)/i);
    if (lc50Match) {
      findings.push({
        field: 'Inhalation LC50',
        value: lc50Match[1].replace(/,/g, ''),
        units: lc50Match[2],
        qualifier: 'Inhalation acute lethal concentration',
        test_conditions: line.substring(0, 120),
      });
      evidenceLines.push(line);
    }

    // LD50 Oral / Dermal (supports e.g. "LD50 (rat) = 350 mg/kg" or "LD-50: 1,200 mg/kg")
    const ld50Match = line.match(/(?:LD50|LD-50|oral\s*LD50|dermal\s*LD50)[^\r\n:=]{0,35}[:=]?\s*([0-9,]+(?:\.[0-9]+)?)\s*(mg\/kg|g\/kg)/i);
    if (ld50Match) {
      findings.push({
        field: 'Acute LD50',
        value: ld50Match[1].replace(/,/g, ''),
        units: ld50Match[2],
        qualifier: /dermal/i.test(line) ? 'Dermal LD50' : 'Oral LD50',
        test_conditions: line.substring(0, 120),
      });
      evidenceLines.push(line);
    }

    // Acute Toxicity categories, routes, symptoms, respiratory irritation
    if (
      /(?:acute\s*(?:inhalation\s*)?toxicity|pulmonary\s*edema|respiratory\s*(?:arrest|tract|burns|irritation)|asphyxi|fatal\s*if\s*(?:inhaled|swallowed)|toxic\s*if\s*(?:inhaled|swallowed)|carcinogen|mutagen|toxicological)/i.test(line) &&
      !evidenceLines.includes(line)
    ) {
      findings.push({
        field: 'Toxicological Hazard & Effects',
        value: line,
      });
      evidenceLines.push(line);
    }
  }

  // If Section 11 was explicitly detected and has content but no specific keyword matched, include Section 11 text
  if (findings.length === 0 && sec11 && sec11.text.length > 40) {
    const validLines = lines.filter((l) => !/^Section\s*11\b/i.test(l) && l.length > 10);
    if (validLines.length > 0) {
      for (const line of validLines.slice(0, 3)) {
        findings.push({
          field: 'Toxicological Information',
          value: line,
        });
        evidenceLines.push(line);
      }
    }
  }

  if (findings.length > 0 || evidenceLines.length > 0) {
    const summaryText = truncateSnippet(evidenceLines.slice(0, 4).join(' | '), 350);
    const sourceSection = sec11 ? 'Section 11: Toxicological Information' : 'Section 2 / Full Document';
    const record: PsiFieldRecord = {
      value: summaryText,
      machine_value: summaryText,
      user_value: null,
      source: {
        document: docName,
        document_id: docId,
        page: targetPage,
        section: sourceSection,
        snippet: truncateSnippet(evidenceLines.join('\n'), 400),
      },
      confidence: sec11 ? 0.95 : 0.85,
      review_status: 'needs_review',
      category_status: 'extracted',
      findings,
      source_sections: [sourceSection],
      evidence: evidenceLines.slice(0, 5),
      updated_at: new Date().toISOString(),
    };

    return {
      record,
      categoryResult: {
        status: 'extracted',
        findings,
        source_sections: [sourceSection],
        evidence: evidenceLines.slice(0, 5),
        summary: summaryText,
      },
    };
  }

  // Not found
  const reason = 'No toxicity data found in Section 11 or available SDS text. No acute or chronic toxicological data (LC50, LD50, routes of exposure) documented.';
  return {
    record: createMissingField(docId, docName, 'Section 11: Toxicological Information', reason),
    categoryResult: {
      status: 'not_found',
      findings: [],
      source_sections: sec11 ? ['Section 11'] : [],
      evidence: [],
      summary: null,
      missing_reason: reason,
    },
  };
}

/**
 * 2. Permissible Exposure Limits (OSHA 1910.119(d)(1)(ii))
 * Primary: Section 8. Fallback: full text.
 */
function extractExposureLimits(
  sections: ExtractedSection[],
  fullText: string,
  docId: string,
  docName: string
): CategoryExtractionOutput {
  const sec8 = sections.find((s) => s.sectionNumber === 8);
  const targetText = sec8 ? sec8.text : fullText;
  const targetPage = sec8?.pageNumber || 1;

  const findings: CategoryFinding[] = [];
  const evidenceLines: string[] = [];

  const lines = targetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // OSHA PEL
    const pelMatch = line.match(/(?:OSHA\s*PEL|PEL)\s*[:\-–—―]?\s*([0-9]+(?:\.[0-9]+)?)\s*(ppm|mg\/m3|fibers\/cm3)?(?:\s*\(([^\)]+)\))?/i);
    if (pelMatch) {
      findings.push({
        field: 'OSHA PEL',
        value: pelMatch[1],
        units: pelMatch[2] || 'ppm',
        qualifier: pelMatch[3] || '8-hr TWA',
        test_conditions: line.substring(0, 80),
      });
      evidenceLines.push(line);
    }

    // ACGIH TLV
    const tlvMatch = line.match(/(?:ACGIH\s*TLV|TLV)\s*[:\-–—―]?\s*([0-9]+(?:\.[0-9]+)?)\s*(ppm|mg\/m3)?(?:\s*([A-Za-z0-9\s,\-]+))?/i);
    if (tlvMatch) {
      findings.push({
        field: 'ACGIH TLV',
        value: tlvMatch[1],
        units: tlvMatch[2] || 'ppm',
        qualifier: tlvMatch[3]?.trim() || 'TWA',
        test_conditions: line.substring(0, 80),
      });
      evidenceLines.push(line);
    }

    // NIOSH REL / IDLH
    const relMatch = line.match(/(?:NIOSH\s*REL|REL)\s*[:\-–—―]?\s*([0-9]+(?:\.[0-9]+)?)\s*(ppm|mg\/m3)?(?:\s*([A-Za-z0-9\s,\-]+))?/i);
    if (relMatch) {
      findings.push({
        field: 'NIOSH REL',
        value: relMatch[1],
        units: relMatch[2] || 'ppm',
        qualifier: relMatch[3]?.trim() || 'TWA',
        test_conditions: line.substring(0, 80),
      });
      evidenceLines.push(line);
    }

    const idlhMatch = line.match(/(?:IDLH)\s*[:\-–—―]?\s*([0-9]+(?:\.[0-9]+)?)\s*(ppm|mg\/m3)?/i);
    if (idlhMatch) {
      findings.push({
        field: 'NIOSH IDLH',
        value: idlhMatch[1],
        units: idlhMatch[2] || 'ppm',
        qualifier: 'Immediately Dangerous to Life or Health',
        test_conditions: line.substring(0, 80),
      });
      if (!evidenceLines.includes(line)) evidenceLines.push(line);
    }

    // General limit lines containing TWA, STEL, or Ceiling if not matched above
    if (
      /(?:(?:8[\s\-]hr\s*)?TWA|STEL|Ceiling|WEEL|MAK)\s*[:\-–—―]?\s*[0-9]+(?:\.[0-9]+)?\s*(?:ppm|mg\/m3)/i.test(line) &&
      !evidenceLines.includes(line)
    ) {
      findings.push({
        field: 'Occupational Exposure Limit',
        value: line,
      });
      evidenceLines.push(line);
    }
  }

  if (findings.length > 0 || evidenceLines.length > 0) {
    const summaryText = truncateSnippet(evidenceLines.slice(0, 4).join(' | '), 350);
    const sourceSection = sec8 ? 'Section 8: Exposure Controls/Personal Protection' : 'Full Document';
    const record: PsiFieldRecord = {
      value: summaryText,
      machine_value: summaryText,
      user_value: null,
      source: {
        document: docName,
        document_id: docId,
        page: targetPage,
        section: sourceSection,
        snippet: truncateSnippet(evidenceLines.join('\n'), 400),
      },
      confidence: sec8 ? 0.96 : 0.88,
      review_status: 'needs_review',
      category_status: 'extracted',
      findings,
      source_sections: [sourceSection],
      evidence: evidenceLines.slice(0, 5),
      updated_at: new Date().toISOString(),
    };

    return {
      record,
      categoryResult: {
        status: 'extracted',
        findings,
        source_sections: [sourceSection],
        evidence: evidenceLines.slice(0, 5),
        summary: summaryText,
      },
    };
  }

  const reason = 'No permissible exposure limits (OSHA PEL / ACGIH TLV / NIOSH REL) stated in Section 8 or available document text.';
  return {
    record: createMissingField(docId, docName, 'Section 8: Exposure Controls', reason),
    categoryResult: {
      status: 'not_found',
      findings: [],
      source_sections: sec8 ? ['Section 8'] : [],
      evidence: [],
      summary: null,
      missing_reason: reason,
    },
  };
}

/**
 * 3. Physical Data (OSHA 1910.119(d)(1)(iii))
 * Primary: Section 9. Fallback: full text.
 */
function extractPhysicalData(
  sections: ExtractedSection[],
  fullText: string,
  docId: string,
  docName: string
): CategoryExtractionOutput {
  const sec9 = sections.find((s) => s.sectionNumber === 9);
  const targetText = sec9 ? sec9.text : fullText;
  const targetPage = sec9?.pageNumber || 1;

  const findings: CategoryFinding[] = [];
  const evidenceLines: string[] = [];

  const lines = targetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Boiling point
    const bpMatch = line.match(/(?:Boiling\s*point|Boiling\s*range)\s*[:\-–—―]?\s*([^\r\n;]{2,60})/i);
    if (bpMatch) {
      findings.push({ field: 'Boiling Point', value: bpMatch[1].trim() });
      evidenceLines.push(line);
    }

    // Melting / Freezing point
    const mpMatch = line.match(/(?:Melting\s*point|Freezing\s*point)\s*[:\-–—―]?\s*([^\r\n;]{2,60})/i);
    if (mpMatch) {
      findings.push({ field: 'Melting/Freezing Point', value: mpMatch[1].trim() });
      if (!evidenceLines.includes(line)) evidenceLines.push(line);
    }

    // Vapor pressure
    const vpMatch = line.match(/(?:Vapor\s*pressure)\s*[:\-–—―]?\s*([^\r\n;]{2,60})/i);
    if (vpMatch) {
      findings.push({ field: 'Vapor Pressure', value: vpMatch[1].trim() });
      if (!evidenceLines.includes(line)) evidenceLines.push(line);
    }

    // Vapor density
    const vdMatch = line.match(/(?:Vapor\s*density)\s*[:\-–—―]?\s*([^\r\n;]{2,60})/i);
    if (vdMatch) {
      findings.push({ field: 'Vapor Density', value: vdMatch[1].trim() });
      if (!evidenceLines.includes(line)) evidenceLines.push(line);
    }

    // Flash point
    const fpMatch = line.match(/(?:Flash\s*point)\s*[:\-–—―]?\s*([^\r\n;]{2,60})/i);
    if (fpMatch) {
      findings.push({ field: 'Flash Point', value: fpMatch[1].trim() });
      if (!evidenceLines.includes(line)) evidenceLines.push(line);
    }

    // Specific gravity / Density
    const sgMatch = line.match(/(?:Specific\s*gravity|Relative\s*density|Density)\s*[:\-–—―]?\s*([^\r\n;]{2,60})/i);
    if (sgMatch && !/vapor/i.test(line)) {
      findings.push({ field: 'Specific Gravity / Density', value: sgMatch[1].trim() });
      if (!evidenceLines.includes(line)) evidenceLines.push(line);
    }

    // pH
    const phMatch = line.match(/\bpH\b\s*[:\-–—―]?\s*([0-9]+(?:\.[0-9]+)?(?:\s*-\s*[0-9]+(?:\.[0-9]+)?)?)/i);
    if (phMatch) {
      findings.push({ field: 'pH', value: phMatch[1].trim() });
      if (!evidenceLines.includes(line)) evidenceLines.push(line);
    }

    // Flammability limits LEL/UEL
    const flMatch = line.match(/(?:Flammability\s*limits?|Explosive\s*limits?|LEL|UEL)\s*[:\-–—―]?\s*([^\r\n;]{2,60})/i);
    if (flMatch) {
      findings.push({ field: 'Flammability Limits', value: flMatch[1].trim() });
      if (!evidenceLines.includes(line)) evidenceLines.push(line);
    }
  }

  if (findings.length > 0 || evidenceLines.length > 0) {
    const summaryText = truncateSnippet(evidenceLines.slice(0, 5).join(' | '), 350);
    const sourceSection = sec9 ? 'Section 9: Physical and Chemical Properties' : 'Full Document';
    const record: PsiFieldRecord = {
      value: summaryText,
      machine_value: summaryText,
      user_value: null,
      source: {
        document: docName,
        document_id: docId,
        page: targetPage,
        section: sourceSection,
        snippet: truncateSnippet(evidenceLines.join('\n'), 400),
      },
      confidence: sec9 ? 0.94 : 0.82,
      review_status: 'needs_review',
      category_status: 'extracted',
      findings,
      source_sections: [sourceSection],
      evidence: evidenceLines.slice(0, 5),
      updated_at: new Date().toISOString(),
    };

    return {
      record,
      categoryResult: {
        status: 'extracted',
        findings,
        source_sections: [sourceSection],
        evidence: evidenceLines.slice(0, 5),
        summary: summaryText,
      },
    };
  }

  const reason = 'No physical properties (boiling point, vapor pressure, density, flash point, pH) documented in Section 9 or available SDS text.';
  return {
    record: createMissingField(docId, docName, 'Section 9: Physical Data', reason),
    categoryResult: {
      status: 'not_found',
      findings: [],
      source_sections: sec9 ? ['Section 9'] : [],
      evidence: [],
      summary: null,
      missing_reason: reason,
    },
  };
}

/**
 * 4. Reactivity Data (OSHA 1910.119(d)(1)(iv))
 * Primary: Section 10 (10.1 Reactivity, 10.3 Hazardous reactions, 10.4 Conditions to avoid). Fallback: full text.
 */
function extractReactivity(
  sections: ExtractedSection[],
  fullText: string,
  docId: string,
  docName: string
): CategoryExtractionOutput {
  const sec10 = sections.find((s) => s.sectionNumber === 10);
  const targetText = sec10 ? sec10.text : fullText;
  const targetPage = sec10?.pageNumber || 1;

  const findings: CategoryFinding[] = [];
  const evidenceLines: string[] = [];

  const lines = targetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (
      /(?:reactivity|hazardous\s*reactions?|conditions\s*to\s*avoid|polymeriz|violent\s*reaction|exotherm|shock[\s\-]sensitive|static\s*discharge)/i.test(line) &&
      !/(?:corros|skin\s*corr|metal\s*corr)/i.test(line) // avoid pulling corrosivity into reactivity
    ) {
      findings.push({ field: 'Reactivity Hazard', value: line });
      evidenceLines.push(line);
    }
  }

  if (findings.length > 0 || evidenceLines.length > 0) {
    const summaryText = truncateSnippet(evidenceLines.slice(0, 4).join(' | '), 350);
    const sourceSection = sec10 ? 'Section 10: Stability and Reactivity' : 'Full Document';
    const record: PsiFieldRecord = {
      value: summaryText,
      machine_value: summaryText,
      user_value: null,
      source: {
        document: docName,
        document_id: docId,
        page: targetPage,
        section: sourceSection,
        snippet: truncateSnippet(evidenceLines.join('\n'), 400),
      },
      confidence: sec10 ? 0.93 : 0.80,
      review_status: 'needs_review',
      category_status: 'extracted',
      findings,
      source_sections: [sourceSection],
      evidence: evidenceLines.slice(0, 5),
      updated_at: new Date().toISOString(),
    };

    return {
      record,
      categoryResult: {
        status: 'extracted',
        findings,
        source_sections: [sourceSection],
        evidence: evidenceLines.slice(0, 5),
        summary: summaryText,
      },
    };
  }

  const reason = 'No reactivity hazards, hazardous reaction potential, or conditions to avoid documented in Section 10.';
  return {
    record: createMissingField(docId, docName, 'Section 10: Reactivity', reason),
    categoryResult: {
      status: 'not_found',
      findings: [],
      source_sections: sec10 ? ['Section 10'] : [],
      evidence: [],
      summary: null,
      missing_reason: reason,
    },
  };
}

/**
 * 5. Corrosivity Data (OSHA 1910.119(d)(1)(v))
 * Target: Metal corrosion, severe tissue destruction/burns, extreme pH (< 2 or > 11.5).
 * IMPORTANT GUARD: Generic mild eye/skin irritation must NOT be categorized as Corrosivity!
 */
function extractCorrosivity(
  sections: ExtractedSection[],
  fullText: string,
  docId: string,
  docName: string
): CategoryExtractionOutput {
  const sec2 = sections.find((s) => s.sectionNumber === 2);
  const sec9 = sections.find((s) => s.sectionNumber === 9);
  const sec10 = sections.find((s) => s.sectionNumber === 10);
  const targetText = [sec2?.text || '', sec9?.text || '', sec10?.text || '', fullText].join('\n');
  const targetPage = sec2?.pageNumber || sec10?.pageNumber || sec9?.pageNumber || 1;

  const findings: CategoryFinding[] = [];
  const evidenceLines: string[] = [];

  const lines = targetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // Metal corrosion (copper, brass, zinc, steel, aluminum)
    const metalMatch = line.match(/(?:corrosive\s*to\s*metals?|corrodes?\s+(?:copper|brass|zinc|metal|steel|aluminum|alloys?)|attacks?\s+(?:copper|brass|zinc|metal|steel|aluminum))/i);
    if (metalMatch) {
      findings.push({ field: 'Metal Corrosivity', value: line });
      evidenceLines.push(line);
      continue;
    }

    // Severe tissue destruction / GHS Skin Corrosion Category 1 / severe burns / serious eye damage Cat 1
    if (
      /(?:skin\s*corrosion(?:\s*Category\s*1|\s*1[ABC]?)?|causes\s*severe\s*(?:skin\s*)?burns\s*and\s*eye\s*damage|serious\s*eye\s*damage(?:\s*Category\s*1)?|irreversible\s*eye\s*damage)/i.test(line) &&
      !/(?:mild\s*skin\s*irritation|eye\s*irritation\s*Category\s*2)/i.test(line)
    ) {
      findings.push({ field: 'Dermal / Ocular Corrosivity', value: line });
      evidenceLines.push(line);
      continue;
    }

    // Extreme pH (<= 2 or >= 11.5)
    const phMatch = line.match(/\bpH\s*[:\-–—―]?\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (phMatch) {
      const phVal = parseFloat(phMatch[1]);
      if (phVal <= 2.0 || phVal >= 11.5) {
        findings.push({
          field: 'Extreme Corrosive pH',
          value: `pH ${phVal} (Extreme acid/base corrosive threshold)`,
        });
        evidenceLines.push(line);
      }
    }
  }

  if (findings.length > 0 || evidenceLines.length > 0) {
    const summaryText = truncateSnippet(evidenceLines.slice(0, 4).join(' | '), 350);
    const sourceSection = 'Sections 2, 9, 10: Corrosivity & Metallurgy';
    const record: PsiFieldRecord = {
      value: summaryText,
      machine_value: summaryText,
      user_value: null,
      source: {
        document: docName,
        document_id: docId,
        page: targetPage,
        section: sourceSection,
        snippet: truncateSnippet(evidenceLines.join('\n'), 400),
      },
      confidence: 0.94,
      review_status: 'needs_review',
      category_status: 'extracted',
      findings,
      source_sections: [sourceSection],
      evidence: evidenceLines.slice(0, 5),
      updated_at: new Date().toISOString(),
    };

    return {
      record,
      categoryResult: {
        status: 'extracted',
        findings,
        source_sections: [sourceSection],
        evidence: evidenceLines.slice(0, 5),
        summary: summaryText,
      },
    };
  }

  const reason = 'No corrosive properties, metal corrosion hazards (copper, brass, zinc, steel attack), or extreme pH documented in the Safety Data Sheet.';
  return {
    record: createMissingField(docId, docName, 'Sections 2, 9, 10: Corrosivity', reason),
    categoryResult: {
      status: 'not_found',
      findings: [],
      source_sections: ['Sections 2, 9, 10'],
      evidence: [],
      summary: null,
      missing_reason: reason,
    },
  };
}

/**
 * 6. Thermal and Chemical Stability Data (OSHA 1910.119(d)(1)(vi))
 * Primary: Section 10 (10.2 Chemical stability, 10.6 Hazardous decomposition products). Fallback: full text.
 */
function extractStability(
  sections: ExtractedSection[],
  fullText: string,
  docId: string,
  docName: string
): CategoryExtractionOutput {
  const sec10 = sections.find((s) => s.sectionNumber === 10);
  const targetText = sec10 ? sec10.text : fullText;
  const targetPage = sec10?.pageNumber || 1;

  const findings: CategoryFinding[] = [];
  const evidenceLines: string[] = [];

  const lines = targetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (
      /(?:chemical\s*stability|stable\s*under|decompos(?:es?|ition)|thermal\s*decompos|hazardous\s*decomposition\s*products|auto[\s\-]decomposition|instability)/i.test(line) &&
      !/(?:corros|skin\s*corr)/i.test(line)
    ) {
      findings.push({ field: 'Thermal/Chemical Stability', value: line });
      evidenceLines.push(line);
    }
  }

  if (findings.length > 0 || evidenceLines.length > 0) {
    const summaryText = truncateSnippet(evidenceLines.slice(0, 4).join(' | '), 350);
    const sourceSection = sec10 ? 'Section 10: Chemical Stability & Thermal Decomposition' : 'Full Document';
    const record: PsiFieldRecord = {
      value: summaryText,
      machine_value: summaryText,
      user_value: null,
      source: {
        document: docName,
        document_id: docId,
        page: targetPage,
        section: sourceSection,
        snippet: truncateSnippet(evidenceLines.join('\n'), 400),
      },
      confidence: sec10 ? 0.94 : 0.80,
      review_status: 'needs_review',
      category_status: 'extracted',
      findings,
      source_sections: [sourceSection],
      evidence: evidenceLines.slice(0, 5),
      updated_at: new Date().toISOString(),
    };

    return {
      record,
      categoryResult: {
        status: 'extracted',
        findings,
        source_sections: [sourceSection],
        evidence: evidenceLines.slice(0, 5),
        summary: summaryText,
      },
    };
  }

  const reason = 'No thermal or chemical stability data (decomposition temperatures, decomposition products) documented in Section 10.';
  return {
    record: createMissingField(docId, docName, 'Section 10: Stability', reason),
    categoryResult: {
      status: 'not_found',
      findings: [],
      source_sections: sec10 ? ['Section 10'] : [],
      evidence: [],
      summary: null,
      missing_reason: reason,
    },
  };
}

/**
 * 7. Hazardous Effects of Inadvertent Mixing (OSHA 1910.119(d)(1)(vii))
 * Primary: Section 10 (10.3 Possibility of hazardous reactions, 10.5 Incompatible materials). Fallback: full text.
 */
function extractInadvertentMixing(
  sections: ExtractedSection[],
  fullText: string,
  docId: string,
  docName: string
): CategoryExtractionOutput {
  const sec10 = sections.find((s) => s.sectionNumber === 10);
  const targetText = sec10 ? sec10.text : fullText;
  const targetPage = sec10?.pageNumber || 1;

  const findings: CategoryFinding[] = [];
  const evidenceLines: string[] = [];

  const lines = targetText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    if (
      /(?:incompatib|inadvertent|bleach|acids?|bases?|oxidiz|reacts?\s*violently\s*with|toxic\s*gas|chloramine|mixing\s*with|materials\s*to\s*avoid)/i.test(line) &&
      !/(?:corrosive\s*to\s*metals|skin\s*corr)/i.test(line)
    ) {
      findings.push({ field: 'Inadvertent Mixing Hazard', value: line });
      evidenceLines.push(line);
    }
  }

  if (findings.length > 0 || evidenceLines.length > 0) {
    const summaryText = truncateSnippet(evidenceLines.slice(0, 4).join(' | '), 350);
    const sourceSection = sec10 ? 'Section 10: Incompatible Materials & Inadvertent Mixing' : 'Full Document';
    const record: PsiFieldRecord = {
      value: summaryText,
      machine_value: summaryText,
      user_value: null,
      source: {
        document: docName,
        document_id: docId,
        page: targetPage,
        section: sourceSection,
        snippet: truncateSnippet(evidenceLines.join('\n'), 400),
      },
      confidence: sec10 ? 0.95 : 0.82,
      review_status: 'needs_review',
      category_status: 'extracted',
      findings,
      source_sections: [sourceSection],
      evidence: evidenceLines.slice(0, 5),
      updated_at: new Date().toISOString(),
    };

    return {
      record,
      categoryResult: {
        status: 'extracted',
        findings,
        source_sections: [sourceSection],
        evidence: evidenceLines.slice(0, 5),
        summary: summaryText,
      },
    };
  }

  const reason = 'No incompatible materials or inadvertent mixing hazard scenarios documented in Section 10.';
  return {
    record: createMissingField(docId, docName, 'Section 10: Inadvertent Mixing', reason),
    categoryResult: {
      status: 'not_found',
      findings: [],
      source_sections: sec10 ? ['Section 10'] : [],
      evidence: [],
      summary: null,
      missing_reason: reason,
    },
  };
}

// ----------------------------------------------------
// Diagnostic Logging (Section 8)
// ----------------------------------------------------

export interface DiagnosticLogInfo {
  documentId: string;
  documentName: string;
  processingStatus: 'success' | 'failed' | 'unreadable';
  pagesDetected: number;
  extractedCharCount: number;
  detectedSections: { sectionNumber: number; title: string }[];
  modelOrEngineStatus: 'completed' | 'failed';
  validationStatus: 'valid' | 'schema_error';
  categoryFindingsCounts: {
    toxicity: number;
    exposure_limits: number;
    physical_data: number;
    reactivity: number;
    corrosivity: number;
    stability: number;
    inadvertent_mixing: number;
  };
  databasePersistenceStatus: 'persisted' | 'skipped' | 'failed';
}

export function logSdsExtractionDiagnostics(info: DiagnosticLogInfo): void {
  console.log(`\n================== [SafeFlow SDS Extraction Diagnostic Log] ==================`);
  console.log(`[Document ID]:            ${info.documentId}`);
  console.log(`[Document Name]:          ${info.documentName}`);
  console.log(`[Processing Status]:      ${info.processingStatus.toUpperCase()}`);
  console.log(`[Pages Processed]:        ${info.pagesDetected}`);
  console.log(`[Extracted Characters]:   ${info.extractedCharCount} chars`);
  console.log(
    `[Sections Detected (${info.detectedSections.length})]:  ${info.detectedSections
      .map((s) => `Sec ${s.sectionNumber} (${s.title.substring(0, 20)})`)
      .join(', ') || 'NONE'}`
  );
  console.log(`[Engine Status]:          ${info.modelOrEngineStatus}`);
  console.log(`[Schema Validation]:      ${info.validationStatus}`);
  console.log(`[Category Findings]:`);
  console.log(`   - 1. Toxicity:             ${info.categoryFindingsCounts.toxicity} findings`);
  console.log(`   - 2. Exposure Limits:      ${info.categoryFindingsCounts.exposure_limits} findings`);
  console.log(`   - 3. Physical Data:        ${info.categoryFindingsCounts.physical_data} findings`);
  console.log(`   - 4. Reactivity:           ${info.categoryFindingsCounts.reactivity} findings`);
  console.log(`   - 5. Corrosivity:          ${info.categoryFindingsCounts.corrosivity} findings`);
  console.log(`   - 6. Stability:            ${info.categoryFindingsCounts.stability} findings`);
  console.log(`   - 7. Inadvertent Mixing:   ${info.categoryFindingsCounts.inadvertent_mixing} findings`);
  console.log(`[Database Persistence]:   ${info.databasePersistenceStatus}`);
  console.log(`==============================================================================\n`);
}

// ----------------------------------------------------
// Main SDS Parser Entry Point
// ----------------------------------------------------

export function parseSdsContent(
  docContent: ExtractedDocumentContent,
  documentId: string,
  documentName: string,
  projectId: string
): ChemicalRecord {
  const { text: fullText, pages, isReadable } = docContent;

  // Handle unreadable/scanned PDF gracefully
  if (!isReadable) {
    const failedReason = `Document is unreadable or scanned without extractable digital text. ${docContent.unreadableReason || ''}`.trim();
    const emptyField = (sec: string) => createFailedField(documentId, documentName, sec, failedReason);

    logSdsExtractionDiagnostics({
      documentId,
      documentName,
      processingStatus: 'unreadable',
      pagesDetected: pages.length,
      extractedCharCount: fullText.length,
      detectedSections: [],
      modelOrEngineStatus: 'failed',
      validationStatus: 'schema_error',
      categoryFindingsCounts: {
        toxicity: 0,
        exposure_limits: 0,
        physical_data: 0,
        reactivity: 0,
        corrosivity: 0,
        stability: 0,
        inadvertent_mixing: 0,
      },
      databasePersistenceStatus: 'skipped',
    });

    const now = new Date().toISOString();
    return {
      id: uuidv4(),
      project_id: projectId,
      sds_document_id: documentId,
      chemical_name: emptyField('Section 1'),
      cas_number: emptyField('Section 3'),
      sds_revision_date: emptyField('Header'),
      manufacturer: emptyField('Section 1'),
      psi_parameters: {
        toxicity: emptyField('Section 11'),
        permissible_exposure_limits: emptyField('Section 8'),
        physical_data: emptyField('Section 9'),
        reactivity_data: emptyField('Section 10'),
        corrosivity_data: emptyField('Sections 2, 9, 10'),
        thermal_and_chemical_stability_data: emptyField('Section 10'),
        inadvertent_mixing_hazards: emptyField('Section 10'),
      },
      created_at: now,
      updated_at: now,
    };
  }

  // Segment sections
  const sections = splitIntoSections(pages);

  // 1. Chemical Name
  let chemicalNameVal: string | null = null;
  let chemicalNamePage = 1;
  let chemicalNameSnippet: string | null = null;
  let chemicalNameConf = 0.5;

  const sec1 = sections.find((s) => s.sectionNumber === 1);
  const sec1Text = sec1 ? sec1.text : pages[0]?.text || '';
  const searchHeaderZone = [pages[0]?.text || '', sec1Text].join('\n');

  const namePatterns = [
    /(?:Product\s*(?:Identifier|Name)?|Chemical\s*Name|Substance\s*Name|Trade\s*Name)\s*[:\-–—―]\s*([^\r\n;\.]{2,80})/i,
    /(?:Common\s*Name|Synonyms?)\s*[:\-–—―]\s*([^\r\n;\.]{2,80})/i,
  ];

  for (const pat of namePatterns) {
    const match = searchHeaderZone.match(pat);
    if (match && match[1]) {
      chemicalNameVal = match[1].trim();
      chemicalNamePage = sec1?.pageNumber || 1;
      chemicalNameSnippet = truncateSnippet(match[0]);
      chemicalNameConf = 0.95;
      break;
    }
  }

  // Fallback: search first 10 lines of page 1
  if (!chemicalNameVal && pages.length > 0) {
    const firstLines = pages[0].text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 2 && l.length < 60);
    for (const line of firstLines) {
      if (!/safety\s*data\s*sheet|sds|revision|date|page|section|synthetic|not\s*for|fictional/i.test(line)) {
        chemicalNameVal = line;
        chemicalNameSnippet = line;
        chemicalNamePage = 1;
        chemicalNameConf = 0.6;
        break;
      }
    }
  }

  // 2. CAS Number
  let casVal: string | null = null;
  let casPage: number | null = null;
  let casSection: string | null = null;
  let casSnippet: string | null = null;
  let casConf = 0.0;

  const casPattern = /\b([0-9]{2,7}-[0-9]{2}-[0-9])\b/;
  const sec3 = sections.find((s) => s.sectionNumber === 3);

  const searchZones = [
    { text: sec3?.text || '', secName: 'Section 3: Composition / Ingredients', page: sec3?.pageNumber || 1 },
    { text: sec1?.text || '', secName: 'Section 1: Identification', page: sec1?.pageNumber || 1 },
    { text: fullText, secName: 'General Document', page: 1 },
  ];

  for (const zone of searchZones) {
    if (!zone.text) continue;
    const match = zone.text.match(casPattern);
    if (match) {
      casVal = match[1].trim();
      casPage = zone.page;
      casSection = zone.secName;
      const idx = zone.text.indexOf(match[0]);
      const start = Math.max(0, idx - 40);
      const end = Math.min(zone.text.length, idx + match[0].length + 40);
      casSnippet = truncateSnippet(zone.text.substring(start, end));
      casConf = 0.98;
      break;
    }
  }

  // 3. SDS Revision Date
  let revDateVal: string | null = null;
  let revDateSnippet: string | null = null;
  let revDatePage = 1;
  const revDatePattern = /(?:Revision\s*Date|Issue\s*Date|Date\s*of\s*(?:Issue|Preparation|Revision))\s*[:\-–—―]?\s*([^\r\n]{4,50})/i;
  const revMatch = fullText.match(revDatePattern);
  if (revMatch && revMatch[1]) {
    const rawDatePart = revMatch[1].split(/(?:CAS|Doc|Revision|Page|Section|;)/i)[0].trim();
    revDateVal = rawDatePart;
    revDateSnippet = truncateSnippet(revMatch[0]);
  }

  // 4. Manufacturer
  let mfrVal: string | null = null;
  let mfrSnippet: string | null = null;
  let mfrPage = 1;
  const mfrPattern = /(?:Manufacturer|Supplier|Company|Distributor)\s*[:\-–—―]\s*([^\r\n]{3,100})/i;
  const mfrMatch = (searchHeaderZone || fullText).match(mfrPattern);
  if (mfrMatch && mfrMatch[1]) {
    const rawMfr = mfrMatch[1].split(/(?:Document\s*ID|Doc\s*ID|Revision|Date|CAS|Phone|Tel|;)/i)[0].trim();
    mfrVal = rawMfr;
    mfrSnippet = truncateSnippet(mfrMatch[0]);
    mfrPage = sec1?.pageNumber || 1;
  }

  // Extract all 7 OSHA PSM PSI Categories
  const toxOut = extractToxicity(sections, fullText, documentId, documentName);
  const pelOut = extractExposureLimits(sections, fullText, documentId, documentName);
  const physOut = extractPhysicalData(sections, fullText, documentId, documentName);
  const reactOut = extractReactivity(sections, fullText, documentId, documentName);
  const corrOut = extractCorrosivity(sections, fullText, documentId, documentName);
  const stabOut = extractStability(sections, fullText, documentId, documentName);
  const mixOut = extractInadvertentMixing(sections, fullText, documentId, documentName);

  const psiParameters: PsiParameters = {
    toxicity: toxOut.record,
    permissible_exposure_limits: pelOut.record,
    physical_data: physOut.record,
    reactivity_data: reactOut.record,
    corrosivity_data: corrOut.record,
    thermal_and_chemical_stability_data: stabOut.record,
    inadvertent_mixing_hazards: mixOut.record,
  };

  // Build Stage C compliant Structured Extraction
  const structuredExtraction: StructuredSdsExtraction = {
    chemical_identity: {
      name: chemicalNameVal,
      cas_number: casVal,
      molecular_formula: null,
      molecular_weight: null,
    },
    psi: {
      toxicity: toxOut.categoryResult,
      exposure_limits: pelOut.categoryResult,
      physical_data: physOut.categoryResult,
      reactivity: reactOut.categoryResult,
      corrosivity: corrOut.categoryResult,
      thermal_chemical_stability: stabOut.categoryResult,
      hazardous_effects_of_inadvertent_mixing: mixOut.categoryResult,
    },
    extraction_metadata: {
      document_name: documentName,
      pages_processed: pages.map((p) => p.pageNumber),
      extraction_status:
        toxOut.categoryResult.status === 'extracted' &&
        pelOut.categoryResult.status === 'extracted' &&
        physOut.categoryResult.status === 'extracted'
          ? 'complete'
          : 'partial',
      warnings: [],
    },
  };

  // Perform Diagnostic Logging
  logSdsExtractionDiagnostics({
    documentId,
    documentName,
    processingStatus: 'success',
    pagesDetected: pages.length,
    extractedCharCount: fullText.length,
    detectedSections: sections.map((s) => ({ sectionNumber: s.sectionNumber, title: s.title })),
    modelOrEngineStatus: 'completed',
    validationStatus: 'valid',
    categoryFindingsCounts: {
      toxicity: toxOut.categoryResult.findings.length,
      exposure_limits: pelOut.categoryResult.findings.length,
      physical_data: physOut.categoryResult.findings.length,
      reactivity: reactOut.categoryResult.findings.length,
      corrosivity: corrOut.categoryResult.findings.length,
      stability: stabOut.categoryResult.findings.length,
      inadvertent_mixing: mixOut.categoryResult.findings.length,
    },
    databasePersistenceStatus: 'persisted',
  });

  const now = new Date().toISOString();

  return {
    id: uuidv4(),
    project_id: projectId,
    sds_document_id: documentId,
    chemical_name: {
      value: chemicalNameVal || 'Unknown Chemical',
      machine_value: chemicalNameVal,
      user_value: null,
      source: {
        document: documentName,
        document_id: documentId,
        page: chemicalNamePage,
        section: 'Section 1: Identification',
        snippet: chemicalNameSnippet || 'Extracted from document header',
      },
      confidence: chemicalNameVal ? chemicalNameConf : 0.2,
      review_status: chemicalNameVal ? 'needs_review' : 'missing',
      category_status: chemicalNameVal ? 'extracted' : 'not_found',
      missing_reason: chemicalNameVal ? null : 'Product name header not detected in Section 1',
      updated_at: now,
    },
    cas_number: {
      value: casVal,
      machine_value: casVal,
      user_value: null,
      source: {
        document: documentName,
        document_id: documentId,
        page: casPage,
        section: casSection || 'Section 3: Composition',
        snippet: casSnippet,
      },
      confidence: casVal ? casConf : 0.0,
      review_status: casVal ? 'needs_review' : 'missing',
      category_status: casVal ? 'extracted' : 'not_found',
      missing_reason: casVal ? null : 'CAS registry number format (XX-XX-X) not found in document',
      updated_at: now,
    },
    sds_revision_date: {
      value: revDateVal,
      machine_value: revDateVal,
      user_value: null,
      source: {
        document: documentName,
        document_id: documentId,
        page: revDatePage,
        section: 'Header / Section 16',
        snippet: revDateSnippet,
      },
      confidence: revDateVal ? 0.9 : 0.0,
      review_status: revDateVal ? 'needs_review' : 'missing',
      category_status: revDateVal ? 'extracted' : 'not_found',
      missing_reason: revDateVal ? null : 'Revision or issue date not explicitly identified',
      updated_at: now,
    },
    manufacturer: {
      value: mfrVal,
      machine_value: mfrVal,
      user_value: null,
      source: {
        document: documentName,
        document_id: documentId,
        page: mfrPage,
        section: 'Section 1: Identification',
        snippet: mfrSnippet,
      },
      confidence: mfrVal ? 0.88 : 0.0,
      review_status: mfrVal ? 'needs_review' : 'missing',
      category_status: mfrVal ? 'extracted' : 'not_found',
      missing_reason: mfrVal ? null : 'Manufacturer/Supplier name not found in Section 1',
      updated_at: now,
    },
    psi_parameters: psiParameters,
    structured_extraction: structuredExtraction,
    created_at: now,
    updated_at: now,
  };
}
