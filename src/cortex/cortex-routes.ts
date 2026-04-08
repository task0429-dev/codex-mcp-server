/**
 * CORTEX ROUTES — Task Enterprise LLC
 * Mount onto Express app in http.ts
 *
 * Usage: import { mountCortexRoutes } from "../cortex/cortex-routes";
 *        mountCortexRoutes(app);
 */

import type { Express, Request, Response } from "express";
import { cortexSearch, cortexStats, cortexTimeline, cortexFacets, cortexRecent } from "./cortex-db";
import { logger } from "../core/logger";

// SSE clients for live feed
const sseClients = new Set<Response>();

// Push new records to all SSE clients (called by ingestion hook if available)
export function cortexPushLive(records: any[]) {
  if (!sseClients.size) return;
  const payload = `data: ${JSON.stringify(records)}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch {}
  }
}

export function mountCortexRoutes(app: Express) {

  // ── GET /api/cortex/search ──────────────────────────────────────────────────
  // Query params: q, agent, source_type, event_type, level, tool_name,
  //               from (ms), to (ms), date_preset, session_id, limit, offset
  app.get("/api/cortex/search", (req: Request, res: Response) => {
    try {
      const filters = {
        q:           String(req.query.q           ?? "").trim() || undefined,
        agent:       String(req.query.agent       ?? "").trim() || undefined,
        source_type: String(req.query.source_type ?? "").trim() || undefined,
        event_type:  String(req.query.event_type  ?? "").trim() || undefined,
        level:       String(req.query.level       ?? "").trim() || undefined,
        tool_name:   String(req.query.tool_name   ?? "").trim() || undefined,
        date_preset: String(req.query.date_preset ?? "").trim() || undefined,
        session_id:  String(req.query.session_id  ?? "").trim() || undefined,
        from:        req.query.from  ? Number(req.query.from)   : undefined,
        to:          req.query.to    ? Number(req.query.to)     : undefined,
        limit:       req.query.limit ? Number(req.query.limit)  : 50,
        offset:      req.query.offset ? Number(req.query.offset) : 0,
      };

      const result = cortexSearch(filters);
      res.json({ ok: true, ...result });
    } catch (e: any) {
      logger.warn("cortex_search_route_error", { message: e?.message });
      res.status(500).json({ ok: false, error: e?.message ?? "Search failed" });
    }
  });

  // ── GET /api/cortex/stats ───────────────────────────────────────────────────
  app.get("/api/cortex/stats", (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, stats: cortexStats() });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message });
    }
  });

  // ── GET /api/cortex/timeline ────────────────────────────────────────────────
  // Query: agent, from (ms), to (ms), limit
  app.get("/api/cortex/timeline", (req: Request, res: Response) => {
    try {
      const agent = String(req.query.agent ?? "").trim() || undefined;
      const from  = req.query.from  ? Number(req.query.from)  : undefined;
      const to    = req.query.to    ? Number(req.query.to)    : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 100;
      const records = cortexTimeline(agent, from, to, limit);
      res.json({ ok: true, records, count: records.length });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message });
    }
  });

  // ── GET /api/cortex/facets ──────────────────────────────────────────────────
  app.get("/api/cortex/facets", (_req: Request, res: Response) => {
    try {
      res.json({ ok: true, facets: cortexFacets() });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message });
    }
  });

  // ── GET /api/cortex/stream ──────────────────────────────────────────────────
  // SSE — emits new records as they arrive (polled every 2s from daemon)
  app.get("/api/cortex/stream", (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(": connected\n\n");

    sseClients.add(res);

    // Poll for new records since client connected
    let lastSeen = Date.now();
    const interval = setInterval(() => {
      try {
        const records = cortexRecent(lastSeen, 20);
        if (records.length) {
          lastSeen = Math.max(...records.map(r => r.ingested_at));
          res.write(`data: ${JSON.stringify(records)}\n\n`);
        }
      } catch {}
    }, 2000);

    // Heartbeat ping
    const ping = setInterval(() => {
      try { res.write(": ping\n\n"); } catch {}
    }, 25000);

    req.on("close", () => {
      clearInterval(interval);
      clearInterval(ping);
      sseClients.delete(res);
    });
  });

  logger.info("cortex_routes_mounted", { routes: ["/api/cortex/search", "/api/cortex/stats", "/api/cortex/timeline", "/api/cortex/facets", "/api/cortex/stream"] });
}
