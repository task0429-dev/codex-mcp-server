# Task Enterprise MCP Server

Production-ready MCP ecosystem for the Task Enterprise LLC multi-agent operating system.

## What it includes

- Local stdio MCP transport for Codex
- HTTP transport for future remote or ChatGPT-compatible exposure
- Core agent tools for status, sessions, logs, memory, and coordination
- Integration modules for filesystem, terminal, Docker, GitHub, Notion, Discord, Telegram, Google Drive, Supabase, Stripe, Airtable, and n8n
- Desktop launch tools for opening URLs, apps, and local files on Windows
- Desktop viewing and control tools for screenshots, window focus, mouse, and keyboard input on Windows
- Agent-specific role-based access control across every integration
- Per-agent runtime slots with separate credentials, including a gateway-backed GPT-5.3 Codex runtime for Dame and separate OpenRouter keys for the other agents
- Environment-driven secret management with no hardcoded credentials

## Agents

- Abdi: CEO / Supervisor / Strategist / Business Operator
- Ahmed: Organizer / File-Finder / Documentation Manager
- Dame: Local Machine Operator / Systems Specialist
- Rex: Network / Infrastructure / Cybersecurity Specialist
- Prime: Trading Research and Systems Specialist
- Atlas: Director of Marketing / Growth / SEO / Social Media
- Ayub: Builder / Coder / Implementation Specialist
- Sygma: Assisted-Living / Operations / Compliance Specialist

## Structure

```text
mcp-server/
├─ src/
│  ├─ agents/
│  ├─ config/
│  ├─ core/
│  ├─ integrations/
│  ├─ policies/
│  ├─ services/
│  ├─ tools/
│  ├─ types/
│  ├─ index-http.ts
│  └─ index-stdio.ts
├─ workspaces/
├─ docs/
├─ .env.example
├─ package.json
└─ README.md
```

## Per-agent runtimes

Every agent now has a dedicated runtime slot. Dame is pinned to a gateway-backed `gpt-5.3-codex` path, while the rest use their own OpenRouter keys.

- `ABDI_OPENROUTER_API_KEY`
- `AHMED_OPENROUTER_API_KEY`
- `REX_OPENROUTER_API_KEY`
- `PRIME_OPENROUTER_API_KEY`
- `ATLAS_OPENROUTER_API_KEY`
- `AYUB_OPENROUTER_API_KEY`
- `SYGMA_OPENROUTER_API_KEY`

Atlas defaults to the `FLUX.1` family. The other agents default to `openai/gpt-4o-mini` until you pin them differently.

## Integration tool surface

### Core MCP tools
- `list_agents`
- `agent_status`
- `ask_agent`
- `restart_agent`
- `get_recent_logs`
- `search_agent_memory`
- `list_sessions`
- `unlock_session`

### Local operations
- `filesystem_browse_directory`
- `filesystem_read_file`
- `filesystem_write_file`
- `filesystem_search_files`
- `terminal_execute_command`
- `desktop_open_url`
- `desktop_launch_app`
- `desktop_open_path`
- `desktop_get_screen_state`
- `desktop_capture_screen`
- `desktop_list_windows`
- `desktop_focus_window`
- `desktop_move_mouse`
- `desktop_click_mouse`
- `desktop_scroll_mouse`
- `desktop_type_text`
- `desktop_send_keys`
- `desktop_list_app_aliases`
- `docker_list_containers`
- `docker_inspect_container`
- `docker_get_logs`
- `docker_control_container`

### SaaS and business systems
- `github_list_repos`
- `github_get_repo`
- `github_list_issues`
- `github_search_code`
- `notion_search_pages`
- `notion_get_page`
- `notion_create_page`
- `notion_update_page`
- `discord_list_guilds`
- `discord_list_channels`
- `discord_send_message`
- `telegram_get_me`
- `telegram_get_updates`
- `telegram_send_message`
- `google_drive_list_files`
- `google_drive_get_file`
- `google_drive_create_folder`
- `google_drive_upload_text_file`
- `supabase_query_table`
- `supabase_upsert_row`
- `supabase_delete_rows`
- `stripe_list_customers`
- `stripe_list_products`
- `stripe_list_payment_intents`
- `stripe_create_customer`
- `airtable_list_records`
- `airtable_create_record`
- `airtable_update_record`
- `n8n_list_workflows`
- `n8n_get_workflow`
- `n8n_create_workflow`
- `n8n_update_workflow`
- `n8n_delete_workflow`
- `n8n_activate_workflow`
- `n8n_deactivate_workflow`
- `n8n_list_executions`
- `n8n_get_execution`

## Setup

```powershell
cd C:\Users\offic\Documents\Codex\mcp-server
Copy-Item .env.example .env
npm install
npm run build
npm run start:stdio
```

Fill in the integration credentials you want to activate, set the dedicated OpenRouter key for each OpenRouter-backed agent, and point `GATEWAY_URL` at your OpenClaw service if you want Dame live through Codex. For current OpenClaw builds, Dame talks to the gateway over WebSocket JSON-RPC. You can keep `GATEWAY_URL=http://<host>:61299` and let the server derive `ws://<host>:61299/`, or set `GATEWAY_WS_URL` directly if your public WebSocket endpoint differs. If the gateway enforces origin checks, set `GATEWAY_WS_ORIGIN` to the allowed Control UI origin.


## Dame Runtime

Dame is pinned to `gpt-5.3-codex` and is intended to run through your OpenClaw/OpenAI Codex gateway, not through OpenRouter. Set `GATEWAY_ENABLED=true`, point `GATEWAY_URL` at the service that already has Codex access, and set `GATEWAY_API_KEY` to the gateway token. Current OpenClaw builds use the WebSocket gateway transport automatically. `GATEWAY_LOGIN_PATH` and `GATEWAY_CHAT_PATH=/api/chat/{agent}` remain available only for older session-style gateways. If you later front it with an OpenAI-compatible proxy, switch `GATEWAY_CHAT_PATH` to `/v1/chat/completions`.
