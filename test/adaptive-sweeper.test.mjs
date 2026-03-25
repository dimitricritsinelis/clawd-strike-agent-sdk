import test from "node:test";
import assert from "node:assert/strict";
import {
  createAdaptiveSweeperController,
  DEFAULT_ADAPTIVE_SWEEPER_POLICY
} from "../src/policies/adaptive-sweeper.mjs";

function makeState(overrides = {}) {
  return {
    health: 100,
    ammo: {
      mag: 30,
      reserve: 120,
      reloading: false
    },
    score: {
      current: 0
    },
    ...overrides
  };
}

test("controller stays bounded without feedback", () => {
  const controller = createAdaptiveSweeperController(DEFAULT_ADAPTIVE_SWEEPER_POLICY);

  for (let tick = 0; tick < 120; tick += 1) {
    const action = controller.nextAction(makeState());
    assert.ok(Number.isFinite(action.moveX));
    assert.ok(Number.isFinite(action.moveZ));
    assert.ok(Number.isFinite(action.lookYawDelta));
    assert.ok(Number.isFinite(action.lookPitchDelta));
    assert.ok(action.moveX >= -1 && action.moveX <= 1);
    assert.ok(action.moveZ >= -1 && action.moveZ <= 1);
    assert.ok(Math.abs(action.lookPitchDelta) <= 6);
  }

  const telemetry = controller.getTelemetry();
  assert.ok(Number.isFinite(telemetry.estimatedPitchRangeDeg));
});

test("enemy-hit feedback enters engage behavior", () => {
  const controller = createAdaptiveSweeperController(DEFAULT_ADAPTIVE_SWEEPER_POLICY);

  let scanAction = null;
  for (let tick = 0; tick < 8; tick += 1) {
    scanAction = controller.nextAction(makeState());
  }

  const engageAction = controller.nextAction(makeState({
    feedback: {
      recentEvents: [{ id: 1, type: "enemy-hit" }]
    }
  }));

  const telemetry = controller.getTelemetry();
  assert.equal(telemetry.lastMode, "engage");
  assert.ok(telemetry.enemyHitEventsObserved >= 1);
  assert.ok(telemetry.ticksInEngageMode >= 1);
  assert.ok(engageAction.fire);
  assert.ok(Math.abs(engageAction.lookYawDelta) < Math.abs(scanAction.lookYawDelta));
  assert.ok(Math.abs(engageAction.moveZ) < Math.abs(scanAction.moveZ));
});

test("damage feedback or health drop enters panic behavior", () => {
  const controller = createAdaptiveSweeperController(DEFAULT_ADAPTIVE_SWEEPER_POLICY);

  controller.nextAction(makeState({ health: 100 }));
  const panicAction = controller.nextAction(makeState({
    health: 85,
    feedback: {
      recentEvents: [{ id: 2, type: "damage-taken", amount: 15 }]
    }
  }));

  const telemetry = controller.getTelemetry();
  assert.equal(telemetry.lastMode, "panic");
  assert.ok(telemetry.damageEventsObserved >= 1);
  assert.ok(telemetry.ticksInPanicMode >= 1);
  assert.ok(Math.abs(panicAction.lookYawDelta) > DEFAULT_ADAPTIVE_SWEEPER_POLICY.sweepAmplitudeDeg);
});

test("pitch range stays finite and bounded over time", () => {
  const controller = createAdaptiveSweeperController(DEFAULT_ADAPTIVE_SWEEPER_POLICY);

  for (let tick = 0; tick < 200; tick += 1) {
    const action = controller.nextAction(makeState());
    assert.ok(Number.isFinite(action.lookPitchDelta));
  }

  const telemetry = controller.getTelemetry();
  assert.ok(telemetry.estimatedPitchRangeDeg > 0);
  assert.ok(
    telemetry.estimatedPitchRangeDeg <= DEFAULT_ADAPTIVE_SWEEPER_POLICY.pitchSweepAmplitudeDeg * 3
  );
});
