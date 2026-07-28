'use client';

import { createContext, useContext, useState, useRef, forwardRef, useImperativeHandle } from 'react'
import {  useFrame, useThree } from '@react-three/fiber'
import { AppState } from '@/helpers/Interfaces';
import { atom } from 'jotai'

const AppStateContext = createContext<AppState | undefined>(undefined);
const BoxContext = createContext(null)

const time = () => {
    const now = new Date().getHours();
    if (now > 4 && now <= 6) {
      return "dawn"
    }
    else if (now <= 17 && now > 6) {
      return "day"
    }
    else if(now <= 18 && now > 14) {
      return "evening"
    }
    else {
      return "night"
    }
  }

export const BoxStateProvider = forwardRef(({ children, ...props }, fref) => {
  const ref = useRef()
  const [hovered, hover] = useState(false)
  const [clicked, click] = useState(false)
  useFrame((state, delta) => (ref.current.rotation.x += delta))
  useImperativeHandle(fref, () => ref.current, [])
  return (
    <mesh
      {...props}
      ref={ref}
      scale={clicked ? 1.5 : 1}
      onClick={(event) => click(!clicked)}
      onPointerMove={(event) => (event.stopPropagation(), hover(event.face.materialIndex))}
      onPointerOut={() => {}}>
      <BoxContext value={hovered}>{children}</BoxContext>
    </mesh>
  )
})

export function useBox() {
  const context = useContext(BoxContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState(time);

  return (
    <AppStateContext.Provider value={{ theme, setTheme }}>
      {children}
    </AppStateContext.Provider>
  );
}

// Custom hook to consume the state in other components
export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) throw new Error('useAppState must be used within AppStateProvider');
  return context;
}


// Atoms
export const pointer = atom(false)
export const clicked = atom(true)
export const hovered = atom(false)
export const raining = atom(false)
export const inSkyJourney = atom(false)
export const goHomeRequest = atom(0) // incrementing counter -- bumped to request a return-home