import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateEpisodes,
  compareBatchMetrics,
  determineLearningPhase
} from "../src/learn/optimizer.mjs";

function episode(overrides = {}) {
  return {
    completed: true,
    status: "completed",
    finalScore: 10,
    shotsHit: 2,
    shotsFired: 20,
    kills: 1,
    survivalTimeS: 5,
    accuracy: 0.1,
    ...overrides
  };
}

function batch(count = 5, overrides = {}) {
  return aggregateEpisodes(Array.from({ length: count }, () => episode(overrides)));
}

test("identical per-episode performance cannot win through a larger batch", () => {
  const champion = batch(5);
  const candidate = batch(6);
  assert.ok(candidate.totalKills > champion.totalKills);
  assert.ok(candidate.totalShotsHit > champion.totalShotsHit);
  assert.equal(candidate.meanScore, champion.meanScore);
  assert.equal(compareBatchMetrics(candidate, champion).promote, false);
  assert.equal(compareBatchMetrics(candidate, champion).key, "incomplete_batch");
});

test("both champion and candidate must supply the same configured completed batch size", () => {
  assert.equal(compareBatchMetrics(batch(5, { finalScore: 20 }), batch(4)).promote, false);
  assert.equal(compareBatchMetrics(batch(4, { finalScore: 20 }), batch(5)).promote, false);
  assert.equal(compareBatchMetrics(batch(2, { finalScore: 20 }), batch(2)).promote, false);
  assert.equal(compareBatchMetrics(batch(2, { finalScore: 20 }), batch(2), { expectedEpisodes: 2 }).promote, true);
  assert.throws(() => compareBatchMetrics(batch(), batch(), { expectedEpisodes: 0 }), /positive integer/);
});

test("higher mean score promotes despite fewer kills, hits, accuracy, and survival", () => {
  const champion = batch(5, { finalScore: 10, kills: 3, shotsHit: 10, accuracy: 0.5, survivalTimeS: 20 });
  const candidate = batch(5, { finalScore: 11, kills: 1, shotsHit: 2, accuracy: 0.1, survivalTimeS: 10 });
  const decision = compareBatchMetrics(candidate, champion);
  assert.equal(determineLearningPhase(champion), "stabilize_score");
  assert.equal(decision.promote, true);
  assert.equal(decision.key, "meanScore");
  assert.equal(decision.delta, 1);
});

test("score ties never promote, even with better diagnostic metrics", () => {
  const decision = compareBatchMetrics(batch(5, { kills: 5, shotsHit: 12, survivalTimeS: 30 }), batch());
  assert.equal(decision.promote, false);
  assert.match(decision.reason, /tied/);
  assert.equal(decision.delta, 0);
});

test("a single best-ever score cannot override a lower batch mean", () => {
  const candidate = aggregateEpisodes([episode({ finalScore: 40 }), ...Array.from({ length: 4 }, () => episode({ finalScore: 0 }))]);
  assert.equal(candidate.bestScore, 40);
  assert.equal(candidate.meanScore, 8);
  assert.equal(compareBatchMetrics(candidate, batch()).promote, false);
});

test("partial and invalid runs cannot be promoted or contaminate completed score metrics", () => {
  for (const overrides of [
    { completed: false, status: "timeout", finalScore: 999 },
    { completed: true, status: "timeout", finalScore: 999 },
    { valid: false, finalScore: 999 },
    { finalScore: NaN },
    { finalScore: Infinity },
    { finalScore: null },
    { shotsHit: -1 },
    { survivalTimeS: NaN }
  ]) {
    const candidate = aggregateEpisodes([
      ...Array.from({ length: 4 }, () => episode()),
      episode(overrides)
    ]);
    assert.equal(candidate.completedEpisodes, 4);
    assert.equal(candidate.meanScore, 10);
    assert.equal(compareBatchMetrics(candidate, batch()).promote, false);
    assert.equal(compareBatchMetrics(batch(), candidate).promote, false);
  }
});

test("unmarked historical episodes and aggregates do not qualify as current completed evidence", () => {
  const historical = episode();
  delete historical.completed;
  const candidate = aggregateEpisodes(Array.from({ length: 5 }, () => historical));
  assert.equal(candidate.completedEpisodes, 0);
  assert.equal(compareBatchMetrics(candidate, batch()).promote, false);
  assert.equal(compareBatchMetrics({ totalEpisodes: 5, meanScore: 100 }, batch()).promote, false);
});

test("zero-contact survival and hit-only score ties are diagnostic, not promotion", () => {
  const champion = batch(5, { shotsHit: 0, kills: 0, finalScore: 0 });
  assert.equal(determineLearningPhase(champion), "bootstrap_hit");
  assert.equal(compareBatchMetrics(batch(5, { shotsHit: 0, kills: 0, finalScore: 0, survivalTimeS: 99 }), champion).promote, false);
  assert.equal(compareBatchMetrics(batch(5, { shotsHit: 1, kills: 0, finalScore: 0 }), champion).promote, false);
});
