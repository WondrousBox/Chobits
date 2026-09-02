import { useContext } from 'react';

import { MessageContext } from './message-context-value';
import type { MessageContextValue } from './types';

export function useMessage(): MessageContextValue {
  const context = useContext(MessageContext);
  if (!context) {
    throw new Error('useMessage must be used within a MessageProvider');
  }
  return context;
}

export function useMessageSafe(): MessageContextValue | null {
  return useContext(MessageContext);
}
