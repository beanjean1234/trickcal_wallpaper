import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, appendFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const controllerDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(controllerDirectory, "web");
const port = Number(process.env.TRICKCAL_CONTROLLER_PORT) || 39271;
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const dataRoot = process.env.TRICKCAL_DATA_ROOT || path.join(localAppData, "TrickcalWallpaper");
const layoutPath = path.join(dataRoot, "layout.json");
const requestLogPath = path.join(dataRoot, "controller-requests.log");
const pidPath = path.join(controllerDirectory, "controller.pid");
const edgeProfile = path.join(dataRoot, "EdgePlacementProfile");
const controllerHeader = "x-trickcal-controller";
const allowedOrigins = new Set([
  "null",
  "file://",
  `http://127.0.0.1:${port}`,
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

let editorProcess = null;

function isAllowedOrigin(origin) {
  if (!origin || allowedOrigins.has(origin)) return true;

  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.protocol === "https:"
      && (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname.endsWith(".localhost"));
  } catch {
    return false;
  }
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (isAllowedOrigin(origin)) {
    if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Trickcal-Controller");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Private-Network", "true");
    response.setHeader("Access-Control-Max-Age", "600");
    response.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    return true;
  }
  return false;
}

async function logControllerRequest(request, allowed) {
  if (allowed || !request.url?.startsWith("/api/")) return;

  const entry = {
    time: new Date().toISOString(),
    method: request.method,
    path: request.url,
    origin: request.headers.origin ?? null,
    requestedHeaders: request.headers["access-control-request-headers"] ?? null,
    privateNetwork: request.headers["access-control-request-private-network"] ?? null,
    userAgent: request.headers["user-agent"] ?? null,
    allowed,
  };

  await mkdir(dataRoot, { recursive: true });
  await appendFile(requestLogPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function normalizeLayout(candidate) {
  if (!candidate || !Array.isArray(candidate.objects)) {
    throw new Error("Layout objects are required");
  }

  const seen = new Set();
  const objects = [];
  for (const object of candidate.objects.slice(0, 32)) {
    const id = String(object.id ?? "").toLowerCase();
    const asset = String(object.asset ?? "")
      .normalize("NFC")
      .replaceAll("\\", "/");
    const assetSegments = asset.split("/");
    const label = String(object.label ?? "오브젝트")
      .normalize("NFC")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 80) || "오브젝트";
    const x = Number(object.x);
    const y = Number(object.y);
    if (!/^[a-z0-9_-]{1,40}$/.test(id) || seen.has(id)) continue;
    if (
      !asset ||
      asset.length > 260 ||
      asset.startsWith("/") ||
      assetSegments.some((segment) => !segment || segment === "." || segment === "..") ||
      !/\.(?:webp|png|jpe?g)$/i.test(asset)
    ) continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    seen.add(id);
    objects.push({
      id,
      asset,
      label,
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
    });
  }

  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    objects,
  };
}

async function readLayout() {
  try {
    return JSON.parse(await readFile(layoutPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Could not read layout:", error.message);
    return { version: 2, updatedAt: null, objects: [] };
  }
}

async function writeLayout(layout) {
  await mkdir(dataRoot, { recursive: true });
  await writeFile(layoutPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
}

async function findEdge() {
  const candidates = [
    path.join(process.env["ProgramFiles(x86)"] || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.ProgramFiles || "", "Microsoft", "Edge", "Application", "msedge.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "Application", "msedge.exe"),
  ];

  for (const candidate of candidates) {
    if (!candidate || candidate.startsWith(`${path.sep}Microsoft`)) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard Edge installation path.
    }
  }
  throw new Error("Microsoft Edge could not be found");
}

async function openEditor() {
  if (editorProcess && editorProcess.exitCode === null) {
    return { opened: true, alreadyOpen: true };
  }

  const edgePath = await findEdge();
  await mkdir(edgeProfile, { recursive: true });
  const editorUrl = `http://127.0.0.1:${port}/editor/?mode=placement`;
  const launchedProcess = spawn(
    edgePath,
    [
      `--app=${editorUrl}`,
      "--start-maximized",
      "--no-first-run",
      "--disable-session-crashed-bubble",
      `--user-data-dir=${edgeProfile}`,
    ],
    { stdio: "ignore", windowsHide: false },
  );
  editorProcess = launchedProcess;
  launchedProcess.once("exit", () => {
    if (editorProcess === launchedProcess) editorProcess = null;
  });

  await new Promise((resolve, reject) => {
    launchedProcess.once("error", reject);
    setTimeout(() => {
      if (launchedProcess.exitCode !== null) {
        reject(new Error(`The placement editor closed during startup (${launchedProcess.exitCode})`));
      } else {
        resolve();
      }
    }, 450);
  });
  return { opened: true, alreadyOpen: false };
}

function closeEditor() {
  if (!editorProcess || editorProcess.exitCode !== null) {
    editorProcess = null;
    return false;
  }

  const pid = editorProcess.pid;
  editorProcess = null;
  const killer = spawn("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true,
  });
  killer.unref();
  return true;
}

async function sendStaticFile(requestPath, response) {
  const relativePath = requestPath === "/editor/" || requestPath === "/editor"
    ? "index.html"
    : decodeURIComponent(requestPath.replace(/^\/editor\//, ""));
  const resolvedPath = path.resolve(webRoot, relativePath);
  const webPrefix = `${path.resolve(webRoot)}${path.sep}`;

  if (resolvedPath !== path.resolve(webRoot, "index.html") && !resolvedPath.startsWith(webPrefix)) {
    sendJson(response, 403, { error: "Forbidden" });
    return;
  }

  try {
    const details = await stat(resolvedPath);
    if (!details.isFile()) throw Object.assign(new Error("Not found"), { code: "ENOENT" });
    const body = await readFile(resolvedPath);
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(resolvedPath).toLowerCase()) || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    });
    response.end(body);
  } catch (error) {
    sendJson(response, error.code === "ENOENT" ? 404 : 500, {
      error: error.code === "ENOENT" ? "Not found" : "Could not load the editor asset",
    });
  }
}

const server = createServer(async (request, response) => {
  try {
    const corsAllowed = applyCors(request, response);
    void logControllerRequest(request, corsAllowed).catch(() => {});

    if (!corsAllowed) {
      sendJson(response, 403, { error: "Origin is not allowed" });
      return;
    }

    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (request.method === "OPTIONS") {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      if (request.headers[controllerHeader] !== "1") {
        sendJson(response, 403, { error: "Controller header is required" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, version: 2 });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/layout") {
        sendJson(response, 200, await readLayout());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/layout") {
        const layout = normalizeLayout(await readJsonBody(request));
        await writeLayout(layout);
        sendJson(response, 200, { ok: true, layout });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/open-editor") {
        sendJson(response, 200, await openEditor());
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/close-editor") {
        sendJson(response, 200, { ok: true });
        setTimeout(closeEditor, 220);
        return;
      }

      sendJson(response, 404, { error: "Unknown API endpoint" });
      return;
    }

    if (url.pathname === "/") {
      response.writeHead(302, { Location: "/editor/?mode=placement" });
      response.end();
      return;
    }

    if (url.pathname.startsWith("/editor")) {
      await sendStaticFile(url.pathname, response);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, 500, { error: error.message });
    else response.end();
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    process.exitCode = 0;
    return;
  }
  console.error(error);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", async () => {
  await writeFile(pidPath, String(process.pid), "utf8").catch(() => {});
  console.log(`Trickcal Wallpaper Controller listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  closeEditor();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
