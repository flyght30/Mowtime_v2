/**
 * KPICard Component
 * Display key performance indicator with trend
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface Props {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
    label?: string;
  };
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

const VARIANT_COLORS = {
  default: Colors.text,
  primary: Colors.primary,
  success: Colors.success,
  warning: Colors.warning,
  danger: Colors.error,
};

export default function KPICard({
  title,
  value,
  subtitle,
  trend,
  icon,
  iconColor,
  variant = 'default',
}: Props) {
  const getTrendColor = () => {
    if (!trend) return Colors.textSecondary;
    if (trend.direction === 'up') return Colors.success;
    if (trend.direction === 'down') return Colors.error;
    return Colors.textSecondary;
  };

  const getTrendIcon = (): keyof typeof Ionicons.glyphMap => {
    if (!trend) return 'remove-outline';
    if (trend.direction === 'up') return 'trending-up';
    if (trend.direction === 'down') return 'trending-down';
    return 'remove-outline';
  };

  const formatValue = (val: string | number): string => {
    if (typeof val === 'number') {
      if (val >= 1000000) {
        return `$${(val / 1000000).toFixed(1)}M`;
      }
      if (val >= 1000) {
        return `$${(val / 1000).toFixed(1)}K`;
      }
      if (Number.isInteger(val)) {
        return val.toString();
      }
      return val.toFixed(1);
    }
    return val;
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        {icon && (
          <View style={[styles.iconContainer, { backgroundColor: (iconColor || VARIANT_COLORS[variant]) + '15' }]}>
            <Ionicons
              name={icon}
              size={20}
              color={iconColor || VARIANT_COLORS[variant]}
            />
          </View>
        )}
        <Text style={styles.title}>{title}</Text>
      </View>

      <Text style={[styles.value, { color: VARIANT_COLORS[variant] }]}>
        {formatValue(value)}
      </Text>

      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

      {trend && (
        <View style={styles.trendContainer}>
          <Ionicons
            name={getTrendIcon()}
            size={16}
            color={getTrendColor()}
          />
          <Text style={[styles.trendValue, { color: getTrendColor() }]}>
            {trend.value > 0 ? '+' : ''}{trend.value}%
          </Text>
          {trend.label && (
            <Text style={styles.trendLabel}>{trend.label}</Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  value: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  trendContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: 4,
  },
  trendValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  trendLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
});
