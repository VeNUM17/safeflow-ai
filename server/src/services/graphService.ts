import { v4 as uuidv4 } from 'uuid';
import {
  EquipmentTag,
  PipingLine,
  ChemicalRecord,
  ChemicalConflict,
  GraphNode,
  GraphEdge,
  TopologyGraph,
  TopologyGraphSummary,
  ChemicalMixingAlert,
  MixingAlertStatus,
} from '../types';

export function buildProcessTopologyGraph(
  equipmentList: EquipmentTag[],
  linesList: PipingLine[],
  chemicalsList: ChemicalRecord[],
  conflictsList: ChemicalConflict[] = []
): TopologyGraph {
  const chemMap = new Map<string, ChemicalRecord>();
  for (const c of chemicalsList) {
    chemMap.set(c.id, c);
  }

  // Active chemical conflicts lookup
  const unresolvedConflictsByCas = new Map<string, ChemicalConflict[]>();
  const unresolvedConflictsByName = new Map<string, ChemicalConflict[]>();
  for (const conf of conflictsList) {
    if (conf.status === 'unresolved') {
      if (conf.cas_number) {
        const list = unresolvedConflictsByCas.get(conf.cas_number.trim()) || [];
        list.push(conf);
        unresolvedConflictsByCas.set(conf.cas_number.trim(), list);
      }
      if (conf.chemical_name) {
        const nameKey = conf.chemical_name.trim().toLowerCase();
        const list = unresolvedConflictsByName.get(nameKey) || [];
        list.push(conf);
        unresolvedConflictsByName.set(nameKey, list);
      }
    }
  }

  // Track node degree for isolated node detection
  const nodeDegreeMap = new Map<string, number>();
  for (const eq of equipmentList) {
    nodeDegreeMap.set(eq.tag.toUpperCase(), 0);
  }

  for (const line of linesList) {
    const from = (line.from_equipment || '').toUpperCase();
    const to = (line.to_equipment || '').toUpperCase();
    if (nodeDegreeMap.has(from)) {
      nodeDegreeMap.set(from, (nodeDegreeMap.get(from) || 0) + 1);
    }
    if (nodeDegreeMap.has(to)) {
      nodeDegreeMap.set(to, (nodeDegreeMap.get(to) || 0) + 1);
    }
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const mixingAlerts: ChemicalMixingAlert[] = [];
  const provisionalAlerts: string[] = [];

  // 1. Map equipment to GraphNode
  for (const eq of equipmentList) {
    const tagUpper = eq.tag.toUpperCase();
    const chem = eq.assigned_chemical_id ? chemMap.get(eq.assigned_chemical_id) : undefined;
    const nodeAlerts: string[] = [];
    const isIsolated = (nodeDegreeMap.get(tagUpper) || 0) === 0 && eq.equipment_type !== 'instrument';

    let hasConflict = false;
    let conflictDetails: string | null = null;
    let conflictValues: { source: string; value: string; revision_date: string; limit_type: string }[] | undefined;

    if (chem) {
      const chemCas = chem.cas_number.value?.trim();
      const chemName = (chem.chemical_name.value || '').trim().toLowerCase();
      const matchingConflicts = (chemCas ? unresolvedConflictsByCas.get(chemCas) : undefined) ||
        unresolvedConflictsByName.get(chemName) || [];

      if (matchingConflicts.length > 0) {
        hasConflict = true;
        const pelConflict = matchingConflicts.find((c) => c.field_key === 'permissible_exposure_limits') || matchingConflicts[0];
        conflictDetails = `Active ${pelConflict.field_label} conflict between ${pelConflict.entries.length} source documents.`;
        conflictValues = pelConflict.entries.map((e) => ({
          source: e.document_name,
          value: e.value,
          revision_date: e.revision_date,
          limit_type: e.value.includes('PEL') ? 'OSHA PEL' : e.value.includes('TLV') ? 'ACGIH TLV' : 'Occupational Exposure Limit',
        }));
      }
    }

    if (isIsolated) {
      nodeAlerts.push(`[ISOLATED NODE]: Equipment "${eq.tag}" has 0 piping connections. Verify if standalone, vent, or unmapped.`);
    }

    if (eq.status === 'unresolved' || eq.equipment_type === 'other') {
      nodeAlerts.push(`[UNRESOLVED TAXONOMY]: Classification pending engineering verification.`);
    }

    if (hasConflict && conflictDetails) {
      nodeAlerts.push(`[PSI SOURCE CONFLICT]: ${conflictDetails}`);
    }

    nodes.push({
      id: eq.tag,
      tag: eq.tag,
      label: `${eq.tag} (${eq.description || eq.equipment_type})`,
      type: eq.equipment_type,
      status: eq.status,
      confidence: eq.confidence,
      machine_tag: eq.machine_tag,
      machine_type: eq.machine_type,
      machine_description: eq.machine_description,
      is_isolated: isIsolated,
      has_active_conflict: hasConflict,
      active_conflict_details: conflictDetails,
      chemical: chem
        ? {
            id: chem.id,
            name: chem.chemical_name.user_value || chem.chemical_name.value || 'Unknown',
            cas: chem.cas_number.user_value || chem.cas_number.value || 'N/A',
            pel: chem.psi_parameters.permissible_exposure_limits.user_value || chem.psi_parameters.permissible_exposure_limits.value,
            toxicity: chem.psi_parameters.toxicity.user_value || chem.psi_parameters.toxicity.value,
            review_status: chem.chemical_name.review_status,
            has_conflict: hasConflict,
            conflict_values: conflictValues,
          }
        : undefined,
      alerts: nodeAlerts,
      specifications: eq.specifications,
      specifications_revision: eq.specifications_revision,
      drawing_id: eq.drawing_id,
      drawing_revision: eq.drawing_revision,
      drawing_element_id: eq.drawing_element_id,
    });
  }

  // 2. Map piping lines to GraphEdge
  for (const line of linesList) {
    const isSignal = line.functional_type === 'signal_line';
    const chem = (!isSignal && line.assigned_chemical_id) ? chemMap.get(line.assigned_chemical_id) : undefined;
    const lineAlerts: string[] = [];

    // Critical rule: Signal lines are NOT chemical streams
    if (isSignal) {
      // Signal loops transmit electrical/pneumatic signals, not process fluid
      if (line.assigned_chemical_id) {
        lineAlerts.push('[CRITICAL ERROR]: Instrument signal line incorrectly assigned a process chemical fluid.');
      }
    } else if (chem) {
      const chemName = (chem.chemical_name.user_value || chem.chemical_name.value || '').toLowerCase();
      const mat = (line.material || '').toLowerCase();

      // Metallurgy hazard: Ammonia with copper/brass/bronze/zinc
      if (chemName.includes('ammonia') && (mat.includes('copper') || mat.includes('brass') || mat.includes('bronze') || mat.includes('zinc'))) {
        lineAlerts.push(
          `[CRITICAL METALLURGY HAZARD]: Ammonia stream routed through ${line.material} metallurgy. Rapid stress corrosion cracking risk!`
        );
      }

      // Acid in unlined carbon steel at high velocity/concentration
      if (chemName.includes('sulfuric acid') && mat.includes('cs') && !mat.includes('lined')) {
        lineAlerts.push(
          `[METALLURGY PRECAUTION]: Sulfuric acid stream in unlined Carbon Steel. Inspect temperature & concentration limits.`
        );
      }
    }

    if (line.flow_direction === 'unknown') {
      lineAlerts.push('[DIRECTION UNRESOLVED]: Flow direction not confirmed on P&ID.');
    }

    if (line.status === 'provisional' || line.status === 'unresolved') {
      provisionalAlerts.push(`Line ${line.line_number} connection is provisional / unconfirmed.`);
    }

    edges.push({
      id: line.id,
      source: line.from_equipment,
      target: line.to_equipment,
      line_number: line.line_number,
      stream_label: line.stream_label,
      size: line.size || '2"',
      material: line.material || 'CS',
      functional_type: line.functional_type || 'piping_line',
      flow_direction: line.flow_direction || 'forward',
      status: line.status,
      confidence: line.confidence,
      source_evidence: line.source,
      chemical: chem
        ? {
            name: chem.chemical_name.user_value || chem.chemical_name.value || 'Unknown',
            cas: chem.cas_number.user_value || chem.cas_number.value || 'N/A',
            pel: chem.psi_parameters.permissible_exposure_limits.user_value || chem.psi_parameters.permissible_exposure_limits.value,
            corrosivity: chem.psi_parameters.corrosivity_data.user_value || chem.psi_parameters.corrosivity_data.value,
            inadvertent_mixing: chem.psi_parameters.inadvertent_mixing_hazards.user_value || chem.psi_parameters.inadvertent_mixing_hazards.value,
          }
        : undefined,
      alerts: lineAlerts,
    });
  }

  // 3. Evidence-Grounded Chemical Mixing Pathway Analysis
  // Only process piping lines with physical connections are evaluated.
  for (const node of nodes) {
    const nodeTagUpper = node.tag.toUpperCase();

    // Find all process piping lines physically connected to this node
    const connectedProcessLines = edges.filter(
      (e) =>
        (e.source.toUpperCase() === nodeTagUpper || e.target.toUpperCase() === nodeTagUpper) &&
        e.functional_type === 'piping_line'
    );

    if (connectedProcessLines.length === 0) continue;

    // Collect chemicals present at this node: from connected lines AND node's assigned chemical
    interface ChemicalPresence {
      chemical: NonNullable<GraphEdge['chemical']>;
      edge?: GraphEdge;
      isNodeNative: boolean;
      flowDirectionToNode: 'inflow' | 'outflow' | 'bidirectional' | 'unknown';
    }

    const presences: ChemicalPresence[] = [];

    // Chemical native to vessel
    if (node.chemical) {
      presences.push({
        chemical: {
          name: node.chemical.name,
          cas: node.chemical.cas,
          pel: node.chemical.pel,
          corrosivity: null,
          inadvertent_mixing: null,
        },
        isNodeNative: true,
        flowDirectionToNode: 'inflow',
      });
    }

    // Chemicals carried by connected lines
    for (const edge of connectedProcessLines) {
      if (edge.chemical) {
        let dir: ChemicalPresence['flowDirectionToNode'] = 'unknown';
        if (edge.target.toUpperCase() === nodeTagUpper) {
          dir = edge.flow_direction === 'forward' ? 'inflow' : edge.flow_direction === 'reverse' ? 'outflow' : edge.flow_direction === 'bidirectional' ? 'bidirectional' : 'unknown';
        } else if (edge.source.toUpperCase() === nodeTagUpper) {
          dir = edge.flow_direction === 'forward' ? 'outflow' : edge.flow_direction === 'reverse' ? 'inflow' : edge.flow_direction === 'bidirectional' ? 'bidirectional' : 'unknown';
        }

        presences.push({
          chemical: edge.chemical,
          edge,
          isNodeNative: false,
          flowDirectionToNode: dir,
        });
      }
    }

    // Evaluate pairwise incompatibility
    for (let i = 0; i < presences.length; i++) {
      for (let j = i + 1; j < presences.length; j++) {
        const p1 = presences[i];
        const p2 = presences[j];

        const name1 = (p1.chemical.name || '').toLowerCase();
        const name2 = (p2.chemical.name || '').toLowerCase();

        // If same chemical, no mixing incompatibility
        if (p1.chemical.cas && p2.chemical.cas && p1.chemical.cas === p2.chemical.cas) continue;
        if (name1 === name2) continue;

        let isIncompatible = false;
        let hazardTitle = '';
        let reactionDesc = '';
        let sdsEvidence = '';

        // Pair 1: Ammonia + Bleach (Sodium Hypochlorite)
        if (
          (name1.includes('ammonia') && (name2.includes('bleach') || name2.includes('hypochlorite'))) ||
          (name2.includes('ammonia') && (name1.includes('bleach') || name1.includes('hypochlorite')))
        ) {
          isIncompatible = true;
          hazardTitle = 'Chloramine Gas Generation (Ammonia + Sodium Hypochlorite)';
          reactionDesc =
            'Inadvertent mixing of Ammonia (NH3) with Sodium Hypochlorite (Bleach) rapidly forms toxic, corrosive chloramine gas (monochloramine NH2Cl, dichloramine NHCl2, and nitrogen trichloride NCl3), releasing severe respiratory toxins with explosive decomposition potential.';
          sdsEvidence =
            'Section 10 (Stability & Reactivity) explicitly warns: Incompatible with hypochlorite bleach, strong oxidizers, copper, and zinc. Contact with bleach produces toxic chloramine gas.';
        }

        // Pair 2: Bleach + Acid
        else if (
          ((name1.includes('bleach') || name1.includes('hypochlorite')) && name2.includes('acid')) ||
          ((name2.includes('bleach') || name2.includes('hypochlorite')) && name1.includes('acid'))
        ) {
          isIncompatible = true;
          hazardTitle = 'Deadly Chlorine Gas Release (Bleach + Acid)';
          reactionDesc =
            'Acidification of aqueous sodium hypochlorite below pH 7 shifts equilibrium to liberate gaseous chlorine (Cl2), a dense pulmonary choking hazard and strong oxidizer.';
          sdsEvidence =
            'Section 10 explicitly lists acids as incompatible materials; acidification releases fatal chlorine gas.';
        }

        // Pair 3: Strong Acid + Strong Caustic (Violent Exotherm / Boiling)
        else if (
          (name1.includes('sulfuric acid') && (name2.includes('caustic') || name2.includes('sodium hydroxide'))) ||
          (name2.includes('sulfuric acid') && (name1.includes('caustic') || name1.includes('sodium hydroxide')))
        ) {
          isIncompatible = true;
          hazardTitle = 'Violent Exothermic Neutralization & Splattering (Acid + Caustic)';
          reactionDesc =
            'Concentrated sulfuric acid reacting with sodium hydroxide generates extreme heat of neutralization (exotherm > 100 °C), risking rapid boiling, violent splattering, and loss of containment.';
          sdsEvidence =
            'Section 10 warns of violent exothermic reaction with strong alkalis/bases.';
        }

        if (!isIncompatible) continue;

        // Determine Pathway Status based on evidence
        const edgesInvolved = [p1.edge, p2.edge].filter((e): e is GraphEdge => Boolean(e));
        const allEdgesConfirmed = edgesInvolved.length > 0 && edgesInvolved.every((e) => e.status === 'confirmed');
        const anyEdgeProvisional = edgesInvolved.some((e) => e.status === 'provisional' || e.status === 'unresolved');
        const anyDirectionUnknown = edgesInvolved.some((e) => e.flow_direction === 'unknown');

        // Check if there is an active inflow / transfer pathway
        const hasDirectInflowPathway =
          (p1.flowDirectionToNode === 'inflow' || p1.flowDirectionToNode === 'bidirectional') &&
          (p2.flowDirectionToNode === 'inflow' || p2.flowDirectionToNode === 'bidirectional' || p2.isNodeNative);

        let status: MixingAlertStatus = 'potential';
        const assumptions: string[] = [
          'Assumes piping lines connect without unmodeled blind flanges, check valves, or double block-and-bleed isolation.',
        ];

        if (anyEdgeProvisional || anyDirectionUnknown || node.status !== 'confirmed') {
          status = 'unresolved';
          assumptions.push('Extraction or line flow direction remains unverified on P&ID. Engineering field walkdown required.');
        } else if (allEdgesConfirmed && hasDirectInflowPathway) {
          status = 'validated';
          assumptions.push('Both piping lines and flow directions are confirmed entering common equipment.');
        } else {
          status = 'potential';
          assumptions.push('Hazardous transfer is topologically possible via tie-in line, but requires abnormal reverse flow, operator error, or valve leakage.');
        }

        const supportingLineNumbers = edgesInvolved.map((e) => e.line_number);
        const supportingEquipmentTags = [
          node.tag,
          ...edgesInvolved.map((e) => (e.source.toUpperCase() === nodeTagUpper ? e.target : e.source)),
        ];

        // Deduplicate
        const uniqueEqTags = Array.from(new Set(supportingEquipmentTags));

        const alertId = `mix-${node.tag}-${p1.chemical.cas || name1}-${p2.chemical.cas || name2}`;

        // Check if alert already exists for this pair on this node
        if (!mixingAlerts.some((a) => a.id === alertId)) {
          const alertObj: ChemicalMixingAlert = {
            id: alertId,
            hazard_title: hazardTitle,
            status,
            severity: 'critical',
            node_tag: node.tag,
            supporting_equipment_tags: uniqueEqTags,
            supporting_edge_ids: edgesInvolved.map((e) => e.id),
            supporting_line_numbers: supportingLineNumbers,
            chemicals_involved: [
              {
                chemical_id: p1.edge?.id || 'native-chem',
                chemical_name: p1.chemical.name,
                cas_number: p1.chemical.cas,
                role: p1.isNodeNative ? 'Vessel Contents' : 'Inflow Stream',
                flow_direction: p1.flowDirectionToNode,
                line_number: p1.edge?.line_number || 'Internal Inventory',
                connection_status: p1.edge?.status || node.status,
              },
              {
                chemical_id: p2.edge?.id || 'native-chem',
                chemical_name: p2.chemical.name,
                cas_number: p2.chemical.cas,
                role: p2.isNodeNative ? 'Vessel Contents' : 'Inflow Stream',
                flow_direction: p2.flowDirectionToNode,
                line_number: p2.edge?.line_number || 'Internal Inventory',
                connection_status: p2.edge?.status || node.status,
              },
            ],
            reaction_description: reactionDesc,
            sds_evidence: sdsEvidence,
            pid_evidence: `P&ID drawing demonstrates piping line(s) [${supportingLineNumbers.join(', ')}] connected to node ${node.tag}.`,
            assumptions,
            limitations:
              'A P&ID drawing establishes structural piping connectivity but does not alone prove actual operating flow conditions, differential pressure, valve lineups, or eliminate procedural workarounds.',
            created_at: new Date().toISOString(),
          };

          mixingAlerts.push(alertObj);

          // Add clean alert message to node
          node.alerts.push(
            `[${status.toUpperCase()} MIXING HAZARD]: ${hazardTitle}. ${reactionDesc.slice(0, 120)}...`
          );
        }
      }
    }
  }

  // 4. Compute Graph Statistics
  const confirmedProcessEdges = linesList.filter(
    (l) => (l.functional_type || 'piping_line') === 'piping_line' && l.status === 'confirmed'
  ).length;

  const provisionalCandidateEdges = linesList.filter(
    (l) => (l.functional_type || 'piping_line') === 'piping_line' && l.status === 'provisional'
  ).length;

  const unresolvedConnections = linesList.filter(
    (l) => l.status === 'unresolved' || l.flow_direction === 'unknown'
  ).length;

  const signalOnlyConnections = linesList.filter(
    (l) => l.functional_type === 'signal_line'
  ).length;

  const isolatedNodesCount = nodes.filter((n) => n.is_isolated).length;

  const counts: TopologyGraphSummary = {
    equipment_nodes_count: equipmentList.length,
    confirmed_process_edges_count: confirmedProcessEdges,
    provisional_candidate_edges_count: provisionalCandidateEdges,
    unresolved_connections_count: unresolvedConnections,
    signal_only_connections_count: signalOnlyConnections,
    isolated_nodes_count: isolatedNodesCount,
  };

  // Total localized alerts = actual mixing alerts + metallurgy alerts + isolated node warnings
  const metallurgyAlertsCount = edges.reduce((acc, e) => acc + e.alerts.length, 0);
  const totalLocalizedAlerts = mixingAlerts.length + metallurgyAlertsCount + isolatedNodesCount;

  return {
    nodes,
    edges,
    counts,
    mixing_alerts: mixingAlerts,
    localized_alerts_count: totalLocalizedAlerts,
    incompatible_mixing_detected: mixingAlerts.length > 0,
    provisional_alerts: provisionalAlerts,
  };
}
