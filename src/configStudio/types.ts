/**
 * Config Package V3 is an editable, portable description of the same runtime
 * contracts used by the map.  The three numerical concepts below must remain
 * deliberately independent: geometry stacking, label collision and dynamic
 * display priority are not interchangeable values.
 */
export type GeometryKind = 'Point' | 'LineString' | 'Polygon';
export type LocalizedText = Record<'zh' | 'en', string>;

export type ClassificationPath = { class: string; kind?: string; skind?: string; skind2?: string };
export type InheritanceMode = 'sealed' | 'overridable' | 'localOnly';
export type InheritanceControls = { fields: boolean; display: boolean; card: boolean };
export type FieldValueType = 'string' | 'number' | 'boolean' | 'enum' | 'json' | 'reference';
/** A select always carries the human-facing label separately from its value.
 * V1 uses this for many railway and road fields (for example 上行 -> 1). */
export type SelectOption = { value: string; label: LocalizedText };
/** `tags` and `extensions` are optional field groups, never synthetic root
 * fields named "tags" or "extensions". `key` remains the full data path so
 * every consumer can use one unambiguous identifier. */
export type FieldScope = 'root' | 'tags' | 'extensions';
export type Condition =
  | { kind: 'always' }
  | { kind: 'zoomRange'; min?: number; max?: number }
  | { kind: 'bboxArea'; min?: number; max?: number; scope: 'part' | 'feature' }
  | { kind: 'fieldEquals'; field: string; value: string }
  | { kind: 'fieldIn'; field: string; values: string[] }
  | { kind: 'fieldPresent'; field: string; present: boolean };
export type RenderFieldCondition = Extract<Condition, { field: string }> | {kind:'fieldCompare';field:string;operator:'eq'|'ne'|'in'|'notIn'|'present'|'empty'|'gt'|'ge'|'lt'|'le';value?:string|number|boolean;values?:Array<string|number|boolean>};
export type RenderConditionFormula={expression:string;manual?:boolean;terms:Array<{id:string;relation:'AND'|'OR'|'NOT';condition:RenderFieldCondition}>;groups?:Array<{id:string;expression:string}>};
export type RenderFieldGroup = { op: 'all' | 'any' | 'not'; items: Array<RenderFieldCondition | RenderFieldGroup>;formula?:RenderConditionFormula };
export type RenderRuleMatch = { zoom: { min: number; max: number }; fields?: RenderFieldGroup };

export type FieldDefinition = {
  fieldId: string;
  key: string;
  scope?: FieldScope;
  type: FieldValueType;
  cardinality: 'single' | 'multiple';
  input: 'text' | 'textarea' | 'select' | 'toggle' | 'json' | 'featureSearch';
  required?: boolean;
  /** V1 data is not retroactively invalidated unless the editor opts in. */
  validateExistingData?: boolean;
  requiredWhen?: Condition[];
  labels: LocalizedText;
  description: LocalizedText;
  options?: SelectOption[];
  /** Options are serialized text keys; this controls the actual stored scalar. */
  optionValueType?: 'string' | 'number' | 'boolean';
  format?: 'plain' | 'externalLink' | 'boolean' | 'json' | 'date';
  coordinateFormat?: 'coordP' | 'pointObject' | 'coordL' | 'coordG';
  optionSource?: { registryKey: string; runtimeField?: string };
  placeholder?: string;
  defaultValue?: unknown;
  emptyValue?: 'omit' | 'preserve';
  sourceRuntimeField?: string;
  scenes?: { workflow?: boolean; editor?: boolean; infocard?: boolean; search?: boolean };
  reference?: { classCode: string; matchField: string; displayField?: string };
  /** Set when this node intentionally replaces an inherited declaration. */
  overrideOf?: string;
  inheritance?: InheritanceMode;
};

export type LabelRole = 'ignore' | 'soft' | 'optional' | 'important' | 'required';
export type LabelAnchor = 'perPart' | 'featureBbox';
export type DisplayRepresentation = 'hidden' | 'geometry' | 'point' | 'labelOnly';
export type PriorityMetric = 'area' | 'length' | 'partCount' | 'field';

/** A colour may be literal, read from the feature itself, or resolved through
 * a classified relation.  This deliberately mirrors relationLink rather than
 * inventing a second, incompatible target-selection protocol. */
export type RenderColorBinding =
  | {mode:'valueMap';field:string;entries:Array<{value:string|number|boolean;color:string}>;fallbackColor:string}
  | { mode: 'fixed'; color: string }
  | { mode: 'field'; field: string; fallbackColor?: string }
  | { mode: 'external'; target: ClassificationPath; targetIdField: string; targetColorField: string; fallbackColor?: string }
  /**
   * The map already exposes a stable related-line index.  V3 makes the three
   * real V1 lookups explicit instead of hiding them in class-specific code.
   */
  | { mode: 'relatedLine'; strategy: 'featureRelation' | 'platformFirstLine' | 'stationFirstPlatform'; fallbackColor?: string };
export type RenderPointShape = 'circle' | 'square' | 'triangle' | 'regular4' | 'regular5' | 'regular6';
export type RenderDashPreset = 'solid' | 'dash' | 'dotDash' | 'dotDotDash';
export type RenderPointIcon = {
  source: string;
  size: [number, number];
  anchor: [number, number];
  fallback: 'hide' | 'circle';
};
/**
 * A V3 label is selected by visual family rather than by a lossy "font"
 * enum.  Size is intentionally data, not part of the key, so the editor can
 * render and validate it like every other rule value.
 */
export type LabelStyleFamily =
  | 'gm-bw'
  | 'gm-outline'
  | 'gm-wtb'
  | 'structure-label'
  | 'bubble-dark'
  | 'rle-line-color'
  | 'rle-pill-color';
export type LabelStyleModifiers = { italic?: boolean; underline?: boolean; bold?: boolean };
export type RenderLabelVisualStyle = {
  family: LabelStyleFamily;
  size: number;
  modifiers?: LabelStyleModifiers;
  /**
   * rle-line-color resolves this as text fill; rle-pill-color resolves it as
   * pill background. Other families intentionally keep their V1 palette.
   */
  color?: RenderColorBinding;
};
/** @deprecated Read-only compatibility for contract revisions <= 3. */
export type RenderFont = 'whiteBlackOutline' | 'blue' | 'capsule';
export type RenderStyle = {
  /** Screen pixels; does not modify source/world geometry. */
  symbolOffsetPx?: { x: number; y: number };
  /** True symbols may follow their label's visibility, without decorating text. */
  symbolVisibility?: 'independent' | 'withLabel';
  symbolAnchor?: 'geometry' | 'label';
  pointShape?: RenderPointShape;
  /** An authored external icon overrides pointShape for this Zoom rule. */
  icon?: RenderPointIcon;
  size?: number;
  weight?: number;
  stroke: RenderColorBinding;
  fill?: RenderColorBinding;
  strokeOpacity: number;
  fillOpacity?: number;
  dashPreset?: RenderDashPreset;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';
};
export type RenderLabelStyle = {
  visible: boolean;
  /** The V3.2-native label description. */
  style?: RenderLabelVisualStyle;
  /** @deprecated Read-only compatibility for contract revisions <= 3. */
  font?: RenderFont;
  /** @deprecated Size now lives in `style.size`. */
  size?: number;
  /** @deprecated Modifiers now live in `style.modifiers`. */
  italic?: boolean;
  /** @deprecated Modifiers now live in `style.modifiers`. */
  underline?: boolean;
  /** The source is kept configurable for exact V1 migration. */
  source?: string;
  /** Ordered alternatives used when the primary V1 source is empty. */
  fallbackSources?: string[];
  /**
   * A tiny, named value formatter.  This is deliberately not a callback:
   * packages remain portable and the editor can expose every supported V1
   * formatter.  `floorLabel` is the existing `NofFloor` display convention.
   */
  valueFormat?: 'plain' | 'floorLabel';
  /** Optional formatter per fallback source; used when `Name` falls back to
   * `NofFloor` without formatting an already-authored floor name. */
  fallbackValueFormats?: Record<string, 'plain' | 'floorLabel'>;
  /** The visual position around the already-selected geometric anchor. */
  placement?: 'center' | 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW' | 'aboveLine' | 'belowLine' | 'near';
  offsetY?: number;
  offsetX?: number;
  withDot?: boolean;
  dotAnchorMode?: 'anchorRight' | 'inline';
  collision: LabelCollisionPolicy;
};
/**
 * V1 has a long tail of rendering switches.  They stay in every render rule,
 * are collapsed by default in the editor, and are not silently discarded.
 */
export type AdvancedRenderRule = {
  predicates?: Record<string, unknown>;
  visibility?: Record<string, unknown>;
  geometry?: Record<string, unknown>;
  symbol?: Record<string, unknown>;
  label?: Record<string, unknown>;
  collision?: Record<string, unknown>;
  selection?: Record<string, unknown>;
  specialLogic?: string[];
  /** Retains the production V1 renderer until an editor explicitly promotes
   * the corresponding compatibility switches into this render rule. */
  legacyRuntime?: { preserveFallback?: boolean; sourceRuleName?: string };
};

export type ConfigPane = 'auto' | 'overlay' | 'overlay-top' | 'point' | 'point-top';
export type RenderScreenGate = {
  mode: 'inherit' | 'override';
  /** Only meaningful for Polygon rules. Unit is projected screen px². */
  minScreenAreaPx?: number;
  /** Only meaningful for LineString rules. Unit is projected screen px. */
  minScreenLengthPx?: number;
};
export type RenderLineLabelExtension = {
  profile: 'inherit' | 'standard' | 'network' | 'strict-on-line';
  /** Whether line text may leave the source line. */
  mode?: 'free' | 'strictOnLine';
  endpointPaddingRatio?: number;
  endpointPaddingMinPx?: number;
  maxTurnAngleDeg?: number;
  minLengthPx?: number;
  textMode?: 'auto' | 'rotatedLabel' | 'textPath';
  anchorSamples?: number;
  candidateSpacing?: number;
  candidateMinSpacing?: number;
  candidateMax?: number;
  shortThresholdMultiplier?: number;
  longMode?: 'evenSplit';
  preferPreviousCandidate?: boolean;
  candidateHysteresisPx?: number;
  textPathMinLengthPx?: number;
  textPathPaddingPx?: number;
  textPathMaxAngleDeltaDeg?: number;
  textPathMaxTotalBendDeg?: number;
  textPathPreferReadableDirection?: boolean;
  textPathFallback?: 'rotatedLabel' | 'hide' | 'svgStraightLabel';
  textPathCollisionPaddingPx?: number;
  textPathLetterSpacingPx?: number;
  textPathCurvedLetterSpacingPx?: number;
  textPathCurvedSpacingMinBendDeg?: number;
  orientationPolicy?: 'autoCjkUpright' | 'alwaysTextPath' | 'alwaysRotated';
  textPathVerticalAngleThresholdDeg?: number;
  textPathVerticalLengthRatio?: number;
  candidateOrdering?: 'startToEnd' | 'centerOut';
  candidateWeightMode?: 'none' | 'distanceToCenter';
  candidateSwitchThreshold?: number;
  candidateReuseBonus?: number;
  candidateViewportPreference?: boolean;
  candidateEdgePenalty?: number;
  centerWeightMode?: 'none' | 'distanceToCenter';
  centerSwitchThreshold?: number;
  centerReuseBonus?: number;
  cjkVerticalRenderMode?: 'legacyVertical' | 'svgVertical' | 'auto';
  svgVerticalCjkMinLengthPx?: number;
  svgVerticalCjkLetterSpacingPx?: number;
  advancedTextEnabled?: boolean;
  advancedTextBudgetGroup?: 'network' | 'surface' | 'none';
  advancedTextMaxLabels?: number;
  advancedTextMaxCandidatesPerPass?: number;
  cjkGlyphRotationPolicy?: 'uprightWhenSteep' | 'followLine' | 'alwaysUpright';
  cjkGlyphUprightAngleThresholdDeg?: number;
  cjkGlyphPathMode?: 'off' | 'auto' | 'force';
  cjkGlyphSpacingPx?: number;
  cjkGlyphCollisionPaddingPx?: number;
  cjkGlyphMinPathLengthPx?: number;
  cjkGlyphMaxCount?: number;
  cjkGlyphMaxAngleDeltaDeg?: number;
  cjkGlyphMaxTotalBendDeg?: number;
  cjkGlyphPreferReadableDirection?: boolean;
  cjkGlyphAllowTextPathFallback?: boolean;
  textPathHalfLengthMultiplier?: number;
  textPathMinHalfLengthWorld?: number;
  textPathMaxHalfLengthWorld?: number;
  textPathMaxHalfLengthRatio?: number;
  textCollisionRectMode?: 'pathBox' | 'textBox' | 'compactTextBox';
  cjkGlyphCompactMode?: 'off' | 'auto';
  cjkGlyphMinAdvanceScale?: number;
  cjkGlyphFallbackMode?: 'simpleLineLabel' | 'textPathIfAllowed' | 'hide' | 'rotatedLabel';
  simpleFallbackEnabled?: boolean;
  simpleFallbackRotate?: boolean;
  repositionMode?: 'off' | 'chainageSearch';
  repositionAttemptsPerDirection?: number;
  repositionStepMode?: 'labelSpan' | 'fixedWorld' | 'fixedPx';
  repositionFailure?: 'hide' | 'simpleLineLabel';
  repositionStrictSvg?: boolean;
  avoidLineGeometry?: boolean;
  avoidPolygonGeometry?: boolean;
  avoidPointSymbols?: boolean;
  repositionCollisionScope?: Array<'lineLabel' | 'surfaceLabel' | 'pointLabel' | 'pointSymbol' | 'requiredLabel' | 'selectedLabel' | 'searchResultLabel'>;
  viewportRectMode?: 'rawMetrics' | 'anchorNormalized' | 'auto';
  viewportCandidateMode?: 'off' | 'stableFirstViewportFallback';
  viewportCandidateBufferPx?: number;
  viewportCandidateMaxTargets?: number;
  viewportCandidateMinIntervalPx?: number;
};
export type RenderAnchorExtension = {
  candidatePlacement?: 'relativeToPlacement' | 'aroundAnchor';
  strategy?: 'inherit' | 'featureCenter' | 'interior' | 'visibleInterior' | 'lineCenter' | 'lineCandidates';
  candidates?: Array<'C' | 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW'>;
  offsetPx?: { x: number; y: number };
  candidateOffsetsPx?: Array<{ name: string; x: number; y: number }>;
  allowOutsideGeometry?: boolean;
  requireInsideGeometry?: boolean;
  preferViewportCenter?: boolean;
};
/** Polygon label candidates are separate from screen-gating.  A large feature
 * may have a 10,000px² candidate threshold even when the geometry itself is
 * visible at a lower screen area. */
export type RenderPolygonCandidateExtension = {
  weightMode?: 'none' | 'distanceToCenter';
  weightedSwitchThreshold?: number;
  reuseBonus?: number;
  viewportPreference?: boolean;
  edgePenalty?: number;
  mode?: 'inherit' | 'none' | 'fixedInterior' | 'autoInteriorGrid' | 'largeFeatureGrid' | 'viewportAwareCandidateSet' | 'gridByWorldUnits';
  count?: number;
  gridSize?: number;
  gridMinSize?: number;
  maxCandidates?: number;
  scanMax?: number;
  overflow?: 'rankedPrune' | 'seededPrune';
  preferPreviousCandidate?: boolean;
  switchThreshold?: number;
  allowViewportFallback?: boolean;
  minScreenAreaPx?: number;
  preferViewportCenter?: boolean;
};
export type RenderCollisionExtension = {
  boundsAdjustment?: { x?: number; y?: number; width?: number; height?: number };
  collideWith?: Array<'symbol' | 'requiredLabel' | 'importantLabel' | 'optionalLabel' | 'softLabel' | 'geometry'>;
  blocks?: Array<'optionalLabel' | 'softLabel' | 'poiLabel' | 'structureLabel'>;
  allowOverlap?: boolean;
  paddingPx?: number;
  hidePolicy?: 'hide' | 'abbreviateThenHide' | 'forceShow' | 'showWithoutBlocking' | 'geometryOnly';
};
export type RenderStabilityExtension = {
  enabled?: boolean;
  cacheKey?: 'featureID' | 'featureID+zoomBucket' | 'featureID+mode' | 'custom';
  zoomBucketSize?: number;
  freezeDuringPan?: boolean;
  recomputeOnMoveEnd?: boolean;
  recomputeOnZoomEnd?: boolean;
  hysteresisPx?: number;
  keepPreviousCandidate?: boolean;
  keepPreviousAnchor?: boolean;
  invalidateWhen?: Array<'zoomBucketChanged' | 'featureGeometryChanged' | 'featureTextChanged' | 'modeChanged' | 'worldChanged' | 'labelOutOfViewport' | 'collisionFailedRepeatedly'>;
};
export type RenderDensityExtension = {
  enabled?: boolean;
  mode: 'inherit' | 'override';
  gridSizePx?: number;
  maxLabelsPerGrid?: number;
  maxSymbolsPerGrid?: number;
  reduceOrder?: Array<'hideSoftLabels' | 'abbreviateOptionalLabels' | 'hideOptionalLabels' | 'hideSymbols' | 'geometryOnly'>;
  importanceField?: string;
  preserveSelected?: boolean;
  preserveRequired?: boolean;
};
export type RenderFallbackExtension = {
  whenNoLabelText?: 'hideLabel' | 'showID' | 'showClassKind' | 'placeholder';
  whenCollisionFailed?: 'hideLabel' | 'abbreviate' | 'forceShow' | 'showGeometryOnly';
  whenRuleMissing?: 'geometryOnly' | 'hidden' | 'debugDefault' | 'legacyDefault';
  whenGeometryInvalid?: 'skip' | 'showErrorMarker' | 'debugOnly';
};
/**
 * Store-aware visibility strategies that existed in V1 but cannot be reduced
 * to a field predicate.  They are deliberately small, typed and reusable;
 * no raw source rule or arbitrary callback is carried into a V3 package.
 */
export type RenderVisibilityExtension = {
  mode: 'inherit' | 'always' | 'sameId' | 'coincidentPoint' | 'lineContainmentChoice' | 'activeContextMember';
  sameId?: {
    target: ClassificationPath;
    sourceField?: string;
    targetField?: string;
    behavior: 'hideIfExists' | 'showIfExists';
  };
  coincidentPoint?: {
    target: ClassificationPath;
    behavior: 'hideIfExists' | 'showIfExists';
    /** Optional predicate on the candidate target record. */
    targetField?: string;
    targetEquals?: string;
    targetNotEquals?: string;
    precision?: number;
  };
  /**
   * Generic line-family choice: below switchZoom show primaryValue; at and
   * above it choose overlayValues only when an overlay is not contained by
   * any primary line.  This is the V1 railway display rule without a RLE
   * class name baked into the executor.
   */
  lineContainmentChoice?: {
    field: string;
    primaryValue: string;
    overlayValues: string[];
    switchZoom: number;
    precision?: number;
  };
  /**
   * A member-only geometry is visible only inside an active generic context
   * binding.  It makes FLR/STF-style floor content declarative without
   * teaching the runtime about a particular building or floor class.
   */
  activeContextMember?: {
    bindingId?: string;
    requireSelector?: boolean;
  };
};
/**
 * Collapsed, typed rule-local exceptions.  It replaces raw V1 JSON editing;
 * defaults belong to `engine`, and an absent member means inherit.
 */
export type RenderRuleExtensions = {
  screenGate?: RenderScreenGate;
  pane?: ConfigPane;
  hitTolerancePx?: number;
  labelText?: {
    maxChars?: number;
    minChars?: number;
    multiline?: boolean;
    maxLines?: number;
    suffix?: string;
    abbreviationEnabled?: boolean;
    emptyBehavior?: 'hide' | 'showID' | 'showKind' | 'placeholder';
    opacity?: number;
  };
  lineLabel?: RenderLineLabelExtension;
  anchor?: RenderAnchorExtension;
  polygonCandidates?: RenderPolygonCandidateExtension;
  collision?: RenderCollisionExtension;
  stability?: RenderStabilityExtension;
  density?: RenderDensityExtension;
  fallback?: RenderFallbackExtension;
  visibility?: RenderVisibilityExtension;
  interaction?: Partial<Record<InteractionState, Partial<InteractionVisual>>>;
};

/** 区块 A：Leaflet pane / vector stacking order only. */
export type GeometryStackPolicy = { zLevel: number; pane?: string; zIndexOffset?: number };
/** 区块 B：label collision role and ordering only. */
export type LabelCollisionPolicy = {
  role: LabelRole;
  basePriority: number;
  collisionGroup?: string;
  hideWhenColliding: boolean;
  densityLimit?: number;
  /** Collision metric belongs here, separately from geometry/display ordering. */
  metric?: RenderPriority['metric'];
  /** Explicit preservation for an imported r5 rule with intersecting conditional
   * collision/display overrides. Newly authored rules remain independent. */
  compatibility?: 'r5DisplayPriority';
};
export type RenderPriority = {
  mode: 'add' | 'replace';
  base?: number;
  metric?: {
    kind: PriorityMetric;
    field?: string;
    multiplier: number;
    divisor?: number;
    rounding: 'floor' | 'round' | 'ceil' | 'none';
    min?: number;
    max?: number;
  };
};
/** Conditional values remain inside a single Zoom rule.  They are used for
 * true V1 branches such as RLE direction labels; they never become a second
 * competing Zoom timeline. */
export type RenderRuleConditionalOverride = {
  id: string;
  when: Condition[];
  representation?: DisplayRepresentation;
  style?: RenderStyle;
  label?: RenderLabelStyle;
  geometryStack?: GeometryStackPolicy;
  priority?: RenderPriority;
  extensions?: RenderRuleExtensions;
};
/** 区块 C：zoom windows and metric based display priority only. */
export type ZoomPriorityRule = {
  id: string;
  /** r7: the only authored match range; fields exclude classification identity. */
  when?: RenderRuleMatch;
  /** V3.2 uses inclusive Leaflet zoom boundaries. */
  minZoom?: number;
  maxZoom?: number;
  /** Which representation this source geometry emits in this range. */
  representation?: DisplayRepresentation;
  style?: RenderStyle;
  label?: RenderLabelStyle;
  /** @deprecated V3.2 keeps hit triggers on the geometry profile. */
  interaction?: { triggers: GeometryInteractionTriggers };
  geometryStack?: GeometryStackPolicy;
  /** V3.2 native, typed exceptions for this particular Zoom interval. */
  extensions?: RenderRuleExtensions;
  /** Field-driven overrides still belong to this one Zoom interval. */
  conditionalOverrides?: RenderRuleConditionalOverride[];
  advanced?: AdvancedRenderRule;
  /**
   * r2 compatibility fields. They are accepted only at read time and copied
   * into the r3 values by migrateV31Package().
   */
  minExclusive?: number;
  maxExclusive?: number;
  labelRole?: LabelRole;
  priority?: RenderPriority;
};

export type GeometryInteractionTriggers = { point?: boolean; line?: boolean; boundary?: boolean; interior?: boolean; label?: boolean };
export type GeometryProfile = {
  /** r9: geometry capability remains usable before a display is authored. */
  renderState?: 'enabled' | 'unconfigured';
  enabled: boolean;
  /** Whether this representation accepts multipart input, not its current drawing mode. */
  allowMultipleParts: boolean;
  /** Rendering anchor for multipart source geometry. */
  anchor?: LabelAnchor;
  /** r2 compatibility only. All visual state belongs to individual rules in r3. */
  color?: string;
  style?: { weight?: number; fillOpacity?: number; opacity?: number; dashArray?: string };
  geometryStack?: GeometryStackPolicy;
  label?: { visible: boolean; anchor: LabelAnchor; conditions: Condition[]; collision: LabelCollisionPolicy };
  zoomPriority: { rules: ZoomPriorityRule[] };
  /**
   * Hit triggers are a geometry capability, independent of Zoom styling.
   * State effects such as hover and delete live in package-level engine
   * defaults, not here.
   */
  interaction?: { triggers: GeometryInteractionTriggers };
  legacyDisplay?: { ruleIds: string[]; profileIds: string[]; specialLogicKeys: string[] };
};

/** A parent may optionally expose a self reference; a child must select one. */
export type ContainmentBinding = {
  enabled: boolean;
  role?: 'parent' | 'child';
  parentReferenceField?: string;
  viewProfileKey?: string;
};

export type ContextBindingEndpoint = {
  classification: ClassificationPath;
  /** Field holding the relation value on this endpoint. */
  referenceField: string;
};
/**
 * A generic main-structure/unit relationship. It is stored once at package
 * level and is automatically visible from both endpoint category editors.
 * Nothing here is hard-coded to BUD, STB, FLR or STF.
 */
export type ContextBinding = {
  id: string;
  label: LocalizedText;
  host: ContextBindingEndpoint;
  member: ContextBindingEndpoint;
  /** Optional member field used to populate a unit/floor selector. */
  memberSelectorField?: string;
  enabled: boolean;
  profile: 'default' | 'keep-host-context' | 'show-active-member-only';
};

export type InteractionState = 'hover' | 'selected' | 'searchResult' | 'editing' | 'deletionMarked';
export type InteractionVisual = {
  enabled: boolean;
  strokeColor: string;
  strokeWidth: number;
  strokeOpacity: number;
  fillColor?: string;
  fillOpacity?: number;
  zIndexOffset?: number;
  forceShowLabel?: boolean;
  labelPriority?: number;
  symbol?: { kind: 'circle' | 'pin'; radius?: number; size?: [number, number] };
  outline?: { color: string; width: number; opacity: number };
  dashArray?: string;
  strokeColorBinding?: RenderColorBinding;
};
export type GeometryInteractionBaseline = Record<InteractionState, InteractionVisual> & {
  hitTolerancePx: number;
};
export type ConfigEngineSettings = {
  /** World is a required, engine-assigned system field, never a rule predicate. */
  world: { field: 'World'; assignment: 'activeWorld'; required: true };
  /**
   * Generic main-structure/unit context is an engine concern.  It deliberately
   * has no Class names: actual endpoints live in `contextBindings` and any
   * category may be a host or a member.
   */
  contextView: {
    minZoom: number;
    activationRadiusPx: number;
    retainRadiusPx: number;
  };
  screenGateDefaults: {
    polygonMinScreenAreaPx?: number;
    lineMinScreenLengthPx?: number;
  };
  interactionBaselines: {
    Point: GeometryInteractionBaseline;
    LineString: GeometryInteractionBaseline;
    Polygon: GeometryInteractionBaseline;
  };
  paneDefaults: Record<Exclude<ConfigPane, 'auto'>, string>;
  renderDefaults?: Partial<Record<GeometryKind, RenderRuleExtensions>>;
};

/**
 * `lineChips` is still a declarative renderer: the value is resolved through
 * the shared rail relation index, rather than through a Class-specific card
 * component.  TRP remains the only component-card exception.
 */
export type CardRenderer = 'text' | 'tag' | 'colorCapsule' | 'nameColorCapsule' | 'relationLink' | 'lineChips' | 'media';
export type CardSection = 'main' | 'other';
export type CardRelation = {
  targetClassification?: ClassificationPath;
  targetMatchField?: string;
  targetDisplayField?: string;
  clickable?: boolean;
  /** A source may be an array or an object whose nested value is the target id. */
  multiple?: boolean;
  sourceValuePath?: string;
  fallbackDisplay?: 'raw' | 'unknown';
};
export type CardItem = {
  id: string;
  source: string;
  fallbackSources?: string[];
  afterRemaining?: boolean;
  visible: boolean;
  renderer: CardRenderer;
  /** Preserve the V1 main/other card split rather than slicing by row count. */
  section?: CardSection;
  /** Defaults to true for V1-compatible cards. */
  hideWhenEmpty?: boolean;
  label?: LocalizedText;
  /** New items follow field definitions; old authored titles stay explicit. */
  labelMode?: 'field' | 'override';
  valueMode?: 'field' | 'override';
  valueOptions?: SelectOption[];
  options?: {
    colorSource?: string;
    nameSource?: string;
    fallbackColor?: string;
    tagColor?: string;
    mediaSource?: 'picture-index' | 'external-url';
    /** Shared relation-index variants used by ordinary rail cards. */
    lineChipSource?: 'platform' | 'station' | 'stationBuilding';
    /** A small set of V1 field-formatters that remains reusable rather than a
     * code-card escape hatch. */
    format?: 'plain' | 'externalLink' | 'boolean' | 'json' | 'classification' | 'enum' | 'date' | 'world';
    linkText?: 'raw' | 'href';
  };
  relation?: CardRelation;
};

/** A layout and a code component remain mutually exclusive. */
export type CardConfiguration =
  | { mode: 'fields'; items: CardItem[]; remaining?: { enabled: boolean; section: CardSection; includeSystem: boolean; exclude?: string[]; hideWhenEmpty?: boolean; order?: 'record' | 'alphabetical'; maxDepth?: number; maxArrayLength?: number } }
  | { mode: 'layout'; layoutId: string; options?: Record<string, unknown> }
  | { mode: 'component'; componentKey: string; options?: Record<string, unknown> };

export type CategoryNode = {
  nodeId: string;
  path: ClassificationPath;
  /** Human-readable labels for every populated classification level. Codes
   * remain the persisted Class/Kind/Skind/Skind2 values. */
  classificationLabels?: Partial<Record<keyof ClassificationPath, LocalizedText>>;
  children: string[];
  /** The three explicitly editable inheritance switches. */
  inheritDown?: InheritanceControls;
  /** Optional incoming modules; sealed inherited fields cannot be disabled. */
  receiveFromParent?: { fields?: boolean; geometry?: boolean; display?: boolean; card?: boolean };
  /** Compatibility metadata for V3.0 imports; runtime uses inheritDown first. */
  policies?: { fields: InheritanceMode; display: InheritanceMode; card: InheritanceMode; workflow?: InheritanceMode };
  fields: FieldDefinition[];
  /** Once selected, descendants may only resolve this geometry kind. */
  geometryType?: GeometryKind;
  geometryProfiles: Partial<Record<GeometryKind, GeometryProfile>>;
  containment?: ContainmentBinding;
  /** Omitted on a child until its inherited card is edited locally. */
  card?: CardConfiguration;
  legacy?: {
    classCode: string;
    displayRuleIds: string[];
    cardLayoutId?: string;
    specialCardKey?: string;
    source?: Record<string, unknown>;
  };
};

export type SearchProfile = {
  target: ClassificationPath;
  /** One reusable feature-search model replaces the old duplicate coarse
   * search control. The old fields remain import-only compatibility data. */
  queryFields?: string[];
  displayTemplate?: string;
  returnField?: string;
  matcher?: 'contains' | 'prefix' | 'token' | 'fuzzy';
  minQueryLength?: number;
  maxResults?: number;
  debounceMs?: number;
  cacheScope: 'world' | 'loadedWorlds';
  /** Legacy r4 import compatibility. Normalized on read/save. */
  mode?: 'coarse' | 'feature';
  searchFields?: string[];
  displayFields?: string[];
  returnFields?: string[];
  coarse?: { matcher: 'contains' | 'prefix' | 'token' | 'fuzzy'; minQueryLength: number; maxResults: number; debounceMs?: number };
};

/** Composed workflows expose only the standard reusable input controls. */
export type ComposedWorkflowControlKind = 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'json' | 'classificationPicker' | 'featureSearch' | 'coarseSearch' | 'group' | 'tagsExtensions';
/** Legacy values are retained solely so an old package can be migrated with a precise diagnostic. */
export type WorkflowControlKind = ComposedWorkflowControlKind | 'notice' | 'json' | 'runtimeValue' | 'component';
/**
 * A repeatable V3 form group.  This is intentionally a typed structure, not
 * a JSON text-area escape hatch: standard V1 lists such as road connections
 * keep their individual fields, options and required state editable.
 */
export type WorkflowGroupField = {
  /** Local target hint copied once by prefill; no source identity is retained. */
  prefillField?: string;
  key: string;
  label: LocalizedText;
  kind: Exclude<ComposedWorkflowControlKind, 'classificationPicker' | 'group' | 'tagsExtensions'>;
  required?: boolean;
  options?: SelectOption[];
  placeholder?: string;
  defaultValue?: unknown;
  rows?: number;
  search?: SearchProfile;
  optionValueType?: FieldDefinition['optionValueType'];
  fieldFormat?: FieldDefinition['format'];
  fieldSource?: WorkflowFieldSource;
  requiredWhen?: WorkflowValueCondition[];
  valueNormalization?: 'none' | 'trim' | 'abbr' | 'number';
};
export type WorkflowFieldSource = {
  nodeId: string;
  fieldId: string;
  snapshot: Pick<FieldDefinition, 'key' | 'type' | 'cardinality' | 'labels' | 'options' | 'optionValueType' | 'format' | 'defaultValue' | 'required' | 'requiredWhen' | 'input' | 'placeholder' | 'reference'>;
  overrides: string[];
};
export type WorkflowRepeatGroup = {
  itemFields: WorkflowGroupField[];
  /** Object arrays serialize as [{ mode: "endpoint", tgt: "ID" }]. Scalar
   * arrays serialize as ["ID"], and require exactly one blank-key field. */
  storage?: 'object' | 'scalar';
  optional?: boolean;
  minItems?: number;
  addLabel?: LocalizedText;
};
export type WorkflowControl = {
  prefillField?: string;
  id: string;
  slot?: string;
  valueNormalization?: 'none' | 'trim' | 'abbr' | 'number';
  kind: WorkflowControlKind;
  columns: 1 | 2 | 3;
  label: LocalizedText;
  fieldSource?: WorkflowFieldSource;
  fieldFormat?: FieldDefinition['format'];
  optionValueType?: FieldDefinition['optionValueType'];
  requiredWhen?: WorkflowValueCondition[];
  options?: SelectOption[];
  optionSource?: { registryKey: string };
  placeholder?: string;
  defaultValue?: unknown;
  rows?: number;
  search?: SearchProfile;
  classificationScope?: ClassificationPath;
  /** System Classification N control maps to exactly one workflow output. */
  outputId?: string;
  required?: boolean;
  when?: WorkflowValueCondition;
  systemManaged?: boolean;
  group?: WorkflowRepeatGroup;
  tagsExtensions?: { tagsEnabled: boolean; extensionsEnabled: boolean };
  componentKey?: string;
  legacyBlock?: Record<string, unknown>;
};

export type WorkflowStep = {
  id: string;
  kind: 'actor' | 'form' | 'tagsExtensions' | 'geometry' | 'special';
  label: LocalizedText;
  subtitle?: LocalizedText;
  controls?: WorkflowControl[];
  geometry?: GeometryKind[];
  /** Geometry pages are bound one-to-one to an output for composed flows. */
  outputId?: string;
  geometryRole?: 'output' | 'auxiliary';
  when?: WorkflowValueCondition;
  specialKey?: string;
  tagsExtensions?: { tagsEnabled: boolean; extensionsEnabled: boolean };
  drawing?: {
    enabledFromThisPage?: boolean; drawMode?: string; allowBack?: boolean; keepDrawingWhenBack?: boolean;
    pointSlot?: string; auxiliaryPoints?: WorkflowAuxiliaryPoint[];
    captureSlot?: string;
    returnFormat?: 'coordP' | 'pointObject' | 'coordL' | 'coordG';
    multiple?: boolean;
    heightSlot?: string;
    bindings?: Array<{ outputId:string; target:string; value:'geometry' | 'height' }>;
  };
  legacyPage?: Record<string, unknown>;
};

/** Target paths include fields, tags.xxx and extensions.xxx. */
export type WorkflowValueCondition = { token: string; operator: 'empty' | 'present' | 'equals' | 'in'; value?: string | number | boolean; values?: Array<string | number | boolean>; all?: WorkflowValueCondition[]; any?: WorkflowValueCondition[] };
export type WorkflowAuxiliaryPoint = { id: string; slot: string; label: LocalizedText; required?: boolean; when?: WorkflowValueCondition };
export type WorkflowAssignment = { id: string; target: string; expression: string; when?: WorkflowValueCondition };
export type WorkflowOutput = {
  id: string;
  /** Default category scope. The system creates Classification N controls if it has descendants. */
  classification: ClassificationPath;
  assignments: WorkflowAssignment[];
  when?: WorkflowValueCondition;
  /** A V3.2 output has one fixed drawing type. `allowed` is r2 import data. */
  geometry: { selected: GeometryKind; allowed?: GeometryKind[] };
};
export type WorkflowDefinition = {
  id: string;
  label: LocalizedText;
  mode: 'composed' | 'external';
  quickMapping?: boolean;
  editor?: { enabled:boolean; dedicated?:boolean; scope?:ClassificationPath; backfill?:Array<{slot:string;target:string}> };
  actor?: { required: boolean };
  /** V3.0 compatibility target; composed flows resolve target through outputs[0]. */
  target?: ClassificationPath;
  steps: WorkflowStep[];
  outputs: WorkflowOutput[];
  /** V3.0 compatibility assignments; migrated into outputs[0]. */
  assignments?: WorkflowAssignment[];
  /** Only the three deliberately retained, completed workflows may bypass composition. */
  external?: { componentKey: string; purpose?:'capture'|'edit'; version?:number; reason: 'railway-integrated' | 'station-integrated' | 'trp-integrated'; coveredClassifications?: ClassificationPath[] };
  legacy?: { runtimeMode?: string; componentKey?: string; output?: Record<string, unknown>; source?: Record<string, unknown> };
};

export type ControlledRegistryItem = {
  id: string;
  label: LocalizedText;
  allowedClasses?: string[];
  optionSchema?: Array<{ key: string; label: LocalizedText; type: 'text' | 'number' | 'boolean' | 'select'; options?: string[] }>;
};
export type ConfigRegistries = {
  optionSets?: Array<{ id: string; label: LocalizedText; options: SelectOption[] }>;
  cardLayouts: ControlledRegistryItem[];
  cardComponents: ControlledRegistryItem[];
  displayProfiles: ControlledRegistryItem[];
  specialDisplayLogic: ControlledRegistryItem[];
  workflowControls: ControlledRegistryItem[];
  workflowBlocks: ControlledRegistryItem[];
};

export type ParityEntry = {
  kind: 'class' | 'workflow' | 'shared';
  id: string;
  source: string;
  status: 'resolved' | 'registryReference' | 'unsupported';
  details?: string;
  fingerprint?: string;
};
export type ParityReport = { schemaVersion: 'cairnmap.v1-parity-report.v2'; sourceManifestSha256?: string; entries: ParityEntry[]; generatedAt: string };

export type ConfigPackageV3 = {
  schemaVersion: 'cairnmap.config-package.v3';
  /** Contract revision is API compatibility, not the user-facing package revision. */
  contractRevision: 3 | 4 | 5 | 6 | 7 | 8 | 9;
  packageId: string;
  projectId: string;
  /** Persistence version only; the save dialog requires a monotonic integer. */
  revision: number;
  displayName: LocalizedText;
  sourceManifestSha256?: string;
  /** Required for V3.2-native packages (contractRevision 5). */
  engine?: ConfigEngineSettings;
  registries: ConfigRegistries;
  nodes: CategoryNode[];
  /** Required for V3.2-native packages; legacy node.containment is import-only. */
  contextBindings?: ContextBinding[];
  workflows: WorkflowDefinition[];
  parity?: ParityReport;
};

/** The V2/V3.0 shapes are intentionally loose and always migrated before editing. */
export type ConfigPackageV2Import = {
  schemaVersion: 'cairnmap.config-package.v2';
  packageId: string;
  projectId: string;
  revision: number;
  displayName: LocalizedText;
  nodes: Array<Record<string, unknown>>;
  workflows: Array<Record<string, unknown>>;
  parity?: Record<string, unknown>;
  specialComponentKeys?: string[];
};

export type AffectedFeature = { id: string; name: string };
export type ConfigValidationIssue = {
  severity: 'error' | 'warning';
  code: string;
  path: string;
  message: string;
  field?: string;
  expected?: string;
  affectedFeatures?: AffectedFeature[];
  count?: number;
};
export type ConfigValidationReport = {
  schemaVersion: 'cairnmap.config-validation-report.v3';
  valid: boolean;
  createdAt: string;
  issues: ConfigValidationIssue[];
  summary?: { configuration: number; parity: number; mountedData: number; affectedFeatures: number };
};
export type MountedFeatureRecord = Record<string, unknown> & {
  ID?: string;
  Name?: string;
  World?: string;
  Class?: string;
  Kind?: string;
  Skind?: string;
  Skind2?: string;
  SKind?: string;
  SKind2?: string;
};

export type PreviewScenario = 'singlePoint' | 'multiPoint' | 'largePolygon' | 'mediumPolygon' | 'smallPolygon' | 'tinyPolygon' | 'multiMediumPolygon' | 'multiSmallPolygon' | 'singleLine' | 'multiLine';
