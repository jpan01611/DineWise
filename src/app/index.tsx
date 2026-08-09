import * as Device from 'expo-device';
import React from 'react';
import { Alert, Button, Platform, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AnimatedIcon } from '@/components/animated-icon';
import { HintRow } from '@/components/hint-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WebBadge } from '@/components/web-badge';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

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
  const [balance, setBalance] = React.useState('50.00');
  const [craving, setCraving] = React.useState('Burger');
  const [context, setContext] = React.useState('late-night study session');
  const [mealPlanStatus, setMealPlanStatus] = React.useState('dining dollars left');
  const [deliveryFrequency, setDeliveryFrequency] = React.useState('2–3 times a week');
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [savingsEstimate, setSavingsEstimate] = React.useState<string | null>(null);
  const [whyItMatches, setWhyItMatches] = React.useState<string | null>(null);

  const fetchNudge = async () => {
    try {
      const backendHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
      const response = await fetch(`http://${backendHost}:8000/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          balance: parseFloat(balance) || 0,
          craving,
          context,
          meal_plan_status: mealPlanStatus,
          delivery_frequency: deliveryFrequency,
        }),
      });

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

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView style={styles.heroSection}>
          <AnimatedIcon />
          <ThemedText type="title" style={styles.title}>
            DineWise
          </ThemedText>
          <ThemedText type="small" style={styles.subtitle}>
            Helping students avoid wasted meal-plan dollars and unnecessary delivery costs.
          </ThemedText>
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
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
            <Button title="Generate DineWise nudge" onPress={fetchNudge} />
            {suggestion ? (
              <ThemedView type="backgroundElement" style={styles.suggestionBox}>
                <ThemedText type="smallBold">Suggestion</ThemedText>
                <ThemedText>{suggestion}</ThemedText>
                {savingsEstimate ? <ThemedText type="small">{savingsEstimate}</ThemedText> : null}
                {whyItMatches ? <ThemedText type="small">{whyItMatches}</ThemedText> : null}
              </ThemedView>
            ) : null}
          </View>
        </ThemedView>

        {Platform.OS === 'web' && <WebBadge />}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
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
    borderColor: '#ccc',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: '#fff',
  },
  suggestionBox: {
    padding: Spacing.three,
    borderRadius: Spacing.two,
    backgroundColor: '#f2f5ff',
    borderColor: '#c5d1ff',
    borderWidth: 1,
  },
});
