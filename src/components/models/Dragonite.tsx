import React, { useRef, useEffect } from 'react'
import { useGLTF, useFBX, useAnimations } from '@react-three/drei'

export function Dragonite(props) {
    const ref = useRef()
    const { nodes, materials } = useGLTF('/models/dragonite.glb')
    const { animations } = useFBX('/models/flying.fbx')
    animations[0].name = 'flying'
    const { actions } = useAnimations(animations, ref)
    useEffect(() => {
        actions['flying']?.reset().play()
    }, [])

    return (
        <group ref={ref} {...props} dispose={null}>
        <mesh
            castShadow
            receiveShadow
            geometry={nodes.mesh_0.geometry}
            material={nodes.mesh_0.material}
        />
        </group>
    )
}

useGLTF.preload('/models/dragonite.glb')