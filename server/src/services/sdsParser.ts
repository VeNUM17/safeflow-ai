import { v4 as uuidv4 } from 'uuid';
import {
  ChemicalRecord,
  PsiFieldRecord,
  PsiParameters,
  FieldSource,
  ReviewStatus,
} from '../types';
import { ExtractedDocumentContent } from './pdfExtractor';

// GHS Section Regexes
const GHS_SECTION_PATTERNS = [
  { sectionNumber: 1, title: 'Identification', regex: /(?:SECTION|SEC\.?)\s*1\s*[:\.\-–]?\s*(?:IDENTIFICATION|CHEMICAL PRODUCT|PRODUCT AND COMPANY)/i },
  { sectionNumber: 2, title: 'Hazard(s) Identification', regex: /(?:SECTION|SEC\.?)\s*2\s*[:\.\-–]?\s*(?:HAZARD\(?S\)?\s*IDENTIFICATION|HAZARDS?\s*IDENTIFICATION)/i },
  { sectionNumber: 3, title: 'Composition / Ingredients', regex: /(?:SECTION|SEC\.?)\s*3\s*[:\.\-–]?\s*(?:COMPOSITION|INGREDIENTS|INFORMATION ON INGREDIENTS)/i },
  { sectionNumber: 4, title: 'First-Aid Measures', regex: /(?:SECTION|SEC\.?)\s*4\s*[:\.\-–]?\s*(?:FIRST[\s\-]AID\s*MEASURES)/i },
  { sectionNumber: 5, title: 'Fire-Fighting Measures', regex: /(?:SECTION|SEC\.?)\s*5\s*[:\.\-–]?\s*(?:FIRE[\s\-]FIGHTING\s*MEASURES)/i },
  { sectionNumber: 6, title: 'Accidental Release Measures', regex: /(?:SECTION|SEC\.?)\s*6\s*[:\.\-–]?\s*(?:ACCIDENTAL\s*RELEASE\s*MEASURES)/i },
  { sectionNumber: 7, title: 'Handling and Storage', regex: /(?:SECTION|SEC\.?)\s*7\s*[:\.\-–]?\s*(?:HANDLING\s*AND\s*STORAGE)/i },
  { sectionNumber: 8, title: 'Exposure Controls/Personal Protection', regex: /(?:SECTION|SEC\.?)\s*8\s*[:\.\-–]?\s*(?:EXPOSURE\s*CONTROLS|PERSONAL\s*PROTECTION)/i },
  { sectionNumber: 9, title: 'Physical and Chemical Properties', regex: /(?:SECTION|SEC\.?)\s*9\s*[:\.\-–]?\s*(?:PHYSICAL\s*AND\s*CHEMICAL\s*PROPERTIES|PHYSICAL\s*DATA)/i },
  { sectionNumber: 10, title: 'Stability and Reactivity', regex: /(?:SECTION|SEC\.?)\s*10\s*[:\.\-–]?\s*(?:STABILITY\s*AND\s*REACTIVITY)/i },
  { sectionNumber: 11, title: 'Toxicological Information', regex: /(?:SECTION|SEC\.?)\s*11\s*[:\.\-–]?\s*(?:TOXICOLOGICAL\s*INFORMATION|TOXICITY)/i },
  { sectionNumber: 12, title: 'Ecological Information', regex: /(?:SECTION|SEC\.?)\s*12\s*[:\.\-–]?\s*(?:ECOLOGICAL\s*INFORMATION)/i },
  { sectionNumber: 13, title: 'Disposal Considerations', regex: /(?:SECTION|SEC\.?)\s*13\s*[:\.\-–]?\s*(?:DISPOSAL\s*CONSIDERATIONS)/i },
  { sectionNumber: 14, title: 'Transport Information', regex: /(?:SECTION|SEC\.?)\s*14\s*[:\.\-–]?\s*(?:TRANSPORT\s*INFORMATION)/i },
  { sectionNumber: 15, title: 'Regulatory Information', regex: /(?:SECTION|SEC\.?)\s*15\s*[:\.\-–]?\s*(?:REGULATORY\s*INFORMATION)/i },
  { sectionNumber: 16, title: 'Other Information', regex: /(?:SECTION|SEC\.?)\s*16\s*[:\.\-–]?\s*(?:OTHER\s*INFORMATION|REVISION\s*DATE)/i },
];

interface ExtractedSection {
  sectionNumber: number;
  title: string;
  pageNumber: number;
  text: string;
}

// Slice document pages into sections
function splitIntoSections(pages: { pageNumber: number; text: string }[]): ExtractedSection[] {
  const sections: ExtractedSection[] = [];
  let currentSec: ExtractedSection | null = null;
  
  for (const page of pages) {
    const lines = page.text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let matchedHeader: { sectionNumber: number; title: string } | null = null;
      for (const pattern of GHS_SECTION_PATTERNS) {
        if (pattern.regex.test(line)) {
          matchedHeader = pattern;
          break;
        }
      }

      if (matchedHeader) {
        currentSec = {
          sectionNumber: matchedHeader.sectionNumber,
          title: matchedHeader.title,
          pageNumber: page.pageNumber,
          text: line,
        };
        sections.push(currentSec);
      } else if (currentSec) {
        currentSec.text += '\n' + line;
      }
    }
  }

  return sections;
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
    missing_reason: reason,
    updated_at: new Date().toISOString(),
  };
}

function truncateSnippet(text: string, maxLen = 300): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxLen) return clean;
  return clean.substring(0, maxLen) + '...';
}

export function parseSdsContent(
  docContent: ExtractedDocumentContent,
  documentId: string,
  documentName: string,
  projectId: string
): ChemicalRecord {
  const { text: fullText, pages } = docContent;
  const sections = splitIntoSections(pages);

  const getSection = (num: number) => sections.find((s) => s.sectionNumber === num);

  // 1. Chemical Name
  let chemicalNameVal: string | null = null;
  let chemicalNamePage = 1;
  let chemicalNameSnippet: string | null = null;
  let chemicalNameConf = 0.5;

  const sec1 = getSection(1);
  const sec1Text = sec1 ? sec1.text : pages[0]?.text || '';
  
  // Look for product/chemical name patterns
  const namePatterns = [
    /(?:Product\s*(?:Identifier|Name)|Chemical\s*Name|Substance\s*Name|Trade\s*Name)\s*[:\-–]\s*([^\r\n]{2,80})/i,
    /(?:Common\s*Name|Synonyms?)\s*[:\-–]\s*([^\r\n]{2,80})/i,
  ];

  for (const pat of namePatterns) {
    const match = sec1Text.match(pat);
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
    const firstLines = pages[0].text.split('\n').map(l => l.trim()).filter(l => l.length > 2 && l.length < 60);
    for (const line of firstLines) {
      if (!/safety\s*data\s*sheet|sds|revision|date|page|section/i.test(line)) {
        chemicalNameVal = line;
        chemicalNameSnippet = line;
        chemicalNamePage = 1;
        chemicalNameConf = 0.6;
        break;
      }
    }
  }

  // 2. CAS Number (format \b\d{2,7}-\d{2}-\d\b)
  let casVal: string | null = null;
  let casPage: number | null = null;
  let casSection: string | null = null;
  let casSnippet: string | null = null;
  let casConf = 0.0;

  const casPattern = /\b([0-9]{2,7}-[0-9]{2}-[0-9])\b/;
  const sec3 = getSection(3);
  
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
  const revDatePattern = /(?:Revision\s*Date|Issue\s*Date|Date\s*of\s*(?:Issue|Preparation|Revision))\s*[:\-–]?\s*([^\r\n]{4,35})/i;
  const revMatch = fullText.match(revDatePattern);
  if (revMatch && revMatch[1]) {
    revDateVal = revMatch[1].split(/[\r\n]/)[0].trim();
    revDateSnippet = truncateSnippet(revMatch[0]);
  }

  // 4. Manufacturer
  let mfrVal: string | null = null;
  let mfrSnippet: string | null = null;
  let mfrPage = 1;
  const mfrPattern = /(?:Manufacturer|Supplier|Company|Distributor)\s*[:\-–]\s*([^\r\n]{3,100})/i;
  const mfrMatch = (sec1Text || fullText).match(mfrPattern);
  if (mfrMatch && mfrMatch[1]) {
    mfrVal = mfrMatch[1].split(/[\r\n]/)[0].trim();
    mfrSnippet = truncateSnippet(mfrMatch[0]);
    mfrPage = sec1?.pageNumber || 1;
  }

  // Helper to extract specific PSI section
  const extractSectionField = (
    secNum: number,
    fieldKeywords: RegExp[],
    defaultReason: string
  ): PsiFieldRecord => {
    const sec = getSection(secNum);
    if (!sec || !sec.text.trim()) {
      return createMissingField(
        documentId,
        documentName,
        `Section ${secNum}`,
        defaultReason
      );
    }

    const lines = sec.text.split('\n').map(l => l.trim()).filter(Boolean);
    const matchedLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const kw of fieldKeywords) {
        if (kw.test(line)) {
          matchedLines.push(lines.slice(i, Math.min(lines.length, i + 3)).join(' | '));
          break;
        }
      }
    }

    if (matchedLines.length > 0) {
      const snippet = truncateSnippet(matchedLines.join('\n'));
      return {
        value: snippet,
        machine_value: snippet,
        user_value: null,
        source: {
          document: documentName,
          document_id: documentId,
          page: sec.pageNumber,
          section: `Section ${secNum}: ${sec.title}`,
          snippet: truncateSnippet(sec.text, 400),
        },
        confidence: 0.92,
        review_status: 'needs_review',
        updated_at: new Date().toISOString(),
      };
    }

    if (sec.text.length > 30) {
      const snippet = truncateSnippet(sec.text, 350);
      return {
        value: snippet,
        machine_value: snippet,
        user_value: null,
        source: {
          document: documentName,
          document_id: documentId,
          page: sec.pageNumber,
          section: `Section ${secNum}: ${sec.title}`,
          snippet,
        },
        confidence: 0.75,
        review_status: 'needs_review',
        updated_at: new Date().toISOString(),
      };
    }

    return createMissingField(
      documentId,
      documentName,
      `Section ${secNum}`,
      defaultReason
    );
  };

  // 1. Toxicity Information (Section 11)
  const toxicityRecord = extractSectionField(
    11,
    [/acute\s*toxicity/i, /lc50/i, /ld50/i, /carcinogen/i, /inhalation/i, /oral/i, /dermal/i, /toxic/i],
    'No toxicity data found in Section 11 of the Safety Data Sheet.'
  );

  // 2. Permissible Exposure Limits (Section 8)
  const pelRecord = extractSectionField(
    8,
    [/osha\s*pel/i, /pel\b/i, /acgih\s*tlv/i, /tlv\b/i, /niosh\s*rel/i, /rel\b/i, /stel\b/i, /twa\b/i, /idlh\b/i, /ppm\b/i, /mg\/m3/i],
    'No permissible exposure limits (OSHA PEL / ACGIH TLV / NIOSH REL) stated in Section 8.'
  );

  // 3. Physical Data (Section 9)
  const physicalRecord = extractSectionField(
    9,
    [/boiling\s*point/i, /melting\s*point/i, /vapor\s*pressure/i, /vapor\s*density/i, /flash\s*point/i, /specific\s*gravity/i, /density/i, /appearance/i, /odor/i, /flammab/i],
    'No physical data (boiling point, vapor pressure, etc.) found in Section 9.'
  );

  // 4. Reactivity Data (Section 10)
  const reactivityRecord = extractSectionField(
    10,
    [/reactiv/i, /hazardous\s*reaction/i, /conditions\s*to\s*avoid/i, /polymeriz/i],
    'No reactivity data found in Section 10.'
  );

  // 5. Corrosivity Data (Checked across Section 2, 9, 10, or general text)
  let corrosivityRecord: PsiFieldRecord;
  const sec9 = getSection(9);
  const sec2 = getSection(2);
  const sec10 = getSection(10);
  const combinedCorrosiveText = [
    sec2?.text || '',
    sec9?.text || '',
    sec10?.text || '',
    fullText,
  ].join('\n');

  const corrosiveLines = combinedCorrosiveText
    .split('\n')
    .map(l => l.trim())
    .filter(l => 
      /corros|skin\s*corr|eye\s*damage|burns|ph\s*[:\-–]?\s*[0-9\.]+|corrodes?\s+(?:copper|brass|zinc|metal|steel|aluminum)/i.test(l)
    );

  if (corrosiveLines.length > 0) {
    const snippet = truncateSnippet(corrosiveLines.slice(0, 3).join(' | '));
    corrosivityRecord = {
      value: snippet,
      machine_value: snippet,
      user_value: null,
      source: {
        document: documentName,
        document_id: documentId,
        page: sec2?.pageNumber || sec9?.pageNumber || 1,
        section: 'Section 2 / Section 9: Corrosivity & Hazards',
        snippet,
      },
      confidence: 0.9,
      review_status: 'needs_review',
      updated_at: new Date().toISOString(),
    };
  } else {
    corrosivityRecord = createMissingField(
      documentId,
      documentName,
      'Sections 2, 9, 10',
      'No explicit corrosivity classification, metal corrosion, or pH data documented.'
    );
  }

  // 6. Thermal and Chemical Stability Data (Section 10)
  const stabilityRecord = extractSectionField(
    10,
    [/thermal\s*decompos/i, /stable\s*under/i, /chemical\s*stability/i, /decompos/i, /hazardous\s*decomposition/i],
    'No thermal and chemical stability data found in Section 10.'
  );

  // 7. Hazardous Effects of Inadvertent Mixing (Section 10 - Incompatible Materials)
  let inadvertentMixingRecord: PsiFieldRecord;
  if (sec10 && sec10.text) {
    const lines = sec10.text.split('\n').filter(l => 
      /incompatib|inadvertent|bleach|acids?|bases?|oxidiz|reacts?\s*violently|toxic\s*gas/i.test(l)
    );
    if (lines.length > 0) {
      const snippet = truncateSnippet(lines.join(' | '));
      inadvertentMixingRecord = {
        value: snippet,
        machine_value: snippet,
        user_value: null,
        source: {
          document: documentName,
          document_id: documentId,
          page: sec10.pageNumber,
          section: 'Section 10: Incompatible Materials & Inadvertent Mixing',
          snippet: truncateSnippet(sec10.text, 350),
        },
        confidence: 0.94,
        review_status: 'needs_review',
        updated_at: new Date().toISOString(),
      };
    } else {
      inadvertentMixingRecord = extractSectionField(
        10,
        [/incompatib/i, /materials\s*to\s*avoid/i],
        'No incompatible materials or inadvertent mixing hazards identified in Section 10.'
      );
    }
  } else {
    inadvertentMixingRecord = createMissingField(
      documentId,
      documentName,
      'Section 10',
      'Section 10 (Stability and Reactivity / Incompatible Materials) not present in document.'
    );
  }

  const psiParameters: PsiParameters = {
    toxicity: toxicityRecord,
    permissible_exposure_limits: pelRecord,
    physical_data: physicalRecord,
    reactivity_data: reactivityRecord,
    corrosivity_data: corrosivityRecord,
    thermal_and_chemical_stability_data: stabilityRecord,
    inadvertent_mixing_hazards: inadvertentMixingRecord,
  };

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
      missing_reason: mfrVal ? null : 'Manufacturer/Supplier name not found in Section 1',
      updated_at: now,
    },
    psi_parameters: psiParameters,
    created_at: now,
    updated_at: now,
  };
}
