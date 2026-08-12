import * as Device from 'expo-device';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { ThemedText } from '@/components/themed-text';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useDiningPlan, type StudentLevel } from '@/context/dining-plan-context';
import { fetchWithRetry } from '@/utils/backend-fetch';
import { getBackendBaseUrl } from '@/utils/backend-url';
import { contrastColor, normalizeHex, pickReadableColor } from '@/utils/theme-color';

const ERROR_COLOR = '#cc0000';

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

const DELIVERY_SERVICE_OPTIONS: readonly string[] = [
  'DoorDash',
  'Uber Eats',
  'Grubhub',
  'Postmates',
  'Instacart',
  'Other',
];

const STUDENT_LEVEL_OPTIONS: readonly StudentLevel[] = ['undergraduate', 'graduate'];

const BALANCE_PRESETS = [5, 10, 20, 50];

function toPhraseList(text: string, maxItems = 3): string[] {
  if (!text.trim()) return [];
  return text
    .split(/[\n.!?]+/)
    .map((line) => line.replace(/^[-*\u2022\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, maxItems)
    .map((line) => {
      const words = line.split(/\s+/).filter(Boolean);
      if (words.length <= 12) return line;
      return `${words.slice(0, 12).join(' ')}...`;
    });
}

function buildNudgePoints(
  suggestion: string,
  whyItMatches: string | null,
  apiPoints: string[]
): string[] {
  const seeded = apiPoints
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  if (seeded.length) return seeded;

  const combined = [...toPhraseList(suggestion, 2), ...toPhraseList(whyItMatches || '', 1)];
  return Array.from(new Set(combined)).slice(0, 3);
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

function normalizeThemePalette(data: {
  background: string;
  secondary?: string;
  tertiary?: string;
  text: string;
  logo_url?: string | null;
}) {
  const seed = [data.background, data.secondary, data.tertiary]
    .map((item) => (item || '').trim().toUpperCase())
    .filter((item) => /^#[0-9A-F]{6}$/.test(item));
  const unique = Array.from(new Set(seed));

  while (unique.length < 3) {
    const fallback = data.text.toLowerCase() === '#000000' ? '#FFFFFF' : '#111111';
    if (!unique.includes(fallback)) {
      unique.push(fallback);
    } else {
      unique.push('#9CA3AF');
    }
  }

  const ordered = unique.slice(0, 3).sort((a, b) => hexLuminance(a) - hexLuminance(b));
  return {
    background: ordered[0],
    backgroundElement: ordered[2],
    secondary: ordered[1],
    tertiary: ordered[2],
    text: data.text,
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
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.chip, { backgroundColor: selected ? accentColor : mutedBg }]}>
        <Text style={{ fontSize: 13, fontWeight: selected ? '600' : '500', color: selected ? accentTextColor : mutedText }}>
          {emoji ? `${emoji} ` : ''}{label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function getDevMenuHint() {
  if (Platform.OS === 'web') {
    return <ThemedText type="small">use browser devtools</ThemedText>;
  }
  if (Device.isDevice) {
    return (
      <ThemedText type="small">
        shake device or press <ThemedText type="code">m</ThemedText> in terminal
      </ThemedText>
    );
  }
  const shortcut = Platform.OS === 'android' ? 'cmd+m (or ctrl+m)' : 'cmd+d';
  return (
    <ThemedText type="small">
      press <ThemedText type="code">{shortcut}</ThemedText>
    </ThemedText>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { setupFlow } = useLocalSearchParams<{ setupFlow?: string }>();

  const {
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
  } = useDiningPlan();

  const [contact, setContact] = React.useState('');
  const [name, setName] = React.useState('');
  const [deliveryService, setDeliveryService] = React.useState('');
  const [customDeliveryService, setCustomDeliveryService] = React.useState('');
  const [hasOnboarded, setHasOnboarded] = React.useState(false);

  const [themeLoading, setThemeLoading] = React.useState(false);
  const [themeError, setThemeError] = React.useState<string | null>(null);
  const [mealPlanDropdownOpen, setMealPlanDropdownOpen] = React.useState(false);
  const [deliveryServiceDropdownOpen, setDeliveryServiceDropdownOpen] = React.useState(false);

  const [balance, setBalance] = React.useState('');
  const [craving, setCraving] = React.useState('');
  const [context, setContext] = React.useState('');
  const [mealPlanStatus, setMealPlanStatus] = React.useState('');
  const [deliveryFrequency, setDeliveryFrequency] = React.useState('');
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [savingsEstimate, setSavingsEstimate] = React.useState<string | null>(null);
  const [whyItMatches, setWhyItMatches] = React.useState<string | null>(null);
  const [nudgePoints, setNudgePoints] = React.useState<string[]>([]);
  const [nudgeLoading, setNudgeLoading] = React.useState(false);

  const [onboardingStep, setOnboardingStep] = React.useState(0);
  const TOTAL_STEPS = 6;
  const onboardingFade = useSharedValue(1);
  const onboardingLift = useSharedValue(0);

  const onboardingTransitionStyle = useAnimatedStyle(() => ({
    opacity: onboardingFade.value,
    transform: [{ translateY: onboardingLift.value }],
  }));

  React.useEffect(() => {
    if (setupFlow === 'onboarding' && diningSessionConfigured) {
      setHasOnboarded(false);
      setOnboardingStep(5);
    }
    // Only react when setupFlow itself changes (e.g. returning from the meal-plan
    // screens via dismissTo), not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupFlow]);

  React.useEffect(() => {
    if (onboardingStep !== 4) {
      setMealPlanDropdownOpen(false);
    }
    if (onboardingStep !== 5) {
      setDeliveryServiceDropdownOpen(false);
    }
  }, [onboardingStep]);

  React.useEffect(() => {
    onboardingFade.value = 0.72;
    onboardingLift.value = 4;
    onboardingFade.value = withTiming(1, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
    onboardingLift.value = withTiming(0, {
      duration: 280,
      easing: Easing.out(Easing.cubic),
    });
  }, [onboardingStep, onboardingFade, onboardingLift]);

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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school, student_level: studentLevel }),
      }, { timeoutMs: 20000, retries: 2 });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));
      setUniversityTheme(normalizeThemePalette({
        background: data.background,
        secondary: data.secondary ?? data.backgroundElement,
        tertiary: data.tertiary ?? data.secondary ?? data.backgroundElement,
        text: data.text,
        logo_url: data.logo_url ?? null,
      }));
      setDiningSystems(data.dining_systems ?? []);
      setDiningSystemSummary(data.dining_system_summary ?? '');
      setDiningSessionConfigured(false);
      setConfiguredDiningSession(null);
      setOnboardingStep(4); // advance past student-level step
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
    if (onboardingStep === 3) {
      await handleOnboardingComplete();
    } else if (onboardingStep === TOTAL_STEPS - 1) {
      setHasOnboarded(true);
    } else {
      setOnboardingStep(s => s + 1);
    }
  };

  const onStepBack = () => {
    setThemeError(null);
    setOnboardingStep(s => Math.max(0, s - 1));
  };

  const STEPS = [
    {
      heading: 'Welcome to DineWise',
      question: "Let's start with how we can reach you.",
      placeholder: 'Email or phone number',
      value: contact,
      onChange: setContact,
      keyboardType: 'email-address' as const,
      autoCapitalize: 'none' as const,
    },
    {
      heading: 'Nice to meet you',
      question: "What should we call you?",
      placeholder: 'Your first name',
      value: name,
      onChange: setName,
      keyboardType: 'default' as const,
      autoCapitalize: 'words' as const,
    },
    {
      heading: 'Your campus',
      question: "Which university do you attend?",
      placeholder: 'e.g. UC Berkeley, Michigan, NYU',
      value: school,
      onChange: setSchool,
      keyboardType: 'default' as const,
      autoCapitalize: 'words' as const,
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
    {
      heading: 'Your delivery habit',
      question: "Which delivery app do you use most?",
      placeholder: 'e.g. DoorDash, Uber Eats, Grubhub',
      value: deliveryService,
      onChange: setDeliveryService,
      keyboardType: 'default' as const,
      autoCapitalize: 'words' as const,
      key: 'delivery',
    },
  ];

  const currentStep = STEPS[onboardingStep];
  const isLastStep = onboardingStep === TOTAL_STEPS - 1;
  const cardBg = universityTheme.backgroundElement;
  const pageBg = universityTheme.background;
  const cardText = contrastColor(cardBg);
  const pageText = contrastColor(pageBg);
  const onboardingNextDisabled =
    themeLoading ||
    (currentStep.key === 'meal-plan' && !diningSessionConfigured) ||
    (currentStep.key === 'student-level' && !studentLevel);

  const dashboardPageBg = universityTheme.background;
  const dashboardCardBg = universityTheme.backgroundElement;
  const dashboardPageText = contrastColor(dashboardPageBg);
  const dashboardCardText = contrastColor(dashboardCardBg);
  const dashboardMutedText = dashboardCardText + 'b3';
  const dashboardDivider = dashboardCardText + '26';
  const dashboardChipBg = dashboardCardText + '14';
  const dashboardInputBg = dashboardCardText + '0d';
  const dashboardInputBorder = dashboardCardText + '66';
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
    setMealPlanStatus(pick(MEAL_PLAN_STATUS_OPTIONS));
    setDeliveryFrequency(pick(DELIVERY_FREQUENCY_OPTIONS));
    if (!balance.trim()) {
      setBalance(String(BALANCE_PRESETS[Math.floor(Math.random() * BALANCE_PRESETS.length)]));
    }
  };

  const fetchNudge = async () => {
    setNudgeLoading(true);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error('Backend URL unavailable. On a physical device, set EXPO_PUBLIC_API_URL to your computer LAN IP (example: http://192.168.1.10:8000) and do not use localhost.');
      }
      const response = await fetchWithRetry(`${backendBaseUrl}/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balance: parseFloat(balance) || 0,
          craving,
          context,
          meal_plan_status: mealPlanStatus,
          delivery_frequency: deliveryFrequency,
          delivery_service: (
            deliveryService === 'Other'
              ? customDeliveryService.trim() || 'Other'
              : deliveryService || undefined
          ),
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
        ? data.nudge_points.map((item) => String(item)).filter((item) => item.trim())
        : [];

      setSuggestion(nextSuggestion);
      setSavingsEstimate(data.savings_estimate ?? null);
      setWhyItMatches(nextWhy);
      setNudgePoints(buildNudgePoints(nextSuggestion, nextWhy, apiPoints));
    } catch (error) {
      console.error('Connection failed:', error);
      Alert.alert('Connection failed', String(error));
    } finally {
      setNudgeLoading(false);
    }
  };

  if (!hasOnboarded) {
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
            {onboardingStep === 2 && universityTheme.logoUrl ? (
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
            ) : currentStep.key === 'delivery' ? (
              <View style={styles.sessionSetupRow}>
                <Text style={{ color: cardText, fontWeight: '600', fontSize: 14 }}>
                  Pick your usual delivery service
                </Text>
                <TouchableOpacity
                  onPress={() => setDeliveryServiceDropdownOpen((prev) => !prev)}
                  activeOpacity={0.8}
                  style={[styles.dropdownTrigger, { borderColor: cardText + '35' }]}>
                  <Text style={{ color: cardText, fontWeight: deliveryService ? '700' : '500' }}>
                    {deliveryService === 'Other' && customDeliveryService.trim()
                      ? customDeliveryService
                      : deliveryService || 'Select a service'}
                  </Text>
                  <Text style={{ color: cardText, fontWeight: '700' }}>
                    {deliveryServiceDropdownOpen ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {deliveryServiceDropdownOpen ? (
                  <View style={[styles.onboardingOptionsList, { borderColor: cardText + '35' }]}>
                    <ScrollView
                      style={styles.onboardingOptionsScroll}
                      nestedScrollEnabled
                      showsVerticalScrollIndicator
                      keyboardShouldPersistTaps="handled">
                      {DELIVERY_SERVICE_OPTIONS.map((option) => {
                        const isSelected = deliveryService === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            onPress={() => {
                              setDeliveryService(option);
                              if (option !== 'Other') {
                                setCustomDeliveryService('');
                              }
                              setDeliveryServiceDropdownOpen(false);
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

                {deliveryService === 'Other' ? (
                  <TextInput
                    style={[styles.input, { fontSize: 16 }]}
                    value={customDeliveryService}
                    onChangeText={setCustomDeliveryService}
                    placeholder="Type your delivery service"
                    placeholderTextColor={cardText + '99'}
                    autoCapitalize="words"
                  />
                ) : null}
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
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: dashboardPageBg }]}> 
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: dashboardPageBg }]}> 
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.mainContent, Platform.OS === 'web' ? styles.mainContentWeb : styles.mainContentMobile]}>
            <View style={styles.headerRow}>
              <View style={styles.headerIconWrap}>
                <AnimatedIcon />
              </View>
              <View style={styles.headerTextGroup}>
                <Text style={[styles.largeTitle, { color: dashboardPageText }]}>DineWise</Text>
                <Text style={[styles.headerSubtitle, { color: dashboardPageText + 'cc' }]}> 
                  {school ? `Smarter than delivery at ${school}.` : 'Smarter than delivery.'}
                </Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: dashboardPageText + 'b3' }]}>MEAL PLAN</Text>
              <View style={[styles.sectionCard, { backgroundColor: dashboardCardBg }]}> 
                <TouchableOpacity activeOpacity={0.6} onPress={() => openMealPlanSetup('dashboard')}>
                  <View style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowLabel, { color: dashboardCardText }]}> 
                        {diningSessionConfigured ? 'Configured plan' : 'Set up your meal plan'}
                      </Text>
                      {diningSessionConfigured ? (
                        <Text style={[styles.rowSubvalue, { color: cardAccent }]} numberOfLines={1}>
                          {configuredDiningSession}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={[styles.rowChevron, { color: dashboardCardText + '99' }]}>›</Text>
                  </View>
                </TouchableOpacity>
                {diningSessionConfigured && diningSystemSummary ? (
                  <>
                    <View style={[styles.separator, { backgroundColor: dashboardDivider }]} />
                    <View style={styles.rowStatic}>
                      <Text style={[styles.rowFootnote, { color: dashboardMutedText }]}>{diningSystemSummary}</Text>
                    </View>
                  </>
                ) : null}
              </View>
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: dashboardPageText + 'b3' }]}>CRAVING CHECK</Text>
                <TouchableOpacity onPress={surpriseMe} activeOpacity={0.6}>
                  <Text style={[styles.surpriseLink, { color: surpriseLinkColor }]}>🎲 Surprise me</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.sectionCard, { backgroundColor: dashboardCardBg }]}> 
                <View style={[styles.formBlock, styles.formBlockDivider, { borderBottomColor: dashboardDivider }]}> 
                  <Text style={[styles.formBlockLabel, { color: dashboardMutedText }]}>Craving</Text>
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

                <View style={styles.formBlock}>
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
              </View>
            </View>

            <TouchableOpacity
              onPress={fetchNudge}
              disabled={nudgeLoading || !craving.trim()}
              activeOpacity={0.85}>
              <View style={[styles.ctaButton, { backgroundColor: tertiaryButtonColor, opacity: (nudgeLoading || !craving.trim()) ? 0.4 : 1 }]}> 
                <Text style={[styles.ctaButtonText, { color: tertiaryButtonText }]}> 
                  {nudgeLoading ? 'Finding your move...' : 'Get quick nudge'}
                </Text>
              </View>
            </TouchableOpacity>

            {suggestion ? (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: dashboardPageText + 'b3' }]}>QUICK NUDGE</Text>
                <View style={[styles.sectionCard, styles.resultCard, { backgroundColor: dashboardCardBg }]}> 
                  <Text style={[styles.resultHeadline, { color: dashboardCardText }]}>{suggestion}</Text>
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
                  {savingsEstimate ? (
                    <View style={[styles.savingsBadge, { backgroundColor: savingsAccentBg }]}> 
                      <Text style={{ color: savingsAccent, fontSize: 12, fontWeight: '700' }}>💸 {savingsEstimate}</Text>
                    </View>
                  ) : null}
                  {whyItMatches ? (
                    <Text style={[styles.rowFootnote, { color: dashboardMutedText, marginTop: Spacing.two }]}>{whyItMatches}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.footer}>{getDevMenuHint()}</View>

            {Platform.OS === 'web' && <WebBadge />}
          </View>
        </ScrollView>
      </SafeAreaView>
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
  },
  headerIconWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    transform: [{ scale: 0.34 }],
  },
  headerTextGroup: {
    flex: 1,
    gap: 2,
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
  surpriseLink: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionCard: {
    borderRadius: Spacing.three,
    overflow: 'hidden',
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
  rowFootnote: {
    fontSize: 13,
    lineHeight: 18,
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
  },
  resultBody: {
    fontSize: 15,
    lineHeight: 21,
  },
  resultHeadline: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
  },
  nudgePointList: {
    marginTop: Spacing.two,
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
  footer: {
    alignItems: 'center',
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  savingsBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
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
});
