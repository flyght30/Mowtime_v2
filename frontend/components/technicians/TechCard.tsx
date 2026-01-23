/**
 * TechCard Component
 * Displays technician info with status badge
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { Technician, TechStatus } from '../../services/dispatchApi';

interface TechCardProps {
  technician: Technician;
  onPress?: () => void;
  compact?: boolean;
}

const STATUS_CONFIG: Record<TechStatus, { color: string; bg: string; label: string; icon: string }> = {
  available: { color: Colors.success, bg: '#D1FAE5', label: 'Available', icon: 'checkmark-circle' },
  assigned: { color: Colors.info, bg: '#DBEAFE', label: 'Assigned', icon: 'clipboard' },
  enroute: { color: Colors.warning, bg: '#FEF3C7', label: 'En Route', icon: 'car' },
  on_site: { color: '#7C3AED', bg: '#EDE9FE', label: 'On Site', icon: 'location' },
  complete: { color: Colors.success, bg: '#D1FAE5', label: 'Complete', icon: 'checkmark-done' },
  off_duty: { color: Colors.gray500, bg: Colors.gray100, label: 'Off Duty', icon: 'moon' },
};

export default function TechCard({ technician, onPress, compact = false }: TechCardProps) {
  const statusConfig = STATUS_CONFIG[technician.status] || STATUS_CONFIG.off_duty;

  const skills = [];
  if (technician.skills.can_install) skills.push('Install');
  if (technician.skills.can_service) skills.push('Service');
  if (technician.skills.can_maintenance) skills.push('Maint.');

  if (compact) {
    return (
      <TouchableOpacity style={styles.compactCard} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.statusDot, { backgroundColor: statusConfig.color }]} />
        <View style={styles.compactInfo}>
          <Text style={styles.compactName}>{technician.first_name} {technician.last_name[0]}.</Text>
          <Text style={styles.compactStatus}>{statusConfig.label}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={[styles.avatar, { backgroundColor: technician.color || Colors.primary }]}>
            <Text style={styles.avatarText}>
              {technician.first_name[0]}{technician.last_name[0]}
            </Text>
          </View>
          <View style={[styles.statusIndicator, { backgroundColor: statusConfig.color }]} />
        </View>

        <View style={styles.headerInfo}>
          <Text style={styles.name}>{technician.first_name} {technician.last_name}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Ionicons name={statusConfig.icon as any} size={12} color={statusConfig.color} />
            <Text style={[styles.statusText, { color: statusConfig.color }]}>{statusConfig.label}</Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
      </View>

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={14} color={Colors.gray500} />
          <Text style={styles.detailText}>{technician.phone}</Text>
        </View>

        {technician.certifications.length > 0 && (
          <View style={styles.detailRow}>
            <Ionicons name="ribbon-outline" size={14} color={Colors.gray500} />
            <Text style={styles.detailText}>{technician.certifications.join(', ')}</Text>
          </View>
        )}

        <View style={styles.skillsRow}>
          {skills.map((skill, index) => (
            <View key={index} style={styles.skillBadge}>
              <Text style={styles.skillText}>{skill}</Text>
            </View>
          ))}
        </View>
      </View>

      {technician.current_job_id && (
        <View style={styles.currentJob}>
          <Ionicons name="briefcase" size={14} color={Colors.primary} />
          <Text style={styles.currentJobText}>Current Job: {technician.current_job_id}</Text>
        </View>
      )}

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{technician.stats.jobs_completed}</Text>
          <Text style={styles.statLabel}>Jobs</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{technician.stats.on_time_percentage.toFixed(0)}%</Text>
          <Text style={styles.statLabel}>On Time</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            {technician.stats.avg_rating ? technician.stats.avg_rating.toFixed(1) : '-'}
          </Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.white,
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
  },
  statusIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  headerInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  name: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    gap: 4,
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  details: {
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginBottom: 6,
  },
  detailText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  skillsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  skillBadge: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  skillText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.gray600,
    fontWeight: Typography.fontWeight.medium,
  },
  currentJob: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.statusBackground.scheduled,
    borderRadius: BorderRadius.md,
  },
  currentJobText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  stats: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.sm,
  },
  // Compact styles
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginRight: Spacing.sm,
    ...Shadows.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
  },
  compactInfo: {
    alignItems: 'flex-start',
  },
  compactName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  compactStatus: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
});
