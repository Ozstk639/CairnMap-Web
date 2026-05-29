# CairnMap Display Config Audit

`audit:display-config` is a development-side checker for CairnMap display shadow configuration.

It validates the `display.rules` blocks stored in:

```text
project-config/packages/openriamap-ria/classes/*.json
```

At `CM_DISPLAY_4`, these display rules have entered a controlled runtime overlay path for all core Class groups, but legacy rendering still remains the primary source:

```text
src/components/Rules/rendering/featureRenderRules.ts
src/components/Rules/rendering/display/displayProfiles.ts
src/components/Rules/rendering/labelStyles.ts
```

`CM_DISPLAY_2` added TypeScript read-only helpers for display metadata. `CM_DISPLAY_3` enabled point-feature overlay. `CM_DISPLAY_4` extends that overlay whitelist to line and surface classes while still avoiding full renderer replacement.

## Command

```bash
npm run audit:display-config
```

## What it checks

The audit script checks:

- every Class JSON has a `display` object
- `display.runtimeStatus` is `shadow`
- `display.rules` is an array
- each display rule has `id`, `match.classCode`, and `profile`
- display rule IDs are unique within each Class
- each Class can resolve a primary display rule
- `match.classCode` matches the containing Class file
- `match.kind`, `match.skind`, and `match.skind2`, when present, are strings or string arrays
- referenced `profile` exists in `shared/display/displayProfiles.json`
- referenced `label.styleKey` exists in `shared/display/labelStyles.json` or matches a registered dynamic pattern
- the runtime `featureRenderRules.ts` contains an obvious Class/profile reference
- `specialLogic` uses string keys only and does not contain executable code
- `bindings` entries, when present, have a string key
- `bindings.targetClass`, when present, references a known Class code

## Result levels

```text
PASS
  No errors or warnings.

PASS_WITH_WARNINGS
  No structural errors, but some items need manual review.

FAIL
  One or more structural errors were found.
```

Warnings do not block builds.

## Runtime impact

This audit module is not imported by runtime code and is not part of the build chain.
It only runs when explicitly invoked through the npm script.

The display metadata resolver added under `src/core/project/` is also read-only in `CM_DISPLAY_2`; it does not drive `RuleDrivenLayer` or `featureRenderRules.ts` yet.

## Removal

The display audit module can be removed later without affecting runtime behavior by deleting:

```text
scripts/audit-display-config.mjs
docs/DisplayConfigAudit.md
```

and removing this script from `package.json`:

```json
"audit:display-config": "node ./scripts/audit-display-config.mjs"
```

The `src/core/project/display*.ts` files are not audit-only files. They are the future read-only display metadata bridge and should only be removed if the display configuration bridge itself is intentionally rolled back.

## CM_DISPLAY_3 overlay checks

`CM_DISPLAY_3` introduces a narrow display overlay bridge for simple point features only. The current overlay whitelist is:

```text
TPP, WRP, TRP, ISP, SBP, PLF, STA
```

For these classes, `audit:display-config` treats missing or invalid primary display metadata as an error rather than a warning. Each whitelisted class must have:

- at least one `display.rules` entry;
- a resolvable primary rule;
- a resolvable `profile` in `shared/display/displayProfiles.json`;
- an enabled `label` with `source` and `styleKey`;
- a `label.styleKey` that resolves through exact key, runtime key, or runtime pattern in `shared/display/labelStyles.json`.

The runtime overlay remains transitional. It is isolated in:

```text
src/core/project/displayRuntimeOverlay.ts
```

The runtime bridge may be removed later by deleting that file and removing the thin wrapper call from `featureRenderRules.ts`. This does not affect the long-term display config foundation:

```text
src/core/project/displayMetadata.ts
src/core/project/displayRuleAdapter.ts
project-config/packages/openriamap-ria/classes/{Class}.json
project-config/packages/openriamap-ria/shared/display/displayProfiles.json
project-config/packages/openriamap-ria/shared/display/labelStyles.json
```

The audit script itself is a development tool. It is not imported by runtime code and is not part of the normal build chain unless manually invoked.


## CM_DISPLAY_4 overlay groups

`CM_DISPLAY_4` expands the transitional overlay bridge from point features to all current core Class groups.

The overlay groups are:

```text
point:
  TPP, WRP, TRP, ISP, SBP, PLF, STA

line:
  RLE, ROD, ISL

surface:
  ISG, BUD, FLR, STB, STF, PFB
```

For all classes in these groups, `audit:display-config` treats missing or invalid primary display metadata as an error. Each whitelisted Class must have:

- at least one `display.rules` entry;
- a resolvable primary rule;
- a resolvable `profile` in `shared/display/displayProfiles.json`;
- an enabled `label` with `source` and `styleKey`, unless the rule explicitly disables labels;
- a `label.styleKey` that resolves through exact key, runtime key, or runtime pattern in `shared/display/labelStyles.json`.

The runtime overlay remains intentionally narrow. It may overlay:

```text
label.source
label.styleKey
```

It does not overlay or replace:

```text
display objects
pathStyle
point symbol structure
polygon style
anchor strategy
collision policy
chainageSearch
textPath behavior
specialLogic execution
```

For dynamic runtime style families such as `rle-line-{size}` or `gm-bw-{size}`, the overlay bridge may keep the legacy concrete runtime style key rather than writing the abstract registry ID, such as `rle-line-dynamic`, into a runtime rule.

The transitional overlay bridge remains isolated in:

```text
src/core/project/displayRuntimeOverlay.ts
```

It can be removed later by deleting that file and removing the wrapper call from `featureRenderRules.ts`. The long-term config foundation remains:

```text
src/core/project/displayMetadata.ts
src/core/project/displayRuleAdapter.ts
project-config/packages/openriamap-ria/classes/{Class}.json
project-config/packages/openriamap-ria/shared/display/displayProfiles.json
project-config/packages/openriamap-ria/shared/display/labelStyles.json
```

The audit script itself is a development tool. It is not imported by runtime code and is not part of the normal build chain unless manually invoked.
## CM_DISPLAY_SPECIAL_1：特殊显示逻辑登记检查

CM_DISPLAY_SPECIAL_1 adds two shared configuration files:

```text
project-config/packages/openriamap-ria/shared/display/specialDisplayLogic.json
project-config/packages/openriamap-ria/shared/relation/relationBindings.json
```

The display audit now also checks:

- every `display.rules[].specialLogic[].key` is registered in `specialDisplayLogic.json`;
- every registered special logic key declares a `logicKey`;
- `allowedClasses` includes the Class using that key when `allowedClasses` is present;
- relation binding entries reference known source/target Classes;
- relation binding source/target fields can be found in Class `fields`, `groups`, or `identity` metadata when possible.

This stage still does not execute special display logic at runtime. It only turns previous free-form `specialLogic` strings into registered, auditable keys.

The audit module remains removable. Removing `scripts/audit-display-config.mjs`, this document, and the `audit:display-config` npm script does not affect runtime map rendering.
## CM_DISPLAY_SPECIAL_2：运行时桥接基础层

CM_DISPLAY_SPECIAL_2 adds:

```text
src/core/project/specialDisplayRuntimeBridge.ts
```

This module resolves `specialLogic` keys at runtime and provides per-key feature flags. It does not replace legacy display logic or execute complex relation behavior.

Initial runtime flags:

- simple point/card metadata keys may be enabled for diagnostics;
- building, station, rail, road, large-geometry and line-label logic remains disabled;
- disabled keys are still registered, auditable, and resolvable.

The bridge is transitional. Once the configuration-driven display runtime is mature, this bridge and its feature flags can be replaced by the final renderer/resolver pipeline.
## CM_DISPLAY_SPECIAL_3：建筑 / 楼层 / 站房结构关系绑定

CM_DISPLAY_SPECIAL_3 adds diagnostic relation binding metadata for:

- `BUD → FLR` through `BUD.ID → FLR.BuildingID`;
- `STB → STF` through `STB.ID → STF.staBuildingID`;
- `STB → SBP` through shared `ID`;
- `SBP → STF` through `SBP.Floors.ID → STF.ID`.

These bindings are still diagnostic metadata. They do not replace building, floor, station-building or fallback display logic in `featureRenderRules.ts` or `RuleDrivenLayer.tsx`.

The audit validates that the referenced Classes and fields/groups exist in Class config.
## CM_DISPLAY_SPECIAL_4：车站 / 站台 / 铁路关系绑定

CM_DISPLAY_SPECIAL_4 adds diagnostic relation binding metadata for:

- `STA → PLF` through `STA.platforms.ID → PLF.ID`;
- `STA → STB` through `STA.STBuilding → STB.ID`;
- `SBP → STA` through `SBP.stations.ID → STA.ID`;
- `PLF → RLE` through `PLF.lines.ID → RLE.ID`;
- `RLE → PLF` through `RLE.startplf/endplf → PLF.ID`;
- `PFB → RLE` through `PFB.LineID → RLE.ID`.

These bindings remain diagnostic and auditable. They do not replace station/platform visibility, rail-line color, line-label, navigation, or information-card runtime logic.


## CM_DISPLAY_RUNTIME_1：Runtime profile registry

CM_DISPLAY_RUNTIME_1 introduces the runtime profile registry and config-primary framework files under:

```text
src/core/project/displayRuntimeTypes.ts
src/core/project/displayProfileRuntimeRegistry.ts
src/core/project/displayRuleRuntimeAdapter.ts
```

At this stage, the runtime registry maps display profile IDs from `shared/display/displayProfiles.json` to the current TypeScript runtime display profile objects. It does not replace `featureRenderRules.ts` or `RuleDrivenLayer.tsx`.

The display audit checks that every shared display profile resolves to a known runtime profile key. This keeps future `configPrimary` stages from silently using a profile ID that cannot be executed by the current renderer.

Current runtime modes are declarative only:

```text
legacyPrimary
configOverlay
configPrimary
legacyAlgorithmFallback
```

`CM_DISPLAY_RUNTIME_1` only establishes the contract and resolver foundation. Later runtime patches decide which Class codes move from `configOverlay` to `configPrimary` or `legacyAlgorithmFallback`.


## CM_DISPLAY_RUNTIME_2：Point config-primary

CM_DISPLAY_RUNTIME_2 moves the simple point-feature classes into `configPrimary` declaration mode:

```text
TPP, WRP, TRP, ISP, SBP, PLF, STA
```

For these classes, the display rule declaration in `classes/{Class}.json` becomes the primary source for:

```text
profile
displayTier
geometry.render
label.source
label.styleKey
```

The renderer still uses the existing legacy rule object and TypeScript display execution layer for map drawing, marker behavior, click handling, selection behavior and card interaction. If the config-primary declaration cannot be resolved, runtime code falls back to the legacy rule and reports a diagnostic message instead of failing silently.

The audit script treats invalid config-primary metadata as an error.


## CM_DISPLAY_RUNTIME_3：Line/surface config-primary and legacy algorithm fallback

CM_DISPLAY_RUNTIME_3 extends the runtime contract beyond point features.

The following lower-risk line/surface classes enter `configPrimary` declaration mode:

```text
ROD, ISL, ISG
```

The following complex classes enter `legacyAlgorithmFallback` mode:

```text
RLE, BUD, FLR, STB, STF, PFB
```

For `legacyAlgorithmFallback` classes, the Class display rule is still read, resolved and audited, but complex runtime behavior such as dynamic labels, line path placement, polygon anchor selection, structure density and relation-driven visibility remains under the existing TypeScript runtime algorithm. These fallbacks are intentional and should not be treated as overlay failures.


## CM_DISPLAY_RUNTIME_4：Full display runtime contract

CM_DISPLAY_RUNTIME_4 adds an explicit display runtime contract file:

```text
project-config/packages/openriamap-ria/shared/display/displayRuntimeContracts.json
```

Every current core Class must have one contract entry. The contract records whether the Class is currently handled as:

```text
configPrimary
legacyAlgorithmFallback
legacyPrimary
configOverlay
```

In the current stage, the expected state is:

```text
configPrimary:
  TPP, WRP, TRP, ISP, SBP, PLF, STA, ROD, ISL, ISG

legacyAlgorithmFallback:
  RLE, BUD, FLR, STB, STF, PFB
```

`legacyAlgorithmFallback` means that the Class display declaration is now read from config and audited, but the complex algorithmic runtime behavior remains in the existing TypeScript renderer. Examples include rail line labels, chainage search, polygon anchor scoring, building/station structure density and relation-driven visibility.

The audit script now checks that all core Class codes have a display runtime contract and that `legacyAlgorithmFallback` entries include a `fallbackReason`.


## CM_LABEL_STYLE_PARITY_FIX_1

Black bubble labels now use config-facing aliases `bubble-dark-label-13` and `bubble-dark-label-14`, which resolve to the original runtime keys `bubble-dark-13` and `bubble-dark-14`. This preserves the OpenRIAMap-era font-size / border-radius proportions while avoiding ambiguous bare `bubble-dark` config references.
