import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useDiningPlan, type StudentLevel } from '@/context/dining-plan-context';
import { fetchWithRetry } from '@/utils/backend-fetch';
import { getBackendBaseUrl } from '@/utils/backend-url';
import { contrastColor } from '@/utils/theme-color';

const LATER_OPTION = "I'll add it later";
const STUDENT_LEVEL_OPTIONS: readonly StudentLevel[] = ['undergraduate', 'graduate'];

type Params = {
  setupFlow?: string;
};

export default function MealPlanSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const {
    school,
    studentLevel,
    setStudentLevel,
    universityTheme,
    diningSystems,
    setDiningSystems,
    configuredDiningSession,
    setConfiguredDiningSession,
    setDiningSessionConfigured,
    setDiningSystemSummary,
  } = useDiningPlan();

  const [levelRefreshing, setLevelRefreshing] = React.useState(false);
  const [levelError, setLevelError] = React.useState<string | null>(null);

  const setupFlow = typeof params.setupFlow === 'string' ? params.setupFlow : 'dashboard';
  const background = universityTheme.background;
  const backgroundElement = universityTheme.backgroundElement;

  const options = React.useMemo(() => {
    const deduped = Array.from(new Set(diningSystems.map((item) => item.trim()).filter(Boolean)));
    return [...deduped, LATER_OPTION, 'Other'];
  }, [diningSystems]);

  const [selectedPlan, setSelectedPlan] = React.useState<string | null>(() => {
    if (configuredDiningSession && options.includes(configuredDiningSession)) return configuredDiningSession;
    return options[0] ?? null;
  });
  const [dropdownOpen, setDropdownOpen] = React.useState(false);

  React.useEffect(() => {
    if (!selectedPlan || !options.includes(selectedPlan)) {
      setSelectedPlan(options[0] ?? null);
    }
    // Only re-derive the default selection when the available options change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  const onContinue = () => {
    if (!selectedPlan) return;

    if (selectedPlan === 'Other') {
      router.push({
        pathname: '/meal-plan-other',
        params: { setupFlow },
      });
      return;
    }

    if (selectedPlan === LATER_OPTION) {
      setConfiguredDiningSession(null);
      setDiningSessionConfigured(false);
      setDiningSystemSummary('');
      router.dismissTo({ pathname: '/(tabs)', params: { setupFlow } });
      return;
    }

    setConfiguredDiningSession(selectedPlan);
    setDiningSessionConfigured(true);
    setDiningSystemSummary(
      school ? `Saved from ${school} meal plan options.` : 'Saved from suggested meal plan options.'
    );
    router.dismissTo({ pathname: '/(tabs)', params: { setupFlow } });
  };

  const onSelectLevel = async (level: StudentLevel) => {
    if (level === studentLevel) return;
    setStudentLevel(level);
    if (!school.trim()) return;

    setLevelRefreshing(true);
    setLevelError(null);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error('Backend URL unavailable.');
      }
      const response = await fetchWithRetry(`${backendBaseUrl}/theme`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ school, student_level: level }),
      }, { timeoutMs: 20000, retries: 2 });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));
      setDiningSystems(data.dining_systems ?? []);
    } catch (error) {
      setLevelError(String(error));
    } finally {
      setLevelRefreshing(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]}> 
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: backgroundElement }]}> 
          <Text style={[styles.title, { color: contrastColor(backgroundElement) }]}>Configure meal plan</Text>
          <Text style={[styles.subtitle, { color: contrastColor(backgroundElement) + 'cc' }]}>
            {school ? `Select the meal plan you use at ${school}.` : 'Select the meal plan you use.'}
          </Text>
          {!diningSystems.length ? (
            <Text style={[styles.subtitle, { color: contrastColor(backgroundElement) + 'b3' }]}>No plans were returned for this school. Choose Other to enter your exact plan.</Text>
          ) : null}

          <Text style={[styles.label, { color: contrastColor(backgroundElement) }]}>Student level</Text>
          <Text style={[styles.subtitle, { color: contrastColor(backgroundElement) + 'b3' }]}>
            Some schools offer different meal plans for undergrads and grad students.
          </Text>
          <View style={{ flexDirection: 'row', gap: Spacing.two }}>
            {STUDENT_LEVEL_OPTIONS.map((level) => {
              const isSelected = studentLevel === level;
              return (
                <Pressable
                  key={level}
                  style={[
                    styles.levelOption,
                    {
                      borderColor: isSelected ? contrastColor(backgroundElement) : contrastColor(backgroundElement) + '35',
                      backgroundColor: isSelected ? contrastColor(backgroundElement) + '18' : 'transparent',
                    },
                  ]}
                  onPress={() => onSelectLevel(level)}>
                  <Text style={{ color: contrastColor(backgroundElement), fontWeight: isSelected ? '700' : '500', textTransform: 'capitalize' }}>
                    {level}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {levelRefreshing ? (
            <Text style={[styles.subtitle, { color: contrastColor(backgroundElement) + 'b3' }]}>Refreshing plans…</Text>
          ) : null}
          {levelError ? (
            <Text style={{ color: '#cc0000', fontSize: 13 }}>{levelError}</Text>
          ) : null}

          <Text style={[styles.label, { color: contrastColor(backgroundElement) }]}>Meal plan option</Text>
          <Pressable
            style={[styles.dropdownTrigger, { borderColor: contrastColor(backgroundElement) + '35' }]}
            onPress={() => setDropdownOpen((open) => !open)}>
            <Text style={{ color: contrastColor(backgroundElement), fontWeight: selectedPlan ? '700' : '500' }}>
              {selectedPlan || 'Select an option'}
            </Text>
            <Text style={{ color: contrastColor(backgroundElement), fontWeight: '700' }}>
              {dropdownOpen ? '▲' : '▼'}
            </Text>
          </Pressable>

          {dropdownOpen ? (
            <View style={[styles.optionsList, { borderColor: contrastColor(backgroundElement) + '35' }]}>
              {options.map((option) => {
                const isSelected = option === selectedPlan;
                return (
                  <Pressable
                    key={option}
                    style={styles.optionRow}
                    onPress={() => {
                      setSelectedPlan(option);
                      setDropdownOpen(false);
                    }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: contrastColor(backgroundElement), fontWeight: isSelected ? '700' : '500' }}>
                        {option}
                      </Text>
                      {option === LATER_OPTION ? (
                        <Text style={{ color: contrastColor(backgroundElement) + '99', fontSize: 12, marginTop: 2 }}>
                          Skip for now — add it anytime from Edit meal plan on the home screen.
                        </Text>
                      ) : null}
                    </View>
                    <Text style={{ color: contrastColor(backgroundElement), fontWeight: '700' }}>
                      {isSelected ? '✓' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <Pressable
            style={[styles.primaryButton, { backgroundColor: background, opacity: selectedPlan ? 1 : 0.5 }]}
            onPress={onContinue}
            disabled={!selectedPlan}>
            <Text style={[styles.primaryButtonText, { color: contrastColor(background) }]}>
              {selectedPlan === LATER_OPTION ? 'Skip for now' : 'Continue'}
            </Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={[styles.secondaryText, { color: contrastColor(backgroundElement) }]}>Back</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: Spacing.three,
    justifyContent: 'center',
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
  },
  levelOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
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
  optionsList: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  primaryButton: {
    marginTop: Spacing.one,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: Spacing.two,
  },
  secondaryText: {
    fontSize: 14,
    fontWeight: '600',
  },
  optionRow: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.35)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
