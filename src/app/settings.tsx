import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { STARTUP_UNIVERSITY_THEME, useDiningPlan, type StudentLevel } from '@/context/dining-plan-context';
import { fetchWithRetry } from '@/utils/backend-fetch';
import { getBackendBaseUrl } from '@/utils/backend-url';
import { contrastColor } from '@/utils/theme-color';

const DELIVERY_SERVICE_OPTIONS: readonly string[] = [
  'DoorDash',
  'Uber Eats',
  'Grubhub',
  'Postmates',
  'Instacart',
  'Other',
];

const STUDENT_LEVEL_OPTIONS: readonly StudentLevel[] = ['undergraduate', 'graduate'];

export default function SettingsScreen() {
  const router = useRouter();
  const {
    authUsername,
    authToken,
    setAuthToken,
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
    setDiningSystems,
    setDiningSystemSummary,
    setDiningSessionConfigured,
    setConfiguredDiningSession,
    configuredDiningSession,
    diningSessionConfigured,
  } = useDiningPlan();

  const [refreshingTheme, setRefreshingTheme] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);

  const pageBg = universityTheme.background || Colors.light.textSecondary;
  const cardBg = universityTheme.backgroundElement || Colors.light.background;
  const pageText = contrastColor(pageBg);
  const cardText = contrastColor(cardBg);
  const mutedText = cardText + 'b3';

  const refreshUniversityData = async () => {
    if (!school.trim()) {
      setRefreshError('Enter your university first.');
      return;
    }

    setRefreshingTheme(true);
    setRefreshError(null);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error('Backend URL unavailable.');
      }

      const response = await fetchWithRetry(`${backendBaseUrl}/theme`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ school: school.trim(), student_level: studentLevel }),
      }, { timeoutMs: 20000, retries: 2 });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || JSON.stringify(data));

      const backgroundCandidate = String(data.background || universityTheme.background);
      const alternativeBackground = String(data.secondary || data.backgroundElement || universityTheme.backgroundElement);
      const prefersAlternative = /^#?0{6}$/i.test(backgroundCandidate) || /^#?111111$/i.test(backgroundCandidate);
      const nextBackground = prefersAlternative && alternativeBackground ? alternativeBackground : backgroundCandidate;

      setUniversityTheme({
        background: nextBackground,
        backgroundElement: data.backgroundElement || data.secondary || universityTheme.backgroundElement,
        secondary: data.secondary || data.backgroundElement || universityTheme.secondary,
        tertiary: data.tertiary || data.secondary || data.backgroundElement || universityTheme.tertiary,
        text: data.text || universityTheme.text,
        logoUrl: data.logo_url ?? null,
      });
      setDiningSystems(data.dining_systems ?? []);
      // Reconfiguring school/theme invalidates previously selected plan.
      setConfiguredDiningSession(null);
      setDiningSessionConfigured(false);
      setDiningSystemSummary(data.dining_system_summary ?? '');
    } catch (error) {
      setRefreshError(String(error));
    } finally {
      setRefreshingTheme(false);
    }
  };

  const signOut = () => {
    setAuthToken(null);
    setAuthUsername('');
    router.dismissTo('/(tabs)');
  };

  const clearLocalProfileState = () => {
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
    setUniversityTheme(STARTUP_UNIVERSITY_THEME);
  };

  const deleteAccount = async () => {
    if (!authToken) {
      signOut();
      return;
    }

    setDeleteLoading(true);
    try {
      const backendBaseUrl = getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error('Backend URL unavailable.');
      }

      const response = await fetchWithRetry(`${backendBaseUrl}/auth/account`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      }, { timeoutMs: 15000, retries: 1 });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || data.message || JSON.stringify(data));
      }

      clearLocalProfileState();
      setAuthToken(null);
      setAuthUsername('');
      Alert.alert('Account deleted', 'Your account and saved session were removed.');
      router.dismissTo('/(tabs)');
    } catch (error) {
      Alert.alert('Delete failed', String(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'Delete account?',
      'This permanently removes your account and all saved sessions on this backend.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteAccount },
      ]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: pageBg }]}> 
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: pageText }]}>Settings</Text>
          <Pressable style={[styles.doneButton, { backgroundColor: pageText + '1a' }]} onPress={() => router.back()}>
            <Text style={[styles.doneButtonText, { color: pageText }]}>Done</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: cardText }]}>Account</Text>
          <Text style={[styles.detailLine, { color: mutedText }]}>Signed in as</Text>
          <Text style={[styles.detailValue, { color: cardText }]}>{authUsername || 'Unknown account'}</Text>

          <Pressable
            style={[styles.logoutButton, { borderColor: cardText + '35', backgroundColor: cardText + '0d' }]}
            onPress={signOut}>
            <Text style={[styles.logoutText, { color: cardText }]}>Sign out</Text>
          </Pressable>

          <Pressable
            style={[
              styles.deleteButton,
              {
                borderColor: '#DC2626',
                backgroundColor: 'rgba(220, 38, 38, 0.12)',
                opacity: deleteLoading ? 0.6 : 1,
              },
            ]}
            onPress={confirmDeleteAccount}
            disabled={deleteLoading}
          >
            <Text style={styles.deleteText}>{deleteLoading ? 'Deleting...' : 'Delete account'}</Text>
          </Pressable>

          <Text style={[styles.dangerHint, { color: mutedText }]}>
            Danger zone: deleting your account removes your backend login and server-side sessions. You will be signed out on this device.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: cardText }]}>Profile</Text>

          <Text style={[styles.label, { color: mutedText }]}>Name</Text>
          <TextInput
            style={[styles.input, { color: cardText, borderColor: cardText + '3a', backgroundColor: cardText + '0a' }]}
            value={name}
            onChangeText={setName}
            placeholder="Your first name"
            placeholderTextColor={mutedText}
            autoCapitalize="words"
          />

          <Text style={[styles.label, { color: mutedText }]}>Contact</Text>
          <TextInput
            style={[styles.input, { color: cardText, borderColor: cardText + '3a', backgroundColor: cardText + '0a' }]}
            value={contact}
            onChangeText={setContact}
            placeholder="Email or phone"
            placeholderTextColor={mutedText}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: cardText }]}>University</Text>

          <Text style={[styles.label, { color: mutedText }]}>School</Text>
          <TextInput
            style={[styles.input, { color: cardText, borderColor: cardText + '3a', backgroundColor: cardText + '0a' }]}
            value={school}
            onChangeText={setSchool}
            placeholder="e.g. NYU, UC Berkeley"
            placeholderTextColor={mutedText}
            autoCapitalize="words"
          />

          <Text style={[styles.label, { color: mutedText }]}>Student level</Text>
          <View style={styles.rowWrap}>
            {STUDENT_LEVEL_OPTIONS.map((level) => {
              const selected = studentLevel === level;
              return (
                <Pressable
                  key={level}
                  style={[
                    styles.pill,
                    {
                      borderColor: selected ? cardText : cardText + '35',
                      backgroundColor: selected ? cardText + '18' : 'transparent',
                    },
                  ]}
                  onPress={() => setStudentLevel(level)}>
                  <Text style={{ color: cardText, fontWeight: selected ? '700' : '500', textTransform: 'capitalize' }}>
                    {level}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: pageBg, opacity: refreshingTheme ? 0.6 : 1 }]}
            onPress={refreshUniversityData}
            disabled={refreshingTheme}>
            <Text style={[styles.primaryButtonText, { color: contrastColor(pageBg) }]}>
              {refreshingTheme ? 'Refreshing…' : 'Refresh university meal plans + theme'}
            </Text>
          </Pressable>

          {refreshError ? (
            <Text style={styles.errorText}>{refreshError}</Text>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: cardText }]}>Meal plan</Text>
          <Text style={[styles.detailLine, { color: mutedText }]}>Current plan</Text>
          <Text style={[styles.detailValue, { color: cardText }]}> 
            {diningSessionConfigured && configuredDiningSession ? configuredDiningSession : 'Not configured yet'}
          </Text>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: pageBg }]}
            onPress={() => router.push({ pathname: '/meal-plan-setup', params: { setupFlow: 'dashboard' } })}>
            <Text style={[styles.primaryButtonText, { color: contrastColor(pageBg) }]}>Configure meal plan</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: cardText }]}>Delivery</Text>
          <Text style={[styles.label, { color: mutedText }]}>Primary app</Text>

          <View style={styles.rowWrap}>
            {DELIVERY_SERVICE_OPTIONS.map((option) => {
              const selected = deliveryService === option;
              return (
                <Pressable
                  key={option}
                  style={[
                    styles.pill,
                    {
                      borderColor: selected ? cardText : cardText + '35',
                      backgroundColor: selected ? cardText + '18' : 'transparent',
                    },
                  ]}
                  onPress={() => {
                    setDeliveryService(option);
                    if (option !== 'Other') {
                      setCustomDeliveryService('');
                    }
                  }}>
                  <Text style={{ color: cardText, fontWeight: selected ? '700' : '500' }}>{option}</Text>
                </Pressable>
              );
            })}
          </View>

          {deliveryService === 'Other' ? (
            <TextInput
              style={[styles.input, { color: cardText, borderColor: cardText + '3a', backgroundColor: cardText + '0a' }]}
              value={customDeliveryService}
              onChangeText={setCustomDeliveryService}
              placeholder="Type your delivery app"
              placeholderTextColor={mutedText}
              autoCapitalize="words"
            />
          ) : null}
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
    padding: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.five,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
  },
  doneButton: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one + 2,
    borderRadius: 999,
  },
  doneButtonText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    fontSize: 15,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  pill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 4,
  },
  primaryButton: {
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 2,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
  },
  errorText: {
    color: '#cc0000',
    fontSize: 13,
  },
  detailLine: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  detailValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  logoutButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
  },
  deleteButton: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  deleteText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
  dangerHint: {
    fontSize: 12,
    lineHeight: 17,
  },
});
