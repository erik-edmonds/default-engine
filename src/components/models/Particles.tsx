import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Simple JavaScript replacement for GLSL's step function
const jsStep = (edge: number, value: number) => (value >= edge ? 1 : 0)

export function SplashParticles({ count = 350 }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!)
  
  const particles = useMemo(() => {
    const data = []
    for (let i = 0; i < count; i++) {
      data.push({
        x: (Math.random() - 0.5) * 6.5,
        y: Math.random() * 1.5, 
        z: (Math.random() - 0.5) * 3.5 + 0.5,
        vX: (Math.random() - 0.5) * 2.0, 
        vY: Math.random() * 6 + 4,      
        vZ: Math.random() * 3.5 + 1.5,  
        scale: Math.random() * 0.45 + 0.15,
        life: Math.random(),
      })
    }
    return data
  }, [count])

  const dummy = useMemo(() => new THREE.Object3D(), [])

  useEffect(() => {
    if (!meshRef.current) return
    particles.forEach((p, i) => {
      dummy.position.set(p.x, p.y, p.z)
      dummy.scale.setScalar(p.scale * (1 - p.life))
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [particles, dummy])

  useFrame((state, delta) => {
    if (!meshRef.current) return
    const clampedDelta = Math.min(delta, 0.1)

    particles.forEach((p, i) => {
      p.life += clampedDelta * 1.3
      if (p.life > 1) {
        p.life = 0
        p.y = 0
        p.x = (Math.random() - 0.5) * 6.5
        p.z = (Math.random() - 0.5) * 2.5
        p.vY = Math.random() * 6 + 4
        p.vZ = Math.random() * 3.5 + 1.5
      }

      p.vY -= 12.0 * clampedDelta 
      p.x += p.vX * clampedDelta
      p.y += p.vY * clampedDelta
      p.z += p.vZ * clampedDelta

      dummy.position.set(p.x, p.y, p.z)
      
      const smoothLife = 1.0 - p.life
      const cellScale = 
        jsStep(0.2, smoothLife) * 0.4 + 
        jsStep(0.5, smoothLife) * 0.3 + 
        jsStep(0.8, smoothLife) * 0.3

      dummy.scale.setScalar(p.scale * cellScale)
      
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <sphereGeometry args={[0.3, 6, 6]} /> 
      <meshBasicMaterial color="#ffffff" transparent opacity={0.85} />
    </instancedMesh>
  )
}

export function FoamPool() {
  const materialRef = useRef<THREE.ShaderMaterial>(null!)

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime()
    }
  })

  const CloudFoamShader = useMemo(() => ({
    uniforms: { 
      uTime: { value: 0 }, 
      uColor: { value: new THREE.Color('#ffffff') }
    },
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.z += step(0.5, sin(pos.x * 2.0 + uTime * 2.0)) * 0.08;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uColor;
      varying vec2 vUv;
      
      vec2 hash2(vec2 p) {
        return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);
      }

      float voronoi(vec2 x) {
        vec2 n = floor(x);
        vec2 f = fract(x);
        float m = 8.0;
        for(int j=-1; j<=1; j++) {
          for(int i=-1; i<=1; i++) {
            vec2 g = vec2(float(i),float(j));
            vec2 o = hash2(n + g);
            o = 0.5 + 0.5*sin(uTime * 1.5 + 6.2831*o);
            vec2 r = g + o - f;
            float d = dot(r,r);
            if(d<m) m = d;
          }
        }
        return sqrt(m);
      }

      void main() {
        vec2 centerUv = vec2(vUv.x - 0.5, (vUv.y - 0.5) * 1.8);
        float dist = length(centerUv);
        
        float v1 = voronoi(vUv * 10.0 - vec2(uTime * 0.2, 0.0));
        float v2 = voronoi(vUv * 18.0 + vec2(uTime * 0.1, uTime * 0.1));
        float cloudNoise = 1.0 - (v1 * 0.6 + v2 * 0.4);

        float edgeFalloff = smoothstep(0.48, 0.1, dist);
        float finalFoamValue = cloudNoise * edgeFalloff;

        float cloudThreshold = step(0.45, finalFoamValue);

        if(cloudThreshold < 0.1) discard;

        gl_FragColor = vec4(uColor, 1.0);
      }
    `
  }), [])

  return (
    <group position={[0, 0.08, 0]}>
      {/* FIXED: Passed valid [width, height] dimensions inside the args arrays */}
      
      {/* LAYER 1: The Dark Water Outline Shell */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} scale={[1.05, 1.05, 1.05]}>
        <planeGeometry args={[10, 6]} />
        <shaderMaterial 
          args={[{
            ...CloudFoamShader,
            uniforms: { ...CloudFoamShader.uniforms, uColor: { value: new THREE.Color('#3a86c8') } }
          }]} 
          transparent 
          side={THREE.DoubleSide} 
        />
      </mesh>

      {/* LAYER 2: The Pure White Clumpy Cloud Top */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 6]} />
        <shaderMaterial 
          ref={materialRef} 
          args={[CloudFoamShader]} 
          transparent 
          side={THREE.DoubleSide} 
        />
      </mesh>
    </group>
  )
}