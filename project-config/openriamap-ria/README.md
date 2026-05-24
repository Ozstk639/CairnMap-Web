# OpenRIAMap RIA Project Profile

This folder is reserved for the OpenRIAMap RIA project package in CairnMap.

At `CM_INIT_1`, this folder is documentation-only.

The runtime still reads the existing TypeScript registries and configuration files. Future stages will gradually move low-risk static configuration into this project package.

## Intended role

OpenRIAMap RIA acts as the default verification profile for CairnMap.

The target architecture is:

```text
CairnMap Core
  +
OpenRIAMap RIA Project Package
  +
RIA Presets
  =
Current OpenRIAMap-equivalent runtime behavior
```

## Stage boundary

`CM_INIT_1` only creates the project-profile placeholder. Actual runtime configuration extraction should start from `CM_CFG_1`.
