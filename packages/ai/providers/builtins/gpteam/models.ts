import type { ImageProviderModelCard } from '../../model-types';

export const gpteamImageModels: ImageProviderModelCard[] = [
  {
    description: 'GPTeam default image model for text-to-image generation, image-to-image, and image editing.',
    displayName: 'GPT Image 2',
    enabled: true,
    id: 'gpt-image-2',
    parameters: {
      prompt: { default: '' },
      quality: {
        default: 'high',
        enum: ['auto', 'high', 'medium', 'low']
      },
      size: {
        default: '1024x1024',
        enum: ['auto', '1024x1024', '1536x1024', '1024x1536']
      }
    },
    type: 'image'
  }
];

export const gpteamModels = [...gpteamImageModels];

export default gpteamModels;
