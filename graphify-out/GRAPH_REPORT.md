# Graph Report - .  (2026-07-20)

## Corpus Check
- 12 files · ~56,801 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 20 nodes · 17 edges · 6 communities (4 shown, 2 thin omitted)
- Extraction: 53% EXTRACTED · 47% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Booking & Queue Management
- User & State Management
- Dashboard & Analytics
- UI & Visual Design
- Application Identity
- Theme System

## God Nodes (most connected - your core abstractions)
1. `Central State Object (rq_pro_*)` - 4 edges
2. `Court Booking and Queue Entry Flow` - 4 edges
3. `Fixed Lesson Schedules by Court` - 3 edges
4. `Granular Court Release (period/time-based)` - 3 edges
5. `Three User Profiles (Publico/Diretora/Esportes)` - 2 edges
6. `Occupancy Analytics Engine (30-day rolling)` - 2 edges
7. `Dashboard Real-time KPIs` - 2 edges
8. `Activity Reversal/Undo System` - 2 edges
9. `Firebase Cloud Sync (real-time)` - 2 edges
10. `Glassmorphism UI Design Pattern` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Central State Object (rq_pro_*)` --references--> `Firebase Cloud Sync (real-time)`  [EXTRACTED]
  index.html → index.html  _Bridges community 1 → community 0_

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Court Booking Lifecycle (Booking → Play → Release → History)** — index_html_court_booking_flow, index_html_waitlist_management, index_html_release_court_flow, index_html_activity_reversal, index_html_booking_rules, index_html_dashboard_kpis [INFERRED 0.95]

## Communities (6 total, 2 thin omitted)

### Community 0 - "Booking & Queue Management"
Cohesion: 0.33
Nodes (6): Booking Validation Rules (activity player counts), Court Booking and Queue Entry Flow, Firebase Cloud Sync (real-time), Granular Court Release (period/time-based), Toast Notification System with Inline Actions, Waitlist Management with Drag & Drop

### Community 1 - "User & State Management"
Cohesion: 0.50
Nodes (5): Activity Reversal/Undo System, Fixed Lesson Schedules by Court, PIN-based Login/Authentication, Central State Object (rq_pro_*), Three User Profiles (Publico/Diretora/Esportes)

### Community 2 - "Dashboard & Analytics"
Cohesion: 0.50
Nodes (4): Dashboard Real-time KPIs, CSV Data Export (G.2/G.4/G.5), Internet Time Synchronization (timeapi.io), Occupancy Analytics Engine (30-day rolling)

### Community 3 - "UI & Visual Design"
Cohesion: 0.67
Nodes (3): Three.js 3D Animated Tennis Background, Glassmorphism UI Design Pattern, Mobile-First Responsive Layout

## Knowledge Gaps
- **9 isolated node(s):** `ReservaQuadras Pro v8 Court Management System`, `PIN-based Login/Authentication`, `Waitlist Management with Drag & Drop`, `CSV Data Export (G.2/G.4/G.5)`, `Dark/Light/Auto Theme System` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Central State Object (rq_pro_*)` connect `User & State Management` to `Booking & Queue Management`?**
  _High betweenness centrality (0.114) - this node is a cross-community bridge._
- **Why does `Granular Court Release (period/time-based)` connect `Booking & Queue Management` to `User & State Management`?**
  _High betweenness centrality (0.079) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Central State Object (rq_pro_*)` (e.g. with `Fixed Lesson Schedules by Court` and `Three User Profiles (Publico/Diretora/Esportes)`) actually correct?**
  _`Central State Object (rq_pro_*)` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Court Booking and Queue Entry Flow` (e.g. with `Firebase Cloud Sync (real-time)` and `Granular Court Release (period/time-based)`) actually correct?**
  _`Court Booking and Queue Entry Flow` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Fixed Lesson Schedules by Court` (e.g. with `Activity Reversal/Undo System` and `Central State Object (rq_pro_*)`) actually correct?**
  _`Fixed Lesson Schedules by Court` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ReservaQuadras Pro v8 Court Management System`, `PIN-based Login/Authentication`, `Waitlist Management with Drag & Drop` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._