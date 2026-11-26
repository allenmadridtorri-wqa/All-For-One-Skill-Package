// All For One — /crazydesigner Root-Pinned Multi-Frequency Foliage Wind Sway

vec3 afoApplyFoliageWind(
  vec3 localPos,
  vec3 worldOrigin,
  float heightWeight,
  float time,
  vec2 windDir,
  float windStrength
) {
  vec2 dir = normalize(windDir + vec2(0.0001));
  float phase = dot(worldOrigin.xz, dir) * 0.35 + time * 1.6;

  // Primary trunk/branch sway (low frequency)
  float primary = sin(phase) * 0.6 + sin(phase * 2.17 + 1.3) * 0.4;
  float bend = primary * windStrength * heightWeight * heightWeight;

  // Secondary leaf flutter (high frequency)
  float flutter = sin(time * 7.5 + localPos.x * 4.3 + localPos.z * 3.7) * 0.035 * windStrength * heightWeight;

  vec3 displaced = localPos;
  displaced.xz += dir * (bend + flutter);
  displaced.y -= abs(bend) * 0.14 * heightWeight;
  return displaced;
}
