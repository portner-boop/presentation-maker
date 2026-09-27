export {
  type AnalyzeTemplateInput,
  ANALYZER_VERSION,
  analyzeTemplate,
} from './analysis/analyze-template.js';
export {
  type GeneratedPresentation,
  type GeneratePresentationInput,
  generatePresentation,
} from './generation/generate.js';
export { LlmClient, type LlmConfig, LlmUsage, type StructuredOutputMode } from './llm/client.js';
export { renderNative, type SlideFill } from './render/native.js';
export { type PreviewOptions, previewAvailable, renderPreviews } from './render/preview.js';
