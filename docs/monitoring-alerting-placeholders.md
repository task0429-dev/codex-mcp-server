# Monitoring Alerting Placeholders

This system keeps Uptime Kuma as watchdog and applies controlled alerting from inventory priority.

## Alert policy
- P0: immediate alert routing enabled.
- P1: alert routing enabled (prefer delayed/grouped where provider supports it).
- P2: log-only by default, no notification routing.
- P3: silent (experimental/dev only).

## Credentials and placement
Use `monitoring/rex-monitor-provision.env` (copied from `.env.example`) and configure:
- `UPTIME_KUMA_URL`
- `UPTIME_KUMA_USERNAME`
- `UPTIME_KUMA_PASSWORD`
- `UPTIME_KUMA_TOKEN` (optional, only if 2FA is active)
- `REX_P0_NOTIFICATION_IDS` (comma-separated Kuma notification IDs)
- `REX_P1_NOTIFICATION_IDS` (comma-separated Kuma notification IDs)

Secrets must not be committed.

## Provider setup in Kuma
Create notification integrations in Kuma UI first, then assign resulting IDs to env.

### Telegram
- Create bot token + target chat ID.
- Add Telegram notification in Kuma UI.
- Put created notification ID in `REX_P0_NOTIFICATION_IDS` and/or `REX_P1_NOTIFICATION_IDS`.

### Discord
- Create inbound webhook URL per channel.
- Add Discord notification in Kuma UI.
- Route P0/P1 monitors by env ID list.

### Email
- Configure SMTP server, sender, and recipients.
- Add Email notification in Kuma UI.
- Route only business-critical P0/P1.

### Slack
- Configure Slack webhook.
- Add Slack notification in Kuma UI.
- Keep P1 grouped; avoid per-check chatter.

### Generic Webhook
- Add webhook integration in Kuma UI.
- Use for downstream incident tooling/escalation workflow.

## Anti-noise best practices
- Keep monitor intervals realistic for service criticality.
- Use heartbeat tolerance (`expected_interval * tolerance_missed_cycles`) to avoid false positives.
- Keep P2/P3 silent unless promoted by business impact.
- Prefer one incident channel per severity class rather than every channel for every event.
