import test from "node:test";
import assert from "node:assert/strict";

test("Foundry entry point registers its lifecycle hooks", async () => {
  const once = [];
  const on = [];
  globalThis.Hooks = {
    once(name) {
      once.push(name);
    },
    on(name) {
      on.push(name);
    }
  };

  await import(`../scripts/main.js?smoke=${Date.now()}`);

  assert.deepEqual(once, ["init", "ready"]);
  assert.deepEqual(on, ["canvasReady", "canvasTearDown"]);
  assert.equal(typeof globalThis.True3DTemplates.getActivePlacement, "function");
});
