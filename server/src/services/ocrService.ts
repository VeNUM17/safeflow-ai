import { BoundingBox } from '../types';
import { PidConventionProfile } from '../types/conventionProfile';
import { getConventionProfile } from './pidConventionService';

export interface RecognizedTextToken {
  id: string;
  text: string;
  cleanedText: string;
  bbox: BoundingBox;
  confidence: number;
  tokenType: 'equipment_tag' | 'line_tag' | 'instrument_tag' | 'flow_spec' | 'off_page_connector' | 'general_text';
  tagMatches?: {
    tag: string;
    type: string;
  };
}

export interface OcrRecognitionResult {
  tokens: RecognizedTextToken[];
  equipmentTags: { tag: string; type: string; bbox: BoundingBox; confidence: number }[];
  lineTags: { tag: string; diameter: string; spec: string; bbox: BoundingBox; confidence: number }[];
  instrumentTags: { tag: string; loop: string; bbox: BoundingBox; confidence: number }[];
  offPageConnectors: { tag: string; targetSheet?: string; bbox: BoundingBox; confidence: number }[];
  flowAnnotations: { text: string; value: number | null; unit: string | null; bbox: BoundingBox }[];
}

const EQUIPMENT_TAG_REGEX = /\b(PG|TK|MX|AG|P|E|HX|HE|C|R|RX|V|D|DR|T|K|CP|S|SP|SEP|HV|XV|DV|NRV|SDV|BDV|BOV|NV|BV|CV|MV|MY)-([0-9]{3,5}[A-Z]?)\b/i;
const INSTRUMENT_TAG_REGEX = /\b(FIT|FIC|FT|FE|FO|FI|FAL|FAH|TIT|LIT|PIT|AIT|TI|LI|PI|PT|TT|LT|LG|PIC|LIC|PCV|FCV|TCV|LCV|PRV|PSV|SIS|LS|HS|SV)-([0-9]{3,5}[A-Z]?)\b/i;
const LINE_TAG_REGEX = /\b([0-9\.\/]+)"?-([A-Z0-9]{2,6})-([0-9]{3,5}[A-Z]?)(?:-([A-Z0-9]+))?\b/i;
const SIMPLE_LINE_REGEX = /\b(L|PL|LINE|SL|SIG|IL)-([0-9]{3,5}[A-Z]?)\b/i;
const FLOW_ANNOTATION_REGEX = /(?:flow|nor|dsgn|rate)?\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)\s*(m3\/h|kg\/h|gpm|lb\/h|kmol\/h)/i;

/**
 * Normalizes common OCR misreadings of industrial equipment tags
 */
export function normalizeOcrTag(rawTag: string): string {
  let tag = rawTag.toUpperCase();
  if (tag.startsWith('BOV-')) tag = tag.replace('BOV-', 'BDV-');
  if (tag.startsWith('MY-')) tag = tag.replace('MY-', 'MV-');
  return tag;
}

/**
 * Recognizes and classifies text tokens from drawing text streams or OCR engines.
 * Dynamically adapts to the specified PidConventionProfile without hardcoding project-specific tags.
 */
export function recognizeDrawingText(
  textElements: { text: string; bbox: BoundingBox; confidence?: number }[],
  profile?: PidConventionProfile
): OcrRecognitionResult {
  const activeProfile = profile || getConventionProfile();

  // Compile regexes from profile
  const eqRegexes = activeProfile.tagPatterns.equipment.map((p) => new RegExp(p, 'i'));
  const lineRegexes = activeProfile.tagPatterns.pipingLine.map((p) => new RegExp(p, 'i'));
  const instRegexes = activeProfile.tagPatterns.instrument.map((p) => new RegExp(p, 'i'));
  const opcRegexes = (activeProfile.tagPatterns.offPageConnector || []).map((p) => new RegExp(p, 'i'));

  const result: OcrRecognitionResult = {
    tokens: [],
    equipmentTags: [],
    lineTags: [],
    instrumentTags: [],
    offPageConnectors: [],
    flowAnnotations: [],
  };

  let idx = 0;
  for (const elem of textElements) {
    idx++;
    const raw = elem.text.trim();
    if (!raw) continue;

    const conf = elem.confidence ?? 0.88;
    let tokenType: RecognizedTextToken['tokenType'] = 'general_text';

    // 1. Check Equipment Tag
    let eqMatch: RegExpMatchArray | null = null;
    for (const r of eqRegexes) {
      eqMatch = raw.match(r);
      if (eqMatch) break;
    }
    if (!eqMatch) {
      eqMatch = raw.match(EQUIPMENT_TAG_REGEX);
    }
    if (eqMatch) {
      tokenType = 'equipment_tag';
      const tag = normalizeOcrTag(eqMatch[0]);
      const typePrefix = tag.split('-')[0];
      result.equipmentTags.push({
        tag,
        type: typePrefix,
        bbox: elem.bbox,
        confidence: conf,
      });
    }

    // 2. Check Instrument Tag
    let instMatch: RegExpMatchArray | null = null;
    if (tokenType === 'general_text') {
      for (const r of instRegexes) {
        instMatch = raw.match(r);
        if (instMatch) break;
      }
      if (!instMatch) {
        instMatch = raw.match(INSTRUMENT_TAG_REGEX);
      }
      if (instMatch) {
        tokenType = 'instrument_tag';
        const tag = normalizeOcrTag(instMatch[0]);
        result.instrumentTags.push({
          tag,
          loop: instMatch[2] || instMatch[1] || '101',
          bbox: elem.bbox,
          confidence: conf,
        });
      }
    }

    // 3. Check Off-Page Connector (OPC)
    if (tokenType === 'general_text') {
      for (const r of opcRegexes) {
        const opcMatch = raw.match(r);
        if (opcMatch) {
          tokenType = 'off_page_connector';
          result.offPageConnectors.push({
            tag: opcMatch[0].toUpperCase(),
            targetSheet: opcMatch[2] || opcMatch[1],
            bbox: elem.bbox,
            confidence: conf,
          });
          break;
        }
      }
    }

    // 4. Check Line Tag
    if (tokenType === 'general_text') {
      let lineMatch: RegExpMatchArray | null = null;
      for (const r of lineRegexes) {
        lineMatch = raw.match(r);
        if (lineMatch) break;
      }
      if (!lineMatch) {
        lineMatch = raw.match(LINE_TAG_REGEX) || raw.match(SIMPLE_LINE_REGEX);
      }
      if (lineMatch) {
        tokenType = 'line_tag';
        const matchedTag = lineMatch[0].toUpperCase();
        result.lineTags.push({
          tag: matchedTag,
          diameter: lineMatch[1] ? (lineMatch[1].includes('"') ? lineMatch[1] : `${lineMatch[1]}"`) : '2"',
          spec: lineMatch[4] || 'CS',
          bbox: elem.bbox,
          confidence: conf,
        });
      }
    }

    // 5. Check Flow Annotation
    const flowMatch = raw.match(FLOW_ANNOTATION_REGEX);
    if (flowMatch) {
      tokenType = 'flow_spec';
      result.flowAnnotations.push({
        text: raw,
        value: parseFloat(flowMatch[1]),
        unit: flowMatch[2],
        bbox: elem.bbox,
      });
    }

    result.tokens.push({
      id: `tok-${idx}`,
      text: raw,
      cleanedText: raw.replace(/[^a-zA-Z0-9\-\.\"\s#]/g, ''),
      bbox: elem.bbox,
      confidence: conf,
      tokenType,
    });
  }

  return result;
}
