import { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';

const SPAWN_HEIGHT = 15; // matches the original +/-15 vertical spawn band
const RAIN_OPACITY = 0.4;

interface RainProps {
  count?: number;
  fading?: boolean;
  fadeSeconds?: number;
}

export function Rain({ count = 2000, fading = false, fadeSeconds = 2.5 }: RainProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  // Eases the shared material's opacity down instead of the rain just
  // vanishing the instant the hold window ends -- same gsap tween idiom
  // used throughout PhaseCube/Environment/OceanWater.
  useEffect(() => {
    if (!materialRef.current) return;
    if (fading) {
      gsap.to(materialRef.current, { opacity: 0, duration: fadeSeconds, ease: 'power1.out' });
    } else {
      gsap.killTweensOf(materialRef.current);
      materialRef.current.opacity = RAIN_OPACITY;
    }
  }, [fading, fadeSeconds]);

  // Create temp object for matrix transformations
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Set random starting positions for instancing
  const rainDrops = useMemo(() => {
    const drops = [];
    for (let i = 0; i < count; i++) {
      drops.push({
        x: (Math.random() - 0.5) * 100,
        y: (Math.random() - 0.5) * 30,
        z: (Math.random() - 0.5) * 60,
        speed: 0.2 + Math.random() * 0.3,
      });
    }
    return drops;
  }, [count]);

  useFrame(() => {
    if (!meshRef.current) return;
    rainDrops.forEach((drop, i) => {
      drop.y -= drop.speed;

      // Loop back to the top of the spawn band once a drop falls out of
      // view, instead of falling forever -- without this, drops thin out
      // to nothing well before the rain-triggered window actually ends.
      if (drop.y < -SPAWN_HEIGHT) drop.y = SPAWN_HEIGHT;

      // Update the dummy object and apply it to the instanced mesh
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.scale.set(0.05, 0.3, 0.05); // Stretch into a rain streak
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <coneGeometry args={[0.1, 1, 4]} />
      <meshBasicMaterial ref={materialRef} color="#ffffff" opacity={RAIN_OPACITY} transparent />
    </instancedMesh>
  );
}
