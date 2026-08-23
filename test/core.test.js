import test from "node:test";
import assert from "node:assert/strict";

import {
  formatSignedElevation,
  modifierMatches,
  nextElevation,
  resolveModifier,
  resolveWallPreview,
  shiftElevationRange
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
