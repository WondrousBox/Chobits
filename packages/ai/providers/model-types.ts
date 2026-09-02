import type { ModelParamsSchema } from './model-params';

type ModelPriceCurrency = 'CNY' | 'USD';

type ProviderModelType = 'chat' | 'embedding' | 'tts' | 'stt' | 'image' | 'text2video' | 'text2music' | 'realtime';

interface ProviderModelAbilities {
  files?: boolean;
  functionCall?: boolean;
  imageOutput?: boolean;
  reasoning?: boolean;
  search?: boolean;
  structuredOutput?: boolean;
  video?: boolean;
  vision?: boolean;
}

interface ProviderModelConfig {
  deploymentName?: string;
  searchEnabled?: boolean;
}

type ProviderModelSearchImplementation = 'tool' | 'params' | 'internal';

type ProviderModelExtendedParam =
  | 'reasoningBudgetToken'
  | 'enableReasoning'
  | 'disableContextCaching'
  | 'reasoningEffort'
  | 'gpt5ReasoningEffort'
  | 'gpt51ReasoningEffort'
  | 'gpt5_2ReasoningEffort'
  | 'gpt5_2ProReasoningEffort'
  | 'textVerbosity'
  | 'thinking'
  | 'thinkingBudget'
  | 'thinkingLevel'
  | 'thinkingLevel2'
  | 'imageAspectRatio'
  | 'imageResolution'
  | 'urlContext';

interface ProviderModelSettings {
  extendParams?: ProviderModelExtendedParam[];
  searchImpl?: ProviderModelSearchImplementation;
  searchProvider?: string;
}

interface BasicProviderModelPricing {
  currency?: ModelPriceCurrency;
  input?: number;
}

interface ChatProviderModelPricing extends BasicProviderModelPricing {
  audioInput?: number;
  audioOutput?: number;
  cachedAudioInput?: number;
  cachedInput?: number;
  output?: number;
  unit?: '1K tokens' | '1M tokens' | string;
  writeCacheInput?: number;
}

type PricingUnitName =
  | 'textInput'
  | 'textOutput'
  | 'textInput_cacheRead'
  | 'textInput_cacheWrite'
  | 'audioInput'
  | 'audioOutput'
  | 'audioInput_cacheRead'
  | 'imageGeneration'
  | 'imageInput'
  | 'imageInput_cacheRead'
  | 'imageOutput';

type PricingUnitType = 'millionTokens' | 'millionCharacters' | 'image' | 'megapixel' | 'second';

type PricingStrategy = 'fixed' | 'tiered' | 'lookup';

interface PricingUnitBase {
  name: PricingUnitName;
  strategy: PricingStrategy;
  unit: PricingUnitType;
}

interface FixedPricingUnit extends PricingUnitBase {
  rate: number;
  strategy: 'fixed';
}

interface TieredPricingUnit extends PricingUnitBase {
  strategy: 'tiered';
  tiers: Array<{
    rate: number;
    upTo: number | 'infinity';
  }>;
}

interface LookupPricingUnit extends PricingUnitBase {
  lookup: {
    prices: Record<string, number>;
    pricingParams: string[];
  };
  strategy: 'lookup';
}

type ProviderPricingUnit = FixedPricingUnit | TieredPricingUnit | LookupPricingUnit;

interface ProviderModelPricing extends ChatProviderModelPricing {
  approximatePricePerImage?: number;
  units?: ProviderPricingUnit[];
}

export interface ProviderModelDefinition {
  contextWindowTokens?: number;
  description?: string;
  displayName?: string;
  enabled?: boolean;
  id: string;
  abilities?: ProviderModelAbilities | Record<string, boolean>;
  config?: ProviderModelConfig;
  legacy?: boolean;
  maxOutput?: number;
  parameters?: ModelParamsSchema;
  pricing?: ProviderModelPricing;
  organization?: string;
  providerId?: string;
  releasedAt?: string;
  resolutions?: string[];
  settings?: ProviderModelSettings;
  tags?: string[];
  type?: ProviderModelType | string;
  maxDimension?: number;
  [k: string]: any;
}

export interface ChatProviderModelCard extends ProviderModelDefinition {
  type: 'chat';
}

export interface EmbeddingProviderModelCard extends ProviderModelDefinition {
  maxDimension: number;
  type: 'embedding';
}

export interface ImageProviderModelCard extends ProviderModelDefinition {
  type: 'image';
}

export interface TTSProviderModelCard extends ProviderModelDefinition {
  type: 'tts';
}

export interface STTProviderModelCard extends ProviderModelDefinition {
  type: 'stt';
}

export interface RealtimeProviderModelCard extends ProviderModelDefinition {
  type: 'realtime';
}
