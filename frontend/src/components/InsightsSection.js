import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LineChart, BarChart } from "react-native-chart-kit";
import { colors } from "../constants/colors";
import { dataTrackingService } from "../services/dataTrackingService";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CHART_WIDTH = SCREEN_WIDTH - 52;
const TAB_WIDTH = (SCREEN_WIDTH - 48) / 2;

const CHART_CONFIG = {
  backgroundColor: "transparent",
  backgroundGradientFrom: "#FFF8EE",
  backgroundGradientTo: "#FFF3DD",
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(92, 114, 74, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(53, 74, 47, ${opacity * 0.8})`,
  style: { borderRadius: 12 },
  propsForDots: {
    r: "5",
    strokeWidth: "2",
    stroke: colors.primaryDark,
    fill: colors.primary,
  },
  propsForBackgroundLines: {
    stroke: "rgba(163, 182, 138, 0.25)",
    strokeWidth: 1,
    strokeDasharray: "4,4",
  },
};

const PHASE_CONFIG = {
  menstrual: { label: "Menstrual", color: colors.menstrual, icon: "water-outline", bg: "#FFF0F3" },
  follicular: { label: "Follicular", color: "#C2839A", icon: "flower-outline", bg: "#FDF0F4" },
  ovulation: { label: "Ovulation", color: colors.exactOvulation, icon: "radio-button-on-outline", bg: "#ECFDF5" },
  luteal: { label: "Luteal", color: "#A07850", icon: "moon-outline", bg: "#FDF5EE" },
};

const REGULARITY_CONFIG = {
  very_regular: { label: "Very Regular", color: "#059669", bg: "#ECFDF5" },
  regular: { label: "Regular", color: "#10B981", bg: "#F0FDF4" },
  somewhat_regular: { label: "Somewhat Regular", color: "#D97706", bg: "#FFFBEB" },
  irregular: { label: "Irregular", color: "#DC2626", bg: "#FEF2F2" },
};

const STRENGTH_CONFIG = {
  strong: { color: colors.primary, label: "Strong" },
  moderate: { color: colors.warning, label: "Moderate" },
  weak: { color: colors.textLight, label: "Weak" },
};

// ─── Stat Box ────────────────────────────────────────────────────────────────
function StatBox({ icon, value, label, color = colors.primary }) {
  return (
    <View style={styles.statBox}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value ?? "—"}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

// ─── Insight Card ─────────────────────────────────────────────────────────────
function InsightCard({ icon, iconColor = colors.primary, iconBg, title, children, accent }) {
  return (
    <View style={[styles.insightCard, accent && { borderLeftColor: accent, borderLeftWidth: 3 }]}>
      <View style={styles.insightCardHeader}>
        <View style={[styles.insightIconWrap, { backgroundColor: iconBg || iconColor + "15" }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={styles.insightCardTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ value, max = 100, color = colors.primary, height = 7 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <View style={[styles.progressTrack, { height }]}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: color, height }]} />
    </View>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ label, color, bg }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg || color + "15" }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

// ─── Period Selector ─────────────────────────────────────────────────────────
function PeriodSelector({ value, onChange }) {
  const options = [
    { id: "week", label: "7 Days" },
    { id: "month", label: "1 Month" },
    { id: "3months", label: "3 Months" },
  ];
  return (
    <View style={styles.periodSelector}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.id}
          onPress={() => onChange(opt.id)}
          style={[styles.periodOption, value === opt.id && styles.periodOptionActive]}
          activeOpacity={0.7}
        >
          <Text style={[styles.periodOptionText, value === opt.id && styles.periodOptionTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionDivider({ title }) {
  return (
    <View style={styles.sectionDivider}>
      <View style={styles.sectionDividerLine} />
      <Text style={styles.sectionDividerText}>{title}</Text>
      <View style={styles.sectionDividerLine} />
    </View>
  );
}

// ─── Expandable Correlations Card ─────────────────────────────────────────────
function CorrelationsCard({ correlations }) {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const heightAnim = useRef(new Animated.Value(0)).current;

  const top = correlations?.top_correlations?.slice(0, 5) || [];
  if (top.length === 0) return null;

  const toggle = () => {
    const toExpanded = !expanded;
    setExpanded(toExpanded);
    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: toExpanded ? 1 : 0,
        useNativeDriver: true,
        tension: 300,
        friction: 20,
      }),
      Animated.timing(heightAnim, {
        toValue: toExpanded ? 1 : 0,
        duration: 260,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const rotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={styles.correlationCard}>
      <TouchableOpacity onPress={toggle} style={styles.correlationHeader} activeOpacity={0.7}>
        <View style={styles.correlationTitleRow}>
          <View style={[styles.insightIconWrap, { backgroundColor: colors.primary + "15" }]}>
            <Ionicons name="git-branch-outline" size={18} color={colors.primary} />
          </View>
          <Text style={styles.insightCardTitle}>Patterns & Correlations</Text>
          <View style={[styles.badge, { backgroundColor: colors.primary + "15", marginLeft: 8 }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>{top.length}</Text>
          </View>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Ionicons name="chevron-down-outline" size={18} color={colors.textLight} />
        </Animated.View>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.correlationList}>
          {top.map((corr, idx) => {
            const strength = corr.strength || "moderate";
            const cfg = STRENGTH_CONFIG[strength] || STRENGTH_CONFIG.moderate;
            const absCorr = Math.abs(corr.correlation || 0);
            const pct = Math.round(absCorr * 100);
            const field1 = corr.field1_label || corr.field1 || "Field 1";
            const field2 = corr.field2_label || corr.field2 || "Field 2";
            const isPositive = (corr.correlation || 0) >= 0;

            return (
              <View key={idx} style={[styles.correlationItem, idx < top.length - 1 && styles.correlationItemBorder]}>
                <View style={styles.correlationFields}>
                  <Text style={styles.correlationFieldText} numberOfLines={1}>{field1}</Text>
                  <View style={styles.correlationArrow}>
                    <Ionicons
                      name={isPositive ? "arrow-forward-outline" : "arrow-back-outline"}
                      size={12}
                      color={isPositive ? colors.primary : colors.error}
                    />
                  </View>
                  <Text style={styles.correlationFieldText} numberOfLines={1}>{field2}</Text>
                </View>
                <View style={styles.correlationMeta}>
                  <ProgressBar value={pct} max={100} color={cfg.color} height={5} />
                  <Text style={[styles.correlationPct, { color: cfg.color }]}>{pct}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ insights, isPeriodTracker, currentCycleDay, currentPhase, daysUntilNext, currentCycle }) {
  if (isPeriodTracker) {
    const reg = insights?.regularity;
    const pred = insights?.prediction_accuracy;
    const compPrev = insights?.comparison_with_previous;
    const correlations = insights?.correlations;
    const phaseInfo = currentPhase ? PHASE_CONFIG[currentPhase] : null;
    const regInfo = reg ? (REGULARITY_CONFIG[reg.regularity_level] || REGULARITY_CONFIG.somewhat_regular) : null;
    const regScore = reg?.regularity_score ?? null;

    return (
      <View style={styles.tabContent}>
        {/* Cycle Status */}
        {currentCycleDay != null && (
          <View style={styles.cycleStatusCard}>
            <View style={styles.cycleStatusLeft}>
              <Text style={styles.cycleDayNumber}>Day {currentCycleDay}</Text>
              <Text style={styles.cycleDayLabel}>of your current cycle</Text>
              {daysUntilNext != null && (
                <View style={styles.nextPeriodRow}>
                  <Ionicons name="calendar-outline" size={13} color={colors.textLight} />
                  <Text style={styles.nextPeriodText}>
                    {daysUntilNext === 0 ? "Period expected today" : `Next period in ${daysUntilNext}d`}
                  </Text>
                </View>
              )}
            </View>
            {phaseInfo && (
              <View style={[styles.phaseChip, { backgroundColor: phaseInfo.bg }]}>
                <Ionicons name={phaseInfo.icon} size={16} color={phaseInfo.color} />
                <Text style={[styles.phaseChipText, { color: phaseInfo.color }]}>{phaseInfo.label}</Text>
              </View>
            )}
          </View>
        )}

        {/* Regularity */}
        {reg && (
          <InsightCard
            icon="pulse-outline"
            iconColor={regInfo?.color || colors.primary}
            title="Cycle Regularity"
            accent={regInfo?.color || colors.primary}
          >
            <View style={styles.regularityContent}>
              <View style={styles.regularityRow}>
                {regInfo && <Badge label={regInfo.label} color={regInfo.color} bg={regInfo.bg} />}
                {regScore != null && (
                  <Text style={styles.regularityScore}>{regScore.toFixed(0)}/100</Text>
                )}
              </View>
              {regScore != null && (
                <ProgressBar value={regScore} max={100} color={regInfo?.color || colors.primary} />
              )}
              {reg.medical_note ? (
                <Text style={styles.insightDetailText}>{reg.medical_note}</Text>
              ) : null}
            </View>
          </InsightCard>
        )}

        {/* Prediction Accuracy */}
        {pred && (
          <InsightCard
            icon="analytics-outline"
            iconColor={colors.textSecondary}
            title="Prediction Accuracy"
            accent={colors.primaryLight}
          >
            <View style={styles.predictionContent}>
              <View style={styles.predictionRow}>
                <View style={styles.predictionStat}>
                  <Text style={styles.predictionBigText}>
                    {pred.average_error_days != null ? `±${pred.average_error_days.toFixed(1)}d` : "—"}
                  </Text>
                  <Text style={styles.predictionSmallText}>avg. error</Text>
                </View>
                {pred.accuracy_level && (
                  <Badge
                    label={pred.accuracy_level.replace(/_/g, " ")}
                    color={pred.accuracy_level === "high" ? colors.success : pred.accuracy_level === "medium" ? colors.warning : colors.textLight}
                    bg={pred.accuracy_level === "high" ? "#ECFDF5" : pred.accuracy_level === "medium" ? "#FFFBEB" : "#F4F4F4"}
                  />
                )}
              </View>
              {pred.recommendation && (
                <Text style={styles.insightDetailText}>{pred.recommendation}</Text>
              )}
            </View>
          </InsightCard>
        )}

        {/* Previous Cycle Comparison */}
        {compPrev?.has_comparison && (
          <InsightCard
            icon="git-compare-outline"
            iconColor={colors.secondary}
            iconBg={colors.secondary + "20"}
            title="Cycle Comparison"
            accent={colors.secondary}
          >
            {(compPrev.cycle_insights || compPrev.insights || []).slice(0, 2).map((insight, i) => (
              <Text key={i} style={styles.comparisonInsightText}>• {insight}</Text>
            ))}
          </InsightCard>
        )}

        {/* Correlations */}
        {correlations?.has_correlations && (
          <CorrelationsCard correlations={correlations} />
        )}
      </View>
    );
  }

  // General tracker overview
  const summary = insights?.tracking_summary;
  const comparison = insights?.comparison;
  const correlations = insights?.correlations;

  return (
    <View style={styles.tabContent}>
      {/* Stats Row */}
      {summary && (
        <View style={styles.statsRow}>
          <StatBox icon="layers-outline" value={summary.total_entries} label="Entries" />
          <View style={styles.statsRowDivider} />
          <StatBox icon="calendar-outline" value={summary.tracking_days} label="Days tracked" color={colors.textSecondary} />
          {summary.current_streak != null && (
            <>
              <View style={styles.statsRowDivider} />
              <StatBox icon="flame-outline" value={summary.current_streak} label="Day streak" color={colors.warning} />
            </>
          )}
        </View>
      )}

      {/* Comparison */}
      {comparison?.has_comparison && (
        <InsightCard
          icon="bar-chart-outline"
          iconColor={colors.primary}
          title="Period Comparison"
          accent={colors.primary}
        >
          {comparison.message && (
            <Text style={styles.insightDetailText}>{comparison.message}</Text>
          )}
          {(comparison.insights || []).slice(0, 2).map((ins, i) => (
            <Text key={i} style={styles.comparisonInsightText}>• {ins}</Text>
          ))}
        </InsightCard>
      )}

      {/* Correlations */}
      {correlations?.has_correlations && (
        <CorrelationsCard correlations={correlations} />
      )}

      {/* Empty fallback */}
      {!summary && !comparison?.has_comparison && !correlations?.has_correlations && (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="bar-chart-outline" size={32} color={colors.primaryLight} />
          </View>
          <Text style={styles.emptyTitle}>Insights loading</Text>
          <Text style={styles.emptyText}>Keep logging daily to unlock deeper analysis.</Text>
        </View>
      )}
    </View>
  );
}

// ─── Trends Tab ───────────────────────────────────────────────────────────────
function TrendsTab({ insights, isPeriodTracker, cycleHistory, trendPeriod, onPeriodChange, trackerId }) {
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  const loadCompare = useCallback(async () => {
    if (!trackerId || isPeriodTracker) return;
    try {
      setCompareLoading(true);
      const res = await dataTrackingService.getCompare(trackerId, { time_range: trendPeriod });
      setCompareData(res?.data || res);
    } catch {
      setCompareData(null);
    } finally {
      setCompareLoading(false);
    }
  }, [trackerId, isPeriodTracker, trendPeriod]);

  useEffect(() => {
    if (!isPeriodTracker) loadCompare();
  }, [loadCompare, isPeriodTracker]);

  if (isPeriodTracker) {
    return <PeriodTrendsContent cycleHistory={cycleHistory} />;
  }
  return (
    <GeneralTrendsContent
      insights={insights}
      trendPeriod={trendPeriod}
      onPeriodChange={onPeriodChange}
      compareData={compareData}
      compareLoading={compareLoading}
    />
  );
}

// ─── Period Trends Content ─────────────────────────────────────────────────────
function PeriodTrendsContent({ cycleHistory }) {
  const validCycles = cycleHistory
    .filter((c) => c.cycle_length && c.cycle_length > 10 && c.cycle_length < 70)
    .slice(-8);

  const periodCycles = cycleHistory
    .filter((c) => c.period_length && c.period_length > 0 && c.period_length < 20)
    .slice(-8);

  const hasCycleChart = validCycles.length >= 2;
  const hasPeriodChart = periodCycles.length >= 2;

  const avgCycleLength = hasCycleChart
    ? Math.round(validCycles.reduce((s, c) => s + c.cycle_length, 0) / validCycles.length)
    : null;

  const avgPeriodLength = hasPeriodChart
    ? (periodCycles.reduce((s, c) => s + c.period_length, 0) / periodCycles.length).toFixed(1)
    : null;

  const cycleLengthData = hasCycleChart
    ? {
        labels: validCycles.map((_, i) => `C${i + 1}`),
        datasets: [
          {
            data: validCycles.map((c) => c.cycle_length),
            color: (opacity = 1) => `rgba(92, 114, 74, ${opacity})`,
            strokeWidth: 2.5,
          },
          {
            data: validCycles.map(() => avgCycleLength),
            color: (opacity = 1) => `rgba(199, 183, 147, ${opacity * 0.9})`,
            strokeWidth: 1.5,
            withDots: false,
          },
        ],
        legend: ["Cycle length", "Average"],
      }
    : null;

  const periodLengthData = hasPeriodChart
    ? {
        labels: periodCycles.map((_, i) => `C${i + 1}`),
        datasets: [{ data: periodCycles.map((c) => Math.max(1, c.period_length)) }],
      }
    : null;

  return (
    <View style={styles.tabContent}>
      {/* Average stats row */}
      {(avgCycleLength || avgPeriodLength) && (
        <View style={styles.statsRow}>
          {avgCycleLength && (
            <StatBox icon="repeat-outline" value={`${avgCycleLength}d`} label="Avg cycle" />
          )}
          {avgCycleLength && avgPeriodLength && <View style={styles.statsRowDivider} />}
          {avgPeriodLength && (
            <StatBox icon="water-outline" value={`${avgPeriodLength}d`} label="Avg period" color={colors.menstrual} />
          )}
          {validCycles.length > 0 && (
            <>
              <View style={styles.statsRowDivider} />
              <StatBox icon="layers-outline" value={validCycles.length} label="Cycles" color={colors.textSecondary} />
            </>
          )}
        </View>
      )}

      {/* Cycle Length Chart */}
      {hasCycleChart ? (
        <View style={styles.chartCard}>
          <View style={styles.chartCardHeader}>
            <Ionicons name="trending-up-outline" size={16} color={colors.primary} />
            <Text style={styles.chartCardTitle}>Cycle Length History</Text>
          </View>
          <Text style={styles.chartSubtitle}>Last {validCycles.length} cycles (days)</Text>
          <LineChart
            data={cycleLengthData}
            width={CHART_WIDTH}
            height={180}
            chartConfig={CHART_CONFIG}
            bezier
            style={styles.chart}
            withShadow={false}
            withInnerLines={true}
            withOuterLines={false}
            fromZero={false}
            yAxisSuffix="d"
            getDotColor={(dataPoint, idx) => colors.primary}
          />
        </View>
      ) : (
        <View style={styles.chartEmptyCard}>
          <Ionicons name="trending-up-outline" size={28} color={colors.primaryLight} />
          <Text style={styles.chartEmptyText}>Need 2+ cycles for chart</Text>
        </View>
      )}

      {/* Period Length Chart */}
      {hasPeriodChart ? (
        <View style={styles.chartCard}>
          <View style={styles.chartCardHeader}>
            <Ionicons name="water-outline" size={16} color={colors.menstrual} />
            <Text style={styles.chartCardTitle}>Period Length</Text>
          </View>
          <Text style={styles.chartSubtitle}>Days per cycle</Text>
          <BarChart
            data={periodLengthData}
            width={CHART_WIDTH}
            height={160}
            chartConfig={{
              ...CHART_CONFIG,
              color: (opacity = 1) => `rgba(139, 21, 56, ${opacity * 0.85})`,
              backgroundGradientFrom: "#FFF5F7",
              backgroundGradientTo: "#FFF0F3",
            }}
            style={styles.chart}
            withInnerLines={false}
            showValuesOnTopOfBars
            fromZero
            yAxisSuffix="d"
          />
        </View>
      ) : null}

      {!hasCycleChart && !hasPeriodChart && (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="analytics-outline" size={32} color={colors.primaryLight} />
          </View>
          <Text style={styles.emptyTitle}>Not enough data yet</Text>
          <Text style={styles.emptyText}>
            Log at least 2 complete cycles to see trend charts.
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── General Trends Content ────────────────────────────────────────────────────
function GeneralTrendsContent({ insights, trendPeriod, onPeriodChange, compareData, compareLoading }) {
  const summary = insights?.tracking_summary;

  // Build chart data from compare response if available
  const buildCompareChartData = () => {
    if (!compareData) return null;
    const curr = compareData.current_period || compareData.current;
    const prev = compareData.previous_period || compareData.previous;
    if (!curr || !prev) return null;

    const currCount = curr.entry_count ?? curr.total_entries ?? curr.entries ?? null;
    const prevCount = prev.entry_count ?? prev.total_entries ?? prev.entries ?? null;

    if (currCount == null || prevCount == null) return null;

    const periodLabel = trendPeriod === "week" ? "7d" : trendPeriod === "month" ? "30d" : "90d";
    return {
      labels: [`Prev ${periodLabel}`, `This ${periodLabel}`],
      datasets: [{ data: [Math.max(0, prevCount), Math.max(0, currCount)] }],
    };
  };

  const compareChartData = buildCompareChartData();
  const changeText = compareData?.change_percentage != null
    ? `${compareData.change_percentage > 0 ? "+" : ""}${compareData.change_percentage.toFixed(0)}%`
    : null;

  return (
    <View style={styles.tabContent}>
      {/* Summary stats */}
      {summary && (
        <View style={styles.statsRow}>
          <StatBox icon="layers-outline" value={summary.total_entries} label="Total entries" />
          <View style={styles.statsRowDivider} />
          <StatBox icon="calendar-outline" value={summary.tracking_days} label="Days tracked" color={colors.textSecondary} />
        </View>
      )}

      <PeriodSelector value={trendPeriod} onChange={onPeriodChange} />

      {compareLoading ? (
        <View style={styles.chartLoadingWrap}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.chartLoadingText}>Loading trend data…</Text>
        </View>
      ) : compareChartData ? (
        <View style={styles.chartCard}>
          <View style={styles.chartCardHeader}>
            <Ionicons name="bar-chart-outline" size={16} color={colors.primary} />
            <Text style={styles.chartCardTitle}>Activity Comparison</Text>
            {changeText && (
              <View style={[
                styles.badge,
                {
                  backgroundColor: compareData.change_percentage >= 0 ? "#ECFDF5" : "#FEF2F2",
                  marginLeft: 8,
                },
              ]}>
                <Text style={[
                  styles.badgeText,
                  { color: compareData.change_percentage >= 0 ? colors.success : colors.error },
                ]}>
                  {changeText}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.chartSubtitle}>Entries logged per period</Text>
          <BarChart
            data={compareChartData}
            width={CHART_WIDTH}
            height={180}
            chartConfig={CHART_CONFIG}
            style={styles.chart}
            withInnerLines={false}
            showValuesOnTopOfBars
            fromZero
          />
          {/* Compare insights text */}
          {(compareData?.insights || []).slice(0, 2).map((ins, i) => (
            <View key={i} style={styles.compareInsightRow}>
              <Ionicons name="information-circle-outline" size={14} color={colors.textLight} />
              <Text style={styles.compareInsightText}>{ins}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.chartEmptyCard}>
          <Ionicons name="bar-chart-outline" size={28} color={colors.primaryLight} />
          <Text style={styles.chartEmptyText}>
            {summary ? "No comparison data available yet" : "Log more entries to see trends"}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function InsightsSection({
  insights,
  isPeriodTracker = false,
  cycleHistory = [],
  trackerId,
  insightsLoading = false,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [trendPeriod, setTrendPeriod] = useState("month");
  const tabAnim = useRef(new Animated.Value(0)).current;

  const switchTab = (tab) => {
    Animated.spring(tabAnim, {
      toValue: tab === "overview" ? 0 : 1,
      useNativeDriver: true,
      tension: 300,
      friction: 22,
    }).start();
    setActiveTab(tab);
  };

  // Cycle derived values (for period tracker overview)
  const currentCycle = cycleHistory.find((c) => !c.cycle_end_date);
  const today = new Date();

  let currentCycleDay = null;
  let daysUntilNext = null;
  let currentPhase = null;

  if (currentCycle) {
    const cycleStart = new Date(currentCycle.cycle_start_date || currentCycle.period_start_date);
    if (!isNaN(cycleStart)) {
      currentCycleDay = Math.floor((today - cycleStart) / 86400000) + 1;
    }
    if (currentCycle.predicted_next_period_date) {
      const nextDate = new Date(currentCycle.predicted_next_period_date);
      if (!isNaN(nextDate)) {
        daysUntilNext = Math.max(0, Math.floor((nextDate - today) / 86400000));
      }
    }
    if (currentCycleDay) {
      const periodStart = new Date(currentCycle.period_start_date);
      const periodEnd = currentCycle.period_end_date
        ? new Date(currentCycle.period_end_date)
        : new Date(periodStart.getTime() + (currentCycle.period_length || 5) * 86400000);

      if (today <= periodEnd) {
        currentPhase = "menstrual";
      } else {
        const cycleLen = currentCycle.cycle_length || 28;
        const ovDay = cycleLen - 14;
        if (currentCycleDay >= ovDay - 2 && currentCycleDay <= ovDay + 2) {
          currentPhase = "ovulation";
        } else if (currentCycleDay < ovDay - 2) {
          currentPhase = "follicular";
        } else {
          currentPhase = "luteal";
        }
      }
    }
  }

  const indicatorTranslateX = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TAB_WIDTH],
  });

  if (insightsLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Insights</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Analysing your data…</Text>
        </View>
      </View>
    );
  }

  if (!insights) {
    return (
      <View style={styles.container}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Insights</Text>
        </View>
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="analytics-outline" size={36} color={colors.primaryLight} />
          </View>
          <Text style={styles.emptyTitle}>No insights yet</Text>
          <Text style={styles.emptyText}>
            Keep logging daily — insights appear after a few entries.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Insights</Text>
        <View style={styles.aiBadge}>
          <Ionicons name="flash-outline" size={11} color={colors.primary} />
          <Text style={styles.aiBadgeText}>Smart</Text>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        <Animated.View
          style={[
            styles.tabIndicator,
            { width: TAB_WIDTH, transform: [{ translateX: indicatorTranslateX }] },
          ]}
        />
        {["overview", "trends"].map((tab) => (
          <TouchableOpacity
            key={tab}
            onPress={() => switchTab(tab)}
            style={[styles.tabButton, { width: TAB_WIDTH }]}
            activeOpacity={0.7}
          >
            <Ionicons
              name={tab === "overview" ? "grid-outline" : "trending-up-outline"}
              size={14}
              color={activeTab === tab ? colors.primary : colors.textLight}
            />
            <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
              {tab === "overview" ? "Overview" : "Trends"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {activeTab === "overview" ? (
        <OverviewTab
          insights={insights}
          isPeriodTracker={isPeriodTracker}
          currentCycleDay={currentCycleDay}
          currentPhase={currentPhase}
          daysUntilNext={daysUntilNext}
          currentCycle={currentCycle}
        />
      ) : (
        <TrendsTab
          insights={insights}
          isPeriodTracker={isPeriodTracker}
          cycleHistory={cycleHistory}
          trendPeriod={trendPeriod}
          onPeriodChange={setTrendPeriod}
          trackerId={trackerId}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 8,
    backgroundColor: colors.background,
  },

  // ── Header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.4,
  },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary + "12",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 3,
  },
  aiBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primary,
  },

  // ── Tab Bar
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#F3EFE7",
    borderRadius: 12,
    marginBottom: 16,
    padding: 3,
    position: "relative",
    overflow: "hidden",
  },
  tabIndicator: {
    position: "absolute",
    top: 3,
    left: 3,
    height: "100%",
    backgroundColor: colors.background,
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    gap: 6,
    zIndex: 1,
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textLight,
  },
  tabLabelActive: {
    color: colors.text,
    fontWeight: "600",
  },

  // ── Tab content
  tabContent: {
    gap: 12,
  },

  // ── Cycle status card
  cycleStatusCard: {
    backgroundColor: colors.insightsCard,
    borderRadius: 16,
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#F0E8D8",
    shadowColor: "#C7B793",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 2,
  },
  cycleStatusLeft: {
    flex: 1,
  },
  cycleDayNumber: {
    fontSize: 32,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -1,
    lineHeight: 36,
  },
  cycleDayLabel: {
    fontSize: 13,
    color: colors.textLight,
    marginTop: 2,
  },
  nextPeriodRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 5,
  },
  nextPeriodText: {
    fontSize: 12,
    color: colors.textLight,
  },
  phaseChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
  },
  phaseChipText: {
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Insight card
  insightCard: {
    backgroundColor: colors.insightsCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F0E8D8",
    shadowColor: "#C7B793",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
    overflow: "hidden",
  },
  insightCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 10,
  },
  insightIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  insightCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },

  // ── Regularity
  regularityContent: {
    gap: 8,
  },
  regularityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  regularityScore: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
  },

  // ── Prediction
  predictionContent: {
    gap: 8,
  },
  predictionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  predictionStat: {
    alignItems: "flex-start",
  },
  predictionBigText: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
  },
  predictionSmallText: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: 1,
  },
  insightDetailText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginTop: 4,
  },
  comparisonInsightText: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginTop: 2,
  },

  // ── Stats row
  statsRow: {
    flexDirection: "row",
    backgroundColor: colors.insightsCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0E8D8",
    overflow: "hidden",
    shadowColor: "#C7B793",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
  },
  statsRowDivider: {
    width: 1,
    backgroundColor: "#EDE5D8",
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 8,
    gap: 4,
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textLight,
    textAlign: "center",
  },

  // ── Badge
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },

  // ── Progress bar
  progressTrack: {
    backgroundColor: "#EDE5D8",
    borderRadius: 99,
    overflow: "hidden",
    width: "100%",
  },
  progressFill: {
    borderRadius: 99,
  },

  // ── Correlations
  correlationCard: {
    backgroundColor: colors.insightsCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0E8D8",
    overflow: "hidden",
    shadowColor: "#C7B793",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 1,
  },
  correlationHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  correlationTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 10,
  },
  correlationList: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  correlationItem: {
    paddingVertical: 10,
    gap: 6,
  },
  correlationItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#EDE5D8",
  },
  correlationFields: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  correlationFieldText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: "500",
    flex: 1,
  },
  correlationArrow: {
    width: 20,
    alignItems: "center",
  },
  correlationMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  correlationPct: {
    fontSize: 12,
    fontWeight: "700",
    width: 36,
    textAlign: "right",
  },

  // ── Chart card
  chartCard: {
    backgroundColor: colors.insightsCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#F0E8D8",
    shadowColor: "#C7B793",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 2,
    overflow: "hidden",
  },
  chartCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  chartCardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    flex: 1,
  },
  chartSubtitle: {
    fontSize: 12,
    color: colors.textLight,
    marginBottom: 12,
  },
  chart: {
    borderRadius: 10,
    marginLeft: -10,
  },
  chartEmptyCard: {
    backgroundColor: colors.insightsCard,
    borderRadius: 14,
    padding: 28,
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#F0E8D8",
    borderStyle: "dashed",
  },
  chartEmptyText: {
    fontSize: 13,
    color: colors.textLight,
    textAlign: "center",
  },
  chartLoadingWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
    gap: 10,
  },
  chartLoadingText: {
    fontSize: 13,
    color: colors.textLight,
  },

  // ── Period selector
  periodSelector: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  periodOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#F3EFE7",
  },
  periodOptionActive: {
    backgroundColor: colors.primary,
  },
  periodOptionText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.textLight,
  },
  periodOptionTextActive: {
    color: "#FFFFFF",
    fontWeight: "700",
  },

  // ── Compare insights
  compareInsightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    marginTop: 10,
  },
  compareInsightText: {
    fontSize: 12,
    color: colors.textLight,
    flex: 1,
    lineHeight: 17,
  },

  // ── Section divider
  sectionDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 4,
    gap: 8,
  },
  sectionDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#EDE5D8",
  },
  sectionDividerText: {
    fontSize: 11,
    color: colors.textLight,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // ── Loading & empty states
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textLight,
  },
  emptyCard: {
    backgroundColor: colors.insightsCard,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#F0E8D8",
  },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.primaryLight + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  emptyText: {
    fontSize: 13,
    color: colors.textLight,
    textAlign: "center",
    lineHeight: 19,
  },
});
