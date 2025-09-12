# AI Assistant Messages

Centralized message catalog for the AI Assistant. Use this to manage all user-facing texts by category and locale.

## Structure

- `types.ts` — Types for categories, context, and provider contract.
- `zh-CN.ts` — Default Simplified Chinese catalog and provider implementation.
- `index.ts` — Entry that exports the active provider as `Messages`.

## Usage

In components like `AIAssistant.tsx`:

```ts
import Messages from './messages'

setMessage(Messages.t('welcome'))
setMessage(Messages.t('click'))
setMessage(Messages.t('drop', { count: 3, names: ['A.txt', 'B.mov', 'C.png'] }))
```

## Add a new locale

1. Create a new file like `en-US.ts` implementing `MessagesProvider` using a `MessageCatalog`.
2. Export your provider.
3. Switch the default export in `messages/index.ts` to your provider (or add runtime locale selection).

## Add a new category

1. Add the key to `MessageCategory` in `types.ts`.
2. Provide entries in locale catalog files.

## Format dynamic messages

Use a function as `default` or `variants` to generate text from `MessageContext`:

```ts
{
  task: {
    default: ({ count }) => `已完成 ${count ?? 0} 项任务 ✅`,
  }
}
```

## Notes

- Prefer concise, warm tone. Keep emojis consistent with UI.
- Keep business logic out of messages; only format text from passed context.
