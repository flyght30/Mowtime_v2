/**
 * Dispatch Board Page
 * Main dispatch interface with job queue and tech overview
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import {
  dispatchApi,
  techniciansApi,
  scheduleApi,
  DispatchJob,
  Technician,
  TechStatus,
  TechSuggestion,
} from '../../services/dispatchApi';

const STATUS_COLORS: Record<TechStatus, string> = {
  available: Colors.success,
  assigned: Colors.info,
  enroute: Colors.warning,
  on_site: '#7C3AED',
  complete: Colors.success,
  off_duty: Colors.gray400,
};

type ViewMode = 'day' | 'week';

export default function DispatchBoardScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unassignedJobs, setUnassignedJobs] = useState<DispatchJob[]>([]);
  const [assignedJobs, setAssignedJobs] = useState<DispatchJob[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [weekSchedule, setWeekSchedule] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Assign modal state
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState<DispatchJob | null>(null);
  const [suggestions, setSuggestions] = useState<TechSuggestion[]>([]);
  const [assignLoading, setAssignLoading] = useState(false);

  const today = new Date().toISOString().split('T')[0];

  // Get week dates
  const getWeekDates = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
    const monday = new Date(d.setDate(diff));
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const current = new Date(monday);
      current.setDate(monday.getDate() + i);
      dates.push(current);
    }
    return dates;
  };

  const weekDates = getWeekDates(selectedDate);
  const weekStart = weekDates[0].toISOString().split('T')[0];
  const weekEnd = weekDates[6].toISOString().split('T')[0];

  const loadData = useCallback(async () => {
    try {
      const [queueRes, techsRes, statsRes] = await Promise.all([
        dispatchApi.getQueue(),
        techniciansApi.list({ active_only: true }),
        dispatchApi.getStats(today),
      ]);

      if (queueRes.success && queueRes.data) {
        setUnassignedJobs(queueRes.data.unassigned);
        setAssignedJobs(queueRes.data.assigned_today);
      }

      if (techsRes.success && techsRes.data) {
        setTechnicians(techsRes.data);
      }

      if (statsRes.success && statsRes.data) {
        setStats(statsRes.data);
      }

      // Load week schedule if in week mode
      if (viewMode === 'week') {
        const weekRes = await scheduleApi.getWeekly(weekStart);
        if (weekRes.success && weekRes.data) {
          setWeekSchedule(weekRes.data);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load dispatch data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today, viewMode, weekStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleJobPress = async (job: DispatchJob) => {
    setSelectedJob(job);
    setAssignModalVisible(true);
    setAssignLoading(true);

    try {
      const response = await dispatchApi.suggestTech(job.id, today);
      if (response.success && response.data) {
        setSuggestions(response.data.suggestions);
      }
    } catch (err) {
      console.error('Failed to get suggestions');
    } finally {
      setAssignLoading(false);
    }
  };

  const handleAssign = async (techId: string) => {
    if (!selectedJob) return;

    setAssignLoading(true);
    try {
      const response = await scheduleApi.assign({
        job_id: selectedJob.id,
        tech_id: techId,
        scheduled_date: today,
        start_time: '09:00',
        estimated_hours: selectedJob.estimated_hours || 2,
      });

      if (response.success) {
        setAssignModalVisible(false);
        setSelectedJob(null);
        loadData();
      } else {
        Alert.alert('Error', response.error?.message || 'Failed to assign job');
      }
    } catch (err) {
      Alert.alert('Error', 'Network error');
    } finally {
      setAssignLoading(false);
    }
  };

  const renderJobCard = (job: DispatchJob, isAssigned: boolean) => (
    <TouchableOpacity
      key={job.id}
      style={[styles.jobCard, isAssigned && styles.jobCardAssigned]}
      onPress={() => !isAssigned && handleJobPress(job)}
      disabled={isAssigned}
    >
      <View style={styles.jobHeader}>
        <Text style={styles.jobNumber}>{job.job_number}</Text>
        <View style={[styles.jobTypeBadge, { backgroundColor: job.job_type === 'install' ? Colors.primary : Colors.info }]}>
          <Text style={styles.jobTypeText}>{job.job_type}</Text>
        </View>
      </View>
      <Text style={styles.jobCustomer}>{job.customer_name}</Text>
      <Text style={styles.jobAddress} numberOfLines={1}>{job.address}</Text>
      <View style={styles.jobFooter}>
        <Text style={styles.jobHours}>{job.estimated_hours}h</Text>
        <Text style={styles.jobTotal}>${job.grand_total.toLocaleString()}</Text>
      </View>
      {!isAssigned && (
        <TouchableOpacity style={styles.assignButton} onPress={() => handleJobPress(job)}>
          <Text style={styles.assignButtonText}>Assign</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderTechCard = (tech: Technician) => (
    <View key={tech.tech_id} style={styles.techCard}>
      <View style={[styles.techStatus, { backgroundColor: STATUS_COLORS[tech.status] }]} />
      <View style={[styles.techAvatar, { backgroundColor: tech.color }]}>
        <Text style={styles.techAvatarText}>{tech.first_name[0]}{tech.last_name[0]}</Text>
      </View>
      <View style={styles.techInfo}>
        <Text style={styles.techName}>{tech.first_name} {tech.last_name[0]}.</Text>
        <Text style={styles.techStatusText}>{tech.status.replace('_', ' ')}</Text>
      </View>
      {tech.current_job_id && (
        <Ionicons name="briefcase" size={16} color={Colors.primary} />
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading dispatch board...</Text>
      </View>
    );
  }

  // Navigate week
  const navigateWeek = (direction: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + (direction * 7));
    setSelectedDate(newDate);
  };

  // Format date for display
  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const formatDayLabel = (date: Date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  };

  // Render week view
  const renderWeekView = () => {
    if (!weekSchedule) return null;

    return (
      <View style={styles.weekContainer}>
        {/* Week Navigation */}
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => navigateWeek(-1)} style={styles.weekNavButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.weekNavTitle}>
            {formatDateShort(weekDates[0])} - {formatDateShort(weekDates[6])}
          </Text>
          <TouchableOpacity onPress={() => navigateWeek(1)} style={styles.weekNavButton}>
            <Ionicons name="chevron-forward" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Week Grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.weekGrid}>
            {weekDates.map((date, index) => {
              const dateStr = date.toISOString().split('T')[0];
              const daySchedule = weekSchedule.schedule?.[dateStr] || [];
              const isToday = dateStr === today;

              return (
                <View key={dateStr} style={[styles.dayColumn, isToday && styles.todayColumn]}>
                  <View style={[styles.dayHeader, isToday && styles.todayHeader]}>
                    <Text style={[styles.dayLabel, isToday && styles.todayText]}>
                      {formatDayLabel(date)}
                    </Text>
                    <Text style={[styles.dayNumber, isToday && styles.todayText]}>
                      {date.getDate()}
                    </Text>
                  </View>
                  <View style={styles.dayJobs}>
                    {daySchedule.length === 0 ? (
                      <Text style={styles.noJobsText}>-</Text>
                    ) : (
                      daySchedule.slice(0, 5).map((entry: any) => (
                        <View key={entry.entry_id} style={styles.weekJobCard}>
                          <Text style={styles.weekJobTime}>
                            {entry.start_time?.slice(0, 5)}
                          </Text>
                          <Text style={styles.weekJobType} numberOfLines={1}>
                            {entry.job_type || 'Job'}
                          </Text>
                          <Text style={styles.weekJobTech} numberOfLines={1}>
                            {entry.tech_name?.split(' ')[0] || 'TBA'}
                          </Text>
                        </View>
                      ))
                    )}
                    {daySchedule.length > 5 && (
                      <Text style={styles.moreJobs}>+{daySchedule.length - 5} more</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[Colors.primary]} />}
        contentContainerStyle={styles.content}
      >
        {/* View Mode Toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'day' && styles.toggleButtonActive]}
            onPress={() => setViewMode('day')}
          >
            <Ionicons
              name="today"
              size={18}
              color={viewMode === 'day' ? Colors.white : Colors.text}
            />
            <Text style={[styles.toggleText, viewMode === 'day' && styles.toggleTextActive]}>
              Day
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'week' && styles.toggleButtonActive]}
            onPress={() => setViewMode('week')}
          >
            <Ionicons
              name="calendar"
              size={18}
              color={viewMode === 'week' ? Colors.white : Colors.text}
            />
            <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>
              Week
            </Text>
          </TouchableOpacity>
        </View>

        {/* Stats Bar */}
        {stats && (
          <View style={styles.statsBar}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.jobs?.unassigned || 0}</Text>
              <Text style={styles.statLabel}>Unassigned</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.jobs?.scheduled || 0}</Text>
              <Text style={styles.statLabel}>Scheduled</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.jobs?.in_progress || 0}</Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.jobs?.completed || 0}</Text>
              <Text style={styles.statLabel}>Complete</Text>
            </View>
          </View>
        )}

        {/* Technicians Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Technicians</Text>
            <Text style={styles.sectionCount}>
              {technicians.filter(t => t.status === 'available').length} available
            </Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.techList}>
            {technicians.map(renderTechCard)}
          </ScrollView>
        </View>

        {/* Unassigned Jobs */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Unassigned Jobs</Text>
            <Text style={styles.sectionCount}>{unassignedJobs.length} jobs</Text>
          </View>
          {unassignedJobs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
              <Text style={styles.emptyText}>All jobs assigned!</Text>
            </View>
          ) : (
            unassignedJobs.map(job => renderJobCard(job, false))
          )}
        </View>

        {/* Day View: Today's Assigned Jobs */}
        {viewMode === 'day' && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Schedule</Text>
              <Text style={styles.sectionCount}>{assignedJobs.length} jobs</Text>
            </View>
            {assignedJobs.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="calendar-outline" size={48} color={Colors.gray300} />
                <Text style={styles.emptyText}>No jobs scheduled for today</Text>
              </View>
            ) : (
              assignedJobs.map(job => renderJobCard(job, true))
            )}
          </View>
        )}

        {/* Week View */}
        {viewMode === 'week' && renderWeekView()}
      </ScrollView>

      {/* Assign Modal */}
      <Modal
        visible={assignModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAssignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Job</Text>
              <TouchableOpacity onPress={() => setAssignModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.gray500} />
              </TouchableOpacity>
            </View>

            {selectedJob && (
              <View style={styles.modalJobInfo}>
                <Text style={styles.modalJobNumber}>{selectedJob.job_number}</Text>
                <Text style={styles.modalJobCustomer}>{selectedJob.customer_name}</Text>
                <Text style={styles.modalJobAddress}>{selectedJob.address}</Text>
              </View>
            )}

            <Text style={styles.modalSectionTitle}>Recommended Technicians</Text>

            {assignLoading ? (
              <ActivityIndicator size="small" color={Colors.primary} style={{ marginVertical: Spacing.lg }} />
            ) : (
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.tech_id}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.suggestionCard} onPress={() => handleAssign(item.tech_id)}>
                    <View style={styles.suggestionHeader}>
                      <Text style={styles.suggestionName}>{item.tech_name}</Text>
                      <View style={styles.scoreBadge}>
                        <Text style={styles.scoreText}>{item.score}</Text>
                      </View>
                    </View>
                    <View style={styles.suggestionReasons}>
                      {item.reasons.slice(0, 3).map((reason, i) => (
                        <Text key={i} style={styles.reasonText}>• {reason}</Text>
                      ))}
                    </View>
                    {item.eta_minutes && (
                      <Text style={styles.etaText}>ETA: {item.eta_minutes} min</Text>
                    )}
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.noSuggestions}>No available technicians</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: Typography.fontSize.xl,
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
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  sectionCount: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  techList: {
    flexDirection: 'row',
  },
  techCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginRight: Spacing.sm,
    ...Shadows.sm,
  },
  techStatus: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: Spacing.xs,
  },
  techAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.xs,
  },
  techAvatarText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  techInfo: {
    marginRight: Spacing.sm,
  },
  techName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  techStatusText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  jobCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  jobCardAssigned: {
    opacity: 0.7,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  jobNumber: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  jobTypeBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  jobTypeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
    textTransform: 'capitalize',
  },
  jobCustomer: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  jobAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  jobHours: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  jobTotal: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  assignButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  assignButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.md,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  modalJobInfo: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  modalJobNumber: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  modalJobCustomer: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  modalJobAddress: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  modalSectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  suggestionCard: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  scoreBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  scoreText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
  },
  suggestionReasons: {
    marginTop: Spacing.xs,
  },
  reasonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  etaText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    marginTop: Spacing.xs,
  },
  noSuggestions: {
    textAlign: 'center',
    color: Colors.textSecondary,
    padding: Spacing.lg,
  },
  // View Toggle
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: 4,
    marginBottom: Spacing.md,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    gap: Spacing.xs,
  },
  toggleButtonActive: {
    backgroundColor: Colors.primary,
  },
  toggleText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  toggleTextActive: {
    color: Colors.white,
  },
  // Week View
  weekContainer: {
    marginTop: Spacing.md,
  },
  weekNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  weekNavButton: {
    padding: Spacing.sm,
  },
  weekNavTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  weekGrid: {
    flexDirection: 'row',
  },
  dayColumn: {
    width: 120,
    marginRight: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  todayColumn: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  dayHeader: {
    backgroundColor: Colors.gray100,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  todayHeader: {
    backgroundColor: Colors.primary,
  },
  dayLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  dayNumber: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  todayText: {
    color: Colors.white,
  },
  dayJobs: {
    padding: Spacing.xs,
    minHeight: 150,
  },
  noJobsText: {
    textAlign: 'center',
    color: Colors.gray300,
    marginTop: Spacing.md,
  },
  weekJobCard: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.sm,
    padding: Spacing.xs,
    marginBottom: Spacing.xs,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  weekJobTime: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
  },
  weekJobType: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text,
  },
  weekJobTech: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  moreJobs: {
    textAlign: 'center',
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
});
