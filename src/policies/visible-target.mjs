// Editable baseline. This module is self-contained so accepted code can be saved and replayed.
export const DEFAULT_VISIBLE_TARGET_POLICY = Object.freeze({
  family: "visible-target",
  version: 1,
  aimToleranceDeg: 2,
  searchYawDegPerSecond: 75,
  strafeSpeed: 0.35,
  reloadThreshold: 5
});

export function createVisibleTargetController(policy = DEFAULT_VISIBLE_TARGET_POLICY, { stepMs = 125 } = {}) {
  const settings = { ...DEFAULT_VISIBLE_TARGET_POLICY, ...policy };
  for (const key of ["aimToleranceDeg", "searchYawDegPerSecond", "strafeSpeed", "reloadThreshold"]) {
    if (!Number.isFinite(settings[key]) || settings[key] < 0) throw new Error(`Invalid policy ${key}.`);
  }
  let elapsedMs, targetId, strafeSign, recoverUntil, blockedPreviously;
  function resetEpisode() {
    elapsedMs = 0;
    targetId = null;
    strafeSign = 1;
    recoverUntil = 0;
    blockedPreviously = false;
  }
  resetEpisode();
  return {
    family: settings.family,
    policy: settings,
    resetEpisode,
    nextAction(observation, timing = {}) {
      const perception = observation?.perception;
      if (!perception || !Array.isArray(perception.visibleTargets) || typeof perception.movementBlocked !== "boolean"
        || perception.visibleTargets.some((target) => !target || typeof target.id !== "string"
          || !Number.isFinite(target.yawOffsetDeg) || !Number.isFinite(target.pitchOffsetDeg))) {
        throw Object.assign(new Error("Public game compatibility error: required perception.visibleTargets and movementBlocked are missing or invalid."), { code: "contract_mismatch" });
      }
      const deltaMs = Math.min(250, Math.max(0, timing.deltaMs ?? stepMs));
      const previousElapsedMs = elapsedMs;
      elapsedMs += deltaMs;
      const targets = perception.visibleTargets;
      const target = targets.find((entry) => entry.id === targetId)
        ?? targets.reduce((best, entry) => !best || Math.hypot(entry.yawOffsetDeg, entry.pitchOffsetDeg)
          < Math.hypot(best.yawOffsetDeg, best.pitchOffsetDeg) ? entry : best, null);
      targetId = target?.id ?? null;
      if ((perception.movementBlocked && !blockedPreviously)
        || Math.floor(elapsedMs / 2000) !== Math.floor(previousElapsedMs / 2000)) {
        strafeSign *= -1;
      }
      if (perception.movementBlocked) recoverUntil = elapsedMs + 750;
      blockedPreviously = perception.movementBlocked;
      const recovering = elapsedMs < recoverUntil;
      const ammo = observation.ammo ?? {};
      const reload = !ammo.reloading && ammo.reserve > 0
        && (ammo.mag === 0 || (!target && ammo.mag <= settings.reloadThreshold));
      const aligned = target && Math.hypot(target.yawOffsetDeg, target.pitchOffsetDeg) <= settings.aimToleranceDeg;
      return {
        moveX: strafeSign * Math.min(1, settings.strafeSpeed),
        moveZ: recovering ? -0.5 : target ? 0 : 0.25,
        lookYawDelta: target ? target.yawOffsetDeg : settings.searchYawDegPerSecond * deltaMs / 1000,
        lookPitchDelta: target ? target.pitchOffsetDeg : 0,
        fire: Boolean(aligned && ammo.mag > 0 && !ammo.reloading && !reload),
        reload,
        jump: false,
        crouch: false
      };
    }
  };
}
