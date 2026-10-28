# Process-Safety Information (PSI) Identification Engine

> **OSHA 29 CFR 1910.119(d)(1) Evidence Management & P&ID Topology Mapping Platform**

---

### ⚠️ Process Safety Notice & Regulatory Scope
**THIS APPLICATION IS AN EVIDENCE-MANAGEMENT AND PSI IDENTIFICATION TOOL, NOT A CERTIFIED SAFETY ASSESSMENT SYSTEM OR RISK-RATING ENGINE.**

- In accordance with OSHA Process Safety Management (PSM) standard 29 CFR 1910.119(d)(1), all machine-extracted chemical properties and diagram elements are strictly **provisional and unverified** until a qualified process-safety professional inspects the primary evidence and confirms or corrects the record.
- **No Overall Plant Safety Score:** This system intentionally avoids computing an artificial or automated numeric safety rating.
- **No Groundless Assumptions:** Absent data points are documented as explicit **Missing/Unknown** states; they are never treated as zero, benign, or safe.
- **No Silent Merging:** Multi-vendor Safety Data Sheet (SDS) divergences (e.g. differing PEL exposure limits) are detected and presented side-by-side for human engineering reconciliation.

---

## Architecture Overview

The system is structured into two main pipeline layers as specified by process-safety standards:

```
                                  ┌───────────────────────────────┐
                                  │   Uploaded SDS (PDF) &        │
                                  │   P&ID (PDF / Raster Images)  │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                        ┌──────────────────────────────────────────────────┐
                        │              Server Ingestion Layer              │
                        │ • Multer mime/size validation (50MB limit)       │
                        │ • Native PDF text extraction (pdf-parse v2)      │
                        │ • Image raster detection & scanned PDF flagging  │
                        └─────────┬───────────────────────────────┬────────┘
                                  │                               │
                                  ▼                               ▼
     ┌─────────────────────────────────────────┐  ┌─────────────────────────────────────────┐
     │      Layer A: The LLM/SDS Parser        │  │     Layer B: The P&ID & GNN Topology    │
     │ • Maps GHS Sec 1-16 to OSHA 1910.119    │  │ • Extracts equipment tags (V-101, P-101)│
     │ • Extracts 7 mandatory PSI fields       │  │ • Extracts piping lines (3"-NH3-101-CS) │
     │ • Preserves verbatim text snippets      │  │ • Injects confirmed PSI into line edges │
     │ • Cross-SDS conflict detector           │  │ • Detects localized mixing risks (NH3 + │
     │ • Generates auditable CSV & JSON        │  │   Bleach chloramine gas release alert)  │
     └────────────────────┬────────────────────┘  └────────────────────┬────────────────────┘
                          │                                            │
                          └───────────────────────┬────────────────────┘
                                                  │
                                                  ▼
                                ┌──────────────────────────────────┐
                                │     Industrial Review Workspace  │
                                │ • Side-by-side snippet inspector │
                                │ • User-confirmed vs Machine value│
                                │ • Conflict resolution modal      │
                                │ • Interactive GNN SVG topology   │
                                └──────────────────────────────────┘
```

### The 7 OSHA 29 CFR 1910.119(d)(1) Mandated Fields
For every chemical, the parser extracts, contextualizes, and attributes:
1. **Toxicity Information** (`§1910.119(d)(1)(i)`): Acute/chronic toxicological data, LC50/LD50 inhalation and oral thresholds, target organs.
2. **Permissible Exposure Limits** (`§1910.119(d)(1)(ii)`): OSHA PEL (8-hr TWA), ACGIH TLV, NIOSH REL, STEL, and IDLH emergency evacuation limits.
3. **Physical Data** (`§1910.119(d)(1)(iii)`): Boiling point, melting point, vapor pressure, vapor density, flash point, and flammability limits (LEL/UEL).
4. **Reactivity Data** (`§1910.119(d)(1)(iv)`): Chemical reactivity, decomposition conditions, static discharge sensitivity, and conditions to avoid.
5. **Corrosivity Data** (`§1910.119(d)(1)(v)`): Attack on specific metallurgy (copper, brass, zinc, aluminum, steel), solution pH, and severe tissue destruction.
6. **Thermal and Chemical Stability Data** (`§1910.119(d)(1)(vi)`): Thermal decomposition temperatures, self-accelerating decomposition, and hazardous polymerization.
7. **Hazardous Effects of Inadvertent Mixing** (`§1910.119(d)(1)(vii)`): Foreseeable hazardous reactions (e.g. Anhydrous Ammonia + Sodium Hypochlorite Bleach producing toxic chloramine gas; Bleach + Acid producing chlorine gas).

---

## Pre-Loaded Demo Project

The application comes pre-loaded with an industrial demo project:
- **Project Name:** `OSHA PSM Ammonia Refrigeration & Dosing Loop`
- **Features Demonstrated:**
  - **Chemical 1 (Anhydrous Ammonia - Apex 2024):** Fully populated with verified OSHA 1910.119(d)(1) fields, 50 ppm PEL, -33.3°C boiling point, copper corrosivity warning.
  - **Chemical 2 (Anhydrous Ammonia - ChemCorp 2022):** Multi-vendor conflict demonstration with differing 35 ppm PEL and physical data.
  - **Chemical 3 (Sodium Hypochlorite Solution 12.5%):** Highly alkaline corrosive biocide with severe inadvertent mixing warning.
  - **Document 4 (Unreadable Scanned PDF):** Scanned historical archive drawing clearly flagged with unreadable warnings and OCR guidance.
  - **P&ID Topology Graph:** Live plant asset layout linking V-101, P-101A, E-101, and TK-201, actively raising **Localized Inadvertent Mixing Alerts** at cross-connecting headers.

---

## Setup & Running the Application

### Prerequisites
- **Node.js:** v18.0.0 or later (Tested on Node.js v24.15.0)
- **npm:** v9.0.0 or later

### Installation
From the project root directory (`C:\Users\shlok\.gemini\antigravity\scratch\psi-engine`):

```bash
# 1. Install root dependencies
npm install

# 2. Install client dependencies
cd client
npm install
cd ..
```

### Environment Variables (Optional)
Create a `.env` file in the project root if integrating optional external LLM services:

```env
PORT=5001
# Optional: GEMINI_API_KEY or OPENAI_API_KEY for advanced LLM auxiliary parsing
# GEMINI_API_KEY=your_api_key_here
```
*Note: The system contains a high-precision deterministic OSHA 1910.119 parser and operates 100% offline without requiring any external API keys.*

### Build
To compile both the React client and the Express backend:

```bash
npm run build
```

### Run
To start the production server:

```bash
npm start
```
The application will be live at:
👉 **`http://localhost:5001`**

### Running the Test Suite
The automated test suite verifies the SDS parser, multi-vendor conflict detection, P&ID graph localized alerts, and JSON/CSV export integrity:

```bash
npm test
```

---

## Key Files & Directory Structure

```
psi-engine/
├── package.json                 # Root scripts (build, test, start, dev)
├── server/
│   ├── tsconfig.json            # Server TypeScript configuration
│   └── src/
│       ├── index.ts             # Express server setup, static client serving, error handling
│       ├── types/
│       │   └── index.ts         # Typed PSI schema, project records, conflict & GNN models
│       ├── storage/
│       │   └── store.ts         # Persistent JSON database & sample project seeder
│       ├── services/
│       │   ├── pdfExtractor.ts  # PDF text extraction & scanned document detector
│       │   ├── sdsParser.ts     # OSHA 29 CFR 1910.119(d)(1) deterministic extractor
│       │   ├── pidParser.ts     # P&ID provisional equipment & piping detector
│       │   ├── conflictDetector.ts # Multi-vendor SDS conflict detection & diff engine
│       │   ├── graphService.ts  # Process topology builder & localized HAZOP alert injector
│       │   └── exportService.ts # Auditable JSON and CSV export generators
│       └── routes/
│           └── api.ts           # REST API endpoints (projects, upload, chemicals, pid, export)
├── client/
│   ├── index.html               # Main HTML entrypoint
│   ├── vite.config.ts           # Vite proxy & configuration
│   ├── tailwind.config.js       # Industrial design system configuration
│   └── src/
│       ├── App.tsx              # Main application coordinator & state management
│       ├── types/               # Client TypeScript interfaces
│       └── components/
│           ├── Header.tsx                 # Project switcher, navigation, action buttons
│           ├── SafetyDisclaimerBanner.tsx # OSHA compliance notice & scope banner
│           ├── ProjectDashboard.tsx       # KPI overview & PSI completeness gauge
│           ├── PsiReviewWorkspace.tsx     # Side-by-side evidence inspection workspace
│           ├── PsiFieldCard.tsx           # Machine vs Confirmed value cards with edit/verify actions
│           ├── ConflictResolutionModal.tsx# Multi-vendor SDS reconciliation tool
│           ├── PidGraphViewer.tsx         # SVG process topology map & localized alerts
│           ├── DocumentsView.tsx          # Uploaded document list with unreadable badges
│           ├── DocumentUploadModal.tsx    # Multi-file dropzone with size validation
│           ├── ExportModal.tsx            # JSON & CSV one-click download preview
│           └── NewProjectModal.tsx        # Project/process boundary creator
└── tests/
    └── runTests.ts              # Unit and integration test suite
```

---

## Current Limitations & Roadmap

1. **OCR on Scanned Bitmaps:** Scanned raster drawings without digital vector text are flagged as unreadable. Users are advised to upload vector PDFs or high-resolution text PDFs; OCR integration via Tesseract or cloud Vision APIs can be toggled via backend services.
2. **GNN Topology Model:** The first version builds and renders the topological graph of equipment nodes and piping edges with chemical safety profiles. Direct integration with a trained Graph Neural Network (GNN) model for automated quantitative HAZOP/LOPA probabilities is architected as the next milestone.
3. **P&ID Vector Symbol Standardization:** P&ID symbology varies across ISA-5.1 standards and proprietary client symbol legends. Extracted diagram tags are marked as provisional and require user confirmation.
