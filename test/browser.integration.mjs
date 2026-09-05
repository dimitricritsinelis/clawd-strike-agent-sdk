// Adapter contract fixture, not game performance evidence. Owns an ephemeral server.
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { launchBrowser, gotoAgentRuntime, readState, ensureFreshRun } from "../src/runtime/browser.mjs";
import { runPolicyEpisodes } from "../src/runtime/episode-runner.mjs";
import { createVisibleTargetController } from "../src/policies/visible-target.mjs";

const html = `<!doctype html><button data-testid="play-again" hidden>Retry</button><script>
let alive, began, held, yaw, shots;
const retry = document.querySelector('button');
function reset() { alive=true; began=performance.now(); held={}; yaw=8; shots=0; retry.hidden=true; }
reset(); retry.onclick=reset;
window.agent_observe=()=>JSON.stringify({apiVersion:1,contract:'public-agent-v1',mode:'runtime',runtimeReady:true,
  profileId:'sdk-adapter-fixture',tuningId:'fixture-v1',health:alive?100:0,
  gameplay:{alive,gameOverVisible:!alive},ammo:{mag:30-shots,reserve:120,reloading:false},
  perception:{visibleTargets:alive?[{id:'visible-fixture',yawOffsetDeg:yaw,pitchOffsetDeg:0}]:[],movementBlocked:false},
  score:{current:shots>0?10:0,lastRun:shots>0?10:0},
  lastRunSummary:alive?null:{finalScore:shots>0?10:0,kills:shots>0?1:0,shotsHit:shots>0?1:0,shotsFired:shots,survivalTimeS:0.7,deathCause:'fixture-timer'}});
window.agent_apply_action=(action)=>{held=action; yaw-=action.lookYawDelta||0;};
window.advanceTime=()=>{throw new Error('Normal loop must never advanceTime');};
setInterval(()=>{ if(alive&&held.fire) shots=Math.min(30,shots+1); if(alive&&performance.now()-began>700){alive=false;retry.hidden=false;} },20);
</script>`;

for (const headless of [true, false]) {
  test(`public adapter startup, two deaths and retry (${headless ? "headless" : "headed"})`, async (t) => {
    const server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end(html); });
    server.listen(0, "127.0.0.1"); await once(server, "listening");
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const baseUrl = `http://127.0.0.1:${server.address().port}/`;
    const { browser, context, page } = await launchBrowser({ headless });
    t.after(async () => { await context.close(); await browser.close(); });
    await gotoAgentRuntime(page, { baseUrl, agentName: "Fixture" });
    const result = await runPolicyEpisodes({ page, controller: createVisibleTargetController(),
      policyEntry: { id: "adapter-fixture", label: "fixture" }, targetEpisodes: 2, stepMs: 125,
      maxStepsPerEpisode: 80, deadlineMs: Date.now() + 10_000 });
    assert.equal(result.status, "completed", result.error);
    assert.equal(result.episodes.length, 2);
    assert.ok(result.episodes.every((episode) => episode.kills === 1));
    await ensureFreshRun(page, { deadlineMs: Date.now() + 2000 });
    assert.equal((await readState(page)).gameplay.alive, true);
    // Remove a required public capability; compatibility must fail explicitly.
    await page.evaluate(() => {
      const read = window.agent_observe;
      window.agent_observe = () => { const state = JSON.parse(read()); delete state.perception; return JSON.stringify(state); };
    });
    const incompatible = await runPolicyEpisodes({ page, controller: createVisibleTargetController(),
      policyEntry: { id: "fixture" }, targetEpisodes: 1, deadlineMs: Date.now() + 2000 });
    assert.equal(incompatible.status, "contract_mismatch");
    assert.match(incompatible.error, /perception/);
  });
}
