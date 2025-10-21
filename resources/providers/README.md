Model and provider configuration

- <provider>.schema.json: UI schema for provider secrets/config.
- <provider>.models.json: Curated model list with metadata.

models.json format (either top-level array or { models: [...] })

[
  {
    "id": "string",
    "label": "optional display name",
    "type": "chat|embedding|...",
    "context": 128000,
    "pricing": { "prompt": 0.00015, "completion": 0.0006, "unit": "1K tokens", "currency": "USD" },
    "capabilities": { "vision": true, "function_call": true },
    "tags": ["fast", "cheap"],
    "description": "free-form description",
    "...": "any provider-specific fields"
  }
]

Notes
- You can add/remove models without touching code; app reads this file at runtime.
- If the file is missing for a provider, the app will try to query models via API (if supported) or show nothing.
