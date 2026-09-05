import test from "node:test";
import assert from "node:assert/strict";
import { runPolicyEpisodes } from "../src/runtime/episode-runner.mjs";
import { validatePublicObservation, buildRuntimeUrl, ensureFreshRun } from "../src/runtime/browser.mjs";
import { createVisibleTargetController } from "../src/policies/visible-target.mjs";

const alive = (extra = {}) => ({ apiVersion: 1, contract: "public-agent-v1", mode: "runtime", runtimeReady: true,
  gameplay: { alive: true }, perception: { visibleTargets: [], movementBlocked: false },
  ammo: { mag: 30, reserve: 120, reloading: false }, score: { current: 0 }, ...extra });
const dead = () => alive({ gameplay: { alive: false }, lastRunSummary: { finalScore: 10, shotsHit: 2, shotsFired: 3, kills: 1, survivalTimeS: 1 } });

function harness(states, options = {}) {
  let index = 0, time = 0, releases = 0, retries = 0;
  const actionTimes = [];
  const adapter = {
    readState: async () => states[Math.min(index++, states.length - 1)],
    applyAction: async () => { actionTimes.push(time); time += options.actionCostMs ?? 0; },
    releaseInputs: async () => { releases++; },
    clickPlayAgainIfVisible: async () => { retries++; return true; }
  };
  return { adapter, clock: { now: () => time, sleep: async (ms) => { time += ms; } },
    counters: () => ({ releases, retries, actionTimes, time }) };
}
const run = (h, options = {}) => runPolicyEpisodes({ ...h, controller: createVisibleTargetController(), policyEntry: { id: "test", label: "test" }, targetEpisodes: 1, ...options });

test("public contract requires visible perception and an explicit deployment", () => {
  assert.throws(() => validatePublicObservation(alive({ perception: undefined })), { code: "contract_mismatch" });
  assert.throws(() => validatePublicObservation(alive({ perception: { visibleTargets: [{ id: "x", yawOffsetDeg: NaN, pitchOffsetDeg: 0 }], movementBlocked: false } })), { code: "contract_mismatch" });
  assert.throws(() => buildRuntimeUrl(), /BASE_URL/);
  const configured = new URL(buildRuntimeUrl("https://game.example/play/?profile=test"));
  assert.equal(configured.searchParams.get("profile"), "test");
  assert.equal(configured.pathname, "/play/");
});

test("baseline searches, aims with signed offsets, fires aligned, reloads, and recovers", () => {
  const controller = createVisibleTargetController();
  assert.ok(controller.nextAction(alive()).lookYawDelta > 0);
  const target = { id: "a", yawOffsetDeg: -12, pitchOffsetDeg: 4 };
  const action = controller.nextAction(alive({ perception: { visibleTargets: [target], movementBlocked: false } }));
  assert.equal(action.lookYawDelta, -12);
  assert.equal(action.lookPitchDelta, 4);
  assert.equal(action.fire, false);
  assert.equal(controller.nextAction(alive({ perception: { visibleTargets: [{ ...target, yawOffsetDeg: 0, pitchOffsetDeg: 0 }], movementBlocked: false } })).fire, true);
  assert.equal(controller.nextAction(alive({ ammo: { mag: 0, reserve: 10, reloading: false } })).reload, true);
  assert.ok(controller.nextAction(alive({ perception: { visibleTargets: [], movementBlocked: true } })).moveZ < 0);
  controller.resetEpisode();
  assert.ok(controller.nextAction(alive()).moveX > 0);
});

test("deaths are recorded, retries reset memory, and inputs release", async () => {
  const h = harness([alive(), dead(), alive(), dead()]);
  const records = [];
  const result = await run(h, { targetEpisodes: 2, onEpisodeRecorded: (record) => records.push(record) });
  assert.equal(result.status, "completed");
  assert.equal(records.length, 2);
  assert.equal(records[0].completed, true);
  assert.equal(records[0].observationActionTail.at(-1).alive, false);
  assert.equal(h.counters().retries, 1);
  assert.ok(h.counters().releases >= 4);
});

test("real-time cadence subtracts action cost and never needs advanceTime", async () => {
  const h = harness([alive(), alive(), alive(), dead()], { actionCostMs: 40 });
  assert.equal((await run(h)).status, "completed");
  assert.deepEqual(h.counters().actionTimes, [0, 125, 250]);
});

test("time budget preserves completed episodes without counting a partial attempt", async () => {
  const h = harness([alive(), dead(), alive(), alive()]);
  const result = await run(h, { targetEpisodes: 2, deadlineMs: 375 });
  assert.equal(result.status, "budget_exhausted");
  assert.equal(result.episodes.length, 1);
  assert.equal(result.partialEpisode.completed, false);
  assert.ok(h.counters().releases >= 3);
});

test("episode timeout, startup failure, missing perception, and stop are distinct", async () => {
  assert.equal((await run(harness([alive()]), { episodeTimeoutMs: 250 })).status, "timeout");
  assert.equal((await run(harness([{ mode: "menu" }]), { startupTimeoutMs: 250 })).status, "startup_failure");
  assert.equal((await run(harness([alive({ perception: undefined })]))).status, "contract_mismatch");
  assert.equal((await run(harness([alive()]), { signal: AbortSignal.abort() })).status, "stopped");
});

test("death evidence stays bounded and changing game identity invalidates the batch", async () => {
  const result = await run(harness([...Array.from({ length: 60 }, () => alive()), dead()]));
  assert.equal(result.episodes[0].observationActionTail.length, 40);
  const changed = await run(harness([alive({ profileId: "a" }), alive({ profileId: "b" })]));
  assert.equal(changed.status, "contract_mismatch");
  assert.equal(changed.episodes.length, 0);
});

test("missing death metrics invalidate the run instead of inventing a zero score", async () => {
  const result = await run(harness([alive(), alive({ gameplay: { alive: false } })]));
  assert.equal(result.status, "contract_mismatch");
  assert.equal(result.episodes.length, 0);
  assert.match(result.error, /summary metrics/);
});


test("fresh retry validates perception and obeys deadline and stop", async () => {
  let observation = dead(), releases = 0, clicks = 0;
  const page = {
    evaluate: async (_callback, payload) => { if (payload) { releases++; return; } return observation; },
    locator: () => ({ isVisible: async () => true, click: async () => { clicks++; observation = alive(); } })
  };
  assert.equal((await ensureFreshRun(page, { waitMs: 1, timeoutMs: 100 })).gameplay.alive, true);
  assert.equal(clicks, 1);
  assert.ok(releases >= 2);
  await assert.rejects(ensureFreshRun(page, { deadlineMs: Date.now() - 1 }), { code: "budget_exhausted" });
  await assert.rejects(ensureFreshRun(page, { signal: AbortSignal.abort() }), { code: "stopped" });
  observation = alive({ perception: undefined });
  await assert.rejects(ensureFreshRun(page), { code: "contract_mismatch" });
});
