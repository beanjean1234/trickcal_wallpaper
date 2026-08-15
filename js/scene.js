import { LENS, PARAMETERS } from "./settings.js";

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
let activeSpecularAngle = PARAMETERS.specularAngle;
let activeSpecularOpacity = PARAMETERS.specularOpacity;
let activeFrontSpecularMap = "";

function roundedRectangleSdf(x, y, halfWidth, halfHeight, radius) {
  const qx = Math.abs(x) - (halfWidth - radius);
  const qy = Math.abs(y) - (halfHeight - radius);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

function getLensGeometry(width, height, cornerRadius, x, y) {
  const cx = width / 2;
  const cy = height / 2;
  const localX = x - cx;
  const localY = y - cy;
  const halfWidth = width / 2 - 1;
  const halfHeight = height / 2 - 1;
  const radius = Math.min(cornerRadius, halfWidth, halfHeight);
  const distance = roundedRectangleSdf(
    localX,
    localY,
    halfWidth,
    halfHeight,
    radius,
  );
  const inside = distance <= 0;
  const edgeDistance = -distance;

  let normalX = 0;
  let normalY = 0;
  if (inside) {
    // The SDF gradient points out of the rounded rectangle and becomes the
    // surface normal used by the rim light.
    const epsilon = 0.5;
    const gradientX =
      roundedRectangleSdf(localX + epsilon, localY, halfWidth, halfHeight, radius) -
      roundedRectangleSdf(localX - epsilon, localY, halfWidth, halfHeight, radius);
    const gradientY =
      roundedRectangleSdf(localX, localY + epsilon, halfWidth, halfHeight, radius) -
      roundedRectangleSdf(localX, localY - epsilon, halfWidth, halfHeight, radius);
    const gradientLength = Math.hypot(gradientX, gradientY);
    if (gradientLength > 0.0001) {
      normalX = gradientX / gradientLength;
      normalY = gradientY / gradientLength;
    }
  }

  return {
    cx,
    cy,
    inside,
    edgeDistance,
    normalX,
    normalY,
  };
}

function createCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function buildSpecularMap(
  width,
  height,
  cornerRadius,
  angle,
  { edgeInset = 0, maximumRimWidth = Math.min(14, height * 0.15) } = {},
) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: false });
  const image = context.createImageData(width, height);
  const lightAngle = (angle * Math.PI) / 180;
  const lightX = Math.cos(lightAngle);
  const lightY = Math.sin(lightAngle);
  const minimumRimWidth = Math.min(1, maximumRimWidth);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = (y * width + x) * 4;
      const geometry = getLensGeometry(
        width,
        height,
        cornerRadius,
        x + 0.5,
        y + 0.5,
      );
      if (!geometry.inside) continue;

      const normalToLight =
        geometry.normalX * lightX + geometry.normalY * lightY;
      const angularResponse = Math.pow(Math.abs(normalToLight), 1.35);
      const localRimWidth =
        minimumRimWidth +
        (maximumRimWidth - minimumRimWidth) * angularResponse;
      const distanceFromRim = geometry.edgeDistance - edgeInset;
      if (distanceFromRim < 0 || distanceFromRim > localRimWidth) continue;

      const rim = Math.pow(
        clamp(1 - distanceFromRim / localRimWidth, 0, 1),
        1.7,
      );
      const opposingSideStrength = normalToLight < 0 ? 0.9 : 1;
      const intensity =
        Math.pow(angularResponse, 1.7) * rim * opposingSideStrength;

      // The map is fully transparent away from the two opposing rims. Their
      // real pixel width and opacity both taper with angular distance.
      image.data[pixel] = 255;
      image.data[pixel + 1] = 255;
      image.data[pixel + 2] = 255;
      image.data[pixel + 3] = Math.round(255 * intensity);
    }
  }

  context.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

function setFrontSpecularMap(value) {
  activeFrontSpecularMap = value;
  document
    .querySelectorAll(".magnifier")
    .forEach((magnifier) => {
      magnifier.style.setProperty("--front-specular-map", `url("${value}")`);
    });
}

export function getCurrentLensSize() {
  const mobile = window.matchMedia(`(max-width: ${LENS.mobileBreakpoint}px)`).matches;
  return mobile
    ? {
        width: LENS.mobileWidth,
        height: LENS.mobileHeight,
        cornerRadius: LENS.mobileCornerRadius,
      }
    : {
        width: LENS.desktopWidth,
        height: LENS.desktopHeight,
        cornerRadius: LENS.cornerRadius,
      };
}

export function applyParameterPreset() {
  document
    .querySelectorAll(".magnifier")
    .forEach((magnifier) => {
      magnifier.style.setProperty("--specular-strength", String(activeSpecularOpacity));
    });
}

export function buildFrontSpecularMap() {
  const { width, height, cornerRadius } = getCurrentLensSize();
  const frontSpecular = buildSpecularMap(
    width,
    height,
    cornerRadius,
    activeSpecularAngle,
    { maximumRimWidth: Math.max(3.4, height * 0.016) },
  );

  setFrontSpecularMap(frontSpecular);
  applyParameterPreset();
}

export function updateSpecularAngle(angle) {
  activeSpecularAngle = Math.round(clamp(angle, -180, 180));
  const { width, height, cornerRadius } = getCurrentLensSize();
  const frontSpecular = buildSpecularMap(
    width,
    height,
    cornerRadius,
    activeSpecularAngle,
    { maximumRimWidth: Math.max(3.4, height * 0.016) },
  );

  setFrontSpecularMap(frontSpecular);
}

export function updateSpecularOpacity(opacity) {
  const strength = clamp(opacity, 0, 3);
  activeSpecularOpacity = strength;
  document
    .querySelectorAll(".magnifier")
    .forEach((magnifier) => {
      magnifier.style.setProperty("--specular-strength", String(strength));
    });
}

export function buildPlateWalls(element) {
  const { width, height, cornerRadius } = getCurrentLensSize();
  const depth = width / 5;
  const segmentsPerCorner = 6;
  const segmentAngle = 90 / segmentsPerCorner;
  const halfSegmentRadians = ((segmentAngle / 2) * Math.PI) / 180;
  const chordWidth = 2 * cornerRadius * Math.sin(halfSegmentRadians);
  const radialDistance = cornerRadius * Math.cos(halfSegmentRadians);
  const corners = [
    { centerX: cornerRadius, centerY: cornerRadius, startAngle: 180 },
    { centerX: width - cornerRadius, centerY: cornerRadius, startAngle: 270 },
    { centerX: width - cornerRadius, centerY: height - cornerRadius, startAngle: 0 },
    { centerX: cornerRadius, centerY: height - cornerRadius, startAngle: 90 },
  ];

  element
    .querySelectorAll(".magnifier__wall--corner")
    .forEach((wall) => wall.remove());
  element.style.setProperty("--glass-depth", `${depth}px`);
  element.style.setProperty("--specular-strength", String(activeSpecularOpacity));
  if (activeFrontSpecularMap) {
    element.style.setProperty(
      "--front-specular-map",
      `url("${activeFrontSpecularMap}")`,
    );
  }

  for (const corner of corners) {
    for (let segment = 0; segment < segmentsPerCorner; segment += 1) {
      const middleAngle =
        corner.startAngle + segment * segmentAngle + segmentAngle / 2;
      const radians = (middleAngle * Math.PI) / 180;
      const centerX = corner.centerX + radialDistance * Math.cos(radians);
      const centerY = corner.centerY + radialDistance * Math.sin(radians);
      const wall = document.createElement("span");

      wall.className = "magnifier__wall magnifier__wall--corner";
      wall.setAttribute("aria-hidden", "true");
      wall.style.width = `${chordWidth + 0.4}px`;
      wall.style.height = `${depth}px`;
      wall.style.left = `${centerX - (chordWidth + 0.4) / 2}px`;
      wall.style.top = `${centerY - depth}px`;
      wall.style.transform = `rotateZ(${middleAngle + 90}deg) rotateX(90deg)`;
      element.append(wall);
    }
  }
}
