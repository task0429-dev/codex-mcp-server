# ChatGPT Remote MCP Connection Guide

This document explains how to connect your local MCP server to ChatGPT in Developer Mode for remote use.

## Prerequisites

- **This is FUTURE setup:** The local Codex stdio mode works immediately. ChatGPT remote mode requires additional deployment.
- **ChatGPT Developer Mode:** Must be enabled in your ChatGPT account.
- **HTTPS endpoint:** Your MCP server must be reachable over HTTPS.
- **Public endpoint or reverse proxy:** The MCP server must have a public or accessible domain/IP.

## Architecture Overview

```
ChatGPT (Cloud)
    ↓ (HTTPS + MCP protocol)
Your Reverse Proxy / Load Balancer (NGINX, IIS, etc.)
    ↓
MCP HTTP Server (Node.js, index-http.js)
    ↓
Local Agent Services (OpenClaw ecosystem)
```

## Deployment Steps

### Step 1: Build the HTTP Server

```powershell
cd C:\Users\offic\Documents\Codex\mcp-server
npm run build
```

### Step 2: Run the HTTP Server (Development Testing)

For local testing before deployment:

```powershell
npm run start:http
# Server listens on http://localhost:3000
```

Verify it works:
```powershell
# In another terminal
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"..."}

curl http://localhost:3000/api/tools
# Should list all 8 agents tools
```

### Step 3: Set Up HTTPS (Required for ChatGPT)

ChatGPT requires HTTPS for security. Choose one:

#### Option A: IIS Reverse Proxy (Windows-native)

See `deploy/iis-example.md` for detailed Windows IIS setup.

#### Option B: NGINX Reverse Proxy

Example NGINX config:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

#### Option C: Azure App Service or AWS EC2

If using cloud providers, configure them to:
- Forward HTTPS traffic to `localhost:3000`
- Maintain `/api/tools` and `/api/tools/:toolName` routes

### Step 4: Deploy and Run the Server

In production, use a process manager like PM2 or Windows Services:

```powershell
# Using PM2 (if installed globally)
pm2 start dist/index-http.js --name "mcp-server" --env production

# Or use nssm for Windows Service (https://nssm.cc/)
nssm install MCPServer "C:\Program Files\nodejs\node.exe" "C:\path\to\dist\index-http.js"
nssm set MCPServer AppEnvironmentExtra NODE_ENV=production
nssm start MCPServer
```

### Step 5: Configure ChatGPT

1. Go to ChatGPT Settings → Developer Mode → Custom MCP
2. Add a new server:
   - **Name:** CodexAgents
   - **URL:** `https://your-domain.com` (or `https://your-ip:3000` if using direct HTTPS)
   - **Transport:** REST/HTTP (or SSE if ChatGPT supports it)

3. Add authentication if needed:
   - Header: `Authorization: Bearer YOUR_API_KEY`
   - Or query param: `?key=YOUR_API_KEY`

4. Click "Connect" and test with a simple tool call.

### Step 6: Test the Connection

In ChatGPT, try:

```
Use the codex agent tools. Call list_agents and show me the available agents.
```

ChatGPT should invoke your HTTP endpoint and return the agent list.

## Security Considerations

⚠️ **IMPORTANT for production:**

1. **Authentication:**
   - Add API key validation in `src/transports/http.ts`
   - Only accept requests with valid credentials

   Example:
   ```typescript
   const apiKey = req.headers["authorization"]?.split(" ")[1];
   if (!apiKey || apiKey !== process.env.MCP_API_KEY) {
     return res.status(401).json({ error: "Unauthorized" });
   }
   ```

2. **Rate Limiting:**
   - Add rate limiting to prevent abuse
   - Use `express-rate-limit` package

3. **CORS:**
   - Currently allows all origins (`cors({ origin: "*" })`)
   - Restrict to ChatGPT domains in production:
   ```typescript
   cors({
     origin: ["https://chat.openai.com", "https://chatgpt.com"]
   })
   ```

4. **Logging:**
   - Log all tool invocations for audit
   - Store logs in secure location

5. **Tool Restrictions:**
   - In production, consider disabling high-risk tools or requiring additional approval
   - The `restart_agent` and `unlock_session` tools are already allowlist-protected

## Monitoring and Troubleshooting

### Check Server Health

```powershell
# Check if server is running
curl https://your-domain.com/health

# List available tools
curl https://your-domain.com/api/tools

# Invoke a specific tool
curl -X POST https://your-domain.com/api/tools/list_agents \
  -H "Content-Type: application/json" \
  -d '{"arguments":{}}'
```

### View Logs

Logs are written to `./data/logs/` by default.

```powershell
Get-Content C:\path\to\mcp-server\data\logs\global.log -Tail 50
Get-Content C:\path\to\mcp-server\data\logs\Abdi.log -Tail 50
```

### Common Issues

**Issue:** "Connection refused" from ChatGPT
- Verify HTTPS endpoint is reachable: `curl https://your-domain.com/health`
- Check firewall rules allow inbound HTTPS

**Issue:** "CORS error"
- ChatGPT must access from its domain
- Update CORS allowlist to include ChatGPT's IP/domain

**Issue:** "Tool invocation timeout"
- Increase `HTTP_PORT` timeout in `.env`
- Check if agent service is responding

## Next Steps

1. ✅ Local Codex stdio mode is ready now
2. 📋 Choose HTTPS deployment method (IIS, NGINX, or cloud)
3. 🚀 Deploy HTTP server with HTTPS
4. 🔐 Add authentication and rate limiting
5. 📊 Monitor and log all tool invocations
6. 🔗 Configure ChatGPT Developer Mode to point to your endpoint

For more details on Windows-specific deployment, see `iis-example.md`.
