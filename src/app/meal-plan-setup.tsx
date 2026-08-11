import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { contrastColor, normalizeHex } from '@/utils/theme-color';

type Params = {
  school?: string;
  plans?: string;
  backgroundHex?: string;
  backgroundElementHex?: string;
  setupFlow?: string;
};

function parsePlans(rawPlans?: string): string[] {
  if (!rawPlans) return [];
  try {
    const parsed = JSON.parse(rawPlans);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export default function MealPlanSetupScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();

  const school = typeof params.school === 'string' ? params.school : '';
  const background = normalizeHex(typeof params.backgroundHex === 'string' ? params.backgroundHex : undefined);
  const backgroundElement = normalizeHex(typeof params.backgroundElementHex === 'string' ? params.backgroundElementHex : undefined);
  const setupFlow = typeof params.setupFlow === 'string' ? params.setupFlow : 'dashboard';

  if (!background || !backgroundElement) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Meal plan setup unavailable</Text>
          <Text style={styles.errorBody}>Theme data is missing. Go back and fetch your school data again.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const basePlans = React.useMemo(() => parsePlans(typeof params.plans === 'string' ? params.plans : undefined), [params.plans]);

  const options = React.useMemo(() => {
    const merged = [...basePlans];
    const deduped = Array.from(new Set(merged.map((item) => item.trim()).filter(Boolean)));
    return [...deduped, 'Other'];
  }, [basePlans]);

  const [selectedPlan, setSelectedPlan] = React.useState<string | null>(options[0] ?? null);

  React.useEffect(() => {
    if (!selectedPlan || !options.includes(selectedPlan)) {
      setSelectedPlan(options[0] ?? null);
    }
  }, [options, selectedPlan]);

  const onContinue = () => {
    if (!selectedPlan) return;

    if (selectedPlan === 'Other') {
      router.push({
        pathname: '/meal-plan-other',
        params: {
          school,
          backgroundHex: background.replace('#', ''),
          backgroundElementHex: backgroundElement.replace('#', ''),
          setupFlow,
        },
      });
      return;
    }

    router.replace({
      pathname: '/(tabs)',
      params: {
        configuredPlan: selectedPlan,
        configuredSummary: school
          ? `Saved from ${school} meal plan options.`
          : 'Saved from suggested meal plan options.',
        setupFlow,
      },
    });
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]}> 
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: backgroundElement }]}> 
          <Text style={[styles.title, { color: contrastColor(backgroundElement) }]}>Configure meal plan</Text>
          <Text style={[styles.subtitle, { color: contrastColor(backgroundElement) + 'cc' }]}>
            {school ? `Select the meal plan you use at ${school}.` : 'Select the meal plan you use.'}
          </Text>
          {!basePlans.length ? (
            <Text style={[styles.subtitle, { color: contrastColor(backgroundElement) + 'b3' }]}>No plans were returned for this school. Choose Other to enter your exact plan.</Text>
          ) : null}

          <Text style={[styles.label, { color: contrastColor(backgroundElement) }]}>Meal plan option</Text>
          <View style={[styles.optionsList, { borderColor: contrastColor(backgroundElement) + '35' }]}>
            {options.map((option) => {
              const isSelected = option === selectedPlan;
              return (
                <Pressable
                  key={option}
                  style={styles.optionRow}
                  onPress={() => setSelectedPlan(option)}>
                  <Text style={{ color: contrastColor(backgroundElement), fontWeight: isSelected ? '700' : '500' }}>
                    {option}
                  </Text>
                  <Text style={{ color: contrastColor(backgroundElement), fontWeight: '700' }}>
                    {isSelected ? '✓' : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: background, opacity: selectedPlan ? 1 : 0.5 }]}
            onPress={onContinue}
            disabled={!selectedPlan}>
            <Text style={[styles.primaryButtonText, { color: contrastColor(background) }]}>Continue</Text>
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
    gap: Spacing.two,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
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
