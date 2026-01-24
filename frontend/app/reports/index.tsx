/**
 * Reports Page
 * Generate, download, and schedule business reports
 * Phase 9 - Reporting & Analytics
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { api } from '../../services/api';
import { Card } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

type ReportType =
  | 'revenue_summary'
  | 'technician_performance'
  | 'job_analysis'
  | 'customer_report'
  | 'ar_aging'
  | 'cash_flow'
  | 'executive_summary';

type ReportFormat = 'pdf' | 'excel' | 'csv';

type TabType = 'generate' | 'scheduled' | 'history';

interface ReportTypeInfo {
  type: ReportType;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

interface ScheduledReport {
  schedule_id: string;
  report_type: ReportType;
  format: ReportFormat;
  schedule: string;
  recipients: string[];
  is_active: boolean;
  last_run?: string;
  next_run?: string;
}

interface ReportHistory {
  report_id: string;
  report_type: ReportType;
  format: ReportFormat;
  generated_at: string;
  status: 'completed' | 'failed' | 'pending';
  download_url?: string;
}

const REPORT_TYPES: ReportTypeInfo[] = [
  {
    type: 'revenue_summary',
    title: 'Revenue Summary',
    description: 'Revenue breakdown by period, type, and technician',
    icon: 'cash',
    color: '#4CAF50',
  },
  {
    type: 'technician_performance',
    title: 'Technician Performance',
    description: 'Jobs completed, ratings, efficiency metrics',
    icon: 'people',
    color: '#2196F3',
  },
  {
    type: 'job_analysis',
    title: 'Job Analysis',
    description: 'Job types, completion rates, margins',
    icon: 'briefcase',
    color: '#FF9800',
  },
  {
    type: 'customer_report',
    title: 'Customer Report',
    description: 'Top customers, retention, lifetime value',
    icon: 'person',
    color: '#9C27B0',
  },
  {
    type: 'ar_aging',
    title: 'AR Aging',
    description: 'Outstanding invoices by age bucket',
    icon: 'time',
    color: '#F44336',
  },
  {
    type: 'cash_flow',
    title: 'Cash Flow Forecast',
    description: 'Projected income based on scheduled jobs',
    icon: 'trending-up',
    color: '#00BCD4',
  },
  {
    type: 'executive_summary',
    title: 'Executive Summary',
    description: 'High-level KPIs and business health',
    icon: 'stats-chart',
    color: '#607D8B',
  },
];

const FORMAT_OPTIONS: { format: ReportFormat; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { format: 'pdf', label: 'PDF', icon: 'document' },
  { format: 'excel', label: 'Excel', icon: 'grid' },
  { format: 'csv', label: 'CSV', icon: 'list' },
];

const PERIOD_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_quarter', label: 'This Quarter' },
  { value: 'last_quarter', label: 'Last Quarter' },
  { value: 'this_year', label: 'This Year' },
];

export default function ReportsPage() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialTab = (params.tab as TabType) || 'generate';

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<ReportFormat>('pdf');
  const [selectedPeriod, setSelectedPeriod] = useState('this_month');
  const [isGenerating, setIsGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportHistory[]>([]);
  const [isLoadingScheduled, setIsLoadingScheduled] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const loadScheduledReports = useCallback(async () => {
    try {
      const res = await api.get('/reports/schedules');
      if (res.success && res.data?.data) {
        setScheduledReports(res.data.data);
      }
    } catch (error) {
      console.error('Failed to load scheduled reports:', error);
    } finally {
      setIsLoadingScheduled(false);
    }
  }, []);

  const loadReportHistory = useCallback(async () => {
    try {
      const res = await api.get('/reports/history?limit=20');
      if (res.success && res.data?.data) {
        setReportHistory(res.data.data);
      }
    } catch (error) {
      console.error('Failed to load report history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'scheduled') {
      loadScheduledReports();
    } else if (activeTab === 'history') {
      loadReportHistory();
    }
  }, [activeTab, loadScheduledReports, loadReportHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'scheduled') {
      await loadScheduledReports();
    } else if (activeTab === 'history') {
      await loadReportHistory();
    }
    setRefreshing(false);
  };

  const handleGenerateReport = async () => {
    if (!selectedType) {
      Alert.alert('Select Report', 'Please select a report type to generate.');
      return;
    }

    setIsGenerating(true);

    try {
      const res = await api.post('/reports/generate', {
        report_type: selectedType,
        format: selectedFormat,
        period: selectedPeriod,
      });

      if (res.success && res.data) {
        // In a real app, you would download the file
        // For now, show success and offer to share
        Alert.alert(
          'Report Generated',
          `Your ${selectedFormat.toUpperCase()} report is ready.`,
          [
            { text: 'Close', style: 'cancel' },
            {
              text: 'Share',
              onPress: () => handleShareReport(res.data.download_url),
            },
          ]
        );
      }
    } catch (error) {
      console.error('Failed to generate report:', error);
      Alert.alert('Error', 'Failed to generate report. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleShareReport = async (url?: string) => {
    if (!url) return;

    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
        return;
      }

      const filename = `report_${Date.now()}.${selectedFormat}`;
      const fileUri = FileSystem.documentDirectory + filename;

      const downloadResult = await FileSystem.downloadAsync(url, fileUri);

      if (downloadResult.status === 200) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadResult.uri);
        }
      }
    } catch (error) {
      console.error('Failed to share report:', error);
    }
  };

  const handleToggleSchedule = async (schedule: ScheduledReport) => {
    try {
      await api.put(`/reports/schedules/${schedule.schedule_id}`, {
        is_active: !schedule.is_active,
      });
      loadScheduledReports();
    } catch (error) {
      console.error('Failed to toggle schedule:', error);
    }
  };

  const handleDeleteSchedule = async (scheduleId: string) => {
    Alert.alert(
      'Delete Schedule',
      'Are you sure you want to delete this scheduled report?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/reports/schedules/${scheduleId}`);
              loadScheduledReports();
            } catch (error) {
              console.error('Failed to delete schedule:', error);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getReportTypeInfo = (type: ReportType): ReportTypeInfo | undefined => {
    return REPORT_TYPES.find((rt) => rt.type === type);
  };

  const renderGenerateTab = () => (
    <>
      {/* Report Type Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Select Report Type</Text>
        <View style={styles.reportTypesGrid}>
          {REPORT_TYPES.map((report) => (
            <TouchableOpacity
              key={report.type}
              style={[
                styles.reportTypeCard,
                selectedType === report.type && styles.reportTypeCardSelected,
              ]}
              onPress={() => setSelectedType(report.type)}
            >
              <View
                style={[
                  styles.reportTypeIcon,
                  { backgroundColor: report.color + '20' },
                ]}
              >
                <Ionicons name={report.icon} size={24} color={report.color} />
              </View>
              <Text style={styles.reportTypeTitle}>{report.title}</Text>
              <Text style={styles.reportTypeDesc} numberOfLines={2}>
                {report.description}
              </Text>
              {selectedType === report.type && (
                <View style={styles.selectedBadge}>
                  <Ionicons name="checkmark" size={16} color={Colors.white} />
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Format Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Export Format</Text>
        <View style={styles.formatRow}>
          {FORMAT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.format}
              style={[
                styles.formatButton,
                selectedFormat === option.format && styles.formatButtonSelected,
              ]}
              onPress={() => setSelectedFormat(option.format)}
            >
              <Ionicons
                name={option.icon}
                size={20}
                color={selectedFormat === option.format ? Colors.white : Colors.text}
              />
              <Text
                style={[
                  styles.formatButtonText,
                  selectedFormat === option.format && styles.formatButtonTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Period Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Time Period</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.periodContent}
        >
          {PERIOD_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.periodButton,
                selectedPeriod === option.value && styles.periodButtonSelected,
              ]}
              onPress={() => setSelectedPeriod(option.value)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === option.value && styles.periodButtonTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Generate Button */}
      <TouchableOpacity
        style={[styles.generateButton, !selectedType && styles.generateButtonDisabled]}
        onPress={handleGenerateReport}
        disabled={!selectedType || isGenerating}
      >
        {isGenerating ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <>
            <Ionicons name="download" size={20} color={Colors.white} />
            <Text style={styles.generateButtonText}>Generate Report</Text>
          </>
        )}
      </TouchableOpacity>
    </>
  );

  const renderScheduledTab = () => (
    <>
      {/* Add Schedule Button */}
      <TouchableOpacity style={styles.addScheduleButton}>
        <Ionicons name="add" size={20} color={Colors.white} />
        <Text style={styles.addScheduleText}>Create Scheduled Report</Text>
      </TouchableOpacity>

      {isLoadingScheduled ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : scheduledReports.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={48} color={Colors.gray300} />
          <Text style={styles.emptyTitle}>No Scheduled Reports</Text>
          <Text style={styles.emptyText}>
            Schedule reports to be automatically generated and emailed on a
            recurring basis.
          </Text>
        </View>
      ) : (
        scheduledReports.map((schedule) => {
          const typeInfo = getReportTypeInfo(schedule.report_type);
          return (
            <Card key={schedule.schedule_id} style={styles.scheduleCard}>
              <View style={styles.scheduleHeader}>
                <View
                  style={[
                    styles.scheduleIcon,
                    { backgroundColor: (typeInfo?.color || Colors.gray500) + '20' },
                  ]}
                >
                  <Ionicons
                    name={typeInfo?.icon || 'document'}
                    size={20}
                    color={typeInfo?.color || Colors.gray500}
                  />
                </View>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.scheduleName}>
                    {typeInfo?.title || schedule.report_type}
                  </Text>
                  <Text style={styles.scheduleFreq}>
                    {schedule.schedule} | {schedule.format.toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.toggleButton,
                    schedule.is_active && styles.toggleButtonActive,
                  ]}
                  onPress={() => handleToggleSchedule(schedule)}
                >
                  <Text
                    style={[
                      styles.toggleText,
                      schedule.is_active && styles.toggleTextActive,
                    ]}
                  >
                    {schedule.is_active ? 'Active' : 'Paused'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.scheduleDetails}>
                <View style={styles.scheduleDetail}>
                  <Text style={styles.detailLabel}>Recipients</Text>
                  <Text style={styles.detailValue}>
                    {schedule.recipients.length} email(s)
                  </Text>
                </View>
                {schedule.next_run && (
                  <View style={styles.scheduleDetail}>
                    <Text style={styles.detailLabel}>Next Run</Text>
                    <Text style={styles.detailValue}>
                      {formatDate(schedule.next_run)}
                    </Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={styles.deleteScheduleButton}
                onPress={() => handleDeleteSchedule(schedule.schedule_id)}
              >
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
                <Text style={styles.deleteScheduleText}>Delete</Text>
              </TouchableOpacity>
            </Card>
          );
        })
      )}
    </>
  );

  const renderHistoryTab = () => (
    <>
      {isLoadingHistory ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : reportHistory.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="folder-open-outline" size={48} color={Colors.gray300} />
          <Text style={styles.emptyTitle}>No Report History</Text>
          <Text style={styles.emptyText}>
            Generated reports will appear here for quick access.
          </Text>
        </View>
      ) : (
        reportHistory.map((report) => {
          const typeInfo = getReportTypeInfo(report.report_type);
          return (
            <Card key={report.report_id} style={styles.historyCard}>
              <View style={styles.historyRow}>
                <View
                  style={[
                    styles.historyIcon,
                    { backgroundColor: (typeInfo?.color || Colors.gray500) + '20' },
                  ]}
                >
                  <Ionicons
                    name={typeInfo?.icon || 'document'}
                    size={20}
                    color={typeInfo?.color || Colors.gray500}
                  />
                </View>
                <View style={styles.historyInfo}>
                  <Text style={styles.historyTitle}>
                    {typeInfo?.title || report.report_type}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {report.format.toUpperCase()} | {formatDate(report.generated_at)}
                  </Text>
                </View>
                <View style={styles.historyActions}>
                  <View
                    style={[
                      styles.statusBadge,
                      report.status === 'completed' && styles.statusCompleted,
                      report.status === 'failed' && styles.statusFailed,
                      report.status === 'pending' && styles.statusPending,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                    </Text>
                  </View>
                  {report.status === 'completed' && report.download_url && (
                    <TouchableOpacity
                      style={styles.downloadButton}
                      onPress={() => handleShareReport(report.download_url)}
                    >
                      <Ionicons name="download-outline" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Card>
          );
        })
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Reports</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'generate' && styles.tabActive]}
          onPress={() => setActiveTab('generate')}
        >
          <Ionicons
            name="create"
            size={18}
            color={activeTab === 'generate' ? Colors.primary : Colors.textSecondary}
          />
          <Text
            style={[styles.tabText, activeTab === 'generate' && styles.tabTextActive]}
          >
            Generate
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'scheduled' && styles.tabActive]}
          onPress={() => setActiveTab('scheduled')}
        >
          <Ionicons
            name="time"
            size={18}
            color={activeTab === 'scheduled' ? Colors.primary : Colors.textSecondary}
          />
          <Text
            style={[styles.tabText, activeTab === 'scheduled' && styles.tabTextActive]}
          >
            Scheduled
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Ionicons
            name="folder"
            size={18}
            color={activeTab === 'history' ? Colors.primary : Colors.textSecondary}
          />
          <Text
            style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}
          >
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {activeTab === 'generate' && renderGenerateTab()}
        {activeTab === 'scheduled' && renderScheduledTab()}
        {activeTab === 'history' && renderHistoryTab()}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  reportTypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  reportTypeCard: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reportTypeCardSelected: {
    borderColor: Colors.primary,
  },
  reportTypeIcon: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  reportTypeTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: 4,
  },
  reportTypeDesc: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  selectedBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  formatRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  formatButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  formatButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  formatButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  formatButtonTextSelected: {
    color: Colors.white,
  },
  periodContent: {
    gap: Spacing.sm,
  },
  periodButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  periodButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  periodButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  periodButtonTextSelected: {
    color: Colors.white,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  generateButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  generateButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.xl * 2,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptyText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  addScheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  addScheduleText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  scheduleCard: {
    marginBottom: Spacing.md,
    padding: Spacing.md,
  },
  scheduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduleIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scheduleInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  scheduleName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  scheduleFreq: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  toggleButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray200,
  },
  toggleButtonActive: {
    backgroundColor: Colors.success + '20',
  },
  toggleText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: Colors.success,
  },
  scheduleDetails: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  scheduleDetail: {
    flex: 1,
  },
  detailLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginTop: 2,
  },
  deleteScheduleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.xs,
  },
  deleteScheduleText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
  },
  historyCard: {
    marginBottom: Spacing.sm,
    padding: Spacing.md,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  historyTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  historyMeta: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray200,
  },
  statusCompleted: {
    backgroundColor: Colors.success + '20',
  },
  statusFailed: {
    backgroundColor: Colors.error + '20',
  },
  statusPending: {
    backgroundColor: Colors.warning + '20',
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  downloadButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
