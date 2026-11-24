import { PID_VIEWER_CONFIG } from './pidViewerConfig';
import { LayoutNode } from './crossingMinimizedLayout';
import { DrawingConnector } from '../../types';

export interface PidSection {
  id: string;
  hashKey: string;
  title: string;
  subTitle: string;
  flowOrder: number;
  nodeIds: string[];
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  color: string;
}

export interface SectionExitMarker {
  edgeId: string;
  sourceSectionId: string;
  targetSectionId: string;
  targetSectionTitle: string;
  x: number;
  y: number;
  direction: 'right' | 'up' | 'down' | 'left';
  label: string;
}

export class SectionManager {
  /**
   * Partitions layout nodes into functional engineering sections,
   * calculating enclosing bounding boxes with configured padding.
   */
  public static computeSections(
    nodes: LayoutNode[],
    connectors: DrawingConnector[]
  ): PidSection[] {
    const padding = PID_VIEWER_CONFIG.sections.padding_px;

    // Defined functional sections matching industrial P&ID architecture:
    const sectionTemplates = [
      {
        id: 'inlet_manifold',
        hashKey: 'inlet',
        title: 'Inlet Manifold & Isolation',
        subTitle: 'Production Manifold, Wellhead SDVs, and Emergency Shutdown Valve XV-1001',
        flowOrder: 1,
        color: '#2563eb', // Blue
        matches: (n: LayoutNode) =>
          n.tag.includes('INLET') ||
          n.tag.includes('PRODUCTION') ||
          n.tag.startsWith('SDV-') ||
          n.tag === 'XV-1001' ||
          n.tag === 'PI-1001' ||
          n.tag === 'PIC-1001',
      },
      {
        id: 'slug_catcher',
        hashKey: 'vessel',
        title: 'PIG Receiver / Slug Catcher (PG-1001)',
        subTitle: 'Primary 1200 ID x 8000 LG 90 barg Gas/Liquid Slug Separation Vessel',
        flowOrder: 2,
        color: '#0891b2', // Cyan
        matches: (n: LayoutNode) =>
          n.tag === 'PG-1001' ||
          n.tag.includes('SLUG') ||
          n.tag.includes('PIG') ||
          n.tag.startsWith('LG-') ||
          n.tag === 'PT-1001',
      },
      {
        id: 'outlet_control',
        hashKey: 'outlet',
        title: 'Outlet Delivery & Pressure Control',
        subTitle: 'Check Valve CV-1001, Outlet Isolation XV-1002, PCV-1001 to HP Separator',
        flowOrder: 3,
        color: '#16a34a', // Emerald
        matches: (n: LayoutNode) =>
          n.tag === 'CV-1001' ||
          n.tag === 'XV-1002' ||
          n.tag === 'PCV-1001' ||
          n.tag.includes('SEPARATOR') ||
          n.tag.includes('OUTLET') ||
          n.tag === 'PT-1002' ||
          n.tag === 'TT-1001',
      },
      {
        id: 'relief_flare',
        hashKey: 'relief',
        title: 'Relief & Flare Header System',
        subTitle: '95 barg Safety Relief Valve PSV-1001, Block Valves NV-1001/1002, Sour Flare Header',
        flowOrder: 4,
        color: '#dc2626', // Red
        matches: (n: LayoutNode) =>
          n.tag.startsWith('PSV') ||
          n.tag.startsWith('NV-') ||
          n.tag.includes('FLARE') ||
          n.tag.includes('VENT') ||
          n.tag === 'BV-1002',
      },
      {
        id: 'drain_blowdown',
        hashKey: 'drain',
        title: 'Liquid Drain & Blowdown System',
        subTitle: 'LCV-1001 Level Control, Emergency Depressuring BDV-1001 to Sour Flare & Drain Drum',
        flowOrder: 5,
        color: '#ea580c', // Orange
        matches: (n: LayoutNode) =>
          n.tag.startsWith('BDV') ||
          n.tag.startsWith('LCV') ||
          n.tag.startsWith('BV-1001') ||
          n.tag.includes('DRAIN') ||
          n.tag.includes('CONDENSATE'),
      },
      {
        id: 'sis_instrumentation',
        hashKey: 'sis',
        title: 'Safety Instrumented System (SIS & DCS)',
        subTitle: 'Logic Solver LS-1001, Level/Pressure Transmitters, and SIL Assessment Trips',
        flowOrder: 6,
        color: '#7c3aed', // Purple
        matches: (n: LayoutNode) =>
          n.tag.startsWith('SIS') ||
          n.tag.startsWith('LS-') ||
          n.tag.startsWith('LIC') ||
          n.tag.startsWith('LT-') ||
          n.tag.includes('SOLVER'),
      },
    ];

    const sections: PidSection[] = [];
    const assignedNodeIds = new Set<string>();

    for (const tmpl of sectionTemplates) {
      const sectionNodes = nodes.filter((n) => tmpl.matches(n) && !assignedNodeIds.has(n.id));
      sectionNodes.forEach((n) => assignedNodeIds.add(n.id));

      if (sectionNodes.length === 0) continue;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const n of sectionNodes) {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.width);
        maxY = Math.max(maxY, n.y + n.height);
      }

      // Add generous padding so section boxes frame elements clearly
      const boxX = Math.max(20, minX - padding);
      const boxY = Math.max(20, minY - padding);
      const boxW = Math.max(300, maxX - minX + padding * 2);
      const boxH = Math.max(200, maxY - minY + padding * 2);

      sections.push({
        id: tmpl.id,
        hashKey: tmpl.hashKey,
        title: tmpl.title,
        subTitle: tmpl.subTitle,
        flowOrder: tmpl.flowOrder,
        nodeIds: sectionNodes.map((n) => n.id),
        bounds: {
          x: Math.round(boxX),
          y: Math.round(boxY),
          width: Math.round(boxW),
          height: Math.round(boxH),
        },
        color: tmpl.color,
      });
    }

    // Assign any residual unassigned nodes to nearest section
    const remainingNodes = nodes.filter((n) => !assignedNodeIds.has(n.id));
    for (const r of remainingNodes) {
      // Find section with closest center
      let closestSec = sections[0];
      let minDist = Infinity;
      for (const s of sections) {
        const secCenterX = s.bounds.x + s.bounds.width / 2;
        const secCenterY = s.bounds.y + s.bounds.height / 2;
        const dist = Math.hypot(r.x - secCenterX, r.y - secCenterY);
        if (dist < minDist) {
          minDist = dist;
          closestSec = s;
        }
      }
      if (closestSec) {
        closestSec.nodeIds.push(r.id);
        // Expand bounds if needed
        closestSec.bounds.x = Math.min(closestSec.bounds.x, r.x - padding);
        closestSec.bounds.y = Math.min(closestSec.bounds.y, r.y - padding);
        closestSec.bounds.width = Math.max(closestSec.bounds.width, r.x + r.width + padding - closestSec.bounds.x);
        closestSec.bounds.height = Math.max(closestSec.bounds.height, r.y + r.height + padding - closestSec.bounds.y);
      }
    }

    sections.sort((a, b) => a.flowOrder - b.flowOrder);
    return sections;
  }

  /**
   * Generates clickable exit markers on connection lines that traverse across section boundaries.
   */
  public static computeSectionExitMarkers(
    sections: PidSection[],
    connectors: DrawingConnector[],
    nodeMap: Map<string, LayoutNode>
  ): SectionExitMarker[] {
    const markers: SectionExitMarker[] = [];
    const nodeToSec = new Map<string, PidSection>();

    for (const sec of sections) {
      for (const nid of sec.nodeIds) {
        nodeToSec.set(nid, sec);
      }
    }

    for (const conn of connectors) {
      const srcSec = nodeToSec.get(conn.from_element_id);
      const tgtSec = nodeToSec.get(conn.to_element_id);

      if (!srcSec || !tgtSec || srcSec.id === tgtSec.id) {
        continue; // Internal to same section
      }

      const fromN = nodeMap.get(conn.from_element_id);
      const toN = nodeMap.get(conn.to_element_id);
      if (!fromN || !toN) continue;

      const dx = toN.x - fromN.x;
      const dy = toN.y - fromN.y;

      let direction: 'right' | 'up' | 'down' | 'left' = 'right';
      if (Math.abs(dx) >= Math.abs(dy)) {
        direction = dx > 0 ? 'right' : 'left';
      } else {
        direction = dy > 0 ? 'down' : 'up';
      }

      // Marker position slightly offset from source boundary
      const mx = Math.round((fromN.x * 2 + toN.x) / 3);
      const my = Math.round((fromN.y * 2 + toN.y) / 3);

      markers.push({
        edgeId: conn.id,
        sourceSectionId: srcSec.id,
        targetSectionId: tgtSec.id,
        targetSectionTitle: tgtSec.title,
        x: mx,
        y: my,
        direction,
        label: `➔ ${tgtSec.hashKey.toUpperCase()}`,
      });
    }

    return markers;
  }
}
