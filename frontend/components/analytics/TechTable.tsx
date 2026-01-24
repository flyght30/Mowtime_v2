/**
 * TechTable Component
 * Display technician performance metrics in a table
 */

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface Technician {
  tech_id: string;
  name: string;
  jobs_completed: number;
  revenue: number;
  on_time_pct: number;
  avg_rating: number;
  efficiency: number;
}

interface Props {
  technicians: Technician[];
  title?: string;
  showAll?: boolean;
}

export default function TechTable({
  technicians,
  title = 'Tech Performance',
  showAll = false,
}: Props) {
  const displayTechs = showAll ? technicians : technicians.slice(0, 5);

  const formatCurrency = (value: number): string => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(0)}`;
  };

  const getRatingColor = (rating: number): string => {
    if (rating >= 4.5) return Colors.success;
    if (rating >= 4.0) return Colors.primary;
    if (rating >= 3.0) return Colors.warning;
    return Colors.error;
  };

  const getOnTimeColor = (pct: number): string => {
    if (pct >= 95) return Colors.success;
    if (pct >= 85) return Colors.primary;
    if (pct >= 70) return Colors.warning;
    return Colors.error;
  };

  const renderProgressBar = (value: number, max: number, color: string) => {
    const width = Math.min((value / max) * 100, 100);
    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBackground}>
          <View
            style={[
              styles.progressFill,
              { width: `${width}%`, backgroundColor: color },
            ]}
          />
        </View>
      </View>
    );
  };

  if (!technicians || technicians.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={40} color={Colors.gray300} />
          <Text style={styles.emptyText}>No technician data available</Text>
        </View>
      </View>
    );
  }

  const maxRevenue = Math.max(...technicians.map((t) => t.revenue));

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={[styles.headerCell, styles.nameCell]}>Tech</Text>
        <Text style={[styles.headerCell, styles.numberCell]}>Jobs</Text>
        <Text style={[styles.headerCell, styles.revenueCell]}>Revenue</Text>
        <Text style={[styles.headerCell, styles.numberCell]}>On-Time</Text>
        <Text style={[styles.headerCell, styles.numberCell]}>Rating</Text>
      </View>

      {/* Rows */}
      <ScrollView style={styles.tableBody} nestedScrollEnabled>
        {displayTechs.map((tech, index) => (
          <View
            key={tech.tech_id}
            style={[
              styles.row,
              index % 2 === 0 && styles.rowEven,
              index === 0 && styles.topPerformer,
            ]}
          >
            <View style={[styles.cell, styles.nameCell]}>
              {index === 0 && (
                <Ionicons
                  name="trophy"
                  size={14}
                  color={Colors.warning}
                  style={styles.trophyIcon}
                />
              )}
              <Text style={styles.nameText} numberOfLines={1}>
                {tech.name}
              </Text>
            </View>

            <View style={[styles.cell, styles.numberCell]}>
              <Text style={styles.numberText}>{tech.jobs_completed}</Text>
            </View>

            <View style={[styles.cell, styles.revenueCell]}>
              <Text style={styles.revenueText}>{formatCurrency(tech.revenue)}</Text>
              {renderProgressBar(tech.revenue, maxRevenue, Colors.primary)}
            </View>

            <View style={[styles.cell, styles.numberCell]}>
              <Text style={[styles.numberText, { color: getOnTimeColor(tech.on_time_pct) }]}>
                {tech.on_time_pct}%
              </Text>
            </View>

            <View style={[styles.cell, styles.numberCell]}>
              <View style={styles.ratingContainer}>
                <Ionicons name="star" size={12} color={getRatingColor(tech.avg_rating)} />
                <Text style={[styles.ratingText, { color: getRatingColor(tech.avg_rating) }]}>
                  {tech.avg_rating.toFixed(1)}
                </Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Summary */}
      <View style={styles.summary}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Jobs</Text>
          <Text style={styles.summaryValue}>
            {technicians.reduce((sum, t) => sum + t.jobs_completed, 0)}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Total Revenue</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(technicians.reduce((sum, t) => sum + t.revenue, 0))}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Avg Rating</Text>
          <Text style={styles.summaryValue}>
            {(
              technicians.reduce((sum, t) => sum + t.avg_rating, 0) / technicians.length
            ).toFixed(1)}
          </Text>
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
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  headerCell: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
  },
  tableBody: {
    maxHeight: 250,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowEven: {
    backgroundColor: Colors.gray50,
  },
  topPerformer: {
    backgroundColor: Colors.warning + '10',
  },
  cell: {
    justifyContent: 'center',
  },
  nameCell: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
  },
  numberCell: {
    flex: 1,
    alignItems: 'center',
  },
  revenueCell: {
    flex: 1.5,
  },
  trophyIcon: {
    marginRight: 4,
  },
  nameText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  numberText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    fontWeight: Typography.fontWeight.medium,
  },
  revenueText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.bold,
    marginBottom: 2,
  },
  progressContainer: {
    width: '100%',
  },
  progressBackground: {
    height: 4,
    backgroundColor: Colors.gray200,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginTop: 2,
  },
});
