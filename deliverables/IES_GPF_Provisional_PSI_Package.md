# Onshore Sour Gas Processing Facility
## Provisional Process Description, Stream Register, and PSI Gap List

**Prepared:** 24 November 2026  
**Purpose:** Working draft from the IES resource pack supplied by the user  
**Status:** Provisional — for process-engineer review; not approved for operations, design, or PHA use

## Document basis and limits

This draft was assembled from the supplied IES archive: IES-BOD-GPF-001, BFD-GPF-001, PFD-GPF-001, P&ID-GPF-001-02, and the process, operating, control, and shutdown philosophies. The BOD and philosophy documents identify themselves as Rev B, Issued for Review. The P&ID image identifies itself as Rev A, Issued for Review. The IES resource page describes the library as prepared using AI-assisted engineering workflows.

Treat these files as source material for a review draft, not as verified plant records. The HAZOP markup is a review annotation; it is not a replacement for the clean, approved P&ID. Values marked assumed, TBC, design envelope, or issued for review retain that status here.

## 1. Draft process description

### 1.1 Facility and process scope

The documents describe an onshore sour-gas processing facility. The BFD shows the overall facility from wellhead reception through gas treatment and export, condensate handling, and produced-water treatment. The supplied PFD is specifically for inlet receiving and manifolds. The supplied P&ID covers the pig receiver and inlet control section; it is not the complete downstream P&ID set.

### 1.2 Inlet receiving and pig receiver

Wellhead gas is routed to the production and test manifolds. The PFD identifies four production-well inlet streams and two test-well inlet streams. The production-manifold outlet and test-manifold outlet/tie-in are shown feeding the inlet system. The P&ID shows the production inlet header through XV-1001 to PG-1001, the pig receiver/slug catcher.

PG-1001 provides pigging and slug/liquid handling before the inlet three-phase separation system. Its gas outlet, PG-1001 N2, is routed through CV-1001, XV-1002, and PCV-1001 to the HP separator inlet. The P&ID line list gives this route as lines PG-00103 through PG-00106. The P&ID also shows a liquid outlet through LCV-1001 to the condensate/oil system, a PSV and BDV route to the sour flare header, a drain to the closed-drain drum, and a vent to the flare header.

The exact location of the test-manifold tie-in and the downstream separator drawing reference should be confirmed against the approved drawing set.

### 1.3 Separation, treating, and products

The BOD describes inlet three-phase separation into HP gas, IP/LP gas, condensate, and produced water. HP gas is routed first to the MDEA acid-gas-removal unit. The stated targets are less than 4 ppm mol H2S and less than 2 mol% CO2. The BOD says IP/LP gas bypasses the amine unit and enters compression suction; flash gas from condensate stabilization also joins that suction header.

The BOD and process design philosophy describe gas compression and TEG dehydration, followed by hydrocarbon-dewpoint control using a JT valve as the primary technology. The BOD states a sales-gas delivery pressure of at least 70 barg and a water-dewpoint target of -10 °C at 70 barg. A portion of conditioned gas is described as recycled for gas lift, with another portion routed to the gas-injection manifold. These are design-basis statements and require confirmation against the current approved PFDs and simulation.

Condensate is routed to stabilization, then to storage and export/loading. Produced water is routed to treatment; the final disposal route is identified as TBC in the BOD. The BOD describes acid gas from the amine regenerator as going to the sour flare. The detailed routing and operating conditions for downstream units are not present in the supplied PFD/P&ID sheets.

### 1.4 Reported feed basis — unresolved

The BOD reports the following inlet basis, with the fields marked [CLIENT SPEC] in that document:

| Parameter | BOD value | Status / note |
|---|---:|---|
| Gross gas flow | 15 MMSm3/d | Reported as client specification; confirm approved basis and case |
| Inlet pressure | 72 barg | Reported as client specification |
| Inlet temperature | 55 °C | Reported as client specification |
| Water content | 850 mg/Sm3 | Reported as client specification |
| Condensate-gas ratio | 45 Sm3/MMSm3 | Reported as client specification |
| H2S | 2,800 ppm mol | Reported as client specification |
| CO2 | 6.5 mol% | Reported as client specification |
| Mercaptans, as sulfur | 180 mg/Sm3 | Reported as client specification |

The BOD composition table lists methane 78.4, ethane 8.7, propane 4.9, i-butane 1.6, n-butane 1.2, C5+ 0.9, CO2 6.5, N2 1.8, and H2S 0.28 mol%. These values total **104.28 mol%**, while the table states 100.0%. Do not use this composition for a simulation, stream allocation, or final PSI entry until the process engineer supplies a corrected, documented composition. The BOD also lists C5+ characterization as TBC-01.

The reported overall feed values are not allocated to individual PFD stream numbers or individual wells in this register.

## 2. PFD stream register

The supplied PFD-GPF-001 labels streams 1–9 and provides routes/names, but does not provide per-stream flow, composition, pressure, or temperature. Those fields are intentionally left as not stated.

| PFD stream | Documented description / route | Flow | Composition | Pressure | Temperature | Source and status |
|---:|---|---|---|---|---|---|
| 1 | Well 1 inlet to production manifold MV-1001 | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001; route only |
| 2 | Well 2 inlet to production manifold MV-1001 | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001; route only |
| 3 | Well 3 inlet to production manifold MV-1001 | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001; route only |
| 4 | Well 4 inlet to production manifold MV-1001 | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001; route only |
| 5 | Test Well 1 inlet to test manifold MV-1002 | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001; route only |
| 6 | Test Well 2 inlet to test manifold MV-1002 | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001; route only |
| 7 | Production manifold outlet toward PG-1001 through inlet isolation XV-1001 | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001 and P&ID-GPF-001-02; route only |
| 8 | PG-1001 gas outlet toward HP separator inlet through CV-1001, XV-1002, and PCV-1001 | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001 and P&ID-GPF-001-02; downstream drawing PFD-GPF-002 referenced but not supplied |
| 9 | Test manifold outlet / tie-in to the inlet process line | Not stated | Not stated | Not stated | Not stated | PFD-GPF-001; tie-in point needs drawing confirmation |

### PFD stream data still required

For each stream and each required operating case, request the stream number/tag, source and destination, phase, normal/minimum/maximum/design flow and units, composition with basis, operating pressure and temperature, and the source case or calculation. Request the case definitions used by the process team (for example normal, design/peak, turndown, startup, shutdown, and emergency where applicable). Do not copy the aggregate feed flow onto each well stream.

## 3. P&ID line-list transcription

The following table transcribes the line list visible on P&ID-GPF-001-02. It is a piping route/size/specification list, not a stream-condition table.

| Line number | Size | From | To | Spec shown |
|---|---:|---|---|---|
| 10&quot;-PG-00101-A1A | 10 in | Inlet header (MV-1001) | XV-1001 inlet | A1A |
| 10&quot;-PG-00102-A1A | 10 in | XV-1001 outlet | PG-1001 N1 (inlet) | A1A |
| 10&quot;-PG-00103-A1A | 10 in | PG-1001 N2 (gas outlet) | CV-1001 inlet | A1A |
| 10&quot;-PG-00104-A1A | 10 in | CV-1001 outlet | XV-1002 inlet | A1A |
| 10&quot;-PG-00105-A1A | 10 in | XV-1002 outlet | PCV-1001 inlet | A1A |
| 6&quot;-PG-00106-A1A | 6 in | PCV-1001 outlet | HP separator inlet | A1A |
| 4&quot;-PG-00107-A1A | 4 in | PG-1001 N3 (liquid outlet) | LCV-1001 inlet | A1A |
| 4&quot;-PG-00108-A1A | 4 in | LCV-1001 outlet | Condensate/oil system | A1A |
| 4&quot;-FL-00101-A1A | 4 in | BDV-1001 outlet | Flare header | A1A |
| 4&quot;-FL-00102-A1A | 4 in | PSV-1001 outlet | Flare header | A1A |
| 2&quot;-DR-00101-A1A | 2 in | PG-1001 N5 (drain) | Closed-drain drum | A1A |
| 2&quot;-VT-00101-A1A | 2 in | PG-1001 N6 (vent) | Flare header | A1A |

The P&ID notes describe sour-service requirements and state that open draining is not permitted on sour service. Confirm the full specification meaning of A1A and the above line list against the current controlled drawing before design use. External destinations such as flare header, closed-drain drum, HP separator, and condensate/oil system need their continuation drawing/tag references.

## 4. PSI gap and request list

| Request | Needed from | Why / use | Current status |
|---|---|---|---|
| Corrected feed-gas composition with analytical basis, sample date, and closure to 100 mol% | Client / gas supplier / process engineering | Required to establish mixture properties and reconcile BOD composition | Open; listed values total 104.28 mol% |
| Latest feed-gas assay or chromatograph report and feed-mixture SDS | Client / gas supplier | Establishes actual mixture identity/composition and supports chemical-hazard information | Not in supplied archive |
| Current SDS for MDEA solution and TEG product, including concentration/grade; chemical injection inventory and SDSs for chemicals actually used | Procurement / operations / suppliers | Establishes hazards for purchased chemicals and mixtures | Not in supplied archive; confirm chemical inventory |
| H&MB or simulation stream report for PFD streams and downstream process streams | Process engineer / EPC / licensor | Supplies per-stream flow, composition, phase, pressure, and temperature by case | Not in supplied archive |
| Approved process description and process chemistry narrative | Process owner / process engineer | Confirms intended process sequence, chemistry, boundary limits, and unit tie-ins | Drafted above from review-stage documents; approval needed |
| Safe upper/lower operating limits, maximum intended inventories, and consequences of deviations | Process engineering / PSM team | Completes key process-technology PSI information for review | Not fully supplied; design ratings are not substitutes for safe operating limits |
| Downstream PFD sheets, including referenced PFD-GPF-002, plus current controlled P&ID set and source vector/CAD files | Document control / EPC | Confirms downstream routes and improves geometry-based connection extraction | Only inlet PFD and one pig-receiver P&ID image supplied |
| Approved line list and current equipment/instrument registers | Document control / process engineering / instrumentation | Reconciles tags, endpoints, units, and revisions | Partial lists visible on supplied P&ID only |

## 5. Recommended SafeFlow handling

1. Upload each source with its correct document type and revision. Keep the HAZOP markup in a review/markup category; do not substitute it for the clean controlled P&ID.
2. Record the process description above as a draft with source-document references. Do not mark the description or extracted values as engineer verified.
3. Import the nine PFD stream rows as route-only records if SafeFlow supports them. Keep unprovided process conditions unknown rather than entering zero or estimating them.
4. Keep the P&ID line list separate from the PFD stream table. The line list gives physical routes and sizes; it does not provide the missing material balance.
5. For P&ID connection recognition, request original vector PDF/CAD. The supplied resource drawings are PNG images, and the current SafeFlow raster tracing path does not extract actual pipe geometry.
6. Keep the package in provisional review until the composition, H&MB/stream data, chemical-hazard data, and controlled drawings are resolved.

OSHA's PSM rule calls for written PSI before the PHA, including chemical hazards, process technology, and equipment information. It lists process chemistry, maximum intended inventory, safe upper/lower limits, consequences of deviations, and material/energy balances among the required information. SDSs may be used for the chemical-hazard portion only to the extent they contain the required information. See [29 CFR 1910.119(d)](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.119) and [OSHA Appendix C](https://www.osha.gov/laws-regs/regulations/standardnumber/1910/1910.119AppC).

## Sources reviewed

- User-supplied archive: IES-Main dataset.rar.
- IES Engineering Document Library: https://ies-solutions.org/resources
- IES-BOD-GPF-001, Basis of Design, Rev B, Issued for Review.
- IES-PDP-GPF-001, Process Design Philosophy, Rev B, Issued for Review.
- IES-OPH-GPF-002, Operating Philosophy, Rev B, Issued for Review.
- IES-CPH-GPF-003, Control Philosophy, Rev B, Issued for Review.
- IES-SDP-GPF-004, Shutdown & ESD Philosophy, Rev B, Issued for Review.
- BFD-GPF-001 and PFD-GPF-001 drawing images.
- P&ID-GPF-001-02, Pig Receiver & Inlet Control, Rev A, Issued for Review.
