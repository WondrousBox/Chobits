import { z } from 'zod';

const MAX_SEED = 2 ** 31 - 1;

export const CHAT_MODEL_IMAGE_GENERATION_PARAMS: ModelParamsSchema = {
  imageUrls: {
    default: []
  },
  prompt: { default: '' }
};

const MODEL_PARAMS_META_SCHEMA = z.object({
  prompt: z.object({
    default: z.string().optional().default(''),
    description: z.string().optional(),
    type: z.literal('string').optional()
  }),

  imageUrl: z
    .object({
      default: z.string().nullable().optional(),
      description: z.string().optional(),
      maxFileSize: z.number().optional(),
      type: z.tuple([z.literal('string'), z.literal('null')]).optional()
    })
    .optional(),

  imageUrls: z
    .object({
      default: z.array(z.string()),
      description: z.string().optional(),
      maxCount: z.number().optional(),
      maxFileSize: z.number().optional(),
      type: z.literal('array').optional()
    })
    .optional(),

  width: z
    .object({
      default: z.number(),
      description: z.string().optional(),
      max: z.number(),
      min: z.number(),
      step: z.number().optional().default(1),
      type: z.literal('number').optional()
    })
    .optional(),

  samplerName: z
    .object({
      default: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()).optional(),
      type: z.literal('string').optional()
    })
    .optional(),

  scheduler: z
    .object({
      default: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()).optional(),
      type: z.literal('string').optional()
    })
    .optional(),

  height: z
    .object({
      default: z.number(),
      description: z.string().optional(),
      max: z.number(),
      min: z.number(),
      step: z.number().optional().default(1),
      type: z.literal('number').optional()
    })
    .optional(),

  size: z
    .object({
      default: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()),
      type: z.literal('string').optional()
    })
    .optional(),

  aspectRatio: z
    .object({
      default: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()),
      type: z.literal('string').optional()
    })
    .optional(),

  resolution: z
    .object({
      default: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()),
      type: z.literal('string').optional()
    })
    .optional(),

  cfg: z
    .object({
      default: z.number(),
      description: z.string().optional(),
      max: z.number(),
      min: z.number(),
      step: z.number(),
      type: z.literal('number').optional()
    })
    .optional(),

  strength: z
    .object({
      default: z.number(),
      description: z.string().optional(),
      max: z.number().optional().default(1),
      min: z.number().optional().default(0),
      step: z.number().optional().default(0.05),
      type: z.literal('number').optional()
    })
    .optional(),

  steps: z
    .object({
      default: z.number(),
      description: z.string().optional(),
      max: z.number(),
      min: z.number(),
      step: z.number().optional().default(1),
      type: z.literal('number').optional()
    })
    .optional(),

  quality: z
    .object({
      default: z.string(),
      description: z.string().optional(),
      enum: z.array(z.string()),
      type: z.literal('string').optional()
    })
    .optional(),

  seed: z
    .object({
      default: z.number().nullable().default(null),
      description: z.string().optional(),
      max: z.number().optional().default(MAX_SEED),
      min: z.number().optional().default(0),
      type: z.tuple([z.literal('number'), z.literal('null')]).optional()
    })
    .optional()
});

export type ModelParamsSchema = z.input<typeof MODEL_PARAMS_META_SCHEMA>;
