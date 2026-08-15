import { createBackgroundRenderer } from "./background.js";
import { ICON_ASSETS, ICON_CATEGORIES } from "./assets.generated.js";
import { makeDraggableGroup } from "./interaction.js";
import {
  applyLayout,
  captureLayout,
  closePlacementEditor,
  loadSavedLayout,
  openPlacementEditor,
  saveLayout,
} from "./layout.js";
import {
  buildFrontSpecularMap,
  buildPlateWalls,
  updateSpecularAngle,
  updateSpecularOpacity,
} from "./scene.js";

const study = document.querySelector("#study");
const magnifierTemplate = document.querySelector("#magnifier-template");
const placementToolbar = document.querySelector("#placement-toolbar");
const placementStatus = document.querySelector("#placement-status");
const placementStatusText = document.querySelector("#placement-status-text");
const resetLayoutButton = document.querySelector("#reset-layout");
const cancelLayoutButton = document.querySelector("#cancel-layout");
const saveLayoutButton = document.querySelector("#save-layout");
const objectManager = document.querySelector("#object-manager");
const objectCount = document.querySelector("#object-count");
const assetSearchInput = document.querySelector("#asset-search-input");
const categoryFilter = document.querySelector("#category-filter");
const assetGrid = document.querySelector("#asset-grid");
const assetGridEmpty = document.querySelector("#asset-grid-empty");
const toast = document.querySelector("#toast");
const isPlacementEditor = new URLSearchParams(location.search).get("mode") === "placement";
const assetByFile = new Map(ICON_ASSETS.map((asset) => [asset.file, asset]));
const magnifiers = [];

document.body.classList.toggle("is-placement-editor", isPlacementEditor);

let toastTimer = null;
let activeLayout = null;
let activeLayoutTimestamp = null;
let layoutDirty = false;
let layoutRevision = 0;
let directSaveTimer = null;
let selectedObjectId = null;
let selectedCategory = "전체";
let assetSearchQuery = "";
let objectSequence = 0;
let activeShadowOpacity = 0.2;
let activeShadowBlur = 48;
let initializationPromise = Promise.resolve(false);

function showToast(message, duration = 2800) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, duration);
}

function updatePlacementStatus(message) {
  if (!isPlacementEditor) return;
  placementStatusText.textContent = message;
}

function getRightInset() {
  return Number.parseFloat(
    getComputedStyle(study).getPropertyValue("--interaction-right-inset"),
  ) || 0;
}

function makeObjectId() {
  objectSequence += 1;
  return `object-${Date.now().toString(36)}-${objectSequence.toString(36)}`;
}

function setSelectedObject(element) {
  selectedObjectId = element?.dataset.icon ?? null;
  magnifiers.forEach((item) => {
    item.classList.toggle("is-selected", item === element);
  });
  renderAssetLibrary();

  if (element) {
    element.focus({ preventScroll: true });
    updatePlacementStatus(`${magnifiers.length}개 오브젝트 · ${element.dataset.label} 선택됨`);
  }
}

function createCheckIcon() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m9.55 16.15-3.7-3.7 1.4-1.4 2.3 2.3 7.2-7.2 1.4 1.4-8.6 8.6Z");
  svg.append(path);
  return svg;
}

function getMagnifiersByAsset(file) {
  return magnifiers.filter((element) => element.dataset.asset === file);
}

function toggleAsset(asset, enabled) {
  const existing = getMagnifiersByAsset(asset.file);
  if (enabled) {
    if (existing.length > 0) {
      setSelectedObject(existing[0]);
      return;
    }

    const magnifier = createMagnifier({
      id: makeObjectId(),
      asset: asset.file,
      label: asset.name,
    });
    if (!magnifier) return;
    placeNewMagnifier(magnifier);
    setSelectedObject(magnifier);
    markLayoutChanged(magnifier);
    showToast(`${asset.name} 오브젝트를 추가했습니다.`);
    return;
  }

  existing.forEach(removeMagnifier);
  markLayoutChanged();
  showToast(`${asset.name} 오브젝트를 해제했습니다. 배치 저장 전까지는 확정되지 않습니다.`);
}

function renderCategoryFilter() {
  if (!isPlacementEditor) return;
  categoryFilter.replaceChildren();

  ["전체", ...ICON_CATEGORIES].forEach((category) => {
    const button = document.createElement("button");
    button.className = "category-filter__button";
    button.type = "button";
    button.textContent = category;
    button.setAttribute("aria-controls", "asset-grid");
    button.setAttribute("aria-pressed", String(category === selectedCategory));
    button.addEventListener("click", () => {
      selectedCategory = category;
      renderCategoryFilter();
      renderAssetLibrary();
    });
    categoryFilter.append(button);
  });
}

function renderAssetLibrary() {
  if (!isPlacementEditor) return;
  objectCount.textContent = String(magnifiers.length);
  assetGrid.replaceChildren();

  const query = assetSearchQuery.trim().toLocaleLowerCase("ko");
  const assets = ICON_ASSETS.filter((asset) => {
    const categoryMatches = selectedCategory === "전체" || asset.category === selectedCategory;
    const queryMatches = !query ||
      `${asset.name} ${asset.file} ${asset.category}`.toLocaleLowerCase("ko").includes(query);
    return categoryMatches && queryMatches;
  });

  assetGridEmpty.hidden = assets.length > 0;
  assetGridEmpty.textContent = query
    ? "검색 결과가 없습니다."
    : "이 폴더에는 이미지가 없습니다.";

  assets.forEach((asset, index) => {
    const element = getMagnifiersByAsset(asset.file)[0] ?? null;
    const item = document.createElement("li");
    const selectButton = document.createElement("button");
    const thumbnail = document.createElement("img");
    const copy = document.createElement("span");
    const name = document.createElement("strong");
    const category = document.createElement("small");
    const toggleLabel = document.createElement("label");
    const toggleInput = document.createElement("input");
    const check = document.createElement("span");
    const active = Boolean(element);
    const focused = element?.dataset.icon === selectedObjectId;

    item.className = "asset-card";
    item.classList.toggle("is-active", active);
    item.classList.toggle("is-focused", focused);
    selectButton.className = "asset-card__select";
    selectButton.type = "button";
    selectButton.disabled = !active;
    selectButton.setAttribute(
      "aria-label",
      active ? `${asset.name} 오브젝트 선택` : `${asset.name} 이미지 미리보기`,
    );
    selectButton.addEventListener("click", () => setSelectedObject(element));

    thumbnail.src = new URL(`./icons/${asset.file}`, document.baseURI).href;
    thumbnail.alt = `${asset.name} 미리보기`;
    thumbnail.loading = index < 6 ? "eager" : "lazy";
    thumbnail.decoding = "async";
    copy.className = "asset-card__copy";
    name.textContent = asset.name;
    category.textContent = asset.category;
    copy.append(name, category);
    selectButton.append(thumbnail, copy);

    toggleLabel.className = "asset-card__toggle";
    toggleInput.type = "checkbox";
    toggleInput.checked = active;
    toggleInput.setAttribute("aria-label", `${asset.name} 오브젝트 사용`);
    check.className = "asset-card__check";
    check.setAttribute("aria-hidden", "true");
    check.append(createCheckIcon());
    toggleInput.addEventListener("change", () => {
      toggleAsset(asset, toggleInput.checked);
    });
    toggleLabel.append(toggleInput, check);

    item.append(selectButton, toggleLabel);
    assetGrid.append(item);
  });
}

const interactionController = makeDraggableGroup([], study, {
  draggable: true,
  onPositionChange: markLayoutChanged,
  onSelectionChange: setSelectedObject,
});

function createMagnifier(object) {
  const asset = assetByFile.get(object.asset);
  if (!asset) return null;

  const magnifier = magnifierTemplate.content.firstElementChild.cloneNode(true);
  const image = magnifier.querySelector(".magnifier__image");
  const label = object.label || asset.name;

  magnifier.dataset.icon = object.id;
  magnifier.dataset.asset = asset.file;
  magnifier.dataset.label = label;
  magnifier.setAttribute("aria-label", `${label} 오브젝트 이동`);
  image.src = new URL(`./icons/${asset.file}`, document.baseURI).href;
  image.decoding = "async";
  image.loading = magnifiers.length < 4 ? "eager" : "lazy";
  magnifier.style.setProperty("--shadow-opacity", String(activeShadowOpacity));
  magnifier.style.setProperty("--shadow-blur", `${activeShadowBlur}px`);

  magnifiers.push(magnifier);
  study.append(magnifier);
  buildPlateWalls(magnifier);
  interactionController.addElement(magnifier);
  return magnifier;
}

function removeMagnifier(element) {
  const index = magnifiers.indexOf(element);
  if (index >= 0) magnifiers.splice(index, 1);
  interactionController.removeElement(element);
  element.remove();
  if (selectedObjectId === element.dataset.icon) selectedObjectId = null;
  renderAssetLibrary();
}

function arrangeMagnifiers() {
  if (magnifiers.length === 0) {
    study.style.minHeight = "100svh";
    return;
  }

  const lensWidth = magnifiers[0].offsetWidth;
  const lensHeight = magnifiers[0].offsetHeight;
  const gap = lensWidth <= 200 ? 18 : 24;
  const sidePadding = lensWidth <= 200 ? 16 : 32;
  const topInset = isPlacementEditor ? 104 : 48;
  const bottomInset = isPlacementEditor ? 64 : 48;
  const usableWidth = Math.max(
    lensWidth,
    study.clientWidth - getRightInset() - sidePadding * 2,
  );
  const fittingColumns = Math.max(
    1,
    Math.floor((usableWidth + gap) / (lensWidth + gap)),
  );
  const columns = Math.min(4, fittingColumns, magnifiers.length);
  const rows = Math.ceil(magnifiers.length / columns);
  const gridWidth = columns * lensWidth + (columns - 1) * gap;
  const gridHeight = rows * lensHeight + (rows - 1) * gap;
  const contentWidth = study.clientWidth - getRightInset();
  const startX = Math.max(0, (contentWidth - gridWidth) / 2);
  const usableHeight = window.innerHeight - topInset - bottomInset;
  const startY = gridHeight <= usableHeight
    ? topInset + Math.max(0, (usableHeight - gridHeight) / 2)
    : topInset;

  study.style.minHeight = `${Math.max(
    window.innerHeight,
    startY + gridHeight + bottomInset,
  )}px`;

  magnifiers.forEach((magnifier, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    magnifier.style.left = `${startX + column * (lensWidth + gap)}px`;
    magnifier.style.top = `${startY + row * (lensHeight + gap)}px`;
  });
}

function placeNewMagnifier(element) {
  const maxX = Math.max(0, study.clientWidth - getRightInset() - element.offsetWidth);
  const maxY = Math.max(0, window.innerHeight - element.offsetHeight);
  const cascade = ((magnifiers.length - 1) % 7) * 18;
  element.style.left = `${Math.min(maxX, Math.max(0, maxX / 2 + cascade - 54))}px`;
  element.style.top = `${Math.min(maxY, Math.max(0, maxY / 2 + cascade - 54))}px`;
}

async function persistDirectLayout(layout, revision) {
  try {
    const saved = await saveLayout(layout);
    if (revision !== layoutRevision) return;
    activeLayout = saved.layout ?? layout;
    activeLayoutTimestamp = activeLayout.updatedAt;
    layoutDirty = false;
  } catch {
    // Direct dragging still works when the optional controller is offline.
  }
}

function scheduleDirectLayoutSave() {
  if (isPlacementEditor) return;
  window.clearTimeout(directSaveTimer);
  directSaveTimer = window.setTimeout(() => {
    const layout = captureLayout(magnifiers, study);
    void persistDirectLayout(layout, layoutRevision);
  }, 320);
}

function markLayoutChanged(selectedElement) {
  activeLayout = captureLayout(magnifiers, study);
  activeLayoutTimestamp = activeLayout.updatedAt;
  layoutDirty = true;
  layoutRevision += 1;
  scheduleDirectLayoutSave();
  updatePlacementStatus(
    `${magnifiers.length}개 오브젝트 · ${selectedElement?.dataset.label ?? "목록"} 수정됨`,
  );
}

function reconcileLayoutObjects(layout) {
  const seenAssets = new Set();
  const objects = layout.objects.filter((object) => {
    if (!assetByFile.has(object.asset) || seenAssets.has(object.asset)) return false;
    seenAssets.add(object.asset);
    return true;
  });
  const nextIds = new Set(objects.map((object) => object.id));

  [...magnifiers].forEach((element) => {
    if (!nextIds.has(element.dataset.icon)) removeMagnifier(element);
  });

  const existingById = new Map(magnifiers.map((element) => [element.dataset.icon, element]));
  objects.forEach((object) => {
    if (!existingById.has(object.id)) createMagnifier(object);
  });

  const order = new Map(objects.map((object, index) => [object.id, index]));
  magnifiers.sort(
    (left, right) => order.get(left.dataset.icon) - order.get(right.dataset.icon),
  );
  renderAssetLibrary();
  updatePlacementStatus(`${magnifiers.length}개 오브젝트 · 변경사항 없음`);
  return applyLayout({ ...layout, objects }, magnifiers, study);
}

async function syncSavedLayout({ silent = true } = {}) {
  try {
    const layout = await loadSavedLayout();
    if (!layout || layout.version < 2 || !Array.isArray(layout.objects)) return false;
    if (layout.updatedAt && layout.updatedAt === activeLayoutTimestamp) return true;
    if (layoutDirty) return true;

    if (reconcileLayoutObjects(layout)) {
      activeLayout = layout;
      activeLayoutTimestamp = layout.updatedAt ?? null;
      if (!silent) showToast("저장된 오브젝트 배치를 불러왔습니다.");
      return true;
    }
  } catch {
    if (!silent) showToast("배치 컨트롤러에 연결할 수 없습니다.");
  }
  return false;
}

async function launchPlacementEditor() {
  try {
    await openPlacementEditor();
    showToast("오브젝트 관리 창을 열었습니다.");
  } catch {
    showToast("배치 컨트롤러를 먼저 설치하고 실행해 주세요.", 4200);
  }
}

createBackgroundRenderer(document.querySelector("#background-canvas"));
buildFrontSpecularMap();

if (isPlacementEditor) {
  placementToolbar.hidden = false;
  placementStatus.hidden = false;
  objectManager.hidden = false;
  renderCategoryFilter();
  updatePlacementStatus("0개 오브젝트 · 변경사항 없음");

  assetSearchInput.addEventListener("input", () => {
    assetSearchQuery = assetSearchInput.value;
    renderAssetLibrary();
  });

  study.addEventListener("pointerdown", (event) => {
    if (event.target !== study) return;
    setSelectedObject(null);
    updatePlacementStatus(
      `${magnifiers.length}개 오브젝트 · ${layoutDirty ? "저장되지 않은 변경사항" : "변경사항 없음"}`,
    );
  });

  resetLayoutButton.addEventListener("click", () => {
    arrangeMagnifiers();
    setSelectedObject(null);
    markLayoutChanged();
    showToast("오브젝트를 격자 형태로 정렬했습니다.");
  });

  cancelLayoutButton.addEventListener("click", async () => {
    cancelLayoutButton.disabled = true;
    try {
      await closePlacementEditor();
    } catch {
      window.close();
    }
  });

  saveLayoutButton.addEventListener("click", async () => {
    saveLayoutButton.disabled = true;
    const layout = captureLayout(magnifiers, study);
    try {
      const saved = await saveLayout(layout);
      activeLayout = saved.layout ?? layout;
      activeLayoutTimestamp = activeLayout.updatedAt;
      layoutDirty = false;
      updatePlacementStatus(`${magnifiers.length}개 오브젝트 · 저장 완료`);
      showToast("오브젝트 목록과 배치를 저장했습니다.");
      window.setTimeout(() => closePlacementEditor().catch(() => window.close()), 550);
    } catch {
      saveLayoutButton.disabled = false;
      showToast("저장하지 못했습니다. 컨트롤러 연결을 확인해 주세요.", 4200);
    }
  });
} else {
  window.setInterval(() => syncSavedLayout(), 2400);
}

initializationPromise = syncSavedLayout({ silent: true }).then((loaded) => {
  if (!loaded) {
    activeLayout = { version: 2, updatedAt: null, objects: [] };
    arrangeMagnifiers();
    renderAssetLibrary();
  }
  return loaded;
});

function updateShadowOpacity(value) {
  activeShadowOpacity = Math.min(0.6, Math.max(0, value));
  magnifiers.forEach((magnifier) => {
    magnifier.style.setProperty("--shadow-opacity", String(activeShadowOpacity));
  });
}

function updateShadowBlur(value) {
  activeShadowBlur = Math.min(90, Math.max(0, value));
  magnifiers.forEach((magnifier) => {
    magnifier.style.setProperty("--shadow-blur", `${activeShadowBlur}px`);
  });
}

window.livelyPropertyListener = (name, value) => {
  const numericValue = Number(value);

  switch (name) {
    case "openPlacementEditor":
      void launchPlacementEditor();
      break;
    case "specularHighlight":
      if (Number.isFinite(numericValue)) updateSpecularOpacity(numericValue / 100);
      break;
    case "specularAngle":
      if (Number.isFinite(numericValue)) updateSpecularAngle(numericValue);
      break;
    case "shadowOpacity":
      if (Number.isFinite(numericValue)) updateShadowOpacity(numericValue / 100);
      break;
    case "shadowBlur":
      if (Number.isFinite(numericValue)) updateShadowBlur(numericValue);
      break;
    default:
      break;
  }
};

let lastMobileState = window.matchMedia("(max-width: 760px)").matches;
window.addEventListener("resize", () => {
  const mobileState = window.matchMedia("(max-width: 760px)").matches;
  if (mobileState !== lastMobileState) {
    lastMobileState = mobileState;
    buildFrontSpecularMap();
    magnifiers.forEach(buildPlateWalls);
  }

  if (activeLayout) {
    applyLayout(activeLayout, magnifiers, study);
  } else {
    interactionController.keepInBounds();
  }
}, { passive: true });
