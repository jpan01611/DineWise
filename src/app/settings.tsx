import { useLocalSearchParams, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { STARTUP_UNIVERSITY_THEME, useDiningPlan, type StudentLevel } from '@/context/dining-plan-context';
import { fetchWithRetry } from '@/utils/backend-fetch';
import { getBackendBaseUrl } from '@/utils/backend-url';
import { confirmDestructive, showAlert } from '@/utils/dialog';
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
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scrollRef = React.useRef<ScrollView>(null);
  const mealPlanOffsetRef = React.useRef(0);
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
    planBalance,
    setPlanBalance,
    planDaysLeft,
    setPlanDaysLeft,
    campusSpots,
    setCampusSpots,
    setLastCraving,
    setLastContext,
  } = useDiningPlan();

  const [refreshingTheme, setRefreshingTheme] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = React.useState(false);
  const [spotName, setSpotName] = React.useState('');
  const [spotOpens, setSpotOpens] = React.useState('');
  const [spotCloses, setSpotCloses] = React.useState('');
  const [spotWalk, setSpotWalk] = React.useState('');
  const [spotCost, setSpotCost] = React.useState('');
  const [spotCovered, setSpotCovered] = React.useState(true);

  const addCampusSpot = () => {
    if (!spotName.trim() || !spotOpens.trim() || !spotCloses.trim()) {
      showAlert('Missing details', 'Add a name plus opening and closing times.');
      return;
    }

    setCampusSpots((prev) => [
      ...prev,
      {
        id: `${Date.now()}`,
        name: spotName.trim(),
        opensAt: spotOpens.trim(),
        closesAt: spotCloses.trim(),
        walkMinutes: spotWalk.trim(),
        coveredByPlan: spotCovered,
        estimatedCost: spotCost.trim(),
      },
    ]);
    setSpotName('');
    setSpotOpens('');
    setSpotCloses('');
    setSpotWalk('');
    setSpotCost('');
    setSpotCovered(true);
  };

  // Deep links from the dashboard land directly on the section the student tapped.
  React.useEffect(() => {
    if (focus !== 'meal-plan') return;

    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, mealPlanOffsetRef.current - Spacing.three), animated: true });
    }, 220);

    return () => clearTimeout(timer);
  }, [focus]);

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

      setUniversityTheme({
        background: String(data.background || universityTheme.background),
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
    setPlanBalance('');
    setPlanDaysLeft('');
    setCampusSpots([]);
    setLastCraving('');
    setLastContext('');
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
      showAlert('Account deleted', 'Your account and saved session were removed.');
      router.dismissTo('/(tabs)');
    } catch (error) {
      showAlert('Delete failed', String(error));
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDeleteAccount = () => {
    confirmDestructive(
      'Delete account?',
      'This permanently removes your account and all saved sessions on this backend.',
      'Delete',
      deleteAccount
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: pageBg }]}> 
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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

        <View
          style={[styles.card, { backgroundColor: cardBg }]}
          onLayout={(event) => {
            mealPlanOffsetRef.current = event.nativeEvent.layout.y;
          }}>
          <Text style={[styles.sectionTitle, { color: cardText }]}>Meal plan</Text>
          <Text style={[styles.detailLine, { color: mutedText }]}>Current plan</Text>
          <Text style={[styles.detailValue, { color: cardText }]}> 
            {diningSessionConfigured && configuredDiningSession ? configuredDiningSession : 'Not configured yet'}
          </Text>

          <Text style={[styles.label, { color: mutedText }]}>Balance remaining ($)</Text>
          <TextInput
            style={[styles.input, { color: cardText, borderColor: cardText + '35' }]}
            value={planBalance}
            onChangeText={setPlanBalance}
            keyboardType="numeric"
            placeholder="e.g. 225"
            placeholderTextColor={mutedText}
          />

          <Text style={[styles.label, { color: mutedText }]}>Days left in term</Text>
          <TextInput
            style={[styles.input, { color: cardText, borderColor: cardText + '35' }]}
            value={planDaysLeft}
            onChangeText={setPlanDaysLeft}
            keyboardType="numeric"
            placeholder="e.g. 28"
            placeholderTextColor={mutedText}
          />

          <Pressable
            style={[styles.primaryButton, { backgroundColor: pageBg }]}
            onPress={() => router.push({ pathname: '/meal-plan-setup', params: { setupFlow: 'dashboard' } })}>
            <Text style={[styles.primaryButtonText, { color: contrastColor(pageBg) }]}>Configure meal plan</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: cardBg }]}>
          <Text style={[styles.sectionTitle, { color: cardText }]}>Campus spots</Text>
          <Text style={[styles.detailLine, { color: mutedText }]}>
            Add the places you actually use. DineWise only names spots you add here, so hours stay accurate.
          </Text>
          {campusSpots.length >= 3 ? (
            <Text style={[styles.detailValue, { color: cardText }]}>✓ You&apos;re all set</Text>
          ) : null}

          {campusSpots.map((spot) => (
            <View key={spot.id} style={[styles.spotRow, { borderColor: cardText + '25' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.detailValue, { color: cardText }]} numberOfLines={1}>{spot.name}</Text>
                <Text style={[styles.detailLine, { color: mutedText }]}>
                  {spot.opensAt} - {spot.closesAt}
                  {spot.walkMinutes ? ` · ${spot.walkMinutes} min walk` : ''}
                  {spot.coveredByPlan ? ' · meal plan' : spot.estimatedCost ? ` · $${spot.estimatedCost}` : ' · out of pocket'}
                </Text>
              </View>
              <Pressable
                onPress={() => setCampusSpots((prev) => prev.filter((item) => item.id !== spot.id))}
                style={[styles.pill, { borderColor: cardText + '35' }]}>
                <Text style={{ color: cardText, fontWeight: '600' }}>Remove</Text>
              </Pressable>
            </View>
          ))}

          <Text style={[styles.label, { color: mutedText }]}>Add a spot</Text>
          <TextInput
            style={[styles.input, { color: cardText, borderColor: cardText + '35' }]}
            value={spotName}
            onChangeText={setSpotName}
            placeholder="Name (e.g. South Quad Dining)"
            placeholderTextColor={mutedText}
          />
          <View style={styles.spotInputRow}>
            <TextInput
              style={[styles.input, styles.spotInputCell, { color: cardText, borderColor: cardText + '35' }]}
              value={spotOpens}
              onChangeText={setSpotOpens}
              placeholder="Opens 7:00 AM"
              placeholderTextColor={mutedText}
            />
            <TextInput
              style={[styles.input, styles.spotInputCell, { color: cardText, borderColor: cardText + '35' }]}
              value={spotCloses}
              onChangeText={setSpotCloses}
              placeholder="Closes 11:00 PM"
              placeholderTextColor={mutedText}
            />
          </View>
          <View style={styles.spotInputRow}>
            <TextInput
              style={[styles.input, styles.spotInputCell, { color: cardText, borderColor: cardText + '35' }]}
              value={spotWalk}
              onChangeText={setSpotWalk}
              keyboardType="numeric"
              placeholder="Walk (min)"
              placeholderTextColor={mutedText}
            />
            <TextInput
              style={[styles.input, styles.spotInputCell, { color: cardText, borderColor: cardText + '35' }]}
              value={spotCost}
              onChangeText={setSpotCost}
              keyboardType="numeric"
              placeholder="Typical $ (if not covered)"
              placeholderTextColor={mutedText}
            />
          </View>

          <Pressable
            onPress={() => setSpotCovered((value) => !value)}
            style={[
              styles.pill,
              {
                borderColor: spotCovered ? cardText : cardText + '35',
                backgroundColor: spotCovered ? cardText + '18' : 'transparent',
              },
            ]}>
            <Text style={{ color: cardText, fontWeight: spotCovered ? '700' : '500' }}>
              {spotCovered ? '✓ Meal plan covers it' : 'Meal plan covers it'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.primaryButton, { backgroundColor: pageBg }]}
            onPress={addCampusSpot}>
            <Text style={[styles.primaryButtonText, { color: contrastColor(pageBg) }]}>Add campus spot</Text>
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
  spotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.two,
  },
  spotInputRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  spotInputCell: {
    flex: 1,
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
