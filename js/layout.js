const CONTROLLER_ORIGIN = "http://127.0.0.1:39271";
const CONTROLLER_HEADER = "X-Trickcal-Controller";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getControllerUrl(path) {
  if (
    location.hostname === "127.0.0.1" &&
    location.pathname.startsWith("/editor")
  ) {
    return path;
  }
  return `${CONTROLLER_ORIGIN}${path}`;
}

async function controllerRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), options.timeout ?? 1600);
  const {
    timeout: _timeout,
    headers: optionHeaders = {},
    ...fetchOptions
  } = options;
  const hasContentType = Object.keys(optionHeaders)
    .some((name) => name.toLowerCase() === "content-type");
  const shouldUseJson = typeof options.body === "string" && !hasContentType;

  try {
    const response = await fetch(getControllerUrl(path), {
      ...fetchOptions,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        [CONTROLLER_HEADER]: "1",
        ...(shouldUseJson ? { "Content-Type": "application/json" } : {}),
        ...optionHeaders,
      },
    });

    if (!response.ok) {
      throw new Error(`Controller request failed: ${response.status}`);
    }
    return response;
  } finally {
    window.clearTimeout(timeout);
  }
}

function getLayoutBounds(element, container) {
  const rightInset = Number.parseFloat(
    getComputedStyle(container).getPropertyValue("--interaction-right-inset"),
  ) || 0;
  return {
    maxX: Math.max(0, container.clientWidth - rightInset - element.offsetWidth),
    maxY: Math.max(
      0,
      Math.max(container.scrollHeight, window.innerHeight) - element.offsetHeight,
    ),
  };
}

export function captureLayout(elements, container, background = null) {
  return {
    version: 3,
    updatedAt: new Date().toISOString(),
    ...(background ? { background } : {}),
    objects: elements.map((element) => {
      const { maxX, maxY } = getLayoutBounds(element, container);
      const left = Number.parseFloat(element.style.left) || 0;
      const top = Number.parseFloat(element.style.top) || 0;
      return {
        id: element.dataset.icon,
        asset: element.dataset.asset,
        label: element.dataset.label,
        x: maxX > 0 ? clamp(left / maxX, 0, 1) : 0.5,
        y: maxY > 0 ? clamp(top / maxY, 0, 1) : 0.5,
      };
    }),
  };
}

export function applyLayout(layout, elements, container) {
  if (!layout || !Array.isArray(layout.objects)) return false;

  const positions = new Map(layout.objects.map((item) => [item.id, item]));
  let applied = 0;

  for (const element of elements) {
    const position = positions.get(element.dataset.icon);
    if (!position) continue;
    const { maxX, maxY } = getLayoutBounds(element, container);
    element.style.left = `${clamp(Number(position.x) || 0, 0, 1) * maxX}px`;
    element.style.top = `${clamp(Number(position.y) || 0, 0, 1) * maxY}px`;
    applied += 1;
  }

  return applied === layout.objects.length;
}

export async function pingLayoutController() {
  const response = await controllerRequest("/api/health", { timeout: 900 });
  return response.json();
}

export async function loadSavedLayout() {
  const response = await controllerRequest("/api/layout");
  return response.json();
}

export async function loadAssetCatalog() {
  const response = await controllerRequest("/api/catalog", { timeout: 5000 });
  return response.json();
}

export function getLibraryAssetUrl(file, revision = "") {
  const encodedPath = String(file ?? "")
    .replaceAll("\\", "/")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const version = revision ? `?v=${encodeURIComponent(revision)}` : "";
  return `${getControllerUrl(`/library/${encodedPath}`)}${version}`;
}

export function getBackgroundAssetUrl(file, revision = "") {
  const encodedFile = encodeURIComponent(String(file ?? ""));
  const version = revision ? `?v=${encodeURIComponent(revision)}` : "";
  return `${getControllerUrl(`/background/${encodedFile}`)}${version}`;
}

export async function saveLayout(layout) {
  const response = await controllerRequest("/api/layout", {
    method: "POST",
    body: JSON.stringify(layout),
    timeout: 3000,
  });
  return response.json();
}

export async function openPlacementEditor() {
  const response = await controllerRequest("/api/open-editor", {
    method: "POST",
    timeout: 3000,
  });
  return response.json();
}

export async function closePlacementEditor() {
  const response = await controllerRequest("/api/close-editor", {
    method: "POST",
    timeout: 1800,
  });
  return response.json();
}

export async function openImageLibrary() {
  const response = await controllerRequest("/api/open-library", {
    method: "POST",
    timeout: 3000,
  });
  return response.json();
}

export async function importImagePack(file) {
  const response = await controllerRequest("/api/import-pack", {
    method: "POST",
    body: file,
    headers: { "Content-Type": "application/zip" },
    timeout: 120000,
  });
  return response.json();
}

export async function uploadBackground(file) {
  const response = await controllerRequest("/api/background", {
    method: "POST",
    body: file,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Background-Filename": encodeURIComponent(file.name),
    },
    timeout: 120000,
  });
  return response.json();
}
