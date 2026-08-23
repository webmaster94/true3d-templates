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
