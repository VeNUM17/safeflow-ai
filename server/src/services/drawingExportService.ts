import { DigitalPidDrawing, ProcessProject, DrawingElement, DrawingConnector } from '../types';

/**
 * Export digital drawing as formatted JSON
 */
export function exportDrawingToJson(drawing: DigitalPidDrawing): string {
  const payload = {
    export_metadata: {
      exported_at: new Date().toISOString(),
      standard: 'SafeFlow AI Digital P&ID Schema v1.0',
      drawing_id: drawing.id,
      drawing_number: drawing.drawing_number,
      title: drawing.title,
      revision: drawing.revision,
      status: drawing.status,
    },
    drawing,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Render a single drawing element as SVG XML string
 */
function renderElementSvg(el: DrawingElement): string {
  const x = el.position.x;
  const y = el.position.y;
  const w = el.size.width || 80;
  const h = el.size.height || 100;
  const rot = el.rotation || 0;
  const transform = `transform="translate(${x}, ${y}) rotate(${rot} ${w / 2} ${h / 2})"`;

  let shapeMarkup = '';

  switch (el.type) {
    case 'vessel': {
      // Dished heads top and bottom, cylindrical body
      const headH = Math.min(20, h * 0.2);
      shapeMarkup = `
        <rect x="0" y="${headH}" width="${w}" height="${h - 2 * headH}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <path d="M 0 ${headH} C 0 0, ${w} 0, ${w} ${headH}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <path d="M 0 ${h - headH} C 0 ${h}, ${w} ${h}, ${w} ${h - headH}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <line x1="${w * 0.2}" y1="${h}" x2="${w * 0.15}" y2="${h + 12}" stroke="#0f172a" stroke-width="2" />
        <line x1="${w * 0.8}" y1="${h}" x2="${w * 0.85}" y2="${h + 12}" stroke="#0f172a" stroke-width="2" />
      `;
      break;
    }

    case 'tank':
    case 'mixing_tank': {
      const coneH = Math.min(16, h * 0.18);
      shapeMarkup = `
        <rect x="0" y="${coneH}" width="${w}" height="${h - coneH}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <path d="M 0 ${coneH} L ${w / 2} 0 L ${w} ${coneH} Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="2.5" />
      `;
      break;
    }

    case 'reactor': {
      const headH = Math.min(18, h * 0.18);
      shapeMarkup = `
        <rect x="0" y="${headH}" width="${w}" height="${h - 2 * headH}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <path d="M 0 ${headH} C 0 2, ${w} 2, ${w} ${headH}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <path d="M 0 ${h - headH} C 0 ${h - 2}, ${w} ${h - 2}, ${w} ${h - headH}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <rect x="${w / 2 - 10}" y="-16" width="20" height="16" fill="#64748b" stroke="#0f172a" stroke-width="2" />
        <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h * 0.75}" stroke="#0284c7" stroke-width="2" stroke-dasharray="4,2" />
        <line x1="${w * 0.25}" y1="${h * 0.6}" x2="${w * 0.75}" y2="${h * 0.6}" stroke="#0284c7" stroke-width="3" />
        <line x1="${w * 0.25}" y1="${h * 0.75}" x2="${w * 0.75}" y2="${h * 0.75}" stroke="#0284c7" stroke-width="3" />
      `;
      break;
    }

    case 'pump': {
      const r = Math.min(w, h) / 2 - 4;
      const cx = w / 2;
      const cy = h / 2;
      shapeMarkup = `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <path d="M ${cx} ${cy - r} L ${w} ${cy - r} L ${w} ${cy - r + 12} L ${cx + 10} ${cy - r + 12}" fill="#0f172a" />
        <circle cx="${cx}" cy="${cy}" r="4" fill="#0f172a" />
        <path d="M ${cx - r * 0.6} ${cy + r * 0.4} L ${cx} ${cy - r * 0.6} L ${cx + r * 0.6} ${cy + r * 0.4} Z" fill="none" stroke="#64748b" stroke-width="1.5" />
      `;
      break;
    }

    case 'compressor': {
      shapeMarkup = `
        <polygon points="0,${h * 0.1} ${w},${h * 0.3} ${w},${h * 0.7} 0,${h * 0.9}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <line x1="${w * 0.3}" y1="${h * 0.2}" x2="${w * 0.3}" y2="${h * 0.8}" stroke="#64748b" stroke-width="2" />
        <line x1="${w * 0.6}" y1="${h * 0.25}" x2="${w * 0.6}" y2="${h * 0.75}" stroke="#64748b" stroke-width="2" />
      `;
      break;
    }

    case 'heat_exchanger': {
      const r = h / 2;
      shapeMarkup = `
        <rect x="${r * 0.5}" y="0" width="${w - r}" height="${h}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <path d="M ${r * 0.5} 0 C 0 0, 0 ${h}, ${r * 0.5} ${h}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <path d="M ${w - r * 0.5} 0 C ${w} 0, ${w} ${h}, ${w - r * 0.5} ${h}" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <line x1="${r * 0.6}" y1="${h * 0.33}" x2="${w - r * 0.6}" y2="${h * 0.33}" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="3,3" />
        <line x1="${r * 0.6}" y1="${h * 0.66}" x2="${w - r * 0.6}" y2="${h * 0.66}" stroke="#0284c7" stroke-width="1.5" stroke-dasharray="3,3" />
      `;
      break;
    }

    case 'manual_valve':
    case 'isolation_valve':
    case 'drain_valve': {
      shapeMarkup = `
        <polygon points="0,0 ${w / 2},${h / 2} 0,${h}" fill="#0f172a" stroke="#0f172a" stroke-width="1.5" />
        <polygon points="${w},0 ${w / 2},${h / 2} ${w},${h}" fill="#0f172a" stroke="#0f172a" stroke-width="1.5" />
        <line x1="${w / 2}" y1="${h / 2}" x2="${w / 2}" y2="-8" stroke="#0f172a" stroke-width="2" />
        <line x1="${w / 2 - 10}" y1="-8" x2="${w / 2 + 10}" y2="-8" stroke="#0f172a" stroke-width="2.5" />
      `;
      break;
    }

    case 'control_valve': {
      shapeMarkup = `
        <polygon points="0,${h * 0.3} ${w / 2},${h * 0.7} 0,${h}" fill="#0f172a" stroke="#0f172a" stroke-width="1.5" />
        <polygon points="${w},${h * 0.3} ${w / 2},${h * 0.7} ${w},${h}" fill="#0f172a" stroke="#0f172a" stroke-width="1.5" />
        <line x1="${w / 2}" y1="${h * 0.7}" x2="${w / 2}" y2="${h * 0.2}" stroke="#0f172a" stroke-width="2" />
        <path d="M ${w / 2 - 14} ${h * 0.2} C ${w / 2 - 14} 0, ${w / 2 + 14} 0, ${w / 2 + 14} ${h * 0.2} Z" fill="#e2e8f0" stroke="#0f172a" stroke-width="2" />
      `;
      break;
    }

    case 'check_valve': {
      shapeMarkup = `
        <polygon points="0,0 ${w / 2},${h / 2} 0,${h}" fill="#0f172a" stroke="#0f172a" stroke-width="1.5" />
        <polygon points="${w},0 ${w / 2},${h / 2} ${w},${h}" fill="#0f172a" stroke="#0f172a" stroke-width="1.5" />
        <polyline points="${w * 0.2},${h * 0.2} ${w * 0.8},${h * 0.5} ${w * 0.2},${h * 0.8}" fill="none" stroke="#ffffff" stroke-width="2" />
      `;
      break;
    }

    case 'relief_valve': {
      shapeMarkup = `
        <polygon points="0,${h / 2} ${w / 2},${h / 2} ${w / 4},${h}" fill="#dc2626" stroke="#dc2626" stroke-width="1.5" />
        <line x1="${w / 4}" y1="${h / 2}" x2="${w / 4}" y2="0" stroke="#0f172a" stroke-width="2" />
        <rect x="${w / 4 - 6}" y="2" width="12" height="16" fill="#f8fafc" stroke="#0f172a" stroke-width="1.5" />
        <line x1="${w / 4}" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#dc2626" stroke-width="3" />
        <polyline points="${w - 6},${h / 2 - 4} ${w},${h / 2} ${w - 6},${h / 2 + 4}" fill="none" stroke="#dc2626" stroke-width="2" />
      `;
      break;
    }

    case 'instrument': {
      const r = Math.min(w, h) / 2;
      const cx = w / 2;
      const cy = h / 2;
      shapeMarkup = `
        <circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="#ffffff" stroke="#0284c7" stroke-width="2" />
        <line x1="2" y1="${cy}" x2="${w - 2}" y2="${cy}" stroke="#0284c7" stroke-width="1.5" />
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="#0f172a">${el.tag.split('-')[0] || 'PIC'}</text>
        <text x="${cx}" y="${cy + 12}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="#0f172a">${el.tag.split('-')[1] || '101'}</text>
      `;
      break;
    }

    case 'offpage_connector': {
      shapeMarkup = `
        <polygon points="0,0 ${w - 14},0 ${w},${h / 2} ${w - 14},${h} 0,${h}" fill="#f1f5f9" stroke="#475569" stroke-width="2" />
        <text x="${(w - 14) / 2}" y="${h / 2 + 4}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="bold" fill="#334155">${el.tag || 'TO DWG-02'}</text>
      `;
      break;
    }

    case 'junction': {
      shapeMarkup = `
        <circle cx="${w / 2}" cy="${h / 2}" r="6" fill="#0f172a" />
      `;
      break;
    }

    case 'separator':
    case 'filter':
    default: {
      shapeMarkup = `
        <rect x="0" y="0" width="${w}" height="${h}" rx="6" fill="#f8fafc" stroke="#0f172a" stroke-width="2.5" />
        <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#94a3b8" stroke-dasharray="3,3" />
      `;
      break;
    }
  }

  const tagMarkup =
    el.type !== 'instrument' && el.type !== 'offpage_connector' && el.type !== 'junction'
      ? `<text x="${w / 2}" y="${h + 16}" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0f172a">${el.tag}</text>`
      : '';

  return `
    <g id="element-${el.id}" ${transform}>
      ${shapeMarkup}
      ${tagMarkup}
    </g>
  `;
}

/**
 * Render a single connector line as SVG XML string
 */
function renderConnectorSvg(
  conn: DrawingConnector,
  elementsMap: Map<string, DrawingElement>
): string {
  const fromEl = elementsMap.get(conn.from_element_id);
  const toEl = elementsMap.get(conn.to_element_id);

  if (!fromEl || !toEl) return '';

  const fromPort = fromEl.ports.find((p) => p.id === conn.from_port_id);
  const toPort = toEl.ports.find((p) => p.id === conn.to_port_id);

  // Calculate port positions
  let startX = fromEl.position.x + fromEl.size.width / 2;
  let startY = fromEl.position.y + fromEl.size.height / 2;
  if (fromPort) {
    if (Math.abs(fromPort.position.x) > fromEl.size.width / 2 || Math.abs(fromPort.position.y) > fromEl.size.height / 2) {
      startX = fromEl.position.x + fromPort.position.x;
      startY = fromEl.position.y + fromPort.position.y;
    } else {
      startX += fromPort.position.x;
      startY += fromPort.position.y;
    }
  }

  let endX = toEl.position.x + toEl.size.width / 2;
  let endY = toEl.position.y + toEl.size.height / 2;
  if (toPort) {
    if (Math.abs(toPort.position.x) > toEl.size.width / 2 || Math.abs(toPort.position.y) > toEl.size.height / 2) {
      endX = toEl.position.x + toPort.position.x;
      endY = toEl.position.y + toPort.position.y;
    } else {
      endX += toPort.position.x;
      endY += toPort.position.y;
    }
  }

  const points: { x: number; y: number }[] = [{ x: startX, y: startY }];
  if (conn.waypoints && conn.waypoints.length > 0) {
    conn.waypoints.forEach((wp) => points.push({ x: wp.x, y: wp.y }));
  } else {
    if (Math.abs(startX - endX) > 20 && Math.abs(startY - endY) > 20) {
      const midX = (startX + endX) / 2;
      points.push({ x: midX, y: startY });
      points.push({ x: midX, y: endY });
    }
  }
  points.push({ x: endX, y: endY });

  let pathD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    pathD += ` L ${points[i].x} ${points[i].y}`;
  }

  const isSignal = conn.functional_type === 'signal_line';
  const strokeColor = isSignal ? '#0284c7' : '#0f172a';
  const strokeWidth = isSignal ? '1.8' : '3.0';
  const strokeDash = isSignal ? 'stroke-dasharray="6,4"' : '';

  const midIndex = Math.floor(points.length / 2);
  const pA = points[midIndex - 1] || points[0];
  const pB = points[midIndex] || points[points.length - 1];
  const midX = (pA.x + pB.x) / 2;
  const midY = (pA.y + pB.y) / 2;
  const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x) * (180 / Math.PI);

  const flowArrow =
    conn.flow_direction !== 'bidirectional' && !isSignal
      ? `<polygon points="-6,-4 4,0 -6,4" fill="${strokeColor}" transform="translate(${midX}, ${midY}) rotate(${angle})" />`
      : '';

  const labelMarkup = conn.line_number
    ? `<text x="${midX}" y="${midY - 8}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="600" fill="#475569" transform="rotate(${Math.abs(angle) > 90 ? angle + 180 : angle} ${midX} ${midY - 8})">${conn.line_number}${conn.stream_label ? ` (${conn.stream_label})` : ''}</text>`
    : '';

  return `
    <g id="connector-${conn.id}">
      <path d="${pathD}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${strokeDash} stroke-linejoin="round" stroke-linecap="round" />
      ${flowArrow}
      ${labelMarkup}
    </g>
  `;
}

/**
 * Export digital drawing as a standalone vector SVG with Title Block and Legend
 */
export function exportDrawingToSvg(
  drawing: DigitalPidDrawing,
  project?: ProcessProject
): string {
  const width = 2400;
  const height = 1600;

  const elementsMap = new Map<string, DrawingElement>();
  drawing.elements.forEach((el) => elementsMap.set(el.id, el));

  const connectorsSvg = drawing.connectors
    .map((c) => renderConnectorSvg(c, elementsMap))
    .join('\n');
  const elementsSvg = drawing.elements.map((el) => renderElementSvg(el)).join('\n');

  // Title Block
  const tbW = 420;
  const tbH = 160;
  const tbX = width - tbW - 20;
  const tbY = height - tbH - 20;

  const titleBlock = `
    <!-- Engineering Title Block -->
    <g id="title-block" transform="translate(${tbX}, ${tbY})">
      <rect x="0" y="0" width="${tbW}" height="${tbH}" fill="#ffffff" stroke="#0f172a" stroke-width="2" />
      <line x1="0" y1="40" x2="${tbW}" y2="40" stroke="#0f172a" stroke-width="1.5" />
      <line x1="0" y1="80" x2="${tbW}" y2="80" stroke="#0f172a" stroke-width="1.5" />
      <line x1="0" y1="120" x2="${tbW}" y2="120" stroke="#0f172a" stroke-width="1.5" />
      <line x1="${tbW * 0.6}" y1="80" x2="${tbW * 0.6}" y2="${tbH}" stroke="#0f172a" stroke-width="1.5" />
      
      <text x="12" y="26" font-family="sans-serif" font-size="14" font-weight="bold" fill="#0f172a">SafeFlow AI — Process Piping & Instrumentation Diagram</text>
      <text x="12" y="62" font-family="sans-serif" font-size="16" font-weight="bold" fill="#1e293b">${drawing.title || 'DIGITAL PROCESS TOPOLOGY'}</text>
      
      <text x="12" y="98" font-family="sans-serif" font-size="10" fill="#64748b">DRAWING NUMBER</text>
      <text x="12" y="112" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">${drawing.drawing_number || 'DWG-001'}</text>
      
      <text x="${tbW * 0.6 + 12}" y="98" font-family="sans-serif" font-size="10" fill="#64748b">REVISION</text>
      <text x="${tbW * 0.6 + 12}" y="112" font-family="sans-serif" font-size="12" font-weight="bold" fill="#0f172a">${drawing.revision || 'REV 0'}</text>
      
      <text x="12" y="138" font-family="sans-serif" font-size="10" fill="#64748b">PROJECT: ${project?.name || 'SafeFlow Project'}</text>
      <text x="12" y="152" font-family="sans-serif" font-size="10" fill="#64748b">STATUS: ${drawing.status.toUpperCase()} ${drawing.approved_by ? `(Approved by ${drawing.approved_by})` : ''}</text>
      <text x="${tbW * 0.6 + 12}" y="145" font-family="sans-serif" font-size="10" fill="#64748b">DATE: ${drawing.approved_at ? drawing.approved_at.split('T')[0] : new Date().toISOString().split('T')[0]}</text>
    </g>
  `;

  // Symbol Legend
  const legW = 280;
  const legH = 140;
  const legX = 20;
  const legY = height - legH - 20;

  const legendBlock = `
    <!-- Symbol & Line Legend -->
    <g id="legend-block" transform="translate(${legX}, ${legY})">
      <rect x="0" y="0" width="${legW}" height="${legH}" fill="#ffffff" stroke="#94a3b8" stroke-width="1.5" rx="4" />
      <text x="12" y="22" font-family="sans-serif" font-size="11" font-weight="bold" fill="#0f172a">SYMBOLS & LINE LEGEND</text>
      <line x1="12" y1="30" x2="${legW - 12}" y2="30" stroke="#e2e8f0" stroke-width="1" />
      
      <line x1="16" y1="48" x2="60" y2="48" stroke="#0f172a" stroke-width="3" />
      <text x="70" y="52" font-family="sans-serif" font-size="10" fill="#334155">Major Process Piping</text>
      
      <line x1="16" y1="72" x2="60" y2="72" stroke="#0284c7" stroke-width="1.8" stroke-dasharray="6,4" />
      <text x="70" y="76" font-family="sans-serif" font-size="10" fill="#334155">Instrument Signal Line (Non-Process)</text>
      
      <line x1="16" y1="96" x2="60" y2="96" stroke="#0f172a" stroke-width="2" />
      <polygon points="36,92 46,96 36,100" fill="#0f172a" />
      <text x="70" y="100" font-family="sans-serif" font-size="10" fill="#334155">Direction of Flow</text>

      <circle cx="28" cy="120" r="4" fill="#0284c7" />
      <text x="70" y="124" font-family="sans-serif" font-size="10" fill="#334155">Equipment Nozzle / Port</text>
    </g>
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    </style>
  </defs>

  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" stroke="#0f172a" stroke-width="4" />
  <rect x="10" y="10" width="${width - 20}" height="${height - 20}" fill="none" stroke="#64748b" stroke-width="1" />

  <g id="drawing-connectors">
    ${connectorsSvg}
  </g>

  <g id="drawing-elements">
    ${elementsSvg}
  </g>

  ${titleBlock}
  ${legendBlock}
</svg>`;
}
