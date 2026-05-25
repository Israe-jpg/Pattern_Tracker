import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Animated,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LineChart, BarChart } from "react-native-chart-kit";
import Svg, { G, Path } from "react-native-svg";
import { colors } from "../constants/colors";
import { dataTrackingService } from "../services/dataTrackingService";
import { trackerService } from "../services/trackerService";

// Container has 20px horizontal padding + card has 16px padding = 72px total.
// Tab bar sits directly in the container (48px horizontal chrome).
const getLayoutWidths = (screenWidth) => ({
  tabWidth: (screenWidth - 48) / 2,
});

const formatCompactChartLabel = (dateStr) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "").slice(0, 5);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

// react-native-chart-kit needs ~36px per x-axis label; cap points on narrow screens.
const getMaxChartPoints = (width) => {
  if (width < 260) return 4;
  if (width < 320) return 5;
  if (width < 380) return 6;
  return 8;
};

const getMaxVisibleLabels = (width) => {
  if (width < 260) return 3;
  if (width < 320) return 4;
  if (width < 380) return 5;
  return 6;
};

// Hide intermediate labels so dates/bars do not overlap.
const thinChartLabels = (labels, maxVisible) => {
  if (labels.length <= maxVisible) return labels;
  const step = Math.max(1, Math.floor((labels.length - 1) / (maxVisible - 1)));
  return labels.map((label, i) =>
    i === 0 || i === labels.length - 1 || i % step === 0 ? label : ""
  );
};

function ResponsiveChartWrap({ children, style }) {
  const [width, setWidth] = useState(0);
  return (
    <View
      style={[s.chartWrap, style]}
      onLayout={({ nativeEvent: { layout } }) => {
        const next = Math.floor(layout.width);
        if (next > 0 && next !== width) setWidth(next);
      }}
    >
      {width > 0 ? children(width) : null}
    </View>
  );
}

// ─── Field-name utilities ─────────────────────────────────────────────────────
const toTitleCase = (s) =>
  (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

// "sleep.time_i_woke_up" → "Time I Woke Up"
const formatFieldPath = (path) => {
  if (!path) return "";
  const parts = path.split(".");
  return toTitleCase(parts.length > 1 ? parts.slice(1).join(" ") : parts[0]);
};

// "sleep.hours_slept" → "Sleep"
const formatFieldCategory = (path) =>
  toTitleCase((path || "").split(".")[0].replace(/_/g, " "));

// Replace "category.option_name" occurrences in backend text strings
const formatInsightText = (text) =>
  (text || "").replace(/\b([a-z_]+)\.([a-z_]+(?:_[a-z]+)*)\b/g, (_m, _c, opt) =>
    toTitleCase(opt)
  );

// ─── Date / grouping helpers ──────────────────────────────────────────────────
const getMondayKey = (dateStr) => {
  const d = new Date(dateStr);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d.toISOString().split("T")[0];
};

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const formatWeekLabel = (mondayStr) => {
  const d = new Date(mondayStr);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
};

// ─── Evolution period config ──────────────────────────────────────────────────
const EVOLUTION_PERIODS = [
  { id: "1w",  label: "1W",  days: 7,   gran: "day"  },
  { id: "1m",  label: "1M",  days: 30,  gran: "day"  },
  { id: "3m",  label: "3M",  days: 90,  gran: "week" },
  { id: "6m",  label: "6M",  days: 180, gran: "week" },
];

// Build non-masked tracker fields from form schema (parent fields, not individual options).
const collectSchemaFields = (formSchema) => {
  if (!formSchema?.field_groups) return [];
  const fields = [];
  Object.values(formSchema.field_groups).forEach((group) => {
    if (!Array.isArray(group)) return;
    group.forEach((field) => {
      if (!field.field_name) return;
      fields.push({
        fieldName: field.field_name,
        label: field.display_label || formatFieldCategory(field.field_name),
      });
    });
  });
  return fields;
};

const getFieldNameFromPath = (path) => (path || "").split(".")[0];

// ─── Tracking-data processing ─────────────────────────────────────────────────
// granularity: "day" (one point per entry) | "week" (averaged per calendar week)
const processEntries = (entries, granularity = "week") => {
  if (!entries || !entries.length) {
    return { numericSeries: [], catSeries: [], entryCounts: {} };
  }

  // Collect all values per field path
  const raw = {};
  entries.forEach((entry) => {
    const entry_date = entry.entry_date || entry.date || "";
    const data = entry.data || {};
    Object.entries(data).forEach(([cat, opts]) => {
      if (typeof opts !== "object" || opts === null) return;
      Object.entries(opts).forEach(([opt, val]) => {
        const path = `${cat}.${opt}`;
        if (!raw[path]) raw[path] = [];
        raw[path].push({ date: entry_date, value: val });
      });
    });
  });

  const entryCounts = Object.fromEntries(
    Object.entries(raw).map(([path, vals]) => [path, vals.length])
  );

  const numericSeries = [];
  const catSeries = [];
  // Lower the min-entries threshold for short windows (1W / 1M)
  const minEntries = granularity === "day" ? 2 : 4;

  Object.entries(raw).forEach(([path, vals]) => {
    if (vals.length < minEntries) return;

    const numVals = vals.filter((v) => typeof v.value === "number");
    const isNumeric = numVals.length >= Math.max(minEntries, vals.length * 0.6);

    if (isNumeric) {
      let points;
      if (granularity === "day") {
        // One point per logged entry, sorted chronologically
        points = numVals
          .sort((a, b) => a.date.localeCompare(b.date))
          .map(({ date, value }) => ({
            date,
            label: formatWeekLabel(date),
            avg: Math.round(value * 10) / 10,
          }))
          .slice(-14); // cap at 14 daily points for readability
      } else {
        // Weekly averages — group by Monday of each week
        const weeks = {};
        numVals.forEach(({ date, value }) => {
          const k = getMondayKey(date);
          if (!weeks[k]) weeks[k] = [];
          weeks[k].push(value);
        });
        points = Object.entries(weeks)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, arr]) => ({
            date: k,
            label: formatWeekLabel(k),
            avg: Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10,
          }))
          .slice(-12); // last 12 weeks
      }
      if (points.length >= 2) {
        numericSeries.push({ fieldPath: path, label: formatFieldPath(path), weeklyData: points });
      }
    } else {
      // Categorical / boolean distribution
      const counts = {};
      vals.forEach(({ value }) => {
        const list = Array.isArray(value)
          ? value
          : [value === true ? "Yes" : value === false ? "No" : String(value)];
        list.forEach((v) => {
          if (v == null || v === "") return;
          const k = toTitleCase(String(v));
          counts[k] = (counts[k] || 0) + 1;
        });
      });
      const total = vals.length;
      const dist = Object.entries(counts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 12)
        .map(([label, count]) => ({ label, count, pct: Math.round((count / total) * 100) }));
      if (dist.length >= 2) {
        catSeries.push({ fieldPath: path, label: formatFieldPath(path), distribution: dist });
      }
    }
  });

  return { numericSeries, catSeries, entryCounts };
};

// ─── Chart config ─────────────────────────────────────────────────────────────
const CHART_CFG = {
  backgroundColor: "transparent",
  backgroundGradientFrom: "#FFF8EE",
  backgroundGradientTo: "#FFF3DD",
  decimalPlaces: 1,
  color: (o = 1) => `rgba(92,114,74,${o})`,
  labelColor: (o = 1) => `rgba(53,74,47,${o * 0.75})`,
  style: { borderRadius: 10 },
  propsForDots: { r: "4", strokeWidth: "2", stroke: colors.primaryDark, fill: colors.primary },
  propsForBackgroundLines: { stroke: "rgba(163,182,138,0.2)", strokeWidth: 1, strokeDasharray: "4,4" },
  propsForLabels: { fontSize: 10 },
  propsForVerticalLabels: { fontSize: 10 },
  barPercentage: 0.55,
  paddingRight: 28,
  paddingLeft: 4,
};

const DONUT_SLICE_COLORS = [
  colors.primary,
  colors.primaryLight,
  colors.secondary,
  "#8FA67A",
  colors.secondaryDark,
  "#A07850",
];

const polarToCartesian = (cx, cy, r, angleRad) => ({
  x: cx + r * Math.cos(angleRad),
  y: cy + r * Math.sin(angleRad),
});

const describeDonutSlice = (cx, cy, outerR, innerR, startAngle, endAngle) => {
  const startOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, endAngle);
  const startInner = polarToCartesian(cx, cy, innerR, endAngle);
  const endInner = polarToCartesian(cx, cy, innerR, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${startInner.x} ${startInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${endInner.x} ${endInner.y}`,
    "Z",
  ].join(" ");
};

// ─── Phase / Regularity configs (period tracker) ──────────────────────────────
const PHASE_CFG = {
  menstrual: { label: "Menstrual", color: colors.menstrual, icon: "water-outline", bg: "#FFF0F3" },
  follicular: { label: "Follicular", color: "#C2839A", icon: "flower-outline", bg: "#FDF0F4" },
  ovulation: { label: "Ovulation", color: colors.exactOvulation, icon: "radio-button-on-outline", bg: "#ECFDF5" },
  luteal: { label: "Luteal", color: "#A07850", icon: "moon-outline", bg: "#FDF5EE" },
};
const REG_CFG = {
  very_regular: { label: "Very Regular", color: "#059669", bg: "#ECFDF5" },
  regular: { label: "Regular", color: "#10B981", bg: "#F0FDF4" },
  somewhat_regular: { label: "Somewhat Regular", color: "#D97706", bg: "#FFFBEB" },
  irregular: { label: "Irregular", color: "#DC2626", bg: "#FEF2F2" },
};

// ─── Primitives ───────────────────────────────────────────────────────────────
function StatBox({ icon, value, label, color = colors.primary }) {
  return (
    <View style={s.statBox}>
      <View style={[s.statIconWrap, { backgroundColor: color + "18" }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={s.statValue}>{value ?? "—"}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

function Badge({ label, color, bg, icon }) {
  return (
    <View style={[s.badge, { backgroundColor: bg || color + "15" }]}>
      {icon ? <Ionicons name={icon} size={10} color={color} style={{ marginRight: 3 }} /> : null}
      <Text style={[s.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function ProgressBar({ value, max = 100, color = colors.primary, h = 7 }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <View style={[s.progTrack, { height: h }]}>
      <View style={[s.progFill, { width: `${pct}%`, backgroundColor: color, height: h }]} />
    </View>
  );
}

// ─── Section Card wrapper ─────────────────────────────────────────────────────
function SectionCard({ icon, iconColor = colors.primary, title, badge, headerRight, children }) {
  return (
    <View style={s.sectionCard}>
      <View style={s.sectionCardHeader}>
        <View style={[s.sectionIconWrap, { backgroundColor: iconColor + "15" }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={[s.sectionCardTitle, headerRight ? { flex: 1 } : null]}>{title}</Text>
        {badge}
        {headerRight}
      </View>
      {children}
    </View>
  );
}

// ─── Time evolution field picker ──────────────────────────────────────────────
function EvolutionFieldDropdown({
  options,
  selectedFieldName,
  chartableFieldNames,
  onSelect,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.fieldName === selectedFieldName);
  const selectedStale = selectedFieldName && !chartableFieldNames.has(selectedFieldName);

  if (!options.length) return null;

  return (
    <View style={s.evoFieldDropdownWrap}>
      <TouchableOpacity
        style={[s.evoFieldDropdownBtn, selectedStale && s.evoFieldDropdownBtnStale]}
        onPress={() => setOpen((prev) => !prev)}
        activeOpacity={0.7}
      >
        <Text
          style={[s.evoFieldDropdownBtnText, selectedStale && s.evoFieldDropdownTextStale]}
          numberOfLines={1}
        >
          {selected?.label || "Select field"}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={selectedStale ? colors.secondaryLight : colors.textSecondary}
        />
      </TouchableOpacity>

      {open && (
        <>
          <TouchableOpacity
            style={s.evoFieldDropdownBackdrop}
            onPress={() => setOpen(false)}
            activeOpacity={1}
          />
          <View style={s.evoFieldDropdownMenu}>
            <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
              {options.map(({ fieldName, label }) => {
                const stale = !chartableFieldNames.has(fieldName);
                const isSelected = fieldName === selectedFieldName;
                return (
                  <TouchableOpacity
                    key={fieldName}
                    style={[s.evoFieldDropdownItem, isSelected && !stale && s.evoFieldDropdownItemActive]}
                    onPress={() => {
                      if (stale) return;
                      onSelect(fieldName);
                      setOpen(false);
                    }}
                    activeOpacity={stale ? 1 : 0.7}
                  >
                    <Text
                      style={[
                        s.evoFieldDropdownItemText,
                        stale && s.evoFieldDropdownItemStale,
                        isSelected && !stale && s.evoFieldDropdownItemTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </>
      )}
    </View>
  );
}

function SectionLoading({ title, icon }) {
  return (
    <View style={s.sectionCard}>
      <View style={s.sectionCardHeader}>
        <View style={[s.sectionIconWrap, { backgroundColor: colors.primary + "15" }]}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <Text style={s.sectionCardTitle}>{title}</Text>
      </View>
      <View style={s.sectionLoadingRow}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={s.sectionLoadingText}>Analysing…</Text>
      </View>
    </View>
  );
}

function SectionEmpty({ title, icon, message }) {
  return (
    <View style={[s.sectionCard, s.sectionCardDashed]}>
      <View style={s.sectionEmptyContent}>
        <View style={[s.sectionIconWrap, { backgroundColor: colors.primaryLight + "18" }]}>
          <Ionicons name={icon} size={18} color={colors.primaryLight} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.sectionCardTitle}>{title}</Text>
          <Text style={s.sectionEmptyText}>{message}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Expandable wrapper ───────────────────────────────────────────────────────
function Expandable({ icon, iconColor = colors.primary, title, badge, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const rotAnim = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;

  const toggle = () => {
    const toOpen = !open;
    setOpen(toOpen);
    Animated.spring(rotAnim, { toValue: toOpen ? 1 : 0, useNativeDriver: true, tension: 300, friction: 22 }).start();
  };

  const rotate = rotAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={s.sectionCard}>
      <TouchableOpacity onPress={toggle} style={s.expandableHeader} activeOpacity={0.7}>
        <View style={[s.sectionIconWrap, { backgroundColor: iconColor + "15" }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
        <Text style={[s.sectionCardTitle, { flex: 1 }]}>{title}</Text>
        {badge}
        <Animated.View style={{ transform: [{ rotate }], marginLeft: 8 }}>
          <Ionicons name="chevron-down-outline" size={18} color={colors.textLight} />
        </Animated.View>
      </TouchableOpacity>
      {open && <View style={s.expandableContent}>{children}</View>}
    </View>
  );
}

// ─── Numeric line-chart card ──────────────────────────────────────────────────
function NumericFieldChart({ label, weeklyData }) {
  if (weeklyData.length < 2) return null;

  const trendSlice = weeklyData.slice(-8);
  const min = Math.min(...trendSlice.map((w) => w.avg));
  const max = Math.max(...trendSlice.map((w) => w.avg));
  const recent = trendSlice[trendSlice.length - 1]?.avg;
  const first = trendSlice[0]?.avg;
  const trend = trendSlice.length >= 2
    ? (recent - first > 0.1 ? "up" : first - recent > 0.1 ? "down" : "stable")
    : "stable";
  const trendColor = trend === "up" ? colors.success : trend === "down" ? colors.error : colors.textLight;
  const trendIcon = trend === "up" ? "trending-up-outline" : trend === "down" ? "trending-down-outline" : "remove-outline";

  return (
    <View style={s.fieldChartWrap}>
      <View style={s.fieldChartLabelRow}>
        <Text style={s.fieldChartLabel}>{label}</Text>
        <View style={s.fieldChartMeta}>
          <Ionicons name={trendIcon} size={13} color={trendColor} />
          <Text style={[s.fieldChartAvg, { color: trendColor }]}>
            {trend === "stable" ? "Stable" : trend === "up" ? "Improving" : "Declining"}
          </Text>
        </View>
      </View>
      <Text style={s.fieldChartRange}>
        {recent} (recent) · range {min.toFixed(1)}–{max.toFixed(1)}
      </Text>
      <ResponsiveChartWrap>
        {(width) => {
          const slice = weeklyData.slice(-getMaxChartPoints(width));
          const labels = thinChartLabels(
            slice.map((w) => formatCompactChartLabel(w.date || w.label)),
            getMaxVisibleLabels(width)
          );
          const data = {
            labels,
            datasets: [{ data: slice.map((w) => w.avg), color: (o = 1) => `rgba(92,114,74,${o})`, strokeWidth: 2 }],
          };
          return (
            <LineChart
              data={data}
              width={width}
              height={160}
              chartConfig={CHART_CFG}
              bezier
              style={s.chart}
              withShadow={false}
              withInnerLines
              withOuterLines={false}
              fromZero={false}
            />
          );
        }}
      </ResponsiveChartWrap>
    </View>
  );
}

// ─── Categorical distribution ──────────────────────────────────────────────────
function CatBarDistribution({ distribution }) {
  return (
    <>
      {distribution.map(({ label: lbl, pct }, i) => (
        <View key={i} style={s.catBarRow}>
          <Text style={s.catBarLabel} numberOfLines={1}>{lbl}</Text>
          <View style={s.catBarTrack}>
            <View style={[s.catBarFill, { width: `${Math.min(100, pct)}%` }]} />
          </View>
          <Text style={s.catBarPct}>{pct}%</Text>
        </View>
      ))}
    </>
  );
}

function CatDonutDistribution({ distribution }) {
  const size = 132;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size / 2 - 2;
  const innerR = outerR * 0.58;
  const totalPct = distribution.reduce((sum, item) => sum + item.pct, 0) || 100;

  let angle = -Math.PI / 2;
  const slices = distribution.map((item, i) => {
    const sliceAngle = (item.pct / totalPct) * Math.PI * 2;
    const start = angle;
    const end = angle + sliceAngle;
    angle = end;
    return {
      ...item,
      color: DONUT_SLICE_COLORS[i % DONUT_SLICE_COLORS.length],
      path: describeDonutSlice(cx, cy, outerR, innerR, start, end),
    };
  });

  return (
    <View style={s.catDonutWrap}>
      <View style={s.catDonutChart}>
        <Svg width={size} height={size}>
          <G>
            {slices.map((slice, i) => (
              <Path key={i} d={slice.path} fill={slice.color} />
            ))}
          </G>
        </Svg>
      </View>
      <View style={s.catDonutLegend}>
        {slices.map((slice, i) => (
          <View key={i} style={s.catDonutLegendRow}>
            <View style={[s.catDonutDot, { backgroundColor: slice.color }]} />
            <Text style={s.catDonutLegendLabel} numberOfLines={1}>{slice.label}</Text>
            <Text style={s.catDonutLegendPct}>{slice.pct}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function CatDistribution({ label, distribution }) {
  const useBarLayout = distribution.length >= 7;

  return (
    <View style={s.catDistWrap}>
      <Text style={[s.fieldChartLabel, s.catDistLabel]}>{label}</Text>
      {useBarLayout ? (
        <CatBarDistribution distribution={distribution} />
      ) : (
        <CatDonutDistribution distribution={distribution} />
      )}
    </View>
  );
}

// ─── Change row for comparison ─────────────────────────────────────────────────
function ChangeRow({ fieldPath, changeData }) {
  const label = formatFieldPath(fieldPath);
  const {
    percent_change: pct,
    change_direction: dir,
    target_average: targetAvg,
    comparison_average: compAvg,
    target_most_common: targetCat,
    comparison_most_common: compCat,
  } = changeData;

  const isUp   = dir === "increased" || (pct != null && pct > 0);
  const isDown = dir === "decreased" || (pct != null && pct < 0);
  const accentColor = isUp ? colors.success : isDown ? colors.error : colors.warning;

  // ── Numeric field (has actual averages) ──────────────────────────────────
  const isNumeric = targetAvg != null || compAvg != null;
  if (isNumeric) {
    const absPct  = pct != null ? Math.min(100, Math.abs(pct)) : 0;
    const sign    = isUp ? "+" : "";
    const pctLabel = pct != null
      ? `${sign}${Math.abs(pct).toFixed(0)}%`
      : isUp ? "Increased" : isDown ? "Decreased" : "Changed";
    return (
      <View style={s.changeRow}>
        <View style={s.changeRowLeft}>
          <Text style={s.changeRowLabel} numberOfLines={1}>{label}</Text>
          {compAvg != null && targetAvg != null && (
            <Text style={s.changeRowSub}>
              Before: {Number(compAvg).toFixed(1)}{" "}
              <Text style={{ color: accentColor }}>→</Text>{" "}
              Now: {Number(targetAvg).toFixed(1)}
            </Text>
          )}
        </View>
        <View style={s.changeRowRight}>
          <View style={s.changeBarTrack}>
            <View style={[s.changeBarFill, { width: `${absPct}%`, backgroundColor: accentColor }]} />
          </View>
          <View style={[s.changePctBadge, { backgroundColor: accentColor + "18" }]}>
            <Text style={[s.changePctText, { color: accentColor }]}>{pctLabel}</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Categorical field (has most-common values) ───────────────────────────
  const isCategorical = targetCat != null || compCat != null;
  if (isCategorical) {
    const from = toTitleCase(String(compCat  ?? ""));
    const to   = toTitleCase(String(targetCat ?? ""));
    const sameValue = from === to;
    return (
      <View style={s.changeRow}>
        <View style={s.changeRowLeft}>
          <Text style={s.changeRowLabel} numberOfLines={1}>{label}</Text>
          {!sameValue && from && to ? (
            <Text style={s.changeRowSub}>
              Most common: <Text style={{ color: colors.textSecondary }}>"{from}"</Text>
              <Text style={{ color: accentColor }}> → </Text>
              <Text style={{ color: colors.text }}>"{to}"</Text>
            </Text>
          ) : to ? (
            <Text style={s.changeRowSub}>Most common: "{to}"</Text>
          ) : null}
        </View>
        {!sameValue && (
          <Ionicons
            name={isUp ? "arrow-up-circle-outline" : isDown ? "arrow-down-circle-outline" : "swap-horizontal-outline"}
            size={18}
            color={accentColor}
          />
        )}
      </View>
    );
  }

  // ── Boolean or unknown — show a directional icon only ────────────────────
  return (
    <View style={s.changeRow}>
      <View style={s.changeRowLeft}>
        <Text style={s.changeRowLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Ionicons
        name={isUp ? "arrow-up-circle-outline" : isDown ? "arrow-down-circle-outline" : "refresh-circle-outline"}
        size={18}
        color={accentColor}
      />
    </View>
  );
}

// ─── Before / Now bar chart for numeric comparison fields ─────────────────────
function ComparisonBars({ changes }) {
  const numeric = changes.filter(
    ([, v]) => v.target_average != null && v.comparison_average != null
  );
  if (numeric.length === 0) return null;

  const allVals = numeric.flatMap(([, v]) => [v.target_average, v.comparison_average]).filter((x) => x > 0);
  const maxVal = allVals.length ? Math.max(...allVals) : 1;

  return (
    <View style={s.compBarsWrap}>
      {/* Legend */}
      <View style={s.compBarsLegend}>
        <View style={[s.compLegendDot, { backgroundColor: "#D4C5A8" }]} />
        <Text style={s.compLegendText}>Before</Text>
        <View style={[s.compLegendDot, { backgroundColor: colors.primary }]} />
        <Text style={s.compLegendText}>Now</Text>
      </View>

      {numeric.slice(0, 4).map(([field, v]) => {
        const bPct = maxVal > 0 ? Math.min(100, (v.comparison_average / maxVal) * 100) : 0;
        const nPct = maxVal > 0 ? Math.min(100, (v.target_average / maxVal) * 100) : 0;
        const isIncrease = v.target_average > v.comparison_average;
        const barColor = isIncrease ? colors.success : colors.error;
        const pct = v.percent_change;
        const sign = isIncrease ? "+" : "";

        return (
          <View key={field} style={s.compBarField}>
            <View style={s.compBarHeader}>
              <Text style={s.compBarLabel}>{formatFieldPath(field)}</Text>
              {pct != null && (
                <Text style={[s.compBarPct, { color: barColor }]}>
                  {sign}{Math.abs(pct).toFixed(0)}%
                </Text>
              )}
            </View>

            {/* Before row */}
            <View style={s.compBarRow}>
              <Text style={s.compBarRowLabel}>Before</Text>
              <View style={s.compBarTrack}>
                <View style={[s.compBarFill, { width: `${bPct}%`, backgroundColor: "#D4C5A8" }]} />
              </View>
              <Text style={s.compBarValue}>{Number(v.comparison_average).toFixed(1)}</Text>
            </View>

            {/* Now row */}
            <View style={s.compBarRow}>
              <Text style={s.compBarRowLabel}>Now</Text>
              <View style={s.compBarTrack}>
                <View style={[s.compBarFill, { width: `${nPct}%`, backgroundColor: barColor + "CC" }]} />
              </View>
              <Text style={[s.compBarValue, { color: barColor }]}>{Number(v.target_average).toFixed(1)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Period Tracker Overview content ─────────────────────────────────────────
function PeriodOverview({ insights, currentCycleDay, currentPhase, daysUntilNext }) {
  const reg = insights?.regularity;
  const pred = insights?.prediction_accuracy;
  const compPrev = insights?.comparison_with_previous;
  const corr = insights?.correlations;
  const phaseInfo = currentPhase ? PHASE_CFG[currentPhase] : null;
  const regInfo = reg ? (REG_CFG[reg.regularity_level] || REG_CFG.somewhat_regular) : null;
  const regScore = reg?.regularity_score;

  return (
    <View style={s.sections}>
      {currentCycleDay != null && (
        <View style={s.cycleStatusCard}>
          <View style={{ flex: 1 }}>
            <Text style={s.cycleDayNum}>Day {currentCycleDay}</Text>
            <Text style={s.cycleDayLabel}>of your current cycle</Text>
            {daysUntilNext != null && (
              <View style={s.nextPeriodRow}>
                <Ionicons name="calendar-outline" size={13} color={colors.textLight} />
                <Text style={s.nextPeriodText}>
                  {daysUntilNext === 0 ? "Period expected today" : `Next period in ${daysUntilNext}d`}
                </Text>
              </View>
            )}
          </View>
          {phaseInfo && (
            <View style={[s.phaseChip, { backgroundColor: phaseInfo.bg }]}>
              <Ionicons name={phaseInfo.icon} size={16} color={phaseInfo.color} />
              <Text style={[s.phaseChipText, { color: phaseInfo.color }]}>{phaseInfo.label}</Text>
            </View>
          )}
        </View>
      )}

      {reg && (
        <SectionCard icon="pulse-outline" iconColor={regInfo?.color || colors.primary} title="Cycle Regularity">
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              {regInfo && <Badge label={regInfo.label} color={regInfo.color} bg={regInfo.bg} />}
              {regScore != null && <Text style={s.regScore}>{regScore.toFixed(0)}/100</Text>}
            </View>
            {regScore != null && <ProgressBar value={regScore} max={100} color={regInfo?.color || colors.primary} />}
            {reg.medical_note ? <Text style={s.detailText}>{reg.medical_note}</Text> : null}
          </View>
        </SectionCard>
      )}

      {pred && (
        <SectionCard icon="analytics-outline" iconColor={colors.textSecondary} title="Prediction Accuracy">
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View>
              <Text style={s.predBig}>{pred.average_error_days != null ? `\u00b1${pred.average_error_days.toFixed(1)}d` : "\u2014"}</Text>
              <Text style={s.predSmall}>avg. error</Text>
            </View>
            {pred.accuracy_level && (
              <Badge
                label={pred.accuracy_level.replace(/_/g, " ")}
                color={pred.accuracy_level === "high" ? colors.success : pred.accuracy_level === "medium" ? colors.warning : colors.textLight}
                bg={pred.accuracy_level === "high" ? "#ECFDF5" : pred.accuracy_level === "medium" ? "#FFFBEB" : "#F4F4F4"}
              />
            )}
          </View>
          {pred.recommendation ? <Text style={s.detailText}>{pred.recommendation}</Text> : null}
        </SectionCard>
      )}

      {compPrev?.has_comparison && (
        <SectionCard icon="git-compare-outline" iconColor={colors.secondary} title="Cycle Comparison">
          {(compPrev.cycle_insights || compPrev.insights || []).slice(0, 2).map((ins, i) => (
            <Text key={i} style={s.bulletText}>• {ins}</Text>
          ))}
        </SectionCard>
      )}

      {corr?.has_correlations && (
        <Expandable icon="git-branch-outline" iconColor={colors.primary} title="Correlations"
          badge={<Badge label={String((corr.top_correlations || corr.correlations || []).length)} color={colors.primary} />}>
          {(corr.top_correlations || corr.correlations || []).slice(0, 5).map((c, i) => (
            <Text key={i} style={[s.detailText, i > 0 && { marginTop: 6 }]}>• {formatInsightText(c.insight || "")}</Text>
          ))}
        </Expandable>
      )}
    </View>
  );
}

// ─── General Tracker Insights — scrollable section cards ─────────────────────
function GeneralInsights({ insights, trackerId }) {
  // All three start as true so the loading card is shown on first render
  // before the async effects have a chance to fire.
  const [entries, setEntries] = useState(null);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [compareData, setCompareData] = useState(null);
  const [compareLoading, setCompareLoading] = useState(true);
  const [patternData, setPatternData] = useState(null);
  const [patternLoading, setPatternLoading] = useState(true);
  const [comparePeriod, setComparePeriod] = useState("general");
  const [evolutionPeriod, setEvolutionPeriod] = useState("3m");
  const [formSchema, setFormSchema] = useState(null);
  const [selectedEvolutionField, setSelectedEvolutionField] = useState(null);
  // Correlations fetched directly with a generous threshold so more show up
  const [directCorr, setDirectCorr] = useState(null);
  const [corrLoading, setCorrLoading] = useState(true);

  // Load tracking data (for time evolution charts)
  const loadEntries = useCallback(async (periodId) => {
    if (!trackerId) return;
    const cfg = EVOLUTION_PERIODS.find((p) => p.id === periodId) || EVOLUTION_PERIODS[2];
    const end = new Date().toISOString().split("T")[0];
    const start = new Date(Date.now() - cfg.days * 86400000).toISOString().split("T")[0];
    try {
      setEntriesLoading(true);
      const res = await dataTrackingService.getDataRange(trackerId, start, end, { params: { per_page: 100 } });
      const raw = res?.data?.tracking_data || res?.tracking_data || (Array.isArray(res?.data) ? res.data : []);
      setEntries(Array.isArray(raw) ? raw : []);
    } catch {
      setEntries([]);
    } finally {
      setEntriesLoading(false);
    }
  }, [trackerId]);

  useEffect(() => { loadEntries(evolutionPeriod); }, [loadEntries, evolutionPeriod]);

  // Load form schema for non-masked field list
  useEffect(() => {
    if (!trackerId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await trackerService.getFormSchema(trackerId);
        if (!cancelled) setFormSchema(res?.data || res);
      } catch {
        if (!cancelled) setFormSchema(null);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [trackerId]);

  // Load comparison
  const loadCompare = useCallback(async (period) => {
    if (!trackerId) return;
    try {
      setCompareLoading(true);
      const res = await dataTrackingService.getCompare(trackerId, { comparison_type: period });
      setCompareData(res?.data || res);
    } catch { setCompareData(null); }
    finally { setCompareLoading(false); }
  }, [trackerId]);

  useEffect(() => { loadCompare("general"); }, [loadCompare]);

  const handleComparePeriodChange = (p) => {
    const apiType = p === "week" ? "week" : p === "month" ? "month" : "general";
    setComparePeriod(p);
    loadCompare(apiType);
  };

  // Load patterns
  useEffect(() => {
    if (!trackerId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setPatternLoading(true);
        const res = await dataTrackingService.getPatternSummary(trackerId, [], 6);
        if (!cancelled) setPatternData(res?.data || res);
      } catch (err) {
        if (!cancelled) {
          setPatternData({
            patterns_found: 0,
            total_patterns_detected: 0,
            message: err?.response?.data?.error || "Could not load patterns. Try again later.",
          });
        }
      } finally {
        if (!cancelled) setPatternLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [trackerId]);

  const hasPatternResults = Boolean(
    patternData &&
    (
      (patternData.patterns_found > 0) ||
      (patternData.total_patterns_detected > 0) ||
      Object.keys(patternData.field_patterns || {}).length > 0
    )
  );

  // Fetch correlations directly — 6 months, threshold 0.2 (wider than the
  // general-analysis default of 0.3) so we always show something meaningful.
  useEffect(() => {
    if (!trackerId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setCorrLoading(true);
        const res = await dataTrackingService.getCorrelations(trackerId, {
          months: 6,
          min_correlation: 0.2,
        });
        if (!cancelled) setDirectCorr(res?.data || res);
      } catch {
        // Fall back to whatever general-analysis provided
        if (!cancelled) setDirectCorr(null);
      } finally {
        if (!cancelled) setCorrLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [trackerId]);

  // Process entries into series — granularity depends on selected period
  const evolutionGran = (EVOLUTION_PERIODS.find((p) => p.id === evolutionPeriod) || EVOLUTION_PERIODS[2]).gran;
  const { numericSeries, catSeries, entryCounts } = useMemo(
    () => (entries ? processEntries(entries, evolutionGran) : { numericSeries: [], catSeries: [], entryCounts: {} }),
    [entries, evolutionGran]
  );

  const fieldEntryCounts = useMemo(() => {
    const counts = {};
    Object.entries(entryCounts).forEach(([path, count]) => {
      const fieldName = getFieldNameFromPath(path);
      counts[fieldName] = (counts[fieldName] || 0) + count;
    });
    return counts;
  }, [entryCounts]);

  const evolutionFieldOptions = useMemo(() => {
    const schemaFields = collectSchemaFields(formSchema);
    if (schemaFields.length) return schemaFields;
    return Object.keys(fieldEntryCounts)
      .sort((a, b) => (fieldEntryCounts[b] || 0) - (fieldEntryCounts[a] || 0))
      .map((fieldName) => ({
        fieldName,
        label: formatFieldCategory(fieldName),
      }));
  }, [formSchema, fieldEntryCounts]);

  const chartableFieldNames = useMemo(() => {
    const names = new Set();
    numericSeries.forEach(({ fieldPath }) => names.add(getFieldNameFromPath(fieldPath)));
    catSeries.forEach(({ fieldPath }) => names.add(getFieldNameFromPath(fieldPath)));
    return names;
  }, [numericSeries, catSeries]);

  const defaultEvolutionField = useMemo(() => {
    if (!evolutionFieldOptions.length) return null;
    return evolutionFieldOptions.reduce((best, { fieldName }) => {
      if (!best) return fieldName;
      return (fieldEntryCounts[fieldName] || 0) > (fieldEntryCounts[best] || 0) ? fieldName : best;
    }, null);
  }, [evolutionFieldOptions, fieldEntryCounts]);

  useEffect(() => {
    if (!defaultEvolutionField) {
      setSelectedEvolutionField(null);
      return;
    }
    setSelectedEvolutionField((prev) => {
      if (prev && evolutionFieldOptions.some((o) => o.fieldName === prev)) return prev;
      return defaultEvolutionField;
    });
  }, [defaultEvolutionField, evolutionFieldOptions]);

  const selectedNumericSeries = numericSeries.filter(
    (series) => getFieldNameFromPath(series.fieldPath) === selectedEvolutionField
  );
  const selectedCatSeries = catSeries.filter(
    (series) => getFieldNameFromPath(series.fieldPath) === selectedEvolutionField
  );
  const selectedFieldIsChartable = selectedNumericSeries.length > 0 || selectedCatSeries.length > 0;

  const summary = insights?.tracking_summary;
  // Prefer the directly-fetched correlations (wider net) over the one baked
  // into the general-analysis response which uses a tighter threshold.
  const correlations = directCorr ?? insights?.correlations;
  // Only show fields that actually changed (hide stable ones)
  const allChanges = Object.entries(compareData?.top_changes || {}).filter(
    ([, v]) => v.change_direction !== "stable" && v.changed !== false
  );
  const significantChanges = allChanges.filter(([, v]) => v.is_significant);

  return (
    <View style={s.sections}>

      {/* 1 ── Summary stats */}
      {summary && (
        <View style={s.statsRow}>
          <StatBox icon="layers-outline" value={summary.total_entries} label="Entries" />
          <View style={s.statsDiv} />
          <StatBox icon="calendar-outline" value={summary.tracking_days} label="Days tracked" color={colors.textSecondary} />
          {summary.first_entry && (
            <>
              <View style={s.statsDiv} />
              <StatBox icon="time-outline" value={summary.first_entry?.slice(0, 7)} label="Since" color={colors.textLight} />
            </>
          )}
        </View>
      )}

      {/* 2 ── Time Evolution */}
      <SectionCard
        icon="trending-up-outline"
        iconColor={colors.primary}
        title="Time Evolution"
        headerRight={
          evolutionFieldOptions.length > 0 ? (
            <EvolutionFieldDropdown
              options={evolutionFieldOptions}
              selectedFieldName={selectedEvolutionField}
              chartableFieldNames={chartableFieldNames}
              onSelect={setSelectedEvolutionField}
            />
          ) : null
        }
      >
        {/* Period selector */}
        <View style={s.periodSel}>
          {EVOLUTION_PERIODS.map((o) => (
            <TouchableOpacity
              key={o.id}
              onPress={() => setEvolutionPeriod(o.id)}
              style={[s.periodOpt, evolutionPeriod === o.id && s.periodOptActive]}
              activeOpacity={0.7}
            >
              <Text style={[s.periodOptText, evolutionPeriod === o.id && s.periodOptTextActive]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {entriesLoading ? (
          <View style={s.sectionLoadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={s.sectionLoadingText}>Loading…</Text>
          </View>
        ) : !selectedEvolutionField ? (
          <Text style={s.noDataText}>
            No trackable fields yet — add fields to your tracker to see trends here.
          </Text>
        ) : !selectedFieldIsChartable ? (
          <Text style={s.noDataText}>
            Not enough entries for this field in this window — try a longer period or keep logging.
          </Text>
        ) : (
          <View style={s.evoOptionsWrap}>
            {selectedNumericSeries.map(({ fieldPath, label, weeklyData }) => (
              <NumericFieldChart key={fieldPath} label={label} weeklyData={weeklyData} />
            ))}
            {selectedCatSeries.length > 0 && (
              <View style={[s.evoCatOptionsWrap, selectedNumericSeries.length > 0 && s.catDivider]}>
                {selectedCatSeries.map(({ fieldPath, label, distribution }) => (
                  <CatDistribution key={fieldPath} label={label} distribution={distribution} />
                ))}
              </View>
            )}
          </View>
        )}
      </SectionCard>

      {/* 3 ── Comparisons */}
      {compareLoading ? (
        <SectionLoading title="Comparisons" icon="swap-vertical-outline" />
      ) : !compareData || !compareData.has_comparison ? (
        <SectionEmpty
          title="Comparisons"
          icon="swap-vertical-outline"
          message={compareData
            ? "Not enough data for a comparison yet. Keep logging consistently."
            : "Could not load comparison. Try again later."}
        />
      ) : (
        <SectionCard
          icon="swap-vertical-outline"
          iconColor={colors.primary}
          title="Comparisons"
          badge={
            significantChanges.length > 0 ? (
              <Badge label={`${significantChanges.length} significant`} color={colors.primary} />
            ) : null
          }
        >
          {/* Period selector */}
          <View style={s.periodSel}>
            {[
              { id: "general", label: "vs Baseline" },
              { id: "month", label: "Month" },
              { id: "week", label: "Week" },
            ].map((o) => (
              <TouchableOpacity
                key={o.id}
                onPress={() => handleComparePeriodChange(o.id)}
                style={[s.periodOpt, comparePeriod === o.id && s.periodOptActive]}
                activeOpacity={0.7}
              >
                <Text style={[s.periodOptText, comparePeriod === o.id && s.periodOptTextActive]}>
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Summary insight */}
          {(compareData.insights || []).slice(0, 1).map((ins, i) => (
            <Text key={i} style={[s.detailText, { marginBottom: 12 }]}>{formatInsightText(ins)}</Text>
          ))}

          {/* Numeric before/now comparison bars */}
          <ComparisonBars changes={allChanges} />

          {/* All non-stable changes */}
          {allChanges.length > 0 ? (
            <View style={[s.changesList, allChanges.length > 0 && { borderTopWidth: 1, borderTopColor: "#EDE5D8", paddingTop: 12 }]}>
              {allChanges.map(([field, data]) => (
                <ChangeRow key={field} fieldPath={field} changeData={data} />
              ))}
            </View>
          ) : compareData?.top_changes && Object.keys(compareData.top_changes).length > 0 ? (
            <Text style={s.noDataText}>
              Everything is tracking consistently — no notable shifts for this period.
            </Text>
          ) : (
            <Text style={s.noDataText}>
              No field changes detected yet. Keep logging to see how your habits shift over time.
            </Text>
          )}
        </SectionCard>
      )}

      {/* 4 ── Correlations */}
      {corrLoading ? (
        <SectionLoading title="Correlations" icon="git-branch-outline" />
      ) : !correlations || !correlations.has_correlations ? (
        <SectionEmpty
          title="Correlations"
          icon="git-branch-outline"
          message={
            correlations?.message ||
            "Keep logging consistently — correlations appear once patterns emerge across your entries."
          }
        />
      ) : (
        <Expandable
          icon="git-branch-outline"
          iconColor={colors.primary}
          title="Correlations"
          badge={
            <Badge
              label={`${(correlations.correlations || correlations.top_correlations || []).length} found`}
              color={colors.primary}
            />
          }
          defaultOpen
        >
          <Text style={[s.detailText, { marginBottom: 10 }]}>
            How your tracked fields relate to each other:
          </Text>
          {(correlations.correlations || correlations.top_correlations || []).slice(0, 5).map((corr, i) => {
            const str = corr.strength != null ? Math.abs(corr.strength) : Math.abs(corr.correlation ?? 0);
            const strPct = Math.round(str * 100);
            const barColor = strPct >= 60 ? colors.primary : strPct >= 35 ? colors.warning : colors.textLight;
            return (
              <View key={i} style={[s.corrItem, i > 0 && s.corrItemBorder]}>
                {corr.scope === "within_field" ? (
                  <View style={{ marginBottom: 4 }}>
                    <Badge label="Same field" color={colors.textSecondary} />
                  </View>
                ) : null}
                <Text style={s.corrText}>{formatInsightText(corr.insight || "")}</Text>
                <View style={s.corrMeta}>
                  <View style={s.corrBarWrap}>
                    <ProgressBar value={strPct} max={100} color={barColor} h={5} />
                  </View>
                  <Text style={[s.corrStrength, { color: barColor }]}>{strPct}%</Text>
                </View>
              </View>
            );
          })}
        </Expandable>
      )}

      {/* 5 ── Patterns */}
      {patternLoading ? (
        <SectionLoading title="Patterns" icon="repeat-outline" />
      ) : !hasPatternResults ? (
        <SectionEmpty
          title="Patterns"
          icon="repeat-outline"
          message={
            patternData?.message ||
            "Keep tracking consistently to detect recurring patterns in your data."
          }
        />
      ) : (
        <Expandable
          icon="repeat-outline"
          iconColor={colors.textSecondary}
          title="Patterns"
          badge={
            <Badge label={`${patternData.total_patterns_detected}`} color={colors.textSecondary} />
          }
        >
          <Text style={[s.detailText, { marginBottom: 10 }]}>
            Recurring trends — weekdays, streaks, and time-of-month rhythms:
          </Text>
          {patternData.overall_insight ? (
            <Text style={[s.detailText, { marginBottom: 10 }]}>{patternData.overall_insight}</Text>
          ) : null}
          {Object.entries(patternData.field_patterns || {}).map(([fp, p], i) => {
            const strength = p.pattern_strength || "weak";
            const sc = strength === "strong" ? colors.primary : strength === "medium" ? colors.warning : colors.textLight;
            return (
              <View key={i} style={[s.patternRow, i > 0 && s.corrItemBorder]}>
                <View style={s.patternRowHeader}>
                  <Text style={s.patternFieldLabel}>{formatFieldPath(fp)}</Text>
                  <Badge label={strength} color={sc} />
                </View>
                {p.key_insight ? (
                  <Text style={s.patternInsight}>{formatInsightText(p.key_insight)}</Text>
                ) : null}
              </View>
            );
          })}
        </Expandable>
      )}
    </View>
  );
}

// ─── Period Tracker Trends ─────────────────────────────────────────────────────
function PeriodTrendsContent({ cycleHistory }) {
  const allValid = cycleHistory.filter((c) => c.cycle_length > 10 && c.cycle_length < 70);
  const allPeriCycles = cycleHistory.filter((c) => c.period_length > 0 && c.period_length < 20);
  const valid = allValid.slice(-8);
  const periCycles = allPeriCycles.slice(-8);
  const avgCycle = valid.length ? Math.round(valid.reduce((s, c) => s + c.cycle_length, 0) / valid.length) : null;
  const avgPeriod = periCycles.length ? (periCycles.reduce((s, c) => s + c.period_length, 0) / periCycles.length).toFixed(1) : null;

  return (
    <View style={s.sections}>
      {(avgCycle || avgPeriod) && (
        <View style={s.statsRow}>
          {avgCycle && <StatBox icon="repeat-outline" value={`${avgCycle}d`} label="Avg cycle" />}
          {avgCycle && avgPeriod && <View style={s.statsDiv} />}
          {avgPeriod && <StatBox icon="water-outline" value={`${avgPeriod}d`} label="Avg period" color={colors.menstrual} />}
          {valid.length > 0 && <><View style={s.statsDiv} /><StatBox icon="layers-outline" value={valid.length} label="Cycles" color={colors.textSecondary} /></>}
        </View>
      )}

      {valid.length >= 2 ? (
        <SectionCard icon="trending-up-outline" title="Cycle Length History">
          <Text style={s.chartSub}>Last {valid.length} cycles (days)</Text>
          <ResponsiveChartWrap>
            {(width) => {
              const chartCycles = valid.slice(-getMaxChartPoints(width));
              const cycleData = {
                labels: thinChartLabels(
                  chartCycles.map((_, i) => `C${valid.length - chartCycles.length + i + 1}`),
                  getMaxVisibleLabels(width)
                ),
                datasets: [
                  { data: chartCycles.map((c) => c.cycle_length), color: (o = 1) => `rgba(92,114,74,${o})`, strokeWidth: 2.5 },
                  { data: chartCycles.map(() => avgCycle), color: (o = 1) => `rgba(199,183,147,${o * 0.9})`, strokeWidth: 1.5, withDots: false },
                ],
                legend: ["Cycle length", "Average"],
              };
              return (
                <LineChart
                  data={cycleData}
                  width={width}
                  height={175}
                  chartConfig={CHART_CFG}
                  bezier
                  style={s.chart}
                  withShadow={false}
                  withInnerLines
                  withOuterLines={false}
                  fromZero={false}
                  yAxisSuffix="d"
                />
              );
            }}
          </ResponsiveChartWrap>
        </SectionCard>
      ) : (
        <SectionEmpty title="Cycle Length Chart" icon="trending-up-outline" message="Need at least 2 complete cycles to show this chart." />
      )}

      {periCycles.length >= 2 ? (
        <SectionCard icon="water-outline" iconColor={colors.menstrual} title="Period Length">
          <Text style={s.chartSub}>Days per cycle</Text>
          <ResponsiveChartWrap style={s.chartWrapBar}>
            {(width) => {
              const chartCycles = periCycles.slice(-getMaxChartPoints(width));
              const periodData = {
                labels: thinChartLabels(
                  chartCycles.map((_, i) => `C${periCycles.length - chartCycles.length + i + 1}`),
                  getMaxVisibleLabels(width)
                ),
                datasets: [{ data: chartCycles.map((c) => Math.max(1, c.period_length)) }],
              };
              return (
                <BarChart
                  data={periodData}
                  width={width}
                  height={175}
                  chartConfig={{
                    ...CHART_CFG,
                    color: (o = 1) => `rgba(139,21,56,${o * 0.85})`,
                    backgroundGradientFrom: "#FFF5F7",
                    backgroundGradientTo: "#FFF0F3",
                  }}
                  style={s.chartBar}
                  withInnerLines={false}
                  showValuesOnTopOfBars
                  fromZero
                  yAxisSuffix="d"
                />
              );
            }}
          </ResponsiveChartWrap>
        </SectionCard>
      ) : null}
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
  const { width: screenWidth } = useWindowDimensions();
  const { tabWidth } = useMemo(() => getLayoutWidths(screenWidth), [screenWidth]);
  const [activeTab, setActiveTab] = useState("overview");
  const tabAnim = useRef(new Animated.Value(0)).current;

  const switchTab = (tab) => {
    Animated.spring(tabAnim, { toValue: tab === "overview" ? 0 : 1, useNativeDriver: true, tension: 300, friction: 22 }).start();
    setActiveTab(tab);
  };

  // Cycle-day derivation (period tracker only)
  const currentCycle = cycleHistory.find((c) => !c.cycle_end_date);
  const today = new Date();
  let currentCycleDay = null, daysUntilNext = null, currentPhase = null;
  if (currentCycle) {
    const cs = new Date(currentCycle.cycle_start_date || currentCycle.period_start_date);
    if (!isNaN(cs)) currentCycleDay = Math.floor((today - cs) / 86400000) + 1;
    if (currentCycle.predicted_next_period_date) {
      const nd = new Date(currentCycle.predicted_next_period_date);
      if (!isNaN(nd)) daysUntilNext = Math.max(0, Math.floor((nd - today) / 86400000));
    }
    if (currentCycleDay) {
      const ps = new Date(currentCycle.period_start_date);
      const pe = currentCycle.period_end_date ? new Date(currentCycle.period_end_date) : new Date(ps.getTime() + (currentCycle.period_length || 5) * 86400000);
      if (today <= pe) { currentPhase = "menstrual"; }
      else {
        const ov = (currentCycle.cycle_length || 28) - 14;
        currentPhase = currentCycleDay >= ov - 2 && currentCycleDay <= ov + 2 ? "ovulation" : currentCycleDay < ov - 2 ? "follicular" : "luteal";
      }
    }
  }

  const indicatorX = tabAnim.interpolate({ inputRange: [0, 1], outputRange: [0, tabWidth] });

  if (insightsLoading) {
    return (
      <View style={s.container}>
        <Text style={s.mainTitle}>Insights</Text>
        <View style={s.centreLoader}><ActivityIndicator color={colors.primary} size="large" /><Text style={s.loaderText}>Analysing your data…</Text></View>
      </View>
    );
  }

  if (!insights) {
    return (
      <View style={s.container}>
        <Text style={s.mainTitle}>Insights</Text>
        <View style={s.globalEmpty}>
          <View style={s.globalEmptyIcon}><Ionicons name="analytics-outline" size={36} color={colors.primaryLight} /></View>
          <Text style={s.emptyTitle}>No insights yet</Text>
          <Text style={s.emptyBody}>Keep logging daily — insights appear after a few entries.</Text>
        </View>
      </View>
    );
  }

  // ── General tracker: no tabs, just scrollable section cards
  if (!isPeriodTracker) {
    return (
      <View style={s.container}>
        <View style={s.mainHeader}>
          <Text style={s.mainTitle}>Insights</Text>
          <View style={s.smartBadge}>
            <Ionicons name="flash-outline" size={11} color={colors.primary} />
            <Text style={s.smartBadgeText}>Smart</Text>
          </View>
        </View>
        <GeneralInsights insights={insights} trackerId={trackerId} />
      </View>
    );
  }

  // ── Period tracker: keep Overview / Trends tabs
  return (
    <View style={s.container}>
      <View style={s.mainHeader}>
        <Text style={s.mainTitle}>Insights</Text>
        <View style={s.smartBadge}>
          <Ionicons name="flash-outline" size={11} color={colors.primary} />
          <Text style={s.smartBadgeText}>Smart</Text>
        </View>
      </View>

      <View style={s.tabBar}>
        <Animated.View style={[s.tabIndicator, { width: tabWidth, transform: [{ translateX: indicatorX }] }]} />
        {["overview", "trends"].map((tab) => (
          <TouchableOpacity key={tab} onPress={() => switchTab(tab)} style={[s.tabBtn, { width: tabWidth }]} activeOpacity={0.7}>
            <Ionicons name={tab === "overview" ? "grid-outline" : "trending-up-outline"} size={14} color={activeTab === tab ? colors.primary : colors.textLight} />
            <Text style={[s.tabLabel, activeTab === tab && s.tabLabelActive]}>
              {tab === "overview" ? "Overview" : "Trends"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === "overview" ? (
        <PeriodOverview insights={insights} currentCycleDay={currentCycleDay} currentPhase={currentPhase} daysUntilNext={daysUntilNext} />
      ) : (
        <PeriodTrendsContent cycleHistory={cycleHistory} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CARD_STYLE = {
  backgroundColor: colors.insightsCard,
  borderRadius: 16,
  padding: 16,
  borderWidth: 1,
  borderColor: "#F0E8D8",
  shadowColor: "#C7B793",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.13,
  shadowRadius: 5,
  elevation: 2,
};

const s = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8, backgroundColor: colors.background },
  mainHeader: { flexDirection: "row", alignItems: "center", marginBottom: 16, gap: 10 },
  mainTitle: { fontSize: 22, fontWeight: "700", color: colors.text, letterSpacing: -0.4 },
  smartBadge: { flexDirection: "row", alignItems: "center", backgroundColor: colors.primary + "12", borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, gap: 3 },
  smartBadgeText: { fontSize: 11, fontWeight: "600", color: colors.primary },

  // Tabs (period tracker only)
  tabBar: { flexDirection: "row", backgroundColor: "#F3EFE7", borderRadius: 12, marginBottom: 16, padding: 3, overflow: "hidden" },
  tabIndicator: { position: "absolute", top: 3, left: 3, height: "100%", backgroundColor: colors.background, borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3, elevation: 2 },
  tabBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 9, gap: 6, zIndex: 1 },
  tabLabel: { fontSize: 13, fontWeight: "500", color: colors.textLight },
  tabLabelActive: { color: colors.text, fontWeight: "600" },

  // Sections container
  sections: { gap: 14 },

  // Section card
  sectionCard: { ...CARD_STYLE, overflow: "visible" },
  sectionCardDashed: { borderStyle: "dashed", shadowOpacity: 0 },
  sectionCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  sectionIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  sectionCardTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  sectionLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 },
  sectionLoadingText: { fontSize: 13, color: colors.textLight },
  sectionEmptyContent: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  sectionEmptyText: { fontSize: 13, color: colors.textLight, lineHeight: 18, marginTop: 4 },

  // Expandable
  expandableHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  expandableContent: { marginTop: 14 },

  // Stats row
  statsRow: { flexDirection: "row", ...CARD_STYLE, padding: 0, overflow: "hidden" },
  statsDiv: { width: 1, backgroundColor: "#EDE5D8" },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 16, paddingHorizontal: 8, gap: 4 },
  statIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  statValue: { fontSize: 19, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  statLabel: { fontSize: 10, color: colors.textLight, textAlign: "center" },

  // Badge
  badge: { flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "700" },

  // Progress
  progTrack: { backgroundColor: "#EDE5D8", borderRadius: 99, overflow: "hidden", width: "100%" },
  progFill: { borderRadius: 99 },

  // Text
  detailText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19 },
  bulletText: { fontSize: 13, color: colors.textSecondary, lineHeight: 19, marginTop: 2 },
  noDataText: { fontSize: 13, color: colors.textLight, fontStyle: "italic" },

  // Numeric field chart
  evoOptionsWrap: { gap: 28, marginTop: 4 },
  evoCatOptionsWrap: { gap: 24 },
  fieldChartWrap: { paddingBottom: 4 },
  fieldChartLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  fieldChartLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
  fieldChartMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  fieldChartAvg: { fontSize: 12, fontWeight: "600" },
  fieldChartRange: { fontSize: 11, color: colors.textLight, marginBottom: 12 },
  // chartWrap gives the SVG labels room below (overflow visible) and prevents
  // the card's borderRadius from clipping the bottom x-axis labels.
  chartWrap: { overflow: "visible", paddingBottom: 10 },
  chartWrapBar: { paddingBottom: 24 },
  chart: { borderRadius: 10 },
  chartBar: { borderRadius: 10, marginBottom: 6 },
  chartSub: { fontSize: 12, color: colors.textLight, marginBottom: 12 },

  // Categorical distribution
  catDistWrap: { paddingBottom: 4 },
  catDistLabel: { marginBottom: 10 },
  catDivider: { marginTop: 4, paddingTop: 20, borderTopWidth: 1, borderTopColor: "#EDE5D8" },
  catBarRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  catBarLabel: { width: 96, fontSize: 12, color: colors.text },
  catBarTrack: { flex: 1, height: 10, backgroundColor: "#EDE5D8", borderRadius: 99, overflow: "hidden" },
  catBarFill: { height: 10, borderRadius: 99, backgroundColor: colors.primary + "CC" },
  catBarPct: { width: 36, fontSize: 11, fontWeight: "700", color: colors.textSecondary, textAlign: "right" },
  catDonutWrap: { flexDirection: "row", alignItems: "center", gap: 16 },
  catDonutChart: { width: 132, height: 132, alignItems: "center", justifyContent: "center" },
  catDonutLegend: { flex: 1, gap: 8 },
  catDonutLegendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  catDonutDot: { width: 10, height: 10, borderRadius: 5 },
  catDonutLegendLabel: { flex: 1, fontSize: 12, color: colors.text },
  catDonutLegendPct: { fontSize: 11, fontWeight: "700", color: colors.textSecondary, width: 36, textAlign: "right" },

  // Period selector
  periodSel: { flexDirection: "row", gap: 6, marginBottom: 14 },
  periodOpt: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: "center", backgroundColor: "#F3EFE7" },
  periodOptActive: { backgroundColor: colors.primary },
  periodOptText: { fontSize: 12, fontWeight: "500", color: colors.textLight },
  periodOptTextActive: { color: "#fff", fontWeight: "700" },

  // Time evolution field dropdown
  evoFieldDropdownWrap: { position: "relative", zIndex: 20, maxWidth: 140, marginLeft: 8 },
  evoFieldDropdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F3EFE7",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#EDE5D8",
  },
  evoFieldDropdownBtnStale: {
    backgroundColor: "#F8F5EF",
    borderColor: colors.secondaryLight,
  },
  evoFieldDropdownBtnText: {
    flex: 1,
    fontSize: 11,
    fontWeight: "600",
    color: colors.text,
  },
  evoFieldDropdownTextStale: { color: colors.secondaryLight },
  evoFieldDropdownBackdrop: {
    position: "absolute",
    top: -400,
    left: -400,
    right: -400,
    bottom: -400,
    zIndex: 21,
  },
  evoFieldDropdownMenu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: 4,
    minWidth: 180,
    maxWidth: 220,
    maxHeight: 220,
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EDE5D8",
    zIndex: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    overflow: "hidden",
  },
  evoFieldDropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#F3EFE7",
  },
  evoFieldDropdownItemActive: { backgroundColor: colors.primary + "12" },
  evoFieldDropdownItemText: { fontSize: 12, fontWeight: "500", color: colors.text },
  evoFieldDropdownItemStale: { color: colors.secondaryLight, fontWeight: "400" },
  evoFieldDropdownItemTextActive: { color: colors.primary, fontWeight: "700" },

  // Change rows
  changesList: { gap: 12 },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 },
  changeRowLeft: { flex: 1 },
  changeRowLabel: { fontSize: 13, fontWeight: "600", color: colors.text },
  changeRowSub: { fontSize: 11, color: colors.textLight, marginTop: 2, lineHeight: 16 },
  changeRowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  changeBarTrack: { width: 56, height: 7, backgroundColor: "#EDE5D8", borderRadius: 99, overflow: "hidden" },
  changeBarFill: { height: 7, borderRadius: 99 },
  changePctBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, minWidth: 44, alignItems: "center" },
  changePctText: { fontSize: 11, fontWeight: "700" },

  // Comparison bars (before/now)
  compBarsWrap: { marginBottom: 14, gap: 12 },
  compBarsLegend: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  compLegendDot: { width: 8, height: 8, borderRadius: 4 },
  compLegendText: { fontSize: 11, color: colors.textLight, marginRight: 8 },
  compBarField: { gap: 4 },
  compBarHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  compBarLabel: { fontSize: 12, fontWeight: "600", color: colors.text },
  compBarPct: { fontSize: 12, fontWeight: "700" },
  compBarRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  compBarRowLabel: { fontSize: 10, color: colors.textLight, width: 34 },
  compBarTrack: { flex: 1, height: 9, backgroundColor: "#EDE5D8", borderRadius: 99, overflow: "hidden" },
  compBarFill: { height: 9, borderRadius: 99 },
  compBarValue: { fontSize: 11, fontWeight: "600", color: colors.textSecondary, width: 28, textAlign: "right" },

  // Correlations
  corrItem: { paddingVertical: 10, gap: 6 },
  corrItemBorder: { borderTopWidth: 1, borderTopColor: "#EDE5D8" },
  corrText: { fontSize: 13, color: colors.text, lineHeight: 18 },
  corrMeta: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%" },
  corrBarWrap: { flex: 1, minWidth: 0 },
  corrStrength: { fontSize: 12, fontWeight: "700", minWidth: 36, flexShrink: 0, textAlign: "right" },

  // Patterns
  patternRow: { paddingVertical: 10, gap: 5 },
  patternRowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  patternFieldLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
  patternInsight: { fontSize: 12, color: colors.textLight, lineHeight: 17 },

  // Cycle status (period tracker)
  cycleStatusCard: { ...CARD_STYLE, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cycleDayNum: { fontSize: 32, fontWeight: "800", color: colors.text, letterSpacing: -1, lineHeight: 36 },
  cycleDayLabel: { fontSize: 13, color: colors.textLight, marginTop: 2 },
  nextPeriodRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 5 },
  nextPeriodText: { fontSize: 12, color: colors.textLight },
  phaseChip: { flexDirection: "row", alignItems: "center", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  phaseChipText: { fontSize: 13, fontWeight: "600" },
  regScore: { fontSize: 13, fontWeight: "600", color: colors.textSecondary },
  predBig: { fontSize: 24, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  predSmall: { fontSize: 11, color: colors.textLight, marginTop: 1 },

  // Global loading / empty
  centreLoader: { alignItems: "center", paddingVertical: 40, gap: 12 },
  loaderText: { fontSize: 14, color: colors.textLight },
  globalEmpty: { ...CARD_STYLE, alignItems: "center", padding: 28, gap: 10 },
  globalEmptyIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: colors.primaryLight + "18", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textLight, textAlign: "center", lineHeight: 19 },
});
