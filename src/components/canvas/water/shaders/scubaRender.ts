// Adapted 1:1 from water/src/shaders/DuckRender.vert/frag -- uniform names
// and logic unchanged, only the "duck" naming becomes "Scuba" in comments.
export const vertexShader = /* glsl */ `
varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vPosition = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalMatrix * normal;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const fragmentShader = /* glsl */ `
precision highp float;

const float IOR_AIR = 1.0;
const float IOR_WATER = 1.333;

const vec3 underwaterColor = vec3(0.4, 0.9, 1.0);

uniform vec3 light;

uniform float poolWidth;
uniform float poolLength;
uniform float poolHeight;

uniform vec3 meshCenter;

uniform sampler2D water;
uniform sampler2D causticTex;

uniform sampler2D modelTexture;

// Render pass mode:
// 1 = Standard rendering - render all fragments
// 2 = Reflection pass - discard underwater fragments
uniform int texturePassMode;

varying vec3 vPosition;
varying vec3 vNormal;
varying vec2 vUv;

void main() {
  vec3 baseColor = texture2D(modelTexture, vUv).rgb;

  vec3 n = normalize(vNormal);

  vec3 refractedLight = refract(-light, vec3(0.0, 1.0, 0.0), IOR_AIR / IOR_WATER);

  float litFactor = max(0.0, dot(n, -refractedLight));
  float aoStrength = 0.6 * (1.0 - litFactor);

  baseColor *= 1.0 - aoStrength / pow((poolWidth + 0.25 - abs(vPosition.x)) / 0.25, 3.0);
  baseColor *= 1.0 - aoStrength / pow((poolLength + 0.25 - abs(vPosition.z)) / 0.25, 3.0);
  baseColor *= 1.0 - aoStrength / pow((vPosition.y + poolHeight + 0.25) / 0.25, 3.0);

  float diffuse = max(0.0, dot(-refractedLight, n)) * 0.6;

  vec4 info = texture2D(water, vPosition.xz * vec2(0.5 / poolWidth, 0.5 / poolLength) + 0.5);

  if (texturePassMode == 2 && vPosition.y < info.r) {
    discard;
  }

  if (vPosition.y < info.r) {
    vec4 caustic = texture2D(
      causticTex,
      0.75 *
        (vPosition.xz - vPosition.y * refractedLight.xz / refractedLight.y) *
        vec2(0.5 / poolWidth, 0.5 / poolLength) +
        0.5
    );
    diffuse *= caustic.r * 4.0;
  }

  vec3 color = baseColor * (0.4 + diffuse);

  if (vPosition.y < info.r) {
    color *= underwaterColor * 1.2;
  }

  gl_FragColor = vec4(color, 1.0);
}
`
