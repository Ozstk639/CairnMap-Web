# V32 local browser acceptance

These scripts drive an isolated Edge/Chromium profile through CDP. They edit test drafts and local storage in that profile. Use a dedicated profile, never an existing personal profile.

The app must be running at `http://127.0.0.1:5188`; CDP must be listening at `127.0.0.1:9238` with origin `http://127.0.0.1:9238`. Python requires `websocket-client`. Screenshots and JSON results default to the ignored `artifacts/` folder, or the directory named by `CAIRNMAP_ACCEPTANCE_OUT`.

Example PowerShell setup from the worktree:

```powershell
npm run dev -- --host 127.0.0.1 --port 5188 --strictPort
```

In a second terminal, launch the dedicated browser:

```powershell
$acceptanceProfile = Join-Path $env:TEMP 'cairnmap-v32-acceptance-profile'
Start-Process -WindowStyle Hidden -FilePath 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' -ArgumentList @('--headless=new', '--disable-gpu', '--remote-debugging-port=9238', '--remote-allow-origins=http://127.0.0.1:9238', '--no-first-run', "--user-data-dir=$acceptanceProfile", 'about:blank')
python scripts/config-tools/browser/browser_check.py
python scripts/config-tools/browser/studio_extended.py
python scripts/config-tools/browser/render_browser.py
python scripts/config-tools/browser/interaction_browser.py
```

Run browser scripts sequentially because they control the same test page. The original acceptance used an independent profile under the workspace's `migration-runs/runtime-v32-20261007` directory.

Coverage:

- `browser_check.py`: two tabs, unsaved-draft blocking, saving/discarding, bounded wheel scrolling and compatibility URL.
- `studio_extended.py`: invalid target/token saving, assignments and grip sorting, actual exported-file reimport, field layout and empty English. Sorting dispatches HTML drag events to grip handles; it also verifies that other controls are not draggable.
- `render_browser.py`: nine directions and signed offsets, seven label families, real multipart counts, whole-center count, V1/V3 BUD Zoom 0/2/3/5/6/8, main/preview pixel parity, loaded low-Zoom tiles and actual ZIP roundtrip.
- `interaction_browser.py`: real mouse clicks on all component labels and displaced labels; unchanged-URL image size/anchor changes; clicks at the image rectangle edge; host/member preview fixtures.

`render-acceptance.html` mounts the production `RuleDrivenLayer` or `ConfigRuntimePreview` with controlled fixtures. Its `mode=v1` uses the candidate tree's legacy path, so that mode alone is **not** an independent historical oracle. The independent tests below use the detached frozen reference on port 5189.

Tile checks use the live RIA Satellite source. A network/source failure makes that acceptance fail; the production preview reports tile errors instead of silently appearing blank. Core `npm run verify:config-v32` remains deterministic and does not require this browser or the live tile service.

## Independent parity and production-host checks

Create a detached reference at frozen commit `0b82863d4fea3791f98917ba6d13f70e1f27eb15` in a separate worktree. Keep all 520 recorded source/assets/config/dependency files unchanged. Serve it at 5189 with the same installed dependency versions. The reference needs test-only HTML/TSX entries `v1-oracle` and `v1-workflow-oracle`; copying those test entries is allowed, replacing any frozen production file is not. The candidate entries live beside this README's parent directory.

Run sequentially, after the four basic scripts:

```powershell
$env:CAIRNMAP_ACCEPTANCE_OUT = 'G:/RIAWebGIS/NewPRES/CairnMap_Codex/migration-audits/runtime-v32-implementation-20261008'
python scripts/config-tools/browser/independent_matrix.py
python scripts/config-tools/browser/independent_matrix.py --hierarchy
python scripts/config-tools/browser/independent_dense.py
python scripts/config-tools/browser/bud_independent.py
python scripts/config-tools/browser/svg_offsets.py
python scripts/config-tools/browser/interaction_parity.py
python scripts/config-tools/browser/interaction_states.py
python scripts/config-tools/browser/native_workflow_matrix.py
python scripts/config-tools/browser/workflow_capture_parity.py
python scripts/config-tools/browser/external_lifecycle.py
python scripts/config-tools/browser/lifecycle_browser.py
python scripts/config-tools/browser/field_binding_browser.py
npx tsx --tsconfig tsconfig.app.json scripts/config-tools/refresh-parameter-ledger.ts
npx tsx --tsconfig tsconfig.app.json scripts/config-tools/build-parity-delivery.ts
python scripts/config-tools/browser/delivery_import.py
python scripts/config-tools/browser/summarize_acceptance.py
```

`--reuse-reference` reuses the already captured V1 measurements in the corresponding result JSON; use it only after rechecking the frozen 520-file inventory. It does not recapture V1 and must not be used to create initial expectations.

- Matrix: 101 schema/catalog records × nine logical Zooms; hierarchy: 28 additional paths × nine Zooms; both measure visible DOM labels and geometry styles rather than whole-image similarity. BUD/STB's deliberate CSS-dot-to-geometry change has its own symbol/center check.
- Dense: 29 mixed records across six Zoom/pan scenarios, recording label identities and bounds as well as paired images.
- Native workflow matrix: 17 composed flows, two input variants each, production MeasuringModule with real drawing clicks and complete record comparison to V1 schema/assembler fixtures.
- Capture/external: actual frozen components/formatters in a test capture bridge on 5189; actual production MeasuringModule on 5188. This is not a replay of the entire frozen V1 MeasuringModule. Source components remain untouched.
- Five states: real pointer for hover/selection, production search-select/close events, and production temp-source storage/change events for editing/deletion; enable/disable/re-enable/recover. Full edit/delete tool UX still belongs to manual acceptance.
- Field binding: actual Studio authoring, numeric-array defaults in Runner, modified values in a real committed record. Delivery import: actual file input imports the generated ZIP and saves identical JSON content.

These are automatic CDP checks. User manual acceptance, unlisted data combinations and every possible advanced parameter value are not implied by passing them. The parameter ledger identifies compatibility metadata and system fields separately, with evidence scoped to each capability family.
