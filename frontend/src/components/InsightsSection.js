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

// ─── Expandable wrapper ───────────────────────────────────────────────────────
function Expandable({ icon, iconColor = colors.primary, title, badge, children, dashed = false }) {
  const [open, setOpen] = useState(false);
  const rotAnim = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    const toOpen = !open;
    setOpen(toOpen);
    Animated.spring(rotAnim, { toValue: toOpen ? 1 : 0, useNativeDriver: true, tension: 300, friction: 22 }).start();
  };

  const rotate = rotAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });

  return (
    <View style={[s.sectionCard, dashed && s.sectionCardDashed]}>
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

function SectionLoading({ title, icon, iconColor = colors.primary }) {
  return (
    <Expandable icon={icon} iconColor={iconColor} title={title}>
      <View style={s.sectionLoadingRow}>
        <ActivityIndicator size="small" color={iconColor} />
        <Text style={s.sectionLoadingText}>Analysing…</Text>
      </View>
    </Expandable>
  );
}

function SectionEmpty({ title, icon, message, iconColor = colors.primaryLight }) {
  return (
    <Expandable icon={icon} iconColor={iconColor} title={title} dashed>
      <Text style={s.sectionEmptyText}>{message}</Text>
    </Expandable>
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

const formatFriendlyDate = (dateStr) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr || "");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const PATTERN_TYPE_CONFIG = {
  day_of_week: { icon: "calendar-outline", color: colors.primary },
  time_of_month: { icon: "today-outline", color: colors.textSecondary },
  streaks: { icon: "flame-outline", color: colors.warning },
  cycle_phases: { icon: "moon-outline", color: colors.menstrual },
};

// ─── Pattern merge: group by field, embed streaks into weekly/monthly ─────────
const mergePatternsByField = (items) => {
  const byField = {};
  items.forEach((item) => {
    const fp = item.field_path;
    if (!byField[fp]) byField[fp] = {};
    byField[fp][item.pattern_type] = item;
  });
  const result = [];
  Object.values(byField).forEach((typeMap) => {
    const hasDow = "day_of_week" in typeMap;
    const hasMom = "time_of_month" in typeMap;
    const hasStreaks = "streaks" in typeMap;
    const hasCycle = "cycle_phases" in typeMap;
    if (hasDow) {
      result.push({ ...typeMap.day_of_week, mergedStreak: hasStreaks ? typeMap.streaks : null });
    }
    if (hasMom) {
      result.push({ ...typeMap.time_of_month, mergedStreak: (hasStreaks && !hasDow) ? typeMap.streaks : null });
    }
    if (hasStreaks && !hasDow && !hasMom) {
      result.push(typeMap.streaks);
    }
    if (hasCycle) {
      result.push(typeMap.cycle_phases);
    }
  });
  return result;
};

// ─── Pattern chart color helpers ──────────────────────────────────────────────
const CYCLE_PHASE_CFG_COLORS = {
  Period:     "#8B1538",
  Follicular: "#C2839A",
  Ovulation:  "#10B981",
  Luteal:     "#A07850",
};
const PATTERN_CAT_COLORS = [
  colors.primary, "#E09C5A", colors.primaryLight, "#C2839A",
  colors.warning, "#10B981", "#A07850", colors.secondary,
];
const patternBarColor = (ratio, isPeak) => {
  if (isPeak) return colors.primaryDark;
  if (ratio >= 0.8) return colors.primary;
  if (ratio >= 0.55) return colors.primaryLight;
  return "#C8D9B8";
};

// ─── Single bar column (custom, no chart library) ─────────────────────────────
function PBarCol({ label, value, maxV, isPeak, color, ySuffix = "", chartH = 96 }) {
  const ratio = maxV > 0 ? Math.max(0, value) / maxV : 0;
  const bH = Math.max(4, Math.round(ratio * chartH));
  const displayVal =
    ySuffix === "%" ? `${Math.round(value)}%`
    : ySuffix === "d" ? `${Math.round(value)}d`
    : Math.abs(value) >= 10 ? String(Math.round(value))
    : Number(value).toFixed(1);
  const barC = color ?? patternBarColor(ratio, isPeak);
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", minWidth: 0, paddingHorizontal: 2 }}>
      {value > 0 && (
        <Text style={{
          fontSize: 9, fontWeight: isPeak ? "800" : "500",
          color: isPeak ? colors.primaryDark : colors.textLight,
          marginBottom: 2, textAlign: "center",
        }}>
          {displayVal}
        </Text>
      )}
      <View style={{
        width: "80%", height: bH, backgroundColor: barC, borderRadius: 5,
        borderWidth: isPeak ? 2 : 0, borderColor: colors.primaryDark,
      }} />
      <Text numberOfLines={1} adjustsFontSizeToFit style={{
        fontSize: 9, color: isPeak ? colors.primaryDark : colors.textLight,
        marginTop: 4, fontWeight: isPeak ? "700" : "400", textAlign: "center",
      }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Example dates with calendar icons ───────────────────────────────────────
function ExDates({ dates, label }) {
  if (!dates?.length) return null;
  return (
    <View style={s.patternExampleWrap}>
      {label ? <Text style={s.patternVizSubhead}>{label}</Text> : null}
      <View style={s.patternDateChips}>
        {dates.slice(-6).map((d) => (
          <View key={d} style={s.patternDateChip}>
            <Ionicons name="calendar-outline" size={10} color={colors.textSecondary} style={{ marginRight: 3 }} />
            <Text style={s.patternDateChipText}>{formatFriendlyDate(d)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Streak pills (merged section) ───────────────────────────────────────────
function StreakSection({ notes, insight }) {
  if (!notes?.length) return null;
  return (
    <View style={s.streakSection}>
      <View style={s.streakSectionHeader}>
        <Ionicons name="flame-outline" size={13} color={colors.warning} />
        <Text style={s.streakSectionTitle}>Streak Periods</Text>
      </View>
      <View style={s.streakPills}>
        {notes.slice(0, 6).map((note, i) => {
          const hi = /higher/i.test(note);
          const lo = /lower/i.test(note);
          const c = hi ? colors.success : lo ? colors.error : colors.primary;
          const ic = hi ? "trending-up-outline" : lo ? "trending-down-outline" : "flame-outline";
          return (
            <View key={i} style={[s.streakPill, { backgroundColor: c + "15", borderColor: c + "40" }]}>
              <Ionicons name={ic} size={10} color={c} />
              <Text style={[s.streakPillText, { color: c }]}>{note}</Text>
            </View>
          );
        })}
      </View>
      {insight ? <Text style={s.streakInsightText}>{insight}</Text> : null}
    </View>
  );
}

// ─── Numeric pattern bars (single series: weekly / monthly / phases) ──────────
function NumericPatternViz({ xLabels, values, ySuffix, caption, exampleDates, peakLabel, barColors }) {
  if (!xLabels?.length || !values?.length) return <Text style={s.patternVizEmpty}>No data.</Text>;
  const maxV = Math.max(...values.filter((n) => n != null && !isNaN(n)), 0.01);
  const peakIdx = values.reduce((mi, v, i) => (v ?? 0) > (values[mi] ?? 0) ? i : mi, 0);
  return (
    <View style={{ gap: 6 }}>
      {caption ? <Text style={s.patternVizCaption}>{caption}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 144, paddingTop: 8 }}>
        {xLabels.map((lbl, i) => (
          <PBarCol
            key={i} label={lbl} value={values[i] ?? 0} maxV={maxV}
            isPeak={i === peakIdx} color={barColors?.[i]}
            ySuffix={ySuffix} chartH={96}
          />
        ))}
      </View>
      {peakIdx >= 0 && xLabels[peakIdx] ? (
        <View style={s.peakTag}>
          <Ionicons name="arrow-up-circle" size={12} color={colors.primaryDark} />
          <Text style={s.peakTagText}>
            {peakLabel || "Peak: "}{xLabels[peakIdx]}
            {values[peakIdx] != null ? ` · ${Number(values[peakIdx]).toFixed(1)}${ySuffix}` : ""}
          </Text>
        </View>
      ) : null}
      <ExDates
        dates={exampleDates}
        label={peakIdx >= 0 && xLabels[peakIdx] ? `Recent occurrences on ${xLabels[peakIdx]}` : undefined}
      />
    </View>
  );
}

// ─── Categorical stacked bars (multi-series: % per slot) ──────────────────────
function CategoricalPatternViz({ xLabels, series, caption, exampleDates, showLegend }) {
  if (!xLabels?.length || !series?.length) return <Text style={s.patternVizEmpty}>No data.</Text>;
  const colored = series.map((sr, i) => ({ ...sr, color: PATTERN_CAT_COLORS[i % PATTERN_CAT_COLORS.length] }));
  return (
    <View style={{ gap: 6 }}>
      {caption ? <Text style={s.patternVizCaption}>{caption}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 144, paddingTop: 8 }}>
        {xLabels.map((lbl, i) => {
          const total = colored.reduce((sum, sr) => sum + (sr.values[i] ?? 0), 0) || 1;
          return (
            <View key={i} style={{ flex: 1, alignItems: "center", minWidth: 0, paddingHorizontal: 2 }}>
              <View style={{ width: "80%", height: 96, justifyContent: "flex-end", gap: 1 }}>
                {colored.map((cs, si) => {
                  const pct = (cs.values[i] ?? 0) / total;
                  const bH = Math.max(1, Math.round(pct * 96));
                  return (
                    <View key={si} style={{ height: bH, backgroundColor: cs.color, borderRadius: 3 }} />
                  );
                })}
              </View>
              <Text numberOfLines={1} adjustsFontSizeToFit style={{
                fontSize: 9, color: colors.textLight, marginTop: 4, textAlign: "center",
              }}>
                {lbl}
              </Text>
            </View>
          );
        })}
      </View>
      {showLegend && (
        <View style={s.patternLegend}>
          {colored.map((cs, i) => (
            <View key={i} style={s.patternLegendRow}>
              <View style={[s.patternLegendDot, { backgroundColor: cs.color }]} />
              <Text style={s.patternLegendLabel}>{cs.label}</Text>
            </View>
          ))}
        </View>
      )}
      <ExDates dates={exampleDates} />
    </View>
  );
}

// ─── Standalone streak timeline (no weekly/monthly pattern for this field) ────
// Parse a streak note: "Value Label · 5/1–5/5 (5d)"
const parseStreakNote = (note) => {
  const m = note.match(/^(.+?)\s*[·•]\s*(.+?)[–\-](.+?)\s*\((\d+)d\)/u);
  if (m) return { valueLabel: m[1].trim(), start: m[2].trim(), end: m[3].trim(), days: parseInt(m[4], 10) };
  // fallback: no separator found — treat the whole note as the label
  return { valueLabel: note, start: null, end: null, days: null };
};

const labelColor = (lbl, idx) => {
  if (!lbl) return colors.primary;
  if (/higher/i.test(lbl)) return colors.success;
  if (/lower/i.test(lbl)) return colors.error;
  return PATTERN_CAT_COLORS[idx % PATTERN_CAT_COLORS.length];
};

function StandaloneStreakViz({ visualization }) {
  if (!visualization) return null;
  const { series = [], caption, streak_notes: notes = [] } = visualization;

  // Assign a stable color per unique value label
  const uniqueLabels = [...new Set(
    notes.map((n) => parseStreakNote(n).valueLabel).filter(Boolean)
  )];
  const colorForLabel = (lbl) => labelColor(lbl, uniqueLabels.indexOf(lbl));

  const parsed = notes.slice(0, 8).map(parseStreakNote);
  const maxDays = Math.max(...parsed.map((p) => p.days ?? 1), 1);

  return (
    <View style={s.patternVizWrap}>
      {caption ? <Text style={s.patternVizCaption}>{caption}</Text> : null}

      {/* Legend when multiple distinct values exist */}
      {uniqueLabels.length > 1 && (
        <View style={s.patternLegend}>
          {uniqueLabels.map((lbl) => (
            <View key={lbl} style={s.patternLegendRow}>
              <View style={[s.patternLegendDot, { backgroundColor: colorForLabel(lbl) }]} />
              <Text style={s.patternLegendLabel}>{lbl}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={{ gap: 12, marginTop: 8 }}>
        {parsed.map((p, i) => {
          const c = colorForLabel(p.valueLabel);
          const ic = /higher/i.test(p.valueLabel ?? "")
            ? "trending-up-outline"
            : /lower/i.test(p.valueLabel ?? "")
              ? "trending-down-outline"
              : "flame-outline";
          const widthPct = maxDays > 0 ? Math.max(10, ((p.days ?? 1) / maxDays) * 100) : 10;

          return (
            <View key={i} style={s.streakRow}>
              {/* Value label + duration badge */}
              <View style={s.streakRowHeader}>
                <View style={[s.streakLabelBadge, { backgroundColor: c + "18", borderColor: c + "40" }]}>
                  <Ionicons name={ic} size={10} color={c} />
                  <Text style={[s.streakLabelText, { color: c }]} numberOfLines={1}>
                    {p.valueLabel || "Streak"}
                  </Text>
                </View>
                <Text style={[s.streakDurationText, { color: c }]}>
                  {p.days != null ? `${p.days}d` : ""}
                </Text>
              </View>
              {/* Bar + date range */}
              <View style={s.streakBarDateRow}>
                <View style={s.streakTimelineBarWrap}>
                  <View style={[s.streakTimelineBar, { width: `${widthPct}%`, backgroundColor: c }]} />
                </View>
                {p.start && p.end ? (
                  <View style={s.streakDateRange}>
                    <Ionicons name="calendar-outline" size={9} color={colors.textLight} />
                    <Text style={s.streakDateRangeText}>{p.start} – {p.end}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Main pattern visualization dispatcher ────────────────────────────────────
function PatternVizRenderer({ visualization, fieldPath, patternType, mergedStreak }) {
  if (!visualization) {
    return <Text style={s.patternVizEmpty}>Tap to see details once chart data is available.</Text>;
  }
  const {
    x_labels: xLabels = [],
    series = [],
    y_suffix: ySuffix = "",
    caption,
    example_dates: exDates = [],
    show_legend: showLegend = false,
    streak_notes: streakNotes,
  } = visualization;

  if (patternType === "streaks") {
    return <StandaloneStreakViz visualization={visualization} />;
  }

  const mNotes = mergedStreak?.visualization?.streak_notes || streakNotes || [];
  const isSingleNumeric = series.length === 1 && ySuffix !== "%";

  if (patternType === "cycle_phases") {
    const barColors = xLabels.map((lbl) => CYCLE_PHASE_CFG_COLORS[lbl]);
    return (
      <View style={s.patternVizWrap}>
        {isSingleNumeric ? (
          <NumericPatternViz
            xLabels={xLabels} values={series[0]?.values || []}
            ySuffix={ySuffix} caption={caption} exampleDates={exDates}
            peakLabel="Peak phase: " barColors={barColors}
          />
        ) : (
          <CategoricalPatternViz
            xLabels={xLabels} series={series} caption={caption}
            exampleDates={exDates} showLegend={showLegend}
          />
        )}
        {mNotes.length > 0 && <StreakSection notes={mNotes} insight={mergedStreak?.insight} />}
      </View>
    );
  }

  // Weekly (day_of_week) or Monthly (time_of_month)
  if (isSingleNumeric) {
    return (
      <View style={s.patternVizWrap}>
        <NumericPatternViz
          xLabels={xLabels} values={series[0]?.values || []}
          ySuffix={ySuffix} caption={caption} exampleDates={exDates}
          peakLabel={patternType === "day_of_week" ? "Peak day: " : "Peak period: "}
        />
        {mNotes.length > 0 && <StreakSection notes={mNotes} insight={mergedStreak?.insight} />}
      </View>
    );
  }

  return (
    <View style={s.patternVizWrap}>
      <CategoricalPatternViz
        xLabels={xLabels} series={series} caption={caption}
        exampleDates={exDates} showLegend={showLegend}
      />
      {mNotes.length > 0 && <StreakSection notes={mNotes} insight={mergedStreak?.insight} />}
    </View>
  );
}

function PatternItemRow({ item, expanded, onToggle }) {
  const cfg = PATTERN_TYPE_CONFIG[item.pattern_type] || PATTERN_TYPE_CONFIG.day_of_week;
  const isMerged = item.mergedStreak != null;
  const strength = item.confidence || "medium";
  const sc = strength === "strong" || strength === "high"
    ? colors.primary
    : strength === "medium"
      ? colors.warning
      : colors.textLight;

  return (
    <View style={[s.patternItemBlock, expanded && s.patternItemBlockOpen]}>
      <TouchableOpacity onPress={onToggle} style={s.patternItemRow} activeOpacity={0.7}>
        <View style={[s.patternItemIcon, { backgroundColor: cfg.color + "18" }]}>
          <Ionicons name={cfg.icon} size={18} color={cfg.color} />
        </View>
        <View style={s.patternItemBody}>
          <View style={s.patternRowHeader}>
            <Text style={s.patternFieldLabel} numberOfLines={1}>
              {formatFieldPath(item.field_path)}
            </Text>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <Badge label={strength} color={sc} />
              {isMerged && (
                <Badge label="+ streaks" color={colors.warning} bg={colors.warning + "12"} icon="flame-outline" />
              )}
            </View>
          </View>
          <Text style={s.patternItemTitle}>{item.title}</Text>
          {item.insight ? (
            <Text style={s.patternInsight} numberOfLines={expanded ? undefined : 2}>
              {formatInsightText(item.insight)}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name={expanded ? "chevron-up-outline" : "chevron-down-outline"}
          size={16}
          color={colors.textLight}
        />
      </TouchableOpacity>
      {expanded ? (
        <View style={s.patternVizPanel}>
          <PatternVizRenderer
            visualization={item.visualization}
            fieldPath={item.field_path}
            patternType={item.pattern_type}
            mergedStreak={item.mergedStreak ?? null}
          />
        </View>
      ) : null}
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
        <Expandable icon="pulse-outline" iconColor={regInfo?.color || colors.primary} title="Cycle Regularity">
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              {regInfo && <Badge label={regInfo.label} color={regInfo.color} bg={regInfo.bg} />}
              {regScore != null && <Text style={s.regScore}>{regScore.toFixed(0)}/100</Text>}
            </View>
            {regScore != null && <ProgressBar value={regScore} max={100} color={regInfo?.color || colors.primary} />}
            {reg.medical_note ? <Text style={s.detailText}>{reg.medical_note}</Text> : null}
          </View>
        </Expandable>
      )}

      {pred && (
        <Expandable icon="analytics-outline" iconColor={colors.textSecondary} title="Prediction Accuracy">
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
        </Expandable>
      )}

      {compPrev?.has_comparison && (
        <Expandable icon="git-compare-outline" iconColor={colors.secondary} title="Cycle Comparison">
          {(compPrev.cycle_insights || compPrev.insights || []).slice(0, 2).map((ins, i) => (
            <Text key={i} style={s.bulletText}>• {ins}</Text>
          ))}
        </Expandable>
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
  const [expandedPatternId, setExpandedPatternId] = useState(null);
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
      (patternData.pattern_items || []).length > 0 ||
      (patternData.patterns_found > 0) ||
      (patternData.total_patterns_detected > 0) ||
      Object.keys(patternData.field_patterns || {}).length > 0
    )
  );

  const rawPatternItems = useMemo(() => {
    if (!patternData) return [];
    if (patternData.pattern_items?.length) return patternData.pattern_items;
    return Object.entries(patternData.field_patterns || {}).map(([fp, p]) => ({
      id: fp,
      field_path: fp,
      pattern_type: "day_of_week",
      title: "Pattern",
      insight: p.key_insight,
      confidence: p.pattern_strength || "medium",
      visualization: null,
    }));
  }, [patternData]);

  // Merge streak patterns into their sibling weekly/monthly cards
  const patternItems = useMemo(() => mergePatternsByField(rawPatternItems), [rawPatternItems]);

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
      <Expandable
        icon="trending-up-outline"
        iconColor={colors.primary}
        title="Time Evolution"
      >
        {evolutionFieldOptions.length > 0 ? (
          <View style={s.evoFieldDropdownRow}>
            <EvolutionFieldDropdown
              options={evolutionFieldOptions}
              selectedFieldName={selectedEvolutionField}
              chartableFieldNames={chartableFieldNames}
              onSelect={setSelectedEvolutionField}
            />
          </View>
        ) : null}

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
      </Expandable>

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
        <Expandable
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
        </Expandable>
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
            <Badge label={`${patternItems.length}`} color={colors.textSecondary} />
          }
        >
          <Text style={[s.detailText, { marginBottom: 10 }]}>
            Tap a pattern to see when it happens — charts and dates below each one:
          </Text>
          {patternData.overall_insight ? (
            <Text style={[s.detailText, { marginBottom: 10 }]}>{patternData.overall_insight}</Text>
          ) : null}
          {patternItems.map((item, i) => (
            <PatternItemRow
              key={item.id || i}
              item={item}
              expanded={expandedPatternId === item.id}
              onToggle={() => setExpandedPatternId((prev) => (prev === item.id ? null : item.id))}
            />
          ))}
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
        <Expandable icon="trending-up-outline" title="Cycle Length History">
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
        </Expandable>
      ) : (
        <SectionEmpty title="Cycle Length Chart" icon="trending-up-outline" message="Need at least 2 complete cycles to show this chart." />
      )}

      {periCycles.length >= 2 ? (
        <Expandable icon="water-outline" iconColor={colors.menstrual} title="Period Length">
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
        </Expandable>
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
  evoFieldDropdownRow: { alignItems: "flex-end", marginBottom: 12 },
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
  evoFieldDropdownWrap: { position: "relative", zIndex: 20, maxWidth: 160 },
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
  patternItemBlock: { marginBottom: 10, borderRadius: 12, borderWidth: 1, borderColor: "#EDE5D8", overflow: "hidden" },
  patternItemBlockOpen: { borderColor: colors.primaryLight, backgroundColor: "#FFFCF7", overflow: "visible" },
  patternItemRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 12 },
  patternItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginTop: 2 },
  patternItemBody: { flex: 1, minWidth: 0, gap: 3 },
  patternItemTitle: { fontSize: 11, fontWeight: "700", color: colors.textSecondary, textTransform: "uppercase", letterSpacing: 0.4 },
  patternVizPanel: { paddingHorizontal: 12, paddingBottom: 22, paddingTop: 4, borderTopWidth: 1, borderTopColor: "#EDE5D8" },
  patternVizWrap: { gap: 10 },
  patternLegend: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  patternLegendRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  patternLegendDot: { width: 10, height: 10, borderRadius: 99 },
  patternLegendLabel: { fontSize: 11, fontWeight: "600", color: colors.text },
  patternVizCaption: { fontSize: 12, fontWeight: "600", color: colors.text, lineHeight: 17 },
  patternVizSubhead: { fontSize: 11, fontWeight: "700", color: colors.textLight, marginTop: 6, marginBottom: 4 },
  patternVizEmpty: { fontSize: 12, color: colors.textLight, fontStyle: "italic", paddingVertical: 8 },
  patternExampleWrap: { gap: 4, marginTop: 6 },
  patternDateChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  patternDateChip: {
    backgroundColor: "#F3EFE7", borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5,
    borderWidth: 1, borderColor: "#EDE5D8", flexDirection: "row", alignItems: "center",
  },
  patternDateChipText: { fontSize: 11, fontWeight: "600", color: colors.text },
  patternRow: { paddingVertical: 10, gap: 5 },
  patternRowHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  patternFieldLabel: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.text },
  patternInsight: { fontSize: 12, color: colors.textLight, lineHeight: 17 },
  // Peak tag
  peakTag: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, backgroundColor: colors.primaryDark + "0D", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  peakTagText: { fontSize: 11, fontWeight: "700", color: colors.primaryDark },
  // Streak section (merged into weekly/monthly)
  streakSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#EDE5D8" },
  streakSectionHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  streakSectionTitle: { fontSize: 12, fontWeight: "700", color: colors.warning },
  streakPills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  streakPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1 },
  streakPillText: { fontSize: 10, fontWeight: "600" },
  streakInsightText: { fontSize: 11, color: colors.textLight, marginTop: 8, lineHeight: 16, fontStyle: "italic" },
  // Streak timeline (standalone pattern)
  streakTimelineBarWrap: { flex: 1, height: 14, backgroundColor: "#EDE5D8", borderRadius: 7, overflow: "hidden" },
  streakTimelineBar: { height: 14, borderRadius: 7 },
  streakTimelineLen: { fontSize: 12, fontWeight: "700" },
  streakTimelineDates: { fontSize: 10, color: colors.textLight },
  // Standalone streak row (labeled)
  streakRow: { gap: 6 },
  streakRowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  streakLabelBadge: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, maxWidth: "78%" },
  streakLabelText: { fontSize: 11, fontWeight: "700", flexShrink: 1 },
  streakDurationText: { fontSize: 13, fontWeight: "800" },
  streakBarDateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  streakDateRange: { flexDirection: "row", alignItems: "center", gap: 3, minWidth: 72 },
  streakDateRangeText: { fontSize: 10, color: colors.textLight },

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
