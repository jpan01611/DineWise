import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { getBackendBaseUrl } from '@/utils/backend-url';
import { contrastColor, normalizeHex } from '@/utils/theme-color';

type Params = {
  school?: string;
  backgroundHex?: string;
  backgroundElementHex?: string;
  setupFlow?: string;
};

export default function MealPlanOtherScreen() {
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
          <Text style={styles.errorTitle}>Custom meal plan unavailable</Text>
          <Text style={styles.errorBody}>Theme data is missing. Go back and fetch your school data again.</Text>
          <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
            <Text style={styles.secondaryText}>Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const [customPlan, setCustomPlan] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const saveCustomPlan = async () => {
    const value = customPlan.trim();
    if (!value) {
      Alert.alert('Missing input', 'Please enter your meal plan name first.');
      return;
    }

    setLoading(true);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error('Backend URL unavailable. Set EXPO_PUBLIC_API_URL or relaunch Expo so host metadata is available.');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      let response: Response;
      try {
        response = await fetch(`${backendBaseUrl}/meal-plan/resolve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ school, plan_name: value }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Could not save custom meal plan.');
      }

      const resolvedPlan = (data.resolved_plan || value).toString();
      const summary = (data.summary || `Saved custom plan: ${resolvedPlan}`).toString();

      router.replace({
        pathname: '/(tabs)',
        params: {
          configuredPlan: resolvedPlan,
          configuredSummary: summary,
          setupFlow,
        },
      });
    } catch (error) {
      Alert.alert('Save failed', String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: background }]}> 
      <View style={[styles.card, { backgroundColor: backgroundElement }]}> 
        <Text style={[styles.title, { color: contrastColor(backgroundElement) }]}>Custom meal plan</Text>
        <Text style={[styles.subtitle, { color: contrastColor(backgroundElement) + 'cc' }]}>
          Enter your plan name. We will check internet sources and save a smarter label/summary.
        </Text>

        <TextInput
          value={customPlan}
          onChangeText={setCustomPlan}
          placeholder="e.g. Scarlet 120"
          style={styles.input}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={saveCustomPlan}
        />

        <Pressable style={[styles.primaryButton, { backgroundColor: background }]} onPress={saveCustomPlan} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={contrastColor(background)} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: contrastColor(background) }]}>Save settings</Text>
          )}
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={[styles.secondaryText, { color: contrastColor(backgroundElement) }]}>Back</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.three,
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
  input: {
    borderWidth: 1,
    borderColor: '#d4d4d4',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    backgroundColor: '#ffffff',
    fontSize: 16,
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
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
});
