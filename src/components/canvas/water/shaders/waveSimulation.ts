export const vertexShader = /* glsl */ `
varying vec2 coord;

void main() {
  coord = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xyz, 1.0);
}
`

export const fragmentShader = /* glsl */ `
precision highp float;

uniform sampler2D tInput;
uniform vec2 delta;
uniform float poolWidth;
uniform float poolLength;

varying vec2 coord;

void main() {
  vec4 info = texture2D(tInput, coord);

  vec2 dx = vec2(delta.x, 0.0);
  vec2 dy = vec2(0.0, delta.y);

  float d2h_dx2 = texture2D(tInput, coord + dx).r + texture2D(tInput, coord - dx).r - 2.0 * info.r;
  float d2h_dz2 = texture2D(tInput, coord + dy).r + texture2D(tInput, coord - dy).r - 2.0 * info.r;

  float stabilityScale = min(1.0, min(poolWidth * poolWidth, poolLength * poolLength));
  info.g += 0.5 * stabilityScale * (d2h_dx2 / (poolWidth * poolWidth) + d2h_dz2 / (poolLength * poolLength));

  info.g *= 0.995;

  info.r += info.g;

  gl_FragColor = info;
}
`
