// Shared vertex shader for both the rounded-pool above/below water
// materials, ported from water/src/shaders/RoundedBoxWater.vert. Unlike
// the box-pool path, the geometry itself never changes shape for a
// rounded pool -- only the material swaps -- so this just scales the
// standard flat PlaneGeometry(2,2,200,200) to the pool's real dimensions.
export const vertexShader = /* glsl */ `
uniform sampler2D water;
uniform float poolWidth;
uniform float poolLength;

varying vec3 vPosition;

void main() {
  vec4 info = texture2D(water, position.xy * 0.5 + 0.5);

  vPosition = position.xzy;
  vPosition.x *= poolWidth;
  vPosition.z *= poolLength;
  vPosition.y += info.r;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(vPosition, 1.0);
}
`
