# Rex Monitoring Container

Self-contained Docker stack for the monitoring system in this folder. It runs:

- `uptime-kuma` for monitor storage and UI
- `nginx-theme` to serve the themed UI wrapper
- `rex-monitor-ops` to provision monitors and keep heartbeat sync running 24/7
- `monitoring-public-c2` as an optional dedicated Cloudflare public tunnel container

The ops daemon now runs from its built image instead of a live source bind mount, which makes it much more stable as an always-on service.

## Persistent data

Uptime Kuma data is stored in:

- `docker-data/uptime-kuma`

Generated monitoring artifacts remain in this folder, including:

- `docker-data/ops/rex-heartbeat-map.generated.json`
- `docker-data/ops/rex-monitoring-daemon-status.json`

## Ports

- `3011` -> native Uptime Kuma
- `3012` -> themed nginx front end

## Endpoints

- local native UI: `http://localhost:3011`
- local themed UI: `http://localhost:3012`
- public C2 tunnel: available when TASK starts the `public-c2` profile and checks the tunnel logs for the issued URL

## Start

```powershell
docker compose up -d --build
```

## Start with public C2

```powershell
docker compose --profile public-c2 up -d --build
```

## Public C2 URL

```powershell
docker compose logs monitoring-public-c2
```

Cloudflare quick tunnels print a public `trycloudflare.com` URL in the logs. That URL stays available while the tunnel container stays running.

## Update after code changes

```powershell
docker compose up -d --build rex-monitor-ops
```

## Stop

```powershell
docker compose down
```

## Logs

```powershell
docker compose logs -f rex-monitor-ops
docker compose logs -f uptime-kuma
docker compose logs -f monitoring-public-c2
docker compose ps
```

## 24/7 behavior

All services use `restart: unless-stopped`, so Docker will bring them back after crashes or host restarts as long as Docker Desktop itself starts on boot.

`rex-monitor-ops` also exposes a Docker healthcheck driven by `docker-data/ops/rex-monitoring-daemon-status.json`, so Compose can show when the daemon stops syncing or heartbeats go stale.

The `monitoring-public-c2` container is separate from the MCP server tunnel, so the monitoring system has its own isolated public path.

## Configuration

Update `rex-monitoring-stack.env` before first start:

- `UPTIME_KUMA_USERNAME`
- `UPTIME_KUMA_PASSWORD`
- `UPTIME_KUMA_PUBLIC_URL`
- optional notification IDs

If you want the themed interface to be the main entrypoint, use `http://localhost:3012`.
