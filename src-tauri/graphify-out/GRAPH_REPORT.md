# Graph Report - src-tauri  (2026-11-17)

## Corpus Check
- 7 files · ~14,742 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 135 nodes · 180 edges · 10 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `0a77dde7`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- permissions
- icon
- tauri.conf.json
- default.json
- apply_fullscreen
- build
- Shared
- apply_app_update

## God Nodes (most connected - your core abstractions)
1. `permissions` - 42 edges
2. `Shared` - 12 edges
3. `serve_connection()` - 9 edges
4. `LocalApi` - 8 edges
5. `accept_loop()` - 8 edges
6. `local_api_start()` - 8 edges
7. `parse_request()` - 7 edges
8. `icon` - 7 edges
9. `read_headers()` - 6 edges
10. `bundle` - 6 edges

## Surprising Connections (you probably didn't know these)
- `Reply` --references--> `String`  [EXTRACTED]
  src/local_api.rs →   _Bridges community 8 → community 5_

## Import Cycles
- None detected.

## Communities (10 total, 0 thin omitted)

### Community 0 - "permissions"
Cohesion: 0.05
Nodes (42): permissions, allow-apply-app-update, allow-local-api-respond, allow-local-api-set-token, allow-local-api-start, allow-local-api-stop, core:default, core:window:allow-current-monitor (+34 more)

### Community 1 - "icon"
Cohesion: 0.14
Nodes (14): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, icons/icon.png, bundle, active (+6 more)

### Community 2 - "tauri.conf.json"
Cohesion: 0.11
Nodes (18): https://github.com/alekseevich47/controlcenter/releases/latest/download/latest.json, app, security, windows, build, beforeBuildCommand, beforeDevCommand, devUrl (+10 more)

### Community 3 - "default.json"
Cohesion: 0.33
Nodes (5): description, identifier, $schema, windows, main

### Community 4 - "apply_fullscreen"
Cohesion: 0.43
Nodes (6): Monitor, fit_window_to_work_area(), resolve_monitor(), Option, run(), WebviewWindow

### Community 5 - "build"
Cohesion: 0.17
Nodes (26): AppHandle, Arc, Self, SocketAddr, accept_loop(), ct_eq(), header_value(), is_loopback() (+18 more)

### Community 8 - "Shared"
Cohesion: 0.25
Nodes (8): AtomicBool, AtomicU16, AtomicU64, HashMap, Mutex, Sender, Reply, Shared

### Community 9 - "apply_app_update"
Cohesion: 0.43
Nodes (6): apply_app_update(), button_command_refuses_and_does_not_rewrite_the_repository(), Option, Result, String, UpdateApplyResult

## Knowledge Gaps
- **67 isolated node(s):** `$schema`, `identifier`, `description`, `main`, `core:default` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `permissions` connect `permissions` to `default.json`?**
  _High betweenness centrality (0.120) - this node is a cross-community bridge._
- **Why does `bundle` connect `icon` to `tauri.conf.json`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `Shared` connect `Shared` to `build`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `$schema`, `identifier`, `description` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `permissions` be split into smaller, more focused modules?**
  _Cohesion score 0.047619047619047616 - nodes in this community are weakly interconnected._
- **Should `icon` be split into smaller, more focused modules?**
  _Cohesion score 0.14285714285714285 - nodes in this community are weakly interconnected._
- **Should `tauri.conf.json` be split into smaller, more focused modules?**
  _Cohesion score 0.10526315789473684 - nodes in this community are weakly interconnected._