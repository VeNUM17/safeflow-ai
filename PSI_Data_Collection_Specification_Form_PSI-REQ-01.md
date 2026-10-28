# Process Safety Information (PSI) Data Collection Specification & Vendor Questionnaire
**Document ID:** `PSI-REQ-01`  
**Standard Compliance:** OSHA 29 CFR 1910.119(d) / EPA 40 CFR Part 68 (RMP) / CCPS Guidelines  
**Revision:** 2.0  
**Status:** Approved for Distribution  

---

> **Regulatory Notice & Purpose:**
> Under OSHA 29 CFR 1910.119(d), the employer must compile complete, written Process Safety Information (PSI) before conducting any Process Hazard Analysis (PHA/HAZOP). Missing, approximated, or unverified information compromises hazard identification. 
> 
> This document serves as the **official technical data request** to be completed by chemical manufacturers, technology licensors, engineering procurement contractors (EPCs), and internal plant operations. Every numerical value submitted must include standard engineering units and verifiable source provenance (datasheet, laboratory report, or peer-reviewed literature).

---

## 1. Document Control & Identification

| Field | Supplier / Originator Response |
| :--- | :--- |
| **Facility / Plant Name:** | |
| **Process Unit / Area:** | |
| **Chemical / Material Trade Name:** | |
| **Manufacturer / Technology Licensor:** | |
| **Document Prepared By (Name & Title):** | |
| **Contact Email & Phone:** | |
| **Submission Date:** | |
| **Applicable P&ID / Drawing Numbers:** | |

---

## 2. Part I: Hazards of Process Chemicals (OSHA 1910.119(d)(1))

### 2.1 Chemical Identity & Substance Characterization

| Parameter | Regulatory Field Requirement | Engineering Units | Value / Description | Source Document & Section |
| :--- | :--- | :---: | :--- | :--- |
| **Chemical / Product Name** | Mandatory identification | Text | | |
| **CAS Registry Number** | Standard format: `XXXXX-XX-X` | Text | | |
| **Synonyms / Trade Names** | IUPAC, common, and commercial aliases | Text | | |
| **Molecular Formula** | Hill notation (e.g., NH3, Cl2, C2H6O) | Text | | |
| **Molecular Weight** | Pure substance or average mixture MW | g/mol | | |
| **Physical State at 20°C / 1 atm** | Gas / Liquid / Solid / Slurry / Vapor | Selection | | |
| **Composition Classification** | Pure substance / Mixture / Solution | Selection | | |
| **Operating Concentration** | Wt%, Vol%, or Molarity with tolerance | %, M | | |
| **Manufacturer & Location** | Production facility location | Text | | |
| **Safety Data Sheet (SDS) Revision Date**| Date of latest issued SDS | YYYY-MM-DD | | |

---

### 2.2 Toxicity Information (OSHA 1910.119(d)(1)(i))

*Provide acute and chronic human health hazards, animal thresholds, and toxicological routes of exposure.*

| Toxicological Endpoint | Test Species & Route | Numerical Threshold & Units | GHS Category / Classification | Source Citation |
| :--- | :---: | :---: | :---: | :--- |
| **Acute Inhalation Toxicity (LC50)** | Rat (4-hour) | ppm or mg/m3 | | |
| **Acute Oral Toxicity (LD50)** | Rat (Oral) | mg/kg | | |
| **Acute Dermal Toxicity (LD50)** | Rabbit / Rat | mg/kg | | |
| **Emergency Response Planning Guidelines (ERPG)** | Human (1-hour) | ERPG-1: <br>ERPG-2: <br>ERPG-3: | | |
| **Acute Exposure Guideline Levels (AEGL)** | Human (1-hour) | AEGL-1: <br>AEGL-2: <br>AEGL-3: | | |
| **Specific Target Organ Toxicity (STOT)** | Single / Repeated | Affected organs: | | |
| **Carcinogenicity / Mutagenicity** | IARC / NTP / OSHA | Listed status: | | |
| **Sensitization / Irritation** | Respiratory / Skin | Category: | | |

---

### 2.3 Permissible Exposure Limits (OSHA 1910.119(d)(1)(ii))

*Provide all occupational hygiene exposure thresholds applicable to facility personnel.*

| Exposure Standard Authority | Limit Type | Numerical Limit & Units | Averaging Period | Notes / Notation (Skin, Sensitizer) |
| :--- | :---: | :---: | :---: | :--- |
| **OSHA PEL** (29 CFR 1910.1000 Table Z-1) | Mandatory TWA | ppm (mg/m3) | 8-hour TWA | |
| **OSHA PEL Ceiling** | Ceiling limit | ppm (mg/m3) | Instantaneous | |
| **ACGIH TLV** | Recommended TWA | ppm (mg/m3) | 8-hour TWA | |
| **ACGIH STEL** | Short-Term Limit | ppm (mg/m3) | 15-minute STEL | |
| **NIOSH REL** | Recommended TWA | ppm (mg/m3) | 10-hour TWA | |
| **NIOSH IDLH** | Immediately Dangerous | ppm (mg/m3) | 30-minute escape | |
| **Internal Company Exposure Limit** | Corporate limit | ppm (mg/m3) | | |

---

### 2.4 Physical & Thermodynamic Data (OSHA 1910.119(d)(1)(iii))

*Critical process and relief-sizing parameters. Do not submit ranges unless accompanied by pure-component or mixture curves.*

| Physical Property | Required Units | Value at Standard Conditions | Operating Range (Min / Max) | Source / Test Method |
| :--- | :---: | :---: | :---: | :--- |
| **Boiling Point (at 101.3 kPa)** | °C or °F | | | |
| **Freezing / Melting Point** | °C or °F | | | |
| **Vapor Pressure at 20°C (68°F)** | psia, bar(a), or mmHg | | | |
| **Vapor Pressure at Max Operating Temp** | psia, bar(a), or mmHg | | | |
| **Vapor Density (Air = 1.0)** | Dimensionless | | | |
| **Liquid Density / Specific Gravity (H2O = 1.0)** | g/cm3 or lb/ft3 | | | |
| **Flash Point (Closed Cup)** | °C or °F | | | Method: |
| **Autoignition Temperature (AIT)** | °C or °F | | | |
| **Lower Explosive / Flammability Limit (LEL)** | Vol% in air | | | |
| **Upper Explosive / Flammability Limit (UEL)** | Vol% in air | | | |
| **Heat of Vaporization (ΔHvap)** | kJ/kg or Btu/lb | | | |
| **Specific Heat Capacity (Cp) Liquid / Vapor** | kJ/(kg·K) or Btu/(lb·°F) | | | |
| **Viscosity (Liquid at operating temp)** | cP or mPa·s | | | |
| **Solubility in Water (at 20°C)** | g/L or wt% | | | |

---

### 2.5 Reactivity Data (OSHA 1910.119(d)(1)(iv))

*Detail reactivity characteristics under normal storage, process upsets, and environmental contamination.*

| Question / Parameter | Specific Inquiry | Supplier Response |
| :--- | :--- | :--- |
| **Self-Reactivity:** | Is the material self-reactive, pyrophoric, or peroxide-forming? | [ ] Yes [ ] No<br>*Details:* |
| **Polymerization Hazard:** | Can the chemical undergo hazardous polymerization? | [ ] Yes [ ] No<br>*Inhibitor used / minimum concentration:* |
| **Static Sensitivity:** | Is the material sensitive to electrostatic discharge (MIE)? | Minimum Ignition Energy (MIE): _____ mJ |
| **Shock / Friction Sensitivity:** | Is the material sensitive to mechanical impact or shock? | [ ] Yes [ ] No |
| **Conditions to Avoid:** | Specific operational conditions that induce instability | Heat / Light / Pressure / Moisture / Catalyst |
| **Hazardous Decomposition:** | Gases or vapors produced during non-combustion breakdown | |

---

### 2.6 Corrosivity Data & Metallurgy Compatibility (OSHA 1910.119(d)(1)(v))

*Corrosion rates and chemical attack on process containment metals, seals, and lining materials.*

| Material of Construction | Suitable? | Max Acceptable Temp | Estimated Corrosion Rate | Known Failure Mechanisms (Pitting, SCC, Embrittlement) |
| :--- | :---: | :---: | :---: | :--- |
| **Carbon Steel (A106 / A516)** | [ ] Yes [ ] No | | mpy (mm/yr) | |
| **Stainless Steel 304 / 304L** | [ ] Yes [ ] No | | mpy (mm/yr) | |
| **Stainless Steel 316 / 316L** | [ ] Yes [ ] No | | mpy (mm/yr) | |
| **Nickel Alloys (Hastelloy, Inconel)**| [ ] Yes [ ] No | | mpy (mm/yr) | |
| **Copper & Copper Alloys (Brass, Bronze)**| [ ] Yes [ ] No | | Attack / Stress Cracking | *(Specifically prohibited for Ammonia service)* |
| **Zinc / Galvanized Steel** | [ ] Yes [ ] No | | Attack / Flaking | |
| **Aluminum & Light Alloys** | [ ] Yes [ ] No | | mpy (mm/yr) | |
| **Elastomers & Gaskets (PTFE, Viton, EPDM)**| [ ] Yes [ ] No | | Swelling / Degradation | |
| **Chemical pH (neat / solution):** | Numerical pH: | | | |

---

### 2.7 Thermal & Chemical Stability Data (OSHA 1910.119(d)(1)(vi))

*Calorimetric and thermal breakdown data for emergency relief and containment analysis.*

| Thermodynamic Parameter | Numerical Value & Units | Test Method (DSC, ARC, VSP, TGA) | Operational Significance |
| :--- | :---: | :---: | :--- |
| **Thermal Decomposition Onset Temp (Tonset)** | °C or °F | | Temperature where exothermic breakdown begins |
| **Self-Accelerating Decomposition Temp (SADT)** | °C or °F | | Critical package / vessel runaway threshold |
| **Heat of Reaction / Decomposition (ΔHrxn)**| kJ/kg or cal/g | | Energy released during uncontrolled breakdown |
| **Adiabatic Temperature Rise (ΔTad)** | °C or K | | Potential temperature surge under loss of cooling |
| **Max Rate of Pressure Rise ((dP/dt)max)** | bar/s or psi/s | | Basis for deflagration or runaway relief sizing |

---

### 2.8 Hazardous Effects of Inadvertent Mixing (OSHA 1910.119(d)(1)(vii))

| Secondary Chemical / Medium | Foreseeable Contact Mechanism | Hazardous Consequence | Hazardous Products Evolved |
| :--- | :--- | :--- | :--- |
| **Water / Moisture** | Steam purge, atmospheric humidity, rain ingress | Exothermic dissolution / Steam explosion / Acid mist | |
| **Strong Acids (H2SO4, HCl, HNO3)** | Acid wash, cross-connection, sampling header | Violent neutralization exotherm / Boiling | |
| **Strong Bases / Caustics (NaOH, KOH)**| Caustic scrubber, cleaning solutions | Exothermic reaction / Gas evolution | |
| **Oxidizing Agents / Bleach (NaOCl)** | Disinfection, wastewater drain header | Rapid toxic chloramine gas evolution | Toxic Chloramines (NH2Cl, NHCl2) |
| **Hydrocarbons / Lubricating Oils** | Compressor seals, pump lubricants, fuel | Ignition / Solvation / Runaway oxidation | |
| **Air / Oxygen** | Vessel venting, vacuum break, inerting loss | Flammable atmosphere formation | |

---

## 3. Part II: Technology of the Process (OSHA 1910.119(d)(2))

*Required for all manufacturing, reaction, synthesis, and storage units.*

### 3.1 Process Technology Checklist

| Requirement | Available? | Document ID & Title | Revision & Date |
| :--- | :---: | :--- | :--- |
| **1. Block Flow Diagram (BFD) or Process Flow Diagram (PFD)** | [ ] Yes [ ] No | | |
| **2. Written Process Chemistry Description** | [ ] Yes [ ] No | | |
| **3. Reaction Stoichiometry & Main / Side Reactions** | [ ] Yes [ ] No | | |
| **4. Maximum Intended Chemical Inventory Calculation** | [ ] Yes [ ] No | | |
| **5. Documented Safe Upper & Lower Operating Limits (SUL/SLL)**| [ ] Yes [ ] No | | |
| **6. Consequences of Operational Deviation Evaluation** | [ ] Yes [ ] No | | |

### 3.2 Safe Operating Limits & Deviation Consequences Matrix

| Equipment / Stream Tag | Process Parameter | Safe Lower Limit (SLL) | Normal Operating Value | Safe Upper Limit (SUL) | Unit | Consequence of Exceeding Limit (Deviation) | Corrective Action / Engineered Safeguard |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| **V-101 (Example)** | Pressure | 0 | 185 | 250 | psig | Overpressurization, relief discharge, rupture | High-pressure interlock, PSV-101 |
| **V-101 (Example)** | Temperature | -20 | 65 | 115 | °F | Vaporization surge, thermal overpressure | High-temp alarm, cooling jacket trip |
| **V-101 (Example)** | Liquid Level | 15% | 60% | 85% | % | Pump cavitation (low) / Liquid carryover to compressor | Low/High level switches (LSH-101/LSL-101) |
| | | | | | | | |

---

## 4. Part III: Equipment in the Process (OSHA 1910.119(d)(3))

*Required for every vessel, heat exchanger, pump, compressor, piping system, and safety device.*

### 4.1 Pressure Vessels & Storage Tanks Specification

| Specification Item | Engineering Requirements | Actual Equipment Data (e.g. V-101) | Verified Provenance (Datasheet / U-1 Form) |
| :--- | :--- | :--- | :--- |
| **Equipment Tag Number** | Unique plant identifier | | |
| **Equipment Description** | Functional name (e.g. Ammonia Accumulator) | | |
| **Design Code / Standard** | ASME Boiler & Pressure Vessel Code Sec VIII Div 1 | | |
| **National Board Number / CRN** | Official vessel registration number | | |
| **Year Built / Installed** | Chronological fabrication year | | |
| **Material of Construction (Shell / Heads)** | ASME SA-spec (e.g., SA-516 Gr 70) | | |
| **Corrosion Allowance** | Specified internal metal allowance (inches or mm) | | |
| **Maximum Allowable Working Pressure (MAWP)**| Stamped internal design pressure (psig or bar(g)) | | |
| **Design Temperature (Max / Min MDMT)** | Coincident design temp & Minimum Design Metal Temp | Max: _____ °F<br>MDMT: _____ °F | |
| **Total Vessel Volume / Capacity** | Gallons (gal), Barrels (bbl), or Cubic Meters (m3) | | |
| **Operating Capacity / Working Volume** | Normal working liquid volume | | |
| **Post-Weld Heat Treatment (PWHT)?** | Required for stress corrosion cracking prevention | [ ] Yes [ ] No | |
| **Radiography (RT-1, RT-2, RT-3, RT-4)** | Weld inspection level | | |

---

### 4.2 Piping, Valves & Instrumentation Systems

| Specification Item | Specification Description | Engineering Standard Followed |
| :--- | :--- | :--- |
| **Piping Specification Code** | ASME B31.3 (Process Piping) / ASME B31.5 (Refrigeration) | |
| **Pipe Schedule & Wall Thickness** | Sch 40, Sch 80, Sch 160 with nominal diameter | |
| **Flange Rating & Facing** | Class 150 / 300 / 600; Raised Face (RF) or RTJ | |
| **Gasket Metallurgy & Filler** | Spiral wound SS316 with graphite or PTFE filler | |
| **Positive Material Identification (PMI)**| Required alloy verification tests performed | [ ] Verified [ ] N/A |
| **Current P&ID Revision & Drawing Number**| Authoritative digital drawing reference | |

---

### 4.3 Relief Systems & Safeguards Design Basis

| Relief Device Tag | Protected Equipment Tag | Valve Manufacturer & Model | Set Pressure (psig) | Sizing Orifice Area (in2) | Sizing Governing Case (Fire, Runaway, Blocked Discharge) | Relief Discharge Routing (Atmosphere, Flare, Scrubber) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **PSV-101A** | V-101 | Consolidated / Anderson Greenwood | 250 psig | Letter: ____ (in2) | External pool fire per API 521 | Emergency Scrubber System |
| | | | | | | |

---

### 4.4 Electrical Classification & Ventilation

| Area / Room Identifier | NFPA 497 / NEC Class | Division / Zone | Group (A, B, C, D) | Ventilation Type (Natural / Mechanical) | Air Changes per Hour (ACH) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Compressor Building** | Class I | Division 2 | Group D | Continuous Mechanical Exhaust | 12 ACH |
| **Tank Farm Area** | Class I | Division 2 | Group D | Natural Open Air | N/A |

---

## 5. Engineering Verification & Sign-Off Block

### Submitting Organization (Supplier / Licensor / EPC)
I hereby certify that the information provided in this questionnaire represents accurate engineering data extracted from verified manufacturer documentation, lab testing, or standard codes.

* **Authorized Engineer Name:** _____________________________________________
* **Professional Engineering (PE) License # / Title:** ________________________
* **Company / Organization:** ______________________________________________
* **Signature:** __________________________________ **Date:** _______________

---

### Receiving Facility (SafeFlow AI Lead Process Safety Engineer)
I have reviewed the submitted Process Safety Information against OSHA 29 CFR 1910.119(d) and confirmed that all required categories have been verified or recorded as unverified candidates in the SafeFlow AI digital database.

* **SafeFlow AI Reviewer Name:** __________________________________________
* **Role (Lead PHA Facilitator / PSM Manager):** _____________________________
* **Review Status:** [ ] Confirmed Authoritative [ ] Revisions Required [ ] Stored as Candidate
* **Signature:** __________________________________ **Date:** _______________
