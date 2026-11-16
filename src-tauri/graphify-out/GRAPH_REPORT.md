# Graph Report - src-tauri  (2026-11-13)

## Corpus Check
- 5 files · ~7,772 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 73 nodes · 72 edges · 8 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- permissions
- icon
- tauri.conf.json
- default.json
- apply_fullscreen
- build

## God Nodes (most connected - your core abstractions)
1. `permissions` - 35 edges
2. `icon` - 6 edges
3. `build` - 5 edges
4. `apply_fullscreen()` - 4 edges
5. `schedule_fullscreen_retries()` - 4 edges
6. `bundle` - 4 edges
7. `run()` - 3 edges
8. `app` - 3 edges
9. `windows` - 2 edges
10. `security` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Import Cycles
- None detected.

## Communities (8 total, 0 thin omitted)

### Community 0 - "permissions"
Cohesion: 0.06
Nodes (35): permissions, core:default, core:window:allow-current-monitor, core:window:allow-inner-size, core:window:allow-is-fullscreen, core:window:allow-is-maximized, core:window:allow-is-visible, core:window:allow-maximize (+27 more)

### Community 1 - "icon"
Cohesion: 0.22
Nodes (9): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, bundle, active, icon (+1 more)

### Community 2 - "tauri.conf.json"
Cohesion: 0.22
Nodes (8): app, security, windows, identifier, productName, $schema, csp, version

### Community 3 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, $schema, windows, main

### Community 4 - "apply_fullscreen"
Cohesion: 0.80
Nodes (4): AppHandle, apply_fullscreen(), run(), schedule_fullscreen_retries()

### Community 5 - "build"
Cohesion: 0.40
Nodes (5): build, beforeBuildCommand, beforeDevCommand, devUrl, frontendDist

## Knowledge Gaps
- **55 isolated node(s):** `$schema`, `identifier`, `description`, `main`, `core:default` (+50 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `permissions` connect `permissions` to `default.json`?**
  _High betweenness centrality (0.299) - this node is a cross-community bridge._
- **Why does `bundle` connect `icon` to `tauri.conf.json`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **What connects `$schema`, `identifier`, `description` to the rest of the system?**
  _55 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `permissions` be split into smaller, more focused modules?**
  _Cohesion score 0.05714285714285714 - nodes in this community are weakly interconnected._