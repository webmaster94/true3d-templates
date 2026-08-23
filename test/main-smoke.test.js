import test from "node:test";
import assert from "node:assert/strict";

test("Foundry entry point registers its lifecycle hooks", async () => {
  const once = [];
  const onceCallbacks = new Map();
  const on = [];
  globalThis.Hooks = {
    once(name, callback) {
      once.push(name);
      onceCallbacks.set(name, callback);
    },
    on(name) {
      on.push(name);
    }
  };

  await import(`../scripts/main.js?smoke=${Date.now()}`);
  globalThis.document = {
    getElementById() {
      return null;
    },
    createElement() {
      return {
        append() {},
        setAttribute() {}
      };
    },
    body: {
      appendChild() {}
    }
  };
  globalThis.requestAnimationFrame = () => 1;
  onceCallbacks.get("ready")();

  assert.deepEqual(once, ["init", "ready"]);
  assert.deepEqual(on, ["canvasReady", "targetToken", "canvasTearDown", "refreshMeasuredTemplate"]);
  assert.equal(typeof globalThis.True3DTemplates.getActivePlacement, "function");
  assert.equal(typeof globalThis.True3DTemplates.computeSphereTargets, "function");
  assert.equal(typeof globalThis.True3DTemplates.getSphereDefinition, "function");
});
