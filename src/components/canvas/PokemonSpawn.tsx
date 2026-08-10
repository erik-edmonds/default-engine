import * as THREE from 'three'

export const EnergyShader = {
  uniforms: {
    uTime: { value: 0 },
    uProgress: { value: 0 }, // 0 = Pure energy, 1 = Fully materialized
    uColor: { value: new THREE.Color('#00f0ff') } // Neon energy blue
  },
  vertexShader: `
    uniform float uTime;
    uniform float uProgress;
    varying vec3 vNormal;
    varying vec3 vPosition;
    
    void main() {
      vNormal = normalize(normalMatrix * normal);
      
      // Add a slight energy jitter/expansion based on progress
      vec3 pos = position;
      if (uProgress < 1.0) {
        pos += normal * sin(uTime * 20.0 + position.y * 10.0) * 0.03 * (1.0 - uProgress);
      }
      
      vPosition = pos;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uColor;
    uniform float uProgress;
    uniform float uTime;
    varying vec3 vNormal;
    varying vec3 vPosition;

    void main() {
      // Fresnel effect for rim glowing
      float intensity = pow(1.0 - dot(vNormal, vec3(0, 0, 1.0)), 2.0);
      vec3 glow = uColor * intensity * 2.0;
      
      // Base texture/color placeholder (Simulating the Pokemon's real colors)
      vec3 baseColor = vec3(0.8, 0.2, 0.2); 

      // Interpolate from pure energy glow to standard material color
      vec3 finalColor = mix(glow, baseColor, uProgress);
      
      // Fade out the overall alpha slightly if it's in pure energy phase
      float alpha = mix(0.8, 1.0, uProgress);

      gl_FragColor = vec4(finalColor, alpha);
    }
  `
}