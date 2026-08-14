import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';


export type UniversityTheme = { background: string; backgroundElement: string; secondary: string; tertiary: string; text: string; logoUrl?: string | null };
export type StudentLevel = 'undergraduate' | 'graduate';

// Student-configured campus locations. Never model-generated, so hours and names stay trustworthy.
export type CampusSpot = {
  id: string;
  name: string;
  opensAt: string;
  closesAt: string;
  coveredByPlan: boolean;
  walkMinutes: string;
  estimatedCost?: string;
};

export const STARTUP_UNIVERSITY_THEME: UniversityTheme = {
  background: '#F5EFE4',
  backgroundElement: '#FFF9EF',
  secondary: '#E7D2B6',
  tertiary: '#F1BF5C',
  text: '#4C3A22',
  logoUrl: null,
};

const SETTINGS_STORAGE_KEY = 'dinewise.settings.v1';
// Bump when palette resolution changes so stale stored themes are discarded instead of shown.
const PALETTE_VERSION = 2;

type PersistedSettings = {
  authToken: string | null;
  authUsername: string;
  authEmail?: string;
  paletteVersion?: number;
  contact: string;
  name: string;
  school: string;
  studentLevel: StudentLevel | null;
  deliveryService: string;
  customDeliveryService: string;
  universityTheme: UniversityTheme;
  diningSystems: string[];
  diningSystemSummary: string;
  diningSessionConfigured: boolean;
  configuredDiningSession: string | null;
  planBalance?: string;
  planDaysLeft?: string;
  lastCraving?: string;
  lastContext?: string;
  campusSpots?: CampusSpot[];
};

type DiningPlanContextValue = {
  hydrated: boolean;
  authToken: string | null;
  setAuthToken: React.Dispatch<React.SetStateAction<string | null>>;
  authUsername: string;
  setAuthUsername: React.Dispatch<React.SetStateAction<string>>;
  contact: string;
  setContact: React.Dispatch<React.SetStateAction<string>>;
  name: string;
  setName: React.Dispatch<React.SetStateAction<string>>;
  school: string;
  setSchool: React.Dispatch<React.SetStateAction<string>>;
  studentLevel: StudentLevel | null;
  setStudentLevel: React.Dispatch<React.SetStateAction<StudentLevel | null>>;
  deliveryService: string;
  setDeliveryService: React.Dispatch<React.SetStateAction<string>>;
  customDeliveryService: string;
  setCustomDeliveryService: React.Dispatch<React.SetStateAction<string>>;
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
  planBalance: string;
  setPlanBalance: React.Dispatch<React.SetStateAction<string>>;
  planDaysLeft: string;
  setPlanDaysLeft: React.Dispatch<React.SetStateAction<string>>;
  lastCraving: string;
  setLastCraving: React.Dispatch<React.SetStateAction<string>>;
  lastContext: string;
  setLastContext: React.Dispatch<React.SetStateAction<string>>;
  campusSpots: CampusSpot[];
  setCampusSpots: React.Dispatch<React.SetStateAction<CampusSpot[]>>;
};

const DiningPlanContext = React.createContext<DiningPlanContextValue | null>(null);

// Mounted once above the Stack in the root layout so this state survives
// navigation between (tabs), meal-plan-setup, and meal-plan-other.
export function DiningPlanProvider({ children }: { children: React.ReactNode }) {
  const [authToken, setAuthToken] = React.useState<string | null>(null);
  const [authUsername, setAuthUsername] = React.useState('');
  const [contact, setContact] = React.useState('');
  const [name, setName] = React.useState('');
  const [school, setSchool] = React.useState('');
  const [studentLevel, setStudentLevel] = React.useState<StudentLevel | null>(null);
  const [deliveryService, setDeliveryService] = React.useState('');
  const [customDeliveryService, setCustomDeliveryService] = React.useState('');
  const [universityTheme, setUniversityTheme] = React.useState<UniversityTheme>(STARTUP_UNIVERSITY_THEME);
  const [diningSystems, setDiningSystems] = React.useState<string[]>([]);
  const [diningSystemSummary, setDiningSystemSummary] = React.useState('');
  const [diningSessionConfigured, setDiningSessionConfigured] = React.useState(false);
  const [configuredDiningSession, setConfiguredDiningSession] = React.useState<string | null>(null);
  const [planBalance, setPlanBalance] = React.useState('');
  const [planDaysLeft, setPlanDaysLeft] = React.useState('');
  const [lastCraving, setLastCraving] = React.useState('');
  const [lastContext, setLastContext] = React.useState('');
  const [campusSpots, setCampusSpots] = React.useState<CampusSpot[]>([]);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!raw || cancelled) {
          return;
        }

        const parsed = JSON.parse(raw) as Partial<PersistedSettings>;

        // Always require explicit login on app launch.
        setAuthToken(null);
        if (typeof parsed.authUsername === 'string') {
          setAuthUsername(parsed.authUsername);
        } else if (typeof parsed.authEmail === 'string') {
          // Legacy fallback for older persisted payloads.
          setAuthUsername(parsed.authEmail);
        }
        if (typeof parsed.contact === 'string') setContact(parsed.contact);
        if (typeof parsed.name === 'string') setName(parsed.name);
        if (typeof parsed.school === 'string') setSchool(parsed.school);
        if (parsed.studentLevel === 'undergraduate' || parsed.studentLevel === 'graduate' || parsed.studentLevel === null) {
          setStudentLevel(parsed.studentLevel);
        }
        if (typeof parsed.deliveryService === 'string') setDeliveryService(parsed.deliveryService);
        if (typeof parsed.customDeliveryService === 'string') setCustomDeliveryService(parsed.customDeliveryService);
        if (parsed.universityTheme && typeof parsed.universityTheme === 'object' && parsed.paletteVersion === PALETTE_VERSION) {
          setUniversityTheme((prev) => ({
            ...prev,
            ...parsed.universityTheme,
          }));
        }
        if (Array.isArray(parsed.diningSystems)) {
          setDiningSystems(parsed.diningSystems.filter((item): item is string => typeof item === 'string'));
        }
        if (typeof parsed.diningSystemSummary === 'string') setDiningSystemSummary(parsed.diningSystemSummary);
        if (typeof parsed.diningSessionConfigured === 'boolean') setDiningSessionConfigured(parsed.diningSessionConfigured);
        if (typeof parsed.configuredDiningSession === 'string' || parsed.configuredDiningSession === null) {
          setConfiguredDiningSession(parsed.configuredDiningSession);
        }
        if (typeof parsed.planBalance === 'string') setPlanBalance(parsed.planBalance);
        if (typeof parsed.planDaysLeft === 'string') setPlanDaysLeft(parsed.planDaysLeft);
        if (typeof parsed.lastCraving === 'string') setLastCraving(parsed.lastCraving);
        if (typeof parsed.lastContext === 'string') setLastContext(parsed.lastContext);
        if (Array.isArray(parsed.campusSpots)) {
          setCampusSpots(parsed.campusSpots.filter((item): item is CampusSpot => Boolean(item && typeof item.name === 'string')));
        }
      } catch {
        // Ignore malformed persisted data and fall back to defaults.
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    };

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!hydrated) return;

    const payload: PersistedSettings = {
      authToken: null,
      authUsername,
      paletteVersion: PALETTE_VERSION,
      contact,
      name,
      school,
      studentLevel,
      deliveryService,
      customDeliveryService,
      universityTheme,
      diningSystems,
      diningSystemSummary,
      diningSessionConfigured,
      configuredDiningSession,
      planBalance,
      planDaysLeft,
      lastCraving,
      lastContext,
      campusSpots,
    };

    AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload)).catch(() => {
      // Ignore write failures in runtime; app remains usable with in-memory state.
    });
  }, [
    hydrated,
    authUsername,
    contact,
    name,
    school,
    studentLevel,
    deliveryService,
    customDeliveryService,
    universityTheme,
    diningSystems,
    diningSystemSummary,
    diningSessionConfigured,
    configuredDiningSession,
    planBalance,
    planDaysLeft,
    lastCraving,
    lastContext,
    campusSpots,
  ]);

  const value = React.useMemo<DiningPlanContextValue>(() => ({
    hydrated,
    authToken,
    setAuthToken,
    authUsername,
    setAuthUsername,
    contact,
    setContact,
    name,
    setName,
    school,
    setSchool,
    studentLevel,
    setStudentLevel,
    deliveryService,
    setDeliveryService,
    customDeliveryService,
    setCustomDeliveryService,
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
    planBalance,
    setPlanBalance,
    planDaysLeft,
    setPlanDaysLeft,
    lastCraving,
    setLastCraving,
    lastContext,
    setLastContext,
    campusSpots,
    setCampusSpots,
  }), [
    hydrated,
    authToken,
    authUsername,
    contact,
    name,
    school,
    studentLevel,
    deliveryService,
    customDeliveryService,
    universityTheme,
    diningSystems,
    diningSystemSummary,
    diningSessionConfigured,
    configuredDiningSession,
    planBalance,
    planDaysLeft,
    lastCraving,
    lastContext,
    campusSpots,
  ]);

  return <DiningPlanContext.Provider value={value}>{children}</DiningPlanContext.Provider>;
}

export function useDiningPlan() {
  const ctx = React.useContext(DiningPlanContext);
  if (!ctx) throw new Error('useDiningPlan must be used within a DiningPlanProvider');
  return ctx;
}
