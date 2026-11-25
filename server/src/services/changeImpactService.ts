/**
 * SafeFlow AI Enterprise - Change Impact Analysis Engine (Phase 8)
 * Architected by Shlok
 *
 * Implements structured topology and specification change impact analysis:
 * - Traces downstream fluid transport and upstream pressure dependencies
 * - Strictly excludes non-physical instrument signals from flow propagation
 * - Identifies impacted PHA study nodes and deviations
 * - Produces actionable engineering reassessment recommendations
 */

import {
  ChangeImpactAnalysisResult,
  ChangeImpactConnectedLine,
  ChangeImpactConnectedStream,
  ChangeImpactPhaNode,
  EquipmentTag,
  PipingLine,
  ProcessStream,
  PhaStudyNode,
} from '../types';

export function analyzeChangeImpact(
  projectId: string,
  targetEntityType: 'equipment' | 'line' | 'stream' | 'drawing',
  targetIdOrTag: string,
  changeType: 'update' | 'delete' | 'create' | 'limit_change' | 'stream_assignment' = 'update',
  changeDescription = 'Entity modified',
  equipmentList: EquipmentTag[] = [],
  linesList: PipingLine[] = [],
  streamsList: ProcessStream[] = [],
  phaNodesList: PhaStudyNode[] = []
): ChangeImpactAnalysisResult {
  const normTarget = (targetIdOrTag || '').trim().toUpperCase();

  let targetTagOrNumber = targetIdOrTag;
  let directlyAffectedEntity: any = null;

  // 1. Locate target entity
  if (targetEntityType === 'equipment') {
    const eq = equipmentList.find(
      (e) => e.id === targetIdOrTag || (e.tag && e.tag.trim().toUpperCase() === normTarget)
    );
    if (eq) {
      directlyAffectedEntity = eq;
      targetTagOrNumber = eq.tag;
    }
  } else if (targetEntityType === 'line') {
    const line = linesList.find(
      (l) => l.id === targetIdOrTag || (l.line_number && l.line_number.trim().toUpperCase() === normTarget)
    );
    if (line) {
      directlyAffectedEntity = line;
      targetTagOrNumber = line.line_number;
    }
  } else if (targetEntityType === 'stream') {
    const stream = streamsList.find(
      (s) => s.id === targetIdOrTag || (s.stream_number && s.stream_number.trim().toUpperCase() === normTarget)
    );
    if (stream) {
      directlyAffectedEntity = stream;
      targetTagOrNumber = stream.stream_number;
    }
  }

  // 2. Identify physical lines (strictly exclude instrument signals and non-process structural links)
  const isProcessOrUtilityLine = (l: PipingLine): boolean => {
    const fType = (l.functional_type || 'piping_line').toLowerCase();
    if (fType.includes('signal') || fType.includes('instrument') || fType.includes('electrical')) {
      return false;
    }
    if (fType.includes('non_process') || fType.includes('structural')) {
      return false;
    }
    return true; // piping_line and utility_connection are included
  };

  const connectedLines: ChangeImpactConnectedLine[] = [];
  const connectedStreams: ChangeImpactConnectedStream[] = [];
  const downstreamEquipment: string[] = [];
  const upstreamEquipment: string[] = [];

  const targetEqTag = targetEntityType === 'equipment' ? targetTagOrNumber : null;
  const targetLineNum = targetEntityType === 'line' ? targetTagOrNumber : null;

  // 3. Topology Tracing
  if (targetEqTag) {
    // Find lines directly attached to this equipment
    for (const l of linesList) {
      const fromMatch = (l.from_equipment || '').trim().toUpperCase() === targetEqTag.toUpperCase();
      const toMatch = (l.to_equipment || '').trim().toUpperCase() === targetEqTag.toUpperCase();

      if (fromMatch || toMatch) {
        const isUtility = (l.functional_type || '').includes('utility');
        connectedLines.push({
          id: l.id,
          line_number: l.line_number,
          direction: l.flow_direction || 'forward',
          from_equipment: l.from_equipment,
          to_equipment: l.to_equipment,
          is_utility: isUtility,
        });
      }
    }

    // Downstream traversal (BFS) using only material flow lines
    const downstreamQueue: string[] = [targetEqTag.toUpperCase()];
    const visitedDownstream = new Set<string>([targetEqTag.toUpperCase()]);

    while (downstreamQueue.length > 0) {
      const current = downstreamQueue.shift()!;
      for (const l of linesList) {
        if (!isProcessOrUtilityLine(l)) continue;
        const from = (l.from_equipment || '').trim().toUpperCase();
        const to = (l.to_equipment || '').trim().toUpperCase();
        const dir = (l.flow_direction || 'forward').toLowerCase();

        let nextNode: string | null = null;
        if (dir === 'forward' && from === current && to) {
          nextNode = to;
        } else if (dir === 'reverse' && to === current && from) {
          nextNode = from;
        } else if (dir === 'bidirectional') {
          if (from === current && to) nextNode = to;
          else if (to === current && from) nextNode = from;
        }

        if (nextNode && !visitedDownstream.has(nextNode)) {
          visitedDownstream.add(nextNode);
          downstreamEquipment.push(nextNode);
          downstreamQueue.push(nextNode);
        }
      }
    }

    // Upstream traversal (BFS)
    const upstreamQueue: string[] = [targetEqTag.toUpperCase()];
    const visitedUpstream = new Set<string>([targetEqTag.toUpperCase()]);

    while (upstreamQueue.length > 0) {
      const current = upstreamQueue.shift()!;
      for (const l of linesList) {
        if (!isProcessOrUtilityLine(l)) continue;
        const from = (l.from_equipment || '').trim().toUpperCase();
        const to = (l.to_equipment || '').trim().toUpperCase();
        const dir = (l.flow_direction || 'forward').toLowerCase();

        let prevNode: string | null = null;
        if (dir === 'forward' && to === current && from) {
          prevNode = from;
        } else if (dir === 'reverse' && from === current && to) {
          prevNode = to;
        } else if (dir === 'bidirectional') {
          if (to === current && from) prevNode = from;
          else if (from === current && to) prevNode = to;
        }

        if (prevNode && !visitedUpstream.has(prevNode)) {
          visitedUpstream.add(prevNode);
          upstreamEquipment.push(prevNode);
          upstreamQueue.push(prevNode);
        }
      }
    }
  } else if (targetLineNum) {
    const l = linesList.find((x) => x.line_number.toUpperCase() === targetLineNum.toUpperCase());
    if (l) {
      connectedLines.push({
        id: l.id,
        line_number: l.line_number,
        direction: l.flow_direction || 'forward',
        from_equipment: l.from_equipment,
        to_equipment: l.to_equipment,
        is_utility: (l.functional_type || '').includes('utility'),
      });
      if (l.to_equipment) downstreamEquipment.push(l.to_equipment);
      if (l.from_equipment) upstreamEquipment.push(l.from_equipment);
    }
  }

  // 4. Trace Streams
  for (const st of streamsList) {
    const sourceMatch = targetEqTag && (st.source_equipment_tag || '').toUpperCase() === targetEqTag.toUpperCase();
    const destMatch = targetEqTag && (st.destination_equipment_tag || '').toUpperCase() === targetEqTag.toUpperCase();
    const lineMatch = targetLineNum && (st.connected_line_numbers || []).some(
      (ln) => ln.toUpperCase() === targetLineNum.toUpperCase()
    );
    const connLineMatch = (st.connected_line_numbers || []).some((ln) =>
      connectedLines.some((cl) => cl.line_number.toUpperCase() === ln.toUpperCase())
    );

    if (sourceMatch || destMatch || lineMatch || connLineMatch) {
      connectedStreams.push({
        id: st.id,
        stream_number: st.stream_number,
        source_equipment_tag: st.source_equipment_tag,
        destination_equipment_tag: st.destination_equipment_tag,
        connected_lines: st.connected_line_numbers || [],
      });
    }
  }

  // 5. Impacted PHA Study Nodes
  const impactedPhaNodes: ChangeImpactPhaNode[] = [];
  const allAffectedTags = new Set([
    ...(targetEqTag ? [targetEqTag.toUpperCase()] : []),
    ...downstreamEquipment.map((t) => t.toUpperCase()),
  ]);
  const allAffectedLineNums = new Set([
    ...(targetLineNum ? [targetLineNum.toUpperCase()] : []),
    ...connectedLines.map((cl) => cl.line_number.toUpperCase()),
  ]);

  for (const node of phaNodesList) {
    const reasons: string[] = [];
    const nodeTags = (node.equipment_tags || []).map((t) => t.toUpperCase());
    const nodeLines = (node.line_numbers || []).map((ln) => ln.toUpperCase());

    // Check direct target presence
    if (targetEqTag && nodeTags.includes(targetEqTag.toUpperCase())) {
      reasons.push(`Node explicitly contains modified equipment ${targetEqTag}`);
    }
    if (targetLineNum && nodeLines.includes(targetLineNum.toUpperCase())) {
      reasons.push(`Node explicitly contains modified process line ${targetLineNum}`);
    }

    // Check downstream equipment presence
    for (const dTag of downstreamEquipment) {
      if (nodeTags.includes(dTag.toUpperCase()) && !reasons.some((r) => r.includes(dTag))) {
        reasons.push(`Contains downstream equipment ${dTag} fed by modified source`);
      }
    }

    // Check connected lines
    for (const cl of connectedLines) {
      if (nodeLines.includes(cl.line_number.toUpperCase()) && !reasons.some((r) => r.includes(cl.line_number))) {
        reasons.push(`Contains connected line ${cl.line_number}`);
      }
    }

    // Check streams
    for (const cs of connectedStreams) {
      if (
        (node.incoming_stream_ids || []).includes(cs.id) ||
        (node.outgoing_stream_ids || []).includes(cs.id)
      ) {
        reasons.push(`Contains linked process stream ${cs.stream_number}`);
      }
    }

    if (reasons.length > 0) {
      impactedPhaNodes.push({
        id: node.id,
        node_id: node.node_id,
        name: node.name,
        current_status: node.status,
        impact_reasons: reasons,
      });
    }
  }

  // 6. Calculate Severity Level
  let severityLevel: 'critical' | 'warning' | 'informational' = 'informational';
  const descLower = changeDescription.toLowerCase();
  const isLimitOrSafetyCritical =
    changeType === 'limit_change' ||
    descLower.includes('pressure') ||
    descLower.includes('temperature') ||
    descLower.includes('relief') ||
    descLower.includes('mawp') ||
    descLower.includes('limit violation') ||
    descLower.includes('toxic') ||
    changeType === 'delete';

  if (isLimitOrSafetyCritical && impactedPhaNodes.length > 0) {
    severityLevel = 'critical';
  } else if (impactedPhaNodes.length > 0 || changeType === 'stream_assignment' || changeType === 'update') {
    severityLevel = 'warning';
  }

  // 7. Recommendations
  const recommendations: string[] = [];
  if (impactedPhaNodes.length > 0) {
    recommendations.push(
      `Reassess ${impactedPhaNodes.length} PHA study node(s) (${impactedPhaNodes.map((n) => n.node_id).join(', ')}) due to ${changeDescription}.`
    );
  }
  if (downstreamEquipment.length > 0) {
    recommendations.push(
      `Verify downstream hydraulic, temperature, and overpressure capacity on ${downstreamEquipment.join(', ')}.`
    );
  }
  if (connectedStreams.length > 0) {
    recommendations.push(
      `Validate stream mass balance and composition basis on streams: ${connectedStreams.map((s) => s.stream_number).join(', ')}.`
    );
  }
  if (severityLevel === 'critical') {
    recommendations.push(
      'Mandatory Engineering Review: Critical safety limit or topology change requires re-approval of process graph before conducting PHA sessions.'
    );
  }

  return {
    project_id: projectId,
    target_entity_type: targetEntityType,
    target_entity_id: targetIdOrTag,
    target_entity_tag_or_number: targetTagOrNumber,
    change_type: changeType,
    change_description: changeDescription,
    timestamp: new Date().toISOString(),
    directly_affected_entity: directlyAffectedEntity,
    connected_lines: connectedLines,
    connected_streams: connectedStreams,
    downstream_equipment: downstreamEquipment,
    upstream_equipment: upstreamEquipment,
    impacted_pha_nodes: impactedPhaNodes,
    impacted_deviations_count: impactedPhaNodes.length * 3, // Estimated standard deviation scenarios per node
    severity_level: severityLevel,
    requires_pha_reassessment: impactedPhaNodes.length > 0,
    reassessment_recommendations: recommendations,
  };
}
