import PersonaGainEffects from '@/features/sprite-assistant/ui/PersonaGainEffects';

import AssistantEntranceEffect from './AssistantEntranceEffect';

export function SpriteEffectPage(): JSX.Element {
  return (
    <>
      <AssistantEntranceEffect />
      <PersonaGainEffects presentation="window" />
    </>
  );
}

export default SpriteEffectPage;
