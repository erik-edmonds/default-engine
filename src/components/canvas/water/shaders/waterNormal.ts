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
uniform float poolWidth;
uniform float poolLength;
uniform vec2 delta;

varying vec2 coord;

void main() {
  vec4 info = texture2D(tInput, coord);

  vec3 dx = vec3(
    delta.x * 2.0 * poolWidth,
    texture2D(tInput, vec2(coord.x + delta.x, coord.y)).r - info.r,
    0.0
  );

  vec3 dy = vec3(
    0.0,
    texture2D(tInput, vec2(coord.x, coord.y + delta.y)).r - info.r,
    delta.y * 2.0 * poolLength
  );

  info.ba = normalize(cross(dy, dx)).xz;

  gl_FragColor = info;
}
`
