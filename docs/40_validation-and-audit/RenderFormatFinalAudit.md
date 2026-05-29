# Render / Format Final Audit

`npm run audit:render-format-final` checks whether the display, schema, and format runtime contracts have reached the finalization stage.

This audit does not run the map and does not replace TypeScript build checks. It verifies that every core Class has a config-owned display, schema, and format contract, while legacy files are treated as compatibility exports, fallback layers, or runtime algorithm executors.

The audit is intentionally removable: deleting this document, `scripts/audit-render-format-final.mjs`, and the npm script does not affect runtime behavior.

## Display Algorithm Registry

CM_RENDER_FORMAT_FINAL_2 adds `displayAlgorithms.json`. The final audit checks that Class display rules only reference registered display algorithm keys. These keys are configuration declarations; TypeScript remains the executor for the actual algorithm body.

## Final Completion Contract

CM_RENDER_FORMAT_FINAL_6 marks `renderFormatFinalContracts.json` as `runtimeStatus: completed`. Every core Class must have `completionStatus: configDefinitionComplete`. This means display and format definitions are config-owned, while TypeScript remains the runtime executor and compatibility adapter.
