import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useDiningPlan } from '@/context/dining-plan-context';
import { contrastColor } from '@/utils/theme-color';

export default function MeterDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    score?: string;
    band?: string;
    weeklyWaste?: string;
    move?: string;
    budgetLine?: string;
    paceLine?: string;
  }>();

  const { universityTheme } = useDiningPlan();
  const pageBg = universityTheme.background;
  const cardBg = universityTheme.backgroundElement;
  const pageText = contrastColor(pageBg);
  const cardText = contrastColor(cardBg);
  const muted = cardText + 'b3';

  const score = Number.parseFloat(params.score || '0') || 0;
  const scoreClamped = Math.max(0, Math.min(100, Math.round(score)));
  const band = (params.band || 'Moderate').toString();
  const weeklyWaste = Number.parseFloat(params.weeklyWaste || '0') || 0;
  const move = (params.move || 'Use campus dining today.').toString();
  const budgetLine = (params.budgetLine || 'Set your budget outside meal plan to track your spending.').toString();
  const paceLine = (params.paceLine || 'Add a budget to see your daily pace.').toString();

  return (
    <View style={[styles.container, { backgroundColor: pageBg }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
              <View style={[styles.backPill, { backgroundColor: pageText + '18' }]}>
                <Text style={[styles.backText, { color: pageText }]}>‹ Back</Text>
              </View>
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: pageText }]}>Meter details</Text>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg }]}> 
            <Text style={[styles.scoreLabel, { color: muted }]}>Spend pressure</Text>
            <Text style={[styles.scoreValue, { color: cardText }]}>{scoreClamped}%</Text>
            <View style={[styles.bandPill, { backgroundColor: cardText + '12' }]}> 
              <Text style={[styles.bandText, { color: cardText }]}>{band}</Text>
            </View>
            <Text style={[styles.detailCopy, { color: muted }]}>This is a risk score, not your account balance.</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>0% means very low risk of wasting value this week. 100% means very high risk.</Text>
            <View style={[styles.scaleRow, { borderColor: cardText + '1f' }]}>
              <Text style={[styles.scaleText, { color: muted }]}>0-24% Low</Text>
              <Text style={[styles.scaleText, { color: muted }]}>25-49% Moderate</Text>
              <Text style={[styles.scaleText, { color: muted }]}>50-74% High</Text>
              <Text style={[styles.scaleText, { color: muted }]}>75-100% Critical</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg }]}> 
            <Text style={[styles.detailTitle, { color: cardText }]}>Potential waste</Text>
            <Text style={[styles.detailValue, { color: cardText }]}>~${weeklyWaste.toFixed(1)} / week</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>{move}</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>{budgetLine}</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>{paceLine}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.five,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 999,
  },
  backText: {
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  card: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  scoreLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scoreValue: {
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 50,
  },
  bandPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
  },
  bandText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.35,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  detailValue: {
    fontSize: 26,
    fontWeight: '800',
  },
  detailCopy: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  scaleRow: {
    marginTop: Spacing.one,
    paddingTop: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  scaleText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
