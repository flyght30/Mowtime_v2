/**
 * Card Component
 * Container with shadow and optional header
 */

import React from 'react';
import { View, Text, StyleSheet, ViewStyle, TouchableOpacity } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

export interface CardProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  onPress?: () => void;
  style?: ViewStyle;
  noPadding?: boolean;
  variant?: 'default' | 'outlined' | 'elevated';
}

export function Card({
  children,
  title,
  subtitle,
  onPress,
  style,
  noPadding = false,
  variant = 'default',
}: CardProps) {
  const cardStyles = [
    styles.card,
    styles[variant],
    !noPadding && styles.padding,
    style,
  ];

  const content = (
    <View style={cardStyles}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
  },

  default: {
    ...Shadows.sm,
  },

  outlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },

  elevated: {
    ...Shadows.md,
  },

  padding: {
    padding: Spacing.md,
  },

  header: {
    marginBottom: Spacing.md,
  },

  title: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  subtitle: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});

export default Card;
