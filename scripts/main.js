import {
  dispositionMatches,
  formatSignedElevation,
  modifierMatches,
  nextElevation,
  pointWithinSphere,
  resolveModifier,
  resolveWallPreview,
  shiftElevationRange,
  targetIdsEqual,
  tokenSamplePoints
} from "./core.js";

const MODULE_ID = "true3d-templates";
const BADGE_ID = `${MODULE_ID}-badge`;
const OVERLAY_PROPERTY = "_true3dBlockedOverlay";
const WALL_PREVIEW_INTERVAL = 100;
const LIVE_TARGET_INTERVAL = 100;

const state = {
  badge: null,
  focusedRegion: null,
  frame: null,
  installedWheelTarget: null,
  lastPlacement: null,
  wallPreviewKey: null,
  wallPreviewTime: 0,
  blocked: false,
  wallErrorShown: false,
  liveTargetTime: 0,
  liveTargetKey: null,
  livePlacementDocument: null,
  livePreviousTargetIds: null,
  livePlacementCommitted: false,
  liveTargetCount: null,
  liveTargetIds: null,
  liveTargetReconcileQueued: false
};

Hooks.once("init", () => {
  registerSettings();

  Hooks.on("dnd5e.preCreateActivityTemplate", prepareActivityTemplate);
  Hooks.on("hoverRegion", (region, hovered) => {
    if (hovered) state.focusedRegion = region;
    else if (state.focusedRegion === region) state.focusedRegion = null;
  });
  Hooks.on("controlRegion", (region, controlled) => {
    if (controlled) state.focusedRegion = region;
    else if (state.focusedRegion === region) state.focusedRegion = null;
  });
  Hooks.on("createRegion", markLivePlacementCommitted);
  Hooks.on("midi-qol.postTemplatePlaced", correctMidiSphereTargets);
});

Hooks.once("ready", () => {
  createBadge();
  startDisplayLoop();
});

Hooks.on("canvasReady", () => {
  installWheelListener();
  state.wallPreviewKey = null;
});

Hooks.on("targetToken", scheduleLiveSphereTargetReconciliation);

Hooks.on("canvasTearDown", () => {
  removeWheelListener();
  finishLiveSphereTargeting();
  hideBadge();
  state.focusedRegion = null;
  state.lastPlacement = null;
});

function registerSettings() {
  const modifierChoices = {
    alt: "Alt",
    control: "Control",
    shift: "Shift"
  };

  game.settings.register(MODULE_ID, "worldModifier", {
    name: "Default elevation modifier",
    hint: "The modifier held while scrolling to change an AOE template's elevation.",
    scope: "world",
    config: true,
    type: String,
    choices: modifierChoices,
    default: "alt"
  });

  game.settings.register(MODULE_ID, "clientModifier", {
    name: "Elevation modifier override",
    hint: "Use the GM default or choose a personal modifier for this browser.",
    scope: "client",
    config: true,
    type: String,
    choices: {
      world: "Use GM default",
      ...modifierChoices
    },
    default: "world"
  });

  game.settings.register(MODULE_ID, "elevationStep", {
    name: "Elevation step",
    hint: "How far one mouse-wheel notch moves the template in scene distance units.",
    scope: "world",
    config: true,
    type: Number,
    range: {min: 1, max: 100, step: 1},
    default: 5
  });

  game.settings.register(MODULE_ID, "worldWallPreview", {
    name: "Show wall-blocked areas",
    hint: "Paint the part of an AOE preview blocked by sight walls in red.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "clientWallPreview", {
    name: "Wall preview override",
    hint: "Use the GM default, always show wall blocking, or hide it for this browser.",
    scope: "client",
    config: true,
    type: String,
    choices: {
      world: "Use GM default",
      show: "Show",
      hide: "Hide"
    },
    default: "world"
  });

  game.settings.register(MODULE_ID, "showBadge", {
    name: "Show template elevation badge",
    hint: "Show signed elevation beside a template while placing or inspecting it.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "sphereTargeting", {
    name: "Use true 3D sphere targeting",
    hint: "Select creatures using horizontal and vertical distance for D&D 5e sphere templates. Corrects Midi-QOL targets after placement.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, "liveSphereTargets", {
    name: "Show live sphere targets",
    hint: "Update target selection while moving a 3D sphere template so players can see who will be affected.",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });
}

function prepareActivityTemplate(activity, templateData) {
  const token = findSourceToken(activity, templateData);
  const originElevation = Number(token?.document?.elevation ?? canvas?.level?.elevation?.base ?? 0);
  templateData.elevation = originElevation;

  templateData.flags ??= {};
  templateData.flags[MODULE_ID] = {
    originElevation,
    centerElevation: originElevation,
    sourceTokenUuid: token?.document?.uuid ?? null,
    activityUuid: activity?.uuid ?? null
  };
}

function findSourceToken(activity, templateData) {
  const sourceUuid = foundry.utils.getProperty(templateData, "flags.midi-qol.sourceTokenUuid");
  const midiToken = sourceUuid ? fromUuidSync(sourceUuid)?.object : null;
  if (midiToken) return midiToken;

  const actor = activity?.actor;
  const controlledActorToken = canvas?.tokens?.controlled?.find(token => token.actor === actor);
  if (controlledActorToken) return controlledActorToken;

  const activeActorToken = actor?.getActiveTokens?.(true, true)?.find(token => token.scene === canvas.scene);
  if (activeActorToken) return activeActorToken;

  return canvas?.tokens?.controlled?.[0] ?? null;
}

function installWheelListener() {
  removeWheelListener();
  const target = window;
  target.addEventListener("wheel", onTemplateWheel, {capture: true, passive: false});
  target.addEventListener("keydown", onTemplateKeyDown, {capture: true});
  state.installedWheelTarget = target;
}

function removeWheelListener() {
  state.installedWheelTarget?.removeEventListener("wheel", onTemplateWheel, {capture: true});
  state.installedWheelTarget?.removeEventListener("keydown", onTemplateKeyDown, {capture: true});
  state.installedWheelTarget = null;
}

function onTemplateWheel(event) {
  const placement = getActivePlacement();
  if (!placement) return;

  const modifier = resolveModifier(
    game.settings.get(MODULE_ID, "worldModifier"),
    game.settings.get(MODULE_ID, "clientModifier")
  );
  if (!modifierMatches(event, modifier)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  adjustPlacementElevation(placement, event.deltaY || event.delta);
}

function onTemplateKeyDown(event) {
  if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  const placement = getActivePlacement();
  if (!placement) return;

  const modifier = resolveModifier(
    game.settings.get(MODULE_ID, "worldModifier"),
    game.settings.get(MODULE_ID, "clientModifier")
  );
  if (!modifierMatches(event, modifier)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  adjustPlacementElevation(placement, event.key === "ArrowUp" ? -1 : 1);
}

function adjustPlacementElevation(placement, direction) {
  const step = game.settings.get(MODULE_ID, "elevationStep");
  const current = getDocumentElevation(placement.document);
  const next = nextElevation(current, direction, step);
  setDocumentElevation(placement.document, next);
  placement.preview.refresh?.();

  state.wallPreviewKey = null;
  updateBadge(placement);
  Hooks.callAll(`${MODULE_ID}.elevationChanged`, placement.document, next, current);
}

function getActivePlacement() {
  const measured = canvas?.templates?.preview?.children?.find(child =>
    child?.document?.documentName === "MeasuredTemplate" && !child.destroyed
  );
  if (measured) return {kind: "placement", type: "measured", preview: measured, document: measured.document};

  const region = canvas?.regions?._placementContext?.preview;
  if (region && !region.destroyed) return {kind: "placement", type: "region", preview: region, document: region.document};
  return null;
}

function getFocusedRegion() {
  const region = state.focusedRegion;
  if (!region || region.destroyed || !region.document) return null;
  return {kind: "inspection", type: "region", preview: region, document: region.document};
}

function getDocumentElevation(document) {
  if (document?.documentName === "Region") return Number(document.elevation?.bottom ?? 0);
  return Number(document?.elevation ?? 0);
}

function setDocumentElevation(document, next) {
  if (document.documentName === "Region") {
    const elevation = shiftElevationRange(document.elevation, next);
    document.updateSource({
      elevation,
      [`flags.${MODULE_ID}.centerElevation`]: next
    });
    return;
  }
  document.updateSource({
    elevation: next,
    [`flags.${MODULE_ID}.centerElevation`]: next
  });
}

function getCenterElevation(document) {
  return Number(foundry.utils.getProperty(document, `flags.${MODULE_ID}.centerElevation`)
    ?? getDocumentElevation(document));
}

function getOriginElevation(document) {
  return Number(foundry.utils.getProperty(document, `flags.${MODULE_ID}.originElevation`) ?? getDocumentElevation(document));
}

function createBadge() {
  document.getElementById(BADGE_ID)?.remove();
  const badge = document.createElement("div");
  badge.id = BADGE_ID;
  badge.className = "true3d-template-badge";
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-live", "polite");

  const value = document.createElement("span");
  value.className = "true3d-template-badge__value";
  const detail = document.createElement("span");
  detail.className = "true3d-template-badge__detail";
  badge.append(value, detail);
  document.body.appendChild(badge);
  state.badge = badge;
  return badge;
}

function startDisplayLoop() {
  if (state.frame) cancelAnimationFrame(state.frame);
  const tick = () => {
    const placement = getActivePlacement();
    const display = placement ?? getFocusedRegion();

    if (display && game.settings.get(MODULE_ID, "showBadge")) updateBadge(display);
    else hideBadge();

    if (placement) {
      state.lastPlacement = placement;
      scheduleWallPreview(placement);
      scheduleLiveSphereTargets(placement);
    } else {
      clearWallPreview(state.lastPlacement);
      finishLiveSphereTargeting();
      state.lastPlacement = null;
      state.wallPreviewKey = null;
      state.blocked = false;
    }
    state.frame = requestAnimationFrame(tick);
  };
  state.frame = requestAnimationFrame(tick);
}

function updateBadge(display) {
  const badge = state.badge ?? createBadge();
  if (!badge) return;

  const unit = canvas?.scene?.grid?.units || canvas?.scene?.grid?.distanceUnits || "";
  const elevation = getDocumentElevation(display.document);
  const origin = getOriginElevation(display.document);
  const delta = elevation - origin;
  const modifier = resolveModifier(
    game.settings.get(MODULE_ID, "worldModifier"),
    game.settings.get(MODULE_ID, "clientModifier")
  );

  badge.querySelector(".true3d-template-badge__value").textContent = formatSignedElevation(elevation, unit);
  let detail = display.kind === "placement"
    ? `${formatSignedElevation(delta, unit)} from source · ${modifierLabel(modifier)} + wheel`
    : "Template elevation";
  if (display.kind === "placement" && state.liveTargetCount !== null) {
    const label = state.liveTargetCount === 1 ? "target" : "targets";
    detail += ` · ${state.liveTargetCount} ${label}`;
  }
  badge.querySelector(".true3d-template-badge__detail").textContent = state.blocked && display.kind === "placement"
    ? `${detail} · red is wall-blocked`
    : detail;
  badge.classList.toggle("is-blocked", state.blocked && display.kind === "placement");
  positionBadge(badge, display.preview);
  badge.hidden = false;
}

function hideBadge() {
  if (state.badge) state.badge.hidden = true;
}

function positionBadge(badge, preview) {
  const bounds = preview?.bounds;
  const transform = canvas?.stage?.worldTransform;
  if (!bounds || !transform || !globalThis.PIXI) {
    badge.classList.add("is-fallback");
    return;
  }

  badge.classList.remove("is-fallback");
  const point = transform.apply(new PIXI.Point(bounds.right, bounds.top));
  const width = badge.offsetWidth || 150;
  const height = badge.offsetHeight || 46;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, point.x - width));
  const top = Math.max(8, Math.min(window.innerHeight - height - 8, point.y - height - 8));
  badge.style.left = `${left}px`;
  badge.style.top = `${top}px`;
}

function modifierLabel(modifier) {
  if (modifier === "control") return "Ctrl";
  return modifier.charAt(0).toUpperCase() + modifier.slice(1);
}

function sphereTargetingEnabled() {
  return Boolean(game.settings.get(MODULE_ID, "sphereTargeting"));
}

function getSphereDefinition(document) {
  if (!document || !sphereTargetingEnabled()) return null;
  const activityUuid = foundry.utils.getProperty(document, `flags.${MODULE_ID}.activityUuid`)
    ?? foundry.utils.getProperty(document, "flags.dnd5e.origin");
  const activity = activityUuid ? fromUuidSync(activityUuid) : null;
  const template = activity?.target?.template;
  if (template?.type !== "sphere") return null;

  const gridSize = Number(canvas.grid?.size ?? 0);
  const gridDistance = Number(canvas.grid?.distance ?? canvas.scene?.grid?.distance ?? 0);
  if (gridSize <= 0 || gridDistance <= 0) return null;
  const pixelsPerUnit = gridSize / gridDistance;
  const centerElevation = getCenterElevation(document);

  if (document.documentName === "Region") {
    const shape = document.shapes?.find?.(candidate => candidate.type === "circle")
      ?? document.shapes?.at?.(0);
    if (!shape || shape.type !== "circle") return null;
    return {
      activity,
      center: {x: Number(shape.x), y: Number(shape.y), elevation: centerElevation},
      radius: Number(shape.radius) / pixelsPerUnit,
      pixelsPerUnit
    };
  }

  const radius = Number(template.size ?? document.distance);
  if (!Number.isFinite(radius) || radius < 0) return null;
  return {
    activity,
    center: {x: Number(document.x), y: Number(document.y), elevation: centerElevation},
    radius,
    pixelsPerUnit
  };
}

function getMidiConfig() {
  if (!game.modules.get("midi-qol")?.active) return null;
  try {
    return game.settings.get("midi-qol", "ConfigSettings");
  } catch {
    return null;
  }
}

function getAutoTargetMode(activity, midiConfig) {
  const activityMode = foundry.utils.getProperty(activity, "midiProperties.autoTargetAction");
  return activityMode && activityMode !== "default" ? activityMode : midiConfig?.autoTarget;
}

function getAoeTargetType(activity) {
  const override = foundry.utils.getProperty(activity, "midiProperties.autoTargetType");
  if (override && override !== "any") return override;
  const affects = activity?.target?.affects?.type;
  if (affects === "ally" || affects === "enemy") return affects;
  return "any";
}

function isDefeatedToken(token, midiConfig) {
  const defeated = CONFIG.specialStatusEffects?.DEFEATED;
  const midiDead = midiConfig?.midiDeadCondition;
  return Boolean(
    (defeated && token.actor?.statuses?.has(defeated))
    || (midiDead && token.actor?.statuses?.has(midiDead))
    || token.actor?.statuses?.has("dead")
  );
}

function isTargetableToken(token, {activity, sourceToken, autoTarget, midiConfig}) {
  if (!token?.actor || token.actor.type === "group" || token.document.hidden || token.document.isSecret) return false;
  if (token.actor.getFlag?.("midi-qol", "neverTarget")) return false;

  if (["wallsBlockIgnoreDefeated", "alwaysIgnoreDefeated"].includes(autoTarget)
      && isDefeatedToken(token, midiConfig)) return false;
  if (["wallsBlockIgnoreIncapacitated", "alwaysIgnoreIncapacitated"].includes(autoTarget)
      && globalThis.MidiQOL?.checkIncapacitated?.(token.actor, false, false)) return false;

  const special = String(activity?.target?.affects?.special ?? "").split(";");
  if (special.includes("-self") && sourceToken?.document?.uuid === token.document.uuid) return false;

  const targetType = getAoeTargetType(activity);
  return dispositionMatches(
    token.document.disposition,
    sourceToken?.document?.disposition ?? CONST.TOKEN_DISPOSITIONS.FRIENDLY,
    targetType,
    CONST.TOKEN_DISPOSITIONS.SECRET
  );
}

function pointBlockedByWall(center, point, midiConfig, autoTarget) {
  const wallsBlock = [
    "wallsBlock",
    "wallsBlockIgnoreDefeated",
    "wallsBlockIgnoreIncapacitated"
  ].includes(autoTarget);
  if (!wallsBlock) return false;

  if (midiConfig?.optionalRules?.wallsBlockRange === "centerLevels"
      && game.modules.get("levels")?.active
      && !game.modules.get("levelsvolumetrictemplates")?.active
      && CONFIG.Levels?.API?.testCollision) {
    return Boolean(CONFIG.Levels.API.testCollision(
      {x: point.x, y: point.y, z: point.elevation},
      {x: center.x, y: center.y, z: center.elevation},
      "collision"
    ));
  }

  return Boolean(CONFIG.Canvas.polygonBackends.sight.testCollision(
    {x: center.x, y: center.y, elevation: center.elevation},
    {x: point.x, y: point.y, elevation: point.elevation},
    {mode: "any", type: "move", level: canvas.level}
  ));
}

function computeSphereTargets(document, workflow = null) {
  const sphere = getSphereDefinition(document);
  if (!sphere) return null;

  const midiConfig = getMidiConfig();
  const autoTarget = getAutoTargetMode(sphere.activity, midiConfig) ?? "always";
  if (midiConfig && autoTarget === "none") return null;

  const sourceToken = workflow?.token?.object
    ?? workflow?.token
    ?? findSourceToken(sphere.activity, document);
  const gridSize = Number(canvas.grid.size);
  const targets = [];

  for (const token of canvas.tokens.placeables) {
    if (!isTargetableToken(token, {
      activity: sphere.activity,
      sourceToken,
      autoTarget,
      midiConfig
    })) continue;

    const points = tokenSamplePoints({
      x: token.x,
      y: token.y,
      width: token.document.width,
      height: token.document.height,
      elevation: token.document.elevation
    }, gridSize);
    const contained = points.some(point =>
      pointWithinSphere(sphere.center, point, sphere.radius, sphere.pixelsPerUnit)
      && !pointBlockedByWall(sphere.center, point, midiConfig, autoTarget)
    );
    if (contained) targets.push(token);
  }
  const limit = Number(sphere.activity?.target?.affects?.count);
  return Number.isFinite(limit) && limit > 0 ? targets.slice(0, limit) : targets;
}

function sphereTargetKey(document) {
  const sphere = getSphereDefinition(document);
  if (!sphere) return null;
  const positions = canvas.tokens.placeables.map(token => [
    token.id,
    token.x,
    token.y,
    token.document.elevation,
    token.document.width,
    token.document.height
  ].join(",")).join(";");
  return [sphere.center.x, sphere.center.y, sphere.center.elevation, sphere.radius, positions].join(":");
}

function scheduleLiveSphereTargets(placement) {
  if (!game.settings.get(MODULE_ID, "liveSphereTargets")) {
    finishLiveSphereTargeting();
    return;
  }

  const key = sphereTargetKey(placement.document);
  if (!key) {
    finishLiveSphereTargeting();
    return;
  }

  if (state.livePlacementDocument !== placement.document) {
    finishLiveSphereTargeting();
    state.livePlacementDocument = placement.document;
    state.livePreviousTargetIds = Array.from(game.user.targets ?? []).map(token => token.id);
    state.livePlacementCommitted = false;
    state.liveTargetIds = null;
  }

  const now = performance.now();
  if (key === state.liveTargetKey) {
    reconcileLiveSphereTargets();
    return;
  }
  if (now - state.liveTargetTime < LIVE_TARGET_INTERVAL) return;
  state.liveTargetKey = key;
  state.liveTargetTime = now;

  const targets = computeSphereTargets(placement.document);
  if (!targets) return;
  const ids = targets.map(token => token.id);
  state.liveTargetIds = ids;
  state.liveTargetCount = ids.length;
  reconcileLiveSphereTargets();
}

function scheduleLiveSphereTargetReconciliation(user) {
  if (user !== game.user || !state.livePlacementDocument || state.liveTargetIds === null) return;
  if (state.liveTargetReconcileQueued) return;
  state.liveTargetReconcileQueued = true;
  queueMicrotask(() => {
    state.liveTargetReconcileQueued = false;
    reconcileLiveSphereTargets();
  });
}

function reconcileLiveSphereTargets() {
  const ids = state.liveTargetIds;
  if (!state.livePlacementDocument || ids === null || !canvas.tokens) return;
  if (targetIdsEqual(game.user.targets, ids)) return;
  canvas.tokens.setTargets(ids);
}

function markLivePlacementCommitted(region, _options, userId) {
  if (userId !== game.user.id) return;
  if (!foundry.utils.getProperty(region, `flags.${MODULE_ID}.activityUuid`)) return;
  state.livePlacementCommitted = true;
}

function finishLiveSphereTargeting() {
  if (!state.livePlacementDocument) return;
  if (!state.livePlacementCommitted && state.livePreviousTargetIds) {
    canvas.tokens?.setTargets(state.livePreviousTargetIds);
  }
  state.liveTargetTime = 0;
  state.liveTargetKey = null;
  state.livePlacementDocument = null;
  state.livePreviousTargetIds = null;
  state.livePlacementCommitted = false;
  state.liveTargetCount = null;
  state.liveTargetIds = null;
}

async function correctMidiSphereTargets(workflow) {
  if (!sphereTargetingEnabled() || !workflow?.templateUuids?.length) return true;

  const documents = workflow.templateUuids.map(uuid => fromUuidSync(uuid));
  if (documents.some(document => !getSphereDefinition(document))) return true;

  const targetSet = new Set();
  for (const document of documents) {
    const targets = computeSphereTargets(document, workflow);
    if (!targets) return true;
    targets.forEach(token => targetSet.add(token));
  }

  const ids = Array.from(targetSet, token => token.id).filter(Boolean);
  canvas.tokens.setTargets(ids);
  workflow.setTargets(targetSet);
  if (workflow.activity?.setupCanSeeSense) await workflow.activity.setupCanSeeSense({workflow});
  return true;
}

function wallPreviewEnabled() {
  return resolveWallPreview(
    game.settings.get(MODULE_ID, "worldWallPreview"),
    game.settings.get(MODULE_ID, "clientWallPreview")
  );
}

function scheduleWallPreview(placement) {
  if (!wallPreviewEnabled()) {
    clearWallPreview(placement);
    state.blocked = false;
    return;
  }

  const now = performance.now();
  const key = wallPreviewKey(placement);
  if (key === state.wallPreviewKey || now - state.wallPreviewTime < WALL_PREVIEW_INTERVAL) return;
  state.wallPreviewKey = key;
  state.wallPreviewTime = now;
  drawWallPreview(placement);
}

function wallPreviewKey({type, document}) {
  const elevation = getDocumentElevation(document);
  if (type === "measured") {
    return [document.x, document.y, document.direction, document.distance, document.width, elevation].join(":");
  }
  const shapes = document.shapes?.map(shape => JSON.stringify(shape.toObject?.() ?? shape)).join("|");
  return `${shapes}:${elevation}`;
}

function drawWallPreview(placement) {
  const {preview} = placement;
  const bounds = preview.bounds;
  const origin = getPlacementOrigin(placement);
  if (!bounds || !origin || !canvas?.level?.isView) {
    clearWallPreview(placement);
    state.blocked = false;
    return;
  }

  const backend = CONFIG.Canvas.polygonBackends.sight;
  if (!backend?.testCollision) return;

  let overlay = preview[OVERLAY_PROPERTY];
  if (!overlay || overlay.destroyed) {
    overlay = new PIXI.Graphics();
    overlay.eventMode = "none";
    overlay.zIndex = 9999;
    preview.sortableChildren = true;
    preview.addChild(overlay);
    preview[OVERLAY_PROPERTY] = overlay;
  }
  overlay.clear();

  const baseCell = Math.max(24, Number(canvas.grid?.size ?? 100) / 2);
  const estimated = Math.max(1, (bounds.width * bounds.height) / (baseCell * baseCell));
  const cell = estimated > 1600 ? baseCell * Math.sqrt(estimated / 1600) : baseCell;
  const localOffsetX = Number(preview.position?.x ?? 0);
  const localOffsetY = Number(preview.position?.y ?? 0);
  const elevation = getDocumentElevation(placement.document);
  let blocked = 0;

  overlay.beginFill(0xff334d, 0.3);
  try {
    for (let y = bounds.top; y < bounds.bottom; y += cell) {
      for (let x = bounds.left; x < bounds.right; x += cell) {
        const center = {x: x + (cell / 2), y: y + (cell / 2)};
        if (!placementContainsPoint(placement, center)) continue;
        const collides = backend.testCollision(
          {...origin, elevation},
          {...center, elevation},
          {
            type: "sight",
            mode: "any",
            level: canvas.level,
            edgeTypes: {wall: true, outerBounds: true},
            useThreshold: true
          }
        );
        if (!collides) continue;
        blocked += 1;
        overlay.drawRect(x - localOffsetX, y - localOffsetY, cell + 1, cell + 1);
      }
    }
  } catch (error) {
    overlay.clear();
    if (!state.wallErrorShown) {
      console.warn(`${MODULE_ID} | Wall preview could not be drawn`, error);
      state.wallErrorShown = true;
    }
  }
  overlay.endFill();
  state.blocked = blocked > 0;
}

function getPlacementOrigin({type, document}) {
  if (type === "measured") return {x: Number(document.x), y: Number(document.y)};
  const shape = document.shapes?.at?.(0);
  const origin = shape?.origin;
  if (origin) return {x: Number(origin.x), y: Number(origin.y)};
  if (Number.isFinite(Number(shape?.x)) && Number.isFinite(Number(shape?.y))) {
    return {x: Number(shape.x), y: Number(shape.y)};
  }
  return null;
}

function placementContainsPoint({type, preview, document}, point) {
  if (type === "measured") {
    return Boolean(preview.shape?.contains?.(point.x - document.x, point.y - document.y));
  }
  const polygonTree = preview.animationState?.polygonTree ?? document.polygonTree;
  return Boolean(polygonTree?.testPoint?.(point));
}

function clearWallPreview(placement) {
  const overlay = placement?.preview?.[OVERLAY_PROPERTY];
  if (overlay && !overlay.destroyed) overlay.clear();
}

globalThis.True3DTemplates = {
  get modifier() {
    return resolveModifier(
      game.settings.get(MODULE_ID, "worldModifier"),
      game.settings.get(MODULE_ID, "clientModifier")
    );
  },
  getActivePlacement,
  computeSphereTargets,
  getSphereDefinition,
  refreshWallPreview() {
    state.wallPreviewKey = null;
  }
};
