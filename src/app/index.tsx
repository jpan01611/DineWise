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
  const [suggestion, setSuggestion] = React.useState<string | null>(null);

  const fetchNudge = async () => {
    try {
      const backendHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
      const response = await fetch(`http://${backendHost}:8000/nudge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balance: parseFloat(balance) || 0, craving }),
      });

      const data = await response.json();
      if (!response.ok) {
        const errorMessage = data.detail || data.message || JSON.stringify(data);
        throw new Error(errorMessage);
      }

      console.log('Backend response:', data);
      setSuggestion(data.suggestion ?? JSON.stringify(data));
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
            Welcome to&nbsp;Expo
          </ThemedText>
        </ThemedView>

        <ThemedText type="code" style={styles.code}>
          get started
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.stepContainer}>
          <HintRow
            title="Try editing"
            hint={<ThemedText type="code">src/app/index.tsx</ThemedText>}
          />
          <HintRow title="Dev tools" hint={getDevMenuHint()} />
          <HintRow
            title="Fresh start"
            hint={<ThemedText type="code">npm run reset-project</ThemedText>}
          />
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
            <Button title="Fetch Nudge" onPress={fetchNudge} />
            {suggestion ? (
              <ThemedView type="backgroundElement" style={styles.suggestionBox}>
                <ThemedText type="smallBold">Suggestion</ThemedText>
                <ThemedText>{suggestion}</ThemedText>
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
