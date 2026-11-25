/**
 * SafeFlow AI - Clean P&ID Viewer Configuration (Overhaul: Large Canvas & Crossing-Minimized Layout)
 * Strictly zero hardcoded magic numbers: all layout, routing, styling, and section navigation tolerances reside here.
 */

export interface LineStyleConfig {
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  showCircleTap?: boolean;
}

export interface PidViewerConfigSchema {
  layout: {
    scale_factor: number;
    min_node_gap_px: number;
    multistart: number;
    retry_limit: number;
    max_crossings: number;
    weights: {
      w_cross: number;
      w_bend: number;
      w_len: number;
      w_dev: number;
    };
  };
  layers: {
    branch_up: string[];
    branch_down: string[];
  };
  instrument: {
    max_tap_distance_px: number;
  };
  corridors: {
    signal_top: boolean;
    signal_bottom: boolean;
    corridor_gap_px: number;
  };
  routing: {
    grid_resolution_px: number;
    track_spacing_px: number;
    port_stub_px: number;
    bend_penalty: number;
    crossing_penalty: number;
    near_obstacle_penalty: number;
    hop_min_gap_px: number;
    hop_radius_px: number;
    junction_dot_radius_px: number;
    orthogonal_only: boolean;
  };
  sections: {
    mode: 'functional' | 'grid';
    grid_cols: number;
    grid_rows: number;
    padding_px: number;
  };
  zoom: {
    overview_max: number;
    section_min: number;
    detail_min: number;
    animate_ms: number;
  };
  labels: {
    font_px: number;
    halo_px: number;
    candidate_positions: ('below' | 'right' | 'above' | 'left')[];
  };
  canvas: {
    defaultWidth: number;
    defaultHeight: number;
    backgroundColor: string;
    primaryLineworkColor: string;
    accentSelectedColor: string;
    accentHoverColor: string;
    accentWarningColor: string;
    dimmedOpacity: number;
  };
  lineStyles: Record<string, LineStyleConfig>;
}

export const PID_VIEWER_CONFIG: PidViewerConfigSchema = {
  layout: {
    scale_factor: 3.0,
    min_node_gap_px: 48,
    multistart: 4,
    retry_limit: 3,
    max_crossings: 6,
    weights: {
      w_cross: 10.0,
      w_bend: 1.0,
      w_len: 0.2,
      w_dev: 0.5,
    },
  },
  layers: {
    branch_up: ['relief', 'flare'],
    branch_down: ['drain', 'blowdown'],
  },
  instrument: {
    max_tap_distance_px: 60,
  },
  corridors: {
    signal_top: true,
    signal_bottom: true,
    corridor_gap_px: 30,
  },
  routing: {
    grid_resolution_px: 12,
    track_spacing_px: 18,
    port_stub_px: 24,
    bend_penalty: 6,
    crossing_penalty: 40,
    near_obstacle_penalty: 4,
    hop_min_gap_px: 12,
    hop_radius_px: 6,
    junction_dot_radius_px: 3.5,
    orthogonal_only: true,
  },
  sections: {
    mode: 'functional',
    grid_cols: 3,
    grid_rows: 2,
    padding_px: 80,
  },
  zoom: {
    overview_max: 0.35,
    section_min: 0.35,
    detail_min: 1.2,
    animate_ms: 350,
  },
  labels: {
    font_px: 12,
    halo_px: 3,
    candidate_positions: ['below', 'right', 'above', 'left'],
  },
  canvas: {
    defaultWidth: 6144,
    defaultHeight: 4096,
    backgroundColor: '#ffffff',
    primaryLineworkColor: '#0b192c',
    accentSelectedColor: '#2563eb',
    accentHoverColor: '#0284c7',
    accentWarningColor: '#d97706',
    dimmedOpacity: 0.18,
  },
  lineStyles: {
    process: {
      stroke: '#0b192c',
      strokeWidth: 2.5,
    },
    instrument_signal: {
      stroke: '#0284c7',
      strokeWidth: 1.25,
      strokeDasharray: '5,3',
    },
    instrument_connection: {
      stroke: '#334155',
      strokeWidth: 1.25,
      showCircleTap: true,
    },
    electrical: {
      stroke: '#7c3aed',
      strokeWidth: 1.25,
      strokeDasharray: '8,3,2,3',
    },
    relief_flare: {
      stroke: '#b91c1c',
      strokeWidth: 2.25,
    },
    utility_drain: {
      stroke: '#475569',
      strokeWidth: 2.0,
    },
    suspicious_review: {
      stroke: '#d97706',
      strokeWidth: 2.25,
      strokeDasharray: '6,4',
    },
  },
};
