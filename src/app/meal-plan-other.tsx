import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useDiningPlan } from '@/context/dining-plan-context';
import { fetchWithRetry } from '@/utils/backend-fetch';
import { getBackendBaseUrl } from '@/utils/backend-url';
import { contrastColor } from '@/utils/theme-color';

type Params = {
  setupFlow?: string;
};

export default function MealPlanOtherScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<Params>();
  const { authToken, school, universityTheme, setConfiguredDiningSession, setDiningSessionConfigured, setDiningSystemSummary } = useDiningPlan();

  const background = universityTheme.background;
  const backgroundElement = universityTheme.backgroundElement;
  const setupFlow = typeof params.setupFlow === 'string' ? params.setupFlow : 'dashboard';

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
      const response = await fetchWithRetry(`${backendBaseUrl}/meal-plan/resolve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ school, plan_name: value }),
      }, { timeoutMs: 15000, retries: 1 });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Could not save custom meal plan.');
      }

      const resolvedPlan = (data.resolved_plan || value).toString();
      const summary = (data.summary || `Saved custom plan: ${resolvedPlan}`).toString();

      setConfiguredDiningSession(resolvedPlan);
      setDiningSessionConfigured(true);
      setDiningSystemSummary(summary);
      router.dismissTo({ pathname: '/(tabs)', params: { setupFlow } });
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
