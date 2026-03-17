Provider resource assets

This directory is no longer a runtime source for provider schema or model metadata.

What stays here:

- `icons/`: packaged provider icon assets referenced by builtin provider definitions.

What moved out:

- Provider schema definitions now live in `packages/ai/providers/builtins/*/definition.ts`.
- Builtin model catalogs now live in `packages/ai/providers/builtins/*/models.ts`.
- Business code reads provider metadata through `packages/ai/providers/service.ts`.

Guidelines

- Do not add new `<provider>.schema.json` or `<provider>.models.json` files here.
- If a builtin provider needs a packaged icon, add the asset under `icons/` and reference it from the provider definition.
- Plugin providers should contribute metadata through the unified provider definition/registry flow instead of this directory.
