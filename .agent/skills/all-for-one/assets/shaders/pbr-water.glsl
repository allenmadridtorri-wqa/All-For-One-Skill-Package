// All For One — /crazydesigner Physically Plausible Gerstner + Schlick Fresnel Water

struct AfoGerstnerWave {
  vec2 dir;
  float steepness;
  float wavelength;
};

vec3 afoApplyGerstnerWave(AfoGerstnerWave wave, vec3 p, float time, inout vec3 tangent, inout vec3 binormal) {
  float k = 6.28318530718 / wave.wavelength;
  float c = sqrt(9.81 / k);
  vec2 d = normalize(wave.dir);
  float f = k * (dot(d, p.xz) - c * time);
  float a = wave.steepness / k;

  tangent += vec3(
    -d.x * d.x * (wave.steepness * sin(f)),
    d.x * (wave.steepness * cos(f)),
    -d.x * d.y * (wave.steepness * sin(f))
  );
  binormal += vec3(
    -d.x * d.y * (wave.steepness * sin(f)),
    d.y * (wave.steepness * cos(f)),
    -d.y * d.y * (wave.steepness * sin(f))
  );

  return vec3(
    d.x * (a * cos(f)),
    a * sin(f),
    d.y * (a * cos(f))
  );
}

float afoSchlickFresnel(float cosTheta, float f0) {
  return f0 + (1.0 - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

vec3 afoWaterShade(
  vec3 worldPos,
  vec3 normal,
  vec3 viewDir,
  vec3 sunDir,
  vec3 sunColor,
  vec3 skyColor,
  vec3 shallowColor,
  vec3 deepColor,
  float waterDepth
) {
  float cosTheta = max(dot(normal, viewDir), 0.0);
  float fresnel = afoSchlickFresnel(cosTheta, 0.02);

  // Beer-Lambert depth absorption
  float absorption = 1.0 - exp(-max(waterDepth, 0.0) * 0.42);
  vec3 bodyColor = mix(shallowColor, deepColor, absorption);

  // Sky reflection + GGX-style crisp sun specular glint
  vec3 reflDir = reflect(-viewDir, normal);
  float skyGrad = smoothstep(-0.1, 0.85, reflDir.y);
  vec3 envReflect = mix(skyColor * 0.45, skyColor, skyGrad);

  vec3 halfVec = normalize(sunDir + viewDir);
  float ndh = max(dot(normal, halfVec), 0.0);
  float sunGlint = pow(ndh, 360.0) * 3.5;

  return mix(bodyColor, envReflect, fresnel) + sunColor * sunGlint;
}
