import { LENS } from "./settings.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function getRightInset(container) {
  return Number.parseFloat(
    getComputedStyle(container).getPropertyValue("--interaction-right-inset"),
  ) || 0;
}

function clampPosition(element, container, left, top) {
  const containerRect = container.getBoundingClientRect();
  return {
    left: clamp(
      left,
      0,
      Math.max(0, containerRect.width - getRightInset(container) - element.offsetWidth),
    ),
    top: clamp(top, 0, Math.max(0, container.scrollHeight - element.offsetHeight)),
  };
}

function updateAriaValue(element, container, left) {
  const max = Math.max(
    1,
    container.clientWidth - getRightInset(container) - element.offsetWidth,
  );
  element.setAttribute("aria-valuenow", String(Math.round((left / max) * 100)));
}

export function makeDraggableGroup(
  initialElements,
  container,
  {
    canDragElement = () => true,
    draggable = true,
    onInteractionEnd = () => {},
    onInteractionStart = () => {},
    onPositionChange = () => {},
    onSelectionChange = () => {},
  } = {},
) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const elements = [...initialElements];
  const dragStates = new Map();
  let pointerX = 0;
  let pointerY = 0;
  let pointerActive = false;
  let tiltFrame = null;
  let topLayer = 20;

  const setPointerInput = () => {
    document.documentElement.classList.add("is-pointer-input");
  };
  const setKeyboardInput = () => {
    document.documentElement.classList.remove("is-pointer-input");
  };

  const renderTilt = () => {
    tiltFrame = null;
    const elementRects = elements.map((element) => [
      element,
      element.getBoundingClientRect(),
    ]);

    for (const [element, elementRect] of elementRects) {
      if (!pointerActive || reducedMotion.matches) {
        element.style.setProperty("--pointer-x", "50%");
        element.style.setProperty("--pointer-y", "50%");
        element.style.setProperty("--shine-position-x", "50%");
        element.style.setProperty("--tilt-x", "0deg");
        element.style.setProperty("--tilt-y", "0deg");
        continue;
      }

      const localX = clamp(
        (pointerX - elementRect.left) / Math.max(elementRect.width, 1),
        0,
        1,
      );
      const localY = clamp(
        (pointerY - elementRect.top) / Math.max(elementRect.height, 1),
        0,
        1,
      );
      element.style.setProperty("--pointer-x", `${localX * 100}%`);
      element.style.setProperty("--pointer-y", `${localY * 100}%`);
      element.style.setProperty("--shine-position-x", `${20 + localX * 60}%`);

      const centerX = elementRect.left + elementRect.width / 2;
      const centerY = elementRect.top + elementRect.height / 2;
      const normalizedX = clamp(
        (pointerX - centerX) / Math.max(window.innerWidth / 2, 1),
        -1,
        1,
      );
      const normalizedY = clamp(
        (pointerY - centerY) / Math.max(window.innerHeight / 2, 1),
        -1,
        1,
      );
      element.style.setProperty("--tilt-x", `${-normalizedY * LENS.maxTilt}deg`);
      element.style.setProperty("--tilt-y", `${normalizedX * LENS.maxTilt}deg`);
    }
  };

  const scheduleTilt = () => {
    if (tiltFrame === null) tiltFrame = window.requestAnimationFrame(renderTilt);
  };

  const attachElement = (element) => {
    if (dragStates.has(element)) return;
    const dragState = {
      activePointer: null,
      keyboardActive: false,
      pointerOffsetX: 0,
      pointerOffsetY: 0,
    };
    dragStates.set(element, dragState);
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };

    const bringToFront = () => {
      topLayer += 1;
      element.style.zIndex = String(topLayer);
    };

    element.addEventListener("focus", bringToFront);
    element.addEventListener("pointerdown", (event) => {
      if (!draggable || !canDragElement(element, event)) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;

      const elementRect = element.getBoundingClientRect();
      dragState.activePointer = event.pointerId;
      dragState.pointerOffsetX = event.clientX - elementRect.left;
      dragState.pointerOffsetY = event.clientY - elementRect.top;
      element.setPointerCapture(event.pointerId);
      element.classList.add("is-dragging");
      elements.forEach((item) => item.classList.toggle("is-selected", item === element));
      onSelectionChange(element);
      onInteractionStart(element);
      bringToFront();
      event.preventDefault();
    });

    element.addEventListener("pointermove", (event) => {
      if (event.pointerId !== dragState.activePointer) return;

      const containerRect = container.getBoundingClientRect();
      const next = clampPosition(
        element,
        container,
        event.clientX - containerRect.left - dragState.pointerOffsetX,
        event.clientY - containerRect.top - dragState.pointerOffsetY,
      );

      element.style.left = `${next.left}px`;
      element.style.top = `${next.top}px`;
      updateAriaValue(element, container, next.left);
      onPositionChange(element);
    });

    const endDrag = (event) => {
      if (event.pointerId !== dragState.activePointer) return;
      dragState.activePointer = null;
      element.classList.remove("is-dragging");
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId);
      }
      onInteractionEnd(element);
    };

    element.addEventListener("pointerup", endDrag);
    element.addEventListener("pointercancel", endDrag);
    element.addEventListener("lostpointercapture", endDrag);
    element.addEventListener("keydown", (event) => {
      if (!draggable || !canDragElement(element, event)) return;
      const direction = directions[event.key];
      if (!direction) return;

      if (!dragState.keyboardActive) {
        dragState.keyboardActive = true;
        element.classList.add("is-dragging");
        elements.forEach((item) => item.classList.toggle("is-selected", item === element));
        onSelectionChange(element);
        onInteractionStart(element);
        bringToFront();
      }

      const step = event.shiftKey ? 24 : 8;
      const currentLeft = Number.parseFloat(
        element.style.left || getComputedStyle(element).left,
      );
      const currentTop = Number.parseFloat(
        element.style.top || getComputedStyle(element).top,
      );
      const next = clampPosition(
        element,
        container,
        currentLeft + direction[0] * step,
        currentTop + direction[1] * step,
      );

      element.style.left = `${next.left}px`;
      element.style.top = `${next.top}px`;
      updateAriaValue(element, container, next.left);
      onPositionChange(element);
      event.preventDefault();
    });
    element.addEventListener("keyup", (event) => {
      if (!directions[event.key] || !dragState.keyboardActive) return;
      dragState.keyboardActive = false;
      element.classList.remove("is-dragging");
      onInteractionEnd(element);
    });
    element.addEventListener("blur", () => {
      if (!dragState.keyboardActive) return;
      dragState.keyboardActive = false;
      element.classList.remove("is-dragging");
      onInteractionEnd(element);
    });
  };

  window.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    pointerActive = true;
    scheduleTilt();
  }, { passive: true });
  window.addEventListener("pointerdown", setPointerInput, { capture: true, passive: true });
  window.addEventListener("keydown", setKeyboardInput, { capture: true });
  document.documentElement.addEventListener("pointerleave", () => {
    pointerActive = false;
    scheduleTilt();
  }, { passive: true });
  window.addEventListener("blur", () => {
    pointerActive = false;
    scheduleTilt();
  });
  reducedMotion.addEventListener("change", scheduleTilt);

  elements.forEach(attachElement);

  const keepInBounds = () => {
    for (const element of elements) {
      const currentLeft = Number.parseFloat(
        element.style.left || getComputedStyle(element).left,
      );
      const currentTop = Number.parseFloat(
        element.style.top || getComputedStyle(element).top,
      );
      const next = clampPosition(element, container, currentLeft, currentTop);
      element.style.left = `${next.left}px`;
      element.style.top = `${next.top}px`;
    }
    scheduleTilt();
  };

  const addElement = (element) => {
    if (!elements.includes(element)) elements.push(element);
    attachElement(element);
    scheduleTilt();
  };

  const removeElement = (element) => {
    const index = elements.indexOf(element);
    if (index >= 0) elements.splice(index, 1);
    const dragState = dragStates.get(element);
    if (dragState && (dragState.activePointer !== null || dragState.keyboardActive)) {
      onInteractionEnd(element);
    }
    dragStates.delete(element);
    scheduleTilt();
  };

  pointerActive = false;
  scheduleTilt();
  return { addElement, keepInBounds, removeElement };
}
