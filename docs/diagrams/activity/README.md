# Main Workflows — Activity Diagrams (SDD)

Source of truth for the activity diagrams referenced in Report 4 (SDD) and the Review 2 Design Brief.
Each main workflow has exactly one diagram. Diagrams are written in **PlantUML**; `export/` holds rendered PNG/SVG for documents and slides.
Every step in these diagrams corresponds to code in `be/src/modules/**` (file references are in the header comment of each `.puml`).

## Workflow list

| ID | Workflow | Actors | Trigger | Business outcome | Main entity state path | Owner | File |
|---|---|---|---|---|---|---|---|
| WF-01 | Order Intake & Consolidation | Customer, Marketplace (Lazada / AURELLE), OptiPack System, Store Owner / Coordinator, Warehouse Staff | Customer places an order | Order is imported, consolidated into an order group, stock reserved, picker assigned | Order Group: `awaiting_packaging → picking` | _TBD_ | `WF-01_order_intake_consolidation.puml` |
| WF-02 | Picking | Warehouse Staff, OptiPack System, Packaging Staff | Group is in `picking` with an assigned picker | All items picked (or shortage decided) and group ready for packing | Order Group: `picking → picked` / `picking → partial_needs_review → picked \| picking` | _TBD_ | `WF-02_picking.puml` |
| WF-03 | Packing | OptiPack System, Packaging Staff, Reviewer (other staff / Admin) | Group reaches `picked` | Every parcel sealed and weighed, group packed | Packing Plan: `computing → ready → packing → packed` (`rejected`, `failed`); Order Group: `picked → pending_approval → approved_for_packing → packed` | _TBD_ | `WF-03_packing.puml` |
| WF-04 | Shipping via GHN | Shipping Coordinator, OptiPack System, GHN (Carrier), Customer, Warehouse Staff | Coordinator creates a shipment for a packed group | Parcels delivered, or returned to warehouse | Shipment: `awaiting_pickup → in_transit → out_for_delivery → delivered` / `delivery_failed → returning_to_warehouse → returned_to_warehouse`; Order Group: `packed → shipped → delivered \| returned` | _TBD_ | `WF-04_shipping_ghn.puml` |
| WF-05 | Return / Exchange via AURELLE | Customer, AURELLE Website, OptiPack System, Store Owner, Warehouse Staff | Customer submits a return / exchange request on AURELLE | Items inspected; refund recorded or replacement order created | Return Request: `requested → awaiting_receipt → received → closed` (`rejected`, `canceled`; refund only: `requested → closed`) | _TBD_ | `WF-05_return_exchange_aurelle.puml` |
| WF-06 | Stock Receiving by Lot | Warehouse Staff, OptiPack System, AURELLE Website | Goods arrive from supplier | Stock received into bins by lot (FIFO), shortages re-checked, AURELLE stock updated | Stock Lot created; Order Group `stock_shortage` flag cleared when stock is sufficient | _TBD_ | `WF-06_stock_receiving.puml` |
| WF-00 | End-to-End Overview (context only, not a main workflow) | All | — | — | Order Group lifecycle | — | `WF-00_end_to_end_overview.puml` |

## Notation

- One swimlane per actor; `OptiPack System` is the system under design.
- Decisions carry guards on every outgoing edge; status changes of the main entity are written in **bold** (exact values used in code).
- Internal processing (APIs, database writes, transactions) is intentionally omitted, as required for Review 2.

## Rendering

- VS Code: install the *PlantUML* extension (requires Java and Graphviz), open a `.puml` file, press `Alt+D` to preview, right-click → *Export Current Diagram* to PNG/SVG.
- Online: paste the file content into https://www.plantuml.com/plantuml or https://www.planttext.com and download PNG/SVG.
- Command line: `java -jar plantuml.jar -tsvg -o export *.puml` (run inside this folder).
