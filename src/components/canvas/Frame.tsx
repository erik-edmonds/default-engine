"use client";

import * as THREE from 'three'
import { useEffect, useRef, useState, useCallback, ReactNode } from 'react'
import { suspend  } from 'suspend-react'
import { Canvas, ThreeEvent, useFrame } from '@react-three/fiber'
import { useCursor, MeshReflectorMaterial, Image, Text, Environment, MeshPortalMaterial, Preload } from '@react-three/drei'
import { useRoute, useLocation } from 'wouter'
import { useRouter } from 'next/navigation'
import { easing } from 'maath'
import { throttle } from 'lodash-es'

import Earth from '@/components/models/Earth'
import Erik from '@/components/models/Erik'
import Laptop from '@/components/models/Laptop'
import Network from '@/components/models/Network'
import Gaussian from '@/components/models/Gaussian';
import PointCloud from '@/components/models/PointCloud';

//Scenes
import WaterScene from '@/components/tests/WaterScene';
import MushroomScene from '@/components/tests/MushroomScene';

// Install for offline environment access.
const city = import('@pmndrs/assets/hdri/city.exr').then((mod) => mod.default)

const images = [
  // Front
  { position: [0, 0, 1.5], rotation: [0, 0, 0], url: "driving", name: "Self Driving Vehicles", child: 
    <>
      <ambientLight intensity={4}/>
      <pointLight position={[0, 0, -9]} color="#ff277a" intensity={10} distance={26} />
      <pointLight position={[-5, 2, -2]} color="#2adfff" intensity={10} distance={20} />
      <WaterScene rotation={[0,0,0]} scale={0.5}/>
    </>, 
    color: "white" },

  // Back
  { position: [-0.8, 0, -0.6], rotation: [0, 0, 0], url: "one", name: "One", child: 
    <>
      <ambientLight/>
      <Earth />
    </>, 
    color: "#ff6c4e" }, //Left
  { position: [0.8, 0, -0.6], rotation: [0, 0, 0], url: "two", name: "Two", child: 
    <>
      <ambientLight/>
      <Erik />
    </>, 
    color: "blue" }, //Right

  // Left
  //{ position: [-2, 0, 2.75], rotation: [0, Math.PI / 2.5, 0], url: "scuba.png" }, //True Front
  { position: [-2.15, 0, 1.5], rotation: [0, Math.PI / 2.5, 0], url: "election", name: "Elections Visualization", child: 
    <>
      <ambientLight />
      <MushroomScene />
    </>, 
    color: "#50509b" }, //Front
  { position: [-1.75, 0, 0.25], rotation: [0, Math.PI / 2.5, 0], url: "pointcloud", name: "Point Cloud", child: 
    <> 
      <ambientLight />
      <PointCloud position={[-10, 0, -100]} scale={3} />
    </>, 
    color: "hotpink" }, //Rear
  
  // Right
  //{ position: [2, 0, 2.75], rotation: [0, -Math.PI / 2.5, 0], url: "scuba.png" } // True Front
  { position: [2.15, 0, 1.5], rotation: [0, -Math.PI / 2.5, 0], url: "gaussian", name: "Gaussian Splatting", child: 
    <>
      <ambientLight />
      <Gaussian position={[7.5, 1, -50]} scale={1} />
    </>, 
    color: "#bc9e91" },  //Front
  { position: [1.75, 0, 0.25], rotation: [0, -Math.PI / 2.5, 0], url: "detection", name: "Object Detection", child: 
    <>
      <ambientLight />
      <Network />
    </>, 
    color: "white" }, //Rear
]
const GOLDENRATIO = 1.61803398875

interface PortfolioFrameProps {
  position: number[]
  rotation: number[]
  child: ReactNode
  color: string
  url: string
  name: string
}

// Group into categories?
function Frames({ images, q = new THREE.Quaternion(), p = new THREE.Vector3() }: { images: PortfolioFrameProps[]; q?: THREE.Quaternion; p?: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null)
  const clicked = useRef<THREE.Object3D | undefined>(undefined)
  const [active, setActive] = useState(false)
  const router = useRouter()
  const [, params] = useRoute('/item/:id')
  const [, setLocation] = useLocation()

  useEffect(() => {
    clicked.current = ref.current?.getObjectByName(params?.id as string)
    if (clicked.current) {
      clicked.current.parent!.updateWorldMatrix(true, true)
      clicked.current.parent!.localToWorld(p.set(0, GOLDENRATIO / 2, 0.25))
      clicked.current.parent!.getWorldQuaternion(q)
    } else {
      p.set(0, 0, 4.5)
      q.identity()
    }
  })

  useFrame((state, dt) => {
    easing.damp3(state.camera.position, p, 0.4, dt)
    easing.dampQ(state.camera.quaternion, q, 0.4, dt)
  })

  const click = useCallback(throttle((events: ThreeEvent<MouseEvent>) => {
    setLocation(clicked.current === events.object ? '/' : '/item/' + events.object.name)
  }, 1000),[])

  return (
    <group
      ref={ref}
      onClick={
        (e) => {
          setActive(true)
          e.stopPropagation()
          click(e)
        }
      }
      onDoubleClick={
        (e) => { 
          e.stopPropagation()
          router.push('/portfolio/'+e.object.name)
        }
      }
      onPointerMissed={
        () => {
          setLocation('/portfolio')
          setActive(false)
        }
      }>
      {images.map((props) => 
        <Frame key={props.url} {...props}>
          {props.child}
        </Frame>
      /* prettier-ignore */)}
    </group>
  )
}

function Frame({ url, name, color, child, ...props }: PortfolioFrameProps & { c?: THREE.Color }) {
  const portal = useRef<any>(null)
  const frame = useRef<THREE.Mesh>(null)
  const [, params] = useRoute('/item/:id')
  const [hovered, hover] = useState(false)
  const [rnd] = useState(() => Math.random())
  const isActive = params?.id === url
  useCursor(hovered)
  return (
    <group {...(props as any)}>
      <mesh
        name={url}
        onPointerOver={(e) => (e.stopPropagation(), hover(true))}
        onPointerOut={() => hover(false)}
        scale={[1, GOLDENRATIO, 0.05]}
        position={[0, GOLDENRATIO / 2, 0]}>
        <boxGeometry />
        <meshStandardMaterial color="#808080" metalness={1} roughness={0.1} envMapIntensity={2} />
        <mesh ref={frame} raycast={() => null} scale={[0.9, 0.93, 0.9]} position={[0, 0, 0.2]}>
          <boxGeometry />
          <MeshPortalMaterial ref={portal} side={THREE.DoubleSide}>
            <color attach="background" args={[color]} />
            {child}
          </MeshPortalMaterial>
        </mesh>
      </mesh>
      <Text maxWidth={0.2} anchorX="left" anchorY="top" position={[0.55, GOLDENRATIO, 0]} fontSize={0.03}>
        {name}
      </Text>
    </group>
  )
}

export default function Page() {
	return (
		<main className="portfolio-page">
			<div className="canvas-wrap">
				<Canvas dpr={[1, 1.5]} camera={{ fov: 70 }}>
          <color attach="background" args={['#191920']} />
          <fog attach="fog" args={['#191920', 0, 10]} />
          <group position={[0, -0.5, 0]}>
            <Frames images={images} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.25, 0]}>
              <planeGeometry args={[50, 50]} />
              <MeshReflectorMaterial
                blur={[300, 100]}
                resolution={2048}
                mixBlur={1}
                mixStrength={80}
                roughness={1}
                depthScale={1.2}
                minDepthThreshold={0.4}
                maxDepthThreshold={1.4}
                color="#050505"
                metalness={0.5}
              />
            </mesh>
          </group>
          <Environment preset='sunset' />
          {/* <Environment background={false} files={suspend(city)} /> */}
				</Canvas>
			</div>

      <section className="hud">
				<p className="kicker">Across..</p>
				<h1>THE PORTAL</h1>
				<p>
					Click on a frame to enter or exit the portal, and double click to explore more about the project.
				</p>
			</section>

      <style jsx>{`
        .portfolio-page {
          position: relative;
          min-height: 100vh;
          overflow: hidden;
        }

        .canvas-wrap {
          position: absolute;
          inset: 0;
        }

        .hud {
					position: absolute;
					left: clamp(1rem, 4vw, 2.6rem);
					bottom: clamp(1rem, 4vw, 2.6rem);
					z-index: 2;
					max-width: min(600px, 90vw);
					padding: 1.15rem 1.2rem;
					background: rgba(6, 7, 22, 0.58);
					border: 2px solid rgba(255, 108, 78, 0.82);
					box-shadow: 0 0 38px rgba(255, 81, 126, 0.45);
					backdrop-filter: blur(8px);
				}

				.kicker {
					margin: 0;
					text-transform: uppercase;
					letter-spacing: 0.14em;
					font-size: 0.76rem;
					font-weight: 700;
					color: #ffd84d;
				}

				h1 {
					margin: 0.35rem 0 0.55rem;
					font-size: clamp(1.9rem, 4.6vw, 3.7rem);
					line-height: 0.94;
					color: #ffe95e;
					text-shadow: 0 0 14px rgba(255, 98, 78, 0.85), 0 0 26px rgba(255, 57, 136, 0.55);
				}

				p {
					margin: 0;
					line-height: 1.5;
					font-size: clamp(0.95rem, 1.5vw, 1.06rem);
					color: #eaf0ff;
				}
      `}</style>
		</main>
	);
}
