export const MODIFIERS = new Set(["alt", "control", "shift"]);

export function resolveModifier(worldDefault, clientOverride) {
  if (MODIFIERS.has(clientOverride)) return clientOverride;
  return MODIFIERS.has(worldDefault) ? worldDefault : "alt";
}

export function modifierMatches(event, modifier) {
  if (modifier === "control") return Boolean(event.ctrlKey);
  if (modifier === "shift") return Boolean(event.shiftKey);
  return Boolean(event.altKey);
}

export function nextElevation(current, deltaY, step) {
  const base = Number.isFinite(Number(current)) ? Number(current) : 0;
  const increment = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 5;
  if (!Number.isFinite(Number(deltaY)) || Number(deltaY) === 0) return base;
  const next = base + (Math.sign(Number(deltaY)) * -increment);
  return Object.is(next, -0) ? 0 : next;
}

export function shiftElevationRange(range, nextBottom) {
  const bottom = Number.isFinite(Number(range?.bottom)) ? Number(range.bottom) : 0;
  const next = Number(nextBottom);
  const top = range?.top;
  return {
    bottom: next,
    top: top !== null && top !== undefined && Number.isFinite(Number(top))
      ? Number(top) + (next - bottom)
      : null
  };
}

export function formatSignedElevation(value, unit = "") {
  const number = Number.isFinite(Number(value)) ? Number(value) : 0;
  const sign = number >= 0 ? "+" : "−";
  const magnitude = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2}).format(Math.abs(number));
  return `${sign}${magnitude}${unit ? ` ${unit}` : ""}`;
}

export function resolveWallPreview(worldDefault, clientOverride) {
  if (clientOverride === "show") return true;
  if (clientOverride === "hide") return false;
  return Boolean(worldDefault);
}

export function distance3d(center, point, pixelsPerUnit = 1) {
  const scale = Number(pixelsPerUnit) > 0 ? Number(pixelsPerUnit) : 1;
  const dx = (Number(point?.x ?? 0) - Number(center?.x ?? 0)) / scale;
  const dy = (Number(point?.y ?? 0) - Number(center?.y ?? 0)) / scale;
  const dz = Number(point?.elevation ?? 0) - Number(center?.elevation ?? 0);
  return Math.hypot(dx, dy, dz);
}

export function pointWithinSphere(center, point, radius, pixelsPerUnit = 1) {
  const sphereRadius = Number(radius);
  if (!Number.isFinite(sphereRadius) || sphereRadius < 0) return false;
  return distance3d(center, point, pixelsPerUnit) <= sphereRadius + 1e-6;
}

export function tokenSamplePoints(token, gridSize) {
  const size = Number(gridSize);
  if (!Number.isFinite(size) || size <= 0) return [];

  const width = Math.max(Number(token?.width ?? 1), 0);
  const height = Math.max(Number(token?.height ?? 1), 0);
  const startX = width >= 1 ? 0.5 : width / 2;
  const startY = height >= 1 ? 0.5 : height / 2;
  const points = [];

  for (let x = startX; x < width; x += 1) {
    for (let y = startY; y < height; y += 1) {
      points.push({
        x: Number(token?.x ?? 0) + (x * size),
        y: Number(token?.y ?? 0) + (y * size),
        elevation: Number(token?.elevation ?? 0)
      });
    }
  }
  return points;
}

export function tokenWithinSphere(token, sphere, gridSize, pixelsPerUnit) {
  return tokenSamplePoints(token, gridSize).some(point =>
    pointWithinSphere(sphere.center, point, sphere.radius, pixelsPerUnit)
  );
}

export function dispositionMatches(targetDisposition, sourceDisposition, targetType = "any", secretDisposition = -2) {
  const target = Number(targetDisposition);
  const source = Number(sourceDisposition ?? 1);
  switch (targetType) {
    case "ally":
      return target === source;
    case "notAlly":
      return target !== source;
    case "enemy":
      return target === -source || target === secretDisposition;
    case "notEnemy":
      return target !== -source && target !== secretDisposition;
    case "neutral":
      return target === 0;
    case "notNeutral":
      return target !== 0;
    case "friendly":
      return target === 1;
    case "notFriendly":
      return target !== 1;
    case "hostile":
      return target === -1 || target === secretDisposition;
    case "notHostile":
      return target !== -1 && target !== secretDisposition;
    default:
      return true;
  }
}
