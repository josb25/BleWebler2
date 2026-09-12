/**
 * universal-label-renderer — the reference implementation of the Universal
 * Label Template (ULT) format (spec in ./spec).
 *
 * Everything here is pure TypeScript with no UI framework, so the same code
 * drives the browser editor, Node integrations, and tests:
 *
 *   template JSON ──parse/validate──▶ LabelTemplate
 *                  ──resolveTemplate──▶ LabelDesign (absolute px)
 *                  ──rasterizeDesign──▶ 1-bit image for the printer
 *
 * The only platform-specific piece is the `RasterEnv` handed to
 * `rasterizeDesign` (canvas + image decoding); browsers use `browserRasterEnv`,
 * Node supplies its own.
 */

// ---- document model (a plain label is a template with all-px placements) ----
export * from './model/design';
export { History } from './model/history';
export { LabelLibrary, type SavedLabel, type DesignOrigin, type LabelStorageBackend } from './model/storage';

// ---- safe expression engine ----
export {
    parseExpr, evalAst, compileExpr, unparse, validateAst, isValidExpr, isValidAst,
    staticIdentifiers, countNodes, ExprError, FUNCTIONS, DEFAULT_LIMITS,
    type Ast, type EvalLimits, type Scope
} from './template/safe-expr';
export {
    compileText, resolveText, resolveTemplateString, textBindingSource, textIdentifiers,
    hasBindings, bindingIdentifiers, validateTextBinding,
    type TextBinding, type BindPart, type TemplateScope
} from './template/expr';

// ---- responsive geometry ----
export {
    resolveDim, resolveDimOpt, resolvePlacement, anchorFx, anchorFy,
    anchorParts, makeAnchor, validateDim, validatePlacement,
    type Dim, type Anchor, type AnchorH, type AnchorV, type Placement, type DimContext, type RefBox
} from './template/dim';

// ---- constraints (anchor-to-anchor distances, solved) ----
export {
    solveAxis, constraintsFor, constraintDeps, axisFraction, validateConstraint,
    type Constraint, type ConstraintAxis, type ConstraintRef, type SolveIssue, type AxisSolution
} from './template/constraints';

// ---- templates: resolve, author, lint, validate, store ----
export {
    resolveTemplate, createTemplate, blankTemplate, createTemplateElement, scaleTemplatePixelGeometry,
    templateFromDesign, buildScope, contentExtentPx,
    type LabelTemplate, type TemplateElement, type TemplateParam, type ParamType,
    type TemplateAdaptivity, type ResolveOptions, type ResolveResult, type ResolveIssue,
    type TemplateTextElement, type TemplateBarcodeElement, type TemplateQrElement, type TemplateImageElement
} from './template/template';
export {
    buildTemplate, templateToEditable, defaultAuthoringFor, contentFieldOf, anchorForBounds,
    placeAtPx, authoringViewOf, reexpressDim, contentLiteral,
    type TemplateMeta, type ElementAuthoring, type DimChoice, type DimUnit, type PctBase
} from './template/authoring';
export {
    validateAcrossSizes, resolveAcrossSizes, sizeMatrix, mediaFit, resolutionFit,
    type LintReport, type LintFinding, type TestSize, type MediaFit,
    type ResolutionFit, type ResolutionContext
} from './template/lint';
export {
    parseTemplate, parseTemplateJSON, serializeTemplate, parseTags, normalizeTag, CAPS,
    type ParseResult, type ParseOk, type ParseErr
} from './template/validate';
export {
    validateTemplateDocument, expressionSourceErrors,
    type TemplateDocumentValidation
} from './template/document-validation';
export {
    WEB_FONTS, DEFAULT_WEB_FONT, isWebFontId, webFont, webFontFamily, fontAttributions,
    type WebFont
} from './raster/fonts/webfonts';
export {
    TEMPLATE_LICENSES, TAG_LIMITS, IMAGE_LIMITS,
    type TemplateLicense, type TemplateImage, type TemplateGallery
} from './template/template';
export { STARTER_TEMPLATES } from './template/starter';
export {
    buildPaperFile, serializePaperFile, parsePaperFile, parsePaperFileJSON, PAPER_FILE_LIMITS,
    type PaperFile, type PaperParseResult, type PaperParseOk, type PaperParseErr
} from './template/paper-file';

// ---- rasterization (design -> 1-bit pixels) ----
export * from './raster/monochrome';
export { encodeCode128, Code128Error } from './raster/code128';
export {
    encodeLinear, BarcodeError, SYMBOLOGY_LABELS, SYMBOLOGY_HINTS,
    type LinearSymbol
} from './raster/linear';
export { encodeQr, QrError, type QrEcLevel } from './raster/qr';
export { encodeDataMatrix, dataMatrixSize, reedSolomon, DataMatrixError } from './raster/datamatrix';
// Vector artwork: the sanitised path subset, its bundled shelf, and the SVG gate.
export {
    parsePath, isValidPath, pathBounds, tracePath, PathError, PATH_LIMITS,
    type PathCmd
} from './raster/svgpath';
export { SYMBOLS, SYMBOL_NAMES, DEFAULT_SYMBOL, symbolDef, type SymbolDef } from './raster/symbols';
export { svgToPath, SvgImportError, type SvgImportResult } from './raster/svgimport';
export * from './raster/bitmapfont';
export {
    FONT_MANIFEST, FONT_FAMILIES, DEFAULT_FONT_ID, DEFAULT_FONT_FAMILY,
    getFontMeta, loadFont, getLoadedFont, defaultFont, resolveBitmapFont,
    type FontMeta, type FontFamily, type BitmapFont, type ResolvedFont
} from './raster/fonts/registry';
export * from './raster/measure';
export { rasterizeDesign, rasterizeElementPreview, browserRasterEnv, type RasterEnv, type RasterOptions } from './raster/rasterize';

export {
    diePath, dieWithHoles, dieSize, hasShapedDie, diePlacement,
    type DieSize
} from './raster/die';
// ---- ink: slots -> colorants, and planes -> pixels a human can see ----
export {
    planInks, previewBinding,
    type InkPlan, type PlannedPlane, type InkCompromise
} from './raster/inkplan';
export {
    compositePage, contrastRatio, luminance,
    type CompositeImage, type CompositeOptions
} from './raster/composite';
/** Browser-backed text measurer; import-safe in Node (the canvas is lazy). */
export { domMeasureText } from './raster/dom-measure';
