# Windows IIS Reverse Proxy Setup for MCP Server

This guide sets up IIS on Windows to reverse-proxy the MCP HTTP server and provide HTTPS.

## Prerequisites

- Windows Server 2012 R2+ or Windows 10/11 with IIS
- IIS Application Request Routing (ARR)
- IIS URL Rewrite module
- Valid SSL certificate (Let's Encrypt, self-signed, or commercial)

## Installation Steps

### Step 1: Enable IIS Modules

In PowerShell (as Administrator):

```powershell
# Enable Application Request Routing (ARR)
# Download from: https://www.iis.net/downloads/microsoft/application-request-routing

# Or use Windows Features dialog:
# Win + R → optionalfeatures.exe
# Enable: Internet Information Services
#   → World Wide Web Services
#       → Application Development Features → ASP.NET 4.x
#       → Common HTTP Features
#   → Health and Diagnostics
```

### Step 2: Create IIS Application Pool and Website

```powershell
# Open IIS Manager
iisreset /start

# In IIS Manager GUI (inetmgr.exe):
# 1. Right-click "Application Pools" → Add Application Pool
#    Name: MCPServerPool
#    .NET version: No Managed Code
#    Managed Pipeline Mode: Integrated
#    (OK)

# 2. Right-click "Sites" → Add Website
#    Site name: mcp-server
#    Application pool: MCPServerPool
#    Physical path: C:\iis\mcp-server (or wherever)
#    Host name: your-domain.com (or leave blank for any IP)
#    Port: 80 (for HTTP redirect setup)
#    (OK)
```

### Step 3: Add SSL Certificate

```powershell
# In IIS Manager:
# 1. Select your site (mcp-server)
# 2. Click "Bindings" (right panel)
# 3. Add binding:
#    Type: https
#    Port: 443
#    Host name: your-domain.com
#    SSL certificate: (select your certificate)
#    (OK)

# 4. You can also use PowerShell for automated setup:
# New-WebBinding -Name "mcp-server" -Protocol https -Port 443 -HostHeader "your-domain.com" -SslFlags 0
```

### Step 4: Configure URL Rewrite Rules

In IIS Manager:

1. **Select your site (mcp-server)**
2. **Double-click "URL Rewrite"**
3. **Click "Add Rule(s)..." → Reverse Proxy**
4. **Configure:**
   - Inbound rule name: Reverse Proxy to localhost:3000
   - Server address: localhost:3000
   - Leave other options as default
   - (OK)

This creates a rule like:

```xml
<rule name="Reverse Proxy to MCP" stopProcessing="true">
    <match url="(.*)" />
    <conditions>
        <add input="{HTTPS}" pattern="^on$" />
    </conditions>
    <action type="Rewrite" url="http://localhost:3000/{R:1}" />
</rule>
```

### Step 5: Verify Configuration

Check the web.config file created automatically:

```powershell
Get-Content "C:\iis\mcp-server\web.config"
```

Should contain URL Rewrite rules pointing to `localhost:3000`.

### Step 6: Ensure HTTP → HTTPS Redirect

Add a rewrite rule to force HTTPS:

In IIS Manager, same URL Rewrite module:
1. **Click "Add Rule(s)..." → Enforce HTTPS**
2. **Configure:**
   - Redirect all HTTP to HTTPS: Yes
   - (OK)

Or manually add to web.config:

```xml
<rule name="HTTP to HTTPS" stopProcessing="true">
    <match url="(.*)" />
    <conditions>
        <add input="{HTTPS}" pattern="^OFF$" />
    </conditions>
    <action type="Redirect" url="https://{HTTP_HOST}/{R:1}" redirectType="Permanent" />
</rule>
```

## Running the MCP Server Behind IIS

### Option A: Console App (for testing/monitoring)

```powershell
cd C:\Users\offic\Documents\Codex\mcp-server
npm run start:http
# Server runs on http://localhost:3000
```

IIS will proxy all `https://your-domain.com/*` requests to `http://localhost:3000/*`.

### Option B: Windows Service (for production)

Use NSSM (Non-Sucking Service Manager) to run Node as a Windows service:

```powershell
# Download NSSM: https://nssm.cc/download

# Install as service
nssm install MCPServer "C:\Program Files\nodejs\node.exe" `
  "C:\Users\offic\Documents\Codex\mcp-server\dist\index-http.js"

# Set environment
nssm set MCPServer AppEnvironmentExtra NODE_ENV=production
nssm set MCPServer AppDirectory "C:\Users\offic\Documents\Codex\mcp-server"

# Start service
nssm start MCPServer

# View status
Get-Service MCPServer | Select-Object Status, DisplayName
```

## Testing

### Local Test

```powershell
# Direct to Node server
curl http://localhost:3000/health

# Through IIS (HTTPS)
curl https://localhost/health -SkipCertificateCheck  # self-signed only

# Or from your browser:
# https://your-domain.com/health
# https://your-domain.com/api/tools
```

### Detailed Diagnostics

```powershell
# Check if port 3000 is listening
netstat -ano | findstr :3000

# Check IIS logs
Get-Content "C:\inetpub\logs\LogFiles\W3SVC1\*.log" -Tail 20
```

## Performance Tuning

In IIS Manager, select your Application Pool, then **Advanced Settings:**

- **Maximum Worker Processes:** 1 (unless you need multi-core)
- **Queue Length:** 1000
- **Idle Time-out:** 0 (never unload)
- **Periodic Restart Time:** 0 (no periodic restart)
- **Start Mode:** AlwaysRunning (autostart)

## Security Best Practices

1. **Certificate Management:**
   - Use Let's Encrypt for free certs (renew every 90 days)
   - Or enterprise certificate authority

2. **Authentication:**
   - If exposing to internet, add API key validation
   - Or use Windows Authentication + IP whitelist

3. **Logging:**
   - Enable IIS request logging (default in IIS)
   - Forward logs to central server for audit

4. **Firewall Rules:**
   - Only allow HTTPS (443) from trusted IPs
   - Block direct 3000 port access

5. **Rate Limiting:**
   - Add rate-limit rule in URL Rewrite:
   ```xml
   <rule name="Rate Limit" stopProcessing="true">
       <match url=".*" />
       <conditions>
           <add input="{RATE_LIMIT_EXCEEDED}" pattern="true" />
       </conditions>
       <action type="AbortRequest" />
   </rule>
   ```

## Troubleshooting

**502 Bad Gateway error:**
- Ensure Node server is running on localhost:3000
- Check firewall blocks on 3000 port
- View IIS logs for details

**SSL Certificate errors:**
- Ensure cert CN matches your domain
- For self-signed, add to trusted CA store or skip verification

**Slow response times:**
- Check CPU/memory of Node process
- Increase Application Pool worker processes
- Check network latency to Node server

## References

- [IIS Application Request Routing](https://www.iis.net/downloads/microsoft/application-request-routing)
- [IIS URL Rewrite Module](https://www.iis.net/downloads/microsoft/url-rewrite)
- [NSSM Service Manager](https://nssm.cc/)
