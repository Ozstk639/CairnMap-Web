# Workflow Runtime

Current OpenRIAMap workflows are dispatched by configuration and executed by registered legacy parity components.

The workflow JSON files in presets now act as compact invocation records:

- workflow id
- target class and geometry
- legacy workflow key
- UI runtime component key
- reserved block-runner status
- legacy parity page summary

The block runner definitions remain in `shared/workflow/` for future new workflows. Existing OpenRIAMap workflows should not carry unused block/page assembly definitions unless a specific workflow is deliberately migrated to block execution.
