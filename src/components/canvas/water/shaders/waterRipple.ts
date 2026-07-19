export const vertexShader = /* glsl */ `
varying vec2 coord;

void main() {
  coord = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xyz, 1.0);
}
`

export const fragmentShader = /* glsl */ `
precision highp float;

const float PI = 3.141592653589793;

uniform sampler2D tInput;
uniform vec2 center;
uniform float radius;
uniform float strength;
uniform float poolWidth;
uniform float poolLength;

varying vec2 coord;

void main() {
  vec4 info = texture2D(tInput, coord);

  vec2 physicalDiff = (coord - (center * 0.5 + 0.5)) * 2.0 * vec2(poolWidth, poolLength);
  float physRadius = radius * 2.0 * poolLength;
  float drop = max(0.0, 1.0 - length(physicalDiff) / physRadius);

  drop = 0.5 - cos(drop * PI) * 0.5;

  info.r += drop * strength;

  gl_FragColor = info;
}
`
