declare module 'ai' {
    export const streamText: any;
    export const generateText: any;
}

declare module '@ai-sdk/openai' {
    export const openai: any;
    export const createOpenAI: any;
}

declare module '@ai-sdk/anthropic' {
    export const anthropic: any;
    export const createAnthropic: any;
}

declare module '@ai-sdk/google' {
    export const google: any;
    export const createGoogleGenerativeAI: any;
}
