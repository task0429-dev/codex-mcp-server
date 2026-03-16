import fs from "fs";
import os from "os";
import path from "path";
import { z } from "zod";
import { hubConfig } from "../../config/hub-config";
import { runSafeCommand } from "../../services/command-service";
import { screenStreamService } from "../../services/screen-stream-service";
import { ToolDefinition } from "../../types/tool";
import { ToolError } from "../../utils/errors";
import { ensurePathAllowed, getPathKind } from "../../utils/paths";

const group = "desktop";
const DEFAULT_TIMEOUT_MS = 30_000;

const OpenUrlSchema = z.object({
  url: z.string().min(1).describe("URL or hostname to open in the default browser."),
});

const LaunchAppSchema = z.object({
  app: z.string().min(1).describe("App alias, executable name, shortcut, or absolute path."),
  args: z.array(z.string()).optional().default([]).describe("Optional launch arguments."),
  cwd: z.string().optional().describe("Optional working directory."),
  wait_for_exit: z.boolean().optional().default(false).describe("Wait for the launched process to exit."),
  timeout_ms: z.number().int().min(1).max(300_000).optional(),
});

const OpenPathSchema = z.object({
  path: z.string().min(1).describe("Local file or folder path to open."),
});

const MoveMouseSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
});

const ClickMouseSchema = z.object({
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  button: z.enum(["left", "right", "middle"]).optional().default("left"),
  clicks: z.number().int().min(1).max(3).optional().default(1),
});

const TypeTextSchema = z.object({
  text: z.string().min(1),
  press_enter: z.boolean().optional().default(false),
});

const SendKeysSchema = z.object({
  sequence: z.string().min(1).describe("Windows SendKeys sequence such as ^l, %{TAB}, or {ENTER}."),
});

const ScrollMouseSchema = z.object({
  amount: z.number().int().min(1).max(20).optional().default(3).describe("Number of wheel notches to scroll."),
  direction: z.enum(["up", "down"]).optional().default("down"),
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
});

const GetScreenBase64Schema = z.object({
  scale: z.number().int().min(320).max(3840).optional().default(1280).describe("Output width in px (-1 = full resolution)."),
  quality: z.number().int().min(1).max(100).optional().default(75).describe("JPEG quality 1-100."),
  region: z
    .object({
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      width: z.number().int().min(1),
      height: z.number().int().min(1),
    })
    .optional()
    .describe("Optional capture region. Omit for full primary screen."),
});

const StreamScreenSchema = z.object({
  action: z.enum(["start", "stop", "status"]).describe("start — begin streaming; stop — end streaming; status — return current state."),
  fps: z.number().int().min(1).max(30).optional().default(5).describe("Frames per second (start only)."),
  scale: z.number().int().min(320).max(1920).optional().default(1280).describe("Output width in px (start only)."),
  quality: z.number().int().min(1).max(31).optional().default(5).describe("ffmpeg JPEG quality 1-31 lower=better (start only)."),
});

const CaptureScreenSchema = z
  .object({
    path: z.string().optional().describe("Optional screenshot output path. Defaults to a PNG in the temp folder."),
    x: z.number().int().min(0).optional(),
    y: z.number().int().min(0).optional(),
    width: z.number().int().min(1).optional(),
    height: z.number().int().min(1).optional(),
    open_after_capture: z.boolean().optional().default(false),
  })
  .refine(
    (input) =>
      (!input.x && !input.y && !input.width && !input.height) ||
      (input.x !== undefined && input.y !== undefined && input.width !== undefined && input.height !== undefined),
    {
      message: "x, y, width, and height must be provided together when capturing a region.",
    }
  );

const FocusWindowSchema = z
  .object({
    title_contains: z.string().min(1).optional(),
    process_name: z.string().min(1).optional(),
    pid: z.number().int().positive().optional(),
  })
  .refine((input) => Boolean(input.pid || input.title_contains || input.process_name), {
    message: "Provide pid, title_contains, or process_name to choose a window.",
  });

function assertWindowsHost() {
  // Allow execution if a Windows host relay is configured (Docker/Linux deployments)
  if (process.platform !== "win32" && !process.env.DESKTOP_RELAY_URL) {
    throw new ToolError(
      "Desktop automation requires a Windows host. Set DESKTOP_RELAY_URL=http://host.docker.internal:3099 and run relay/relay.js on your Windows machine.",
      { code: "disabled", statusCode: 501 }
    );
  }
}

function expandUserInput(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return trimmed;
  }

  const homeExpanded =
    trimmed === "~" ? os.homedir() : trimmed.startsWith(`~${path.sep}`) || trimmed.startsWith("~/") ? path.join(os.homedir(), trimmed.slice(2)) : trimmed;

  return homeExpanded.replace(/%([^%]+)%/g, (_match, envName: string) => process.env[envName] || `%${envName}%`);
}

function escapePowerShellString(value: string): string {
  return value.replace(/'/g, "''");
}

function normalizeUrl(inputUrl: string): string {
  const trimmed = inputUrl.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;

  try {
    parsed = new URL(candidate);
  } catch {
    throw new ToolError(`Invalid URL: ${inputUrl}`, {
      code: "bad_request",
      statusCode: 400,
    });
  }

  const protocol = parsed.protocol.replace(/:$/, "").toLowerCase();
  if (!hubConfig.desktop.allowedProtocols.includes(protocol)) {
    throw new ToolError(`URL protocol is not allowed: ${protocol}`, {
      code: "permission_denied",
      statusCode: 403,
      details: { allowedProtocols: hubConfig.desktop.allowedProtocols },
    });
  }

  return parsed.toString();
}

function normalizeLocalPath(rawPath: string): string {
  return path.resolve(expandUserInput(rawPath));
}

function resolveLaunchTarget(rawApp: string): { target: string; source: "alias" | "path" | "direct"; resolvedPath?: string } {
  const trimmed = rawApp.trim();
  const aliasTarget = hubConfig.desktop.appAliases[trimmed.toLowerCase()];
  if (aliasTarget) {
    return { target: aliasTarget, source: "alias" };
  }

  const expanded = expandUserInput(trimmed);
  if (path.isAbsolute(expanded)) {
    const resolvedPath = path.resolve(expanded);
    ensurePathAllowed(resolvedPath, hubConfig.desktop.allowedAppRoots, hubConfig.filesystem.deniedPaths);

    if (!fs.existsSync(resolvedPath)) {
      throw new ToolError(`App path not found: ${resolvedPath}`, {
        code: "not_found",
        statusCode: 404,
      });
    }

    return { target: resolvedPath, source: "path", resolvedPath };
  }

  return { target: trimmed, source: "direct" };
}

function buildStartProcessScript(options: {
  target: string;
  args?: string[];
  workingDirectory?: string;
  waitForExit?: boolean;
}) {
  const argsJson = JSON.stringify(options.args || []);

  return `
$ErrorActionPreference = 'Stop'
$target = '${escapePowerShellString(options.target)}'
$argsJson = '${escapePowerShellString(argsJson)}'
$workingDirectory = '${escapePowerShellString(options.workingDirectory || "")}'
$waitForExit = ${options.waitForExit ? "$true" : "$false"}
$argumentList = @()

if ($argsJson -and $argsJson -ne '[]') {
  $parsedArgs = ConvertFrom-Json -InputObject $argsJson
  if ($parsedArgs -is [System.Array]) {
    $argumentList = [string[]]$parsedArgs
  } elseif ($null -ne $parsedArgs) {
    $argumentList = @([string]$parsedArgs)
  }
}

$startArgs = @{
  FilePath = $target
  PassThru = $true
}

if ($argumentList.Count -gt 0) {
  $startArgs.ArgumentList = $argumentList
}

if ($workingDirectory) {
  $startArgs.WorkingDirectory = $workingDirectory
}

if ($waitForExit) {
  $startArgs.Wait = $true
}

$process = Start-Process @startArgs

[pscustomobject]@{
  target = $target
  pid = $process.Id
  process_name = $process.ProcessName
  has_exited = $process.HasExited
  exit_code = if ($process.HasExited) { $process.ExitCode } else { $null }
} | ConvertTo-Json -Compress
`.trim();
}

function buildOpenPathScript(targetPath: string) {
  return `
$ErrorActionPreference = 'Stop'
$target = '${escapePowerShellString(targetPath)}'
Invoke-Item -LiteralPath $target
[pscustomobject]@{
  target = $target
  opened = $true
} | ConvertTo-Json -Compress
`.trim();
}

function buildGetScreenStateScript() {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$cursor = [System.Windows.Forms.Cursor]::Position
$screens = [System.Windows.Forms.Screen]::AllScreens | ForEach-Object {
  [pscustomobject]@{
    device_name = $_.DeviceName
    primary = $_.Primary
    x = $_.Bounds.X
    y = $_.Bounds.Y
    width = $_.Bounds.Width
    height = $_.Bounds.Height
    working_area = [pscustomobject]@{
      x = $_.WorkingArea.X
      y = $_.WorkingArea.Y
      width = $_.WorkingArea.Width
      height = $_.WorkingArea.Height
    }
  }
}
[pscustomobject]@{
  cursor = [pscustomobject]@{
    x = $cursor.X
    y = $cursor.Y
  }
  screens = $screens
} | ConvertTo-Json -Compress -Depth 6
`.trim();
}

function buildMoveMouseScript(x: number, y: number) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})
$cursor = [System.Windows.Forms.Cursor]::Position
[pscustomobject]@{
  x = $cursor.X
  y = $cursor.Y
} | ConvertTo-Json -Compress
`.trim();
}

function buildClickMouseScript(input: z.infer<typeof ClickMouseSchema>) {
  const moveScript =
    input.x !== undefined && input.y !== undefined
      ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${input.x}, ${input.y})
Start-Sleep -Milliseconds 50`
      : "";

  const downFlag = input.button === "right" ? "0x0008" : input.button === "middle" ? "0x0020" : "0x0002";
  const upFlag = input.button === "right" ? "0x0010" : input.button === "middle" ? "0x0040" : "0x0004";

  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CodexMouse {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
${moveScript}
for ($i = 0; $i -lt ${input.clicks}; $i++) {
  [CodexMouse]::mouse_event(${downFlag}, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [CodexMouse]::mouse_event(${upFlag}, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 70
}
$cursor = [System.Windows.Forms.Cursor]::Position
[pscustomobject]@{
  x = $cursor.X
  y = $cursor.Y
  button = '${input.button}'
  clicks = ${input.clicks}
} | ConvertTo-Json -Compress
`.trim();
}

function buildTypeTextScript(text: string, pressEnter: boolean) {
  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
$text = '${escapePowerShellString(text)}'
$hadText = [System.Windows.Forms.Clipboard]::ContainsText()
$previousText = if ($hadText) { [System.Windows.Forms.Clipboard]::GetText() } else { $null }
[System.Windows.Forms.Clipboard]::SetText($text)
$wshell = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 80
$wshell.SendKeys('^v')
${pressEnter ? "$wshell.SendKeys('{ENTER}')" : ""}
Start-Sleep -Milliseconds 80
if ($hadText -and $null -ne $previousText) {
  [System.Windows.Forms.Clipboard]::SetText($previousText)
} else {
  [System.Windows.Forms.Clipboard]::Clear()
}
[pscustomobject]@{
  length = $text.Length
  press_enter = ${pressEnter ? "$true" : "$false"}
  clipboard_restored = [bool]$hadText
} | ConvertTo-Json -Compress
`.trim();
}

function buildSendKeysScript(sequence: string) {
  return `
$ErrorActionPreference = 'Stop'
$sequence = '${escapePowerShellString(sequence)}'
$wshell = New-Object -ComObject WScript.Shell
Start-Sleep -Milliseconds 80
$wshell.SendKeys($sequence)
[pscustomobject]@{
  sequence = $sequence
  sent = $true
} | ConvertTo-Json -Compress
`.trim();
}

function buildScrollMouseScript(input: z.infer<typeof ScrollMouseSchema>) {
  const moveScript =
    input.x !== undefined && input.y !== undefined
      ? `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${input.x}, ${input.y})
Start-Sleep -Milliseconds 50`
      : "";

  const wheelDelta = input.direction === "up" ? 120 * input.amount : -120 * input.amount;
  const unsignedDelta = wheelDelta >= 0 ? wheelDelta : 4294967296 + wheelDelta;

  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CodexMouseWheel {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
}
"@
${moveScript}
[CodexMouseWheel]::mouse_event(0x0800, 0, 0, [uint32](${unsignedDelta}), [UIntPtr]::Zero)
$cursor = [System.Windows.Forms.Cursor]::Position
[pscustomobject]@{
  x = $cursor.X
  y = $cursor.Y
  amount = ${input.amount}
  direction = '${input.direction}'
} | ConvertTo-Json -Compress
`.trim();
}

function buildGetScreenBase64Script(options: { scale: number; quality: number; x?: number; y?: number; width?: number; height?: number }) {
  const regionScript =
    options.x !== undefined
      ? `$captureX = ${options.x}; $captureY = ${options.y}; $captureWidth = ${options.width}; $captureHeight = ${options.height}
$bounds = New-Object System.Drawing.Rectangle($captureX, $captureY, $captureWidth, $captureHeight)`
      : `$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bounds = New-Object System.Drawing.Rectangle($screen.X, $screen.Y, $screen.Width, $screen.Height)`;

  const scaleScript =
    options.scale > 0
      ? `$scaleW = ${options.scale}; $scaleH = [int]($bounds.Height * (${options.scale} / $bounds.Width))
$scaled = New-Object System.Drawing.Bitmap($scaleW, $scaleH)
$sg = [System.Drawing.Graphics]::FromImage($scaled)
$sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$sg.DrawImage($bmp, 0, 0, $scaleW, $scaleH)
$sg.Dispose(); $bmp.Dispose(); $finalBmp = $scaled; $finalW = $scaleW; $finalH = $scaleH`
      : `$finalBmp = $bmp; $finalW = $bounds.Width; $finalH = $bounds.Height`;

  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing, System.Windows.Forms
${regionScript}
$bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen((New-Object System.Drawing.Point($bounds.X, $bounds.Y)), [System.Drawing.Point]::Empty, $bounds.Size)
$g.Dispose()
${scaleScript}
$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]${options.quality})
$ms = New-Object System.IO.MemoryStream
$finalBmp.Save($ms, $codec, $encParams)
$finalBmp.Dispose()
$b64 = [Convert]::ToBase64String($ms.ToArray())
$ms.Dispose()
[pscustomobject]@{ base64 = $b64; width = $finalW; height = $finalH; format = 'jpeg'; mime = 'image/jpeg' } | ConvertTo-Json -Compress
`.trim();
}

function buildCaptureScreenScript(options: { outputPath: string; x?: number; y?: number; width?: number; height?: number; openAfterCapture: boolean }) {
  const regionScript =
    options.x !== undefined
      ? `
$captureX = ${options.x}
$captureY = ${options.y}
$captureWidth = ${options.width}
$captureHeight = ${options.height}
$bounds = New-Object System.Drawing.Rectangle($captureX, $captureY, $captureWidth, $captureHeight)
`
      : `
$screenBounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bounds = New-Object System.Drawing.Rectangle($screenBounds.X, $screenBounds.Y, $screenBounds.Width, $screenBounds.Height)
`;

  return `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$outputPath = '${escapePowerShellString(options.outputPath)}'
${regionScript}
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen((New-Object System.Drawing.Point($bounds.X, $bounds.Y)), [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bitmap.Dispose()
${options.openAfterCapture ? "Invoke-Item -LiteralPath $outputPath" : ""}
[pscustomobject]@{
  path = $outputPath
  x = $bounds.X
  y = $bounds.Y
  width = $bounds.Width
  height = $bounds.Height
  opened = ${options.openAfterCapture ? "$true" : "$false"}
} | ConvertTo-Json -Compress
`.trim();
}

function buildListWindowsScript() {
  return `
$ErrorActionPreference = 'Stop'
$windows = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Sort-Object ProcessName, Id | ForEach-Object {
  [pscustomobject]@{
    pid = $_.Id
    process_name = $_.ProcessName
    title = $_.MainWindowTitle
    responding = $_.Responding
  }
}
[pscustomobject]@{
  windows = @($windows)
} | ConvertTo-Json -Compress -Depth 4
`.trim();
}

function buildFocusWindowScript(input: z.infer<typeof FocusWindowSchema>) {
  const pidCondition = input.pid ? `$_ .Id -eq ${input.pid}`.replace("$_ .", "$_.") : "$false";
  const titleCondition = input.title_contains ? `$_.MainWindowTitle -like '*${escapePowerShellString(input.title_contains)}*'` : "$true";
  const processCondition = input.process_name ? `$_.ProcessName -like '*${escapePowerShellString(input.process_name)}*'` : "$true";

  return `
$ErrorActionPreference = 'Stop'
$wshell = New-Object -ComObject WScript.Shell
$candidate = Get-Process | Where-Object {
  $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -and
  ((${pidCondition}) -or ((${processCondition}) -and (${titleCondition})))
} | Select-Object -First 1

if (-not $candidate) {
  throw "No matching window found."
}

$activated = $wshell.AppActivate($candidate.Id)
Start-Sleep -Milliseconds 150

[pscustomobject]@{
  activated = [bool]$activated
  pid = $candidate.Id
  process_name = $candidate.ProcessName
  title = $candidate.MainWindowTitle
} | ConvertTo-Json -Compress
`.trim();
}

async function runPowerShellScript(script: string, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");

  const relayUrl = process.env.DESKTOP_RELAY_URL;
  if (relayUrl) {
    // Route through Windows host relay (used when running in Docker/Linux)
    let relayRes: Response;
    try {
      relayRes = await fetch(`${relayUrl}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encodedScript, timeoutMs }),
        signal: AbortSignal.timeout(timeoutMs + 10_000),
      });
    } catch (err: any) {
      throw new ToolError(`Host relay unreachable at ${relayUrl}: ${err?.message}. Make sure relay/relay.js is running on your Windows machine.`, {
        code: "runtime_error",
        statusCode: 503,
      });
    }

    const result = await relayRes.json() as { stdout: string; stderr: string; exitCode: number; timedOut: boolean; error?: string };

    if (result.error) {
      throw new ToolError(result.error, { code: "runtime_error", statusCode: 500 });
    }
    if (result.timedOut) {
      throw new ToolError(`Desktop action timed out after ${timeoutMs}ms`, { code: "runtime_error", statusCode: 504 });
    }
    if (result.exitCode !== 0) {
      throw new ToolError(result.stderr || result.stdout || "Desktop action failed.", { code: "runtime_error", statusCode: 500, details: result });
    }
    try { return JSON.parse(result.stdout); } catch { return { ok: true, stdout: result.stdout, stderr: result.stderr }; }
  }

  // Native Windows execution (when running directly on Windows, not in Docker)
  const result = await runSafeCommand({
    command: "powershell",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-STA", "-EncodedCommand", encodedScript],
    cwd: hubConfig.projectRoot,
    timeoutMs,
  });

  if (result.timedOut) {
    throw new ToolError(`Desktop action timed out after ${timeoutMs}ms`, { code: "runtime_error", statusCode: 504 });
  }
  if (result.exitCode !== 0) {
    throw new ToolError(result.stderr || result.stdout || "Desktop action failed.", { code: "runtime_error", statusCode: 500, details: result });
  }
  try { return JSON.parse(result.stdout); } catch { return { ok: true, stdout: result.stdout, stderr: result.stderr }; }
}

function resolveCapturePath(rawPath?: string): string {
  if (rawPath) {
    const targetPath = ensurePathAllowed(normalizeLocalPath(rawPath), hubConfig.desktop.allowedPathRoots, hubConfig.filesystem.deniedPaths);
    if (path.extname(targetPath).toLowerCase() !== ".png") {
      throw new ToolError("Screenshots must be saved as .png files.", {
        code: "bad_request",
        statusCode: 400,
      });
    }

    return targetPath;
  }

  return path.join(os.tmpdir(), `codex-screenshot-${Date.now()}.png`);
}

export const desktopTools: ToolDefinition[] = [
  {
    name: "desktop_open_url",
    description: "Open a URL in the default browser on the local Windows machine.",
    inputSchema: OpenUrlSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const normalizedUrl = normalizeUrl(input.url);
      const result = await runPowerShellScript(
        buildStartProcessScript({
          target: normalizedUrl,
        })
      );

      return {
        action: "open_url",
        url: normalizedUrl,
        ...result,
      };
    },
  },
  {
    name: "desktop_launch_app",
    description: "Launch an app on the local Windows machine by alias, executable name, or absolute path.",
    inputSchema: LaunchAppSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const launch = resolveLaunchTarget(input.app);
      const workingDirectory = input.cwd ? ensurePathAllowed(normalizeLocalPath(input.cwd), hubConfig.desktop.allowedPathRoots, hubConfig.filesystem.deniedPaths) : undefined;
      const result = await runPowerShellScript(
        buildStartProcessScript({
          target: launch.target,
          args: input.args,
          workingDirectory,
          waitForExit: input.wait_for_exit,
        }),
        input.timeout_ms || DEFAULT_TIMEOUT_MS
      );

      return {
        action: "launch_app",
        app: input.app,
        launch_target: launch.target,
        launch_source: launch.source,
        resolved_path: launch.resolvedPath || null,
        working_directory: workingDirectory || null,
        args: input.args,
        ...result,
      };
    },
  },
  {
    name: "desktop_open_path",
    description: "Open a local file or folder in its default Windows app.",
    inputSchema: OpenPathSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const resolvedPath = ensurePathAllowed(normalizeLocalPath(input.path), hubConfig.desktop.allowedPathRoots, hubConfig.filesystem.deniedPaths);
      const kind = getPathKind(resolvedPath);

      if (kind === "missing") {
        throw new ToolError(`Path not found: ${resolvedPath}`, {
          code: "not_found",
          statusCode: 404,
        });
      }

      const result = await runPowerShellScript(buildOpenPathScript(resolvedPath));

      return {
        action: "open_path",
        path: resolvedPath,
        kind,
        ...result,
      };
    },
  },
  {
    name: "desktop_get_screen_state",
    description: "Return cursor position and connected screen bounds for the local Windows desktop.",
    inputSchema: z.object({}),
    group,
    handler: async () => {
      assertWindowsHost();
      return runPowerShellScript(buildGetScreenStateScript());
    },
  },
  {
    name: "desktop_move_mouse",
    description: "Move the mouse pointer to an absolute screen coordinate.",
    inputSchema: MoveMouseSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const result = await runPowerShellScript(buildMoveMouseScript(input.x, input.y));
      return {
        action: "move_mouse",
        ...result,
      };
    },
  },
  {
    name: "desktop_click_mouse",
    description: "Click the mouse at the current cursor position or an explicit absolute coordinate.",
    inputSchema: ClickMouseSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const result = await runPowerShellScript(buildClickMouseScript(input));
      return {
        action: "click_mouse",
        ...result,
      };
    },
  },
  {
    name: "desktop_type_text",
    description: "Paste text into the currently focused window and optionally press Enter.",
    inputSchema: TypeTextSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const result = await runPowerShellScript(buildTypeTextScript(input.text, input.press_enter));
      return {
        action: "type_text",
        ...result,
      };
    },
  },
  {
    name: "desktop_send_keys",
    description: "Send a Windows SendKeys sequence to the currently focused window.",
    inputSchema: SendKeysSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const result = await runPowerShellScript(buildSendKeysScript(input.sequence));
      return {
        action: "send_keys",
        ...result,
      };
    },
  },
  {
    name: "desktop_scroll_mouse",
    description: "Scroll the mouse wheel up or down, optionally after moving to an absolute screen coordinate.",
    inputSchema: ScrollMouseSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const result = await runPowerShellScript(buildScrollMouseScript(input));
      return {
        action: "scroll_mouse",
        ...result,
      };
    },
  },
  {
    name: "desktop_capture_screen",
    description: "Capture the full primary screen or a rectangular region to a PNG file.",
    inputSchema: CaptureScreenSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const outputPath = resolveCapturePath(input.path);
      const result = await runPowerShellScript(
        buildCaptureScreenScript({
          outputPath,
          x: input.x,
          y: input.y,
          width: input.width,
          height: input.height,
          openAfterCapture: input.open_after_capture,
        }),
        60_000
      );

      return {
        action: "capture_screen",
        ...result,
      };
    },
  },
  {
    name: "desktop_list_windows",
    description: "List visible desktop windows with titles and process names.",
    inputSchema: z.object({}),
    group,
    handler: async () => {
      assertWindowsHost();
      return runPowerShellScript(buildListWindowsScript());
    },
  },
  {
    name: "desktop_focus_window",
    description: "Activate a visible window by pid, title match, or process name.",
    inputSchema: FocusWindowSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const result = await runPowerShellScript(buildFocusWindowScript(input));
      return {
        action: "focus_window",
        ...result,
      };
    },
  },
  {
    name: "desktop_list_app_aliases",
    description: "List built-in and configured desktop app aliases for quick launching.",
    inputSchema: z.object({}),
    group,
    handler: async () => {
      assertWindowsHost();
      return {
        aliases: hubConfig.desktop.appAliases,
      };
    },
  },
  {
    name: "desktop_get_screen_base64",
    description:
      "Capture the current screen (or a region) and return it as a base64-encoded JPEG string. Use this to give any vision-capable agent a real-time view of what is on screen. Pass the returned base64 + mime directly to a multimodal model.",
    inputSchema: GetScreenBase64Schema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      const result = await runPowerShellScript(
        buildGetScreenBase64Script({
          scale: input.scale,
          quality: input.quality,
          x: input.region?.x,
          y: input.region?.y,
          width: input.region?.width,
          height: input.region?.height,
        }),
        60_000
      );
      return result;
    },
  },
  {
    name: "desktop_stream_screen",
    description:
      "Start, stop, or check the status of the real-time screen stream. When running, the stream broadcasts JPEG frames to all WebSocket clients connected to ws://<host>:<port>/stream/screen. Requires ffmpeg in PATH.",
    inputSchema: StreamScreenSchema,
    group,
    handler: async (input) => {
      assertWindowsHost();
      if (input.action === "start") {
        screenStreamService.start({ fps: input.fps, scale: input.scale, quality: input.quality });
        return screenStreamService.getStatus();
      }
      if (input.action === "stop") {
        screenStreamService.stop();
        return screenStreamService.getStatus();
      }
      return screenStreamService.getStatus();
    },
  },
];
