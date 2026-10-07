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

`render-acceptance.html` and its TSX entry mount the production `RuleDrivenLayer` or `ConfigRuntimePreview` with controlled fixtures. They are test entries served by Vite, and are not imported into the production application entry point. The V1 mode mounts the frozen V1 rule path for comparison.

Tile checks use the live RIA Satellite source. A network/source failure makes that acceptance fail; the production preview reports tile errors instead of silently appearing blank. Core `npm run verify:config-v32` remains deterministic and does not require this browser or the live tile service.
