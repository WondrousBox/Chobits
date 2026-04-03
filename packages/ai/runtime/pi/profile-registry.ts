import type { PiAgentProfile, PiProfileId } from './contracts';
import { getPiProfileDescriptor, listPiProfileDescriptors } from './profile-descriptors';

export const DEFAULT_PI_PROFILE_ID: PiProfileId = 'assistant';

export function getPiAgentProfile(profileId: string = DEFAULT_PI_PROFILE_ID): PiAgentProfile {
  const descriptor = getPiProfileDescriptor(profileId) || getPiProfileDescriptor(DEFAULT_PI_PROFILE_ID);
  if (!descriptor) {
    throw new Error(`Unknown Pi profile: ${profileId}`);
  }

  return {
    id: descriptor.id,
    label: descriptor.label,
    description: descriptor.description,
    executionMode: descriptor.executionMode,
    instructions: descriptor.instructions,
    supportsToolCalls: descriptor.supportsToolCalls,
    defaultToolIds: [...descriptor.defaultToolIds],
    toolInjectionMode: descriptor.toolInjectionMode
  };
}

export function listPiAgentProfiles(): PiAgentProfile[] {
  return listPiProfileDescriptors().map((descriptor) => ({
    id: descriptor.id,
    label: descriptor.label,
    description: descriptor.description,
    executionMode: descriptor.executionMode,
    instructions: descriptor.instructions,
    supportsToolCalls: descriptor.supportsToolCalls,
    defaultToolIds: [...descriptor.defaultToolIds],
    toolInjectionMode: descriptor.toolInjectionMode
  }));
}

export function getPiProfileInstructions(profileId: string = DEFAULT_PI_PROFILE_ID): string {
  return getPiAgentProfile(profileId).instructions || '';
}
