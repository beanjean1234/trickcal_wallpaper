const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function readBox(element) {
  const left = Number.parseFloat(element.style.left || getComputedStyle(element).left) || 0;
  const top = Number.parseFloat(element.style.top || getComputedStyle(element).top) || 0;
  return {
    element,
    left,
    top,
    width: element.offsetWidth,
    height: element.offsetHeight,
    centerX: left + element.offsetWidth / 2,
    centerY: top + element.offsetHeight / 2,
  };
}

function getBounds(boxes) {
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.left + box.width)),
    bottom: Math.max(...boxes.map((box) => box.top + box.height)),
  };
}

function getMinimumScale(values, objectSize) {
  const unique = [...new Set(values.map((value) => Math.round(value * 1000) / 1000))]
    .sort((left, right) => left - right);
  let minimumDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < unique.length; index += 1) {
    minimumDistance = Math.min(minimumDistance, unique[index] - unique[index - 1]);
  }
  if (!Number.isFinite(minimumDistance) || minimumDistance <= 0) return 1;
  return Math.min(1, objectSize / minimumDistance);
}

export function createGroupFrameController(
  frame,
  spacingHandle,
  container,
  {
    getElements,
    onInteractionEnd = () => {},
    onInteractionStart = () => {},
    onPositionChange = () => {},
  },
) {
  const framePadding = 12;
  let active = false;
  let dragState = null;
  let resizeState = null;

  function getBoxes() {
    return getElements().map(readBox);
  }

  function refresh() {
    const boxes = getBoxes();
    const shouldShow = active && boxes.length >= 2;
    frame.hidden = !shouldShow;
    if (!shouldShow) return;

    const bounds = getBounds(boxes);
    frame.style.left = `${bounds.left - framePadding}px`;
    frame.style.top = `${bounds.top - framePadding}px`;
    frame.style.width = `${bounds.right - bounds.left + framePadding * 2}px`;
    frame.style.height = `${bounds.bottom - bounds.top + framePadding * 2}px`;
  }

  function setActive(nextActive) {
    active = Boolean(nextActive) && getElements().length >= 2;
    if (!active) {
      dragState = null;
      resizeState = null;
      frame.classList.remove("is-dragging", "is-resizing");
    }
    refresh();
    return active;
  }

  function makeResizeSnapshot() {
    const boxes = getBoxes();
    const frameRect = frame.getBoundingClientRect();
    const centersX = boxes.map((box) => box.centerX);
    const centersY = boxes.map((box) => box.centerY);
    const minCenterX = Math.min(...centersX);
    const maxCenterX = Math.max(...centersX);
    const minCenterY = Math.min(...centersY);
    const maxCenterY = Math.max(...centersY);
    const centerX = (minCenterX + maxCenterX) / 2;
    const centerY = (minCenterY + maxCenterY) / 2;
    const spreadX = maxCenterX - minCenterX;
    const spreadY = maxCenterY - minCenterY;
    const containerWidth = container.clientWidth;
    const containerHeight = Math.max(container.scrollHeight, window.innerHeight);
    let maximumScaleX = 12;
    let maximumScaleY = 12;

    boxes.forEach((box) => {
      const relativeX = box.centerX - centerX;
      const relativeY = box.centerY - centerY;
      if (relativeX > 0) {
        maximumScaleX = Math.min(
          maximumScaleX,
          (containerWidth - centerX - box.width / 2) / relativeX,
        );
      } else if (relativeX < 0) {
        maximumScaleX = Math.min(
          maximumScaleX,
          (centerX - box.width / 2) / -relativeX,
        );
      }
      if (relativeY > 0) {
        maximumScaleY = Math.min(
          maximumScaleY,
          (containerHeight - centerY - box.height / 2) / relativeY,
        );
      } else if (relativeY < 0) {
        maximumScaleY = Math.min(
          maximumScaleY,
          (centerY - box.height / 2) / -relativeY,
        );
      }
    });

    const defaultWidth = Math.max(...boxes.map((box) => box.width));
    const defaultHeight = Math.max(...boxes.map((box) => box.height));
    return {
      boxes,
      centerX,
      centerY,
      spreadX,
      spreadY,
      startPointerX: frameRect.right,
      startPointerY: frameRect.top,
      minimumScaleX: getMinimumScale(centersX, defaultWidth),
      minimumScaleY: getMinimumScale(centersY, defaultHeight),
      maximumScaleX: Math.max(1, maximumScaleX),
      maximumScaleY: Math.max(1, maximumScaleY),
    };
  }

  function applyResize(snapshot, clientX, clientY) {
    const desiredSpreadX = Math.max(
      0,
      snapshot.spreadX + (clientX - snapshot.startPointerX) * 2,
    );
    const desiredSpreadY = Math.max(
      0,
      snapshot.spreadY - (clientY - snapshot.startPointerY) * 2,
    );
    const scaleX = snapshot.spreadX > 0
      ? clamp(
        desiredSpreadX / snapshot.spreadX,
        snapshot.minimumScaleX,
        snapshot.maximumScaleX,
      )
      : 1;
    const scaleY = snapshot.spreadY > 0
      ? clamp(
        desiredSpreadY / snapshot.spreadY,
        snapshot.minimumScaleY,
        snapshot.maximumScaleY,
      )
      : 1;

    snapshot.boxes.forEach((box) => {
      const nextCenterX = snapshot.centerX + (box.centerX - snapshot.centerX) * scaleX;
      const nextCenterY = snapshot.centerY + (box.centerY - snapshot.centerY) * scaleY;
      box.element.style.left = `${nextCenterX - box.width / 2}px`;
      box.element.style.top = `${nextCenterY - box.height / 2}px`;
    });
    refresh();
    onPositionChange();
  }

  frame.addEventListener("pointerdown", (event) => {
    if (!active || event.target === spacingHandle || spacingHandle.contains(event.target)) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const boxes = getBoxes();
    if (boxes.length < 2) return;
    dragState = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      boxes,
      bounds: getBounds(boxes),
    };
    frame.setPointerCapture(event.pointerId);
    frame.classList.add("is-dragging");
    onInteractionStart();
    event.preventDefault();
  });

  frame.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const containerHeight = Math.max(container.scrollHeight, window.innerHeight);
    const rawX = event.clientX - dragState.clientX;
    const rawY = event.clientY - dragState.clientY;
    const deltaX = clamp(
      rawX,
      -dragState.bounds.left,
      container.clientWidth - dragState.bounds.right,
    );
    const deltaY = clamp(
      rawY,
      -dragState.bounds.top,
      containerHeight - dragState.bounds.bottom,
    );
    dragState.boxes.forEach((box) => {
      box.element.style.left = `${box.left + deltaX}px`;
      box.element.style.top = `${box.top + deltaY}px`;
    });
    refresh();
    onPositionChange();
  });

  function endGroupDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    dragState = null;
    frame.classList.remove("is-dragging");
    if (frame.hasPointerCapture(event.pointerId)) frame.releasePointerCapture(event.pointerId);
    onInteractionEnd();
  }

  frame.addEventListener("pointerup", endGroupDrag);
  frame.addEventListener("pointercancel", endGroupDrag);
  frame.addEventListener("lostpointercapture", endGroupDrag);
  window.addEventListener("pointerup", endGroupDrag);
  window.addEventListener("pointercancel", endGroupDrag);

  spacingHandle.addEventListener("pointerdown", (event) => {
    if (!active) return;
    if (event.button !== 0 && event.pointerType === "mouse") return;
    const frameRect = frame.getBoundingClientRect();
    resizeState = {
      pointerId: event.pointerId,
      snapshot: makeResizeSnapshot(),
      pointerOffsetX: event.clientX - frameRect.right,
      pointerOffsetY: event.clientY - frameRect.top,
    };
    spacingHandle.setPointerCapture(event.pointerId);
    frame.classList.add("is-resizing");
    onInteractionStart();
    event.stopPropagation();
    event.preventDefault();
  });

  spacingHandle.addEventListener("pointermove", (event) => {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    applyResize(
      resizeState.snapshot,
      event.clientX - resizeState.pointerOffsetX,
      event.clientY - resizeState.pointerOffsetY,
    );
  });

  function endResize(event) {
    if (!resizeState || event.pointerId !== resizeState.pointerId) return;
    resizeState = null;
    frame.classList.remove("is-resizing");
    if (spacingHandle.hasPointerCapture(event.pointerId)) {
      spacingHandle.releasePointerCapture(event.pointerId);
    }
    onInteractionEnd();
  }

  spacingHandle.addEventListener("pointerup", endResize);
  spacingHandle.addEventListener("pointercancel", endResize);
  spacingHandle.addEventListener("lostpointercapture", endResize);
  window.addEventListener("pointerup", endResize);
  window.addEventListener("pointercancel", endResize);

  frame.addEventListener("keydown", (event) => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!active || !direction || event.target === spacingHandle) return;
    const boxes = getBoxes();
    const bounds = getBounds(boxes);
    const step = event.shiftKey ? 24 : 8;
    const deltaX = clamp(
      direction[0] * step,
      -bounds.left,
      container.clientWidth - bounds.right,
    );
    const deltaY = clamp(
      direction[1] * step,
      -bounds.top,
      Math.max(container.scrollHeight, window.innerHeight) - bounds.bottom,
    );
    onInteractionStart();
    boxes.forEach((box) => {
      box.element.style.left = `${box.left + deltaX}px`;
      box.element.style.top = `${box.top + deltaY}px`;
    });
    refresh();
    onPositionChange();
    onInteractionEnd();
    event.preventDefault();
  });

  spacingHandle.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 24 : 8;
    const delta = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }[event.key];
    if (!active || !delta) return;
    const snapshot = makeResizeSnapshot();
    const frameRect = frame.getBoundingClientRect();
    onInteractionStart();
    applyResize(snapshot, frameRect.right + delta[0], frameRect.top + delta[1]);
    onInteractionEnd();
    event.preventDefault();
  });

  refresh();
  return {
    isActive: () => active,
    refresh,
    setActive,
  };
}
