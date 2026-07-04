import  { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function Rain({ count = 2000 }) {
  const meshRef = useRef();
  
  // Create temp object for matrix transformations
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Set random starting positions for instancing
  const rainDrops = useMemo(() => {
    const drops = [];
    for (let i = 0; i < count; i++) {
      drops.push({
        x: (Math.random() - 0.5) * 40,
        y: Math.random() * 30,
        z: (Math.random() - 0.5) * 40,
        speed: 0.2 + Math.random() * 0.3,
      });
    }
    return drops;
  }, [count]);

  useFrame(() => {
    rainDrops.forEach((drop, i) => {
      drop.y -= drop.speed;
      
      // Reset drop
      if (drop.y < -10) {
        drop.y = 20;
      }

      // Update the dummy object and apply it to the instanced mesh
      dummy.position.set(drop.x, drop.y, drop.z);
      dummy.scale.set(0.05, 0.3, 0.05); // Stretch into a rain streak
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <coneGeometry args={[0.1, 1, 4]} />
      <meshBasicMaterial color="#ffffff" opacity={0.4} transparent />
    </instancedMesh>
  );
}