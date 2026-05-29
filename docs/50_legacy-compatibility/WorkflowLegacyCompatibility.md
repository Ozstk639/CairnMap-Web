# Workflow Legacy Compatibility

Existing OpenRIAMap workflows are currently executed by registered legacy parity components. Config selects the workflow executor; the legacy TS component performs the detailed UI and save logic.

Current role of legacy workflow files:

- component executor
- parity source for existing OpenRIAMap workflows
- compatibility layer for historical workflow keys

They are not the place for new workflow definitions. New workflows should be added through preset/project workflow config and, when ready, block-runner templates in `shared/workflow/`.
