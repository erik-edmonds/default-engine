'use client';

import { createContext, useContext, useState } from 'react';
import { AppState } from '@/helpers/Interfaces';


const AppStateContext = createContext<AppState | undefined>(undefined);
const time = () => {
    const now = new Date().getHours();
    if (now <= 17 && now > 6) {
      return "day"
    }
    else if(now <= 18 && now > 14) {
      return "evening"
    }
    else {
      return "night"
    }
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