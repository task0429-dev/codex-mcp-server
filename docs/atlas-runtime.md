# Atlas Runtime

Atlas now has a dedicated workspace and runtime profile inside the MCP project.

## What was created

- Workspace root: `workspaces/atlas`
- Runtime profile source: `src/agents/runtime-profiles.ts`
- Workspace service: `src/services/agent-workspace-service.ts`
- Runtime types: `src/types/agent-runtime.ts`

## OpenRouter configuration

Atlas is pinned to:
- Provider: OpenRouter
- Model family: FLUX.1
- Dedicated API key env var: `ATLAS_OPENROUTER_API_KEY`
- Model ID env var: `ATLAS_OPENROUTER_MODEL_ID`

## Notes

Every Task Enterprise agent now has a separate OpenRouter API key slot and model slot. Atlas remains the only agent pinned to the `FLUX.1` family by default.
