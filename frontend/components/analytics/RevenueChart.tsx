/**
 * RevenueChart Component
 * Display revenue trend over time as bar/line chart
 */

import React from 'react';
import { View, Text, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface DataPoint {
  date: string;
  label?: string;
  revenue: number;
  jobs?: number;
}

interface Props {
  data: DataPoint[];
  title?: string;
  height?: number;
  showLabels?: boolean;
  variant?: 'bar' | 'line';
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function RevenueChart({
  data,
  title = 'Revenue Trend',
  height = 200,
  showLabels = true,
  variant = 'bar',
}: Props) {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No data available</Text>
        </View>
      </View>
    );
  }

  const maxValue = Math.max(...data.map((d) => d.revenue), 1);
  const chartHeight = height - 60; // Account for title and labels
  const barWidth = Math.max(20, Math.min(40, (SCREEN_WIDTH - 80) / data.length - 4));

  const formatValue = (value: number): string => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(0)}K`;
    }
    return `$${value}`;
  };

  const formatLabel = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const average = total / data.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Total:</Text>
          <Text style={styles.summaryValue}>{formatValue(total)}</Text>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chartContainer}
      >
        {/* Y-axis labels */}
        <View style={[styles.yAxis, { height: chartHeight }]}>
          <Text style={styles.axisLabel}>{formatValue(maxValue)}</Text>
          <Text style={styles.axisLabel}>{formatValue(maxValue / 2)}</Text>
          <Text style={styles.axisLabel}>$0</Text>
        </View>

        {/* Bars */}
        <View style={styles.barsContainer}>
          {/* Average line */}
          <View
            style={[
              styles.averageLine,
              {
                bottom: (average / maxValue) * chartHeight,
                width: data.length * (barWidth + 4),
              },
            ]}
          />

          <View style={[styles.bars, { height: chartHeight }]}>
            {data.map((point, index) => {
              const barHeight = (point.revenue / maxValue) * chartHeight;

              return (
                <View key={index} style={styles.barWrapper}>
                  <View style={[styles.barBackground, { height: chartHeight }]} />
                  <View
                    style={[
                      styles.bar,
                      {
                        height: Math.max(barHeight, 2),
                        width: barWidth,
                        backgroundColor:
                          point.revenue >= average ? Colors.primary : Colors.primary + '80',
                      },
                    ]}
                  />
                  {showLabels && (
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {point.label || formatLabel(point.date)}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
          <Text style={styles.legendText}>Above Average</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.primary + '80' }]} />
          <Text style={styles.legendText}>Below Average</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={styles.legendLine} />
          <Text style={styles.legendText}>Avg: {formatValue(average)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  chartContainer: {
    flexDirection: 'row',
    paddingRight: Spacing.md,
  },
  yAxis: {
    width: 50,
    justifyContent: 'space-between',
    paddingRight: Spacing.sm,
  },
  axisLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
  },
  barsContainer: {
    position: 'relative',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barWrapper: {
    alignItems: 'center',
  },
  barBackground: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.sm,
  },
  bar: {
    borderTopLeftRadius: BorderRadius.sm,
    borderTopRightRadius: BorderRadius.sm,
    minHeight: 2,
  },
  barLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
    marginTop: 4,
    width: 40,
    textAlign: 'center',
  },
  averageLine: {
    position: 'absolute',
    left: 0,
    height: 1,
    backgroundColor: Colors.warning,
    borderStyle: 'dashed',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLine: {
    width: 16,
    height: 2,
    backgroundColor: Colors.warning,
  },
  legendText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
