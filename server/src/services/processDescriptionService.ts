import { v4 as uuidv4 } from 'uuid';
import {
  ProcessDescriptionExtraction,
  ProcessDescriptionRelationship,
  StreamFlowRates,
  StreamOperatingCondition,
} from '../types';

/**
 * Natural Language Process Description Understanding Engine.
 * Extracts equipment tags, process relationships (transfers, feeds, pumps, cooling, reactions),
 * chemicals, and operating parameters from user-provided process narratives.
 */
export function parseProcessDescription(
  projectId: string,
  descriptionText: string,
  knownDrawingTags: string[] = []
): ProcessDescriptionExtraction {
  const result: ProcessDescriptionExtraction = {
    id: `desc-${uuidv4().substring(0, 8)}`,
    project_id: projectId,
    raw_description: descriptionText,
    extracted_tags: [],
    missing_tags_in_drawing: [],
    relationships: [],
    feed_streams: [],
    mixing_operations: [],
    branches: [],
    extracted_at: new Date().toISOString(),
  };

  if (!descriptionText || !descriptionText.trim()) {
    return result;
  }

  const drawingTagSet = new Set(knownDrawingTags.map((t) => t.toUpperCase()));

  // 1. Extract all equipment and instrument tags via regex
  const TAG_REGEX = /\b([A-Z]{1,4}-[0-9]{3,4}[A-Z]?)\b/gi;
  const tagMatches = descriptionText.match(TAG_REGEX) || [];
  const uniqueTags = Array.from(new Set(tagMatches.map((t) => t.toUpperCase())));
  result.extracted_tags = uniqueTags;

  // Identify any tags mentioned in description that are absent from drawing
  for (const tag of uniqueTags) {
    if (drawingTagSet.size > 0 && !drawingTagSet.has(tag)) {
      result.missing_tags_in_drawing.push(tag);
    }
  }

  // 2. Split into sentences and analyze sequential & causal relationships
  const sentences = descriptionText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const CHEMICAL_KEYWORDS = [
    'sodium hydroxide',
    'naoh',
    'ammonia',
    'nh3',
    'water',
    'cooling water',
    'steam',
    'sulfuric acid',
    'h2so4',
    'bleach',
    'sodium hypochlorite',
    'nitrogen',
    'hydrocarbon',
    'crude',
    'feedstock',
  ];

  for (const sentence of sentences) {
    const sLower = sentence.toLowerCase();

    // Check chemicals mentioned
    let detectedChem: string | null = null;
    for (const chem of CHEMICAL_KEYWORDS) {
      if (sLower.includes(chem)) {
        detectedChem = chem;
        break;
      }
    }

    // Check flow rate if present
    const flowMatch = sentence.match(/([0-9]+(?:\.[0-9]+)?)\s*(m3\/h|kg\/h|gpm|lb\/h|t\/h)/i);
    let flowRates: Partial<StreamFlowRates> | null = null;
    if (flowMatch) {
      flowRates = {
        normal: parseFloat(flowMatch[1]),
        unit: flowMatch[2],
        basis: flowMatch[2].includes('kg') || flowMatch[2].includes('lb') ? 'mass' : 'volumetric',
      };
    }

    // Check pressure or temperature
    let opCond: {
      pressure?: number;
      pressure_unit?: string;
      temperature?: number;
      temperature_unit?: string;
    } | null = null;
    const pMatch = sentence.match(/([0-9]+(?:\.[0-9]+)?)\s*(bar|barg|psig|psi|kpa)/i);
    const tMatch = sentence.match(/([0-9]+(?:\.[0-9]+)?)\s*(°C|C|deg\s*C|°F|F)/i);
    if (pMatch || tMatch) {
      opCond = {
        pressure: pMatch ? parseFloat(pMatch[1]) : undefined,
        pressure_unit: pMatch ? pMatch[2] : undefined,
        temperature: tMatch ? parseFloat(tMatch[1]) : undefined,
        temperature_unit: tMatch ? tMatch[2] : undefined,
      };
    }

    // Tags in this specific sentence
    const sentTags = Array.from(new Set((sentence.match(TAG_REGEX) || []).map((t) => t.toUpperCase())));

    // Scenario A: Transfer / Pump from Source to Destination (e.g. "Pump P-101 transfers the solution from TK-101 to MX-101")
    if (sentTags.length >= 2) {
      // Find transfer or feed indicators
      let opType: ProcessDescriptionRelationship['operation_type'] = 'transfer';
      if (/pump|transfers/i.test(sentence)) opType = 'pump';
      else if (/cool|heat exchanger|chiller/i.test(sentence)) opType = 'cooling';
      else if (/heat|boiler|heater/i.test(sentence)) opType = 'heating';
      else if (/react|cataly|reactor/i.test(sentence)) opType = 'reaction';
      else if (/mix|blend/i.test(sentence)) opType = 'mixing';

      for (let i = 0; i < sentTags.length - 1; i++) {
        const src = sentTags[i];
        const dest = sentTags[i + 1];

        result.relationships.push({
          id: `rel-${uuidv4().substring(0, 8)}`,
          source_tag: src,
          destination_tag: dest,
          operation_type: opType,
          chemical_name: detectedChem,
          stream_label: detectedChem ? `${detectedChem} Stream` : `Process Stream ${src} -> ${dest}`,
          flow_rates: flowRates,
          operating_conditions: opCond,
          supporting_sentence: sentence,
          confidence: 0.9,
        });
      }
    }

    // Scenario B: External feed (e.g. "Water is supplied through a separate line and joins the sodium hydroxide stream in MX-101")
    if (/supplied|joins|feed|inlet/i.test(sentence) && sentTags.length === 1) {
      const dest = sentTags[0];
      const feedMaterial = detectedChem || 'Fresh Feed';
      result.feed_streams.push({
        source: `${feedMaterial} Feed Source`,
        destination: dest,
        material: feedMaterial,
      });

      result.relationships.push({
        id: `rel-${uuidv4().substring(0, 8)}`,
        source_tag: `${feedMaterial} Feed`,
        destination_tag: dest,
        operation_type: 'feed',
        chemical_name: detectedChem,
        stream_label: `${feedMaterial} Supply Line`,
        flow_rates: flowRates,
        operating_conditions: opCond,
        supporting_sentence: sentence,
        confidence: 0.85,
      });
    }

    // Scenario C: Mixing operation
    if (/joins|mix|blend|converge/i.test(sentence) && sentTags.length >= 1) {
      const dest = sentTags[sentTags.length - 1];
      const sources = sentTags.slice(0, -1);
      result.mixing_operations.push({
        destination: dest,
        converging_sources: sources.length > 0 ? sources : ['External Feed Stream'],
      });
    }
  }

  return result;
}
