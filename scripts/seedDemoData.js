const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../server/data/psi_db.json');
if (!fs.existsSync(dbPath)) {
  console.error('Database file not found at:', dbPath);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
const sampleProjId = 'proj-sample-ammonia-demo';

// Ensure chemicals array exists
data.chemicals = data.chemicals || [];

// Check if chemicals already exist for sample project
const existingChems = data.chemicals.filter(c => c.project_id === sampleProjId);
console.log(`Found ${existingChems.length} existing chemicals for ${sampleProjId}`);

if (existingChems.length === 0) {
  const now = new Date().toISOString();
  
  const chem1 = {
    id: 'chem-ammonia-apex',
    project_id: sampleProjId,
    sds_document_id: 'doc-sds-ammonia-apex',
    origin: 'sds_extracted',
    record_status: 'active',
    chemical_name: {
      value: 'Anhydrous Ammonia',
      machine_value: 'Anhydrous Ammonia',
      user_value: null,
      source: {
        document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
        document_id: 'doc-sds-ammonia-apex',
        page: 1,
        section: 'Section 1 (Product and Company Identification)',
        snippet: 'Product Identifier: Anhydrous Ammonia, Refrigeration Grade'
      },
      confidence: 0.98,
      review_status: 'confirmed',
      entry_method: 'machine',
      verification_status: 'verified',
      units: null,
      updated_at: now
    },
    cas_number: {
      value: '7664-41-7',
      machine_value: '7664-41-7',
      user_value: null,
      source: {
        document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
        document_id: 'doc-sds-ammonia-apex',
        page: 2,
        section: 'Section 3 (Composition / Ingredients)',
        snippet: 'Ammonia, anhydrous: CAS 7664-41-7, 99.5 - 100%'
      },
      confidence: 0.99,
      review_status: 'confirmed',
      entry_method: 'machine',
      verification_status: 'verified',
      units: null,
      updated_at: now
    },
    sds_revision_date: {
      value: '2024-01-15',
      machine_value: '2024-01-15',
      user_value: null,
      source: {
        document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
        document_id: 'doc-sds-ammonia-apex',
        page: 1,
        section: 'Section 16 (Other Information)',
        snippet: 'Revision Date: 15-January-2024'
      },
      confidence: 0.95,
      review_status: 'confirmed',
      entry_method: 'machine',
      verification_status: 'verified',
      units: null,
      updated_at: now
    },
    manufacturer: {
      value: 'Apex Chemical Supply LLC',
      machine_value: 'Apex Chemical Supply LLC',
      user_value: null,
      source: {
        document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
        document_id: 'doc-sds-ammonia-apex',
        page: 1,
        section: 'Section 1 (Product Identification)',
        snippet: 'Supplier: Apex Chemical Supply LLC, Houston, TX'
      },
      confidence: 0.96,
      review_status: 'confirmed',
      entry_method: 'machine',
      verification_status: 'verified',
      units: null,
      updated_at: now
    },
    synonyms: ['Ammonia Gas', 'Spirit of Hartshorn', 'Liquid Ammonia'],
    molecular_formula: 'NH3',
    molecular_weight: { value: 17.03, unit: 'g/mol' },
    physical_state: 'gas',
    composition_type: 'pure_substance',
    concentration: '99.8% wt/wt',
    description: 'Industrial refrigeration grade anhydrous ammonia for closed-loop refrigeration skids.',
    psi_parameters: {
      toxicity: {
        value: 'Inhalation LC50 (Rat, 4hr): 2,000 ppm. Causes severe chemical burns and permanent respiratory & eye damage.',
        machine_value: 'Inhalation LC50 (Rat, 4hr): 2,000 ppm. Causes severe chemical burns and permanent respiratory & eye damage.',
        user_value: null,
        source: {
          document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
          document_id: 'doc-sds-ammonia-apex',
          page: 5,
          section: 'Section 11 (Toxicological Information)',
          snippet: 'Acute toxicity: Inhalation LC50 Rat 2000 ppm/4h. Corrosive to mucous membranes and respiratory tract.'
        },
        confidence: 0.96,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: 'ppm',
        updated_at: now
      },
      permissible_exposure_limits: {
        value: 'OSHA PEL: 50 ppm (35 mg/m³); ACGIH TLV: 25 ppm TWA, 35 ppm STEL; NIOSH IDLH: 300 ppm',
        machine_value: 'OSHA PEL: 50 ppm (35 mg/m³); ACGIH TLV: 25 ppm TWA, 35 ppm STEL; NIOSH IDLH: 300 ppm',
        user_value: null,
        source: {
          document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
          document_id: 'doc-sds-ammonia-apex',
          page: 4,
          section: 'Section 8 (Exposure Controls/Personal Protection)',
          snippet: 'OSHA PEL: 50 ppm (35 mg/m3) 8-hr TWA. ACGIH TLV: 25 ppm TWA, 35 ppm STEL. NIOSH IDLH: 300 ppm.'
        },
        confidence: 0.99,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: 'ppm',
        updated_at: now
      },
      physical_data: {
        value: 'Boiling Point: -33.34°C (-28°F); Vapor Pressure: 8.5 bar @ 20°C; Vapor Density: 0.59 (Air=1); Auto-ignition: 651°C',
        machine_value: 'Boiling Point: -33.34°C (-28°F); Vapor Pressure: 8.5 bar @ 20°C; Vapor Density: 0.59 (Air=1); Auto-ignition: 651°C',
        user_value: null,
        source: {
          document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
          document_id: 'doc-sds-ammonia-apex',
          page: 4,
          section: 'Section 9 (Physical and Chemical Properties)',
          snippet: 'Boiling point: -33.34°C (-28.01°F). Vapor pressure: 857 kPa @ 20°C. Relative density (gas): 0.59.'
        },
        confidence: 0.97,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      },
      reactivity_data: {
        value: 'Exothermic reaction with strong mineral acids. Reacts explosively with halogens (Cl2, Br2, I2) and hypochlorites.',
        machine_value: 'Exothermic reaction with strong mineral acids. Reacts explosively with halogens (Cl2, Br2, I2) and hypochlorites.',
        user_value: null,
        source: {
          document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
          document_id: 'doc-sds-ammonia-apex',
          page: 5,
          section: 'Section 10 (Stability and Reactivity)',
          snippet: 'Incompatible materials: Strong acids, halogens, sodium hypochlorite, oxidizing agents, silver, copper.'
        },
        confidence: 0.95,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      },
      corrosivity_data: {
        value: 'Severely corrosive to copper, copper alloys (brass, bronze), zinc, galvanized surfaces, and living tissue. pH 11.6 aqueous.',
        machine_value: 'Severely corrosive to copper, copper alloys (brass, bronze), zinc, galvanized surfaces, and living tissue. pH 11.6 aqueous.',
        user_value: null,
        source: {
          document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
          document_id: 'doc-sds-ammonia-apex',
          page: 5,
          section: 'Section 10 (Stability and Reactivity)',
          snippet: 'Corrosive properties: Attaches copper, brass, and galvanized metals rapidly.'
        },
        confidence: 0.94,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      },
      thermal_and_chemical_stability_data: {
        value: 'Thermally stable at room temperature. Catalytically dissociates into hydrogen and nitrogen above 450°C (842°F).',
        machine_value: 'Thermally stable at room temperature. Catalytically dissociates into hydrogen and nitrogen above 450°C (842°F).',
        user_value: null,
        source: {
          document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
          document_id: 'doc-sds-ammonia-apex',
          page: 5,
          section: 'Section 10 (Stability and Reactivity)',
          snippet: 'Thermal decomposition: Decomposes at >450°C releasing flammable hydrogen gas and nitrogen.'
        },
        confidence: 0.93,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      },
      inadvertent_mixing_hazards: {
        value: 'CRITICAL HAZOP HAZARD: Inadvertent mixing with sodium hypochlorite (bleach) produces toxic and explosive chloramines (NH2Cl, NHCl2, NCl3).',
        machine_value: 'CRITICAL HAZOP HAZARD: Inadvertent mixing with sodium hypochlorite (bleach) produces toxic and explosive chloramines (NH2Cl, NHCl2, NCl3).',
        user_value: null,
        source: {
          document: 'Apex_Anhydrous_Ammonia_SDS_2024.pdf',
          document_id: 'doc-sds-ammonia-apex',
          page: 5,
          section: 'Section 10 (Stability and Reactivity)',
          snippet: 'Hazardous reactions: Contact with sodium hypochlorite solutions liberates toxic nitrogen trichloride.'
        },
        confidence: 0.99,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      }
    },
    created_at: now,
    updated_at: now
  };

  const chem2 = {
    id: 'chem-bleach-apex',
    project_id: sampleProjId,
    sds_document_id: 'doc-sds-bleach-apex',
    origin: 'sds_extracted',
    record_status: 'active',
    chemical_name: {
      value: 'Sodium Hypochlorite 12.5%',
      machine_value: 'Sodium Hypochlorite 12.5%',
      user_value: null,
      source: {
        document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
        document_id: 'doc-sds-bleach-apex',
        page: 1,
        section: 'Section 1 (Product Identification)',
        snippet: 'Product Name: Sodium Hypochlorite Solution 12.5%, Industrial Biocide'
      },
      confidence: 0.97,
      review_status: 'confirmed',
      entry_method: 'machine',
      verification_status: 'verified',
      units: null,
      updated_at: now
    },
    cas_number: {
      value: '7681-52-9',
      machine_value: '7681-52-9',
      user_value: null,
      source: {
        document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
        document_id: 'doc-sds-bleach-apex',
        page: 2,
        section: 'Section 3 (Composition / Ingredients)',
        snippet: 'Sodium hypochlorite: CAS 7681-52-9, 12.5% wt/wt'
      },
      confidence: 0.99,
      review_status: 'confirmed',
      entry_method: 'machine',
      verification_status: 'verified',
      units: null,
      updated_at: now
    },
    sds_revision_date: {
      value: '2023-11-20',
      machine_value: '2023-11-20',
      user_value: null,
      source: {
        document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
        document_id: 'doc-sds-bleach-apex',
        page: 1,
        section: 'Section 16 (Other Information)',
        snippet: 'Revision Date: 20-November-2023'
      },
      confidence: 0.95,
      review_status: 'confirmed',
      entry_method: 'machine',
      verification_status: 'verified',
      units: null,
      updated_at: now
    },
    manufacturer: {
      value: 'Apex Water Solutions Inc.',
      machine_value: 'Apex Water Solutions Inc.',
      user_value: null,
      source: {
        document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
        document_id: 'doc-sds-bleach-apex',
        page: 1,
        section: 'Section 1 (Product Identification)',
        snippet: 'Manufacturer: Apex Water Solutions Inc., Chicago, IL'
      },
      confidence: 0.95,
      review_status: 'confirmed',
      entry_method: 'machine',
      verification_status: 'verified',
      units: null,
      updated_at: now
    },
    synonyms: ['Liquid Bleach', 'Soda Bleach', 'Chlorox solution'],
    molecular_formula: 'NaOCl',
    molecular_weight: { value: 74.44, unit: 'g/mol' },
    physical_state: 'liquid',
    composition_type: 'aqueous_solution',
    concentration: '12.5% wt/wt',
    description: 'Aqueous biocide for cooling tower microbial control and water treatment dosing skid.',
    psi_parameters: {
      toxicity: {
        value: 'Oral LD50 (Rat): 8,200 mg/kg; Dermal LD50 (Rabbit): >10,000 mg/kg. Corrosive to mucous membranes and digestive tract.',
        machine_value: 'Oral LD50 (Rat): 8,200 mg/kg; Dermal LD50 (Rabbit): >10,000 mg/kg. Corrosive to mucous membranes and digestive tract.',
        user_value: null,
        source: {
          document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
          document_id: 'doc-sds-bleach-apex',
          page: 5,
          section: 'Section 11 (Toxicological Information)',
          snippet: 'Oral LD50 (rat): 8200 mg/kg. Severe skin irritant and causes irreversible corneal damage.'
        },
        confidence: 0.94,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: 'mg/kg',
        updated_at: now
      },
      permissible_exposure_limits: {
        value: 'AIHA WEEL: 2 mg/m³ STEL (15 min); OSHA PEL: None for NaOCl; Chlorine breakdown ceiling: 1 ppm (3 mg/m³)',
        machine_value: 'AIHA WEEL: 2 mg/m³ STEL (15 min); OSHA PEL: None for NaOCl; Chlorine breakdown ceiling: 1 ppm (3 mg/m³)',
        user_value: null,
        source: {
          document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
          document_id: 'doc-sds-bleach-apex',
          page: 4,
          section: 'Section 8 (Exposure Controls)',
          snippet: 'AIHA WEEL 2 mg/m3 15-min STEL. OSHA PEL for decomposition chlorine: 1 ppm ceiling.'
        },
        confidence: 0.98,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: 'mg/m³',
        updated_at: now
      },
      physical_data: {
        value: 'Boiling Point: 101°C (214°F); Specific Gravity: 1.20 @ 20°C; pH: 12.0 - 13.0 (strongly alkaline)',
        machine_value: 'Boiling Point: 101°C (214°F); Specific Gravity: 1.20 @ 20°C; pH: 12.0 - 13.0 (strongly alkaline)',
        user_value: null,
        source: {
          document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
          document_id: 'doc-sds-bleach-apex',
          page: 4,
          section: 'Section 9 (Physical and Chemical Properties)',
          snippet: 'Boiling point: ~101°C. Relative density: 1.20. pH: 12.5.'
        },
        confidence: 0.96,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      },
      reactivity_data: {
        value: 'Strong oxidizer. Decomposes on heating and UV exposure. Vigorous reaction with acids, ammonia, and reducing agents.',
        machine_value: 'Strong oxidizer. Decomposes on heating and UV exposure. Vigorous reaction with acids, ammonia, and reducing agents.',
        user_value: null,
        source: {
          document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
          document_id: 'doc-sds-bleach-apex',
          page: 5,
          section: 'Section 10 (Stability and Reactivity)',
          snippet: 'Incompatible with acids, ammonia, urea, amines, and metals. Avoid contact with organic materials.'
        },
        confidence: 0.95,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      },
      corrosivity_data: {
        value: 'Severely corrosive to mild steel, ductile iron, aluminum, brass, and 304/316 stainless steel. Requires PVC/PVDF/Titanium.',
        machine_value: 'Severely corrosive to mild steel, ductile iron, aluminum, brass, and 304/316 stainless steel. Requires PVC/PVDF/Titanium.',
        user_value: null,
        source: {
          document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
          document_id: 'doc-sds-bleach-apex',
          page: 5,
          section: 'Section 10 (Stability and Reactivity)',
          snippet: 'Corrosive to metallic process equipment. Pitting and stress corrosion cracking in stainless steel.'
        },
        confidence: 0.93,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      },
      thermal_and_chemical_stability_data: {
        value: 'Unstable under heat and direct light. Slowly degrades to sodium chloride and sodium chlorate above 40°C (104°F).',
        machine_value: 'Unstable under heat and direct light. Slowly degrades to sodium chloride and sodium chlorate above 40°C (104°F).',
        user_value: null,
        source: {
          document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
          document_id: 'doc-sds-bleach-apex',
          page: 5,
          section: 'Section 10 (Stability and Reactivity)',
          snippet: 'Chemical stability: Decomposes with age, heat (>40°C) and light exposure.'
        },
        confidence: 0.92,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      },
      inadvertent_mixing_hazards: {
        value: 'CRITICAL INADVERTENT MIXING: Mixing with acids liberates lethal chlorine gas (Cl2); mixing with ammonia produces toxic chloramines.',
        machine_value: 'CRITICAL INADVERTENT MIXING: Mixing with acids liberates lethal chlorine gas (Cl2); mixing with ammonia produces toxic chloramines.',
        user_value: null,
        source: {
          document: 'Apex_Sodium_Hypochlorite_12.5pct_SDS.pdf',
          document_id: 'doc-sds-bleach-apex',
          page: 5,
          section: 'Section 10 (Stability and Reactivity)',
          snippet: 'Hazardous decomposition products: Toxic chlorine gas liberated upon acidification.'
        },
        confidence: 0.98,
        review_status: 'confirmed',
        entry_method: 'machine',
        verification_status: 'verified',
        units: null,
        updated_at: now
      }
    },
    created_at: now,
    updated_at: now
  };

  data.chemicals.push(chem1, chem2);
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  console.log('Successfully seeded 2 realistic chemicals for demo project!');
}
