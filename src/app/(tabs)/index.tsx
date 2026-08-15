import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DeviceMotion } from 'expo-sensors';
import React from 'react';
import { ActivityIndicator, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeInDown, FadeInUp, FadeOut, FadeOutDown, FadeOutUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { STARTUP_UNIVERSITY_THEME, useDiningPlan, type StudentLevel } from '@/context/dining-plan-context';
import { fetchWithRetry } from '@/utils/backend-fetch';
import { getBackendBaseUrl } from '@/utils/backend-url';
import { formatMinutesUntilClose, rankOpenSpots } from '@/utils/campus-decision';
import { showAlert } from '@/utils/dialog';
import { contrastColor, contrastRatio, normalizeHex, pickReadableColor } from '@/utils/theme-color';

const ERROR_COLOR = '#cc0000';
const OUTCOME_STATE_STORAGE_KEY = 'dinewise.outcomeState.v1';
const MOTION_FAST_MS = 170;
const MOTION_BALANCED_MS = 240;
const MOTION_CINEMATIC_MS = 340;

type ChipOption = { label: string; emoji?: string };

const CRAVING_OPTIONS: ChipOption[] = [
  { label: 'Pizza', emoji: '🍕' },
  { label: 'Burger', emoji: '🍔' },
  { label: 'Tacos', emoji: '🌮' },
  { label: 'Sushi', emoji: '🍣' },
  { label: 'Salad', emoji: '🥗' },
  { label: 'Coffee', emoji: '☕' },
  { label: 'Ramen', emoji: '🍜' },
  { label: 'Something sweet', emoji: '🍩' },
];

const CONTEXT_OPTIONS: ChipOption[] = [
  { label: 'Late-night study', emoji: '🌙' },
  { label: 'Between classes', emoji: '🏃' },
  { label: 'Hanging with friends', emoji: '🎉' },
  { label: 'Post-workout', emoji: '💪' },
  { label: 'Lazy weekend', emoji: '🛋️' },
];

const MEAL_PLAN_STATUS_OPTIONS: ChipOption[] = [
  { label: 'Plenty left', emoji: '💰' },
  { label: 'Fair amount', emoji: '🙂' },
  { label: 'Running low', emoji: '😬' },
  { label: 'Almost empty', emoji: '🚨' },
];

const DELIVERY_FREQUENCY_OPTIONS: ChipOption[] = [
  { label: 'Rarely', emoji: '🐢' },
  { label: 'Sometimes', emoji: '🙂' },
  { label: 'Often', emoji: '🚴' },
  { label: 'Daily', emoji: '🔥' },
];

const STUDENT_LEVEL_OPTIONS: readonly StudentLevel[] = ['undergraduate', 'graduate'];

const BALANCE_PRESETS = [5, 10, 20, 50];

// Students rarely know an exact total before checkout, so offer common order sizes.
const DELIVERY_COST_PRESETS = [12, 18, 25, 35];

const MEAL_PLAN_STATUS_WEIGHTS: Record<string, number> = {
  'Plenty left': 0.9,
  'Fair amount': 0.65,
  'Running low': 0.35,
  'Almost empty': 0.1,
};

const DELIVERY_FREQUENCY_WEIGHTS: Record<string, number> = {
  Rarely: 0.12,
  Sometimes: 0.32,
  Often: 0.62,
  Daily: 0.9,
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function buildPlanEconomics(planBalance: string, planDaysLeft: string, deliveryFrequency: string) {
  const balance = Number.parseFloat(planBalance);
  const days = Number.parseInt(planDaysLeft, 10);
  const hasBalance = Number.isFinite(balance) && balance > 0;
  const hasDays = Number.isFinite(days) && days > 0;

  if (!hasBalance || !hasDays) {
    return {
      hasPlanData: false,
      balance: hasBalance ? balance : null,
      days: hasDays ? days : null,
      targetPerDay: null as number | null,
      projectedWaste: null as number | null,
      headline: 'Not tracked yet',
      detail: 'Tell DineWise what is left so it can do the math for you.',
      tone: 'neutral' as const,
    };
  }

  const targetPerDay = Math.round((balance / days) * 100) / 100;
  const skipRate = DELIVERY_FREQUENCY_WEIGHTS[deliveryFrequency];

  // Without a stated delivery habit there is nothing to project waste from, so report facts only.
  if (skipRate === undefined) {
    return {
      hasPlanData: true,
      balance,
      days,
      targetPerDay,
      projectedWaste: null as number | null,
      headline: 'Tracking',
      detail: `Spend about $${targetPerDay.toFixed(2)} per day on campus to use this up.`,
      tone: 'neutral' as const,
    };
  }

  const projectedWaste = Math.round(balance * skipRate * 100) / 100;

  const tone = skipRate < 0.25 ? 'good' : skipRate < 0.55 ? 'warn' : 'bad';
  const headline =
    tone === 'good'
      ? 'On track'
      : tone === 'warn'
        ? 'Slightly behind'
        : `At risk of wasting $${projectedWaste.toFixed(0)}`;
  const detail =
    tone === 'good'
      ? `You are pacing well at about $${targetPerDay.toFixed(2)} per day.`
      : `Spend about $${targetPerDay.toFixed(2)} per day on campus to use this up.`;

  return {
    hasPlanData: true,
    balance,
    days,
    targetPerDay,
    projectedWaste,
    headline,
    detail,
    tone,
  };
}

function buildDecisionSignal(
  mealPlanStatus: string,
  deliveryFrequency: string,
  budgetOutsideMealPlan: string,
  followThroughRate: number | null
) {
  const statusScore = MEAL_PLAN_STATUS_WEIGHTS[mealPlanStatus] ?? 0;
  const deliveryScore = DELIVERY_FREQUENCY_WEIGHTS[deliveryFrequency] ?? 0;
  const budgetValue = Number.parseFloat(budgetOutsideMealPlan);
  const hasBudget = Number.isFinite(budgetValue) && budgetValue > 0;
  const budgetScore = hasBudget ? clamp01(budgetValue / 22) : 0;
  const hasFollowThrough = followThroughRate !== null && Number.isFinite(followThroughRate);
  const slipScore = hasFollowThrough ? clamp01(1 - (followThroughRate as number)) : 0;
  const weights = hasFollowThrough
    ? { status: 0.4, delivery: 0.28, budget: 0.22, slip: 0.1 }
    : { status: 0.44, delivery: 0.31, budget: 0.25, slip: 0 };
  const meterScore = Math.round(clamp01(
    statusScore * weights.status +
    deliveryScore * weights.delivery +
    budgetScore * weights.budget +
    slipScore * weights.slip
  ) * 100);
  const hasRiskData = Boolean(mealPlanStatus || deliveryFrequency || hasBudget || hasFollowThrough);
  const hasWeeklyEstimate = Boolean(deliveryFrequency);
  const weeklyWaste = hasWeeklyEstimate
    ? Math.round(((statusScore * 9) + (deliveryScore * 11) + (slipScore * 3)) * 10) / 10
    : 0;
  const band = meterScore < 25 ? 'Low' : meterScore < 50 ? 'Moderate' : meterScore < 75 ? 'High' : 'Critical';
  const move = !hasRiskData
    ? 'Add a few details to estimate your waste risk.'
    : meterScore >= 60
    ? 'Use campus dining today.'
    : meterScore >= 30
      ? 'Campus dining is still the smarter default.'
      : 'You are in good shape. Keep leaning on campus options.';
  const dailyCap = hasBudget ? Math.max(0, Math.round((budgetValue / 7) * 100) / 100) : null;
  const budgetLine = hasBudget
    ? `Budget outside meal plan: $${budgetValue.toFixed(2)}`
    : 'Set your budget outside meal plan to track your spending.';
  const paceLine = dailyCap !== null
    ? `Target pace: about $${dailyCap.toFixed(2)} per day`
    : 'Add a budget to see your daily pace.';

  return {
    meterScore,
    band,
    weeklyWaste,
    move,
    budgetLine,
    paceLine,
    dailyCap,
    hasWeeklyEstimate,
  };
}

function buildNudgePoints(
  suggestion: string,
  whyItMatches: string | null,
  apiPoints: string[]
): string[] {
  const alreadyShown = new Set(
    [suggestion, whyItMatches || '']
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
  const seeded = Array.from(new Set(
    apiPoints
      .map((item) => item.trim())
      .filter((item) => item && !alreadyShown.has(item.toLowerCase()))
  )).slice(0, 3);
  if (seeded.length) return seeded;

  return [];
}

function isValidUsername(value: string): boolean {
  return /^[a-zA-Z0-9._-]{3,32}$/.test(value.trim());
}

function hexLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 1;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const rl = toLinear(r);
  const gl = toLinear(g);
  const bl = toLinear(b);
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function hexSaturation(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 0;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const largest = Math.max(r, g, b);
  const smallest = Math.min(r, g, b);
  return largest <= 0 ? 0 : (largest - smallest) / largest;
}

function normalizeThemePalette(data: {
  background: string;
  backgroundElement?: string;
  secondary?: string;
  tertiary?: string;
  text: string;
  logo_url?: string | null;
}) {
  const clean = (value?: string) => {
    const upper = (value || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(upper) ? upper : null;
  };

  const palette = Array.from(new Set(
    [data.background, data.backgroundElement, data.secondary, data.tertiary]
      .map(clean)
      .filter((value): value is string => Boolean(value))
  ));

  const ordered = [...palette].sort((a, b) => hexLuminance(a) - hexLuminance(b));
  const isNearBlack = (color: string) => hexLuminance(color) <= 0.02 && hexSaturation(color) < 0.18;
  const usable = ordered.filter((color) => !isNearBlack(color));

  // Without a page color plus a distinct card color from the school's own palette,
  // stay on the startup palette rather than substituting invented colors.
  if (ordered.length < 2 || !usable.length) {
    return { ...STARTUP_UNIVERSITY_THEME, logoUrl: data.logo_url ?? null };
  }

  // The first entry is the school's designated primary. Use it when it is a real brand hue;
  // if it is a neutral grey/white/black, fall back to the darkest branded color instead.
  const chromaticUsable = usable.filter((color) => hexSaturation(color) >= 0.18);
  const declaredPrimary = clean(data.background);
  const background =
    declaredPrimary && chromaticUsable.includes(declaredPrimary)
      ? declaredPrimary
      : (chromaticUsable.length ? chromaticUsable : usable)[0];
  const rest = ordered.filter((color) => color !== background);
  const separated = rest.filter((color) => contrastRatio(background, color) >= 2);
  if (!separated.length) {
    return { ...STARTUP_UNIVERSITY_THEME, logoUrl: data.logo_url ?? null };
  }

  const chromatic = separated.filter((color) => hexSaturation(color) >= 0.18);
  const lightestOf = (colors: string[]) =>
    colors.reduce((best, color) => (hexLuminance(color) > hexLuminance(best) ? color : best), colors[0]);
  const darkestOf = (colors: string[]) =>
    colors.reduce((best, color) => (hexLuminance(color) < hexLuminance(best) ? color : best), colors[0]);

  // Prefer a light branded hue; otherwise use the least-bright neutral that clears contrast.
  const backgroundElement = chromatic.length ? lightestOf(chromatic) : darkestOf(separated);
  const accents = rest.filter((color) => color !== backgroundElement);
  const accentPool = accents.length ? accents : rest;

  return {
    background,
    backgroundElement,
    secondary: accentPool[0],
    tertiary: accentPool[accentPool.length - 1],
    text: clean(data.text) ?? (hexLuminance(background) < 0.35 ? '#FFFFFF' : '#000000'),
    logoUrl: data.logo_url ?? null,
  };
}

function pickDistinctButtonColor(backgroundHex: string, cardHex: string, candidates: string[]): string {
  const normalizedBackground = (normalizeHex(backgroundHex) || '').toUpperCase();
  const normalizedCard = (normalizeHex(cardHex) || '').toUpperCase();

  const distinctCandidates = Array.from(new Set(
    candidates
      .map((candidate) => (normalizeHex(candidate) || '').toUpperCase())
      .filter(Boolean)
  )).filter((candidate) => candidate !== normalizedBackground && candidate !== normalizedCard);

  const fallbackDistinct = ['#F97316', '#0EA5E9', '#22C55E', '#E11D48', '#F59E0B']
    .filter((candidate) => candidate !== normalizedBackground && candidate !== normalizedCard);

  const pool = distinctCandidates.length ? distinctCandidates : fallbackDistinct;
  return pickReadableColor(backgroundHex, pool, 3);
}

function Chip({
  label,
  emoji,
  selected,
  onPress,
  accentColor,
  accentTextColor,
  mutedBg,
  mutedText,
}: {
  label: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
  accentColor: string;
  accentTextColor: string;
  mutedBg: string;
  mutedText: string;
}) {
  const chipBg = selected ? accentColor : mutedBg;
  const chipTextColor = selected ? contrastColor(chipBg) : mutedText;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.chip, { backgroundColor: chipBg }]}>
        <View style={styles.chipTextRow}>
          {emoji ? (
            <Text style={{ fontSize: 13, color: chipTextColor }}>{emoji}</Text>
          ) : null}
          <Text
            style={{
              fontSize: 13,
              fontWeight: selected ? '700' : '500',
              color: chipTextColor,
            }}
          >
            {label}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { setupFlow } = useLocalSearchParams<{ setupFlow?: string }>();

  const {
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
    typicalDeliveryCost,
    setTypicalDeliveryCost,
  } = useDiningPlan();

  const [hasOnboarded, setHasOnboarded] = React.useState(false);
  const [signupFlowActive, setSignupFlowActive] = React.useState(false);
  const [authUsernameInput, setAuthUsernameInput] = React.useState('');
  const [authPassword, setAuthPassword] = React.useState('');
  const [signupPassword, setSignupPassword] = React.useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = React.useState('');
  const [authLoading, setAuthLoading] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);

  const [themeLoading, setThemeLoading] = React.useState(false);
  const [themeError, setThemeError] = React.useState<string | null>(null);
  const [mealPlanDropdownOpen, setMealPlanDropdownOpen] = React.useState(false);

  const [balance, setBalance] = React.useState('');
  const [craving, setCraving] = React.useState('');
  const [context, setContext] = React.useState('');
  const [mealPlanStatus, setMealPlanStatus] = React.useState('');
  const [deliveryFrequency, setDeliveryFrequency] = React.useState('');
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [savingsEstimate, setSavingsEstimate] = React.useState<string | null>(null);
  const [whyItMatches, setWhyItMatches] = React.useState<string | null>(null);
  const [nudgePoints, setNudgePoints] = React.useState<string[]>([]);
  const [confidenceLabel, setConfidenceLabel] = React.useState<string>('Unknown');
  const [evidenceInputs, setEvidenceInputs] = React.useState<string[]>([]);
  const [outcomeHistory, setOutcomeHistory] = React.useState<boolean[]>([]);
  const [lastOutcome, setLastOutcome] = React.useState<'followed' | 'delivery' | null>(null);
  const [nudgeLoading, setNudgeLoading] = React.useState(false);
  const [isCravingPanelOpen, setIsCravingPanelOpen] = React.useState(false);
  const [isBestMoveOpen, setIsBestMoveOpen] = React.useState(true);
  const [isWhyOpen, setIsWhyOpen] = React.useState(false);
  const [deliveryCheckOpen, setDeliveryCheckOpen] = React.useState(false);
  const [deliveryCheckCost, setDeliveryCheckCost] = React.useState('');
  const [checkedDeliveryCost, setCheckedDeliveryCost] = React.useState<string | null>(null);
  const [deliveryChecking, setDeliveryChecking] = React.useState(false);
  const [meterUpdateMessage, setMeterUpdateMessage] = React.useState('Changes as your choices change');
  const [meterUpdating, setMeterUpdating] = React.useState(false);
  const deliveryCheckTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const meterUpdateTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousMeterScoreRef = React.useRef<number | null>(null);
  const [nowMinutes, setNowMinutes] = React.useState(() => {
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
  });
  const [isCompletingSetupTransition, setIsCompletingSetupTransition] = React.useState(false);

  const [onboardingStep, setOnboardingStep] = React.useState(0);
  const didResolveInitialSession = React.useRef(false);
  const didHydrateOutcomeState = React.useRef(false);
  const didRefreshThemeOnLaunch = React.useRef(false);
  const mainScrollRef = React.useRef<ScrollView>(null);
  const bestMoveOffsetRef = React.useRef(0);
  const cravingPanelRef = React.useRef<View>(null);
  const scrollYRef = React.useRef(0);
  const scrollFrameRef = React.useRef<number | null>(null);
  const setupCompleteTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const onboardingFade = useSharedValue(1);
  const onboardingLift = useSharedValue(0);
  const homeFade = useSharedValue(1);
  const homeLift = useSharedValue(0);

  const onboardingTransitionStyle = useAnimatedStyle(() => ({
    opacity: onboardingFade.value,
    transform: [{ translateY: onboardingLift.value }],
  }));

  const homeTransitionStyle = useAnimatedStyle(() => ({
    opacity: homeFade.value,
    transform: [{ translateY: homeLift.value }],
  }));

  const isAuthenticated = Boolean(authToken && authUsername);
  const isDashboardVisible =
    hydrated && isAuthenticated && hasOnboarded && !signupFlowActive && !isCompletingSetupTransition;
  // Returning users hydrate a saved university palette, so keep startup colors until they are signed in.
  const shouldUseStartupTheme = !isAuthenticated || !hasOnboarded;
  const activeTheme = shouldUseStartupTheme ? STARTUP_UNIVERSITY_THEME : universityTheme;

  const resetOnboardingProfile = React.useCallback(() => {
    setContact('');
    setName('');
    setSchool('');
    setStudentLevel(null);
    setDeliveryService('');
    setCustomDeliveryService('');
    setDiningSystems([]);
    setDiningSystemSummary('');
    setDiningSessionConfigured(false);
    setConfiguredDiningSession(null);
    setPlanBalance('');
    setPlanDaysLeft('');
    setLastCraving('');
    setLastContext('');
    setCampusSpots([]);
  }, [
    setCampusSpots,
    setConfiguredDiningSession,
    setContact,
    setCustomDeliveryService,
    setDeliveryService,
    setDiningSessionConfigured,
    setDiningSystemSummary,
    setDiningSystems,
    setLastContext,
    setLastCraving,
    setName,
    setPlanBalance,
    setPlanDaysLeft,
    setSchool,
    setStudentLevel,
  ]);

  // Decision state is per-session, so a new sign-in never inherits the last person's screen.
  const resetDecisionState = React.useCallback(() => {
    setIsCravingPanelOpen(false);
    setDeliveryCheckOpen(false);
    setDeliveryCheckCost('');
    setCheckedDeliveryCost(null);
    setSuggestion(null);
    setIsWhyOpen(false);
    setSavingsEstimate(null);
    setWhyItMatches(null);
    setNudgePoints([]);
    setEvidenceInputs([]);
    setCraving('');
    setContext('');
    setBalance('');
    setMealPlanStatus('');
    setDeliveryFrequency('');
    setLastOutcome(null);
  }, []);

  const STEPS = React.useMemo(() => {
    const coreSteps = [
      {
        heading: 'Welcome to DineWise',
        question: "Let's start with how we can reach you.",
        placeholder: 'Email or phone number',
        value: contact,
        onChange: setContact,
        keyboardType: 'email-address' as const,
        autoCapitalize: 'none' as const,
        key: 'contact',
      },
      {
        heading: 'Nice to meet you',
        question: 'What should we call you?',
        placeholder: 'Your first name',
        value: name,
        onChange: setName,
        keyboardType: 'default' as const,
        autoCapitalize: 'words' as const,
        key: 'name',
      },
      {
        heading: 'Your campus',
        question: 'Which university do you attend?',
        placeholder: 'e.g. UC Berkeley, Michigan, NYU',
        value: school,
        onChange: setSchool,
        keyboardType: 'default' as const,
        autoCapitalize: 'words' as const,
        key: 'school',
      },
      {
        heading: 'Almost there',
        question: 'Are you an undergraduate or graduate student? Some schools offer different meal plans for each.',
        placeholder: '',
        value: '',
        onChange: () => {},
        keyboardType: 'default' as const,
        autoCapitalize: 'none' as const,
        key: 'student-level',
      },
      {
        heading: 'Meal plan setup',
        question: 'Configure your campus meal plan before continuing.',
        placeholder: '',
        value: '',
        onChange: () => {},
        keyboardType: 'default' as const,
        autoCapitalize: 'none' as const,
        key: 'meal-plan',
      },
    ];

    if (!signupFlowActive) return coreSteps;

    return [
      {
        heading: 'Create your account',
        question: 'Choose a username for login.',
        placeholder: 'Username (letters, numbers, ., _, -)',
        value: authUsernameInput,
        onChange: setAuthUsernameInput,
        keyboardType: 'default' as const,
        autoCapitalize: 'none' as const,
        key: 'signup-username',
      },
      {
        heading: 'Secure your account',
        question: 'Set and confirm your password.',
        placeholder: '',
        value: '',
        onChange: () => {},
        keyboardType: 'default' as const,
        autoCapitalize: 'none' as const,
        key: 'signup-password',
      },
      ...coreSteps,
    ];
  }, [authUsernameInput, contact, deliveryService, name, school, setContact, setDeliveryService, setName, setSchool, signupFlowActive]);

  const TOTAL_STEPS = STEPS.length;
  const currentStep = STEPS[onboardingStep];
  const currentStepKey = currentStep?.key;
  const isLastStep = onboardingStep === TOTAL_STEPS - 1;
  const flowStage = !hydrated
    ? 'loading'
    : !isAuthenticated
      ? (signupFlowActive ? 'signup-onboarding' : 'login')
      : !hasOnboarded
        ? 'onboarding'
        : 'home';
  const debugFlowSummary = `flow:${flowStage} auth:${isAuthenticated ? 'y' : 'n'} signup:${signupFlowActive ? 'y' : 'n'} onboarded:${hasOnboarded ? 'y' : 'n'} step:${currentStepKey ?? '-'}`;

  React.useEffect(() => {
    let cancelled = false;

    const hydrateLocalUiState = async () => {
      try {
        const outcomeStateRaw = await AsyncStorage.getItem(OUTCOME_STATE_STORAGE_KEY);

        if (cancelled) return;

        if (outcomeStateRaw) {
          const parsed = JSON.parse(outcomeStateRaw) as {
            history?: unknown;
            lastOutcome?: unknown;
          };

          if (Array.isArray(parsed.history)) {
            const normalizedHistory = parsed.history
              .filter((item): item is boolean => typeof item === 'boolean')
              .slice(-30);
            setOutcomeHistory(normalizedHistory);
          }

          if (parsed.lastOutcome === 'followed' || parsed.lastOutcome === 'delivery') {
            setLastOutcome(parsed.lastOutcome);
          }
        }
      } catch {
        // Ignore local storage read failures and keep runtime defaults.
      } finally {
        if (!cancelled) {
          didHydrateOutcomeState.current = true;
        }
      }
    };

    hydrateLocalUiState();

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    // Avoid overwriting stored outcomes before the initial read resolves.
    if (!didHydrateOutcomeState.current) return;

    AsyncStorage.setItem(
      OUTCOME_STATE_STORAGE_KEY,
      JSON.stringify({
        history: outcomeHistory.slice(-30),
        lastOutcome,
      })
    ).catch(() => {
      // Ignore local storage write failures.
    });
  }, [lastOutcome, outcomeHistory]);

  React.useEffect(() => {
    return () => {
      if (setupCompleteTimerRef.current) {
        clearTimeout(setupCompleteTimerRef.current);
      }
      if (deliveryCheckTimerRef.current) {
        clearTimeout(deliveryCheckTimerRef.current);
      }
      if (meterUpdateTimerRef.current) {
        clearTimeout(meterUpdateTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!hasOnboarded || isCompletingSetupTransition) {
      return;
    }

    homeFade.value = 0;
    homeLift.value = 8;
    // Slightly longer reveal for a smoother home entry after setup.
    homeFade.value = withTiming(1, { duration: MOTION_CINEMATIC_MS, easing: Easing.out(Easing.cubic) });
    homeLift.value = withTiming(0, { duration: MOTION_CINEMATIC_MS, easing: Easing.out(Easing.cubic) });
  }, [hasOnboarded, isCompletingSetupTransition, homeFade, homeLift]);

  React.useEffect(() => {
    if (!hydrated || didResolveInitialSession.current) {
      return;
    }

    const hasPersistedSession = Boolean(
      contact.trim() ||
      name.trim() ||
      school.trim() ||
      deliveryService.trim() ||
      configuredDiningSession ||
      diningSessionConfigured ||
      diningSystems.length
    );

    setHasOnboarded(hasPersistedSession);
    didResolveInitialSession.current = true;
  }, [
    hydrated,
    contact,
    name,
    school,
    deliveryService,
    configuredDiningSession,
    diningSessionConfigured,
    diningSystems,
  ]);

  React.useEffect(() => {
    if (!isAuthenticated) {
      return;
    }
    if (!signupFlowActive && !hasOnboarded && setupFlow === 'onboarding' && diningSessionConfigured) {
      setHasOnboarded(false);
      const mealPlanIndex = STEPS.findIndex((step) => step.key === 'meal-plan');
      setOnboardingStep(mealPlanIndex >= 0 ? mealPlanIndex : Math.max(0, STEPS.length - 1));
    }
    // Only react when setupFlow itself changes (e.g. returning from the meal-plan
    // screens via dismissTo), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, hasOnboarded, setupFlow, diningSessionConfigured, signupFlowActive, STEPS]);

  React.useEffect(() => {
    if (currentStepKey !== 'meal-plan') {
      setMealPlanDropdownOpen(false);
    }
  }, [currentStepKey]);

  React.useEffect(() => {
    onboardingFade.value = 0.72;
    onboardingLift.value = 4;
    onboardingFade.value = withTiming(1, {
      duration: MOTION_BALANCED_MS,
      easing: Easing.out(Easing.cubic),
    });
    onboardingLift.value = withTiming(0, {
      duration: MOTION_BALANCED_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [onboardingStep, onboardingFade, onboardingLift]);

  // Bring the recommendation into view so it reads as its own moment without a route change.
  const runSmoothScrollTo = React.useCallback((targetY: number) => {
    // RN's animated scrollTo has a fixed, snappy curve, so drive the offset manually instead.
    const startY = scrollYRef.current;
    const delta = targetY - startY;
    if (Math.abs(delta) < 2) return;

    const duration = 620;
    const startedAt = Date.now();

    const step = () => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      const eased = 1 - (1 - progress) ** 3;
      mainScrollRef.current?.scrollTo({ y: startY + delta * eased, animated: false });
      if (progress < 1) {
        scrollFrameRef.current = requestAnimationFrame(step);
      }
    };

    if (scrollFrameRef.current !== null) {
      cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = requestAnimationFrame(step);
  }, []);

  React.useEffect(() => {
    if (!suggestion || nudgeLoading || !isBestMoveOpen) return;

    const timer = setTimeout(() => {
      runSmoothScrollTo(Math.max(0, bestMoveOffsetRef.current - Spacing.four));
    }, MOTION_BALANCED_MS);

    return () => {
      clearTimeout(timer);
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [isBestMoveOpen, nudgeLoading, runSmoothScrollTo, suggestion]);

  // The Craving Check panel is nested several views deep, so its onLayout offset would be
  // relative to its immediate parent rather than the scroll content. Measure it directly instead.
  React.useEffect(() => {
    if (!isCravingPanelOpen) return;

    const timer = setTimeout(() => {
      const panelNode = cravingPanelRef.current as unknown as {
        measure?: (callback: (x: number, y: number, w: number, h: number, pageX: number, pageY: number) => void) => void;
      } | null;
      const scrollerNode = mainScrollRef.current as unknown as {
        measure?: (callback: (x: number, y: number, w: number, h: number, pageX: number, pageY: number) => void) => void;
      } | null;
      if (!panelNode?.measure || !scrollerNode?.measure) return;

      scrollerNode.measure((_sx, _sy, _sw, _sh, _spx, scrollPageY) => {
        panelNode.measure((_x, _y, _w, _h, _panelPageX, panelPageY) => {
          runSmoothScrollTo(Math.max(0, scrollYRef.current + (panelPageY - scrollPageY) - Spacing.four));
        });
      });
    }, MOTION_BALANCED_MS);

    return () => {
      clearTimeout(timer);
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [isCravingPanelOpen, runSmoothScrollTo]);

  React.useEffect(() => {
    if (!hydrated || isAuthenticated) return;
    resetDecisionState();
  }, [hydrated, isAuthenticated, resetDecisionState]);

  // Prefill the remembered typical amount only when the panel opens, not on every commit.
  React.useEffect(() => {
    if (!deliveryCheckOpen) return;
    setDeliveryCheckCost((current) => current || typicalDeliveryCost);
    // Intentionally excludes typicalDeliveryCost so committing a check does not overwrite mid-edit input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryCheckOpen]);

  // Opening hours are time-sensitive, so refresh the clock while the delivery check is in use.
  React.useEffect(() => {
    if (!deliveryCheckOpen) return;

    const tick = () => {
      const now = new Date();
      setNowMinutes(now.getHours() * 60 + now.getMinutes());
    };

    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [deliveryCheckOpen]);

  // Re-resolve the school palette once per signed-in launch so stored colors cannot go stale.
  React.useEffect(() => {
    if (!isAuthenticated || !hasOnboarded || !school.trim() || didRefreshThemeOnLaunch.current) {
      return;
    }
    didRefreshThemeOnLaunch.current = true;

    let cancelled = false;

    (async () => {
      try {
        const backendBaseUrl = getBackendBaseUrl();
        if (!backendBaseUrl) return;

        const response = await fetchWithRetry(`${backendBaseUrl}/theme`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ school, student_level: studentLevel }),
        }, { timeoutMs: 20000, retries: 1 });

        const data = await response.json();
        if (cancelled || !response.ok) return;

        setUniversityTheme(normalizeThemePalette({
          background: data.background,
          backgroundElement: data.backgroundElement,
          secondary: data.secondary,
          tertiary: data.tertiary,
          text: data.text,
          logo_url: data.logo_url ?? null,
        }));
        if (Array.isArray(data.dining_systems) && data.dining_systems.length) {
          setDiningSystems(data.dining_systems.filter((item: unknown) => typeof item === 'string'));
        }
      } catch {
        // Keep the stored palette when the refresh cannot complete.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authToken, hasOnboarded, isAuthenticated, school, setDiningSystems, setUniversityTheme, studentLevel]);

  const handleOnboardingComplete = async () => {
    if (!school.trim()) {
      setThemeError('Please enter your school name.');
      return;
    }
    setThemeLoading(true);
    setThemeError(null);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error('Backend URL unavailable. On a physical device, set EXPO_PUBLIC_API_URL to your computer LAN IP (example: http://192.168.1.10:8000) and do not use localhost.');
      }
      const response = await fetchWithRetry(`${backendBaseUrl}/theme`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ school, student_level: studentLevel }),
      }, { timeoutMs: 20000, retries: 2 });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));
      setUniversityTheme(normalizeThemePalette({
        background: data.background,
        backgroundElement: data.backgroundElement,
        secondary: data.secondary ?? data.backgroundElement,
        tertiary: data.tertiary ?? data.secondary ?? data.backgroundElement,
        text: data.text,
        logo_url: data.logo_url ?? null,
      }));
      setDiningSystems(data.dining_systems ?? []);
      setDiningSystemSummary(data.dining_system_summary ?? '');
      setDiningSessionConfigured(false);
      setConfiguredDiningSession(null);
      const mealPlanIndex = STEPS.findIndex((step) => step.key === 'meal-plan');
      setOnboardingStep(mealPlanIndex >= 0 ? mealPlanIndex : onboardingStep + 1);
    } catch (error: unknown) {
      const msg = error instanceof Error && error.name === 'AbortError'
        ? `Backend unreachable at ${getBackendBaseUrl() || 'unavailable host'} — make sure it's running with --host 0.0.0.0`
        : String(error);
      setThemeError(msg);
    } finally {
      setThemeLoading(false);
    }
  };

  const onStepNext = async () => {
    setThemeError(null);
    if (currentStepKey === 'signup-username') {
      if (!isValidUsername(authUsernameInput)) {
        setThemeError('Username must be 3-32 chars using letters, numbers, ., _, or -.');
        return;
      }
      setOnboardingStep((s) => s + 1);
      return;
    }

    if (currentStepKey === 'signup-password') {
      if (signupPassword.length < 6) {
        setThemeError('Password must be at least 6 characters.');
        return;
      }
      if (signupPassword !== signupConfirmPassword) {
        setThemeError('Passwords do not match.');
        return;
      }

      setAuthLoading(true);
      try {
        const backendBaseUrl = getBackendBaseUrl();
        if (!backendBaseUrl) {
          throw new Error('Backend URL unavailable. Set EXPO_PUBLIC_API_URL to your LAN IP.');
        }

        const response = await fetchWithRetry(`${backendBaseUrl}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: authUsernameInput.trim().toLowerCase(),
            password: signupPassword,
            name: name.trim() || undefined,
          }),
        }, { timeoutMs: 15000, retries: 1 });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.detail || data.message || JSON.stringify(data));
        }

        setAuthToken(String(data.token || ''));
        setAuthUsername(String(data.user_username || data.user_email || authUsernameInput.trim().toLowerCase()));
        setOnboardingStep((s) => s + 1);
      } catch (error) {
        setThemeError(String(error));
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    if (currentStepKey === 'student-level') {
      await handleOnboardingComplete();
    } else if (isLastStep) {
      setIsCompletingSetupTransition(true);
      onboardingFade.value = withTiming(0, {
        duration: MOTION_BALANCED_MS,
        easing: Easing.inOut(Easing.cubic),
      });
      onboardingLift.value = withTiming(-6, {
        duration: MOTION_BALANCED_MS,
        easing: Easing.inOut(Easing.cubic),
      });
      if (setupCompleteTimerRef.current) {
        clearTimeout(setupCompleteTimerRef.current);
      }
      setupCompleteTimerRef.current = setTimeout(() => {
        setHasOnboarded(true);
        setSignupFlowActive(false);
        setIsCompletingSetupTransition(false);
      }, MOTION_BALANCED_MS);
    } else {
      // Keep simple step-to-step responses snappy.
      onboardingFade.value = withTiming(0.82, {
        duration: MOTION_FAST_MS,
        easing: Easing.out(Easing.quad),
      });
      setOnboardingStep(s => s + 1);
    }
  };

  const onStepBack = () => {
    setThemeError(null);
    setOnboardingStep(s => Math.max(0, s - 1));
  };

  const cardBg = activeTheme.backgroundElement;
  const pageBg = activeTheme.background;
  const cardText = contrastColor(cardBg);
  const pageText = contrastColor(pageBg);
  const onboardingNextDisabled =
    themeLoading ||
    authLoading ||
    isCompletingSetupTransition ||
    (currentStep?.key === 'meal-plan' && !diningSessionConfigured) ||
    (currentStep?.key === 'student-level' && !studentLevel);

  const dashboardPageBg = activeTheme.background;
  const dashboardCardBg = activeTheme.backgroundElement;
  const dashboardPageText = contrastColor(dashboardPageBg);
  const dashboardCardText = contrastColor(dashboardCardBg);
  const dashboardMutedText = dashboardCardText + 'b3';
  const meterValueBadgeBg = dashboardCardText === '#000000'
    ? 'rgba(255,255,255,0.88)'
    : 'rgba(0,0,0,0.78)';
  const dashboardDivider = dashboardCardText + '26';
  const dashboardChipBg = dashboardCardText + '24';
  const dashboardInputBg = dashboardCardText + '18';
  const dashboardInputBorder = dashboardCardText + '66';
  const recentOutcomes = React.useMemo(() => outcomeHistory.slice(-7), [outcomeHistory]);
  const recentFollowedCount = React.useMemo(() => recentOutcomes.filter(Boolean).length, [recentOutcomes]);
  const followThroughRate = recentOutcomes.length ? recentFollowedCount / recentOutcomes.length : null;
  const decisionSignal = React.useMemo(
    () => buildDecisionSignal(mealPlanStatus, deliveryFrequency, balance, followThroughRate),
    [mealPlanStatus, deliveryFrequency, balance]
  );
  const [displayedMeterScore, setDisplayedMeterScore] = React.useState(decisionSignal.meterScore);
  const liquidProgress = useSharedValue(0);
  const waveShift = useSharedValue(0);
  const waveShiftBack = useSharedValue(0);
  const surfaceBob = useSharedValue(0);
  const motionTilt = useSharedValue(0);
  const motionEnergy = useSharedValue(0);

  React.useEffect(() => {
    const previousScore = previousMeterScoreRef.current;

    if (previousScore === null) {
      previousMeterScoreRef.current = decisionSignal.meterScore;
      liquidProgress.value = decisionSignal.meterScore / 100;
      return;
    }

    if (previousScore === decisionSignal.meterScore) return;

    if (meterUpdateTimerRef.current) {
      clearTimeout(meterUpdateTimerRef.current);
    }

    setMeterUpdating(true);
    setMeterUpdateMessage('Updating waste risk...');

    meterUpdateTimerRef.current = setTimeout(() => {
      setDisplayedMeterScore(decisionSignal.meterScore);
      liquidProgress.value = withTiming(decisionSignal.meterScore / 100, {
        duration: 900,
        easing: Easing.out(Easing.cubic),
      });

      const difference = decisionSignal.meterScore - previousScore;
      meterUpdateTimerRef.current = setTimeout(() => {
        setMeterUpdating(false);
        setMeterUpdateMessage(
          difference > 0
            ? `Risk increased to ${decisionSignal.meterScore}%`
            : `Risk decreased to ${decisionSignal.meterScore}%`
        );
      }, 900);

      previousMeterScoreRef.current = decisionSignal.meterScore;
    }, MOTION_BALANCED_MS);

    return () => {
      if (meterUpdateTimerRef.current) {
        clearTimeout(meterUpdateTimerRef.current);
        meterUpdateTimerRef.current = null;
      }
    };
  }, [decisionSignal.meterScore, liquidProgress]);

  React.useEffect(() => {
    if (!isDashboardVisible) return;

    waveShift.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.linear }),
      -1,
      false
    );
    waveShiftBack.value = withRepeat(
      withTiming(1, { duration: 2100, easing: Easing.linear }),
      -1,
      false
    );
    surfaceBob.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );

    return () => {
      cancelAnimation(waveShift);
      cancelAnimation(waveShiftBack);
      cancelAnimation(surfaceBob);
    };
  }, [isDashboardVisible, waveShift, waveShiftBack, surfaceBob]);

  React.useEffect(() => {
    if (Platform.OS === 'web' || !isDashboardVisible) {
      return;
    }

    DeviceMotion.setUpdateInterval(80);
    const subscription = DeviceMotion.addListener((motion) => {
      const gamma = motion.rotation?.gamma ?? 0;
      const acceleration = motion.accelerationIncludingGravity;
      const magnitude = acceleration
        ? Math.sqrt((acceleration.x ?? 0) ** 2 + (acceleration.y ?? 0) ** 2 + (acceleration.z ?? 0) ** 2)
        : 9.81;

      const tiltNormalized = clamp01((gamma + 0.8) / 1.6) * 2 - 1;
      const shakeNormalized = clamp01((magnitude - 10.4) / 9.0);

      motionTilt.value = withTiming(tiltNormalized, { duration: 120, easing: Easing.out(Easing.quad) });
      motionEnergy.value = withTiming(shakeNormalized, { duration: 150, easing: Easing.out(Easing.quad) });
    });

    return () => {
      subscription.remove();
    };
  }, [isDashboardVisible, motionEnergy, motionTilt]);

  const liquidFillStyle = useAnimatedStyle(() => ({
    height: `${Math.max(6, Math.min(100, liquidProgress.value * 100))}%`,
  }));

  const waveFrontStyle = useAnimatedStyle(() => {
    const shakeBoost = 1 + motionEnergy.value * 1.9;
    const tiltPush = motionTilt.value * 8;
    return {
      transform: [
        { translateX: -22 + waveShift.value * (44 * shakeBoost) + tiltPush },
        { translateY: -2 + surfaceBob.value * (4 + motionEnergy.value * 4) },
      ],
      opacity: 0.48 + surfaceBob.value * 0.26 + motionEnergy.value * 0.2,
    };
  });

  const waveBackStyle = useAnimatedStyle(() => {
    const shakeBoost = 1 + motionEnergy.value * 1.6;
    const tiltPush = motionTilt.value * 5;
    return {
      transform: [
        { translateX: -28 + waveShiftBack.value * (56 * shakeBoost) - tiltPush },
        { translateY: 1 - surfaceBob.value * (2 + motionEnergy.value * 3) },
      ],
      opacity: 0.24 + (1 - surfaceBob.value) * 0.2 + motionEnergy.value * 0.12,
    };
  });
  const gaugeChromeColor = dashboardCardText + '44';
  const gaugeTrackColor = dashboardCardText + '0a';
  const liquidColor = pickReadableColor(dashboardCardBg, [
    '#38BDF8',
    '#60A5FA',
    '#22D3EE',
    '#7DD3FC',
    '#93C5FD',
  ], 2.2);
  const cardAccent = pickReadableColor(dashboardCardBg, [
    universityTheme.tertiary,
    universityTheme.secondary,
    universityTheme.background,
    universityTheme.text,
    dashboardPageText,
    '#1f2937',
    '#ffffff',
  ]);
  const cardAccentText = contrastColor(cardAccent);
  const surpriseLinkColor = pickDistinctButtonColor(dashboardPageBg, dashboardCardBg, [
    universityTheme.secondary,
    universityTheme.tertiary,
    universityTheme.text,
    '#0EA5E9',
    '#F97316',
    '#22C55E',
    '#E11D48',
    '#F59E0B',
  ]);
  const tertiaryButtonColor = pickDistinctButtonColor(dashboardPageBg, dashboardCardBg, [
    universityTheme.tertiary,
    universityTheme.secondary,
    universityTheme.text,
    '#F97316',
    '#0EA5E9',
    '#22C55E',
    '#E11D48',
    '#F59E0B',
  ]);
  const tertiaryButtonText = contrastColor(tertiaryButtonColor);
  const savingsAccent = pickDistinctButtonColor(dashboardCardBg, dashboardPageBg, [
    universityTheme.secondary,
    universityTheme.tertiary,
    universityTheme.text,
    '#22C55E',
    '#0EA5E9',
    '#F97316',
    '#E11D48',
    '#F59E0B',
  ]);
  const savingsAccentBg = savingsAccent + '1f';
  const inferredBadgeBg = dashboardCardText + '12';
  const planEconomics = React.useMemo(
    () => buildPlanEconomics(planBalance, planDaysLeft, deliveryFrequency),
    [deliveryFrequency, planBalance, planDaysLeft]
  );
  const openSpots = React.useMemo(() => rankOpenSpots(campusSpots, nowMinutes), [campusSpots, nowMinutes]);
  const setupHints = React.useMemo(() => {
    const hints: { label: string; onPress: () => void }[] = [];
    if (!planEconomics.hasPlanData) {
      hints.push({
        label: 'Add your balance and days left',
        onPress: () => router.push({ pathname: '/settings', params: { focus: 'meal-plan' } } as never),
      });
    }
    if (!campusSpots.length) {
      hints.push({
        label: 'Add campus spots to compare against delivery',
        onPress: () => router.push({ pathname: '/settings', params: { focus: 'meal-plan' } } as never),
      });
    }
    return hints;
  }, [campusSpots.length, planEconomics.hasPlanData, router]);
  const bestSpot = openSpots[0] ?? null;
  const deliveryCheck = React.useMemo(() => {
    if (checkedDeliveryCost === null) return null;

    const cost = Number.parseFloat(checkedDeliveryCost);
    if (!Number.isFinite(cost) || cost <= 0) return null;
    if (!bestSpot) return null;

    const spotPrice = Number.parseFloat(bestSpot.spot.estimatedCost ?? '');
    const campusCost = bestSpot.spot.coveredByPlan
      ? 0
      : Number.isFinite(spotPrice) && spotPrice >= 0
        ? spotPrice
        : null;

    if (campusCost === null) {
      return { cost, campusCost: null, savings: null, verdict: 'unknown' as const };
    }

    const difference = Math.round((cost - campusCost) * 100) / 100;
    const verdict = difference > 0 ? ('campus' as const) : difference < 0 ? ('delivery' as const) : ('tie' as const);
    return { cost, campusCost, savings: Math.abs(difference), verdict };
  }, [bestSpot, checkedDeliveryCost]);
  const latestRunEvidence = React.useMemo(() => {
    const entries = [
      craving ? `Craving: ${craving}` : null,
      context ? `Vibe: ${context}` : null,
      mealPlanStatus ? `Meal plan: ${mealPlanStatus}` : null,
      deliveryFrequency ? `Delivery: ${deliveryFrequency}` : null,
      balance ? `Budget: $${balance}` : null,
    ].filter((item): item is string => Boolean(item));
    return entries.slice(0, 4);
  }, [balance, context, craving, deliveryFrequency, mealPlanStatus]);
  const trustChips = evidenceInputs.length ? evidenceInputs : latestRunEvidence;

  const onboardingMealPlanOptions = React.useMemo(() => {
    const merged = [...diningSystems, 'Other'];
    return Array.from(new Set(merged.map((item) => item.trim()).filter(Boolean)));
  }, [diningSystems]);

  const openMealPlanSetup = (flow: 'dashboard' | 'onboarding' = 'dashboard') => {
    router.push({
      pathname: '/meal-plan-setup',
      params: { setupFlow: flow },
    });
  };

  const surpriseMe = () => {
    const pick = <T extends ChipOption>(options: T[]) => options[Math.floor(Math.random() * options.length)].label;
    setCraving(pick(CRAVING_OPTIONS));
    setContext(pick(CONTEXT_OPTIONS));
  };

  const fetchNudge = async (overrides?: { craving?: string; context?: string; intent?: string }) => {
    // Quick actions run with inferred inputs so the user never has to fill the form first.
    const resolvedCraving = (overrides?.craving ?? craving).trim() || lastCraving.trim();
    const resolvedContext = (overrides?.context ?? context).trim() || lastContext.trim();

    setNudgeLoading(true);
    setIsCravingPanelOpen(false);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error('Backend URL unavailable. On a physical device, set EXPO_PUBLIC_API_URL to your computer LAN IP (example: http://192.168.1.10:8000) and do not use localhost.');
      }
      const response = await fetchWithRetry(`${backendBaseUrl}/nudge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          balance: parseFloat(balance) || 0,
          craving: resolvedCraving,
          context: resolvedContext,
          meal_plan_status: mealPlanStatus,
          delivery_frequency: deliveryFrequency,
          delivery_service: (
            deliveryService === 'Other'
              ? customDeliveryService.trim() || 'Other'
              : deliveryService || undefined
          ),
          recent_followed: recentFollowedCount,
          recent_logged: recentOutcomes.length,
          plan_balance: planEconomics.balance,
          plan_days_left: planEconomics.days,
          target_per_day: planEconomics.targetPerDay,
          projected_waste: planEconomics.projectedWaste,
          intent: overrides?.intent,
        }),
      }, { timeoutMs: 15000, retries: 1 });

      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.detail || data.message || JSON.stringify(data);
        throw new Error(errorMessage);
      }

      const nextSuggestion = String(data.suggestion ?? JSON.stringify(data)).trim();
      const nextWhy = data.why_it_matches ? String(data.why_it_matches) : null;
      const apiPoints = Array.isArray(data.nudge_points)
        ? (data.nudge_points as unknown[])
            .map((item: unknown) => String(item))
            .filter((item: string) => item.trim())
        : [];

      setSuggestion(nextSuggestion);
      setIsBestMoveOpen(true);
      setIsWhyOpen(false);
      setSavingsEstimate(data.savings_estimate ?? null);
      setWhyItMatches(nextWhy);
      setNudgePoints(buildNudgePoints(nextSuggestion, nextWhy, apiPoints));
      setConfidenceLabel(String(data.confidence_label ?? 'Unknown'));
      setEvidenceInputs(
        Array.isArray(data.evidence_inputs)
          ? Array.from(new Set(
              data.evidence_inputs.map((item: unknown) => String(item)).filter(Boolean)
            )).slice(0, 4) as string[]
          : []
      );
      if (resolvedCraving) setLastCraving(resolvedCraving);
      if (resolvedContext) setLastContext(resolvedContext);
    } catch (error) {
      console.error('Connection failed:', error);
      setIsCravingPanelOpen(true);
      showAlert('Connection failed', String(error));
    } finally {
      setNudgeLoading(false);
    }
  };

  const runQuickDecision = (intent: 'meal-plan' | 'usual' | 'surprise') => {
    if (intent === 'surprise') {
      const pick = <T extends ChipOption>(options: T[]) => options[Math.floor(Math.random() * options.length)].label;
      const nextCraving = pick(CRAVING_OPTIONS);
      const nextContext = pick(CONTEXT_OPTIONS);
      setCraving(nextCraving);
      setContext(nextContext);
      void fetchNudge({ craving: nextCraving, context: nextContext, intent });
      return;
    }

    if (intent === 'usual') {
      setCraving(lastCraving);
      setContext(lastContext);
      void fetchNudge({ craving: lastCraving, context: lastContext, intent });
      return;
    }

    void fetchNudge({ intent });
  };

  const submitAuth = async () => {
    const username = authUsernameInput.trim().toLowerCase();
    if (!isValidUsername(username)) {
      setAuthError('Enter a valid username (3-32 chars, letters/numbers/._-).');
      return;
    }
    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters.');
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error('Backend URL unavailable. Set EXPO_PUBLIC_API_URL to your LAN IP.');
      }

      const response = await fetchWithRetry(`${backendBaseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: authPassword }),
      }, { timeoutMs: 15000, retries: 1 });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || JSON.stringify(data));
      }

      setAuthToken(String(data.token || ''));
      setAuthUsername(String(data.user_username || data.user_email || username));
      if (!name.trim() && data.user_name) {
        setName(String(data.user_name));
      }
      setSignupFlowActive(false);
      setAuthPassword('');
    } catch (error) {
      setAuthError(String(error));
    } finally {
      setAuthLoading(false);
    }
  };

  if (!hydrated) {
    return (
      <View style={[styles.container, { backgroundColor: activeTheme.background }]}>
        <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: activeTheme.background }]}>
          <Animated.View
            entering={FadeIn.duration(MOTION_BALANCED_MS).easing(Easing.out(Easing.cubic))}
            style={styles.authShell}>
            <Text style={[styles.authTitle, { color: contrastColor(activeTheme.background) }]}>Loading your session...</Text>
          </Animated.View>
        </SafeAreaView>
        {__DEV__ ? (
          <View pointerEvents="none" style={styles.debugBadgeWrap}>
            <Text style={styles.debugBadgeText}>{debugFlowSummary}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (!isAuthenticated && !signupFlowActive) {
    const authPageBg = activeTheme.background;
    const authCardBg = activeTheme.backgroundElement;
    const authPageText = contrastColor(authPageBg);
    const authCardText = contrastColor(authCardBg);
    const authMutedText = authCardText + 'b3';

    return (
      <View style={[styles.container, { backgroundColor: authPageBg }]}>
        <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: authPageBg }]}>
          <Animated.View
            entering={FadeIn.duration(MOTION_CINEMATIC_MS).easing(Easing.out(Easing.cubic))}
            style={styles.authShell}>
            <Image source={require('../../../appicon.jpg')} style={styles.authAppIcon} />
            <Text style={[styles.authPageTitle, { color: authPageText }]}>DineWise</Text>
            <Text style={[styles.authPageSubtitle, { color: authPageText + 'cc' }]}>Sign in to continue</Text>

            <View style={[styles.authCard, { backgroundColor: authCardBg }]}>

              <TextInput
                style={[styles.authInput, { color: authCardText, borderColor: authCardText + '40', backgroundColor: authCardText + '08' }]}
                value={authUsernameInput}
                onChangeText={setAuthUsernameInput}
                placeholder="Username"
                placeholderTextColor={authMutedText}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.authInput, { color: authCardText, borderColor: authCardText + '40', backgroundColor: authCardText + '08' }]}
                value={authPassword}
                onChangeText={setAuthPassword}
                placeholder="Password"
                placeholderTextColor={authMutedText}
                secureTextEntry
                autoCapitalize="none"
              />

              {authError ? (
                <Text style={styles.authErrorText}>{authError}</Text>
              ) : null}

              <TouchableOpacity
                onPress={submitAuth}
                disabled={authLoading}
                activeOpacity={0.85}
              >
                <View style={[styles.authSubmitButton, { backgroundColor: authPageBg, opacity: authLoading ? 0.6 : 1 }]}>
                  <Text style={[styles.authSubmitText, { color: contrastColor(authPageBg) }]}>
                    {authLoading ? 'Please wait...' : 'Login'}
                  </Text>
                </View>
              </TouchableOpacity>

              <View style={styles.authSignupHintRow}>
                <Text style={[styles.authSignupHintText, { color: authMutedText }]}>new to dinewise? </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setAuthToken(null);
                    setAuthUsername('');
                    resetOnboardingProfile();
                    resetDecisionState();
                    setHasOnboarded(false);
                    setSignupFlowActive(true);
                    setOnboardingStep(0);
                    setAuthPassword('');
                    setSignupPassword('');
                    setSignupConfirmPassword('');
                    setAuthError(null);
                    setThemeError(null);
                  }}
                >
                  <Text style={[styles.authSignupLinkText, { color: authCardText }]}>sign up here!</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        </SafeAreaView>
        {__DEV__ ? (
          <View pointerEvents="none" style={styles.debugBadgeWrap}>
            <Text style={styles.debugBadgeText}>{debugFlowSummary}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (isCompletingSetupTransition || signupFlowActive || (isAuthenticated && !hasOnboarded)) {
    return (
      <View style={[styles.container, { backgroundColor: pageBg }]}>
        <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: pageBg }]}>
          {/* Step counter */}
          <View style={{ alignItems: 'center', paddingTop: Spacing.four }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
                <View
                  key={i}
                  style={{
                    height: 6,
                    width: i === onboardingStep ? 24 : 8,
                    borderRadius: 3,
                    backgroundColor: i <= onboardingStep
                      ? pageText
                      : pageText + '40',
                  }}
                />
              ))}
            </View>
            <Text style={{ color: pageText + '99', fontSize: 12, marginTop: 6 }}>
              {onboardingStep + 1} of {TOTAL_STEPS}
            </Text>
          </View>

          {/* Hero */}
          <Animated.View style={onboardingTransitionStyle}>
            <View style={[styles.heroSection, { flex: 0, paddingTop: Spacing.four, gap: Spacing.two }]}>
            {currentStep?.key === 'school' && universityTheme.logoUrl ? (
              <Image source={{ uri: universityTheme.logoUrl }} style={styles.logo} />
            ) : null}
            <Text style={{ fontSize: 26, fontWeight: '700', color: pageText, textAlign: 'center' }}>
              {currentStep.heading}
            </Text>
            <Text style={{ fontSize: 15, color: pageText + 'cc', textAlign: 'center', maxWidth: 300 }}>
              {currentStep.question}
            </Text>
            </View>

          {/* Card */}
          <View style={[styles.stepContainer, { backgroundColor: cardBg }]}>
            {currentStep.key === 'student-level' ? (
              <View style={styles.sessionSetupRow}>
                {STUDENT_LEVEL_OPTIONS.map((level) => {
                  const isSelected = studentLevel === level;
                  return (
                    <TouchableOpacity
                      key={level}
                      onPress={() => setStudentLevel(level)}
                      activeOpacity={0.8}
                      style={[
                        styles.dropdownTrigger,
                        {
                          borderColor: isSelected ? cardText : cardText + '35',
                          backgroundColor: isSelected ? cardText + '18' : 'transparent',
                        },
                      ]}>
                      <Text style={{ color: cardText, fontWeight: isSelected ? '700' : '500', textTransform: 'capitalize' }}>
                        {level}
                      </Text>
                      <Text style={{ color: cardText, fontWeight: '700' }}>
                        {isSelected ? '✓' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : currentStep.key === 'meal-plan' ? (
              <View style={styles.sessionSetupRow}>
                <Text style={{ color: cardText, fontWeight: '600', fontSize: 14 }}>
                  Select your meal plan option
                </Text>
                {!diningSystems.length ? (
                  <Text style={{ color: cardText + 'cc', fontSize: 13 }}>
                    No meal plans were returned for this school. Select Other to enter your exact plan.
                  </Text>
                ) : null}
                <TouchableOpacity
                  onPress={() => setMealPlanDropdownOpen((prev) => !prev)}
                  activeOpacity={0.8}
                  style={[styles.dropdownTrigger, { borderColor: cardText + '35' }]}>
                  <Text style={{ color: cardText, fontWeight: configuredDiningSession ? '700' : '500' }}>
                    {configuredDiningSession || 'Select an option'}
                  </Text>
                  <Text style={{ color: cardText, fontWeight: '700' }}>
                    {mealPlanDropdownOpen ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {mealPlanDropdownOpen ? (
                  <View style={[styles.onboardingOptionsList, { borderColor: cardText + '35' }]}>
                    <ScrollView
                      style={styles.onboardingOptionsScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled">
                      {onboardingMealPlanOptions.map((option) => {
                        const isSelected = configuredDiningSession === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            onPress={() => {
                              if (option === 'Other') {
                                setMealPlanDropdownOpen(false);
                                router.push({
                                  pathname: '/meal-plan-other',
                                  params: { setupFlow: 'onboarding' },
                                });
                                return;
                              }
                              setConfiguredDiningSession(option);
                              setDiningSessionConfigured(true);
                              setMealPlanDropdownOpen(false);
                            }}>
                            <View style={styles.onboardingOptionRow}>
                              <Text style={{ color: cardText, fontWeight: isSelected ? '700' : '500' }}>
                                {option}
                              </Text>
                              <Text style={{ color: cardText, fontWeight: '700' }}>
                                {isSelected ? '✓' : ''}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                ) : null}
              </View>
            ) : currentStep.key === 'signup-password' ? (
              <View style={styles.sessionSetupRow}>
                <TextInput
                  style={[styles.input, { fontSize: 16 }]}
                  value={signupPassword}
                  onChangeText={setSignupPassword}
                  placeholder="Create password"
                  placeholderTextColor={cardText + '99'}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TextInput
                  style={[styles.input, { fontSize: 16 }]}
                  value={signupConfirmPassword}
                  onChangeText={setSignupConfirmPassword}
                  placeholder="Confirm password"
                  placeholderTextColor={cardText + '99'}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            ) : (
              <TextInput
                style={[styles.input, { fontSize: 16 }]}
                value={currentStep.value}
                onChangeText={currentStep.onChange}
                placeholder={currentStep.placeholder}
                keyboardType={currentStep.keyboardType}
                autoCapitalize={currentStep.autoCapitalize}
                autoFocus
                returnKeyType={isLastStep ? 'done' : 'next'}
                onSubmitEditing={onStepNext}
              />
            )}
            {themeError ? (
              <Text style={{ color: ERROR_COLOR, fontSize: 13, marginTop: 4 }}>{themeError}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two }}>
              {onboardingStep > 0 && (
                <TouchableOpacity onPress={onStepBack} style={{ flex: 1 }}>
                  <View style={{
                    backgroundColor: cardText + '18',
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                  }}>
                    <Text style={{ fontWeight: '600', fontSize: 15, color: cardText }}>Back</Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onStepNext}
                disabled={onboardingNextDisabled}
                style={{ flex: 2 }}>
                <View style={{
                  backgroundColor: pageBg,
                  opacity: onboardingNextDisabled ? 0.5 : 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: pageText }}>
                    {themeLoading ? 'Loading…' : isLastStep ? 'Get started' : 'Next →'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
          </Animated.View>
        </SafeAreaView>
        {__DEV__ ? (
          <View pointerEvents="none" style={styles.debugBadgeWrap}>
            <Text style={styles.debugBadgeText}>{debugFlowSummary}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: dashboardPageBg }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: dashboardPageBg }]}>
        <ScrollView
          ref={mainScrollRef}
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          scrollEventThrottle={16}
          onScroll={(event) => {
            scrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.mainContent, Platform.OS === 'web' ? styles.mainContentWeb : styles.mainContentMobile, homeTransitionStyle]}>
            <View style={styles.headerRow}>
              <View style={[styles.headerIconFrame, { borderColor: dashboardPageText + '2e', backgroundColor: dashboardCardBg }]}>
                <Image source={require('../../../appicon.jpg')} style={styles.headerIconImage} />
              </View>
              <View style={styles.headerTextGroup}>
                <Text style={[styles.largeTitle, { color: dashboardPageText }]}>DineWise</Text>
                <Text style={[styles.headerSubtitle, { color: dashboardPageText + 'cc' }]}>
                  {school ? `Smarter than delivery at ${school}.` : 'Smarter than delivery.'}
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                activeOpacity={0.75}
                onPress={() => router.push('/settings' as never)}
              >
                <View style={[styles.headerSettingsButton, { backgroundColor: dashboardPageText + '14' }]}>
                  <Text style={[styles.headerSettingsText, { color: dashboardPageText }]}>⚙</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: dashboardPageText + 'b3' }]}>DECISION ENGINE</Text>
                <Text style={[styles.sectionHeaderHint, { color: dashboardCardText + '99' }]}>Today</Text>
              </View>
              <View style={[styles.sectionCard, { backgroundColor: dashboardCardBg }]}>
                <View style={styles.formBlock}>
                  <Text style={[styles.engineTitle, { color: dashboardCardText }]}>What should I eat?</Text>
                  <Text style={[styles.engineSubtitle, { color: dashboardMutedText }]}>
                    Tap one button and DineWise tells you whether to use your meal plan or spend money, and how much you save.
                  </Text>

                  {setupHints.length ? (
                    <View style={[styles.setupHintCard, { backgroundColor: dashboardInputBg, borderColor: tertiaryButtonColor }]}>
                      <Text style={[styles.setupHintTitle, { color: dashboardCardText }]}>Finish setup for exact numbers</Text>
                      <Text style={[styles.setupHintBody, { color: dashboardMutedText }]}>
                        Until then DineWise gives general advice instead of real dollar comparisons.
                      </Text>
                      {setupHints.map((hint) => (
                        <TouchableOpacity key={hint.label} activeOpacity={0.7} onPress={hint.onPress}>
                          <Text style={[styles.setupHintLink, { color: surpriseLinkColor }]}>{hint.label} →</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  <View style={styles.planRow}>
                    <View style={[styles.planHealthCard, styles.planHealthCardFlex, { backgroundColor: dashboardInputBg }]}>
                      <View style={styles.planHealthTopRow}>
                        <Text
                          numberOfLines={1}
                          adjustsFontSizeToFit
                          minimumFontScale={0.8}
                          style={[styles.planHealthValue, { color: dashboardCardText }]}>
                          {planEconomics.balance !== null ? `$${planEconomics.balance.toFixed(2)} left` : 'Balance not set'}
                        </Text>
                        <Text style={[styles.planHealthMeta, { color: dashboardMutedText }]}>
                          {planEconomics.days !== null
                            ? `${planEconomics.days} days left · target $${(planEconomics.targetPerDay ?? 0).toFixed(2)}/day`
                            : 'Add your balance and days left for exact targets.'}
                        </Text>
                        <View style={[styles.planHealthChip, { backgroundColor: cardAccent }]}>
                          <Text style={[styles.planHealthChipText, { color: cardAccentText }]} numberOfLines={1}>
                            {planEconomics.headline}
                          </Text>
                        </View>
                        <Text style={[styles.planHealthDetail, { color: dashboardMutedText }]}>{planEconomics.detail}</Text>
                      </View>

                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => router.push({ pathname: '/settings', params: { focus: 'meal-plan' } } as never)}>
                        <Text style={[styles.planHealthLink, { color: surpriseLinkColor }]}>
                          {planEconomics.hasPlanData ? 'Update balance' : 'Add balance and days left'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    <View style={[styles.wasteMeterCard, styles.wasteMeterCardInline, { backgroundColor: dashboardCardText + '08' }]}>
                      <View style={styles.wasteMeterHeader}>
                        <Text numberOfLines={1} style={[styles.wasteMeterTitle, { color: dashboardCardText }]}>Waste risk</Text>
                        <TouchableOpacity
                          activeOpacity={0.75}
                          onPress={() => {
                            router.push({
                              pathname: '/meter-details',
                              params: {
                                score: String(decisionSignal.meterScore),
                                band: decisionSignal.band,
                                weeklyWaste: String(decisionSignal.weeklyWaste),
                                move: decisionSignal.move,
                                budgetLine: decisionSignal.budgetLine,
                                paceLine: decisionSignal.paceLine,
                                mealPlanStatus,
                                deliveryFrequency,
                                outsideBudget: balance,
                                recentFollowed: String(recentFollowedCount),
                                recentLogged: String(recentOutcomes.length),
                                hasWeeklyEstimate: decisionSignal.hasWeeklyEstimate ? 'true' : 'false',
                              },
                            });
                          }}
                          style={[styles.meterExpandButton, { backgroundColor: dashboardCardText + '12' }]}
                        >
                          <Text style={[styles.meterExpandButtonText, { color: dashboardCardText }]}>↗</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.wasteGaugeShell}>
                        <View style={[styles.wasteGaugeTrackVertical, styles.wasteGaugeTrackInline, { backgroundColor: gaugeTrackColor, borderColor: gaugeChromeColor }]}>
                          <Animated.View
                            pointerEvents="none"
                            style={[
                              styles.wasteGaugeLiquidVertical,
                              liquidFillStyle,
                              {
                                backgroundColor: liquidColor,
                                shadowColor: liquidColor,
                              },
                            ]}
                          >
                            <Animated.View
                              pointerEvents="none"
                              style={[styles.wasteGaugeWaveBack, waveBackStyle]}
                            />
                            <Animated.View
                              pointerEvents="none"
                              style={[styles.wasteGaugeWaveFront, waveFrontStyle]}
                            />
                          </Animated.View>
                          <View pointerEvents="none" style={styles.wasteGaugeCenterValueWrap}>
                            <Text
                              style={[
                                styles.wasteGaugeCenterValue,
                                { color: dashboardCardText, backgroundColor: meterValueBadgeBg },
                              ]}>
                              {displayedMeterScore}%
                            </Text>
                          </View>
                          <View pointerEvents="none" style={styles.wasteGaugeGlassHighlight} />
                        </View>
                      </View>
                      <Animated.View
                        key={meterUpdateMessage}
                        entering={FadeIn.duration(MOTION_FAST_MS)}
                        style={styles.meterStatusWrap}>
                        {meterUpdating ? (
                          <ActivityIndicator size="small" color={dashboardCardText} />
                        ) : null}
                        <Text
                          style={[styles.meterStatusText, { color: dashboardMutedText }]}
                          numberOfLines={2}>
                          {meterUpdateMessage}
                        </Text>
                      </Animated.View>
                    </View>
                  </View>

                  <View style={[styles.deliveryCheckCard, { backgroundColor: dashboardInputBg }]}>
                    <TouchableOpacity activeOpacity={0.8} onPress={() => setDeliveryCheckOpen((open) => !open)}>
                      <View style={styles.deliveryCheckHeader}>
                        <Text style={[styles.deliveryCheckTitle, { color: dashboardCardText }]}>
                          🚗 About to order {deliveryService && deliveryService !== 'Other' ? deliveryService : 'delivery'}?
                        </Text>
                        <Text style={[styles.planHealthLink, { color: surpriseLinkColor }]}>
                          {deliveryCheckOpen ? 'Hide' : campusSpots.length ? 'Check first' : 'Needs setup'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {deliveryCheckOpen ? (
                      <Animated.View
                        entering={FadeInDown.duration(MOTION_FAST_MS).easing(Easing.out(Easing.quad))}
                        exiting={FadeOutUp.duration(MOTION_FAST_MS).easing(Easing.in(Easing.quad))}
                        style={styles.deliveryCheckBody}>
                        <Text style={[styles.planHealthDetail, { color: dashboardMutedText }]}>
                          No need to check the app. Pick what your order usually costs.
                        </Text>

                        <View style={styles.chipRow}>
                          {DELIVERY_COST_PRESETS.map((amount) => (
                            <Chip
                              key={amount}
                              label={`$${amount}`}
                              selected={deliveryCheckCost === String(amount)}
                              onPress={() => {
                                setDeliveryCheckCost(String(amount));
                                setCheckedDeliveryCost(null);
                              }}
                              accentColor={cardAccent}
                              accentTextColor={cardAccentText}
                              mutedBg={dashboardChipBg}
                              mutedText={dashboardCardText}
                            />
                          ))}
                        </View>

                        <TextInput
                          style={[
                            styles.plainInput,
                            { color: dashboardCardText, backgroundColor: dashboardInputBg, borderColor: dashboardInputBorder },
                          ]}
                          value={deliveryCheckCost}
                          onChangeText={(value) => {
                            setDeliveryCheckCost(value);
                            setCheckedDeliveryCost(null);
                          }}
                          keyboardType="numeric"
                          placeholder="Or enter another amount"
                          placeholderTextColor={dashboardMutedText}
                        />

                        <TouchableOpacity
                          activeOpacity={0.85}
                          disabled={!deliveryCheckCost.trim() || deliveryChecking}
                          onPress={() => {
                            const amount = deliveryCheckCost.trim();
                            setCheckedDeliveryCost(null);
                            setDeliveryChecking(true);
                            if (deliveryCheckTimerRef.current) {
                              clearTimeout(deliveryCheckTimerRef.current);
                            }
                            // Brief pause so the verdict lands as a result instead of snapping in.
                            deliveryCheckTimerRef.current = setTimeout(() => {
                              setCheckedDeliveryCost(amount);
                              setTypicalDeliveryCost(amount);
                              setDeliveryChecking(false);
                            }, MOTION_CINEMATIC_MS);
                          }}>
                          <View
                            style={[
                              styles.ctaButton,
                              { backgroundColor: tertiaryButtonColor, opacity: deliveryCheckCost.trim() && !deliveryChecking ? 1 : 0.4 },
                            ]}>
                            <Text style={[styles.ctaButtonText, { color: tertiaryButtonText }]}>
                              {deliveryChecking ? 'Checking...' : 'Check with DineWise'}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {deliveryChecking ? (
                          <Animated.View
                            entering={FadeIn.duration(MOTION_FAST_MS)}
                            exiting={FadeOut.duration(MOTION_FAST_MS)}
                            style={styles.cravingLoadingRow}>
                            <ActivityIndicator size="small" color={dashboardCardText} />
                            <Text style={[styles.planHealthDetail, { color: dashboardMutedText }]}>
                              Checking your open campus options...
                            </Text>
                          </Animated.View>
                        ) : !campusSpots.length ? (
                          <Text style={[styles.planHealthDetail, { color: dashboardMutedText }]}>
                            Add your campus spots in Settings so DineWise can compare against a real option.
                          </Text>
                        ) : !bestSpot ? (
                          <View style={styles.deliveryVerdict}>
                            <Text style={[styles.deliveryVerdictTitle, { color: dashboardCardText }]}>
                              Delivery may be your best option tonight.
                            </Text>
                            <Text style={[styles.planHealthDetail, { color: dashboardMutedText }]}>
                              Your saved campus spots are closed right now, so DineWise could not find a meal-plan-covered option.
                            </Text>
                          </View>
                        ) : !deliveryCheck ? (
                          <Text style={[styles.planHealthDetail, { color: dashboardMutedText }]}>
                            Enter the delivery total, then tap Check with DineWise.
                          </Text>
                        ) : deliveryCheck.verdict === 'unknown' ? (
                          <Text style={[styles.planHealthDetail, { color: dashboardMutedText }]}>
                            Add a typical price for {bestSpot.spot.name} in Settings so DineWise can compare exactly.
                          </Text>
                        ) : (
                          <Animated.View
                            entering={FadeInDown.duration(MOTION_BALANCED_MS).easing(Easing.out(Easing.cubic))}
                            style={styles.deliveryVerdict}>
                            <Text style={[styles.deliveryVerdictTitle, { color: dashboardCardText }]}>
                              {deliveryCheck.verdict === 'campus'
                                ? `Save $${deliveryCheck.savings.toFixed(2)}`
                                : deliveryCheck.verdict === 'delivery'
                                  ? 'Delivery is the better deal tonight'
                                  : 'Either way costs about the same'}
                            </Text>

                            <Text style={[styles.deliveryOptionName, { color: dashboardCardText }]}>
                              {bestSpot.spot.name} · {deliveryCheck.campusCost === 0 ? '$0.00 with your meal plan' : `$${(deliveryCheck.campusCost ?? 0).toFixed(2)}`}
                            </Text>

                            <View style={styles.whyList}>
                              {bestSpot.spot.coveredByPlan ? (
                                <Text style={[styles.whyItem, { color: dashboardMutedText }]}>✓ Covered by your meal plan</Text>
                              ) : null}
                              {formatMinutesUntilClose(bestSpot.minutesUntilClose) ? (
                                <Text style={[styles.whyItem, { color: dashboardMutedText }]}>
                                  ✓ Open now · {formatMinutesUntilClose(bestSpot.minutesUntilClose)}
                                </Text>
                              ) : null}
                              {bestSpot.walkMinutes !== null ? (
                                <Text style={[styles.whyItem, { color: dashboardMutedText }]}>✓ {bestSpot.walkMinutes} min walk</Text>
                              ) : null}
                            </View>

                            <Text style={[styles.planHealthDetail, { color: dashboardMutedText }]}>
                              Delivery ${deliveryCheck.cost.toFixed(2)} vs campus ${(deliveryCheck.campusCost ?? 0).toFixed(2)}
                            </Text>

                            {deliveryCheck.savings ? (
                              <View style={[styles.savingsBadge, { backgroundColor: savingsAccentBg }]}>
                                <Text style={[styles.savingsBadgeText, { color: savingsAccent }]}>
                                  Save ${deliveryCheck.savings.toFixed(2)} {deliveryCheck.verdict === 'delivery' ? 'by ordering delivery' : 'on campus'}
                                </Text>
                              </View>
                            ) : null}

                            {deliveryCheck.verdict === 'campus' ? (
                              <TouchableOpacity
                                activeOpacity={0.85}
                                disabled={nudgeLoading}
                                onPress={() => runQuickDecision('meal-plan')}>
                                <View style={[styles.deliveryActionButton, { backgroundColor: tertiaryButtonColor }]}>
                                  <Text style={[styles.deliveryActionText, { color: tertiaryButtonText }]}>Use my meal plan</Text>
                                </View>
                              </TouchableOpacity>
                            ) : null}

                            <Text style={[styles.whyItem, { color: dashboardMutedText }]}>
                              Totally your call — DineWise just shows you the math first.
                            </Text>
                          </Animated.View>
                        )}
                      </Animated.View>
                    ) : null}
                  </View>

                  <View style={styles.quickActionGrid}>
                    <TouchableOpacity
                      style={styles.quickActionCell}
                      activeOpacity={0.85}
                      disabled={nudgeLoading}
                      onPress={() => runQuickDecision('meal-plan')}>
                      <View
                        style={[
                          styles.quickActionButton,
                          styles.quickActionPrimary,
                          {
                            backgroundColor: dashboardChipBg,
                            borderColor: tertiaryButtonColor,
                            opacity: nudgeLoading ? 0.5 : 1,
                          },
                        ]}>
                        <Text style={[styles.quickActionText, { color: dashboardCardText }]}>💰 Use my meal plan</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.quickActionCell}
                      activeOpacity={0.85}
                      disabled={nudgeLoading}
                      onPress={() => runQuickDecision('surprise')}>
                      <View style={[styles.quickActionButton, { backgroundColor: dashboardChipBg, opacity: nudgeLoading ? 0.5 : 1 }]}>
                        <Text style={[styles.quickActionText, { color: dashboardCardText }]}>🎲 Surprise me</Text>
                      </View>
                    </TouchableOpacity>

                    {lastCraving ? (
                      <TouchableOpacity
                        style={styles.quickActionCell}
                        activeOpacity={0.85}
                        disabled={nudgeLoading}
                        onPress={() => runQuickDecision('usual')}>
                        <View style={[styles.quickActionButton, { backgroundColor: dashboardChipBg, opacity: nudgeLoading ? 0.5 : 1 }]}>
                          <Text style={[styles.quickActionText, { color: dashboardCardText }]} numberOfLines={1}>
                            🔁 My usual · {lastCraving}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      style={styles.quickActionCell}
                      activeOpacity={0.85}
                      onPress={() => setIsCravingPanelOpen(true)}>
                      <View style={[styles.quickActionButton, { backgroundColor: dashboardChipBg }]}>
                        <Text style={[styles.quickActionText, { color: dashboardCardText }]}>🍕 I have a craving</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => openMealPlanSetup('dashboard')}>
                    <View style={[styles.enginePlanCard, { backgroundColor: dashboardInputBg }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.enginePlanLabel, { color: dashboardMutedText }]}>Meal plan</Text>
                        <Text style={[styles.enginePlanName, { color: dashboardCardText }]} numberOfLines={1}>
                          {diningSessionConfigured ? configuredDiningSession : 'Set up your meal plan'}
                        </Text>
                      </View>
                      <View style={[styles.enginePlanArrowWrap, { backgroundColor: dashboardCardText + '1a' }]}>
                        <Text style={[styles.enginePlanArrow, { color: dashboardCardText }]}>›</Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  <View style={styles.engineMeterLayout}>
                    <View style={styles.engineStatsColumn}>
                      <View style={styles.engineStatsRow}>
                        <View style={[styles.engineStatPill, { backgroundColor: dashboardInputBg }]}>
                          <Text style={[styles.engineStatValue, { color: dashboardCardText }]}>{decisionSignal.meterScore}%</Text>
                          <Text style={[styles.engineStatLabel, { color: dashboardMutedText }]}>waste risk</Text>
                        </View>
                        <View style={[styles.engineStatPill, { backgroundColor: dashboardInputBg }]}>
                          <Text style={[styles.engineStatValue, { color: dashboardCardText }]}>
                            {decisionSignal.hasWeeklyEstimate ? `~$${decisionSignal.weeklyWaste}` : 'Not set'}
                          </Text>
                          <Text style={[styles.engineStatLabel, { color: dashboardMutedText }]}>could save / week</Text>
                        </View>
                        <View style={[styles.engineStatPill, { backgroundColor: dashboardInputBg }]}>
                          <Text style={[styles.engineStatValue, { color: dashboardCardText }]}>
                            {planEconomics.targetPerDay !== null ? `$${planEconomics.targetPerDay.toFixed(2)}` : 'Not set'}
                          </Text>
                          <Text style={[styles.engineStatLabel, { color: dashboardMutedText }]}>to spend / day</Text>
                        </View>
                      </View>

                      <View style={styles.wasteMeterCopy}>
                        <Text style={[styles.wasteMeterLabel, { color: dashboardCardText }]}>{decisionSignal.move}</Text>
                        <Text style={[styles.wasteMeterBand, { color: dashboardMutedText }]}>
                          Waste risk is how likely you are to pay for food you already have. Tap ↗ for the full breakdown.
                        </Text>
                      </View>
                    </View>
                  </View>

                  {!isCravingPanelOpen ? (
                    nudgeLoading ? (
                      <Animated.View
                        entering={FadeInDown.duration(MOTION_FAST_MS).easing(Easing.out(Easing.quad))}
                        exiting={FadeOutUp.duration(MOTION_FAST_MS).easing(Easing.in(Easing.quad))}
                        style={styles.formBlock}>
                        <View style={[styles.nudgeLoadingCard, styles.cravingLoadingRow, { backgroundColor: dashboardInputBg }]}>
                          <ActivityIndicator size="small" color={dashboardCardText} />
                          <Text style={[styles.nudgeLoadingText, { color: dashboardCardText }]}>Checking your plan...</Text>
                        </View>
                      </Animated.View>
                    ) : null
                  ) : (
                    <Animated.View
                      ref={cravingPanelRef}
                      entering={FadeInDown.duration(MOTION_BALANCED_MS).easing(Easing.out(Easing.cubic))}
                      exiting={FadeOutUp.duration(MOTION_FAST_MS).easing(Easing.in(Easing.quad))}
                      style={[styles.engineExpandedPanel, { borderTopColor: dashboardDivider }]}>
                      <View style={styles.sectionHeaderRow}>
                        <Text style={[styles.formBlockLabel, { color: dashboardCardText }]}>CRAVING CHECK</Text>
                        <View style={styles.cravingPanelActions}>
                          <TouchableOpacity onPress={() => setIsCravingPanelOpen(false)} activeOpacity={0.6}>
                            <Text style={[styles.cravingHideLink, { color: dashboardMutedText }]}>Hide</Text>
                          </TouchableOpacity>
                        </View>
                      </View>

                      <View style={[styles.formBlock, styles.formBlockDivider, { borderBottomColor: dashboardDivider }]}>
                        <Text style={[styles.formBlockLabel, { color: dashboardMutedText }]}>Meal plan status</Text>
                        <View style={styles.chipRow}>
                          {MEAL_PLAN_STATUS_OPTIONS.map((option) => (
                            <Chip
                              key={option.label}
                              label={option.label}
                              emoji={option.emoji}
                              selected={mealPlanStatus === option.label}
                              onPress={() => setMealPlanStatus(option.label)}
                              accentColor={cardAccent}
                              accentTextColor={cardAccentText}
                              mutedBg={dashboardChipBg}
                              mutedText={dashboardCardText}
                            />
                          ))}
                        </View>
                      </View>

                      <View style={[styles.formBlock, styles.formBlockDivider, { borderBottomColor: dashboardDivider }]}>
                        <Text style={[styles.formBlockLabel, { color: dashboardMutedText }]}>Budget outside meal plan</Text>
                        <View style={styles.chipRow}>
                          {BALANCE_PRESETS.map((amount) => (
                            <Chip
                              key={amount}
                              label={`$${amount}`}
                              selected={balance === String(amount)}
                              onPress={() => setBalance(String(amount))}
                              accentColor={cardAccent}
                              accentTextColor={cardAccentText}
                              mutedBg={dashboardChipBg}
                              mutedText={dashboardCardText}
                            />
                          ))}
                        </View>
                        <TextInput
                          style={[
                            styles.plainInput,
                            {
                              color: dashboardCardText,
                              backgroundColor: dashboardInputBg,
                              borderColor: dashboardInputBorder,
                            },
                          ]}
                          value={balance}
                          onChangeText={setBalance}
                          keyboardType="numeric"
                          placeholder="Enter budget outside your meal plan"
                          placeholderTextColor={dashboardMutedText}
                        />
                      </View>

                      <View style={[styles.formBlock, styles.formBlockDivider, { borderBottomColor: dashboardDivider }]}>
                        <Text style={[styles.formBlockLabel, { color: dashboardMutedText }]}>Vibe</Text>
                        <View style={styles.chipRow}>
                          {CONTEXT_OPTIONS.map((option) => (
                            <Chip
                              key={option.label}
                              label={option.label}
                              emoji={option.emoji}
                              selected={context === option.label}
                              onPress={() => setContext(option.label)}
                              accentColor={cardAccent}
                              accentTextColor={cardAccentText}
                              mutedBg={dashboardChipBg}
                              mutedText={dashboardCardText}
                            />
                          ))}
                        </View>
                        <TextInput
                          style={[
                            styles.plainInput,
                            {
                              color: dashboardCardText,
                              backgroundColor: dashboardInputBg,
                              borderColor: dashboardInputBorder,
                            },
                          ]}
                          value={context}
                          onChangeText={setContext}
                          placeholder="Or describe your vibe"
                          placeholderTextColor={dashboardMutedText}
                        />
                      </View>

                      <View style={[styles.formBlock, styles.formBlockDivider, { borderBottomColor: dashboardDivider }]}>
                        <Text style={[styles.formBlockLabel, { color: dashboardMutedText }]}>Delivery frequency</Text>
                        <View style={styles.chipRow}>
                          {DELIVERY_FREQUENCY_OPTIONS.map((option) => (
                            <Chip
                              key={option.label}
                              label={option.label}
                              emoji={option.emoji}
                              selected={deliveryFrequency === option.label}
                              onPress={() => setDeliveryFrequency(option.label)}
                              accentColor={cardAccent}
                              accentTextColor={cardAccentText}
                              mutedBg={dashboardChipBg}
                              mutedText={dashboardCardText}
                            />
                          ))}
                        </View>
                      </View>

                      <View style={[styles.formBlock, styles.formBlockDivider, { borderBottomColor: dashboardDivider }]}>
                        <View style={styles.formBlockHeaderRow}>
                          <Text style={[styles.formBlockLabel, { color: dashboardMutedText }]}>Craving</Text>
                          <TouchableOpacity onPress={surpriseMe} activeOpacity={0.6}>
                            <Text style={[styles.surpriseLink, { color: surpriseLinkColor }]}>🎲 Surprise me</Text>
                          </TouchableOpacity>
                        </View>
                        <View style={styles.chipRow}>
                          {CRAVING_OPTIONS.map((option) => (
                            <Chip
                              key={option.label}
                              label={option.label}
                              emoji={option.emoji}
                              selected={craving === option.label}
                              onPress={() => setCraving(option.label)}
                              accentColor={cardAccent}
                              accentTextColor={cardAccentText}
                              mutedBg={dashboardChipBg}
                              mutedText={dashboardCardText}
                            />
                          ))}
                        </View>
                        <TextInput
                          style={[
                            styles.plainInput,
                            {
                              color: dashboardCardText,
                              backgroundColor: dashboardInputBg,
                              borderColor: dashboardInputBorder,
                            },
                          ]}
                          value={craving}
                          onChangeText={setCraving}
                          placeholder="Or type your own craving"
                          placeholderTextColor={dashboardMutedText}
                        />
                      </View>

                      <View style={styles.formBlock}>
                        <TouchableOpacity
                          onPress={fetchNudge}
                          disabled={nudgeLoading || !craving.trim()}
                          activeOpacity={0.85}>
                          <View style={[styles.ctaButton, { backgroundColor: tertiaryButtonColor, opacity: (nudgeLoading || !craving.trim()) ? 0.4 : 1 }]}>
                            <Text style={[styles.ctaButtonText, { color: tertiaryButtonText }]}>
                              {nudgeLoading ? 'Checking...' : 'What should I eat?'}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <Text style={[styles.engineHint, { color: dashboardMutedText }]}>Tap after you set your craving, vibe, plan, and budget.</Text>
                      </View>
                    </Animated.View>
                  )}

                </View>
              </View>
            </View>

            {suggestion ? (
              <Animated.View
                entering={FadeInUp.duration(MOTION_BALANCED_MS).easing(Easing.out(Easing.cubic))}
                exiting={FadeOutDown.duration(MOTION_FAST_MS).easing(Easing.in(Easing.quad))}
                onLayout={(event) => {
                  bestMoveOffsetRef.current = event.nativeEvent.layout.y;
                }}
                style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={[styles.sectionTitle, styles.sectionTitleFlush, { color: dashboardPageText + 'b3' }]}>BEST MOVE</Text>
                  {isBestMoveOpen ? (
                    <TouchableOpacity onPress={() => setIsBestMoveOpen(false)} activeOpacity={0.6}>
                      <Text style={[styles.cravingHideLink, { color: dashboardPageText + 'b3' }]}>Hide</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                {isBestMoveOpen ? (
                <Animated.View
                  entering={FadeInDown.duration(MOTION_BALANCED_MS).easing(Easing.out(Easing.cubic))}
                  exiting={FadeOutUp.duration(MOTION_FAST_MS).easing(Easing.in(Easing.quad))}
                >
                <View style={[styles.sectionCard, styles.resultCard, { backgroundColor: dashboardCardBg }]}>
                  <Text style={[styles.resultHeadline, { color: dashboardCardText }]}>{suggestion}</Text>

                  {savingsEstimate ? (
                    <View style={[styles.savingsBadge, { backgroundColor: savingsAccentBg }]}>
                      <Text style={[styles.resultSavingsText, { color: savingsAccent }]}>Save {savingsEstimate}</Text>
                    </View>
                  ) : null}

                  {whyItMatches ? (
                    <Text style={[styles.resultRationale, { color: dashboardMutedText }]} numberOfLines={2}>
                      {whyItMatches}
                    </Text>
                  ) : null}

                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => setIsWhyOpen((open) => !open)}>
                    <View style={[styles.whyToggle, { backgroundColor: dashboardInputBg }]}>
                      <Text style={[styles.whyToggleText, { color: dashboardCardText }]}>Why this recommendation?</Text>
                      <Text style={[styles.whyToggleIcon, { color: dashboardCardText }]}>{isWhyOpen ? '−' : '+'}</Text>
                    </View>
                  </TouchableOpacity>

                  {isWhyOpen ? (
                    <Animated.View
                      entering={FadeInDown.duration(MOTION_FAST_MS).easing(Easing.out(Easing.quad))}
                      exiting={FadeOutUp.duration(MOTION_FAST_MS).easing(Easing.in(Easing.quad))}
                      style={styles.whyPanel}>
                      <View style={[styles.trustRow, { backgroundColor: inferredBadgeBg }]}>
                        <Text style={[styles.trustRowLabel, { color: dashboardMutedText }]}>Based on</Text>
                        <Text style={[styles.trustRowValue, { color: dashboardCardText }]}>{confidenceLabel}</Text>
                      </View>

                      {trustChips.length ? (
                        <View style={styles.trustChipRow}>
                          {trustChips.map((entry) => (
                            <View key={entry} style={[styles.trustChip, { backgroundColor: dashboardCardText + '10' }]}>
                              <Text style={[styles.trustChipText, { color: dashboardCardText }]}>{entry}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {nudgePoints.length ? (
                        <View style={styles.nudgePointList}>
                          {nudgePoints.map((point) => (
                            <View key={point} style={styles.nudgePointRow}>
                              <View style={[styles.nudgePointDot, { backgroundColor: cardAccent }]} />
                              <Text style={[styles.nudgePointText, { color: dashboardCardText }]}>{point}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      {recentOutcomes.length ? (
                        <Text style={[styles.truthLine, { color: dashboardMutedText }]}>
                          Recent follow-through: {recentFollowedCount} of {recentOutcomes.length} meal-plan-first choices.
                        </Text>
                      ) : null}

                      <Text style={[styles.truthLine, { color: dashboardMutedText }]}>DineWise only uses what you told it. It never guesses hall names, hours, or menus.</Text>
                    </Animated.View>
                  ) : null}

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setOutcomeHistory((prev) => [...prev.slice(-29), true]);
                        setLastOutcome('followed');
                      }}
                      style={styles.actionButtonWrap}
                    >
                      <View
                        style={[
                          styles.actionButton,
                          {
                            backgroundColor: cardAccent,
                            borderColor: lastOutcome === 'followed' ? contrastColor(cardAccent) + 'aa' : 'transparent',
                            borderWidth: lastOutcome === 'followed' ? 2 : 0,
                          },
                        ]}
                      >
                        <Text style={[styles.actionButtonText, { color: contrastColor(cardAccent) }]}>I followed this</Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setOutcomeHistory((prev) => [...prev.slice(-29), false]);
                        setLastOutcome('delivery');
                      }}
                      style={styles.actionButtonWrap}
                    >
                      <View
                        style={[
                          styles.actionButton,
                          {
                            backgroundColor: dashboardCardText + '1f',
                            borderColor: lastOutcome === 'delivery' ? dashboardCardText + 'aa' : 'transparent',
                            borderWidth: lastOutcome === 'delivery' ? 2 : 0,
                          },
                        ]}
                      >
                        <Text style={[styles.actionButtonText, { color: dashboardCardText }]}>I ordered delivery</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {lastOutcome ? (
                    <Text style={[styles.outcomeFeedbackText, { color: dashboardMutedText }]}>
                      Logged: {lastOutcome === 'followed' ? 'meal-plan-first choice' : 'ordered delivery'}
                    </Text>
                  ) : null}

                </View>
                </Animated.View>
                ) : (
                <Animated.View
                  entering={FadeInDown.duration(MOTION_BALANCED_MS).easing(Easing.out(Easing.cubic))}
                  exiting={FadeOutUp.duration(MOTION_FAST_MS).easing(Easing.in(Easing.quad))}
                >
                  <View style={[styles.sectionCard, styles.resultCard, styles.resultCardCollapsed, { backgroundColor: dashboardCardBg }]}>
                    <Text numberOfLines={2} style={[styles.resultCollapsedText, { color: dashboardMutedText }]}>
                      Your best move is saved and ready.
                    </Text>
                    <TouchableOpacity onPress={() => setIsBestMoveOpen(true)} activeOpacity={0.85}>
                      <View style={[styles.resultShowButton, { backgroundColor: tertiaryButtonColor }]}>
                        <Text style={[styles.resultShowButtonText, { color: tertiaryButtonText }]}>Show</Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
                )}
              </Animated.View>
            ) : null}

          </Animated.View>
        </ScrollView>
      </SafeAreaView>
      {__DEV__ ? (
        <View pointerEvents="none" style={styles.debugBadgeWrap}>
          <Text style={styles.debugBadgeText}>{debugFlowSummary}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    alignItems: 'stretch',
  },
  mainScroll: {
    flex: 1,
    width: '100%',
  },
  mainScrollContent: {
    paddingBottom: BottomTabInset + Spacing.five,
  },
  mainContent: {
    width: '100%',
    gap: Spacing.three,
    paddingTop: Spacing.two,
  },
  mainContentMobile: {
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.two,
  },
  mainContentWeb: {
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
  authShell: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    transform: [{ translateY: -20 }],
  },
  authTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  authAppIcon: {
    width: 88,
    height: 88,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: Spacing.one,
  },
  authPageTitle: {
    fontSize: 32.4,
    fontWeight: '800',
    textAlign: 'center',
  },
  authPageSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Spacing.one,
  },
  authCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  authInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  authErrorText: {
    color: ERROR_COLOR,
    fontSize: 13,
  },
  authSubmitButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
  },
  authSubmitText: {
    fontSize: 15,
    fontWeight: '700',
  },
  authSignupHintRow: {
    marginTop: Spacing.one,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  authSignupHintText: {
    fontSize: 13,
  },
  authSignupLinkText: {
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  heroSection: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.two,
    paddingLeft: Spacing.two,
  },
  headerIconFrame: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconImage: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  headerTextGroup: {
    flex: 1,
    gap: 2,
  },
  headerSettingsButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSettingsText: {
    fontSize: 16,
    fontWeight: '700',
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 15,
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  section: {
    gap: Spacing.one,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingHorizontal: Spacing.two,
  },
  sectionTitleFlush: {
    paddingHorizontal: 0,
  },
  resultCardCollapsed: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  resultCollapsedText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  resultShowButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  resultShowButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  surpriseLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  formBlockHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cravingPanelActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cravingHideLink: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  sectionCard: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  engineExpandedPanel: {
    marginTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
  },
  planHealthCard: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.one,
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.two,
  },
  planHealthCardFlex: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
  },
  wasteMeterCardInline: {
    width: 84,
    paddingHorizontal: Spacing.one,
  },
  wasteGaugeTrackInline: {
    width: 66,
    height: 132,
    borderRadius: 24,
    padding: 5,
  },
  planHealthTopRow: {
    gap: Spacing.one,
  },  planHealthValue: {
    fontSize: 19,
    fontWeight: '800',
  },
  planHealthMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  planHealthChip: {
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  planHealthChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  planHealthDetail: {
    fontSize: 12,
  },
  planHealthLink: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  quickActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  deliveryCheckCard: {
    borderRadius: Spacing.two,
    padding: Spacing.two,
    gap: Spacing.two,
  },
  deliveryCheckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  deliveryCheckTitle: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  deliveryCheckBody: {
    gap: Spacing.two,
  },
  deliveryVerdict: {
    gap: Spacing.one,
  },
  deliveryVerdictTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  deliveryActionButton: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  deliveryActionText: {
    fontSize: 14,
    fontWeight: '800',
  },
  deliveryOptionName: {
    fontSize: 15,
    fontWeight: '700',
  },
  whyList: {
    gap: 2,
  },
  whyItem: {
    fontSize: 12,
  },
  quickActionCell: {
    flexGrow: 1,
    flexBasis: '46%',
  },
  quickActionButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionPrimary: {
    borderWidth: 1.5,
  },
  setupHintCard: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    padding: Spacing.two,
    gap: 4,
  },
  setupHintTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  setupHintBody: {
    fontSize: 12,
  },
  setupHintLink: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  quickActionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cravingLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  cravingRevealButton: {
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cravingRevealText: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  nudgeLoadingCard: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  nudgeLoadingText: {
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    gap: Spacing.two,
  },
  rowStatic: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowSubvalue: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  rowChevron: {
    fontSize: 20,
    fontWeight: '400',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
  },
  formBlock: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  formBlockDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  formBlockLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: Spacing.one + 4,
    borderRadius: 999,
  },
  chipTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  plainInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  ctaButton: {
    marginTop: Spacing.one,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
  resultCard: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  resultBody: {
    fontSize: 15,
    lineHeight: 21,
  },
  engineTitle: {
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  engineSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  engineStatsRow: {
    flexDirection: 'row',
    gap: Spacing.one,
    flexWrap: 'wrap',
  },
  engineStatPill: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 96,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: 2,
  },
  engineStatValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  engineStatLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  wasteMeterCard: {
    borderRadius: Spacing.three,
    width: 136,
    flexShrink: 0,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
    alignItems: 'center',
  },
  wasteMeterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: Spacing.one,
  },
  wasteMeterTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    letterSpacing: 0.1,
    flexShrink: 1,
  },
  meterExpandButton: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterExpandButtonText: {
    fontSize: 15,
    fontWeight: '700',
  },
  wasteMeterSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  wasteMeterBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
    borderRadius: 999,
  },
  wasteMeterBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  wasteGaugeTrackVertical: {
    position: 'relative',
    alignSelf: 'center',
    width: 92,
    height: 214,
    padding: 7,
    borderRadius: 34,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  wasteGaugeSegmentVertical: {
    flex: 1,
    minHeight: 18,
    width: '100%',
    borderRadius: 999,
    opacity: 0.55,
  },
  wasteGaugeLiquidVertical: {
    position: 'absolute',
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 999,
    opacity: 0.85,
    overflow: 'hidden',
    zIndex: 1,
  },
  wasteGaugeWaveBack: {
    position: 'absolute',
    top: -10,
    left: -20,
    width: '160%',
    height: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(191, 219, 254, 0.45)',
  },
  wasteGaugeWaveFront: {
    position: 'absolute',
    top: -8,
    left: -16,
    width: '145%',
    height: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(219, 234, 254, 0.65)',
  },
  wasteGaugeCenterValueWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    elevation: 4,
  },
  wasteGaugeCenterValue: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
    minWidth: 48,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    textAlign: 'center',
    overflow: 'hidden',
  },
  engineMeterLayout: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  engineStatsColumn: {
    flex: 1,
    gap: Spacing.two,
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  enginePlanCard: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  enginePlanLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  enginePlanName: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '700',
  },
  enginePlanArrowWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enginePlanArrow: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 20,
  },
  wasteGaugeShell: {
    position: 'relative',
    gap: 6,
    paddingLeft: 0,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  meterStatusWrap: {
    minHeight: 30,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  meterStatusText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  wasteGaugeGlassHighlight: {
    position: 'absolute',
    left: 9,
    top: 10,
    bottom: 10,
    width: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.15)',
    zIndex: 2,
  },
  wasteMeterCopy: {
    gap: Spacing.one,
  },
  wasteMeterLabel: {
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  wasteMeterBand: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
    lineHeight: 16,
  },
  wasteMeterMove: {
    fontSize: 15,
    fontWeight: '600',
  },
  wasteMeterContext: {
    fontSize: 13,
    lineHeight: 18,
  },
  engineHint: {
    fontSize: 12,
    fontWeight: '600',
  },
  resultHeadline: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  sectionHeaderHint: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  nudgePointList: {
    gap: Spacing.one,
  },
  nudgePointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  nudgePointDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
  },
  nudgePointText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  savingsBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  trustRow: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trustRowLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  trustRowValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  trustChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  trustChip: {
    paddingHorizontal: Spacing.one + 4,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  trustChipText: {
    fontSize: 11,
    fontWeight: '600',
  },
  truthLine: {
    fontSize: 12,
    lineHeight: 16,
  },
  resultSavingsText: {
    fontSize: 16,
    fontWeight: '800',
  },
  resultRationale: {
    fontSize: 14,
    lineHeight: 19,
  },
  whyToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },
  whyToggleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  whyToggleIcon: {
    fontSize: 20,
    lineHeight: 20,
    fontWeight: '700',
  },
  whyPanel: {
    gap: Spacing.two,
  },
  actionRow: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    gap: Spacing.one,
  },
  actionButtonWrap: {
    flex: 1,
  },
  actionButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.one + 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  outcomeFeedbackText: {
    marginTop: Spacing.one,
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.light.backgroundSelected,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.light.background,
  },
  logo: {
    width: 84,
    height: 84,
    borderRadius: Spacing.four,
    marginBottom: Spacing.three,
    resizeMode: 'contain',
    backgroundColor: Colors.light.background,
  },
  sessionSetupRow: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  onboardingOptionsList: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    overflow: 'hidden',
    maxHeight: 220,
  },
  onboardingOptionsScroll: {
    maxHeight: 220,
  },
  dropdownTrigger: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  onboardingOptionRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.35)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  debugBadgeWrap: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    zIndex: 9999,
    alignItems: 'center',
  },
  debugBadgeText: {
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
