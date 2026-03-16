import { useState } from "react";
import { Btn, StatusBadge, TagRow } from "./shell";
import { cn, formatRelative, dotTone, type PageProps } from "./types";

/* ─── Content ─── */

export function ContentPage({ data, context, focus }: PageProps) {
  const [query, setQuery] = useState("");
  const docs = data.docs?.items || [];
  const filtered = query.trim()
    ? docs.filter((d: any) => `${d.title} ${d.category} ${d.owner}`.toLowerCase().includes(query.toLowerCase()))
    : docs;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input className="field field-sm" style={{ width: 280 }} placeholder="Search content…" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        {filtered.map((doc: any) => (
          <button
            key={doc.id}
            className="list-item"
            onClick={() => focus("doc", doc)}
          >
            <div className="list-item-content">
              <div className="list-item-title">{doc.title}</div>
              <div className="list-item-sub">{doc.category} · {doc.owner}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="text-xs text-3">{formatRelative(doc.updatedAt)}</span>
              <StatusBadge value={doc.status} />
            </div>
          </button>
        ))}
        {filtered.length === 0 && <div className="empty"><span className="empty-text">No content found</span></div>}
      </div>
    </div>
  );
}

/* ─── Docs ─── */

export function DocsPage({ data, context, focus, actions }: PageProps) {
  const [query, setQuery] = useState("");
  const docs = data.docs?.items || [];
  const selected = context?.type === "doc" ? context.item : docs[0];

  const filtered = query.trim()
    ? docs.filter((d: any) => `${d.title} ${d.category} ${d.owner} ${(d.tags || []).join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    : docs;

  return (
    <div className="split" style={{ gridTemplateColumns: "280px 1fr", gap: 24 }}>
      <div>
        <div style={{ marginBottom: 12 }}>
          <input className="field field-sm" style={{ width: "100%" }} placeholder="Search docs…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {filtered.map((doc: any) => (
            <button
              key={doc.id}
              className={cn("list-item", selected?.id === doc.id && "list-item-active")}
              onClick={() => focus("doc", doc)}
            >
              <div className="list-item-content">
                <div className="list-item-title">{doc.title}</div>
                <div className="list-item-sub">{doc.category}</div>
              </div>
              <StatusBadge value={doc.status} />
            </button>
          ))}
          {filtered.length === 0 && <div className="empty"><span className="empty-text">No docs found</span></div>}
        </div>
      </div>

      {selected ? (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="text-lg font-semibold">{selected.title}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn variant="secondary" size="sm" onClick={() => actions.openDocSurface(selected.title, "open")}>Open</Btn>
              </div>
            </div>
            <div className="text-sm text-3">{selected.category} · {selected.owner} · {formatRelative(selected.updatedAt)}</div>
          </div>

          {selected.tags?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <TagRow values={selected.tags} />
            </div>
          )}

          {selected.sections?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div className="text-xs text-3" style={{ marginBottom: 8 }}>Sections</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {selected.sections.map((sec: string) => (
                  <div key={sec} className="text-sm text-2" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>{sec}</div>
                ))}
              </div>
            </div>
          )}

          {selected.preview && (
            <div>
              <div className="text-xs text-3" style={{ marginBottom: 8 }}>Preview</div>
              <div className="text-sm text-2" style={{ lineHeight: 1.65 }}>{selected.preview}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a document</span></div>
      )}
    </div>
  );
}

/* ─── Memories ─── */

export function MemoriesPage({ data, context, focus, actions }: PageProps) {
  const vaults = data.memory?.vaults || [];
  const selected = context?.type === "memory" ? context.item : vaults[0];
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="split" style={{ gridTemplateColumns: "280px 1fr", gap: 24 }}>
      <div>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Memory Vaults</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {vaults.map((vault: any) => (
            <button
              key={vault.id}
              className={cn("list-item", selected?.id === vault.id && "list-item-active")}
              onClick={() => focus("memory", vault)}
            >
              <span className={cn("status-dot", dotTone(vault.status))} />
              <div className="list-item-content">
                <div className="list-item-title">{vault.agent}</div>
                <div className="list-item-sub">{vault.files} files · {vault.footprintMb}MB</div>
              </div>
              <StatusBadge value={vault.status} />
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={cn("status-dot", dotTone(selected.status))} />
              <span className="text-lg font-semibold">{selected.agent} Memory</span>
              <StatusBadge value={selected.status} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
            {[
              { label: "Files", value: selected.files },
              { label: "Footprint", value: `${selected.footprintMb}MB` },
              { label: "Status", value: selected.status },
            ].map(f => (
              <div className="metric" key={f.label}>
                <div className="metric-value">{f.value}</div>
                <div className="metric-label">{f.label}</div>
              </div>
            ))}
          </div>

          {selected.sampleQueries?.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div className="text-xs text-3" style={{ marginBottom: 8 }}>Sample queries</div>
              <TagRow values={selected.sampleQueries} />
            </div>
          )}

          <div>
            <div className="text-sm font-semibold" style={{ marginBottom: 8 }}>Search Memory</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="field field-sm" style={{ flex: 1 }} placeholder="Ask the memory vault…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <Btn variant="primary" size="sm" onClick={() => { actions.searchMemory(searchQuery); setSearchQuery(""); }}>Search</Btn>
            </div>
          </div>
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a memory vault</span></div>
      )}
    </div>
  );
}

/* ─── Office ─── */

export function OfficePage({ data, context, focus }: PageProps) {
  const zones = data.office?.zones || [];
  const selected = context?.type === "office" ? context.item : zones[0];

  return (
    <div className="split" style={{ gridTemplateColumns: "280px 1fr", gap: 24 }}>
      <div>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Office Zones</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {zones.map((zone: any) => (
            <button
              key={zone.id}
              className={cn("list-item", selected?.id === zone.id && "list-item-active")}
              onClick={() => focus("office", zone)}
            >
              <span className={cn("status-dot", dotTone(zone.state))} />
              <div className="list-item-content">
                <div className="list-item-title">{zone.name}</div>
                <div className="list-item-sub">{zone.lead}</div>
              </div>
              <StatusBadge value={zone.state} />
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={cn("status-dot", dotTone(selected.state))} />
              <span className="text-lg font-semibold">{selected.name}</span>
              <StatusBadge value={selected.state} />
            </div>
            <div className="text-sm text-2" style={{ lineHeight: 1.6 }}>{selected.summary}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Lead", value: selected.lead },
              { label: "Route", value: selected.route },
              { label: "Priority", value: selected.priority },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-3">{f.label}</div>
                <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
              </div>
            ))}
          </div>

          {selected.linkedPages?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="text-xs text-3" style={{ marginBottom: 6 }}>Linked pages</div>
              <TagRow values={selected.linkedPages} />
            </div>
          )}
          {selected.linkedEntities?.length > 0 && (
            <div>
              <div className="text-xs text-3" style={{ marginBottom: 6 }}>Linked entities</div>
              <TagRow values={selected.linkedEntities} />
            </div>
          )}
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a zone</span></div>
      )}
    </div>
  );
}

/* ─── Team ─── */

export function TeamPage({ data, context, focus }: PageProps) {
  const units = data.team?.units || [];
  const selected = context?.type === "team" ? context.item : units[0];

  return (
    <div className="split" style={{ gridTemplateColumns: "280px 1fr", gap: 24 }}>
      <div>
        <div className="section-header" style={{ marginBottom: 12 }}>
          <span className="section-title">Teams</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {units.map((unit: any) => (
            <button
              key={unit.id}
              className={cn("list-item", selected?.id === unit.id && "list-item-active")}
              onClick={() => focus("team", unit)}
            >
              <span className={cn("status-dot", dotTone(unit.status))} />
              <div className="list-item-content">
                <div className="list-item-title">{unit.name}</div>
                <div className="list-item-sub">{unit.lead} · {unit.members?.length || 0} members</div>
              </div>
              <StatusBadge value={unit.status} />
            </button>
          ))}
        </div>
      </div>

      {selected ? (
        <div>
          <div style={{ marginBottom: 20 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={cn("status-dot", dotTone(selected.status))} />
              <span className="text-lg font-semibold">{selected.name}</span>
              <StatusBadge value={selected.status} />
            </div>
            <div className="text-sm text-2">{selected.focus}</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
            {[
              { label: "Lead", value: selected.lead },
              { label: "Members", value: String(selected.members?.length || 0) },
              { label: "State", value: selected.status },
            ].map(f => (
              <div key={f.label}>
                <div className="text-xs text-3">{f.label}</div>
                <div className="text-sm text-1 font-medium mt-4">{f.value}</div>
              </div>
            ))}
          </div>

          {selected.members?.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div className="text-xs text-3" style={{ marginBottom: 8 }}>Members</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {selected.members.map((member: string) => (
                  <div key={member} className="text-sm text-2" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>{member}</div>
                ))}
              </div>
            </div>
          )}

          {selected.surfaces?.length > 0 && (
            <div>
              <div className="text-xs text-3" style={{ marginBottom: 6 }}>Surfaces</div>
              <TagRow values={selected.surfaces} />
            </div>
          )}
        </div>
      ) : (
        <div className="empty"><span className="empty-text">Select a team</span></div>
      )}
    </div>
  );
}
