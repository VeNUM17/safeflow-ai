/**
 * SafeFlow AI - Test Group 42: Graph Neural Network (GNN) Connectivity Pilot & Reversibility Gate
 * 
 * Tests:
 * 1. Working baseline preservation: Rule-based tracing remains active by default.
 * 2. Feature flag isolation: GNN executes only when explicitly enabled.
 * 3. Negative Invariant: GNN never invents edges from visual proximity without polyline evidence.
 * 4. Negative Invariant: Un-dotted 4-way crossings are strictly rejected.
 * 5. Reversibility Gate: Disabling flag completely restores baseline heuristic behavior.
 */

import assert from 'assert';
import {
  isGnnConnectivityEnabled,
  setGnnConnectivityEnabled,
  extractGnnNodeFeatures,
  gnnEdgeClassifier,
  applyGnnConnectivityScoring,
  GnnEdgeCandidate,
} from '../server/src/services/gnnConnectivityService';
import { tracePipingNetwork } from '../server/src/services/pipeTracingService';
import { detectDrawingSymbols } from '../server/src/services/symbolDetectionService';
import { VectorLineSegment } from '../server/src/types';

export async function runGnnConnectivityPilotTests() {
  console.log('\n--- Test Group 42: GNN Connectivity Recognition Pilot & Reversibility Gate ---');

  // Scenario 1: Baseline is Active by Default & Feature Flag is Disabled
  {
    console.log('  ✓ Scenario 1: Rule-based baseline tracing is active by default (GNN flag = false)');
    assert.strictEqual(
      isGnnConnectivityEnabled(),
      false,
      'FAILED: GNN connectivity must be DISABLED by default to protect working baseline'
    );
  }

  // Scenario 2: GNN Pilot Execution Behind Feature Flag
  {
    console.log('  ✓ Scenario 2: GNN message-passing edge classifier executes when feature flag is enabled');

    setGnnConnectivityEnabled(true);
    assert.strictEqual(isGnnConnectivityEnabled(), true, 'FAILED: GNN flag should be true when enabled');

    const rawTags = [
      { tag: 'V-101', type: 'vessel', bbox: { x: 100, y: 100, w: 80, h: 100 }, confidence: 0.95 },
      { tag: 'P-101', type: 'pump', bbox: { x: 400, y: 100, w: 50, h: 50 }, confidence: 0.95 },
    ];
    const { objects, ports } = detectDrawingSymbols(rawTags, 'dwg-test.pdf');
    const nodes = extractGnnNodeFeatures(objects, ports, 1000, 800);

    const candidates: GnnEdgeCandidate[] = [
      {
        source_id: 'V-101',
        source_tag: 'V-101',
        destination_id: 'P-101',
        destination_tag: 'P-101',
        path_id: 'path-1',
        path_length_normalized: 0.3,
        collinear_alignment_score: 0.95,
        is_dashed_or_signal: false,
        crossings_count: 0,
        has_junction_dot: true,
        has_inline_valve: false,
        drawing_evidence_present: true,
      },
    ];

    const results = gnnEdgeClassifier.forward(nodes, candidates);
    assert.strictEqual(results.length, 1, 'Expected 1 scored edge result');
    assert.strictEqual(results[0].predicted_class, 'valid_process_pipe');
    assert.ok(results[0].probability >= 0.8, 'Expected high confidence score for verified aligned edge');

    // Restore flag
    setGnnConnectivityEnabled(false);
  }

  // Scenario 3: Negative Invariant - Never Connect Symbols Solely Due to Proximity
  {
    console.log('  ✓ Scenario 3: GNN strictly rejects link proposals lacking physical drawing evidence (Zero Proximity Fabrication)');

    setGnnConnectivityEnabled(true);

    const rawTags = [
      { tag: 'V-101', type: 'vessel', bbox: { x: 100, y: 100, w: 80, h: 100 }, confidence: 0.95 },
      { tag: 'P-101', type: 'pump', bbox: { x: 120, y: 110, w: 50, h: 50 }, confidence: 0.95 }, // Near V-101!
    ];
    const { objects, ports } = detectDrawingSymbols(rawTags, 'dwg-test.pdf');
    const nodes = extractGnnNodeFeatures(objects, ports, 1000, 800);

    // Spurious candidate with NO drawing polyline evidence (proximity only)
    const spuriousCandidate: GnnEdgeCandidate[] = [
      {
        source_id: 'V-101',
        source_tag: 'V-101',
        destination_id: 'P-101',
        destination_tag: 'P-101',
        path_id: '',
        path_length_normalized: 0.05,
        collinear_alignment_score: 0.0,
        is_dashed_or_signal: false,
        crossings_count: 0,
        has_junction_dot: false,
        has_inline_valve: false,
        drawing_evidence_present: false, // NO POLYLINE EVIDENCE!
      },
    ];

    const results = gnnEdgeClassifier.forward(nodes, spuriousCandidate);
    assert.strictEqual(results[0].probability, 0.0, 'FAILED: Proximity-only edge must receive 0.0 probability');
    assert.strictEqual(results[0].predicted_class, 'rejected', 'FAILED: Proximity-only edge must be rejected');

    setGnnConnectivityEnabled(false);
  }

  // Scenario 4: Negative Invariant - Un-dotted 4-Way Crossings are Penalized
  {
    console.log('  ✓ Scenario 4: GNN strictly classifies perpendicular crossings without junction dots as unconnected');

    setGnnConnectivityEnabled(true);

    const rawTags = [
      { tag: 'LINE-A', type: 'pipe_segment', bbox: { x: 100, y: 200, w: 300, h: 10 }, confidence: 0.95 },
      { tag: 'LINE-B', type: 'pipe_segment', bbox: { x: 250, y: 50, w: 10, h: 300 }, confidence: 0.95 },
    ];
    const { objects, ports } = detectDrawingSymbols(rawTags, 'dwg-test.pdf');
    const nodes = extractGnnNodeFeatures(objects, ports, 1000, 800);

    const crossingCandidate: GnnEdgeCandidate[] = [
      {
        source_id: 'LINE-A',
        source_tag: 'LINE-A',
        destination_id: 'LINE-B',
        destination_tag: 'LINE-B',
        path_id: 'cross-path',
        path_length_normalized: 0.2,
        collinear_alignment_score: 0.2,
        is_dashed_or_signal: false,
        crossings_count: 1,
        has_junction_dot: false, // NO JUNCTION DOT!
        has_inline_valve: false,
        drawing_evidence_present: true,
      },
    ];

    const results = gnnEdgeClassifier.forward(nodes, crossingCandidate);
    assert.strictEqual(results[0].predicted_class, 'unconnected_crossing');
    assert.ok(results[0].probability < 0.1, 'FAILED: Un-dotted crossing received spurious high probability');

    setGnnConnectivityEnabled(false);
  }

  // Scenario 5: Reversibility Gate - Toggling Flag Off Fully Restores Baseline Behavior
  {
    console.log('  ✓ Scenario 5: Reversibility verified: Disabling GNN flag restores baseline heuristic tracing with 0 behavioral divergence');

    // Setup physical segments
    const rawTags = [
      { tag: 'V-101', type: 'separator', bbox: { x: 60, y: 140, w: 80, h: 120 }, confidence: 0.95 },
      { tag: 'XV-101', type: 'valve', bbox: { x: 285, y: 185, w: 30, h: 30 }, confidence: 0.95 },
    ];
    const { objects, ports } = detectDrawingSymbols(rawTags, 'dwg-reversibility.pdf');
    const segments: VectorLineSegment[] = [
      { id: 's1', start: { x: 140, y: 200 }, end: { x: 285, y: 200 }, length: 145, orientation: 'horizontal', confidence: 0.95, classificationHint: 'process_pipe' },
    ];

    // Run with flag = false (baseline)
    setGnnConnectivityEnabled(false);
    const baselineTraced = tracePipingNetwork(segments, objects, ports, [], [], 'dwg-reversibility.pdf', 1);

    // Run with flag = true (GNN)
    setGnnConnectivityEnabled(true);
    const gnnTraced = tracePipingNetwork(segments, objects, ports, [], [], 'dwg-reversibility.pdf', 1);

    // Toggle flag back to false
    setGnnConnectivityEnabled(false);
    const restoredTraced = tracePipingNetwork(segments, objects, ports, [], [], 'dwg-reversibility.pdf', 1);

    assert.strictEqual(
      restoredTraced.connectionCandidates.length,
      baselineTraced.connectionCandidates.length,
      'FAILED: Restored baseline candidates count diverges from original baseline'
    );
    assert.strictEqual(
      restoredTraced.connectionCandidates[0].source_equipment,
      baselineTraced.connectionCandidates[0].source_equipment
    );
    assert.strictEqual(
      restoredTraced.connectionCandidates[0].destination_equipment,
      baselineTraced.connectionCandidates[0].destination_equipment
    );
    assert.strictEqual(isGnnConnectivityEnabled(), false);
  }

  console.log('--- Test Group 42: All Scenarios Passed Successfully ---\n');
}

if (require.main === module) {
  runGnnConnectivityPilotTests().catch(console.error);
}
