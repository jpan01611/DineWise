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
    mealPlanStatus?: string;
    deliveryFrequency?: string;
    outsideBudget?: string;
    recentFollowed?: string;
    recentLogged?: string;
    hasWeeklyEstimate?: string;
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
  const mealPlanStatus = (params.mealPlanStatus || '').toString();
  const deliveryFrequency = (params.deliveryFrequency || '').toString();
  const outsideBudget = Number.parseFloat(params.outsideBudget || '');
  const recentFollowed = Number.parseInt(params.recentFollowed || '0', 10) || 0;
  const recentLogged = Number.parseInt(params.recentLogged || '0', 10) || 0;
  const hasWeeklyEstimate = params.hasWeeklyEstimate === 'true';

  const factorRows = [
    {
      label: 'Meal-plan value left',
      value: mealPlanStatus || 'Not answered',
      explanation: mealPlanStatus
        ? mealPlanStatus === 'Plenty left'
          ? 'More prepaid value remains unused, so waste risk rises.'
          : mealPlanStatus === 'Almost empty'
            ? 'Very little prepaid value remains, so waste risk falls.'
            : 'The amount left changes how much prepaid value could expire unused.'
        : 'Answer this in I have a craving for a more complete score.',
      available: Boolean(mealPlanStatus),
    },
    {
      label: 'Delivery frequency',
      value: deliveryFrequency || 'Not answered',
      explanation: deliveryFrequency
        ? `${deliveryFrequency} delivery affects how often meal-plan value may go unused.`
        : 'Add your delivery habit so DineWise can estimate how often you skip campus dining.',
      available: Boolean(deliveryFrequency),
    },
    {
      label: 'Outside-food budget',
      value: Number.isFinite(outsideBudget) && outsideBudget > 0 ? `$${outsideBudget.toFixed(2)}` : 'Not answered',
      explanation: Number.isFinite(outsideBudget) && outsideBudget > 0
        ? 'More available outside spending makes it easier to leave prepaid meal-plan value unused.'
        : 'Set this only if you want outside spending capacity included in the score.',
      available: Number.isFinite(outsideBudget) && outsideBudget > 0,
    },
    {
      label: 'Recent follow-through',
      value: recentLogged ? `${recentFollowed} of ${recentLogged} meal-plan choices followed` : 'No choices logged yet',
      explanation: recentLogged
        ? 'Following meal-plan recommendations lowers future risk; ordering delivery raises it.'
        : 'After you log a few outcomes, recent behavior becomes a small part of the score.',
      available: recentLogged > 0,
    },
  ];

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
            <Text style={[styles.scoreLabel, { color: muted }]}>Waste risk</Text>
            <Text style={[styles.scoreValue, { color: cardText }]}>{scoreClamped}%</Text>
            <View style={[styles.bandPill, { backgroundColor: cardText + '12' }]}>
              <Text style={[styles.bandText, { color: cardText }]}>{band}</Text>
            </View>
            <Text style={[styles.detailCopy, { color: muted }]}>This estimates how likely you are to pay for outside food while prepaid meal-plan value goes unused.</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>0% means DineWise currently sees very little waste risk. 100% means the answers you provided point to a high risk.</Text>
            <View style={[styles.scaleRow, { borderColor: cardText + '1f' }]}>
              <Text style={[styles.scaleText, { color: muted }]}>0-24% Low</Text>
              <Text style={[styles.scaleText, { color: muted }]}>25-49% Moderate</Text>
              <Text style={[styles.scaleText, { color: muted }]}>50-74% High</Text>
              <Text style={[styles.scaleText, { color: muted }]}>75-100% Critical</Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.detailTitle, { color: cardText }]}>What affects this score</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>The score uses only the answers below. Missing answers contribute nothing; DineWise does not silently guess them.</Text>
            <View style={styles.factorList}>
              {factorRows.map((factor) => (
                <View key={factor.label} style={[styles.factorRow, { borderColor: cardText + '1f' }]}>
                  <View style={styles.factorHeader}>
                    <Text style={[styles.factorLabel, { color: cardText }]}>{factor.label}</Text>
                    <Text style={[styles.factorValue, { color: factor.available ? cardText : muted }]}>{factor.value}</Text>
                  </View>
                  <Text style={[styles.factorExplanation, { color: muted }]}>{factor.explanation}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.detailTitle, { color: cardText }]}>What this could cost</Text>
            <Text style={[styles.detailValue, { color: cardText }]}>{hasWeeklyEstimate ? `~$${weeklyWaste.toFixed(1)} / week` : 'Not enough information yet'}</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>
              {hasWeeklyEstimate
                ? 'This is an estimate of avoidable outside spending based on your answers, not a charge or account balance.'
                : 'Add your delivery frequency to estimate how much outside spending could be avoided each week.'}
            </Text>
            <Text style={[styles.detailCopy, { color: muted }]}>{move}</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>{budgetLine}</Text>
            <Text style={[styles.detailCopy, { color: muted }]}>{paceLine}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <Text style={[styles.detailTitle, { color: cardText }]}>How to lower waste risk</Text>
            <View style={styles.actionList}>
              <Text style={[styles.detailCopy, { color: muted }]}>• Use prepaid meal-plan value before paying out of pocket.</Text>
              <Text style={[styles.detailCopy, { color: muted }]}>• Check DineWise before opening a delivery app.</Text>
              <Text style={[styles.detailCopy, { color: muted }]}>• Keep your balance and days left updated for an exact daily target.</Text>
              <Text style={[styles.detailCopy, { color: muted }]}>• Log what you chose so the meter can learn from recent follow-through.</Text>
            </View>
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
  factorList: {
    gap: Spacing.one,
  },
  factorRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.two,
    gap: 4,
  },
  factorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  factorLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  factorValue: {
    maxWidth: '52%',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
  },
  factorExplanation: {
    fontSize: 12,
    lineHeight: 17,
  },
  actionList: {
    gap: Spacing.one,
  },
});
