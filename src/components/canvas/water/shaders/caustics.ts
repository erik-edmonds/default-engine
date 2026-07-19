export const vertexShader = /* glsl */ `
const float IOR_AIR = 1.0;
const float IOR_WATER = 1.333;
const float poolHeight = 1.0;

uniform vec3 light;
uniform sampler2D water;

varying vec3 oldPos;
varying vec3 newPos;
varying vec3 ray;

vec2 intersectCube(vec3 origin, vec3 r, vec3 cubeMin, vec3 cubeMax) {
  vec3 tMin = (cubeMin - origin) / r;
  vec3 tMax = (cubeMax - origin) / r;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}

vec3 project(vec3 origin, vec3 r, vec3 refractedLight) {
  vec2 tcube = intersectCube(origin, r, vec3(-1.0, -poolHeight, -1.0), vec3(1.0, 2.0, 1.0));
  origin += r * tcube.y;
  float tplane = (-origin.y - 1.0) / refractedLight.y;
  return origin + refractedLight * tplane;
}

void main() {
  vec4 info = texture2D(water, position.xy * 0.5 + 0.5);
  info.ba *= 0.5;

  vec2 slope = clamp(info.ba, vec2(-0.999), vec2(0.999));
  float slopeLengthSq = min(dot(slope, slope), 0.999);
  vec3 normal = normalize(vec3(slope.x, sqrt(max(0.001, 1.0 - slopeLengthSq)), slope.y));

  vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);
  ray = refract(-light, normal, IOR_AIR / IOR_WATER);

  oldPos = project(position.xzy, refractedLight, refractedLight);
  newPos = project(position.xzy + vec3(0.0, info.r, 0.0), ray, refractedLight);

  gl_Position = vec4(0.75 * (newPos.xz + refractedLight.xz / refractedLight.y), 0.0, 1.0);
}
`

export const fragmentShader = /* glsl */ `
precision highp float;

const float IOR_AIR = 1.0;
const float IOR_WATER = 1.333;
const float poolHeight = 1.0;

uniform vec3 light;
uniform vec3 sphereCenter;
uniform float sphereRadius;
uniform bool sphereEnabled;
uniform vec3 cubeCenter;
uniform vec3 cubeHalfSize;
uniform bool cubeEnabled;
uniform vec3 torusKnotCenter;
uniform bool torusKnotEnabled;
uniform vec3 meshCenter;
uniform float meshBoundingRadius;
uniform bool meshEnabled;
uniform sampler2D objectShadowTex;

varying vec3 oldPos;
varying vec3 newPos;
varying vec3 ray;

vec2 intersectCube(vec3 origin, vec3 r, vec3 cubeMin, vec3 cubeMax) {
  vec3 tMin = (cubeMin - origin) / r;
  vec3 tMax = (cubeMax - origin) / r;
  vec3 t1 = min(tMin, tMax);
  vec3 t2 = max(tMin, tMax);
  float tNear = max(max(t1.x, t1.y), t1.z);
  float tFar = min(min(t2.x, t2.y), t2.z);
  return vec2(tNear, tFar);
}

float cubeOcclusion(vec3 origin, vec3 direction) {
  vec2 hit = intersectCube(origin, direction, cubeCenter - cubeHalfSize, cubeCenter + cubeHalfSize);
  return step(0.0, hit.y) * step(hit.x, hit.y);
}

void main() {
  float oldArea = length(dFdx(oldPos)) * length(dFdy(oldPos));
  float newArea = length(dFdx(newPos)) * length(dFdy(newPos));

  gl_FragColor = vec4(oldArea / newArea * 0.2, 1.0, 0.0, 0.0);

  vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);

  if (sphereEnabled) {
    vec3 dir = (sphereCenter - newPos) / sphereRadius;
    vec3 area = cross(dir, refractedLight);
    float shadow = dot(area, area);

    float dist = dot(dir, -refractedLight);

    shadow = 1.0 + (shadow - 1.0) / (0.05 + dist * 0.025);
    shadow = clamp(1.0 / (1.0 + exp(-shadow)), 0.0, 1.0);
    shadow = mix(1.0, shadow, clamp(dist * 2.0, 0.0, 1.0));
    gl_FragColor.g = shadow;
  } else if (cubeEnabled) {
    vec3 shadowRay = -refractedLight;
    vec3 right = normalize(cross(shadowRay, vec3(0.0, 1.0, 0.0)));
    vec3 up = normalize(cross(right, shadowRay));

    float occlusion = 0.0;
    const float spread = 0.025;

    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        vec3 sampleOrigin = newPos + right * float(x) * spread + up * float(y) * spread;
        occlusion += cubeOcclusion(sampleOrigin, shadowRay);
      }
    }
    gl_FragColor.g = 1.0 - occlusion / 9.0;
  } else if (torusKnotEnabled || meshEnabled) {
    vec2 shadowUV =
      0.75 * (newPos.xz - newPos.y * refractedLight.xz / refractedLight.y) * 0.5 + 0.5;
    const float d = 4.0 / 1024.0;

    float occlusion = texture2D(objectShadowTex, shadowUV).r;
    occlusion += texture2D(objectShadowTex, shadowUV + vec2(d, 0.0)).r;
    occlusion += texture2D(objectShadowTex, shadowUV + vec2(-d, 0.0)).r;
    occlusion += texture2D(objectShadowTex, shadowUV + vec2(0.0, d)).r;
    occlusion += texture2D(objectShadowTex, shadowUV + vec2(0.0, -d)).r;
    occlusion += texture2D(objectShadowTex, shadowUV + vec2(d, d)).r;
    occlusion += texture2D(objectShadowTex, shadowUV + vec2(-d, d)).r;
    occlusion += texture2D(objectShadowTex, shadowUV + vec2(d, -d)).r;
    occlusion += texture2D(objectShadowTex, shadowUV + vec2(-d, -d)).r;
    gl_FragColor.g = 1.0 - 0.8 * occlusion / 9.0;
  } else {
    gl_FragColor.g = 1.0;
  }

  vec2 t = intersectCube(
    newPos,
    -refractedLight,
    vec3(-1.0, -poolHeight, -1.0),
    vec3(1.0, 2.0, 1.0)
  );
  gl_FragColor.r *=
    1.0 /
    (1.0 +
      exp(-200.0 / (1.0 + 10.0 * (t.y - t.x)) * (newPos.y - refractedLight.y * t.y - 2.0 / 12.0)));
}
`
