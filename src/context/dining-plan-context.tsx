import React from 'react';

import { Colors } from '@/constants/theme';

export type UniversityTheme = { background: string; backgroundElement: string; secondary: string; tertiary: string; text: string; logoUrl?: string | null };
export type StudentLevel = 'undergraduate' | 'graduate';

type DiningPlanContextValue = {
  school: string;
  setSchool: React.Dispatch<React.SetStateAction<string>>;
  studentLevel: StudentLevel | null;
  setStudentLevel: React.Dispatch<React.SetStateAction<StudentLevel | null>>;
  universityTheme: UniversityTheme;
  setUniversityTheme: React.Dispatch<React.SetStateAction<UniversityTheme>>;
  diningSystems: string[];
  setDiningSystems: React.Dispatch<React.SetStateAction<string[]>>;
  diningSystemSummary: string;
  setDiningSystemSummary: React.Dispatch<React.SetStateAction<string>>;
  diningSessionConfigured: boolean;
  setDiningSessionConfigured: React.Dispatch<React.SetStateAction<boolean>>;
  configuredDiningSession: string | null;
  setConfiguredDiningSession: React.Dispatch<React.SetStateAction<string | null>>;
};

const DiningPlanContext = React.createContext<DiningPlanContextValue | null>(null);

// Mounted once above the Stack in the root layout so this state survives
// navigation between (tabs), meal-plan-setup, and meal-plan-other.
export function DiningPlanProvider({ children }: { children: React.ReactNode }) {
  const [school, setSchool] = React.useState('');
  const [studentLevel, setStudentLevel] = React.useState<StudentLevel | null>(null);
  const [universityTheme, setUniversityTheme] = React.useState<UniversityTheme>({
    background: Colors.light.textSecondary,
    backgroundElement: Colors.light.background,
    secondary: Colors.light.backgroundElement,
    tertiary: Colors.light.textSecondary,
    text: Colors.light.text,
    logoUrl: null,
  });
  const [diningSystems, setDiningSystems] = React.useState<string[]>([]);
  const [diningSystemSummary, setDiningSystemSummary] = React.useState('');
  const [diningSessionConfigured, setDiningSessionConfigured] = React.useState(false);
  const [configuredDiningSession, setConfiguredDiningSession] = React.useState<string | null>(null);

  const value = React.useMemo<DiningPlanContextValue>(() => ({
    school,
    setSchool,
    studentLevel,
    setStudentLevel,
    universityTheme,
    setUniversityTheme,
    diningSystems,
    setDiningSystems,
    diningSystemSummary,
    setDiningSystemSummary,
    diningSessionConfigured,
    setDiningSessionConfigured,
    configuredDiningSession,
    setConfiguredDiningSession,
  }), [school, studentLevel, universityTheme, diningSystems, diningSystemSummary, diningSessionConfigured, configuredDiningSession]);

  return <DiningPlanContext.Provider value={value}>{children}</DiningPlanContext.Provider>;
}

export function useDiningPlan() {
  const ctx = React.useContext(DiningPlanContext);
  if (!ctx) throw new Error('useDiningPlan must be used within a DiningPlanProvider');
  return ctx;
}
