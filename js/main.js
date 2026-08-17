import { createBackgroundRenderer } from "./background.js";
import { createGroupFrameController } from "./group.js";
import { makeDraggableGroup } from "./interaction.js";
import {
  applyLayout,
  captureLayout,
  closePlacementEditor,
  getBackgroundAssetUrl,
  getLibraryAssetUrl,
  importImagePack,
  loadAssetCatalog,
  loadSavedLayout,
  openImageLibrary,
  openPlacementEditor,
  saveLayout,
  uploadBackground,
} from "./layout.js";
import {
  buildFrontSpecularMap,
  buildPlateWalls,
  updateSpecularAngle,
  updateSpecularOpacity,
} from "./scene.js";

const study = document.querySelector("#study");
const customBackground = document.querySelector("#custom-background");
const magnifierTemplate = document.querySelector("#magnifier-template");
const placementToolbar = document.querySelector("#placement-toolbar");
const placementStatus = document.querySelector("#placement-status");
const placementStatusText = document.querySelector("#placement-status-text");
const resetLayoutButton = document.querySelector("#reset-layout");
const cancelLayoutButton = document.querySelector("#cancel-layout");
const saveLayoutButton = document.querySelector("#save-layout");
const groupEditToggle = document.querySelector("#group-edit-toggle");
const groupFrame = document.querySelector("#group-frame");
const groupSpacingHandle = document.querySelector("#group-spacing-handle");
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
const gridColumnsInput = document.querySelector("#grid-columns");
const gridColumnsDecrease = document.querySelector("#grid-columns-decrease");
const gridColumnsIncrease = document.querySelector("#grid-columns-increase");
const applyGridButton = document.querySelector("#apply-grid");
const gridShape = document.querySelector("#grid-shape");
const backgroundSummary = document.querySelector("#background-summary");
const backgroundFileButton = document.querySelector("#background-file-button");
const backgroundFileInput = document.querySelector("#background-file-input");
const backgroundClearButton = document.querySelector("#background-clear");
const backgroundUrlInput = document.querySelector("#background-url-input");
const backgroundUrlApplyButton = document.querySelector("#background-url-apply");
const backgroundOverlayInput = document.querySelector("#background-overlay");
const backgroundOverlayValue = document.querySelector("#background-overlay-value");
const backgroundStatus = document.querySelector("#background-status");
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
let groupEditActive = false;
let groupController = null;
let activeBackground = {
  mode: "shader",
  value: "",
  revision: "",
  overlayOpacity: 0.14,
};

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

function normalizeBackgroundConfiguration(background) {
  const overlayOpacity = Number(background?.overlayOpacity);
  const normalizedOverlay = Number.isFinite(overlayOpacity)
    ? Math.min(0.7, Math.max(0, overlayOpacity))
    : 0.14;
  const mode = String(background?.mode ?? "shader");

  if (mode === "local" && typeof background?.value === "string" && background.value) {
    return {
      mode,
      value: background.value,
      revision: String(background.revision ?? ""),
      overlayOpacity: normalizedOverlay,
    };
  }

  if (mode === "url") {
    const value = String(background?.value ?? "").trim();
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return { mode, value: parsed.href, revision: "", overlayOpacity: normalizedOverlay };
      }
    } catch {
      // Use the shader fallback below.
    }
  }

  return { mode: "shader", value: "", revision: "", overlayOpacity: normalizedOverlay };
}

function updateBackgroundControls() {
  if (!isPlacementEditor) return;
  const percentage = Math.round(activeBackground.overlayOpacity * 100);
  backgroundOverlayInput.value = String(percentage);
  backgroundOverlayValue.textContent = `${percentage}%`;
  backgroundUrlInput.value = activeBackground.mode === "url" ? activeBackground.value : "";

  if (activeBackground.mode === "local") {
    backgroundSummary.textContent = "개인 파일";
    backgroundStatus.textContent = `${activeBackground.value} 파일을 배경으로 사용 중입니다.`;
  } else if (activeBackground.mode === "url") {
    backgroundSummary.textContent = "URL 배경";
    backgroundStatus.textContent = "입력한 URL의 이미지 또는 GIF를 배경으로 사용 중입니다.";
  } else {
    backgroundSummary.textContent = "기본 배경";
    backgroundStatus.textContent = "현재 WebGL 기본 배경을 사용 중입니다.";
  }
}

function applyBackground(background, { syncControls = true } = {}) {
  activeBackground = normalizeBackgroundConfiguration(background);
  const hasCustomBackground = activeBackground.mode !== "shader";
  document.body.classList.remove("has-background-error");
  document.body.classList.toggle("has-custom-background", hasCustomBackground);
  document.body.style.setProperty(
    "--background-overlay-opacity",
    activeBackground.overlayOpacity.toFixed(3),
  );

  if (hasCustomBackground) {
    customBackground.src = activeBackground.mode === "local"
      ? getBackgroundAssetUrl(activeBackground.value, activeBackground.revision)
      : activeBackground.value;
    customBackground.hidden = false;
  } else {
    customBackground.hidden = true;
    customBackground.removeAttribute("src");
  }

  if (syncControls) updateBackgroundControls();
}

function captureCurrentLayout() {
  return captureLayout(magnifiers, study, activeBackground);
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

function updateGroupManagerAvoidance() {
  if (!isPlacementEditor) return;
  let shouldHide = false;
  if (groupEditActive && !objectManagerCollapsed && !groupFrame.hidden) {
    const frameRect = groupFrame.getBoundingClientRect();
    const managerRect = objectManager.getBoundingClientRect();
    const proximity = 12;
    shouldHide =
      frameRect.right >= managerRect.left - proximity &&
      frameRect.left <= managerRect.right + proximity &&
      frameRect.bottom >= managerRect.top - proximity &&
      frameRect.top <= managerRect.bottom + proximity;
  }
  objectManager.classList.toggle("is-group-overlap-hidden", shouldHide);
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
  updateGroupManagerAvoidance();
}

function getRequestedGridColumns() {
  const requested = Number.parseInt(gridColumnsInput.value, 10);
  return Math.min(12, Math.max(1, Number.isFinite(requested) ? requested : 4));
}

function setRequestedGridColumns(value) {
  gridColumnsInput.value = String(Math.min(12, Math.max(1, Number(value) || 1)));
  updateGridShape();
}

function updateGridShape() {
  if (!isPlacementEditor) return;
  const columns = Math.min(getRequestedGridColumns(), Math.max(1, magnifiers.length));
  const rows = magnifiers.length > 0 ? Math.ceil(magnifiers.length / columns) : 0;
  gridShape.textContent = magnifiers.length > 0
    ? `${columns} × ${rows} · ${magnifiers.length}개`
    : "0개";
}

function updateGroupControls() {
  if (!isPlacementEditor) return;
  const canGroup = magnifiers.length >= 2;
  groupEditToggle.disabled = !canGroup;
  if (!canGroup && groupEditActive) setGroupEditActive(false);
  groupController?.refresh();
  updateGroupManagerAvoidance();
  updateGridShape();
}

function setGroupEditActive(active) {
  if (!isPlacementEditor || !groupController) return false;
  groupEditActive = groupController.setActive(Boolean(active));
  document.body.classList.toggle("is-group-editing", groupEditActive);
  groupEditToggle.setAttribute("aria-pressed", String(groupEditActive));
  groupEditToggle.textContent = groupEditActive ? "자유 배치" : "그룹 조작";
  if (groupEditActive) setSelectedObject(null);
  updateSelectedObjectRemoveButton();
  updateGroupManagerAvoidance();
  updatePlacementStatus(
    `${magnifiers.length}개 오브젝트 · ${groupEditActive ? "그룹 조작 중" : "자유 배치"}`,
  );
  return groupEditActive;
}

function updateSelectedObjectRemoveButton() {
  if (!isPlacementEditor) return;
  const element = magnifiers.find((item) => item.dataset.icon === selectedObjectId);
  selectedObjectRemoveButton.hidden = !element || groupEditActive;
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
  canDragElement: () => !groupEditActive,
  draggable: true,
  onInteractionEnd: endObjectInteraction,
  onInteractionStart: beginObjectInteraction,
  onPositionChange: markLayoutChanged,
  onSelectionChange: setSelectedObject,
});

groupController = createGroupFrameController(groupFrame, groupSpacingHandle, study, {
  getElements: () => magnifiers,
  onInteractionStart: () => {
    setSelectedObject(null);
    beginObjectInteraction(groupFrame);
  },
  onInteractionEnd: () => endObjectInteraction(groupFrame),
  onPositionChange: () => markLayoutChanged(groupFrame),
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
  updateGroupControls();
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
  updateGroupControls();
}

function arrangeMagnifiers(requestedColumns = null) {
  if (magnifiers.length === 0) {
    study.style.minHeight = "100svh";
    updateGroupControls();
    return 0;
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
  const desiredColumns = requestedColumns === null ? 4 : requestedColumns;
  const columns = Math.min(desiredColumns, fittingColumns, magnifiers.length);
  const rows = Math.ceil(magnifiers.length / columns);
  const gridHeight = rows * lensHeight + (rows - 1) * gap;
  const contentWidth = study.clientWidth - getRightInset();
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
    const rowCount = Math.min(columns, magnifiers.length - row * columns);
    const rowWidth = rowCount * lensWidth + (rowCount - 1) * gap;
    const rowStartX = Math.max(0, (contentWidth - rowWidth) / 2);
    magnifier.style.left = `${rowStartX + column * (lensWidth + gap)}px`;
    magnifier.style.top = `${startY + row * (lensHeight + gap)}px`;
  });
  updateSelectedObjectRemoveButton();
  groupController?.refresh();
  updateGroupControls();
  return columns;
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
    const layout = captureCurrentLayout();
    void persistDirectLayout(layout, layoutRevision);
  }, 320);
}

function markLayoutChanged(selectedElement) {
  activeLayout = captureCurrentLayout();
  activeLayoutTimestamp = activeLayout.updatedAt;
  layoutDirty = true;
  layoutRevision += 1;
  scheduleDirectLayoutSave();
  updateSelectedObjectRemoveButton();
  if (selectedElement === activeObjectInteraction) scheduleObjectManagerAvoidance();
  if (groupEditActive) updateGroupManagerAvoidance();
  updatePlacementStatus(
    `${magnifiers.length}개 오브젝트 · ${selectedElement?.dataset.label ?? "목록"} 수정됨`,
  );
}

function reconcileLayoutObjects(layout) {
  applyBackground(layout.background);
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
  updateGroupControls();
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
applyBackground(activeBackground);

customBackground.addEventListener("load", () => {
  document.body.classList.remove("has-background-error");
});
customBackground.addEventListener("error", () => {
  if (activeBackground.mode === "shader") return;
  document.body.classList.add("has-background-error");
  if (isPlacementEditor) {
    backgroundStatus.textContent = "배경을 불러오지 못해 WebGL 기본 배경을 표시합니다.";
  }
});

if (isPlacementEditor) {
  placementToolbar.hidden = false;
  placementStatus.hidden = false;
  objectManager.hidden = false;
  objectManagerToggle.hidden = false;
  renderCategoryFilter();
  renderAssetLibrary();
  updateLibrarySummary();
  updateGroupControls();
  updateBackgroundControls();
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

  groupEditToggle.addEventListener("click", () => {
    setGroupEditActive(!groupEditActive);
  });

  gridColumnsInput.addEventListener("input", () => {
    setRequestedGridColumns(gridColumnsInput.value);
  });
  gridColumnsDecrease.addEventListener("click", () => {
    setRequestedGridColumns(getRequestedGridColumns() - 1);
  });
  gridColumnsIncrease.addEventListener("click", () => {
    setRequestedGridColumns(getRequestedGridColumns() + 1);
  });
  applyGridButton.addEventListener("click", () => {
    const requestedColumns = getRequestedGridColumns();
    const appliedColumns = arrangeMagnifiers(requestedColumns);
    if (appliedColumns === 0) {
      showToast("먼저 오브젝트를 두 개 이상 추가해 주세요.");
      return;
    }
    setRequestedGridColumns(appliedColumns);
    setSelectedObject(null);
    markLayoutChanged();
    if (magnifiers.length >= 2) setGroupEditActive(true);
    showToast(`${appliedColumns}열 격자로 정렬했습니다.`);
  });

  backgroundFileButton.addEventListener("click", () => backgroundFileInput.click());
  backgroundFileInput.addEventListener("change", async () => {
    const [file] = backgroundFileInput.files;
    backgroundFileInput.value = "";
    if (!file) return;
    if (!/\.(gif|jpe?g|png|webp)$/i.test(file.name)) {
      showToast("GIF, JPG, PNG 또는 WebP 파일을 선택해 주세요.", 4200);
      return;
    }
    if (file.size > 128 * 1024 * 1024) {
      showToast("배경 파일은 128MB 이하여야 합니다.", 4200);
      return;
    }

    backgroundFileButton.disabled = true;
    backgroundFileButton.setAttribute("aria-busy", "true");
    backgroundStatus.textContent = "배경 파일을 컨트롤러에 복사하는 중입니다.";
    try {
      const result = await uploadBackground(file);
      applyBackground({
        mode: "local",
        value: result.background.file,
        revision: result.background.revision,
        overlayOpacity: activeBackground.overlayOpacity,
      });
      markLayoutChanged();
      showToast("개인 배경 파일을 적용했습니다.");
    } catch {
      backgroundStatus.textContent = "배경 파일을 저장하지 못했습니다.";
      showToast("업데이트된 컨트롤러가 실행 중인지 확인해 주세요.", 4800);
    } finally {
      backgroundFileButton.disabled = false;
      backgroundFileButton.setAttribute("aria-busy", "false");
    }
  });

  backgroundUrlApplyButton.addEventListener("click", () => {
    const candidate = normalizeBackgroundConfiguration({
      mode: "url",
      value: backgroundUrlInput.value,
      overlayOpacity: activeBackground.overlayOpacity,
    });
    if (candidate.mode !== "url") {
      backgroundUrlInput.setAttribute("aria-invalid", "true");
      showToast("http:// 또는 https://로 시작하는 이미지 URL을 입력해 주세요.", 4200);
      return;
    }
    backgroundUrlInput.removeAttribute("aria-invalid");
    applyBackground(candidate);
    markLayoutChanged();
    showToast("URL 배경을 적용했습니다.");
  });

  backgroundUrlInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    backgroundUrlApplyButton.click();
    event.preventDefault();
  });

  backgroundClearButton.addEventListener("click", () => {
    applyBackground({
      mode: "shader",
      overlayOpacity: activeBackground.overlayOpacity,
    });
    markLayoutChanged();
    showToast("WebGL 기본 배경으로 되돌렸습니다.");
  });

  backgroundOverlayInput.addEventListener("input", () => {
    const overlayOpacity = Number(backgroundOverlayInput.value) / 100;
    applyBackground({ ...activeBackground, overlayOpacity }, { syncControls: false });
    backgroundOverlayValue.textContent = `${backgroundOverlayInput.value}%`;
  });
  backgroundOverlayInput.addEventListener("change", () => {
    updateBackgroundControls();
    markLayoutChanged();
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
    const layout = captureCurrentLayout();
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
    activeLayout = {
      version: 3,
      updatedAt: null,
      background: activeBackground,
      objects: [],
    };
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
  groupController?.refresh();
  if (activeObjectInteraction) scheduleObjectManagerAvoidance();
}, { passive: true });
