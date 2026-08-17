import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  access,
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const controllerDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(controllerDirectory, "web");
const port = Number(process.env.TRICKCAL_CONTROLLER_PORT) || 39271;
const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
const dataRoot = process.env.TRICKCAL_DATA_ROOT || path.join(localAppData, "TrickcalWallpaper");
const layoutPath = path.join(dataRoot, "layout.json");
const libraryRoot = process.env.TRICKCAL_LIBRARY_ROOT || path.join(dataRoot, "Library");
const backgroundRoot = path.join(dataRoot, "Background");
const requestLogPath = path.join(dataRoot, "controller-requests.log");
const pidPath = path.join(controllerDirectory, "controller.pid");
const chromeProfile = path.join(dataRoot, "ChromePlacementProfileVisibleV1");
const edgeProfile = path.join(dataRoot, "EdgePlacementProfileVisibleV2");
const controllerHeader = "x-trickcal-controller";
const supportedImageExtensions = new Set([".jpeg", ".jpg", ".png", ".webp"]);
const supportedBackgroundExtensions = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const maxPackSize = 128 * 1024 * 1024;
const maxBackgroundSize = 128 * 1024 * 1024;
const allowedOrigins = new Set([
  "null",
  "file://",
  `http://127.0.0.1:${port}`,
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

let editorProcessId = null;

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
    response.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Trickcal-Controller, X-Background-Filename",
    );
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

async function readBinaryBody(request, maxSize = maxPackSize) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxSize) throw new Error("Image pack is too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) throw new Error("Image pack is empty");
  return Buffer.concat(chunks);
}

const compareKorean = (left, right) => left.localeCompare(right, "ko", {
  numeric: true,
  sensitivity: "base",
});

function normalizeRelativeAsset(value) {
  const normalized = String(value ?? "").normalize("NFC").replaceAll("\\", "/");
  const segments = normalized.split("/");
  if (
    !normalized ||
    normalized.length > 260 ||
    normalized.startsWith("/") ||
    segments.some((segment) => !segment || segment === "." || segment === "..") ||
    segments.some((segment) => /[\u0000-\u001f\u007f]/.test(segment)) ||
    !supportedImageExtensions.has(path.extname(normalized).toLowerCase())
  ) {
    return null;
  }
  return segments.join("/");
}

function normalizeBackgroundFile(value) {
  const normalized = String(value ?? "").normalize("NFC");
  if (
    !normalized ||
    normalized.length > 120 ||
    path.basename(normalized) !== normalized ||
    /[\u0000-\u001f\u007f]/.test(normalized) ||
    !supportedBackgroundExtensions.has(path.extname(normalized).toLowerCase())
  ) {
    return null;
  }
  return normalized;
}

function normalizeBackground(candidate) {
  const overlayOpacity = Number(candidate?.overlayOpacity);
  const normalizedOverlay = Number.isFinite(overlayOpacity)
    ? Math.min(0.7, Math.max(0, overlayOpacity))
    : 0.14;
  const mode = String(candidate?.mode ?? "shader");

  if (mode === "local") {
    const value = normalizeBackgroundFile(candidate?.value);
    if (value) {
      return {
        mode,
        value,
        revision: String(candidate?.revision ?? "").slice(0, 80),
        overlayOpacity: normalizedOverlay,
      };
    }
  }

  if (mode === "url") {
    const value = String(candidate?.value ?? "").trim().slice(0, 2048);
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return { mode, value: parsed.href, revision: "", overlayOpacity: normalizedOverlay };
      }
    } catch {
      // Fall back to the built-in shader background.
    }
  }

  return { mode: "shader", value: "", revision: "", overlayOpacity: normalizedOverlay };
}

async function saveBackgroundFile(buffer, encodedName) {
  let originalName;
  try {
    originalName = decodeURIComponent(String(encodedName ?? ""));
  } catch {
    throw new Error("Invalid background filename");
  }

  const extension = path.extname(originalName).toLowerCase();
  if (!supportedBackgroundExtensions.has(extension)) {
    throw new Error("Unsupported background image format");
  }

  await mkdir(backgroundRoot, { recursive: true });
  const storedFile = `wallpaper-background${extension}`;
  const entries = await readdir(backgroundRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !supportedBackgroundExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    await rm(path.join(backgroundRoot, entry.name), { force: true });
  }

  const destinationPath = path.join(backgroundRoot, storedFile);
  await writeFile(destinationPath, buffer);
  const details = await stat(destinationPath);
  return {
    file: storedFile,
    revision: `${Math.floor(details.mtimeMs).toString(36)}-${details.size.toString(36)}`,
  };
}

async function collectLibraryImages(directory, relativeDirectory = "", assets = []) {
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => compareKorean(left.name, right.name));

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const relativePath = relativeDirectory
      ? `${relativeDirectory}/${entry.name}`
      : entry.name;
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await collectLibraryImages(absolutePath, relativePath, assets);
      continue;
    }

    if (!entry.isFile()) continue;
    const file = normalizeRelativeAsset(relativePath);
    if (!file) continue;
    const details = await stat(absolutePath);
    const segments = file.split("/");
    const category = segments.length > 1 ? segments[0] : "기타";
    assets.push({
      category,
      name: path.basename(file, path.extname(file)),
      file,
      revision: `${Math.floor(details.mtimeMs).toString(36)}-${details.size.toString(36)}`,
    });
  }
  return assets;
}

async function scanLibrary() {
  await mkdir(libraryRoot, { recursive: true });
  const entries = await readdir(libraryRoot, { withFileTypes: true });
  const categories = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name.normalize("NFC"))
    .sort(compareKorean);
  const assets = await collectLibraryImages(libraryRoot);

  if (assets.some((asset) => asset.category === "기타") && !categories.includes("기타")) {
    categories.push("기타");
    categories.sort(compareKorean);
  }

  assets.sort((left, right) =>
    compareKorean(left.category, right.category) || compareKorean(left.name, right.name));
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    libraryPath: libraryRoot,
    categories,
    assets,
  };
}

function spawnAndCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      ...options,
    });
    let output = "";
    let errorOutput = "";
    child.stdout?.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      errorOutput += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(errorOutput.trim() || `${command} exited with code ${code}`));
    });
  });
}

async function spawnAndWait(command, args, options = {}) {
  await spawnAndCapture(command, args, options);
}

function isProcessRunning(processId) {
  if (!Number.isInteger(processId) || processId <= 0) return false;
  try {
    process.kill(processId, 0);
    return true;
  } catch {
    return false;
  }
}

async function findPackImageRoot(extractedRoot) {
  const directImages = path.join(extractedRoot, "images");
  try {
    if ((await stat(directImages)).isDirectory()) return directImages;
  } catch {
    // Try a single wrapper directory next.
  }

  const entries = await readdir(extractedRoot, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory());
  if (directories.length === 1) {
    const wrappedImages = path.join(extractedRoot, directories[0].name, "images");
    try {
      if ((await stat(wrappedImages)).isDirectory()) return wrappedImages;
    } catch {
      // Fall back to importing supported images from the extracted root.
    }
  }
  return extractedRoot;
}

async function importImagePack(buffer) {
  const importRoot = path.join(dataRoot, ".imports");
  await mkdir(importRoot, { recursive: true });
  const temporaryRoot = await mkdtemp(path.join(importRoot, "pack-"));
  const archivePath = path.join(temporaryRoot, "pack.zip");
  const extractedRoot = path.join(temporaryRoot, "extracted");
  const expandScript = path.join(controllerDirectory, "Expand-ImagePack.ps1");

  try {
    await writeFile(archivePath, buffer);
    await mkdir(extractedRoot, { recursive: true });
    await spawnAndWait("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      expandScript,
      "-ArchivePath",
      archivePath,
      "-DestinationPath",
      extractedRoot,
    ]);

    const packImageRoot = await findPackImageRoot(extractedRoot);
    const importedAssets = await collectLibraryImages(packImageRoot);
    if (importedAssets.length === 0) {
      throw new Error("The image pack does not contain supported images");
    }
    if (importedAssets.length > 2000) {
      throw new Error("The image pack contains too many images");
    }

    let imported = 0;
    for (const asset of importedAssets) {
      const sourcePath = path.resolve(packImageRoot, ...asset.file.split("/"));
      const relativeAsset = asset.file.includes("/") ? asset.file : `기타/${asset.file}`;
      const normalizedAsset = normalizeRelativeAsset(relativeAsset);
      if (!normalizedAsset) continue;
      const destinationPath = path.resolve(libraryRoot, ...normalizedAsset.split("/"));
      const libraryPrefix = `${path.resolve(libraryRoot)}${path.sep}`;
      if (!destinationPath.startsWith(libraryPrefix)) continue;
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await copyFile(sourcePath, destinationPath);
      imported += 1;
    }

    return { imported, catalog: await scanLibrary() };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function openLibraryFolder() {
  await mkdir(libraryRoot, { recursive: true });
  const explorer = spawn("explorer.exe", [libraryRoot], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  explorer.unref();
}

function normalizeLayout(candidate) {
  if (!candidate || !Array.isArray(candidate.objects)) {
    throw new Error("Layout objects are required");
  }

  const seen = new Set();
  const objects = [];
  for (const object of candidate.objects.slice(0, 256)) {
    const id = String(object.id ?? "").toLowerCase();
    const asset = normalizeRelativeAsset(object.asset);
    const label = String(object.label ?? "오브젝트")
      .normalize("NFC")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 80) || "오브젝트";
    const x = Number(object.x);
    const y = Number(object.y);
    if (!/^[a-z0-9_-]{1,40}$/.test(id) || seen.has(id)) continue;
    if (
      !asset
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
    version: 3,
    updatedAt: new Date().toISOString(),
    background: normalizeBackground(candidate.background),
    objects,
  };
}

async function readLayout() {
  try {
    return JSON.parse(await readFile(layoutPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Could not read layout:", error.message);
    return {
      version: 3,
      updatedAt: null,
      background: normalizeBackground(null),
      objects: [],
    };
  }
}

async function writeLayout(layout) {
  await mkdir(dataRoot, { recursive: true });
  await writeFile(layoutPath, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
}

async function findInstalledBrowser(candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next standard browser installation path.
    }
  }
  return null;
}

async function findPreferredBrowser() {
  const chromePath = await findInstalledBrowser([
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"], "Google", "Chrome", "Application", "chrome.exe")
      : null,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : null,
  ]);

  if (chromePath) {
    return {
      executablePath: chromePath,
      name: "Google Chrome",
      profilePath: chromeProfile,
    };
  }

  const edgePath = await findInstalledBrowser([
    process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"], "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
    process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe")
      : null,
  ]);

  if (edgePath) {
    return {
      executablePath: edgePath,
      name: "Microsoft Edge",
      profilePath: edgeProfile,
    };
  }

  throw new Error("Google Chrome and Microsoft Edge could not be found");
}

async function openEditor() {
  if (isProcessRunning(editorProcessId)) {
    return { opened: true, alreadyOpen: true };
  }
  editorProcessId = null;

  const browser = await findPreferredBrowser();
  await mkdir(browser.profilePath, { recursive: true });
  const editorUrl = `http://127.0.0.1:${port}/editor/?mode=placement`;
  const launchScript = path.join(controllerDirectory, "Launch-PlacementEditor.ps1");
  const output = await spawnAndCapture("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    launchScript,
    "-BrowserPath",
    browser.executablePath,
    "-BrowserName",
    browser.name,
    "-EditorUrl",
    editorUrl,
    "-ProfilePath",
    browser.profilePath,
  ]);
  const processId = Number.parseInt(output.split(/\s+/).at(-1), 10);
  if (!isProcessRunning(processId)) {
    throw new Error("The placement editor did not remain open");
  }
  editorProcessId = processId;
  return { opened: true, alreadyOpen: false };
}

function closeEditor() {
  if (!isProcessRunning(editorProcessId)) {
    editorProcessId = null;
    return false;
  }

  const pid = editorProcessId;
  editorProcessId = null;
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

async function sendLibraryAsset(requestPath, response) {
  let relativeAsset;
  try {
    relativeAsset = decodeURIComponent(requestPath.replace(/^\/library\//, ""));
  } catch {
    sendJson(response, 400, { error: "Invalid image path" });
    return;
  }

  const normalizedAsset = normalizeRelativeAsset(relativeAsset);
  if (!normalizedAsset) {
    sendJson(response, 404, { error: "Image not found" });
    return;
  }

  const resolvedPath = path.resolve(libraryRoot, ...normalizedAsset.split("/"));
  const libraryPrefix = `${path.resolve(libraryRoot)}${path.sep}`;
  if (!resolvedPath.startsWith(libraryPrefix)) {
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
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    response.end(body);
  } catch (error) {
    sendJson(response, error.code === "ENOENT" ? 404 : 500, {
      error: error.code === "ENOENT" ? "Image not found" : "Could not load the image",
    });
  }
}

async function sendBackgroundAsset(requestPath, response) {
  let relativeFile;
  try {
    relativeFile = decodeURIComponent(requestPath.replace(/^\/background\//, ""));
  } catch {
    sendJson(response, 400, { error: "Invalid background path" });
    return;
  }

  const file = normalizeBackgroundFile(relativeFile);
  if (!file) {
    sendJson(response, 404, { error: "Background not found" });
    return;
  }

  const resolvedPath = path.resolve(backgroundRoot, file);
  const backgroundPrefix = `${path.resolve(backgroundRoot)}${path.sep}`;
  if (!resolvedPath.startsWith(backgroundPrefix)) {
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
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    response.end(body);
  } catch (error) {
    sendJson(response, error.code === "ENOENT" ? 404 : 500, {
      error: error.code === "ENOENT" ? "Background not found" : "Could not load the background",
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
        sendJson(response, 200, { ok: true, version: 4, libraryPath: libraryRoot });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/catalog") {
        sendJson(response, 200, await scanLibrary());
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

      if (request.method === "POST" && url.pathname === "/api/open-library") {
        await openLibraryFolder();
        sendJson(response, 200, { ok: true, libraryPath: libraryRoot });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/import-pack") {
        const result = await importImagePack(await readBinaryBody(request));
        sendJson(response, 200, { ok: true, ...result });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/background") {
        const background = await saveBackgroundFile(
          await readBinaryBody(request, maxBackgroundSize),
          request.headers["x-background-filename"],
        );
        sendJson(response, 200, { ok: true, background });
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

    if (url.pathname.startsWith("/library/")) {
      await sendLibraryAsset(url.pathname, response);
      return;
    }


    if (url.pathname.startsWith("/background/")) {
      await sendBackgroundAsset(url.pathname, response);
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
  await mkdir(libraryRoot, { recursive: true });
  await mkdir(backgroundRoot, { recursive: true });
  await writeFile(pidPath, String(process.pid), "utf8").catch(() => {});
  console.log(`Trickcal Wallpaper Controller listening on http://127.0.0.1:${port}`);
});

function shutdown() {
  closeEditor();
  server.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
