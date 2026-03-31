import { getDefaultApiKey } from '../../../settings-store';

const TAVILY_PROVIDER_ID = 'tavily';
const TAVILY_API_KEY_FIELD = 'apiKey';

export async function getWebSearchApiKey(): Promise<string | undefined> {
  return getDefaultApiKey(TAVILY_PROVIDER_ID, TAVILY_API_KEY_FIELD);
}
