// All For One — /crazydesigner Exponential Height Fog + Mie Sun Scattering

vec3 afoApplyHeightFog(
  vec3 sceneColor,
  vec3 cameraPos,
  vec3 worldPos,
  vec3 sunDir,
  vec3 fogBaseColor,
  vec3 sunInscatterColor,
  float fogDensity,
  float heightFalloff
) {
  vec3 ray = worldPos - cameraPos;
  float dist = length(ray);
  vec3 viewDir = ray / max(dist, 0.0001);

  // Analytical exponential height fog integral
  float camHeightFactor = exp(-max(cameraPos.y, 0.0) * heightFalloff);
  float fogAmount = 1.0 - exp(-dist * fogDensity * camHeightFactor);
  fogAmount = clamp(fogAmount, 0.0, 0.96);

  // Mie forward scattering lobe around sun disk
  float sunAlign = max(dot(viewDir, normalize(sunDir)), 0.0);
  float mieLobe = pow(sunAlign, 8.0);
  vec3 finalFogColor = mix(fogBaseColor, sunInscatterColor, mieLobe * 0.65);

  return mix(sceneColor, finalFogColor, fogAmount);
}
