import { ComponentRegistryEntry, getComponentRegistry } from './componentRegistryService';

const SHEET_WIDTH = 1200;
const SHEET_HEIGHT = 800;
const COMPONENTS_PER_SHEET = 6;

export interface SyntheticPidAnnotation {
  class_id: string;
  tag: string;
  category: ComponentRegistryEntry['category'];
  bounding_box: { x: number; y: number; width: number; height: number };
  normalized_box: { center_x: number; center_y: number; width: number; height: number };
  ports: { id: string; x: number; y: number; kind: string; role: string }[];
}

export interface SyntheticPidSample {
  file_name: string;
  svg: string;
  annotations: SyntheticPidAnnotation[];
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[character] || character));
}

function viewBoxDimensions(component: ComponentRegistryEntry): { x: number; y: number; width: number; height: number } {
  const [x, y, width, height] = component.symbol.viewBox.split(/\s+/).map(Number);
  return { x, y, width, height };
}

function shapeSvg(component: ComponentRegistryEntry, x: number, y: number, width: number, height: number, tag: string): string {
  const cx = width / 2;
  const cy = height / 2;
  const stroke = '#111827';
  const fill = '#ffffff';
  const line = (x1: number, y1: number, x2: number, y2: number, extra = '') =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="2" ${extra}/>`;
  let shape = '';

  if (component.category === 'line') {
    shape = line(0, cy, width, cy, 'stroke-width="3"');
  } else if (component.category === 'connector') {
    shape = `<path d="M 0 ${cy} L ${width * 0.3} 2 L ${width} 2 L ${width} ${height - 2} L ${width * 0.3} ${height - 2} Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  } else if (component.category === 'instrument') {
    const radius = Math.max(10, Math.min(width, height) * 0.42);
    shape = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    if (component.symbol.key === 'instrument_dcs') shape += line(cx - radius, cy, cx + radius, cy, 'stroke-width="1.5"');
    if (component.symbol.key === 'instrument_sis') {
      shape += `<circle cx="${cx}" cy="${cy}" r="${radius - 5}" fill="none" stroke="${stroke}" stroke-width="1.5"/>`;
    }
    shape += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family="sans-serif" font-size="8" font-weight="bold" fill="${stroke}">${escapeXml(tag.split('-')[0])}</text>`;
  } else if (component.category === 'valve') {
    shape = `<polygon points="0,4 ${cx},${cy} 0,${height - 4}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><polygon points="${width},4 ${cx},${cy} ${width},${height - 4}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
    if (component.symbol.key === 'ball_valve') shape += `<circle cx="${cx}" cy="${cy}" r="3" fill="${stroke}"/>`;
    if (component.symbol.key === 'esd_valve' || component.symbol.key === 'control_valve') {
      shape += line(cx, cy, cx, 3) + line(cx - 8, 3, cx + 8, 3);
    }
    if (component.symbol.key === 'relief_valve') {
      shape += `<rect x="${cx - 5}" y="3" width="10" height="12" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
    }
  } else {
    switch (component.equipment_type) {
      case 'pump':
        shape = `<circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.32}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><path d="M ${cx - 6} ${cy + 8} L ${cx + 10} ${cy} L ${cx - 6} ${cy - 8} Z" fill="${stroke}"/>`;
        break;
      case 'compressor':
        shape = `<circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) * 0.34}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><path d="M ${cx - 10} ${cy} Q ${cx} ${cy - 12} ${cx + 10} ${cy} Q ${cx} ${cy + 12} ${cx - 10} ${cy}" fill="none" stroke="${stroke}" stroke-width="2"/>`;
        break;
      case 'heat_exchanger':
        shape = `<rect x="${width * 0.12}" y="${height * 0.2}" width="${width * 0.76}" height="${height * 0.6}" rx="${height * 0.3}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` + line(width * 0.25, height * 0.68, width * 0.75, height * 0.32) + line(width * 0.25, height * 0.32, width * 0.75, height * 0.68);
        break;
      case 'column':
        shape = `<rect x="${width * 0.3}" y="2" width="${width * 0.4}" height="${height - 4}" rx="${width * 0.18}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
        for (const ratio of [0.25, 0.4, 0.55, 0.7]) shape += line(width * 0.34, height * ratio, width * 0.66, height * ratio, 'stroke-width="1.25"');
        break;
      case 'reactor':
        shape = `<path d="M ${width * 0.2} ${height * 0.18} Q ${cx} 0 ${width * 0.8} ${height * 0.18} L ${width * 0.8} ${height * 0.8} Q ${cx} ${height} ${width * 0.2} ${height * 0.8} Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` + line(cx, 3, cx, height * 0.72) + line(width * 0.32, height * 0.58, width * 0.68, height * 0.58);
        break;
      case 'tank':
      case 'mixing_tank':
        shape = `<rect x="${width * 0.16}" y="${height * 0.2}" width="${width * 0.68}" height="${height * 0.72}" fill="${fill}" stroke="${stroke}" stroke-width="2"/><path d="M ${width * 0.16} ${height * 0.2} L ${cx} 2 L ${width * 0.84} ${height * 0.2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
        break;
      default:
        shape = `<rect x="${width * 0.18}" y="${height * 0.12}" width="${width * 0.64}" height="${height * 0.76}" rx="${component.equipment_type === 'vessel' ? width * 0.24 : 2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
        break;
    }
  }

  return `<g transform="translate(${x} ${y})">${shape}<text x="${cx}" y="${height + 16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#111827">${escapeXml(tag)}</text></g>`;
}

export function generateSyntheticPidSamples(sampleCount = 10, seed = 20261124): SyntheticPidSample[] {
  const registry = getComponentRegistry();
  const classes = registry.components.filter((component) => component.tag_prefixes.length > 0);
  if (classes.length === 0) return [];

  const random = seededRandom(seed);
  const samples: SyntheticPidSample[] = [];
  for (let sampleIndex = 0; sampleIndex < Math.max(1, Math.floor(sampleCount)); sampleIndex++) {
    const firstClassIndex = (sampleIndex * COMPONENTS_PER_SHEET) % classes.length;
    const chosen = Array.from(
      { length: COMPONENTS_PER_SHEET },
      (_, index) => classes[(firstClassIndex + index) % classes.length]
    );
    const positioned = chosen.map((component, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const box = viewBoxDimensions(component);
      const scale = 0.72 + random() * 0.56;
      const maxSymbolWidth = 115;
      const maxSymbolHeight = 120;
      const aspect = box.width / Math.max(box.height, 1);
      const baseWidth = Math.min(maxSymbolWidth, Math.max(28, maxSymbolHeight * aspect));
      const baseHeight = Math.min(maxSymbolHeight, Math.max(24, baseWidth / Math.max(aspect, 0.15)));
      const width = baseWidth * scale;
      const height = baseHeight * scale;
      const x = 110 + column * 370 + random() * 70;
      const y = 120 + row * 300 + random() * 50;
      const prefix = component.tag_prefixes[Math.floor(random() * component.tag_prefixes.length)];
      const tag = `${prefix}-${String(100 + sampleIndex * COMPONENTS_PER_SHEET + index).padStart(3, '0')}`;
      const ports = component.ports.map((port) => ({
        id: port.id,
        x: x + ((port.x - box.x) / box.width) * width,
        y: y + ((port.y - box.y) / box.height) * height,
        kind: port.kind,
        role: port.role,
      }));
      return { component, x, y, width, height, tag, ports };
    });

    const drawing: string[] = [];
    for (let index = 0; index < positioned.length - 1; index++) {
      const source = positioned[index];
      const target = positioned[index + 1];
      const sourcePort = source.ports.find((port) => port.role === 'outlet') || source.ports[source.ports.length - 1];
      const targetPort = target.ports.find((port) => port.role === 'inlet') || target.ports[0];
      drawing.push(`<path d="M ${sourcePort.x} ${sourcePort.y} H ${targetPort.x - 28} V ${targetPort.y} H ${targetPort.x}" fill="none" stroke="#111827" stroke-width="2"/>`);
    }

    const annotations: SyntheticPidAnnotation[] = positioned.map(({ component, x, y, width, height, tag, ports }) => ({
      class_id: component.class_id,
      tag,
      category: component.category,
      bounding_box: { x, y, width, height },
      normalized_box: {
        center_x: (x + width / 2) / SHEET_WIDTH,
        center_y: (y + height / 2) / SHEET_HEIGHT,
        width: width / SHEET_WIDTH,
        height: height / SHEET_HEIGHT,
      },
      ports,
    }));

    const symbols = positioned.map(({ component, x, y, width, height, tag }) => shapeSvg(component, x, y, width, height, tag));
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_WIDTH}" height="${SHEET_HEIGHT}" viewBox="0 0 ${SHEET_WIDTH} ${SHEET_HEIGHT}">`,
      '<rect width="100%" height="100%" fill="#fff"/>',
      '<g stroke-linecap="round" stroke-linejoin="round">',
      ...drawing,
      ...symbols,
      '</g>',
      '</svg>',
    ].join('');

    samples.push({
      file_name: `synthetic-pid-${String(sampleIndex + 1).padStart(4, '0')}.svg`,
      svg,
      annotations,
    });
  }
  return samples;
}
