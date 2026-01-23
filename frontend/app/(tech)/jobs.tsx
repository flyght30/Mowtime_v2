/**
 * Tech Jobs Screen - Weekly View
 * Shows jobs for the week with calendar navigation
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  FlatList,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { techApi, TechJob, JOB_STATUS_COLORS, formatTime, formatAddress, formatDuration } from '../../services/techApi';

// Get week dates starting from a given date
const getWeekDates = (startDate: Date): Date[] => {
  const dates: Date[] = [];
  const start = new Date(startDate);
  start.setDate(start.getDate() - start.getDay()); // Start from Sunday

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date);
  }
  return dates;
};

const formatDateKey = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function TechJobsScreen() {
  const router = useRouter();
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date();
    today.setDate(today.getDate() - today.getDay());
    return today;
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [jobs, setJobs] = useState<TechJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const weekDates = getWeekDates(weekStart);
  const today = new Date();
  const todayKey = formatDateKey(today);

  // Load jobs for the week
  const loadJobs = useCallback(async () => {
    try {
      const startDateStr = formatDateKey(weekDates[0]);
      const weekJobs = await techApi.getJobsForWeek(startDateStr);
      setJobs(weekJobs);
    } catch (error) {
      console.error('Failed to load jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadJobs();
    setRefreshing(false);
  }, [loadJobs]);

  const navigateWeek = (direction: 'prev' | 'next') => {
    setWeekStart(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
      return newDate;
    });
    setLoading(true);
  };

  const goToToday = () => {
    const today = new Date();
    const newWeekStart = new Date(today);
    newWeekStart.setDate(today.getDate() - today.getDay());
    setWeekStart(newWeekStart);
    setSelectedDate(today);
    setLoading(true);
  };

  // Filter jobs for selected date
  const selectedDateKey = formatDateKey(selectedDate);
  const selectedJobs = jobs.filter(job => job.scheduled_date === selectedDateKey);

  // Get job counts per day
  const jobCounts: Record<string, number> = {};
  jobs.forEach(job => {
    const key = job.scheduled_date;
    jobCounts[key] = (jobCounts[key] || 0) + 1;
  });

  const handleJobPress = (job: TechJob) => {
    router.push(`/(tech)/job/${job.job_id}`);
  };

  const renderWeekHeader = () => (
    <View style={styles.weekHeader}>
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => navigateWeek('prev')}
      >
        <Ionicons name="chevron-back" size={24} color={Colors.primary} />
      </TouchableOpacity>

      <View style={styles.weekTitle}>
        <Text style={styles.weekTitleText}>
          {MONTH_NAMES[weekDates[0].getMonth()]} {weekDates[0].getDate()} -{' '}
          {weekDates[0].getMonth() !== weekDates[6].getMonth()
            ? MONTH_NAMES[weekDates[6].getMonth()] + ' '
            : ''}
          {weekDates[6].getDate()}, {weekDates[6].getFullYear()}
        </Text>
        <TouchableOpacity onPress={goToToday} style={styles.todayButton}>
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.navButton}
        onPress={() => navigateWeek('next')}
      >
        <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
      </TouchableOpacity>
    </View>
  );

  const renderDaySelector = () => (
    <View style={styles.daySelector}>
      {weekDates.map((date, index) => {
        const dateKey = formatDateKey(date);
        const isSelected = dateKey === selectedDateKey;
        const isToday = dateKey === todayKey;
        const count = jobCounts[dateKey] || 0;

        return (
          <TouchableOpacity
            key={dateKey}
            style={[
              styles.dayButton,
              isSelected && styles.dayButtonSelected,
              isToday && !isSelected && styles.dayButtonToday,
            ]}
            onPress={() => setSelectedDate(date)}
          >
            <Text
              style={[
                styles.dayName,
                isSelected && styles.dayNameSelected,
              ]}
            >
              {DAY_NAMES[index]}
            </Text>
            <Text
              style={[
                styles.dayNumber,
                isSelected && styles.dayNumberSelected,
                isToday && !isSelected && styles.dayNumberToday,
              ]}
            >
              {date.getDate()}
            </Text>
            {count > 0 && (
              <View
                style={[
                  styles.dayBadge,
                  isSelected && styles.dayBadgeSelected,
                ]}
              >
                <Text
                  style={[
                    styles.dayBadgeText,
                    isSelected && styles.dayBadgeTextSelected,
                  ]}
                >
                  {count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderJob = ({ item }: { item: TechJob }) => (
    <TouchableOpacity
      style={styles.jobCard}
      onPress={() => handleJobPress(item)}
      activeOpacity={0.7}
    >
      <View style={styles.jobTimeBlock}>
        <Text style={styles.jobTime}>{formatTime(item.scheduled_time)}</Text>
        {item.estimated_duration && (
          <Text style={styles.jobDuration}>
            {formatDuration(item.estimated_duration)}
          </Text>
        )}
      </View>

      <View
        style={[
          styles.jobStatusBar,
          { backgroundColor: JOB_STATUS_COLORS[item.status] },
        ]}
      />

      <View style={styles.jobContent}>
        <View style={styles.jobHeader}>
          <Text style={styles.jobClientName} numberOfLines={1}>
            {item.client.name}
          </Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: JOB_STATUS_COLORS[item.status] + '20' },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                { color: JOB_STATUS_COLORS[item.status] },
              ]}
            >
              {item.status.replace('_', ' ')}
            </Text>
          </View>
        </View>
        <Text style={styles.jobService}>
          {item.service_name || item.service_type}
        </Text>
        <Text style={styles.jobAddress} numberOfLines={1}>
          {formatAddress(item.address)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {renderWeekHeader()}
      {renderDaySelector()}

      <View style={styles.selectedDateHeader}>
        <Text style={styles.selectedDateText}>
          {selectedDate.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
        <Text style={styles.jobCount}>
          {selectedJobs.length} {selectedJobs.length === 1 ? 'job' : 'jobs'}
        </Text>
      </View>

      <FlatList
        data={selectedJobs}
        keyExtractor={item => item.job_id}
        renderItem={renderJob}
        contentContainerStyle={styles.jobsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-outline" size={48} color={Colors.gray300} />
            <Text style={styles.emptyText}>No jobs scheduled</Text>
            <Text style={styles.emptySubtext}>
              You have no appointments on this day
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  weekHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  navButton: {
    padding: Spacing.xs,
  },
  weekTitle: {
    alignItems: 'center',
    flex: 1,
  },
  weekTitleText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  todayButton: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.sm,
  },
  todayButtonText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  daySelector: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dayButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginHorizontal: 2,
  },
  dayButtonSelected: {
    backgroundColor: Colors.primary,
  },
  dayButtonToday: {
    backgroundColor: Colors.primary + '15',
  },
  dayName: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  dayNameSelected: {
    color: Colors.white,
  },
  dayNumber: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  dayNumberSelected: {
    color: Colors.white,
  },
  dayNumberToday: {
    color: Colors.primary,
  },
  dayBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 4,
  },
  dayBadgeSelected: {
    backgroundColor: Colors.white,
  },
  dayBadgeText: {
    fontSize: 10,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  dayBadgeTextSelected: {
    color: Colors.primary,
  },
  selectedDateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  selectedDateText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  jobCount: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  jobsList: {
    padding: Spacing.md,
  },
  jobCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  jobTimeBlock: {
    width: 60,
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  jobTime: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  jobDuration: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  jobStatusBar: {
    width: 4,
    height: '100%',
    minHeight: 50,
    borderRadius: 2,
    marginRight: Spacing.md,
  },
  jobContent: {
    flex: 1,
  },
  jobHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  jobClientName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    flex: 1,
    marginRight: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  statusBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  jobService: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  jobAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
  },
  emptyText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});
