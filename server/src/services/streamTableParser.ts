import { v4 as uuidv4 } from 'uuid';
import {
  DocumentCategory,
  PipingLine,
  ProcessStream,
  StreamPhase,
  UnifiedProvenanceValue,
  StreamTableExtractionResult,
  ExtractedStreamRecord,
  StreamTableComponentFraction,
  createEmptyProcessStream,
} from '../types';
import { ExtractedDocumentContent } from './pdfExtractor';

// --- PROVENANCE HELPER ---

function createProvenance<T>(
  originalValue: string | number | null,
  normalizedValue: T | null,
  unit: string | null,
  docId: string,
  docName: string,
  location: string,
  confidence = 0.95,
  notes?: string
): UnifiedProvenanceValue<T> {
  return {
    id: uuidv4(),
    original_value: originalValue,
    normalized_value: normalizedValue,
    original_unit: unit,
    normalized_unit: unit,
    source_document_id: docId,
    source_document_name: docName,
    source_category: 'stream_table',
    page_or_drawing_location: location,
    extraction_confidence: confidence,
    verification_status: 'unverified',
    extraction_timestamp: new Date().toISOString(),
    notes,
  };
}

function emptyProvenance<T>(
  docId: string,
  docName: string,
  location = 'Not Provided'
): UnifiedProvenanceValue<T> {
  return createProvenance<T>(null, null, null, docId, docName, location, 0.0);
}

// Known hazardous chemical components in process streams
const HAZARDOUS_COMPONENTS = new Set([
  'H2S', 'HYDROGEN SULFIDE', 'HYDROGEN SULPHIDE',
  'METHANE', 'ETHANE', 'PROPANE', 'BUTANE', 'ISOBUTANE', 'PENTANE', 'HEXANE',
  'BENZENE', 'TOLUENE', 'ETHYLBENZENE', 'XYLENE', 'BTEX',
  'AMMONIA', 'CHLORINE', 'CARBON MONOXIDE', 'CO',
  'MERCURY', 'HG', 'SULFUR DIOXIDE', 'SO2',
]);

/**
 * Normalizes numeric cell value, handling nulls, dashes, empty strings, and scientific notation
 */
function parseNumericCell(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || s === '-' || s === '–' || s.toLowerCase() === 'n/a' || s.toLowerCase() === 'nil' || s === '.') {
    return null;
  }
  const clean = s.replace(/,/g, '');
  const m = clean.match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/);
  if (m) {
    const num = parseFloat(m[0]);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * Normalizes unit string from header or cell
 */
function extractUnit(header: string, defaultUnit: string): string {
  const m = header.match(/\(([^)]+)\)|\[([^\]]+)\]/);
  if (m) {
    return (m[1] || m[2]).trim();
  }
  return defaultUnit;
}

/**
 * Detects fluid phase
 */
function normalizePhase(val: string | null | undefined, vaporFraction: number | null): StreamPhase | null {
  if (val) {
    const s = val.toLowerCase().trim();
    if (s.includes('multiphase') || s.includes('two-phase') || s.includes('2-phase') || s.includes('mixed')) return 'multiphase';
    if (s.includes('vapor') || s.includes('vapour')) return 'vapor';
    if (s.includes('liquid') || s.includes('condensate') || s.includes('water') || s.includes('oil')) return 'liquid';
    if (s.includes('gas')) return 'gas';
    if (s.includes('solid')) return 'solid';
  }
  if (vaporFraction !== null) {
    if (vaporFraction <= 0.001) return 'liquid';
    if (vaporFraction >= 0.999) return 'vapor';
    return 'multiphase';
  }
  return null;
}

/**
 * Splits CSV / TSV text rows into arrays of cell strings
 */
function parseRows(rawText: string): string[][] {
  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: string[][] = [];

  for (const line of lines) {
    if (line.startsWith('[Sheet:')) continue; // Skip sheet markers

    // Determine delimiter (comma, tab, or pipe)
    let cells: string[] = [];
    if (line.includes('\t')) {
      cells = line.split('\t').map((c) => c.trim().replace(/^["']|["']$/g, ''));
    } else if (line.includes('|')) {
      cells = line.split('|').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cells.length > 0 && cells[0] === '') cells.shift();
      if (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    } else {
      // CSV parsing handling commas inside quotes
      const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
      const matches: string[] = [];
      let m;
      while ((m = regex.exec(line)) !== null) {
        let val = m[1] || '';
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1).replace(/""/g, '"');
        }
        matches.push(val.trim());
        if (regex.lastIndex === line.length) break;
      }
      cells = matches.length > 0 ? matches : line.split(',').map((c) => c.trim());
    }

    if (cells.some((c) => c.length > 0)) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * Master Stream Table (Heat & Material Balance) Extraction Processor
 */
export function parseStreamTableDocument(
  content: ExtractedDocumentContent,
  documentId: string,
  documentName: string,
  projectId: string,
  existingStreams: ProcessStream[] = [],
  existingLines: PipingLine[] = []
): {
  extraction: StreamTableExtractionResult;
  streams: ProcessStream[];
} {
  const warnings: string[] = [];
  const extractedRecords: ExtractedStreamRecord[] = [];
  const generatedStreams: ProcessStream[] = [];

  const rows = parseRows(content.text);
  if (rows.length === 0) {
    warnings.push('Document contains no tabular rows or readable spreadsheet data.');
    return {
      extraction: {
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        document_name: documentName,
        table_orientation: 'hybrid',
        streams: [],
        total_streams_found: 0,
        extraction_warnings: warnings,
        extracted_at: new Date().toISOString(),
      },
      streams: [],
    };
  }

  // Determine Table Orientation:
  // Check if first column contains parameter labels (streams_as_columns)
  // vs first row contains parameter labels (streams_as_rows)
  const firstColTexts = rows.map((r) => (r[0] || '').toLowerCase());
  const paramKeywords = ['temp', 'press', 'flow', 'phase', 'vapor', 'fraction', 'stream', 'molecular', 'mw', 'density', 'enthalpy'];
  const col0Matches = firstColTexts.filter((t) => paramKeywords.some((k) => t.includes(k))).length;

  const firstRowTexts = (rows[0] || []).map((c) => c.toLowerCase());
  const row0Matches = firstRowTexts.filter((t) => paramKeywords.some((k) => t.includes(k))).length;

  const isStreamsAsColumns = col0Matches >= 2 && col0Matches >= row0Matches;

  if (isStreamsAsColumns) {
    // =========================================================================
    // CASE A: STREAMS AS COLUMNS (Parameters in Row 0..N, Streams in Col 1..M)
    // =========================================================================
    let streamNumRowIdx = rows.findIndex((r) => {
      const label = (r[0] || '').toLowerCase();
      return label.includes('stream') || label.includes('str') || label.includes('no');
    });
    if (streamNumRowIdx < 0) streamNumRowIdx = 0;

    const streamRow = rows[streamNumRowIdx];
    const totalCols = streamRow.length;

    for (let col = 1; col < totalCols; col++) {
      const rawNum = streamRow[col];
      if (!rawNum || rawNum.trim().length === 0) continue;

      const cleanNum = rawNum.trim();
      const streamNum = cleanNum.toUpperCase().startsWith('STR-')
        ? cleanNum.toUpperCase()
        : `STR-${cleanNum}`;

      let desc: string | null = null;
      let phaseText: string | null = null;
      let vaporFracVal: number | null = null;
      let tempVal: number | null = null;
      let tempUnit = '°C';
      let pressVal: number | null = null;
      let pressUnit = 'barg';
      let massVal: number | null = null;
      let massUnit = 'kg/h';
      let volVal: number | null = null;
      let volUnit = 'MMSCFD';
      let molVal: number | null = null;
      let molUnit = 'kmol/h';
      let mwVal: number | null = null;
      let densityVal: number | null = null;
      let densityUnit = 'kg/m3';
      const components: StreamTableComponentFraction[] = [];

      for (let r = 0; r < rows.length; r++) {
        if (r === streamNumRowIdx) continue;
        const rowLabel = (rows[r][0] || '').trim();
        const cellVal = rows[r][col] ? rows[r][col].trim() : '';
        const lowerLabel = rowLabel.toLowerCase();

        if (lowerLabel.includes('desc') || lowerLabel.includes('service') || lowerLabel.includes('name')) {
          desc = cellVal || null;
        } else if (lowerLabel.includes('phase') || lowerLabel.includes('state')) {
          phaseText = cellVal || null;
        } else if (lowerLabel.includes('vapor') || lowerLabel.includes('vapour') || lowerLabel.includes('quality')) {
          vaporFracVal = parseNumericCell(cellVal);
        } else if (lowerLabel.includes('temp')) {
          tempVal = parseNumericCell(cellVal);
          tempUnit = extractUnit(rowLabel, '°C');
        } else if (lowerLabel.includes('press')) {
          pressVal = parseNumericCell(cellVal);
          pressUnit = extractUnit(rowLabel, 'barg');
        } else if (lowerLabel.includes('mass') && lowerLabel.includes('flow')) {
          massVal = parseNumericCell(cellVal);
          massUnit = extractUnit(rowLabel, 'kg/h');
        } else if ((lowerLabel.includes('vol') || lowerLabel.includes('standard') || lowerLabel.includes('norm')) && lowerLabel.includes('flow')) {
          volVal = parseNumericCell(cellVal);
          volUnit = extractUnit(rowLabel, 'MMSCFD');
        } else if (lowerLabel.includes('mole') && lowerLabel.includes('flow')) {
          molVal = parseNumericCell(cellVal);
          molUnit = extractUnit(rowLabel, 'kmol/h');
        } else if (lowerLabel.includes('molecular') || lowerLabel === 'mw' || lowerLabel.includes('mwt')) {
          mwVal = parseNumericCell(cellVal);
        } else if (lowerLabel.includes('density') || lowerLabel.includes('sp gr')) {
          densityVal = parseNumericCell(cellVal);
          densityUnit = extractUnit(rowLabel, 'kg/m3');
        } else if (
          lowerLabel.includes('methane') || lowerLabel.includes('c1') ||
          lowerLabel.includes('ethane') || lowerLabel.includes('propane') ||
          lowerLabel.includes('h2s') || lowerLabel.includes('co2') ||
          lowerLabel.includes('nitrogen') || lowerLabel.includes('water') ||
          lowerLabel.includes('mdea') || lowerLabel.includes('teg') ||
          lowerLabel.includes('butane') || lowerLabel.includes('pentane') ||
          lowerLabel.includes('hexane') || lowerLabel.includes('c6+')
        ) {
          const compVal = parseNumericCell(cellVal);
          if (compVal !== null) {
            const compUpper = rowLabel.toUpperCase();
            const isHaz = Array.from(HAZARDOUS_COMPONENTS).some((h) => compUpper.includes(h));
            components.push({
              component_name: rowLabel,
              fraction_value: compVal,
              unit: extractUnit(rowLabel, 'mol%'),
              is_hazardous: isHaz,
            });
          }
        }
      }

      const phase = normalizePhase(phaseText, vaporFracVal);
      const loc = `Column ${col} (${streamNum})`;

      const record: ExtractedStreamRecord = {
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        stream_number: streamNum,
        stream_name: desc || `Stream ${streamNum}`,
        phase,
        vapor_fraction: vaporFracVal !== null ? createProvenance<number>(vaporFracVal, vaporFracVal, 'fraction', documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        operating_temperature: tempVal !== null ? createProvenance<number>(`${tempVal} ${tempUnit}`, tempVal, tempUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        operating_pressure: pressVal !== null ? createProvenance<number>(`${pressVal} ${pressUnit}`, pressVal, pressUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        mass_flow_rate: massVal !== null ? createProvenance<number>(`${massVal} ${massUnit}`, massVal, massUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        volumetric_flow_rate: volVal !== null ? createProvenance<number>(`${volVal} ${volUnit}`, volVal, volUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        molar_flow_rate: molVal !== null ? createProvenance<number>(`${molVal} ${molUnit}`, molVal, molUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        molecular_weight: mwVal !== null ? createProvenance<number>(mwVal, mwVal, 'kg/kmol', documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        density: densityVal !== null ? createProvenance<number>(`${densityVal} ${densityUnit}`, densityVal, densityUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        components,
        source_location: loc,
        confidence: 0.95,
      };

      // Check correlation with P&ID line
      const matchingLine = existingLines.find((l) => l.line_number.includes(streamNum) || (l.stream_label && l.stream_label.includes(streamNum)));
      if (matchingLine) {
        record.correlated_pid_line_number = matchingLine.line_number;
      }

      extractedRecords.push(record);

      // Create ProcessStream object
      const emptyStream = createEmptyProcessStream(projectId, streamNum, 'UNASSIGNED', 'UNASSIGNED');
      const procStream: ProcessStream = {
        ...emptyStream,
        id: uuidv4(),
        project_id: projectId,
        stream_number: streamNum,
        material_description: desc || `H&MB Process Stream ${streamNum}`,
        phase,
        flow_direction: 'forward',
        associated_instrument_tags: [], // Strict non-fabrication guarantee
        data_origin: 'document_extracted',
        verification_status: 'unverified',
        source: {
          document: documentName,
          document_id: documentId,
          page: 1,
          snippet: `H&MB Table Stream ${streamNum}: T=${tempVal || 'null'} ${tempUnit}, P=${pressVal || 'null'} ${pressUnit}`,
        },
      };

      if (tempVal !== null) {
        procStream.operating_temperature = {
          value: tempVal,
          unit: tempUnit,
          status: 'extracted',
        };
      }
      if (pressVal !== null) {
        procStream.operating_pressure = {
          value: pressVal,
          unit: pressUnit,
          status: 'extracted',
        };
      }
      if (massVal !== null || volVal !== null) {
        procStream.flow_rates = {
          normal: massVal || volVal,
          min: null,
          max: null,
          design: massVal || volVal,
          actual: null,
          unit: massVal ? massUnit : volUnit,
          basis: massVal ? 'mass' : 'volumetric',
        };
      }

      generatedStreams.push(procStream);
    }
  } else {
    // =========================================================================
    // CASE B: STREAMS AS ROWS (Parameters in Headers row, Streams in subsequent rows)
    // =========================================================================
    const headerRowIdx = rows.findIndex((r) => {
      const rowStr = r.join(' ').toLowerCase();
      return rowStr.includes('stream') || rowStr.includes('temp') || rowStr.includes('press');
    });

    const header = headerRowIdx >= 0 ? rows[headerRowIdx] : rows[0];
    const dataRows = rows.slice((headerRowIdx >= 0 ? headerRowIdx : 0) + 1);

    // Map column indices
    let streamCol = -1;
    let descCol = -1;
    let phaseCol = -1;
    let tempCol = -1;
    let pressCol = -1;
    let massCol = -1;
    let volCol = -1;
    let molCol = -1;
    let vaporFracCol = -1;
    let mwCol = -1;
    let densityCol = -1;
    const compCols: { col: number; name: string; unit: string }[] = [];

    header.forEach((h, idx) => {
      const lower = h.toLowerCase().trim();
      if (streamCol < 0 && (lower.includes('stream') || lower.includes('str') || lower === 'no' || lower === 'tag')) {
        streamCol = idx;
      } else if (descCol < 0 && (lower.includes('desc') || lower.includes('service') || lower.includes('name'))) {
        descCol = idx;
      } else if (phaseCol < 0 && (lower.includes('phase') || lower.includes('state'))) {
        phaseCol = idx;
      } else if (tempCol < 0 && lower.includes('temp')) {
        tempCol = idx;
      } else if (pressCol < 0 && lower.includes('press')) {
        pressCol = idx;
      } else if (massCol < 0 && lower.includes('mass') && lower.includes('flow')) {
        massCol = idx;
      } else if (volCol < 0 && (lower.includes('vol') || lower.includes('standard') || lower.includes('mmscfd') || lower.includes('sm3'))) {
        volCol = idx;
      } else if (molCol < 0 && lower.includes('mole') && lower.includes('flow')) {
        molCol = idx;
      } else if (vaporFracCol < 0 && (lower.includes('vapor') || lower.includes('vapour') || lower.includes('quality'))) {
        vaporFracCol = idx;
      } else if (mwCol < 0 && (lower.includes('molecular') || lower === 'mw' || lower.includes('mwt'))) {
        mwCol = idx;
      } else if (densityCol < 0 && (lower.includes('density') || lower.includes('sp gr'))) {
        densityCol = idx;
      } else if (
        lower.includes('methane') || lower.includes('c1') ||
        lower.includes('ethane') || lower.includes('propane') ||
        lower.includes('h2s') || lower.includes('co2') ||
        lower.includes('nitrogen') || lower.includes('water')
      ) {
        compCols.push({ col: idx, name: h, unit: extractUnit(h, 'mol%') });
      }
    });

    if (streamCol < 0) streamCol = 0; // Default to first column

    dataRows.forEach((r, rowIdx) => {
      const rawNum = r[streamCol];
      if (!rawNum || rawNum.trim().length === 0) return;

      const cleanNum = rawNum.trim();
      const streamNum = cleanNum.toUpperCase().startsWith('STR-')
        ? cleanNum.toUpperCase()
        : `STR-${cleanNum}`;

      const desc = descCol >= 0 && r[descCol] ? r[descCol].trim() : null;
      const phaseText = phaseCol >= 0 && r[phaseCol] ? r[phaseCol].trim() : null;
      const vaporFracVal = vaporFracCol >= 0 ? parseNumericCell(r[vaporFracCol]) : null;
      const tempVal = tempCol >= 0 ? parseNumericCell(r[tempCol]) : null;
      const tempUnit = tempCol >= 0 ? extractUnit(header[tempCol], '°C') : '°C';
      const pressVal = pressCol >= 0 ? parseNumericCell(r[pressCol]) : null;
      const pressUnit = pressCol >= 0 ? extractUnit(header[pressCol], 'barg') : 'barg';
      const massVal = massCol >= 0 ? parseNumericCell(r[massCol]) : null;
      const massUnit = massCol >= 0 ? extractUnit(header[massCol], 'kg/h') : 'kg/h';
      const volVal = volCol >= 0 ? parseNumericCell(r[volCol]) : null;
      const volUnit = volCol >= 0 ? extractUnit(header[volCol], 'MMSCFD') : 'MMSCFD';
      const molVal = molCol >= 0 ? parseNumericCell(r[molCol]) : null;
      const molUnit = molCol >= 0 ? extractUnit(header[molCol], 'kmol/h') : 'kmol/h';
      const mwVal = mwCol >= 0 ? parseNumericCell(r[mwCol]) : null;
      const densityVal = densityCol >= 0 ? parseNumericCell(r[densityCol]) : null;
      const densityUnit = densityCol >= 0 ? extractUnit(header[densityCol], 'kg/m3') : 'kg/m3';

      const components: StreamTableComponentFraction[] = [];
      compCols.forEach(({ col, name, unit }) => {
        if (col < r.length) {
          const cVal = parseNumericCell(r[col]);
          if (cVal !== null) {
            const isHaz = Array.from(HAZARDOUS_COMPONENTS).some((h) => name.toUpperCase().includes(h));
            components.push({
              component_name: name,
              fraction_value: cVal,
              unit,
              is_hazardous: isHaz,
            });
          }
        }
      });

      const phase = normalizePhase(phaseText, vaporFracVal);
      const loc = `Row ${rowIdx + 2} (${streamNum})`;

      const record: ExtractedStreamRecord = {
        id: uuidv4(),
        project_id: projectId,
        document_id: documentId,
        stream_number: streamNum,
        stream_name: desc || `Stream ${streamNum}`,
        phase,
        vapor_fraction: vaporFracVal !== null ? createProvenance<number>(vaporFracVal, vaporFracVal, 'fraction', documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        operating_temperature: tempVal !== null ? createProvenance<number>(`${tempVal} ${tempUnit}`, tempVal, tempUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        operating_pressure: pressVal !== null ? createProvenance<number>(`${pressVal} ${pressUnit}`, pressVal, pressUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        mass_flow_rate: massVal !== null ? createProvenance<number>(`${massVal} ${massUnit}`, massVal, massUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        volumetric_flow_rate: volVal !== null ? createProvenance<number>(`${volVal} ${volUnit}`, volVal, volUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        molar_flow_rate: molVal !== null ? createProvenance<number>(`${molVal} ${molUnit}`, molVal, molUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        molecular_weight: mwVal !== null ? createProvenance<number>(mwVal, mwVal, 'kg/kmol', documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        density: densityVal !== null ? createProvenance<number>(`${densityVal} ${densityUnit}`, densityVal, densityUnit, documentId, documentName, loc) : emptyProvenance<number>(documentId, documentName, loc),
        components,
        source_location: loc,
        confidence: 0.95,
      };

      // Correlate with P&ID line
      const matchingLine = existingLines.find((l) => l.line_number.includes(streamNum) || (l.stream_label && l.stream_label.includes(streamNum)));
      if (matchingLine) {
        record.correlated_pid_line_number = matchingLine.line_number;
      }

      extractedRecords.push(record);

      // Create ProcessStream object
      const emptyStream = createEmptyProcessStream(projectId, streamNum, 'UNASSIGNED', 'UNASSIGNED');
      const procStream: ProcessStream = {
        ...emptyStream,
        id: uuidv4(),
        project_id: projectId,
        stream_number: streamNum,
        material_description: desc || `H&MB Process Stream ${streamNum}`,
        phase,
        flow_direction: 'forward',
        associated_instrument_tags: [], // Non-fabrication guarantee
        data_origin: 'document_extracted',
        verification_status: 'unverified',
        source: {
          document: documentName,
          document_id: documentId,
          page: 1,
          snippet: `H&MB Row Stream ${streamNum}: T=${tempVal || 'null'} ${tempUnit}, P=${pressVal || 'null'} ${pressUnit}`,
        },
      };

      if (tempVal !== null) {
        procStream.operating_temperature = {
          value: tempVal,
          unit: tempUnit,
          status: 'extracted',
        };
      }
      if (pressVal !== null) {
        procStream.operating_pressure = {
          value: pressVal,
          unit: pressUnit,
          status: 'extracted',
        };
      }
      if (massVal !== null || volVal !== null) {
        procStream.flow_rates = {
          normal: massVal || volVal,
          min: null,
          max: null,
          design: massVal || volVal,
          actual: null,
          unit: massVal ? massUnit : volUnit,
          basis: massVal ? 'mass' : 'volumetric',
        };
      }

      generatedStreams.push(procStream);
    });
  }

  const extractionResult: StreamTableExtractionResult = {
    id: uuidv4(),
    project_id: projectId,
    document_id: documentId,
    document_name: documentName,
    table_orientation: isStreamsAsColumns ? 'streams_as_columns' : 'streams_as_rows',
    streams: extractedRecords,
    total_streams_found: extractedRecords.length,
    extraction_warnings: warnings,
    extracted_at: new Date().toISOString(),
  };

  return {
    extraction: extractionResult,
    streams: generatedStreams,
  };
}
