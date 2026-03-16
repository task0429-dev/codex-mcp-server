# Per-Agent Runtime

Every OpenRouter-backed Task Enterprise agent now has its own OpenRouter key slot and model slot. Dame is direct OpenAI on `gpt-5.3-codex`.

## Dedicated env vars

- `ABDI_OPENROUTER_API_KEY`
- `AHMED_OPENROUTER_API_KEY`
- `REX_OPENROUTER_API_KEY`
- `PRIME_OPENROUTER_API_KEY`
- `ATLAS_OPENROUTER_API_KEY`
- `AYUB_OPENROUTER_API_KEY`
- `SYGMA_OPENROUTER_API_KEY`

## Dedicated model vars

- `ABDI_OPENROUTER_MODEL_ID`
- `AHMED_OPENROUTER_MODEL_ID`
- `REX_OPENROUTER_MODEL_ID`
- `PRIME_OPENROUTER_MODEL_ID`
- `ATLAS_OPENROUTER_MODEL_ID`
- `AYUB_OPENROUTER_MODEL_ID`
- `SYGMA_OPENROUTER_MODEL_ID`

Atlas remains pinned to the `FLUX.1` family by default.
