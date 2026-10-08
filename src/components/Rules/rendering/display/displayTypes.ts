/**
 * RB_SLU display system core types.
 *
 * 本文件只定义“单要素显示驱动”的声明式结构，不直接参与渲染。
 * 后续 patch 会让 RuleDrivenLayer / labelLayout 逐步消费标准化后的 DisplayPlan。
 */

export type DisplayTier =
  | 'baseSurface'
  | 'geoStructure'
  | 'network'
  | 'structure'
  | 'transportNode'
  | 'poi'
  | 'indoor'
  | 'editing'
  | 'debug';

export type DisplayMode =
  | 'normal'
  | 'navigation'
  | 'floor'
  | 'editing'
  | 'preview'
  | 'debug';

export type DisplayGeoType = 'Points' | 'Polyline' | 'Polygon';

export type FeatureDisplayMatch = {
  Class?: string;
  Type?: DisplayGeoType;
  Kind?: string;
  SKind?: string;
  SKind2?: string;
  IDPrefix?: string;
  world?: string | number | Array<string | number>;
};

export type DisplayVisibilityConfig = {
  minZoom?: number;
  maxZoom?: number;

  labelMinZoom?: number;
  labelMaxZoom?: number;

  geometryMinZoom?: number;
  geometryMaxZoom?: number;

  symbolMinZoom?: number;
  symbolMaxZoom?: number;

  modes?: DisplayMode[];

  requireSelected?: boolean;
  hideWhenFiltered?: boolean;
  hideWhenInactiveWorld?: boolean;

  minScreenAreaPx?: number;
  minScreenLengthPx?: number;
};

export type DisplayGeometryRenderMode =
  | 'none'
  | 'polygonFill'
  | 'polygonOutline'
  | 'polygonFillOutline'
  | 'polyline'
  | 'point'
  | 'custom';

export type DisplayGeometryConfig = {
  render: DisplayGeometryRenderMode;

  zIndex?: number;

  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;

  fill?: string;
  fillOpacity?: number;

  dashArray?: string;
  lineCap?: 'butt' | 'round' | 'square';
  lineJoin?: 'miter' | 'round' | 'bevel';

  interactive?: boolean;
  hitTolerancePx?: number;
};

export type DisplaySymbolType =
  | 'dot'
  | 'circle'
  | 'pin'
  | 'icon'
  | 'image'
  | 'none';

export type DisplaySymbolConfig = {
  enabled: boolean;

  type?: DisplaySymbolType;
  iconKey?: string;
  sizePx?: number;
  radiusPx?: number;

  color?: string;
  borderColor?: string;
  borderWidth?: number;

  zIndex?: number;

  collisionBox?: {
    widthPx: number;
    heightPx: number;
    paddingPx?: number;
  };

  clickable?: boolean;
};

export type DisplayLabelSourceField =
  | 'Name'
  | 'ID'
  | 'Kind'
  | 'SKind'
  | 'SKind2'
  | 'Class'
  | 'custom';

export type DisplayLabelConfig = {
  enabled: boolean;

  source?: DisplayLabelSourceField | DisplayLabelSourceField[];
  customFormatterKey?: string;

  maxChars?: number;
  minChars?: number;

  emptyBehavior?: 'hide' | 'showID' | 'showKind' | 'placeholder';

  abbreviation?: {
    enabled: boolean;
    maxChars: number;
    suffix?: string;
  };

  multiline?: boolean;
  maxLines?: number;

  styleKey?: string;
  className?: string;

  opacity?: number;
};

export type DisplayAnchorStrategy =
  | 'fixedInterior'
  | 'stableGeoCandidates'
  | 'largeFeatureStableCandidates'
  | 'visibleInteriorLargeOnly'
  | 'viewportHysteresis'
  | 'pointVariable'
  | 'polylineCenter'
  | 'polylineMulti'
  | 'polylineStableCandidates'
  | 'manual'
  | 'none';

export type DisplayLineLabelMode =
  | 'free'
  | 'strictOnLine';

export type DisplayLineTextMode =
  | 'rotatedLabel'
  | 'textPath'
  | 'auto';

export type DisplayTextPathFallback =
  | 'rotatedLabel'
  | 'hide'
  | 'svgStraightLabel';

export type DisplayLineTextOrientationPolicy =
  | 'autoCjkUpright'
  | 'alwaysTextPath'
  | 'alwaysRotated';

export type CandidateWeightMode =
  | 'none'
  | 'distanceToCenter';

export type LineCandidateOrdering =
  | 'startToEnd'
  | 'centerOut';

export type LineCjkVerticalRenderMode =
  | 'legacyVertical'
  | 'svgVertical'
  | 'auto';

export type DisplayAdvancedLineTextBudgetGroup =
  | 'network'
  | 'surface'
  | 'none';

export type CjkGlyphRotationPolicy =
  | 'uprightWhenSteep'
  | 'followLine'
  | 'alwaysUpright';

export type CjkGlyphPathMode =
  | 'off'
  | 'auto'
  | 'force';

export type CjkGlyphCompactMode =
  | 'off'
  | 'auto';

export type CjkGlyphFallbackMode =
  | 'simpleLineLabel'
  | 'textPathIfAllowed'
  | 'hide'
  | 'rotatedLabel';

export type LineTextCollisionRectMode =
  | 'pathBox'
  | 'textBox'
  | 'compactTextBox';

export type LineTextRepositionMode =
  | 'off'
  | 'chainageSearch';

export type LineTextRepositionStepMode =
  | 'labelSpan'
  | 'fixedWorld'
  | 'fixedPx';

export type LineTextRepositionFailure =
  | 'hide'
  | 'simpleLineLabel';

export type LineTextRepositionCollisionTarget =
  | 'lineLabel'
  | 'surfaceLabel'
  | 'pointLabel'
  | 'pointSymbol'
  | 'requiredLabel'
  | 'selectedLabel'
  | 'searchResultLabel';

export type LineTextViewportRectMode =
  | 'rawMetrics'
  | 'anchorNormalized'
  | 'auto';

export type LineTextViewportCandidateMode =
  | 'off'
  | 'stableFirstViewportFallback';

export type TextPathStatus =
  | 'usedTextPath'
  | 'usedSvgVerticalCjk'
  | 'fallbackCjkVertical'
  | 'fallbackRotatedLabel'
  | 'fallbackPathTooShort'
  | 'fallbackTextTooLong'
  | 'fallbackAngleTooSharp'
  | 'fallbackTotalBendTooHigh'
  | 'fallbackMissingPath'
  | 'fallbackByConfig'
  | 'fallbackCollision'
  | 'fallbackBudgetExceeded'
  | 'fallbackAdvancedTextDisabled'
  | 'fallbackSvgVerticalCjkDisabled'
  | 'fallbackCandidateIdMismatch'
  | 'usedCjkGlyphPath'
  | 'fallbackCjkGlyphPathDisabled'
  | 'fallbackCjkGlyphPathTooShort'
  | 'fallbackCjkGlyphPathTextTooLong'
  | 'fallbackCjkGlyphPathAngleTooSharp'
  | 'fallbackCjkGlyphBudgetExceeded'
  | 'fallbackCjkGlyphPlanFailed'
  | 'usedCjkGlyphPathCompact'
  | 'fallbackCjkGlyphPathTooShortAfterCompact'
  | 'fallbackCjkGlyphPathRenderFailed'
  | 'fallbackCjkGlyphPathHidden'
  | 'fallbackCjkGlyphPathStaleMarker'
  | 'fallbackLineTextMarkerBudgetExceeded'
  | 'fallbackSimpleLineLabel'
  | 'fallbackAdvancedLineRenderFailed'
  | 'fallbackLineTextRelayoutRequired'
  | 'fallbackLineTextPlanNotCached'
  | 'usedLineTextChainageReposition'
  | 'fallbackLineTextChainageRepositionHidden'
  | 'fallbackLineTextChainageSvgIneligible'
  | 'fallbackLineTextChainageCollisionBlocked'
  | 'fallbackLineTextRealViewportPriority';

export type DisplayGeoCandidateMode =
  | 'none'
  | 'fixedInterior'
  | 'autoInteriorGrid'
  | 'largeFeatureGrid'
  | 'viewportAwareCandidateSet'
  | 'gridByWorldUnits';

export type DisplayAnchorCandidate =
  | 'C'
  | 'N'
  | 'S'
  | 'E'
  | 'W'
  | 'NE'
  | 'NW'
  | 'SE'
  | 'SW'
  | 'lineCenter'
  | 'lineStart'
  | 'lineEnd'
  | 'visibleCenter';

export type DisplayAnchorConfig = {
  strategy: DisplayAnchorStrategy;

  /**
   * Native V3 multipart rendering policy.  This is intentionally separate
   * from geo-anchor candidate selection: it controls whether a low-zoom
   * point representation is emitted once for the whole feature bbox or once
   * for each canonical geometry part.
   */
  multipartMode?: 'featureBbox' | 'perPart';

  candidates?: DisplayAnchorCandidate[];

  offsetPx?: {
    x: number;
    y: number;
  };

  candidateOffsetsPx?: Array<{
    name: string;
    x: number;
    y: number;
  }>;

  allowOutsideGeometry?: boolean;
  requireInsideGeometry?: boolean;

  anchorSamples?: number;

  /**
   * RB_SLU_13: line label placement policy.
   * - free: legacy screen-space candidates may offset the label away from the line.
   * - strictOnLine: only line-derived anchors are allowed; the label must stay centered on the line.
   */
  lineLabelMode?: DisplayLineLabelMode;

  /**
   * RB_SLU_16: stable line candidate generation for line labels.
   * These options are the one-dimensional counterpart of polygon geo candidates:
   * candidates are generated along polyline chainage and remain on the line.
   */
  lineCandidateSpacing?: number;
  lineCandidateMinSpacing?: number;
  lineCandidateMax?: number;
  lineShortThresholdMultiplier?: number;
  lineLongMode?: 'evenSplit';
  lineCandidateEndpointPaddingRatio?: number;
  lineCandidateEndpointPaddingMin?: number;
  preferPreviousLineCandidate?: boolean;
  lineCandidateHysteresisPx?: number;
  minLineLabelLengthPx?: number;
  maxAngleDeltaDeg?: number;

  /**
   * RB_SLU_17: optional SVG textPath rendering for pure line-text labels.
   * textPath is text-only: it must not convert RLE pill/badge/marker structures.
   */
  lineTextMode?: DisplayLineTextMode;
  textPathMinLengthPx?: number;
  textPathPaddingPx?: number;
  textPathMaxAngleDeltaDeg?: number;
  textPathMaxTotalBendDeg?: number;
  textPathPreferReadableDirection?: boolean;
  textPathFallback?: DisplayTextPathFallback;
  textPathCollisionPaddingPx?: number;
  textPathLetterSpacingPx?: number;
  textPathCurvedLetterSpacingPx?: number;
  textPathCurvedSpacingMinBendDeg?: number;
  lineTextOrientationPolicy?: DisplayLineTextOrientationPolicy;
  textPathVerticalAngleThresholdDeg?: number;
  textPathVerticalLengthRatio?: number;

  /**
   * RB_SLU_20: weighted candidate ranking and SVG CJK vertical labels.
   * Padded layout windows still decide candidate usability; these fields only
   * decide whether a better visible candidate is worth switching to.
   */
  candidateWeightMode?: CandidateWeightMode;
  candidateSwitchThreshold?: number;
  candidateReuseBonus?: number;
  candidateViewportPreference?: boolean;
  candidateEdgePenalty?: number;

  lineCandidateOrdering?: LineCandidateOrdering;
  lineCenterWeightMode?: CandidateWeightMode;
  lineCandidateSwitchThreshold?: number;
  lineCandidateReuseBonus?: number;

  lineCjkVerticalRenderMode?: LineCjkVerticalRenderMode;
  svgVerticalCjkMinLengthPx?: number;
  svgVerticalCjkLetterSpacingPx?: number;

  /**
   * RB_SLU_21: advanced line-text rendering is budgeted. Candidate identity
   * remains stable through candidateId; glyph-on-path fields are kept as
   * forward-compatible configuration but are not rendered in RB_SLU_21.
   */
  advancedLineTextEnabled?: boolean;
  advancedLineTextBudgetGroup?: DisplayAdvancedLineTextBudgetGroup;
  advancedLineTextMaxLabels?: number;
  advancedLineTextMaxCandidatesPerPass?: number;
  cjkGlyphRotationPolicy?: CjkGlyphRotationPolicy;
  cjkGlyphUprightAngleThresholdDeg?: number;

  /**
   * RB_SLU_22: CJK glyph-on-path line labels. This is per-character
   * placement along the selected line path, not the old whole-block vertical
   * SVG mode.
   */
  cjkGlyphPathMode?: CjkGlyphPathMode;
  cjkGlyphSpacingPx?: number;
  cjkGlyphCollisionPaddingPx?: number;
  cjkGlyphMinPathLengthPx?: number;
  cjkGlyphMaxCount?: number;
  cjkGlyphMaxAngleDeltaDeg?: number;
  cjkGlyphMaxTotalBendDeg?: number;
  cjkGlyphPreferReadableDirection?: boolean;
  cjkGlyphAllowTextPathFallback?: boolean;

  /**
   * RB_SLU_23: line text path recovery + stable CJK fallback + marker reuse control.
   * These fields expand the local path window without changing candidateId,
   * allow compact glyph-on-path instead of whole-string rotated fallback, and
   * keep SVG line-text reuse tied to a zoom/path signature.
   */
  lineTextPathHalfLengthMultiplier?: number;
  lineTextPathMinHalfLengthWorld?: number;
  lineTextPathMaxHalfLengthWorld?: number;
  lineTextPathMaxHalfLengthRatio?: number;
  lineTextCollisionRectMode?: LineTextCollisionRectMode;
  cjkGlyphCompactMode?: CjkGlyphCompactMode;
  cjkGlyphMinAdvanceScale?: number;
  cjkGlyphFallbackMode?: CjkGlyphFallbackMode;

  /**
   * RB_SLU_24: stable simple fallback for line labels when advanced SVG
   * glyph/textPath rendering cannot be built for the current viewport.
   */
  lineTextSimpleFallbackEnabled?: boolean;
  lineTextSimpleFallbackRotate?: boolean;

  /** RB_SLU_25: along-line chainage reposition for strict SVG line labels. */
  lineTextRepositionMode?: LineTextRepositionMode;
  lineTextRepositionAttemptsPerDirection?: number;
  lineTextRepositionStepMode?: LineTextRepositionStepMode;
  lineTextRepositionFailure?: LineTextRepositionFailure;
  lineTextRepositionStrictSvg?: boolean;
  lineTextAvoidLineGeometry?: boolean;
  lineTextAvoidPolygonGeometry?: boolean;
  lineTextAvoidPointSymbols?: boolean;
  lineTextRepositionCollisionScope?: LineTextRepositionCollisionTarget[];

  /**
   * RB_SLU_26: chainageSearch viewport correction. Stable line candidates remain
   * the primary system; viewport temporary candidates are generated only when
   * no stable candidate falls inside the current real viewport + buffer.
   */
  lineTextViewportRectMode?: LineTextViewportRectMode;
  lineTextViewportCandidateMode?: LineTextViewportCandidateMode;
  lineTextViewportCandidateBufferPx?: number;
  lineTextViewportCandidateMaxTargets?: number;
  lineTextViewportCandidateMinIntervalPx?: number;

  /**
   * RB_SLU_14: stable geographic candidate generation for polygon labels.
   * These options control where stable polygon label anchors come from before
   * screen-space collision/density is applied.
   */
  geoCandidateMode?: DisplayGeoCandidateMode;
  geoCandidateCount?: number;
  geoGridSize?: number;
  geoGridMinSize?: number;
  geoCandidateMax?: number;
  geoCandidateScanMax?: number;
  geoCandidateOverflow?: 'rankedPrune' | 'seededPrune';
  preferPreviousGeoCandidate?: boolean;
  switchThreshold?: number;
  allowViewportCandidateFallback?: boolean;

  largeFeature?: {
    minScreenAreaPx: number;
    preferViewportCenter: boolean;
  };
};

export type DisplayCollisionRole =
  | 'required'
  | 'important'
  | 'optional'
  | 'soft'
  | 'ignore';

export type DisplayCollisionGroup =
  | 'surfaceLabel'
  | 'networkLabel'
  | 'structureLabel'
  | 'transportLabel'
  | 'poiLabel'
  | 'indoorLabel'
  | 'debugLabel';

export type DisplayCollisionTarget =
  | 'symbol'
  | 'requiredLabel'
  | 'importantLabel'
  | 'optionalLabel'
  | 'softLabel'
  | 'geometry';

export type DisplayCollisionBlockTarget =
  | 'optionalLabel'
  | 'softLabel'
  | 'poiLabel'
  | 'structureLabel';

export type DisplayHidePolicy =
  | 'hide'
  | 'abbreviateThenHide'
  | 'forceShow'
  | 'showWithoutBlocking'
  | 'geometryOnly';

export type DisplayCollisionConfig = {
  boundsAdjustment?: { x?: number; y?: number; width?: number; height?: number };
  role: DisplayCollisionRole;
  priority: number;

  group?: DisplayCollisionGroup;

  collideWith?: DisplayCollisionTarget[];
  blocks?: DisplayCollisionBlockTarget[];

  allowOverlap?: boolean;
  allowHide?: boolean;

  paddingPx?: number;

  hidePolicy?: DisplayHidePolicy;
};

export type DisplayStabilityCacheKey =
  | 'featureID'
  | 'featureID+zoomBucket'
  | 'featureID+mode'
  | 'custom';

export type DisplayStabilityInvalidation =
  | 'zoomBucketChanged'
  | 'featureGeometryChanged'
  | 'featureTextChanged'
  | 'modeChanged'
  | 'worldChanged'
  | 'labelOutOfViewport'
  | 'collisionFailedRepeatedly';

export type DisplayStabilityConfig = {
  enabled: boolean;

  cacheKey?: DisplayStabilityCacheKey;
  zoomBucketSize?: number;

  freezeDuringPan?: boolean;
  recomputeOnMoveEnd?: boolean;
  recomputeOnZoomEnd?: boolean;

  hysteresisPx?: number;

  keepPreviousCandidate?: boolean;
  keepPreviousAnchor?: boolean;

  invalidateWhen?: DisplayStabilityInvalidation[];
};

export type DisplayDensityReduceStep =
  | 'hideSoftLabels'
  | 'abbreviateOptionalLabels'
  | 'hideOptionalLabels'
  | 'hideSymbols'
  | 'geometryOnly';

export type DisplayDensityConfig = {
  enabled: boolean;

  gridSizePx?: number;
  maxLabelsPerGrid?: number;
  maxSymbolsPerGrid?: number;

  reduceOrder?: DisplayDensityReduceStep[];

  importanceField?: string;

  preserveSelected?: boolean;
  preserveRequired?: boolean;
};

export type DisplayInteractionConfig = {
  hover?: {
    raiseZIndex?: boolean;
    showLabel?: boolean;
    highlightGeometry?: boolean;
  };

  selected?: {
    forceShowGeometry?: boolean;
    forceShowSymbol?: boolean;
    forceShowLabel?: boolean;
    collisionRoleOverride?: 'required';
    priorityOverride?: number;
    zIndexOverride?: number;
  };

  searchResult?: {
    forceShowLabel?: boolean;
    pulseSymbol?: boolean;
    priorityOverride?: number;
  };

  editing?: {
    forceShowVertices?: boolean;
    forceShowLabel?: boolean;
    renderDraftStyle?: boolean;
    priorityOverride?: number;
  };

  deletionMarked?: {
    renderDeleteStyle?: boolean;
    forceShowLabel?: boolean;
  };
};

export type DisplayFallbackConfig = {
  whenNoLabelText?: 'hideLabel' | 'showID' | 'showClassKind' | 'placeholder';
  whenCollisionFailed?: 'hideLabel' | 'abbreviate' | 'forceShow' | 'showGeometryOnly';
  whenRuleMissing?: 'geometryOnly' | 'hidden' | 'debugDefault' | 'legacyDefault';
  whenGeometryInvalid?: 'skip' | 'showErrorMarker' | 'debugOnly';
};

export type FeatureDisplayRuleDraft = {
  name?: string;
  match?: FeatureDisplayMatch;

  profile?: string;

  displayTier?: DisplayTier;
  visibility?: Partial<DisplayVisibilityConfig>;
  geometry?: Partial<DisplayGeometryConfig>;
  symbol?: Partial<DisplaySymbolConfig>;
  label?: Partial<DisplayLabelConfig>;
  anchor?: Partial<DisplayAnchorConfig>;
  collision?: Partial<DisplayCollisionConfig>;
  stability?: Partial<DisplayStabilityConfig>;
  density?: Partial<DisplayDensityConfig>;
  interaction?: Partial<DisplayInteractionConfig>;
  fallback?: Partial<DisplayFallbackConfig>;
};

export type FeatureDisplayPlan = {
  name?: string;
  match?: FeatureDisplayMatch;

  profile?: string;

  displayTier: DisplayTier;
  visibility: DisplayVisibilityConfig;
  geometry: DisplayGeometryConfig;
  symbol: DisplaySymbolConfig;
  label: DisplayLabelConfig;
  anchor: DisplayAnchorConfig;
  collision: DisplayCollisionConfig;
  stability: DisplayStabilityConfig;
  density: DisplayDensityConfig;
  interaction: DisplayInteractionConfig;
  fallback: DisplayFallbackConfig;
};
