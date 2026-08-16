# CM_REVIEW_STATUS_BOARD_UI_1

Local candidate: generic review status-board contracts, deterministic release-plan helper, role-aware login-status wording, an optional provider-neutral standard-package upload port, and the provider-neutral `ReviewStatusBoardPanel` workbench. The panel owns review-sequence, revision-detail, status-board save, package precheck, release-gate, release-precheck and release-confirmation interaction through ports. No RIA provider/configuration or external authority is included.

Validation: build, status-board test and workspace-contract test passed.

## Relay package protocol boundary refinement

The generic Review package core now owns the fixed Relay ZIP wire layout:
`Data_Spilt/`, `Picture/`, `INDEX.json`, `Review.json`, `Delete.json` and
`Tool_Refresh/`. Applications provide only a versioned JSON classification
profile (`profileId`, `nestedKindClasses`). Unknown path-override keys are
rejected, so a downstream profile cannot redefine the protocol. The generic
parser accepts the fixed layout and optional nested kind segments; application
adapters only materialize the already parsed package into their own workspaces.
The Mapping export/import helpers now delegate to that same package core;
there is no second serializer or path recognizer that can drift from it.
