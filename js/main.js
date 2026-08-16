import { createBackgroundRenderer } from "./background.js";
import { makeDraggableGroup } from "./interaction.js";
import {
  applyLayout,
  captureLayout,
  closePlacementEditor,
  getLibraryAssetUrl,
  importImagePack,
  loadAssetCatalog,
  loadSavedLayout,
  openImageLibrary,
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
const objectManagerToggle = document.querySelector("#object-manager-toggle");
const objectCount = document.querySelector("#object-count");
const assetSearchInput = document.querySelector("#asset-search-input");
const categoryFilter = document.querySelector("#category-filter");
const assetGrid = document.querySelector("#asset-grid");
const assetGridEmpty = document.querySelector("#asset-grid-empty");
const librarySummary = document.querySelector("#library-summary");
const openLibraryButton = document.querySelector("#open-library");
const importPackButton = document.querySelector("#import-pack");
const refreshLibraryButton = document.querySelector("#refresh-library");
const imagePackInput = document.querySelector("#image-pack-input");
const selectedObjectRemoveButton = document.querySelector("#selected-object-remove");
const toast = document.querySelector("#toast");
const isPlacementEditor = new URLSearchParams(location.search).get("mode") === "placement";
const magnifiers = [];
const ACTIVE_CATEGORY = "생성된 사도";
const ALL_CATEGORY = "전체";

document.body.classList.toggle("is-placement-editor", isPlacementEditor);

let toastTimer = null;
let activeLayout = null;
let activeLayoutTimestamp = null;
let layoutDirty = false;
let layoutRevision = 0;
let directSaveTimer = null;
let selectedObjectId = null;
let selectedCategory = ALL_CATEGORY;
let assetSearchQuery = "";
let iconAssets = [];
let iconCategories = [];
let assetByFile = new Map();
let catalogFingerprint = "";
let catalogLoaded = false;
let catalogLoading = false;
let objectSequence = 0;
let activeShadowOpacity = 0.2;
let activeShadowBlur = 48;
let initializationPromise = Promise.resolve(false);
let activeObjectInteraction = null;
let objectManagerCollapsed = false;
let objectManagerAvoidanceFrame = null;
let objectManagerAvoidanceLatched = false;

function showToast(message, duration = 2800) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, duration);
}

function normalizeCatalog(catalog) {
  const categories = Array.isArray(catalog?.categories)
    ? catalog.categories.filter((category) => typeof category === "string" && category.trim())
    : [];
  const assets = Array.isArray(catalog?.assets)
    ? catalog.assets.filter((asset) =>
      asset &&
      typeof asset.category === "string" &&
      typeof asset.name === "string" &&
      typeof asset.file === "string")
    : [];
  return { categories, assets };
}

function updateLibrarySummary() {
  if (!isPlacementEditor) return;
  librarySummary.textContent = catalogLoaded
    ? `${iconCategories.length}개 폴더 · ${iconAssets.length}개 이미지`
    : "컨트롤러 연결을 확인해 주세요.";
}

function setCatalogLoading(loading) {
  catalogLoading = loading;
  if (!isPlacementEditor) return;
  refreshLibraryButton.disabled = loading;
  importPackButton.disabled = loading;
  refreshLibraryButton.classList.toggle("is-loading", loading);
  refreshLibraryButton.setAttribute("aria-busy", String(loading));
}

function applyAssetCatalog(catalog, { force = false } = {}) {
  const { categories, assets } = normalizeCatalog(catalog);
  const nextFingerprint = JSON.stringify({
    categories,
    assets: assets.map((asset) => [asset.file, asset.revision ?? ""]),
  });
  if (!force && nextFingerprint === catalogFingerprint) return false;

  catalogFingerprint = nextFingerprint;
  catalogLoaded = true;
  iconCategories = categories;
  iconAssets = assets;
  assetByFile = new Map(assets.map((asset) => [asset.file, asset]));

  if (
    selectedCategory !== ALL_CATEGORY &&
    selectedCategory !== ACTIVE_CATEGORY &&
    !iconCategories.includes(selectedCategory)
  ) {
    selectedCategory = ALL_CATEGORY;
  }

  magnifiers.forEach((element) => {
    const asset = assetByFile.get(element.dataset.asset);
    if (!asset) return;
    const image = element.querySelector(".magnifier__image");
    const nextSource = getLibraryAssetUrl(asset.file, asset.revision);
    if (image.src !== nextSource) image.src = nextSource;
  });

  renderCategoryFilter();
  renderAssetLibrary();
  updateLibrarySummary();
  if (activeLayout && !layoutDirty) reconcileLayoutObjects(activeLayout);
  return true;
}

async function refreshAssetCatalog({ announce = false, force = false } = {}) {
  if (catalogLoading) return false;
  setCatalogLoading(true);
  try {
    const catalog = await loadAssetCatalog();
    const changed = applyAssetCatalog(catalog, { force });
    if (announce) {
      showToast(changed ? "이미지 라이브러리를 새로 불러왔습니다." : "이미지 라이브러리가 최신 상태입니다.");
    }
    return true;
  } catch {
    catalogLoaded = false;
    updateLibrarySummary();
    renderAssetLibrary();
    if (announce) showToast("이미지 라이브러리를 불러오지 못했습니다.", 4200);
    return false;
  } finally {
    setCatalogLoading(false);
  }
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

function clearObjectManagerAvoidance() {
  if (objectManagerAvoidanceFrame !== null) {
    window.cancelAnimationFrame(objectManagerAvoidanceFrame);
    objectManagerAvoidanceFrame = null;
  }
  objectManagerAvoidanceLatched = false;
  objectManager.classList.remove("is-interaction-hidden");
}

function updateObjectManagerAvoidance() {
  objectManagerAvoidanceFrame = null;
  if (
    !isPlacementEditor ||
    objectManagerCollapsed ||
    objectManagerAvoidanceLatched ||
    !activeObjectInteraction
  ) {
    return;
  }

  const objectRect = activeObjectInteraction.getBoundingClientRect();
  const managerRect = objectManager.getBoundingClientRect();
  const proximity = 48;
  const isNearManager =
    objectRect.right >= managerRect.left - proximity &&
    objectRect.left <= managerRect.right + proximity &&
    objectRect.bottom >= managerRect.top - proximity &&
    objectRect.top <= managerRect.bottom + proximity;

  if (isNearManager) {
    objectManagerAvoidanceLatched = true;
    objectManager.classList.add("is-interaction-hidden");
  }
}

function scheduleObjectManagerAvoidance() {
  if (objectManagerAvoidanceFrame === null) {
    objectManagerAvoidanceFrame = window.requestAnimationFrame(updateObjectManagerAvoidance);
  }
}

function beginObjectInteraction(element) {
  if (!isPlacementEditor) return;
  activeObjectInteraction = element;
  objectManagerAvoidanceLatched = false;
  scheduleObjectManagerAvoidance();
}

function endObjectInteraction(element) {
  if (!isPlacementEditor || activeObjectInteraction !== element) return;
  activeObjectInteraction = null;
  clearObjectManagerAvoidance();
}

function setObjectManagerCollapsed(collapsed) {
  if (!isPlacementEditor) return;
  objectManagerCollapsed = collapsed;
  clearObjectManagerAvoidance();
  objectManager.classList.toggle("is-collapsed", collapsed);
  document.body.classList.toggle("is-object-manager-collapsed", collapsed);
  objectManager.setAttribute("aria-hidden", String(collapsed));
  objectManagerToggle.setAttribute("aria-expanded", String(!collapsed));

  const label = collapsed ? "이미지 선택 창 펼치기" : "이미지 선택 창 접기";
  objectManagerToggle.setAttribute("aria-label", label);
  objectManagerToggle.title = label;
}

function updateSelectedObjectRemoveButton() {
  if (!isPlacementEditor) return;
  const element = magnifiers.find((item) => item.dataset.icon === selectedObjectId);
  selectedObjectRemoveButton.hidden = !element;
  if (!element) return;

  const buttonRadius = 22;
  const maxLeft = Math.max(buttonRadius, study.clientWidth - getRightInset() - buttonRadius);
  const maxTop = Math.max(buttonRadius, study.scrollHeight - buttonRadius);
  const left = Math.min(maxLeft, Math.max(buttonRadius, element.offsetLeft + element.offsetWidth));
  const top = Math.min(maxTop, Math.max(buttonRadius, element.offsetTop));
  const label = element.dataset.label || "선택한 오브젝트";

  selectedObjectRemoveButton.style.left = `${left}px`;
  selectedObjectRemoveButton.style.top = `${top}px`;
  selectedObjectRemoveButton.setAttribute("aria-label", `선택한 ${label} 오브젝트 해제`);
  selectedObjectRemoveButton.title = `${label} 오브젝트 해제`;
}

function setSelectedObject(element) {
  selectedObjectId = element?.dataset.icon ?? null;
  magnifiers.forEach((item) => {
    item.classList.toggle("is-selected", item === element);
  });
  renderAssetLibrary();
  updateSelectedObjectRemoveButton();

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

  const filters = [
    ALL_CATEGORY,
    ACTIVE_CATEGORY,
    ...iconCategories.filter((category) => category !== ACTIVE_CATEGORY),
  ];
  filters.forEach((category) => {
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
  const activeAssetFiles = new Set(magnifiers.map((element) => element.dataset.asset));
  const assets = iconAssets.filter((asset) => {
    const categoryMatches = selectedCategory === ALL_CATEGORY ||
      (selectedCategory === ACTIVE_CATEGORY
        ? activeAssetFiles.has(asset.file)
        : asset.category === selectedCategory);
    const queryMatches = !query ||
      `${asset.name} ${asset.file} ${asset.category}`.toLocaleLowerCase("ko").includes(query);
    return categoryMatches && queryMatches;
  });

  assetGridEmpty.hidden = assets.length > 0;
  assetGridEmpty.textContent = !catalogLoaded
    ? "이미지 라이브러리를 불러오는 중입니다."
    : query
      ? "검색 결과가 없습니다."
      : selectedCategory === ACTIVE_CATEGORY
        ? "생성된 사도가 없습니다."
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
    selectButton.setAttribute("aria-pressed", String(active));
    selectButton.setAttribute("aria-label", `${asset.name} 오브젝트 ${active ? "해제" : "추가"}`);
    selectButton.addEventListener("click", () => toggleAsset(asset, !active));

    thumbnail.src = getLibraryAssetUrl(asset.file, asset.revision);
    thumbnail.alt = "";
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
  onInteractionEnd: endObjectInteraction,
  onInteractionStart: beginObjectInteraction,
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
  image.src = getLibraryAssetUrl(asset.file, asset.revision);
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
  updateSelectedObjectRemoveButton();
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
  updateSelectedObjectRemoveButton();
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
  updateSelectedObjectRemoveButton();
  if (selectedElement === activeObjectInteraction) scheduleObjectManagerAvoidance();
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
  const applied = applyLayout({ ...layout, objects }, magnifiers, study);
  updateSelectedObjectRemoveButton();
  return applied;
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
  objectManagerToggle.hidden = false;
  renderCategoryFilter();
  renderAssetLibrary();
  updateLibrarySummary();
  updatePlacementStatus("0개 오브젝트 · 변경사항 없음");

  assetSearchInput.addEventListener("input", () => {
    assetSearchQuery = assetSearchInput.value;
    renderAssetLibrary();
  });

  openLibraryButton.addEventListener("click", async () => {
    openLibraryButton.disabled = true;
    try {
      await openImageLibrary();
      showToast("이미지 라이브러리 폴더를 열었습니다.");
    } catch {
      showToast("이미지 폴더를 열지 못했습니다.", 4200);
    } finally {
      openLibraryButton.disabled = false;
    }
  });

  importPackButton.addEventListener("click", () => imagePackInput.click());

  imagePackInput.addEventListener("change", async () => {
    const [file] = imagePackInput.files;
    imagePackInput.value = "";
    if (!file) return;
    if (!file.name.toLocaleLowerCase("ko").endsWith(".zip")) {
      showToast("ZIP 형식의 이미지 팩을 선택해 주세요.", 4200);
      return;
    }
    if (file.size > 128 * 1024 * 1024) {
      showToast("이미지 팩은 128MB 이하여야 합니다.", 4200);
      return;
    }

    setCatalogLoading(true);
    importPackButton.classList.add("is-loading");
    importPackButton.setAttribute("aria-busy", "true");
    try {
      const result = await importImagePack(file);
      applyAssetCatalog(result.catalog, { force: true });
      showToast(`${result.imported}개 이미지를 라이브러리에 가져왔습니다.`);
    } catch {
      showToast("이미지 팩을 가져오지 못했습니다. ZIP 구조를 확인해 주세요.", 4800);
    } finally {
      importPackButton.classList.remove("is-loading");
      importPackButton.setAttribute("aria-busy", "false");
      setCatalogLoading(false);
    }
  });

  refreshLibraryButton.addEventListener("click", () => {
    void refreshAssetCatalog({ announce: true, force: true });
  });

  objectManagerToggle.addEventListener("click", () => {
    setObjectManagerCollapsed(!objectManagerCollapsed);
  });

  selectedObjectRemoveButton.addEventListener("click", () => {
    const element = magnifiers.find((item) => item.dataset.icon === selectedObjectId);
    if (!element) return;
    const asset = assetByFile.get(element.dataset.asset);
    if (asset) {
      toggleAsset(asset, false);
      return;
    }

    const label = element.dataset.label || "선택한 오브젝트";
    removeMagnifier(element);
    markLayoutChanged();
    showToast(`${label} 오브젝트를 해제했습니다. 배치 저장 전까지는 확정되지 않습니다.`);
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
  window.setInterval(() => refreshAssetCatalog(), 10000);
}

initializationPromise = refreshAssetCatalog().then(() => syncSavedLayout({ silent: true })).then((loaded) => {
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
  updateSelectedObjectRemoveButton();
  if (activeObjectInteraction) scheduleObjectManagerAvoidance();
}, { passive: true });
