# CairnMap Card Runtime

`CM_CARD_1` introduces class-centered card configuration for the OpenRIAMap RIA package.

Current stage:

- `classes/{Class}.json > card` is the class-level card declaration.
- `shared/card/cardLayouts.json` stores reusable card layout templates.
- `shared/card/cardEnhancements.json` registers enhancement keys and component keys.
- `shared/card/cardRuntimeContracts.json` declares card runtime mode per Class.
- `audit:card-config` validates the configuration.

At this stage, card rendering may still use legacy card registry paths until later CARD runtime patches enable config-primary behavior.

## CM_CARD_2 Runtime Resolver

`cardRuntimeResolver.ts` resolves classCode to a reusable card layout. `cardRelationAdapter.ts` aligns card relation links with shared relation actions, so floor/building, station/platform, and generic feature jumps can share the same relation metadata.

## CM_CARD_3 Config Primary

Ordinary classes (`ISP`, `ISL`, `ISG`, `ROD`, `TPP`, `WRP`, `BUD`, `FLR`) now resolve their card layout from class/shared card config first. Legacy card layouts remain as fallback and compatibility output.

## CM_CARD_4 Special Enhancements

Complex classes now use `specialCardPrimary` contracts. TRP declares `tradePointCard` over `TradeJSON`, and relation-oriented classes may call `floorViewRelation` or generic relation enhancements. Legacy React components remain the execution layer.

## CM_CARD_5 Legacy Boundary

All core Classes have a card runtime contract. Legacy card files are compatibility adapters and rich component execution helpers; the Class/shared config layer is the layout definition source.
