import React from 'react';

/**
 * Standard Engineering Tables and Annotation Elements for P&ID-GPF-001-02
 * Renders Instrument Index, Valve Index, Line List, and Legend in Grid Row 6.
 */
export const EngineeringTables: React.FC = () => {
  return (
    <g id="engineering-tables-and-annotations" pointerEvents="none">
      {/* 1. INSTRUMENT INDEX TABLE (Grid A-B, Bottom Left) */}
      <g id="instrument-index-table" transform="translate(56, 3556)">
        <rect x="0" y="0" width="1030" height="500" fill="#ffffff" stroke="#0b192c" strokeWidth="2.5" />
        {/* Title */}
        <rect x="0" y="0" width="1030" height="34" fill="#f8fafc" stroke="#0b192c" strokeWidth="1.5" />
        <text x="515" y="23" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fontWeight="bold" fill="#0b192c">
          INSTRUMENT INDEX
        </text>

        {/* Header Row */}
        <g transform="translate(0, 34)">
          <rect x="0" y="0" width="1030" height="28" fill="#f1f5f9" stroke="#0b192c" strokeWidth="1" />
          <line x1="200" y1="0" x2="200" y2="28" stroke="#0b192c" strokeWidth="1" />
          <line x1="640" y1="0" x2="640" y2="28" stroke="#0b192c" strokeWidth="1" />
          <text x="100" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">TAG</text>
          <text x="420" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">DESCRIPTION</text>
          <text x="835" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">SERVICE</text>
        </g>

        {/* Data Rows */}
        {[
          { tag: 'PT-1001', desc: 'PRESSURE TRANSMITTER (DCS)', srv: 'INLET PRESSURE (DCS)' },
          { tag: 'PT-1002', desc: 'PRESSURE TRANSMITTER (SIS)', srv: 'HIGH-HIGH PRESSURE TRIP' },
          { tag: 'TT-1001', desc: 'TEMPERATURE TRANSMITTER', srv: 'INLET TEMPERATURE' },
          { tag: 'LT-1001', desc: 'LEVEL TRANSMITTER (DCS)', srv: 'LIQUID LEVEL (DCS)' },
          { tag: 'LT-1002', desc: 'LEVEL TRANSMITTER (SIS)', srv: 'HIGH-HIGH LEVEL TRIP' },
          { tag: 'PI-1001', desc: 'PRESSURE INDICATOR', srv: 'LOCAL INDICATION' },
          { tag: 'LG-1001', desc: 'LEVEL GAUGE (SIGHT GLASS)', srv: 'LOCAL INDICATION' },
          { tag: 'PIC-1001', desc: 'PRESSURE CONTROLLER', srv: 'DCS' },
          { tag: 'LIC-1001', desc: 'LEVEL CONTROLLER', srv: 'DCS' },
        ].map((row, idx) => {
          const y = 62 + idx * 46;
          return (
            <g key={`inst-row-${idx}`}>
              <line x1="0" y1={y + 46} x2="1030" y2={y + 46} stroke="#e2e8f0" strokeWidth="1" />
              <line x1="200" y1={y} x2="200" y2={y + 46} stroke="#cbd5e1" strokeWidth="1" />
              <line x1="640" y1={y} x2="640" y2={y + 46} stroke="#cbd5e1" strokeWidth="1" />
              <text x="100" y={y + 28} textAnchor="middle" fontFamily="monospace" fontSize="11" fontWeight="bold" fill="#0f172a">{row.tag}</text>
              <text x="216" y={y + 28} fontFamily="sans-serif" fontSize="10" fontWeight="600" fill="#334155">{row.desc}</text>
              <text x="656" y={y + 28} fontFamily="sans-serif" fontSize="10" fill="#475569">{row.srv}</text>
            </g>
          );
        })}
      </g>

      {/* 2. VALVE INDEX TABLE (Grid C-D, Bottom Center-Left) */}
      <g id="valve-index-table" transform="translate(1116, 3556)">
        <rect x="0" y="0" width="1200" height="500" fill="#ffffff" stroke="#0b192c" strokeWidth="2.5" />
        <rect x="0" y="0" width="1200" height="34" fill="#f8fafc" stroke="#0b192c" strokeWidth="1.5" />
        <text x="600" y="23" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fontWeight="bold" fill="#0b192c">
          VALVE INDEX
        </text>

        {/* Header Row */}
        <g transform="translate(0, 34)">
          <rect x="0" y="0" width="1200" height="28" fill="#f1f5f9" stroke="#0b192c" strokeWidth="1" />
          <line x1="180" y1="0" x2="180" y2="28" stroke="#0b192c" strokeWidth="1" />
          <line x1="560" y1="0" x2="560" y2="28" stroke="#0b192c" strokeWidth="1" />
          <line x1="680" y1="0" x2="680" y2="28" stroke="#0b192c" strokeWidth="1" />
          <line x1="1020" y1="0" x2="1020" y2="28" stroke="#0b192c" strokeWidth="1" />
          <text x="90" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">TAG</text>
          <text x="370" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">DESCRIPTION</text>
          <text x="620" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">SIZE</text>
          <text x="850" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">SERVICE</text>
          <text x="1110" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">FAIL POS.</text>
        </g>

        {/* Data Rows */}
        {[
          { tag: 'XV-1001', desc: 'ESD BALL VALVE (INLET)', size: '10"', srv: 'INLET ISOLATION', fail: 'FAIL CLOSED' },
          { tag: 'XV-1002', desc: 'ESD BALL VALVE (OUTLET)', size: '10"', srv: 'OUTLET ISOLATION', fail: 'FAIL CLOSED' },
          { tag: 'PCV-1001', desc: 'PRESSURE CONTROL VALVE', size: '6"', srv: 'INLET PRESSURE CONTROL', fail: 'FAIL OPEN' },
          { tag: 'LCV-1001', desc: 'LEVEL CONTROL VALVE', size: '4"', srv: 'LIQUID LEVEL CONTROL', fail: 'FAIL OPEN' },
          { tag: 'BDV-1001', desc: 'BLOWDOWN VALVE', size: '4"', srv: 'DEPRESSURISATION TO FLARE', fail: 'FAIL OPEN' },
          { tag: 'SDV-1001..04', desc: 'SHUTDOWN VALVES (WELLS)', size: '4"', srv: 'WELL INLET ISOLATION', fail: 'FAIL CLOSED' },
          { tag: 'NV-1001', desc: 'NEEDLE VALVE (PSV INLET BLOCK)', size: '1"', srv: 'PSV BLOCK', fail: '-' },
          { tag: 'NV-1002', desc: 'NEEDLE VALVE (PSV OUTLET BLOCK)', size: '1"', srv: 'PSV BLOCK', fail: '-' },
          { tag: 'BV-1001', desc: 'BALL VALVE (DRAIN ISOLATION)', size: '2"', srv: 'DRAIN ISOLATION', fail: '-' },
          { tag: 'BV-1002', desc: 'BALL VALVE (VENT ISOLATION)', size: '2"', srv: 'VENT ISOLATION', fail: '-' },
          { tag: 'CV-1001', desc: 'CHECK VALVE', size: '10"', srv: 'OUTLET BACKFLOW PREVENTION', fail: '-' },
        ].map((row, idx) => {
          const y = 62 + idx * 39;
          return (
            <g key={`valve-row-${idx}`}>
              <line x1="0" y1={y + 39} x2="1200" y2={y + 39} stroke="#e2e8f0" strokeWidth="1" />
              <line x1="180" y1={y} x2="180" y2={y + 39} stroke="#cbd5e1" strokeWidth="1" />
              <line x1="560" y1={y} x2="560" y2={y + 39} stroke="#cbd5e1" strokeWidth="1" />
              <line x1="680" y1={y} x2="680" y2={y + 39} stroke="#cbd5e1" strokeWidth="1" />
              <line x1="1020" y1={y} x2="1020" y2={y + 39} stroke="#cbd5e1" strokeWidth="1" />
              <text x="90" y={y + 24} textAnchor="middle" fontFamily="monospace" fontSize="10.5" fontWeight="bold" fill="#0f172a">{row.tag}</text>
              <text x="192" y={y + 24} fontFamily="sans-serif" fontSize="9.5" fontWeight="600" fill="#334155">{row.desc}</text>
              <text x="620" y={y + 24} textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill="#0f172a">{row.size}</text>
              <text x="696" y={y + 24} fontFamily="sans-serif" fontSize="9.5" fill="#475569">{row.srv}</text>
              <text x="1110" y={y + 24} textAnchor="middle" fontFamily="sans-serif" fontSize="9.5" fontWeight="bold" fill={row.fail === 'FAIL CLOSED' ? '#b91c1c' : row.fail === 'FAIL OPEN' ? '#15803d' : '#64748b'}>{row.fail}</text>
            </g>
          );
        })}
      </g>

      {/* 3. LINE LIST TABLE (Grid E-F, Bottom Center-Right) */}
      <g id="line-list-table" transform="translate(2346, 3556)">
        <rect x="0" y="0" width="1180" height="500" fill="#ffffff" stroke="#0b192c" strokeWidth="2.5" />
        <rect x="0" y="0" width="1180" height="34" fill="#f8fafc" stroke="#0b192c" strokeWidth="1.5" />
        <text x="590" y="23" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fontWeight="bold" fill="#0b192c">
          LINE LIST
        </text>

        {/* Header Row */}
        <g transform="translate(0, 34)">
          <rect x="0" y="0" width="1180" height="28" fill="#f1f5f9" stroke="#0b192c" strokeWidth="1" />
          <line x1="240" y1="0" x2="240" y2="28" stroke="#0b192c" strokeWidth="1" />
          <line x1="340" y1="0" x2="340" y2="28" stroke="#0b192c" strokeWidth="1" />
          <line x1="720" y1="0" x2="720" y2="28" stroke="#0b192c" strokeWidth="1" />
          <line x1="1080" y1="0" x2="1080" y2="28" stroke="#0b192c" strokeWidth="1" />
          <text x="120" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">LINE NO.</text>
          <text x="290" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">SIZE</text>
          <text x="530" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">FROM</text>
          <text x="900" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">TO</text>
          <text x="1130" y="19" textAnchor="middle" fontFamily="sans-serif" fontSize="10.5" fontWeight="bold" fill="#0f172a">SPEC</text>
        </g>

        {/* Data Rows */}
        {[
          { line: '10"-PG-00101-A1A', size: '10"', from: 'INLET HEADER (MV-1001)', to: 'XV-1001 INLET', spec: 'A1A' },
          { line: '10"-PG-00102-A1A', size: '10"', from: 'XV-1001 OUTLET', to: 'PG-1001 N1 (INLET)', spec: 'A1A' },
          { line: '10"-PG-00103-A1A', size: '10"', from: 'PG-1001 N2 (GAS OUTLET)', to: 'CV-1001 INLET', spec: 'A1A' },
          { line: '10"-PG-00104-A1A', size: '10"', from: 'CV-1001 OUTLET', to: 'XV-1002 INLET', spec: 'A1A' },
          { line: '6"-PG-00105-A1A', size: '6"', from: 'XV-1002 OUTLET', to: 'PCV-1001 INLET', spec: 'A1A' },
          { line: '6"-PG-00106-A1A', size: '6"', from: 'PCV-1001 OUTLET', to: 'HP SEPARATOR INLET', spec: 'A1A' },
          { line: '4"-PG-00107-A1A', size: '4"', from: 'PG-1001 N3 (LIQUID OUTLET)', to: 'LCV-1001 INLET', spec: 'A1A' },
          { line: '4"-PG-00108-A1A', size: '4"', from: 'LCV-1001 OUTLET', to: 'CONDENSATE/OIL SYSTEM', spec: 'A1A' },
          { line: '4"-FL-00101-A1A', size: '4"', from: 'BDV-1001 OUTLET', to: 'FLARE HEADER', spec: 'A1A' },
          { line: '4"-FL-00102-A1A', size: '4"', from: 'PSV-1001 OUTLET', to: 'FLARE HEADER', spec: 'A1A' },
          { line: '2"-DR-00101-A1A', size: '2"', from: 'PG-1001 N5 (DRAIN)', to: 'CLOSED DRAIN DRUM', spec: 'A1A' },
          { line: '2"-VT-00101-A1A', size: '2"', from: 'PG-1001 N6 (VENT)', to: 'FLARE HEADER', spec: 'A1A' },
        ].map((row, idx) => {
          const y = 62 + idx * 36;
          return (
            <g key={`line-row-${idx}`}>
              <line x1="0" y1={y + 36} x2="1180" y2={y + 36} stroke="#e2e8f0" strokeWidth="1" />
              <line x1="240" y1={y} x2="240" y2={y + 36} stroke="#cbd5e1" strokeWidth="1" />
              <line x1="340" y1={y} x2="340" y2={y + 36} stroke="#cbd5e1" strokeWidth="1" />
              <line x1="720" y1={y} x2="720" y2={y + 36} stroke="#cbd5e1" strokeWidth="1" />
              <line x1="1080" y1={y} x2="1080" y2={y + 36} stroke="#cbd5e1" strokeWidth="1" />
              <text x="120" y={y + 23} textAnchor="middle" fontFamily="monospace" fontSize="9.5" fontWeight="bold" fill="#0f172a">{row.line}</text>
              <text x="290" y={y + 23} textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill="#0f172a">{row.size}</text>
              <text x="252" y={y + 23} fontFamily="sans-serif" fontSize="9" fill="#334155">{row.from}</text>
              <text x="732" y={y + 23} fontFamily="sans-serif" fontSize="9" fill="#334155">{row.to}</text>
              <text x="1130" y={y + 23} textAnchor="middle" fontFamily="monospace" fontSize="9.5" fontWeight="bold" fill="#2563eb">{row.spec}</text>
            </g>
          );
        })}
      </g>

      {/* 4. LEGEND TABLE (Grid G, Bottom Right-Center) */}
      <g id="engineering-legend-table" transform="translate(3556, 3556)">
        <rect x="0" y="0" width="1058" height="500" fill="#ffffff" stroke="#0b192c" strokeWidth="2.5" />
        <rect x="0" y="0" width="1058" height="34" fill="#f8fafc" stroke="#0b192c" strokeWidth="1.5" />
        <text x="529" y="23" textAnchor="middle" fontFamily="sans-serif" fontSize="13" fontWeight="bold" fill="#0b192c">
          LEGEND
        </text>
        <line x1="529" y1="34" x2="529" y2="500" stroke="#0b192c" strokeWidth="1" />

        {/* Column 1: Piping & Valves */}
        <g transform="translate(16, 46)" fontFamily="sans-serif" fontSize="9.5" fill="#1e293b">
          {[
            { label: 'GATE VALVE', sym: 'gate' },
            { label: 'BALL VALVE', sym: 'ball' },
            { label: 'GLOBE VALVE', sym: 'globe' },
            { label: 'CHECK VALVE', sym: 'check' },
            { label: 'NEEDLE VALVE', sym: 'needle' },
            { label: 'SAFETY RELIEF VALVE', sym: 'psv' },
            { label: 'CONTROL VALVE', sym: 'pcv' },
            { label: 'ESD VALVE', sym: 'esd' },
            { label: 'BLOWDOWN VALVE', sym: 'bdv' },
            { label: 'QUICK OPENING CLOSURE', sym: 'door' },
            { label: 'PROCESS LINE', sym: 'process' },
            { label: 'INSTRUMENT SIGNAL (DASHED)', sym: 'signal' },
          ].map((item, idx) => {
            const y = idx * 37;
            return (
              <g key={`leg-col1-${idx}`} transform={`translate(0, ${y})`}>
                {item.sym === 'process' ? (
                  <line x1="10" y1="12" x2="60" y2="12" stroke="#0b192c" strokeWidth="3" />
                ) : item.sym === 'signal' ? (
                  <line x1="10" y1="12" x2="60" y2="12" stroke="#0284c7" strokeWidth="1.5" strokeDasharray="4,3" />
                ) : (
                  <g transform="translate(35, 12) scale(0.6)">
                    <polygon points="-20,-12 0,0 -20,12" fill="#ffffff" stroke="#0b192c" strokeWidth="2" />
                    <polygon points="20,-12 0,0 20,12" fill="#ffffff" stroke="#0b192c" strokeWidth="2" />
                    {item.sym === 'ball' && <circle cx="0" cy="0" r="4" fill="#0b192c" />}
                  </g>
                )}
                <text x="80" y="16" fontWeight="600">{item.label}</text>
              </g>
            );
          })}
        </g>

        {/* Column 2: Instruments & Actuators */}
        <g transform="translate(545, 46)" fontFamily="sans-serif" fontSize="9.5" fill="#1e293b">
          {[
            { label: 'FIELD INSTRUMENT', sym: 'field' },
            { label: 'DCS INSTRUMENT (1 HORIZ LINE)', sym: 'dcs' },
            { label: 'SIS INSTRUMENT (2 HORIZ LINES)', sym: 'sis' },
            { label: 'LOCAL INDICATOR', sym: 'local' },
            { label: 'ELECTRO-PNEUMATIC POSITIONER', sym: 'pos' },
            { label: 'SOLENOID VALVE', sym: 'sv' },
            { label: 'HAND SWITCH', sym: 'hs' },
            { label: 'ESD ACTUATOR', sym: 'esd_act' },
            { label: 'PNEUMATIC ACTUATOR', sym: 'act' },
            { label: 'PIG SIGNALLER', sym: 'pig' },
          ].map((item, idx) => {
            const y = idx * 37;
            return (
              <g key={`leg-col2-${idx}`} transform={`translate(0, ${y})`}>
                <g transform="translate(35, 12)">
                  <circle cx="0" cy="0" r="11" fill="#ffffff" stroke="#0b192c" strokeWidth="1.5" />
                  {item.sym === 'dcs' && <line x1="-11" y1="0" x2="11" y2="0" stroke="#0b192c" strokeWidth="1.2" />}
                  {item.sym === 'sis' && (
                    <>
                      <line x1="-10" y1="-3" x2="10" y2="-3" stroke="#0b192c" strokeWidth="1" />
                      <line x1="-10" y1="3" x2="10" y2="3" stroke="#0b192c" strokeWidth="1" />
                    </>
                  )}
                </g>
                <text x="65" y="16" fontWeight="600">{item.label}</text>
              </g>
            );
          })}
        </g>
      </g>

      {/* 5. FLOW CONTINUATION ARROWS & EXTERNAL SYSTEM CALLOUTS */}
      {/* Inlet header from Production Manifold (Left, Grid A-3) */}
      <g id="inlet-continuation-banner" transform="translate(180, 1680)">
        <text x="0" y="0" fontFamily="sans-serif" fontSize="15" fontWeight="bold" fill="#0b192c">
          FROM PRODUCTION
        </text>
        <text x="0" y="24" fontFamily="sans-serif" fontSize="14" fontWeight="bold" fill="#0b192c">
          MANIFOLD MV-1001
        </text>
        <text x="0" y="48" fontFamily="sans-serif" fontSize="12" fontWeight="600" fill="#475569">
          CONTINUES FROM
        </text>
        <text x="0" y="70" fontFamily="monospace" fontSize="13" fontWeight="bold" fill="#2563eb">
          P&amp;ID-GPF-001-01
        </text>
        {/* Large Arrow pointing East */}
        <polygon points="260,82 284,82 284,74 308,86 284,98 284,90 260,90" fill="#0b192c" />
      </g>

      {/* Top Vent to Sour Flare Header (Top Center, Grid D-1) */}
      <g id="flare-header-top-banner" transform="translate(2020, 200)">
        <text x="0" y="0" fontFamily="sans-serif" fontSize="18" fontWeight="bold" fill="#0b192c">
          TO SOUR FLARE HEADER
        </text>
        <line x1="120" y1="20" x2="120" y2="70" stroke="#0b192c" strokeWidth="2.5" />
        <polygon points="120,10 110,32 130,32" fill="#0b192c" />
      </g>

      {/* Right Outlet to HP Separator (Right, Grid H-4) */}
      <g id="outlet-continuation-banner" transform="translate(4880, 1980)">
        <polygon points="0,0 24,0 24,-8 48,4 24,16 24,8 0,8" fill="#0b192c" />
        <text x="60" y="8" fontFamily="sans-serif" fontSize="14" fontWeight="bold" fill="#0b192c">
          TO HP SEPARATOR INLET
        </text>
        <text x="60" y="28" fontFamily="sans-serif" fontSize="12" fontWeight="600" fill="#475569">
          CONTINUES ON
        </text>
        <text x="60" y="48" fontFamily="monospace" fontSize="13" fontWeight="bold" fill="#2563eb">
          P&amp;ID-GPF-002-01
        </text>
      </g>

      {/* Bottom Blowdown to Sour Flare Header (Grid G-5) */}
      <g id="flare-header-bottom-banner" transform="translate(4380, 2980)">
        <text x="0" y="0" fontFamily="sans-serif" fontSize="15" fontWeight="bold" fill="#0b192c">
          TO SOUR FLARE HEADER
        </text>
        <line x1="80" y1="-16" x2="80" y2="-60" stroke="#0b192c" strokeWidth="2" strokeDasharray="6,4" />
        <polygon points="80,-74 72,-56 88,-56" fill="#0b192c" />
      </g>

      {/* Bottom Drain to Closed Drain Drum (Grid C-5) */}
      <g id="closed-drain-drum-banner" transform="translate(1640, 2960)">
        <line x1="110" y1="-20" x2="110" y2="10" stroke="#0b192c" strokeWidth="2.5" />
        <polygon points="110,24 102,6 118,6" fill="#0b192c" />
        <text x="110" y="48" textAnchor="middle" fontFamily="sans-serif" fontSize="14" fontWeight="bold" fill="#0b192c">
          TO CLOSED
        </text>
        <text x="110" y="70" textAnchor="middle" fontFamily="sans-serif" fontSize="14" fontWeight="bold" fill="#0b192c">
          DRAIN DRUM
        </text>
      </g>
    </g>
  );
};
