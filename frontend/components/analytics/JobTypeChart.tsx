/**
 * JobTypeChart Component
 * Display job type breakdown as pie/donut chart
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface JobTypeData {
  type: string;
  count: number;
  revenue: number;
  avg_value?: number;
  avg_margin?: number;
}

interface Props {
  data: Record<string, JobTypeData>;
  title?: string;
  showRevenue?: boolean;
}

const TYPE_COLORS: Record<string, string> = {
  install: '#4CAF50',
  installation: '#4CAF50',
  service: '#2196F3',
  repair: '#2196F3',
  maintenance: '#FF9800',
  diagnostic: '#9C27B0',
  emergency: '#F44336',
  other: '#607D8B',
};

export default function JobTypeChart({
  data,
  title = 'Jobs by Type',
  showRevenue = true,
}: Props) {
  const types = Object.entries(data).map(([key, value]) => ({
    key,
    ...value,
    color: TYPE_COLORS[key.toLowerCase()] || Colors.gray500,
  }));

  const totalJobs = types.reduce((sum, t) => sum + t.count, 0);
  const totalRevenue = types.reduce((sum, t) => sum + t.revenue, 0);

  if (types.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No job data available</Text>
        </View>
      </View>
    );
  }

  const formatCurrency = (value: number): string => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    }
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  // Sort by revenue or count
  const sortedTypes = [...types].sort((a, b) =>
    showRevenue ? b.revenue - a.revenue : b.count - a.count
  );

  // Calculate percentages for visual representation
  const maxValue = showRevenue ? totalRevenue : totalJobs;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.totalLabel}>
          {showRevenue ? formatCurrency(totalRevenue) : `${totalJobs} jobs`}
        </Text>
      </View>

      {/* Visual breakdown */}
      <View style={styles.visualContainer}>
        {/* Horizontal bar representation */}
        <View style={styles.barContainer}>
          {sortedTypes.map((type) => {
            const percentage = showRevenue
              ? (type.revenue / totalRevenue) * 100
              : (type.count / totalJobs) * 100;
            return (
              <View
                key={type.key}
                style={[
                  styles.barSegment,
                  {
                    flex: percentage,
                    backgroundColor: type.color,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Legend and details */}
        <View style={styles.legendContainer}>
          {sortedTypes.map((type) => {
            const percentage = showRevenue
              ? (type.revenue / totalRevenue) * 100
              : (type.count / totalJobs) * 100;

            return (
              <View key={type.key} style={styles.legendItem}>
                <View style={styles.legendLeft}>
                  <View style={[styles.legendDot, { backgroundColor: type.color }]} />
                  <Text style={styles.legendLabel}>
                    {type.key.charAt(0).toUpperCase() + type.key.slice(1)}
                  </Text>
                </View>

                <View style={styles.legendRight}>
                  <Text style={styles.legendCount}>{type.count} jobs</Text>
                  {showRevenue && (
                    <Text style={[styles.legendRevenue, { color: type.color }]}>
                      {formatCurrency(type.revenue)}
                    </Text>
                  )}
                  <Text style={styles.legendPercent}>{percentage.toFixed(0)}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {/* Metrics grid */}
      {showRevenue && (
        <View style={styles.metricsGrid}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Avg Job Value</Text>
            <Text style={styles.metricValue}>
              {formatCurrency(totalRevenue / totalJobs)}
            </Text>
          </View>
          {sortedTypes[0] && (
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Top Type</Text>
              <Text style={[styles.metricValue, { color: sortedTypes[0].color }]}>
                {sortedTypes[0].key.charAt(0).toUpperCase() + sortedTypes[0].key.slice(1)}
              </Text>
            </View>
          )}
          {sortedTypes[0]?.avg_margin !== undefined && (
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Best Margin</Text>
              <Text style={styles.metricValue}>
                {sortedTypes[0].avg_margin.toFixed(0)}%
              </Text>
            </View>
          )}
        </View>
      )}
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
  totalLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  visualContainer: {
    marginBottom: Spacing.md,
  },
  barContainer: {
    flexDirection: 'row',
    height: 16,
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },
  barSegment: {
    minWidth: 4,
  },
  legendContainer: {
    gap: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  legendCount: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    minWidth: 50,
  },
  legendRevenue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    minWidth: 60,
    textAlign: 'right',
  },
  legendPercent: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    minWidth: 35,
    textAlign: 'right',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  metricValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginTop: 2,
  },
});
