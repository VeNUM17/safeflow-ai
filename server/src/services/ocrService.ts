import { BoundingBox } from '../types';

export interface RecognizedTextToken {
  id: string;
  text: string;
  cleanedText: string;
  bbox: BoundingBox;
  confidence: number;
  tokenType: 'equipment_tag' | 'line_tag' | 'instrument_tag' | 'flow_spec' | 'general_text';
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
 */
export function recognizeDrawingText(
  textElements: { text: string; bbox: BoundingBox; confidence?: number }[]
): OcrRecognitionResult {
  const result: OcrRecognitionResult = {
    tokens: [],
    equipmentTags: [],
    lineTags: [],
    instrumentTags: [],
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
    const eqMatch = raw.match(EQUIPMENT_TAG_REGEX);
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
    const instMatch = raw.match(INSTRUMENT_TAG_REGEX);
    if (instMatch && tokenType === 'general_text') {
      tokenType = 'instrument_tag';
      const tag = normalizeOcrTag(instMatch[0]);
      result.instrumentTags.push({
        tag,
        loop: instMatch[2],
        bbox: elem.bbox,
        confidence: conf,
      });
    }

    // 3. Check Line Tag
    const lineMatch = raw.match(LINE_TAG_REGEX);
    const simpleLineMatch = raw.match(SIMPLE_LINE_REGEX);
    if ((lineMatch || simpleLineMatch) && tokenType === 'general_text') {
      tokenType = 'line_tag';
      const matchedTag = (lineMatch ? lineMatch[0] : simpleLineMatch![0]).toUpperCase();
      result.lineTags.push({
        tag: matchedTag,
        diameter: lineMatch ? (lineMatch[1] ? `${lineMatch[1]}"` : '2"') : '2"',
        spec: lineMatch ? (lineMatch[4] || 'CS') : 'CS',
        bbox: elem.bbox,
        confidence: conf,
      });
    }

    // 4. Check Flow Annotation
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
