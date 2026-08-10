import Constants from 'expo-constants';
import * as Device from 'expo-device';
import React from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, Colors, MaxContentWidth, Spacing } from '@/constants/theme';

const ERROR_COLOR = '#cc0000';
const MODAL_OVERLAY_COLOR = 'rgba(0,0,0,0.45)';

/** Resolves backend base URL, with EXPO_PUBLIC_API_URL taking precedence for device testing. */
function getBackendBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return envUrl.replace(/\/$/, '');
  }

  // On Expo Go, hostUri is "192.168.x.x:8081" — reuse that IP for backend port 8000
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest?.debuggerHost ?? '';
  if (hostUri) return `http://${hostUri.split(':')[0]}:8000`;
  if (Platform.OS === 'android') return 'http://10.0.2.2:8000';
  return 'http://localhost:8000';
}

type UTheme = { background: string; backgroundElement: string; text: string; logoUrl?: string | null };

/** Returns #000000 or #ffffff whichever is more readable on the given hex background. */
function contrastColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#ffffff';
}

function ThemedButton({
  title,
  onPress,
  disabled,
  theme,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  theme: UTheme;
}) {
  const bg = theme.background || '#333333';
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.7}>
      <View
        style={{
          backgroundColor: bg,
          opacity: disabled ? 0.4 : 1,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 8,
          alignItems: 'center' as const,
          width: '100%' as unknown as number,
        }}
      >
        <Text style={{ fontWeight: '600', fontSize: 15, color: contrastColor(bg) }}>
          {title}
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
  const [contact, setContact] = React.useState('');
  const [name, setName] = React.useState('');
  const [school, setSchool] = React.useState('');
  const [mealPlanType, setMealPlanType] = React.useState('Meal plan');
  const [deliveryService, setDeliveryService] = React.useState('');
  const [hasOnboarded, setHasOnboarded] = React.useState(false);

  const [universityTheme, setUniversityTheme] = React.useState<UTheme>({
    background: Colors.light.textSecondary,
    backgroundElement: Colors.light.background,
    text: Colors.light.text,
    logoUrl: null,
  });
  const [themeLoading, setThemeLoading] = React.useState(false);
  const [themeError, setThemeError] = React.useState<string | null>(null);
  const [diningSystems, setDiningSystems] = React.useState<string[]>([]);
  const [diningSystemSummary, setDiningSystemSummary] = React.useState('');
  const [diningSessionConfigured, setDiningSessionConfigured] = React.useState(false);
  const [configuredDiningSession, setConfiguredDiningSession] = React.useState<string | null>(null);
  const [planPickerVisible, setPlanPickerVisible] = React.useState(false);

  const [balance, setBalance] = React.useState('50.00');
  const [craving, setCraving] = React.useState('Burger');
  const [context, setContext] = React.useState('late-night study session');
  const [mealPlanStatus, setMealPlanStatus] = React.useState('dining dollars left');
  const [deliveryFrequency, setDeliveryFrequency] = React.useState('2–3 times a week');
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [savingsEstimate, setSavingsEstimate] = React.useState<string | null>(null);
  const [whyItMatches, setWhyItMatches] = React.useState<string | null>(null);

  const [onboardingStep, setOnboardingStep] = React.useState(0);
  const TOTAL_STEPS = 5;

  const handleOnboardingComplete = async () => {
    if (!school.trim()) {
      setThemeError('Please enter your school name.');
      return;
    }
    setThemeLoading(true);
    setThemeError(null);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(`${backendBaseUrl}/theme`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));
      setUniversityTheme({
        background: data.background,
        backgroundElement: data.backgroundElement,
        text: data.text,
        logoUrl: data.logo_url ?? null,
      });
      setDiningSystems(data.dining_systems ?? []);
      setDiningSystemSummary(data.dining_system_summary ?? '');
      setDiningSessionConfigured(false);
      setConfiguredDiningSession(null);
      setOnboardingStep(3); // advance past school step
    } catch (error: unknown) {
      const msg = error instanceof Error && error.name === 'AbortError'
        ? `Backend unreachable at ${getBackendBaseUrl()} — make sure it's running with --host 0.0.0.0`
        : String(error);
      setThemeError(msg);
    } finally {
      setThemeLoading(false);
    }
  };

  const onStepNext = async () => {
    setThemeError(null);
    if (onboardingStep === 2) {
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
      heading: 'Your meal plan',
      question: "What type of meal plan are you on?",
      placeholder: 'e.g. Unlimited, Block 150, Flex',
      value: mealPlanType,
      onChange: setMealPlanType,
      keyboardType: 'default' as const,
      autoCapitalize: 'words' as const,
    },
    {
      heading: 'Your delivery habit',
      question: "Which delivery app do you use most?",
      placeholder: 'e.g. DoorDash, Uber Eats, Grubhub',
      value: deliveryService,
      onChange: setDeliveryService,
      keyboardType: 'default' as const,
      autoCapitalize: 'words' as const,
    },
  ];

  const currentStep = STEPS[onboardingStep];
  const isLastStep = onboardingStep === TOTAL_STEPS - 1;
  const cardBg = universityTheme.backgroundElement;
  const pageBg = universityTheme.background;

  const setUpDiningSession = () => {
    if (diningSystems.length > 1) {
      setPlanPickerVisible(true);
    } else {
      setConfiguredDiningSession(diningSystems[0] ?? mealPlanType);
      setDiningSessionConfigured(true);
    }
  };

  const confirmDiningPlan = (plan: string) => {
    setConfiguredDiningSession(plan);
    setDiningSessionConfigured(true);
    setPlanPickerVisible(false);
  };

  const fetchNudge = async () => {
    try {
      const backendBaseUrl = getBackendBaseUrl();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(`${backendBaseUrl}/nudge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            balance: parseFloat(balance) || 0,
            craving,
            context,
            meal_plan_status: mealPlanStatus,
            delivery_frequency: deliveryFrequency,
            delivery_service: deliveryService || undefined,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.detail || data.message || JSON.stringify(data);
        throw new Error(errorMessage);
      }

      console.log('Backend response:', data);
      setSuggestion(data.suggestion ?? JSON.stringify(data));
      setSavingsEstimate(data.savings_estimate ?? null);
      setWhyItMatches(data.why_it_matches ?? null);
      Alert.alert('Success', 'Backend returned a suggestion.');
    } catch (error) {
      console.error('Connection failed:', error);
      Alert.alert('Connection failed', String(error));
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
                      ? contrastColor(pageBg)
                      : contrastColor(pageBg) + '40',
                  }}
                />
              ))}
            </View>
            <Text style={{ color: contrastColor(pageBg) + '99', fontSize: 12, marginTop: 6 }}>
              {onboardingStep + 1} of {TOTAL_STEPS}
            </Text>
          </View>

          {/* Hero */}
          <View style={[styles.heroSection, { flex: 0, paddingTop: Spacing.four, gap: Spacing.two }]}>
            {onboardingStep === 2 && universityTheme.logoUrl ? (
              <Image source={{ uri: universityTheme.logoUrl }} style={styles.logo} />
            ) : null}
            <Text style={{ fontSize: 26, fontWeight: '700', color: contrastColor(pageBg), textAlign: 'center' }}>
              {currentStep.heading}
            </Text>
            <Text style={{ fontSize: 15, color: contrastColor(pageBg) + 'cc', textAlign: 'center', maxWidth: 300 }}>
              {currentStep.question}
            </Text>
          </View>

          {/* Card */}
          <View style={[styles.stepContainer, { backgroundColor: cardBg }]}>
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
            {themeError ? (
              <Text style={{ color: ERROR_COLOR, fontSize: 13, marginTop: 4 }}>{themeError}</Text>
            ) : null}

            <View style={{ flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two }}>
              {onboardingStep > 0 && (
                <TouchableOpacity onPress={onStepBack} style={{ flex: 1 }}>
                  <View style={{
                    backgroundColor: contrastColor(cardBg) + '18',
                    paddingVertical: 12,
                    borderRadius: 8,
                    alignItems: 'center',
                  }}>
                    <Text style={{ fontWeight: '600', fontSize: 15, color: contrastColor(cardBg) }}>Back</Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onStepNext} disabled={themeLoading} style={{ flex: 2 }}>
                <View style={{
                  backgroundColor: pageBg,
                  opacity: themeLoading ? 0.5 : 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  alignItems: 'center',
                }}>
                  <Text style={{ fontWeight: '700', fontSize: 15, color: contrastColor(pageBg) }}>
                    {themeLoading ? 'Loading…' : isLastStep ? 'Get started' : 'Next →'}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: universityTheme.background }]}> 
      <SafeAreaView edges={["top", "left", "right"]} style={[styles.safeArea, { backgroundColor: universityTheme.background }]}> 
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={styles.mainScrollContent}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          decelerationRate="normal"
          bounces
          overScrollMode="always"
        >
          <View style={[styles.mainContent, Platform.OS === 'web' ? styles.mainContentWeb : styles.mainContentMobile]}>
            <ThemedView style={[styles.heroSection, { flex: 0 }]}>
              <AnimatedIcon />
              <ThemedText type="title" style={[styles.title, { color: contrastColor(universityTheme.background) }]}>
                DineWise
              </ThemedText>
              <ThemedText type="small" style={[styles.subtitle, { color: contrastColor(universityTheme.background) }]}>
                Helping students avoid wasted meal-plan dollars and unnecessary delivery costs.
              </ThemedText>
            </ThemedView>

            <ThemedView type="backgroundElement" style={[styles.stepContainer, { backgroundColor: universityTheme.backgroundElement }]}> 
              <HintRow title="Problem" hint={<ThemedText type="small">Delivery feels easy, but campus meal plans are often underused.</ThemedText>} />
              <HintRow title="Demo" hint={<ThemedText type="small">Enter a craving and context to see a smarter campus-food nudge.</ThemedText>} />
              <HintRow title="Dev tools" hint={getDevMenuHint()} />
              <View style={styles.form}>
                <TextInput
                  style={styles.input}
                  value={balance}
                  onChangeText={setBalance}
                  keyboardType="numeric"
                  placeholder="Meal balance"
                />
                <TextInput
                  style={styles.input}
                  value={craving}
                  onChangeText={setCraving}
                  placeholder="Craving"
                />
                <TextInput
                  style={styles.input}
                  value={context}
                  onChangeText={setContext}
                  placeholder="Context (e.g. late-night study)"
                />
                <TextInput
                  style={styles.input}
                  value={mealPlanStatus}
                  onChangeText={setMealPlanStatus}
                  placeholder="Meal plan status"
                />
                <TextInput
                  style={styles.input}
                  value={deliveryFrequency}
                  onChangeText={setDeliveryFrequency}
                  placeholder="Delivery frequency"
                />
                <ThemedButton title="Generate DineWise nudge" onPress={fetchNudge} theme={universityTheme} />
                {suggestion ? (
                  <View style={[styles.suggestionBox, { backgroundColor: universityTheme.background }]}> 
                    <Text style={[styles.themedButtonText, { color: contrastColor(universityTheme.background), marginBottom: 4 }]}>Suggestion</Text>
                    <Text style={{ color: contrastColor(universityTheme.background) }}>{suggestion}</Text>
                    {savingsEstimate ? <Text style={{ color: contrastColor(universityTheme.background), fontSize: 12, marginTop: 4 }}>{savingsEstimate}</Text> : null}
                    {whyItMatches ? <Text style={{ color: contrastColor(universityTheme.background), fontSize: 12, marginTop: 2 }}>{whyItMatches}</Text> : null}
                  </View>
                ) : null}
              </View>
            </ThemedView>

            <ThemedView type="backgroundElement" style={[styles.sessionPanel, { backgroundColor: universityTheme.backgroundElement }]}> 
              <ThemedText type="smallBold" style={{ color: contrastColor(universityTheme.backgroundElement) }}>Dining session</ThemedText>
              {diningSystemSummary ? <ThemedText type="small" style={{ color: contrastColor(universityTheme.backgroundElement) }}>{diningSystemSummary}</ThemedText> : null}
              {diningSystems.length ? (
                <ThemedText type="small" style={{ color: contrastColor(universityTheme.backgroundElement) }}>Available plans: {diningSystems.join(', ')}</ThemedText>
              ) : null}
              {diningSessionConfigured ? (
                <ThemedText type="smallBold" style={{ marginTop: Spacing.two, color: contrastColor(universityTheme.backgroundElement) }}>
                  Configured: {configuredDiningSession}
                </ThemedText>
              ) : (
                <View style={styles.sessionSetupRow}>
                  <ThemedText type="small">Your dining plan session is not set up yet.</ThemedText>
                  <ThemedButton title="Set up dining session" onPress={setUpDiningSession} theme={universityTheme} />
                </View>
              )}
            </ThemedView>

            {Platform.OS === 'web' && <WebBadge />}
          </View>
        </ScrollView>

        {/* Plan picker modal */}
        <Modal visible={planPickerVisible} transparent animationType="slide" onRequestClose={() => setPlanPickerVisible(false)}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, { backgroundColor: universityTheme.backgroundElement }]}>
              <Text style={[styles.modalTitle, { color: contrastColor(universityTheme.backgroundElement) }]}>Choose your dining plan</Text>
              {diningSystems.map((plan) => (
                <Pressable key={plan} style={[styles.planOption, { backgroundColor: universityTheme.background }]} onPress={() => confirmDiningPlan(plan)}>
                  <Text style={[styles.planOptionText, { color: contrastColor(universityTheme.background) }]}>{plan}</Text>
                </Pressable>
              ))}
              <Pressable style={styles.modalCancel} onPress={() => setPlanPickerVisible(false)}>
                <Text style={{ color: contrastColor(universityTheme.backgroundElement), textAlign: 'center' }}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </ThemedView>
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
  title: {
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    maxWidth: 320,
  },
  code: {
    textTransform: 'uppercase',
  },
  errorText: {
    marginBottom: Spacing.two,
    textAlign: 'center',
  },
  stepContainer: {
    gap: Spacing.three,
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.four,
    borderRadius: Spacing.four,
  },
  form: {
    gap: Spacing.three,
    marginTop: Spacing.four,
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
  sessionPanel: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
    marginTop: Spacing.three,
  },
  sessionSetupRow: {
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  suggestionBox: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  themedButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  themedButtonText: {
    fontWeight: '600',
    fontSize: 15,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: MODAL_OVERLAY_COLOR,
  },
  modalCard: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: Spacing.two,
    textAlign: 'center',
  },
  planOption: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
  planOptionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalCancel: {
    marginTop: Spacing.two,
    paddingVertical: Spacing.two,
  },
});
