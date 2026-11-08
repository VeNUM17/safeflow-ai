import { v4 as uuidv4 } from 'uuid';
import {
  DocumentCategory,
  EngineeringPhilosophyRule,
  PhilosophyExtractionResult,
  SparingPhilosophy,
  DesignMarginRule,
  ShutdownHierarchyLevel,
  SafeOperatingLimitRule,
  EnvironmentalDesignLimits,
} from '../types';
import { ExtractedDocumentContent } from './pdfExtractor';

// Regular expressions for tag and rule detection
const EQUIPMENT_TAG_REGEX = /\b([A-Z]{1,4}-\d{3,5}[A-Z]?)\b/g;
const INSTRUMENT_OR_VALVE_REGEX = /\b([A-Z]{2,4}-(?:\d{3,5}|LS-\d{3,5}|[A-Z0-9]+))\b/g;
const NON_EQUIPMENT_TAG_PREFIXES = /^(I|INT|PT|TT|LT|FT|PSHH|LSHH|TSHH|LSLL|PSLL|PIC|LIC|TIC|FIC|PSV|BDV|XV|SDV|PCV|LCV|TCV|FCV|SIS|ESD)-/i;
const SIL_REGEX = /\bSIL[- ]?([1-4])\b/i;
const FAIL_SAFE_FC_REGEX = /\b(fail[- ]?closed|fail[- ]?to[- ]?close|FC)\b/i;
const FAIL_SAFE_FO_REGEX = /\b(fail[- ]?open|fail[- ]?to[- ]?open|FO)\b/i;
const FAIL_SAFE_FL_REGEX = /\b(fail[- ]?locked|fail[- ]?in[- ]?place|FL)\b/i;
const NUMERIC_SETPOINT_REGEX = /\b(-?\d+(?:\.\d+)?)\s*(barg?|psig?|kpa|mpa|bar|psi|°c|c|°f|f|%|rpm|kg\/h|m3\/h|sm3\/d|mmscfd)\b/i;
const TBD_REGEX = /\b(tbd|to be determined|provisional|pending|tbc|hold)\b/i;

/**
 * Extracts engineering philosophy rules, interlocks, design margins,
 * sparing configurations, shutdown hierarchies, and safe operating limits
 * from Basis of Design, Design Philosophy, Control Philosophy, and ESD Philosophy documents.
 */
export function parsePhilosophyDocument(
  content: ExtractedDocumentContent,
  documentId: string,
  documentName: string,
  projectId: string,
  category: DocumentCategory
): {
  extraction: PhilosophyExtractionResult;
  rules: EngineeringPhilosophyRule[];
} {
  const warnings: string[] = [];
  const rules: EngineeringPhilosophyRule[] = [];
  const sparingPhilosophies: SparingPhilosophy[] = [];
  const designMargins: DesignMarginRule[] = [];
  const shutdownHierarchy: ShutdownHierarchyLevel[] = [];
  const safeOperatingLimits: SafeOperatingLimitRule[] = [];
  const environmentalLimits: EnvironmentalDesignLimits = {};

  const fullText = content.text || '';
  if (!fullText.trim()) {
    warnings.push(`Document ${documentName} contained no extractable textual content.`);
    return {
      extraction: {
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        document_name: documentName,
        document_category: category,
        rules: [],
        sparing_philosophies: [],
        design_margins: [],
        shutdown_hierarchy: [],
        safe_operating_limits: [],
        total_rules_found: 0,
        extraction_warnings: warnings,
        extracted_at: new Date().toISOString(),
      },
      rules: [],
    };
  }

  // Iterate through pages or split by lines for location tracking
  const pages = content.pages && content.pages.length > 0
    ? content.pages
    : [{ pageNumber: 1, text: fullText }];

  for (const page of pages) {
    const pageLoc = `Page ${page.pageNumber}`;
    const pageText = page.text;
    const lines = pageText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

    // 1. Check for tabular Cause & Effect / Interlock lines
    parseTabularAndListRules(lines, pageLoc, projectId, documentId, documentName, category, rules);

    // 2. Parse narrative lines for interlocks, controls, limits, and relief
    parseNarrativeRules(lines, pageLoc, projectId, documentId, documentName, category, rules);

    // 3. Sparing Philosophy
    extractSparing(pageText, sparingPhilosophies);

    // 4. Design Margins
    extractDesignMargins(pageText, designMargins);

    // 5. Shutdown Hierarchy
    extractShutdownHierarchy(pageText, shutdownHierarchy);

    // 6. Safe Operating Limits (SOL)
    extractSafeOperatingLimits(pageText, safeOperatingLimits);

    // 7. Environmental Design Limits
    extractEnvironmentalLimits(pageText, environmentalLimits);
  }

  // Deduplicate rules by condition + action + equipment_tag
  const uniqueRules: EngineeringPhilosophyRule[] = [];
  const seenRuleKeys = new Set<string>();

  for (const r of rules) {
    const key = `${r.rule_type}|${r.equipment_tag || ''}|${r.loop_tag || ''}|${r.condition.toLowerCase()}|${r.action.toLowerCase()}`;
    if (!seenRuleKeys.has(key)) {
      seenRuleKeys.add(key);
      uniqueRules.push(r);
    }
  }

  // Deduplicate Sparing
  const uniqueSparing: SparingPhilosophy[] = [];
  const seenSparing = new Set<string>();
  for (const s of sparingPhilosophies) {
    const key = `${s.equipment_tag_or_type.toLowerCase()}|${s.configuration.toLowerCase()}`;
    if (!seenSparing.has(key)) {
      seenSparing.add(key);
      uniqueSparing.push(s);
    }
  }

  // Deduplicate Margins
  const uniqueMargins: DesignMarginRule[] = [];
  const seenMargins = new Set<string>();
  for (const m of designMargins) {
    const key = `${m.parameter.toLowerCase()}|${m.margin_value.toLowerCase()}`;
    if (!seenMargins.has(key)) {
      seenMargins.add(key);
      uniqueMargins.push(m);
    }
  }

  // Deduplicate Hierarchy
  const uniqueHierarchy: ShutdownHierarchyLevel[] = [];
  const seenHierarchy = new Set<string>();
  for (const h of shutdownHierarchy) {
    const key = h.level.toLowerCase();
    if (!seenHierarchy.has(key)) {
      seenHierarchy.add(key);
      uniqueHierarchy.push(h);
    }
  }

  // Deduplicate SOL
  const uniqueSOL: SafeOperatingLimitRule[] = [];
  const seenSOL = new Set<string>();
  for (const sol of safeOperatingLimits) {
    const key = `${sol.parameter.toLowerCase()}|${sol.equipment_tag || ''}|${sol.safe_upper_limit || ''}|${sol.safe_lower_limit || ''}`;
    if (!seenSOL.has(key)) {
      seenSOL.add(key);
      uniqueSOL.push(sol);
    }
  }

  const extractionResult: PhilosophyExtractionResult = {
    id: uuidv4(),
    project_id: projectId,
    document_id: documentId,
    document_name: documentName,
    document_category: category,
    rules: uniqueRules,
    sparing_philosophies: uniqueSparing,
    design_margins: uniqueMargins,
    shutdown_hierarchy: uniqueHierarchy,
    safe_operating_limits: uniqueSOL,
    environmental_limits: Object.keys(environmentalLimits).length > 0 ? environmentalLimits : undefined,
    total_rules_found: uniqueRules.length,
    extraction_warnings: warnings,
    extracted_at: new Date().toISOString(),
  };

  return {
    extraction: extractionResult,
    rules: uniqueRules,
  };
}

/**
 * Parses tabular Cause & Effect / Interlock lines
 */
function parseTabularAndListRules(
  lines: string[],
  location: string,
  projectId: string,
  documentId: string,
  documentName: string,
  category: DocumentCategory,
  rules: EngineeringPhilosophyRule[]
) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Markdown table row or pipe/tab delimited row
    if (line.includes('|') || line.includes('\t')) {
      const delimiter = line.includes('|') ? '|' : '\t';
      const parts = line.split(delimiter).map((p) => p.trim()).filter((p) => p.length > 0);

      // Skip header lines
      if (
        parts.some((p) => /cause|initiator|input|trigger/i.test(p)) &&
        parts.some((p) => /effect|action|output/i.test(p))
      ) {
        continue;
      }
      if (parts.some((p) => /^[-:]+$/.test(p))) {
        continue;
      }

      // Check if this looks like a cause and effect row (at least 2 columns)
      if (parts.length >= 2) {
        const fullRowText = parts.join(' | ');
        const hasRuleKeywords =
          /\b(esd|trip|interlock|close|open|shut|stop|depressur|isolat|modulat|alarm|high|low|pshh|lshh|tshh|lsll|psll)\b/i.test(
            fullRowText
          );

        if (hasRuleKeywords) {
          const conditionPart = parts[0] + (parts.length > 2 && !/trip|close|open|shut/i.test(parts[1]) ? ' ' + parts[1] : '');
          const actionPart = parts.length > 2
            ? parts.slice(conditionPart.includes(parts[1]) ? 2 : 1).join('; ')
            : parts[1];

          const parsedRule = createRuleFromText(
            conditionPart,
            actionPart,
            fullRowText,
            location,
            projectId,
            documentId,
            documentName,
            category
          );
          if (parsedRule) {
            rules.push(parsedRule);
          }
        }
      }
    }
  }
}

/**
 * Parses narrative lines for interlocks, controls, operating limits, and relief basis.
 */
function parseNarrativeRules(
  lines: string[],
  location: string,
  projectId: string,
  documentId: string,
  documentName: string,
  category: DocumentCategory,
  rules: EngineeringPhilosophyRule[]
) {
  for (const item of lines) {
    if (item.length < 15) continue;

    // 1. Interlock / Cause-Effect pattern: "On [condition], [action]" or "If [condition], [action]"
    const causeEffectMatch = item.match(
      /(?:on|if|upon|in the event of|when)\s+([^,;]+(?:high-high|high|low-low|low|failure|fire|leak|pressure|level|temperature|exceeds|drops|reaches)[^,;]*)[,;:]\s*(?:then\s+)?(initiate\s+[^.]+|(?:close|open|trip|shutdown|isolate|start|stop|depressurize|actuate)[^.]+)/i
    );

    if (causeEffectMatch) {
      const condition = causeEffectMatch[1].trim();
      const action = causeEffectMatch[2].trim();
      const rule = createRuleFromText(
        condition,
        action,
        item,
        location,
        projectId,
        documentId,
        documentName,
        category
      );
      if (rule) rules.push(rule);
      continue;
    }

    // 2. Explicit Interlock pattern: "Interlock [ID]: [Condition] triggers [Action]"
    const interlockMatch = item.match(
      /(?:interlock|permissive|safety trip)\s*([A-Z0-9\-_]+)?\s*[:\-]\s*([^.]+?(?:exceeds|reaches|drops|detected|fails)[^.]+?)(?:triggers?|initiates?|causes?|results in)\s*([^.]+)/i
    );

    if (interlockMatch) {
      const idOrLoop = interlockMatch[1];
      const condition = interlockMatch[2].trim();
      const action = interlockMatch[3].trim();
      const rule = createRuleFromText(
        condition,
        action,
        item,
        location,
        projectId,
        documentId,
        documentName,
        category
      );
      if (rule) {
        if (idOrLoop && !rule.loop_tag) rule.loop_tag = idOrLoop;
        rules.push(rule);
      }
      continue;
    }

    // 3. Control Loop pattern: "[Loop Tag / Pressure Control] maintains / modulates [Target] to [Setpoint]"
    const controlMatch = item.match(
      /(?:control loop|loop)?\s*([A-Z]{2,4}-\d{3,5})\s+(?:modulates?|controls?|regulates?|maintains?)\s+([^.]*)/i
    );

    if (controlMatch) {
      const loopTag = controlMatch[1];
      const desc = controlMatch[2].trim();
      const rule: EngineeringPhilosophyRule = {
        id: uuidv4(),
        project_id: projectId,
        source_document_id: documentId,
        source_document_name: documentName,
        source_category: category,
        rule_type: 'control_objective',
        loop_tag: loopTag,
        condition: `Process variable regulated by ${loopTag}`,
        action: `Modulates final control element: ${desc}`,
        is_confirmed_setpoint: NUMERIC_SETPOINT_REGEX.test(item) && !TBD_REGEX.test(item),
        verification_status: 'unverified',
        notes: item,
      };

      // Check equipment tag
      const eqMatches = item.match(EQUIPMENT_TAG_REGEX);
      if (eqMatches && eqMatches.length > 0) {
        const candidate = eqMatches.find((t) => !NON_EQUIPMENT_TAG_PREFIXES.test(t));
        if (candidate) rule.equipment_tag = candidate;
      }

      // Check fail-safe position
      if (FAIL_SAFE_FO_REGEX.test(item)) rule.fail_safe_position = 'fail_open';
      else if (FAIL_SAFE_FC_REGEX.test(item)) rule.fail_safe_position = 'fail_closed';
      else if (FAIL_SAFE_FL_REGEX.test(item)) rule.fail_safe_position = 'fail_locked';

      rules.push(rule);
      continue;
    }

    // 4. Relief Philosophy pattern: "PSV-[tag] set at [pressure] protects [equipment] against [scenario]"
    const reliefMatch = item.match(
      /(?:psv|prv|relief valve|safety valve)\s*([A-Z]{2,4}-\d{3,5})?\s*(?:is set at|set pressure of|set at)\s*([^,;]+)[,;]?\s*(?:for|protecting|against)\s*([^.]+)/i
    );

    if (reliefMatch) {
      const psvTag = reliefMatch[1] || 'PSV';
      const setpoint = reliefMatch[2].trim();
      const basis = reliefMatch[3].trim();
      const rule: EngineeringPhilosophyRule = {
        id: uuidv4(),
        project_id: projectId,
        source_document_id: documentId,
        source_document_name: documentName,
        source_category: category,
        rule_type: 'relief_basis',
        loop_tag: psvTag,
        condition: `System pressure reaches relief setpoint of ${setpoint}`,
        action: `Relief valve ${psvTag} opens to discharge relief stream: ${basis}`,
        is_confirmed_setpoint: NUMERIC_SETPOINT_REGEX.test(setpoint) && !TBD_REGEX.test(setpoint),
        verification_status: 'unverified',
        notes: item,
      };

      const eqMatches = item.match(EQUIPMENT_TAG_REGEX);
      if (eqMatches && eqMatches.length > 0) {
        const candidate = eqMatches.find((t) => !NON_EQUIPMENT_TAG_PREFIXES.test(t));
        if (candidate) rule.equipment_tag = candidate;
      }

      rules.push(rule);
    }
  }
}

/**
 * Creates an EngineeringPhilosophyRule from condition and action text.
 */
function createRuleFromText(
  condition: string,
  action: string,
  fullText: string,
  location: string,
  projectId: string,
  documentId: string,
  documentName: string,
  category: DocumentCategory
): EngineeringPhilosophyRule | null {
  if (!condition.trim() || !action.trim()) return null;

  // Determine rule type
  let ruleType: EngineeringPhilosophyRule['rule_type'] = 'interlock';
  if (/\b(esd|emergency shutdown|blowdown|bdv|depressur|facility shut|unit shut)\b/i.test(fullText)) {
    ruleType = 'esd_action';
  } else if (/\b(control loop|modulate|setpoint|pic|lic|tic|fic)\b/i.test(fullText)) {
    ruleType = 'control_objective';
  } else if (/\b(safe operating limit|sol|max operating|normal operating)\b/i.test(fullText)) {
    ruleType = 'operating_limit';
  } else if (/\b(relief|psv|prv|fire case|tube rupture)\b/i.test(fullText)) {
    ruleType = 'relief_basis';
  }

  // Extract equipment tag, excluding instrument and interlock tags
  let equipmentTag: string | undefined;
  const eqMatch = fullText.match(EQUIPMENT_TAG_REGEX);
  if (eqMatch && eqMatch.length > 0) {
    const candidate = eqMatch.find((t) => !NON_EQUIPMENT_TAG_PREFIXES.test(t));
    if (candidate) {
      equipmentTag = candidate;
    }
  }

  // Extract instrument, valve, or interlock tag
  let loopTag: string | undefined;
  const instMatch = fullText.match(INSTRUMENT_OR_VALVE_REGEX);
  if (instMatch && instMatch.length > 0) {
    const candidate = instMatch.find((t) => /^(PT|TT|LT|FT|PSHH|LSHH|TSHH|LSLL|PSLL|PIC|LIC|TIC|FIC|PSV|BDV|XV|SDV|PCV|LCV|TCV|FCV|SIS|I|INT)/i.test(t));
    if (candidate) {
      loopTag = candidate;
    }
  }

  // Fail safe position
  let failSafe: 'fail_closed' | 'fail_open' | 'fail_locked' | undefined;
  if (FAIL_SAFE_FC_REGEX.test(fullText)) {
    failSafe = 'fail_closed';
  } else if (FAIL_SAFE_FO_REGEX.test(fullText)) {
    failSafe = 'fail_open';
  } else if (FAIL_SAFE_FL_REGEX.test(fullText)) {
    failSafe = 'fail_locked';
  }

  // SIL rating
  let silRating: string | undefined;
  const silMatch = fullText.match(SIL_REGEX);
  if (silMatch) {
    silRating = `SIL ${silMatch[1]}`;
  }

  // Confirmed setpoint vs provisional
  const hasNumbers = NUMERIC_SETPOINT_REGEX.test(condition) || NUMERIC_SETPOINT_REGEX.test(action);
  const isTbd = TBD_REGEX.test(condition) || TBD_REGEX.test(action) || TBD_REGEX.test(fullText);
  const isConfirmed = hasNumbers && !isTbd;

  return {
    id: uuidv4(),
    project_id: projectId,
    source_document_id: documentId,
    source_document_name: documentName,
    source_category: category,
    rule_type: ruleType,
    equipment_tag: equipmentTag,
    loop_tag: loopTag,
    condition: condition.trim(),
    action: action.trim(),
    fail_safe_position: failSafe,
    sil_rating: silRating,
    is_confirmed_setpoint: isConfirmed,
    verification_status: 'unverified',
    notes: `${location} — ${fullText.trim()}`,
  };
}

/**
 * Extracts sparing philosophies (e.g. 2 x 100%, 1 duty + 1 standby, 3 x 50%)
 */
function extractSparing(text: string, list: SparingPhilosophy[]) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines) {
    const match = line.match(/\b(1\s*duty\s*\+\s*1\s*standby|2\s*x\s*100%|3\s*x\s*50%|2\s*x\s*50%|1\s*duty\s*\+\s*2\s*standby|2\s*duty\s*\+\s*1\s*standby|N\s*\+\s*1|uninstalled spare|installed spare)(?:\s|$|\b|[,\.;)])/i);
    if (match) {
      const config = match[1].trim();
      let eqName = line.split(match[0])[0].trim();
      eqName = eqName.replace(/^(the|all|each)\s+/i, '')
                     .replace(/\b(shall be|are|configured as|provided with|capacity|is)\b/gi, '')
                     .trim();
      if (!eqName) eqName = 'Rotating Equipment / Pumps';
      list.push({
        equipment_tag_or_type: eqName,
        configuration: config,
        notes: line,
      });
    }
  }
}

/**
 * Extracts design margins (e.g. max operating + 10% or 1.8 barg, +15% flow margin)
 */
function extractDesignMargins(text: string, list: DesignMarginRule[]) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);

  const marginDefinitions = [
    {
      param: 'Design Pressure Margin',
      lineFilter: /design pressure|dp margin/i,
      valueRegex: /(\+?\d+%\s*or\s*\+?\d+(?:\.\d+)?\s*(?:barg?|bar|psi|psig)|maximum operating pressure\s*\+\s*[^.\n]+|\d+%\s*above\s*(?:mop|maximum operating))/i,
    },
    {
      param: 'Design Temperature Margin',
      lineFilter: /design temp/i,
      valueRegex: /(\+?\d+\s*°?C|\+?\d+\s*°?F|maximum operating temperature\s*\+\s*[^.\n]+|\d+%\s*above\s*(?:mot|maximum operating))/i,
    },
    {
      param: 'Flow / Capacity Margin',
      lineFilter: /flow|capacity|overdesign/i,
      valueRegex: /(\+?\d+%\s*(?:margin|overdesign|flow margin)?|\d+%\s*of\s*(?:normal|rated)\s*flow)/i,
    },
    {
      param: 'Heat Exchanger Fouling / Overdesign',
      lineFilter: /fouling|excess.*surface|excess.*area/i,
      valueRegex: /(\+?\d+%\s*(?:excess\s*area|surface|area)?)/i,
    },
  ];

  for (const line of lines) {
    for (const def of marginDefinitions) {
      if (def.lineFilter.test(line)) {
        const match = line.match(def.valueRegex);
        if (match) {
          const codeMatch = line.match(/\b(API\s*(?:520|521|650|610|618)|ASME\s*(?:Section\s*VIII|B31\.3)|Shell\s*DEP)\b/i) ||
                            text.match(/\b(API\s*(?:520|521|650|610|618)|ASME\s*(?:Section\s*VIII|B31\.3)|Shell\s*DEP)\b/i);

          list.push({
            parameter: def.param,
            margin_value: match[1].trim(),
            source_standard: codeMatch ? codeMatch[0] : undefined,
          });
        }
      }
    }
  }
}

/**
 * Extracts shutdown hierarchy levels (ESD-0, ESD-1, ESD-2, ESD-3, Unit Trips)
 */
function extractShutdownHierarchy(text: string, list: ShutdownHierarchyLevel[]) {
  const esdRegex = /\b(ESD[- ]?[0-3]|Unit\s+Trip|Train\s+Trip|Total\s+Plant\s+Shutdown)\b(?:\s*[:\-–]\s*|\s*\(([^)]+)\)\s*|\s+-\s+)([^.\n]+)/gi;

  let match;
  while ((match = esdRegex.exec(text)) !== null) {
    const level = match[1].toUpperCase().replace(/\s+/, '-');
    const parenName = match[2] ? match[2].trim() : '';
    const desc = match[3] ? match[3].trim() : '';

    const name = parenName || desc.split(/[,;:]/)[0].trim();

    const triggers: string[] = [];
    const actions: string[] = [];

    if (/pushbutton|manual|fire|gas\s*leak|loss\s*of\s*power|blackout/i.test(desc)) {
      triggers.push('Manual pushbutton, confirmed gas/fire detection, or total utility failure');
    }
    if (/depressur|blowdown|flare/i.test(desc)) {
      actions.push('Emergency depressurization to flare via BDVs');
    }
    if (/isolat|close\s*xv|sdv/i.test(desc)) {
      actions.push('Closure of facility / train emergency shutdown isolation valves (XV/SDVs)');
    }
    if (/trip|de-energiz|stop/i.test(desc)) {
      actions.push('De-energization and trip of rotating equipment and compressors');
    }

    list.push({
      level,
      name,
      description: desc,
      triggers: triggers.length > 0 ? triggers : ['Confirmed process upset or manual initiation'],
      actions: actions.length > 0 ? actions : ['Execute automated shutdown sequence'],
    });
  }
}

/**
 * Extracts Safe Operating Limits (SOL)
 */
function extractSafeOperatingLimits(text: string, list: SafeOperatingLimitRule[]) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  for (const line of lines) {
    if (/\b(?:safe operating limit|sol)\b/i.test(line) && /:\s*/.test(line) && /\d/.test(line)) {
      const paramMatch = line.match(/(?:safe operating limit|sol)\s*(?:for\s+([^:,\n]+))?[:\-–]/i);
      const normalMatch = line.match(/normal(?:\s*range)?\s*[:\-–]?\s*([0-9\.\-–\s]+[a-zA-Z°]+)/i);
      const upperMatch = line.match(/(?:safe\s*upper\s*limit|upper\s*limit|max\s*limit)\s*[:\-–]?\s*([0-9\.]+\s*[a-zA-Z°]+)/i);
      const lowerMatch = line.match(/(?:safe\s*lower\s*limit|lower\s*limit|min\s*limit)\s*[:\-–]?\s*([0-9\.]+\s*[a-zA-Z°]+)/i);
      const consequenceMatch = line.match(/(?:consequence(?:\s*of\s*deviation)?)\s*[:\-–]?\s*([^.]+)/i);

      const eqMatches = line.match(EQUIPMENT_TAG_REGEX);
      const eqTag = eqMatches ? eqMatches.find((t) => !NON_EQUIPMENT_TAG_PREFIXES.test(t)) : undefined;

      list.push({
        parameter: paramMatch && paramMatch[1] ? paramMatch[1].trim() : 'Operating Parameter',
        equipment_tag: eqTag,
        normal_range: normalMatch ? normalMatch[1].trim() : undefined,
        safe_upper_limit: upperMatch ? upperMatch[1].trim() : undefined,
        safe_lower_limit: lowerMatch ? lowerMatch[1].trim() : undefined,
        consequence_of_deviation: consequenceMatch ? consequenceMatch[1].trim() : undefined,
      });
    }
  }
}

/**
 * Extracts environmental design and site conditions
 */
function extractEnvironmentalLimits(text: string, env: EnvironmentalDesignLimits) {
  // Min ambient temp
  const minTempMatch = text.match(/(?:minimum ambient temperature|min ambient temp(?:erature)?|min ambient)\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)\s*(?:°?C|°?F)/i);
  if (minTempMatch && !env.min_ambient_temp) {
    env.min_ambient_temp = `${minTempMatch[1]} °C`;
  }

  // Max ambient temp
  const maxTempMatch = text.match(/(?:maximum ambient temperature|max ambient temp(?:erature)?|max ambient)\s*[:=]?\s*([+-]?\d+(?:\.\d+)?)\s*(?:°?C|°?F)/i);
  if (maxTempMatch && !env.max_ambient_temp) {
    const val = maxTempMatch[1].replace(/^\+/, '');
    env.max_ambient_temp = `${val} °C`;
  }

  // Seismic zone
  const seismicMatch = text.match(/(?:seismic zone|earthquake zone|seismic design category)\s*[:=]?\s*([A-Za-z0-9\-]+)/i);
  if (seismicMatch && !env.seismic_zone) {
    env.seismic_zone = seismicMatch[1].trim();
  }

  // Basic wind speed
  const windMatch = text.match(/(?:basic wind speed|design wind speed)\s*[:=]?\s*(\d+(?:\.\d+)?\s*(?:km\/h|m\/s|mph))/i);
  if (windMatch && !env.basic_wind_speed) {
    env.basic_wind_speed = windMatch[1].trim();
  }

  // Site elevation
  const elevMatch = text.match(/(?:site elevation|elevation)\s*[:=]?\s*(\d+(?:\.\d+)?\s*(?:m\s*amsl|m|ft|meters))/i);
  if (elevMatch && !env.site_elevation) {
    env.site_elevation = elevMatch[1].trim();
  }

  // Solar radiation
  const solarMatch = text.match(/(?:solar radiation|solar design)\s*[:=]?\s*(\d+(?:\.\d+)?\s*(?:w\/m2|w\/m²|btu))/i);
  if (solarMatch && !env.solar_radiation) {
    env.solar_radiation = solarMatch[1].trim();
  }
}
