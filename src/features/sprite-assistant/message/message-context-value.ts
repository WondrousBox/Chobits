import { createContext } from 'react';

import type { MessageContextValue } from './types';

export const MessageContext = createContext<MessageContextValue | null>(null);
