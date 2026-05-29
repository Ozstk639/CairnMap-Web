# Workflow shared config

This directory contains reusable workflow templates, block definitions, field
controls, and runtime contracts.

Workflow files live in `project-config/packages/openriamap-ria/workflows/`.

## Workflow parity executor state

`workflowLegacyExecutors.json` is the authoritative routing table from public workflow keys to the TS executor component selected by config. Workflow JSON files must declare `uiRuntime.componentKey` matching a registered executor.

Do not replace these executors with schema-inferred blocks unless the target workflow has been parity-tested against the old component page order, placeholders, ID assembly and save output.
