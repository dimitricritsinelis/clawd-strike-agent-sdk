import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateEpisodes,
  compareBatchMetrics,
  determineTargetMode
} from "../src/learn/optimizer.mjs";

test("hit-bootstrap promotes a real hit over zero-hit survival", () => {
  const champion = aggregateEpisodes([
    { shotsHit: 0, shotsFired: 40, kills: 0, finalScore: 0, survivalTimeS: 5.1, accuracy: 0 },
    { shotsHit: 0, shotsFired: 38, kills: 0, finalScore: 0, survivalTimeS: 5.0, accuracy: 0 },
    { shotsHit: 0, shotsFired: 42, kills: 0, finalScore: 0, survivalTimeS: 4.9, accuracy: 0 },
    { shotsHit: 0, shotsFired: 35, kills: 0, finalScore: 0, survivalTimeS: 4.8, accuracy: 0 },
    { shotsHit: 0, shotsFired: 39, kills: 0, finalScore: 0, survivalTimeS: 5.0, accuracy: 0 }
  ]);
  const candidate = aggregateEpisodes([
    { shotsHit: 1, shotsFired: 24, kills: 0, finalScore: 0, survivalTimeS: 4.4, accuracy: 1 / 24 },
    { shotsHit: 0, shotsFired: 21, kills: 0, finalScore: 0, survivalTimeS: 4.6, accuracy: 0 },
    { shotsHit: 0, shotsFired: 26, kills: 0, finalScore: 0, survivalTimeS: 4.5, accuracy: 0 },
    { shotsHit: 0, shotsFired: 23, kills: 0, finalScore: 0, survivalTimeS: 4.4, accuracy: 0 },
    { shotsHit: 0, shotsFired: 22, kills: 0, finalScore: 0, survivalTimeS: 4.5, accuracy: 0 }
  ]);

  const result = compareBatchMetrics(candidate, champion, {
    targetMode: determineTargetMode(champion)
  });

  assert.equal(determineTargetMode(champion), "hit-bootstrap");
  assert.equal(result.promote, true);
  assert.equal(result.phase, "hit-bootstrap");
  assert.equal(result.key, "episodesWithHit");
});

test("kill-bootstrap promotes a real kill over hit-only batches", () => {
  const champion = aggregateEpisodes([
    { shotsHit: 1, shotsFired: 24, kills: 0, finalScore: 0, survivalTimeS: 4.6, accuracy: 1 / 24 },
    { shotsHit: 1, shotsFired: 22, kills: 0, finalScore: 0, survivalTimeS: 4.7, accuracy: 1 / 22 },
    { shotsHit: 0, shotsFired: 26, kills: 0, finalScore: 0, survivalTimeS: 4.5, accuracy: 0 },
    { shotsHit: 1, shotsFired: 24, kills: 0, finalScore: 0, survivalTimeS: 4.8, accuracy: 1 / 24 },
    { shotsHit: 0, shotsFired: 21, kills: 0, finalScore: 0, survivalTimeS: 4.4, accuracy: 0 }
  ]);
  const candidate = aggregateEpisodes([
    { shotsHit: 2, shotsFired: 20, kills: 1, finalScore: 10, survivalTimeS: 4.2, accuracy: 0.1 },
    { shotsHit: 0, shotsFired: 18, kills: 0, finalScore: 0, survivalTimeS: 4.3, accuracy: 0 },
    { shotsHit: 1, shotsFired: 19, kills: 0, finalScore: 0, survivalTimeS: 4.1, accuracy: 1 / 19 },
    { shotsHit: 0, shotsFired: 18, kills: 0, finalScore: 0, survivalTimeS: 4.0, accuracy: 0 },
    { shotsHit: 0, shotsFired: 17, kills: 0, finalScore: 0, survivalTimeS: 4.2, accuracy: 0 }
  ]);

  const result = compareBatchMetrics(candidate, champion, {
    targetMode: determineTargetMode(champion)
  });

  assert.equal(determineTargetMode(champion), "kill-bootstrap");
  assert.equal(result.promote, true);
  assert.equal(result.phase, "kill-bootstrap");
  assert.equal(result.key, "episodesWithKill");
});

test("score optimization still prioritizes kills before score spikes", () => {
  const champion = aggregateEpisodes([
    { shotsHit: 2, shotsFired: 20, kills: 1, finalScore: 10, survivalTimeS: 5.2, accuracy: 0.1 },
    { shotsHit: 2, shotsFired: 18, kills: 1, finalScore: 10, survivalTimeS: 5.0, accuracy: 2 / 18 },
    { shotsHit: 1, shotsFired: 16, kills: 0, finalScore: 0, survivalTimeS: 4.8, accuracy: 1 / 16 },
    { shotsHit: 1, shotsFired: 17, kills: 0, finalScore: 0, survivalTimeS: 4.7, accuracy: 1 / 17 },
    { shotsHit: 0, shotsFired: 14, kills: 0, finalScore: 0, survivalTimeS: 4.9, accuracy: 0 }
  ]);
  const flashyButWorse = aggregateEpisodes([
    { shotsHit: 3, shotsFired: 28, kills: 1, finalScore: 20, survivalTimeS: 5.1, accuracy: 3 / 28 },
    { shotsHit: 0, shotsFired: 26, kills: 0, finalScore: 0, survivalTimeS: 4.2, accuracy: 0 },
    { shotsHit: 0, shotsFired: 25, kills: 0, finalScore: 0, survivalTimeS: 4.1, accuracy: 0 },
    { shotsHit: 0, shotsFired: 23, kills: 0, finalScore: 0, survivalTimeS: 4.0, accuracy: 0 },
    { shotsHit: 0, shotsFired: 22, kills: 0, finalScore: 0, survivalTimeS: 4.3, accuracy: 0 }
  ]);

  const result = compareBatchMetrics(flashyButWorse, champion, {
    targetMode: determineTargetMode(champion)
  });

  assert.equal(determineTargetMode(champion), "score-optimization");
  assert.equal(result.promote, false);
  assert.equal(result.key, "episodesWithKill");
});
