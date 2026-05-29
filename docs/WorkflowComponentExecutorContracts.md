# Workflow Component Executor Contracts

`workflowRuntimeContracts.json` and `workflowFinalContracts.json` now record the concrete component executor selected by config for each workflow. The executor is not a fallback definition source; it is the TS implementation selected by the config contract.

This makes workflow dispatch explicit while preserving exact UI parity for Road, Building, Warp, Teleport, natural feature and rail/station workflows.
