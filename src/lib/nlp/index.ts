// NLP Module — Local model inference for The Tell pipeline
// See: Local NLP Model Integration Plan

// Model cache and configuration
export {
  getModelPipeline,
  getBackend,
  clearModelCache,
  getCachedPipelineCount,
  configureModelCache,
  unloadIdleModels,
  getModelCacheStats,
} from "./model-cache";

// Opportunity 1: Local sentiment classification (FinBERT)
export { classifySentimentLocal } from "./sentiment-classifier";
export type { LocalSentimentResult } from "./sentiment-classifier";

// Opportunity 2: Content quality gate (zero-shot classification)
export { assessContentQuality, QUALITY_THRESHOLD } from "./quality-gate";
export type { QualityAssessment } from "./quality-gate";

// Opportunity 3: Named Entity Recognition (BERT-NER)
export { extractEntities } from "./entity-extractor";
export type { ExtractedEntities } from "./entity-extractor";

// Opportunity 4: Text embeddings (all-MiniLM-L6-v2)
export {
  generateEmbedding,
  cosineSimilarity,
  EMBEDDING_DIMENSIONS,
} from "./embedding-generator";

// Opportunity 5: Key phrase extraction (KeyBERT-style)
export { extractKeyPhrases } from "./keyphrase-extractor";
export type { KeyPhrase } from "./keyphrase-extractor";

// Opportunity 6: Language detection (FastText)
export {
  detectLanguage,
  LANGUAGE_CONFIDENCE_THRESHOLD,
} from "./language-detector";
export type { LanguageDetectionResult } from "./language-detector";

// Graceful degradation wrappers (feature-flag gated)
export {
  getNlpFeatureFlags,
  classifySentimentWithFallback,
  assessQualityWithFallback,
  extractEntitiesWithFallback,
  generateEmbeddingWithFallback,
  extractKeyPhrasesWithFallback,
  detectLanguageWithFallback,
} from "./fallbacks";
