'use client';

import { createContext, useContext, useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
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

export const BoxStateProvider = forwardRef(function BoxStateProvider({ children, ...props }, fref) {
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
  // Fixed initial value so SSR and the client's first render always agree --
  // computing time() directly in useState() runs it once on the server and
  // again at hydration, and if the real clock crosses an hour boundary (4,
  // 6, 14, 17, 18) in between, server and client land in different theme
  // buckets, causing a hydration mismatch on anything themed (e.g.
  // Favicon's fill colors). Deferring the real read to a post-mount effect
  // keeps the first paint deterministic; it then corrects to the real
  // time-of-day immediately after.
  const [theme, setTheme] = useState<string>("day");
  const syncTheme = useCallback(() => setTheme(time()), []);
  useEffect(() => { syncTheme(); }, [syncTheme]);

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
export const thunder = atom(0) // incrementing counter -- bumped on cloud click to trigger a thunder burst

// True while the LiDAR-scan title screen is up (page.tsx: sceneReady &&
// !started). Favicon.tsx reads this to hide the home button during load --
// it's rendered from layout.tsx, outside page.tsx's own component tree, so
// local state there can't reach it directly.
export const titleScreenActive = atom(false)

// Master sound switch (SoundToggle.tsx) -- gates every sound in the app,
// music included. Off during the loading screen; page.tsx's handleEnter
// flips this true as part of the Enter click itself, a real user gesture,
// so every gated Howl can start playing immediately with no autoplay
// restriction to work around.
export const sfxEnabled = atom(false)

// Speaker prop's own toggle -- expresses intent only ("I want music
// playing"), independent of whether the master switch above currently
// allows anything to be heard. Speaker.tsx gates actual playback on
// `musicEnabled && sfxEnabled` together, so this is a child control: you
// can "turn music on" while muted and it starts the moment you unmute,
// the same way an app's own volume survives your system output being
// muted and unmuted.
export const musicEnabled = atom(false)