import test from "node:test";
import assert from "node:assert/strict";
import {
  createAdaptiveSweeperController,
  DEFAULT_ADAPTIVE_SWEEPER_POLICY
} from "../src/policies/adaptive-sweeper.mjs";
import { LEARNING_PHASES } from "../src/learn/phases.mjs";

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

test("controller stays bounded and uses pitch bands without recent events", () => {
  const controller = createAdaptiveSweeperController(DEFAULT_ADAPTIVE_SWEEPER_POLICY, {
    learningPhase: LEARNING_PHASES.BOOTSTRAP_HIT,
    stepMs: 125
  });
  const pitchDeltas = [];

  for (let tick = 0; tick < 80; tick += 1) {
    const action = controller.nextAction(makeState());
    pitchDeltas.push(action.lookPitchDelta);
    assert.ok(Number.isFinite(action.moveX));
    assert.ok(Number.isFinite(action.moveZ));
    assert.ok(Number.isFinite(action.lookYawDelta));
    assert.ok(Number.isFinite(action.lookPitchDelta));
    assert.ok(action.moveX >= -1 && action.moveX <= 1);
    assert.ok(action.moveZ >= -1 && action.moveZ <= 1);
    assert.ok(Math.abs(action.lookPitchDelta) <= 6);
  }

  const telemetry = controller.getTelemetry();
  assert.ok(pitchDeltas.some((value) => value > 0.2));
  assert.ok(pitchDeltas.some((value) => value < -0.2));
  assert.ok(telemetry.pitchBandVisits.low >= 1);
  assert.ok(telemetry.pitchBandVisits.high >= 1);
  assert.ok(telemetry.pitchAbsTravel > 0);
  assert.ok(telemetry.estimatedPitchRangeDeg > 0);
});

test("recent events are tolerated when partial and they influence reacquisition behavior", () => {
  const controller = createAdaptiveSweeperController(DEFAULT_ADAPTIVE_SWEEPER_POLICY, {
    learningPhase: LEARNING_PHASES.BOOTSTRAP_HIT,
    stepMs: 125
  });

  for (let tick = 0; tick < 6; tick += 1) {
    controller.nextAction(makeState());
  }
  const scanAction = controller.nextAction(makeState());

  const reactiveAction = controller.nextAction(makeState({
    health: 84,
    feedback: {
      recentEvents: [
        { type: "damage-taken", amount: 16 },
        { id: "enemy-hit-1", type: "enemy-hit" },
        {}
      ]
    }
  }));

  const telemetry = controller.getTelemetry();
  assert.equal(telemetry.feedbackAvailable, true);
  assert.ok(telemetry.recentEventCounts["damage-taken"] >= 1);
  assert.ok(telemetry.recentEventCounts["enemy-hit"] >= 1);
  assert.ok(telemetry.damageReactionCount >= 1);
  assert.ok(["panic", "micro_scan", "engage"].includes(telemetry.lastMode));
  assert.ok(Math.abs(reactiveAction.lookPitchDelta) > 0.2);
  assert.ok(Math.abs(reactiveAction.moveZ) < Math.abs(scanAction.moveZ));
});

test("damage-driven reacquisition emits a distinct pitch-aware micro scan after the panic tick", () => {
  const controller = createAdaptiveSweeperController(DEFAULT_ADAPTIVE_SWEEPER_POLICY, {
    learningPhase: LEARNING_PHASES.BOOTSTRAP_KILL,
    stepMs: 125
  });

  controller.nextAction(makeState({ health: 100 }));
  controller.nextAction(makeState({
    health: 82,
    feedback: {
      recentEvents: [{ id: 2, type: "damage-taken", amount: 18 }]
    }
  }));
  let reacquireAction = null;
  for (let tick = 0; tick < 6; tick += 1) {
    reacquireAction = controller.nextAction(makeState({ health: 82 }));
    if (controller.getTelemetry().microScanCount >= 1) {
      break;
    }
  }

  const telemetry = controller.getTelemetry();
  assert.equal(telemetry.microScanCount >= 1, true);
  assert.equal(telemetry.lastMode, "micro_scan");
  assert.ok(telemetry.ticksInPanicMode >= 1);
  assert.ok(Math.abs(reacquireAction.lookYawDelta) > 0.2);
  assert.ok(telemetry.pitchAbsTravel > 0.2);
  assert.ok(telemetry.shotsWithinWindowAfterDamage >= 0);
});
