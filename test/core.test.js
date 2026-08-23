import test from "node:test";
import assert from "node:assert/strict";

import {
  dispositionMatches,
  distance3d,
  formatSignedElevation,
  modifierMatches,
  nextElevation,
  pointWithinSphere,
  resolveModifier,
  resolveWallPreview,
  shapeRasterCells,
  shiftElevationRange,
  targetIdsEqual,
  tokenSamplePoints,
  tokenWithinSphere
} from "../scripts/core.js";

test("player modifier overrides the world default", () => {
  assert.equal(resolveModifier("alt", "shift"), "shift");
  assert.equal(resolveModifier("control", "world"), "control");
  assert.equal(resolveModifier("invalid", "world"), "alt");
});

test("modifier matching uses the selected modifier only", () => {
  const event = {altKey: true, ctrlKey: false, shiftKey: false};
  assert.equal(modifierMatches(event, "alt"), true);
  assert.equal(modifierMatches(event, "control"), false);
});

test("wheel up raises elevation and wheel down lowers it", () => {
  assert.equal(nextElevation(10, -120, 5), 15);
  assert.equal(nextElevation(10, 120, 5), 5);
  assert.equal(nextElevation(-5, -1, 5), 0);
});

test("moving a finite region preserves its height", () => {
  assert.deepEqual(shiftElevationRange({bottom: 10, top: 30}, 20), {bottom: 20, top: 40});
  assert.deepEqual(shiftElevationRange({bottom: 10, top: null}, 0), {bottom: 0, top: null});
});

test("elevation labels always show a sign", () => {
  assert.equal(formatSignedElevation(15, "ft"), "+15 ft");
  assert.equal(formatSignedElevation(-5, "ft"), "−5 ft");
  assert.equal(formatSignedElevation(0), "+0");
});

test("wall preview supports world defaults and client overrides", () => {
  assert.equal(resolveWallPreview(true, "world"), true);
  assert.equal(resolveWallPreview(false, "show"), true);
  assert.equal(resolveWallPreview(true, "hide"), false);
});

test("3D distance combines horizontal and vertical distance in scene units", () => {
  const center = {x: 4650, y: 1650, elevation: 30};
  const point = {x: 5025, y: 1425, elevation: 20};
  assert.equal(distance3d(center, point, 30), Math.hypot(12.5, -7.5, -10));
  assert.equal(pointWithinSphere(center, point, 20, 30), true);
});

test("the Forge Fireball placement includes only the two +20 ft Mummies", () => {
  const sphere = {
    center: {x: 4650, y: 1650, elevation: 30},
    radius: 20
  };
  const mummy = (x, y, elevation) => ({x: x - 75, y: y - 75, width: 1, height: 1, elevation});

  assert.equal(tokenWithinSphere(mummy(4575, 1725, 20), sphere, 150, 30), true);
  assert.equal(tokenWithinSphere(mummy(5025, 1425, 20), sphere, 150, 30), true);
  assert.equal(tokenWithinSphere(mummy(5175, 1875, 40), sphere, 150, 30), false);
  assert.equal(tokenWithinSphere(mummy(4125, 1575, -10), sphere, 150, 30), false);
});

test("large tokens are included when any sampled grid-space center is in the sphere", () => {
  const points = tokenSamplePoints({x: 0, y: 0, width: 2, height: 2, elevation: 5}, 100);
  assert.deepEqual(points, [
    {x: 50, y: 50, elevation: 5},
    {x: 50, y: 150, elevation: 5},
    {x: 150, y: 50, elevation: 5},
    {x: 150, y: 150, elevation: 5}
  ]);
});

test("Midi-style disposition filters distinguish allies and absolute friendliness", () => {
  assert.equal(dispositionMatches(-1, -1, "ally"), true);
  assert.equal(dispositionMatches(-1, -1, "friendly"), false);
  assert.equal(dispositionMatches(1, -1, "friendly"), true);
  assert.equal(dispositionMatches(-2, 1, "enemy"), true);
});

test("live target reconciliation detects when another module replaces the 3D targets", () => {
  const midiTargets = [{id: "low"}, {id: "high"}, {id: "outside"}];
  const sphereTargets = ["low", "high"];

  assert.equal(targetIdsEqual(midiTargets, sphereTargets), false);
  assert.equal(targetIdsEqual([{id: "high"}, {id: "low"}], sphereTargets), true);
  assert.equal(targetIdsEqual([], []), true);
});

test("wall preview raster covers template edges when a cell center falls outside", () => {
  const center = {x: 100, y: 100};
  const radius = 100;
  const containsPoint = point => Math.hypot(point.x - center.x, point.y - center.y) <= radius;
  const cells = shapeRasterCells({left: 0, top: 0, right: 200, bottom: 200}, 50, containsPoint);
  const edgePoint = {x: 30, y: 40};

  assert.equal(containsPoint(edgePoint), true);
  assert.equal(cells.some(cell => (
    edgePoint.x >= cell.x && edgePoint.x < cell.x + cell.size
    && edgePoint.y >= cell.y && edgePoint.y < cell.y + cell.size
  )), true);
});
