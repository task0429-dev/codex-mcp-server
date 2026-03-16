import { useDeferredValue, useMemo, useState } from "react";
import { ActionButton, Btn, StatusBadge, StatusDot, TagRow } from "./shell";
import { cn, formatRelative, dotTone, type PageProps } from "./types";

/* ─── OpenClaw ─── */

export function OpenClawPage({ data, openRoute, actions }: PageProps) {
  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {[
          { label: "Node", value: data.openclaw.nodeState },
          { label: "Gateway", value: data.openclaw.gatewayState },
          { label: "Sessions", value: data.openclaw.activeSessions },
          { label: "Health", value: `${data.openclaw.serviceHealth}%` },
        ].map(m => (
          <div className="metric" key={m.label}>
            <div className="metric-value">{m.value}</div>
            <div className="metric-label">{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <Btn variant="primary" onClick={actions.restartGateway}>Restart Gateway</Btn>
        <Btn variant="secondary" onClick={actions.reconnectOpenClaw}>Reconnect</Btn>
        <Btn variant="secondary" onClick={actions.runSystemDiagnostic}>Diagnostic</Btn>
        <Btn variant="secondary" onClick={actions.syncWorkspace}>Sync</Btn>
      </div>

      <div className="split split-7-5">
        <div>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">Recent Commands</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {data.openclaw.commandHistory.map((entry: any) => (
              <div key={entry.id} className="list-item">
                <div className="list-item-content">
                  <div className="list-item-title mono" style={{ fontSize: 12 }}>{entry.command}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <StatusBadge value={entry.status} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <span className="section-title">Events</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {data.openclaw.recentEvents.map((ev: any) => (
                <div key={ev.id} className="list-item">
                  <span className={cn("status-dot", dotTone(ev.level))} />
                  <div className="list-item-content">
                    <div className="list-item-title">{ev.summary}</div>
                    <div className="list-item-sub">{ev.detail}</div>
                  </div>
                  <span className="text-xs text-3">{formatRelative(ev.timestamp)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">Workspaces</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {data.openclaw.workspaces.map((ws: any) => (
              <div key={ws.agent} className="list-item">
                <div className="list-item-content">
                  <div className="list-item-title">{ws.agent}</div>
                  <div className="list-item-sub mono" style={{ fontSize: 11 }}>{ws.root}</div>
                </div>
                <StatusBadge value={ws.status} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <span className="section-title">Configuration</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {Object.entries(data.openclaw.maskedConfig || {}).map(([k, v]) => (
                <div key={k} className="row-between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                  <span className="text-xs text-3">{k}</span>
                  <span className="text-sm mono text-2">{String(v)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── MCP ─── */

export function McpPage({ data, focus, openRoute, actions }: PageProps) {
  return (
    <div>
      {/* Metrics */}
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        {[
          { label: "HTTP Transport", value: data.mcp.transportState.http },
          { label: "Stdio Transport", value: data.mcp.transportState.stdio },
          { label: "Active Protocols", value: data.mcp.activeProtocols },
          { label: "Tools Enabled", value: `${data.mcp.enabledToolCount} / ${data.mcp.totalToolCount}` },
        ].map(m => (
          <div className="metric" key={m.label}>
            <div className="metric-value">{m.value}</div>
            <div className="metric-label">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
        <Btn variant="primary" onClick={actions.runMcpHealthCheck}>Health Check</Btn>
        <Btn variant="secondary" onClick={() => actions.setMcpTransportState("http", data.mcp.transportState.http === "online" ? "standby" : "online")}>
          Toggle HTTP
        </Btn>
        <Btn variant="secondary" onClick={() => actions.setMcpTransportState("stdio", data.mcp.transportState.stdio === "online" ? "standby" : "online")}>
          Toggle Stdio
        </Btn>
        <Btn variant="ghost" onClick={() => openRoute("/mcp-tools")}>Manage Tools →</Btn>
        <Btn variant="ghost" onClick={() => openRoute("/tool-store")}>Install Tools →</Btn>
      </div>

      <div className="split split-7-5">
        {/* Tool groups */}
        <div>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">Tool Groups</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {data.mcp.groups.map((group: any) => (
              <button
                key={group.key}
                className="list-item"
                onClick={() => { const t = data.tools.tools.find((x: any) => x.group === group.key); if (t) focus("tool", t); }}
              >
                <span className={cn("status-dot", group.enabled ? "dot-online" : "dot-standby")} />
                <div className="list-item-content">
                  <div className="list-item-title">{group.label}</div>
                  <div className="list-item-sub">{group.tools?.length || 0} tools · {group.key}</div>
                </div>
                <StatusBadge value={group.enabled ? "enabled" : "standby"} />
              </button>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <span className="section-title">Recent Tool Calls</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Tool</th><th>Group</th><th>Protocol</th><th>Duration</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {data.mcp.recentToolCalls.map((call: any) => (
                    <tr key={call.id}>
                      <td>{call.tool}</td>
                      <td className="text-2">{call.group}</td>
                      <td className="text-2">{call.protocol}</td>
                      <td className="text-2 mono">{call.durationMs}ms</td>
                      <td><StatusBadge value={call.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Dependencies + Server info */}
        <div>
          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">Connected Server</span>
          </div>
          <div style={{ padding: "12px 14px", border: "1px solid var(--border)", borderRadius: "var(--r-lg)", marginBottom: 16 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={cn("status-dot", "dot-online")} />
              <span className="text-sm font-semibold">codex-mcp</span>
              <StatusBadge value={data.mcp.serverHealth} />
            </div>
            <div className="text-xs text-3 mono" style={{ marginBottom: 2 }}>HTTP · Stdio</div>
            <div className="text-xs text-3">Local Node.js MCP server</div>
          </div>

          <div className="section-header" style={{ marginBottom: 12 }}>
            <span className="section-title">Dependencies</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {data.mcp.dependencies.map((dep: any) => (
              <div key={dep.name} className="list-item">
                <span className={cn("status-dot", dotTone(dep.state))} />
                <div className="list-item-content">
                  <div className="list-item-title">{dep.name}</div>
                </div>
                <StatusBadge value={dep.state} />
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <span className="section-title">Exposed Tools</span>
            </div>
            <TagRow values={data.mcp.exposedTools || []} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── MCP Tools ─── */

export function McpToolsPage({ data, context, focus, actions }: PageProps) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("All");
  const dq = useDeferredValue(query);
  const groups = ["All", ...new Set<string>(data.tools.tools.map((t: any) => t.groupLabel))];

  const filtered = useMemo(() =>
    data.tools.tools.filter((t: any) => {
      const matchGroup = group === "All" || t.groupLabel === group;
      const matchQuery = !dq.trim() || `${t.name} ${t.category} ${t.protocol} ${t.owningSystem}`.toLowerCase().includes(dq.toLowerCase());
      return matchGroup && matchQuery;
    }),
    [data.tools.tools, dq, group]
  );

  const active = context?.type === "tool" ? context.item : filtered[0];

  return (
    <div>
      {/* Search + filter */}
      <div className="row" style={{ marginBottom: 20, gap: 12 }}>
        <input className="field field-sm" style={{ width: 280 }} placeholder="Search tools…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="segmented">
          {groups.slice(0, 6).map(g => (
            <button key={g} className={cn("segmented-btn", g === group && "segmented-btn-active")} onClick={() => setGroup(g)}>{g}</button>
          ))}
        </div>
      </div>

      <div className="split split-7-5">
        {/* Tool list */}
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {filtered.map((tool: any) => (
              <button
                key={tool.id}
                className={cn("list-item", active?.id === tool.id && "list-item-active")}
                onClick={() => focus("tool", tool)}
              >
                <span className={cn("status-dot", dotTone(tool.status))} />
                <div className="list-item-content">
                  <div className="list-item-title">{tool.name}</div>
                  <div className="list-item-sub">{tool.category} · {tool.protocol}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="text-xs mono text-3">{tool.metrics?.avgLatencyMs}ms</span>
                  <StatusBadge value={tool.status} />
                </div>
              </button>
            ))}
          </div>

          {/* Performance table */}
          <div style={{ marginTop: 24 }}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <span className="section-title">Performance</span>
              <span className="text-xs text-3">{filtered.length} tools</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Tool</th><th>Protocol</th><th>Success</th><th>Latency</th><th>Calls 24h</th></tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 20).map((t: any) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td className="text-2">{t.protocol}</td>
                      <td className="text-2">{Math.round((t.metrics?.successRate || 0) * 100)}%</td>
                      <td className="text-2 mono">{t.metrics?.avgLatencyMs}ms</td>
                      <td className="text-2">{t.metrics?.callsLast24h}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Selected tool controls */}
        <div>
          {active ? (
            <div>
              <div style={{ marginBottom: 16 }}>
                <div className="row" style={{ marginBottom: 6 }}>
                  <span className={cn("status-dot", dotTone(active.status))} />
                  <span className="text-md font-semibold">{active.name}</span>
                  <StatusBadge value={active.status} />
                </div>
                <div className="text-sm text-3">{active.description}</div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "Protocol", value: active.protocol },
                  { label: "Permissions", value: active.permissions },
                  { label: "Category", value: active.category },
                  { label: "System", value: active.owningSystem },
                ].map(f => (
                  <div key={f.label}>
                    <div className="text-xs text-3">{f.label}</div>
                    <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
                  </div>
                ))}
              </div>

              {active.connectedAgents?.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="text-xs text-3" style={{ marginBottom: 6 }}>Connected agents</div>
                  <TagRow values={active.connectedAgents} />
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="primary" onClick={() => actions.toggleTool(active.id)}>
                  {active.status === "online" ? "Disable" : "Enable"}
                </Btn>
                <Btn variant="secondary" onClick={() => actions.testTool(active.id)}>Test</Btn>
              </div>
            </div>
          ) : (
            <div className="empty"><span className="empty-text">Select a tool to manage</span></div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tool Store ─── */

export function ToolStorePage({ data, context, focus, actions }: PageProps) {
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const dq = useDeferredValue(query);
  const categories = ["All", ...data.toolStore.categories.map((c: any) => c.label)];

  const filtered = data.toolStore.inventory.filter((t: any) => {
    const matchCat = category === "All" || t.category === category;
    const matchQ = !dq.trim() || `${t.name} ${t.vendor} ${t.category} ${t.description}`.toLowerCase().includes(dq.toLowerCase());
    return matchCat && matchQ;
  });

  const selected = context?.type === "store-tool" ? context.item : filtered[0];
  const creds = selected ? (drafts[selected.id] || {}) : {};

  const setDraft = (toolId: string, field: string, value: string) => {
    setDrafts(cur => ({ ...cur, [toolId]: { ...(cur[toolId] || {}), [field]: value } }));
  };

  return (
    <div>
      {/* Search + filter */}
      <div className="row" style={{ marginBottom: 20, gap: 12 }}>
        <input className="field field-sm" style={{ width: 280 }} placeholder="Search tools, vendors…" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="segmented">
          {categories.map(c => (
            <button key={c} className={cn("segmented-btn", c === category && "segmented-btn-active")} onClick={() => setCategory(c)}>{c}</button>
          ))}
        </div>
      </div>

      <div className="split split-3-9" style={{ gap: 24, alignItems: "start" }}>
        {/* Catalog list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {filtered.map((tool: any) => (
            <button
              key={tool.id}
              className={cn("list-item", selected?.id === tool.id && "list-item-active")}
              onClick={() => focus("store-tool", tool)}
            >
              <div className="list-item-content">
                <div className="list-item-title">{tool.name}</div>
                <div className="list-item-sub">{tool.vendor}</div>
              </div>
              <StatusBadge value={tool.installState} />
            </button>
          ))}
        </div>

        {/* Detail + config */}
        {selected ? (
          <div className="split split-7-5" style={{ gap: 24 }}>
            <div>
              <div style={{ marginBottom: 16 }}>
                <div className="text-md font-semibold" style={{ marginBottom: 4 }}>{selected.name}</div>
                <div className="text-sm text-3" style={{ marginBottom: 8 }}>{selected.vendor} · {selected.category}</div>
                <div className="text-sm text-2" style={{ lineHeight: 1.55 }}>{selected.description}</div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="text-xs text-3" style={{ marginBottom: 6 }}>Compatibility</div>
                <TagRow values={selected.compatibility || []} />
              </div>

              <div>
                <div className="text-xs text-3" style={{ marginBottom: 6 }}>Install state</div>
                <StatusBadge value={selected.installState} />
                {" "}
                <StatusBadge value={selected.validationState} />
              </div>

              {selected.setupNotes && (
                <div style={{ marginTop: 16 }}>
                  <div className="text-xs text-3" style={{ marginBottom: 4 }}>Setup notes</div>
                  <div className="text-sm text-2" style={{ lineHeight: 1.55 }}>{selected.setupNotes}</div>
                </div>
              )}
            </div>

            {/* Credentials + actions */}
            <div>
              <div className="section-header" style={{ marginBottom: 12 }}>
                <span className="section-title">Configure</span>
              </div>

              {selected.credentialRequirements?.length > 0 ? (
                <div style={{ marginBottom: 16 }}>
                  {selected.credentialRequirements.map((field: string) => (
                    <div className="field-group" key={field}>
                      <label className="field-label">{field}</label>
                      <input
                        className="field field-sm"
                        type="password"
                        placeholder={selected.configuredCredentialHints?.[field]
                          ? `Stored (${selected.configuredCredentialHints[field]})`
                          : `Enter ${field}`}
                        value={creds[field] || ""}
                        onChange={e => setDraft(selected.id, field, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-3" style={{ marginBottom: 16 }}>No credentials required</div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Btn variant="primary" onClick={() => actions.installStoreTool(selected.id, creds, selected.credentialRequirements)}>
                  Install Tool
                </Btn>
                <Btn variant="secondary" onClick={() => actions.validateStoreTool(selected.id, creds, selected.credentialRequirements)}>
                  Validate
                </Btn>
                <Btn variant="secondary" onClick={() => actions.configureStoreTool(selected.id, creds)}>
                  Save Credentials
                </Btn>
                <Btn variant="ghost" onClick={() => actions.testStoreTool(selected.id, creds, selected.credentialRequirements)}>
                  Test Connection
                </Btn>
              </div>

              <div style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                <div className="text-xs text-3" style={{ marginBottom: 8 }}>Setup steps</div>
                {["1. Review compatibility", "2. Enter credentials", "3. Validate access", "4. Install to MCP"].map((step, i) => (
                  <div key={i} className="text-sm text-2" style={{ marginBottom: 4 }}>{step}</div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="empty"><span className="empty-text">Select a tool to configure</span></div>
        )}
      </div>
    </div>
  );
}

/* ─── Protocols ─── */

export function ProtocolsPage({ data, context, focus, actions }: PageProps) {
  const active = context?.type === "protocol" ? context.item : data.protocols[0];
  const online = data.protocols.filter((p: any) => p.state === "online").length;
  const warnings = data.protocols.filter((p: any) => p.state === "warning").length;

  return (
    <div>
      <div className="grid grid-4" style={{ marginBottom: 24 }}>
        <div className="metric"><div className="metric-value">{data.protocols.length}</div><div className="metric-label">Total</div></div>
        <div className="metric"><div className="metric-value">{online}</div><div className="metric-label">Online</div></div>
        <div className="metric"><div className="metric-value">{warnings}</div><div className="metric-label">Warnings</div></div>
        <div className="metric"><div className="metric-value">{data.protocols.length - online - warnings}</div><div className="metric-label">Standby</div></div>
      </div>

      <div className="split split-7-5">
        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {data.protocols.map((proto: any) => (
              <button
                key={proto.id}
                className={cn("list-item", active?.id === proto.id && "list-item-active")}
                onClick={() => focus("protocol", proto)}
              >
                <span className={cn("status-dot", dotTone(proto.state))} />
                <div className="list-item-content">
                  <div className="list-item-title">{proto.name}</div>
                  <div className="list-item-sub">{proto.configurationSummary}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="text-xs text-3">{proto.health}%</span>
                  <StatusBadge value={proto.state} />
                </div>
              </button>
            ))}
          </div>

          <div style={{ marginTop: 24 }}>
            <div className="section-header" style={{ marginBottom: 12 }}>
              <span className="section-title">Relationships</span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Protocol</th><th>Dependencies</th><th>Failures</th><th>Usage</th></tr>
                </thead>
                <tbody>
                  {data.protocols.map((p: any) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="text-2">{p.dependencies?.join(", ") || "—"}</td>
                      <td className="text-2">{p.recentFailures}</td>
                      <td className="text-2">{p.recentUsage}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {active && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div className="row" style={{ marginBottom: 6 }}>
                <span className={cn("status-dot", dotTone(active.state))} />
                <span className="text-md font-semibold">{active.name}</span>
                <StatusBadge value={active.state} />
              </div>
              <div className="text-sm text-3">{active.configurationSummary}</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "Health", value: `${active.health}%` },
                { label: "Throughput", value: active.throughput },
                { label: "Attached tools", value: active.attachedTools },
                { label: "Usage", value: active.recentUsage },
              ].map(f => (
                <div key={f.label}>
                  <div className="text-xs text-3">{f.label}</div>
                  <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
                </div>
              ))}
            </div>

            {active.relationships?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div className="text-xs text-3" style={{ marginBottom: 6 }}>Relationships</div>
                <TagRow values={active.relationships} />
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="primary" size="sm" onClick={() => actions.setProtocolState(active.id, "online")}>Set Online</Btn>
              <Btn variant="secondary" size="sm" onClick={() => actions.setProtocolState(active.id, "standby")}>Standby</Btn>
              <Btn variant="danger" size="sm" onClick={() => actions.setProtocolState(active.id, "warning")}>Flag Warning</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
