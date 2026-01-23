/**
 * Voice Calls Screen
 * List and manage AI voice calls
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import CallLog from '../../components/voice/CallLog';
import TranscriptModal from '../../components/voice/TranscriptModal';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface VoiceCall {
  call_id: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  status: string;
  intent: string;
  duration_seconds: number;
  created_at: string;
  customer_name?: string;
  conversation_summary?: string;
}

interface CallStats {
  total_calls: number;
  inbound_calls: number;
  outbound_calls: number;
  avg_duration: number;
  bookings_made: number;
}

type FilterType = 'all' | 'inbound' | 'outbound';
type IntentFilter = 'all' | 'booking' | 'reschedule' | 'cancel' | 'inquiry' | 'support';

export default function VoiceCallsScreen() {
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<FilterType>('all');
  const [intentFilter, setIntentFilter] = useState<IntentFilter>('all');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [transcriptVisible, setTranscriptVisible] = useState(false);

  useEffect(() => {
    fetchCalls(true);
    fetchStats();
  }, [directionFilter, intentFilter]);

  const fetchCalls = async (reset = false) => {
    if (!reset && !hasMore) return;

    const currentPage = reset ? 1 : page;

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: '20',
      });

      if (directionFilter !== 'all') {
        params.append('direction', directionFilter);
      }
      if (intentFilter !== 'all') {
        params.append('intent', intentFilter);
      }

      const response = await api.get(`/voice/calls?${params}`);

      if (response.data?.data) {
        const callData = response.data.data;
        if (reset) {
          setCalls(callData);
        } else {
          setCalls(prev => [...prev, ...callData]);
        }
        setHasMore(response.data.meta?.has_next || false);
        setPage(currentPage + 1);
      }
    } catch (error) {
      console.error('Failed to fetch calls:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/voice/calls/stats');
      if (response.data?.data) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch call stats:', error);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchCalls(true), fetchStats()]);
    setRefreshing(false);
  }, [directionFilter, intentFilter]);

  const handleCallPress = (callId: string) => {
    setSelectedCallId(callId);
    setTranscriptVisible(true);
  };

  const handleCallBack = (phone: string) => {
    Linking.openURL(`tel:${phone}`);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const directionFilters: { key: FilterType; label: string; icon: string }[] = [
    { key: 'all', label: 'All Calls', icon: 'call' },
    { key: 'inbound', label: 'Inbound', icon: 'arrow-down' },
    { key: 'outbound', label: 'Outbound', icon: 'arrow-up' },
  ];

  const intentFilters: { key: IntentFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'booking', label: 'Bookings' },
    { key: 'reschedule', label: 'Reschedule' },
    { key: 'cancel', label: 'Cancel' },
    { key: 'inquiry', label: 'Inquiry' },
  ];

  const renderStats = () => {
    if (!stats) return null;

    return (
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: Colors.primary + '15' }]}>
            <Ionicons name="call" size={20} color={Colors.primary} />
          </View>
          <Text style={styles.statValue}>{stats.total_calls}</Text>
          <Text style={styles.statLabel}>Total Calls</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: Colors.success + '15' }]}>
            <Ionicons name="calendar" size={20} color={Colors.success} />
          </View>
          <Text style={styles.statValue}>{stats.bookings_made}</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: Colors.warning + '15' }]}>
            <Ionicons name="time" size={20} color={Colors.warning} />
          </View>
          <Text style={styles.statValue}>{formatDuration(stats.avg_duration)}</Text>
          <Text style={styles.statLabel}>Avg Duration</Text>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <Ionicons name="call-outline" size={64} color={Colors.gray300} />
      </View>
      <Text style={styles.emptyTitle}>No calls yet</Text>
      <Text style={styles.emptyText}>
        Voice calls handled by your AI receptionist will appear here
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View>
      {renderStats()}

      {/* Intent Filter Pills */}
      <View style={styles.intentFilterContainer}>
        {intentFilters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.intentPill,
              intentFilter === f.key && styles.intentPillActive,
            ]}
            onPress={() => setIntentFilter(f.key)}
          >
            <Text
              style={[
                styles.intentPillText,
                intentFilter === f.key && styles.intentPillTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Voice Calls</Text>
        <View style={styles.headerBadge}>
          <Ionicons name="hardware-chip" size={14} color={Colors.primary} />
          <Text style={styles.headerBadgeText}>AI Powered</Text>
        </View>
      </View>

      {/* Direction Filter Tabs */}
      <View style={styles.directionFilterContainer}>
        {directionFilters.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.directionTab,
              directionFilter === f.key && styles.directionTabActive,
            ]}
            onPress={() => setDirectionFilter(f.key)}
          >
            <Ionicons
              name={f.icon as any}
              size={16}
              color={directionFilter === f.key ? Colors.white : Colors.textSecondary}
            />
            <Text
              style={[
                styles.directionTabText,
                directionFilter === f.key && styles.directionTabTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Calls List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading calls...</Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          renderItem={({ item }) => (
            <CallLog
              call={item}
              onPress={handleCallPress}
              onCall={handleCallBack}
            />
          )}
          keyExtractor={item => item.call_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          onEndReached={() => fetchCalls(false)}
          onEndReachedThreshold={0.3}
        />
      )}

      {/* Transcript Modal */}
      {selectedCallId && (
        <TranscriptModal
          visible={transcriptVisible}
          callId={selectedCallId}
          onClose={() => {
            setTranscriptVisible(false);
            setSelectedCallId(null);
          }}
        />
      )}
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
    paddingVertical: Spacing.md,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.full,
  },
  headerBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
  },
  directionFilterContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    gap: Spacing.sm,
  },
  directionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray100,
  },
  directionTabActive: {
    backgroundColor: Colors.primary,
  },
  directionTabText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  directionTabTextActive: {
    color: Colors.white,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
  },
  listContent: {
    padding: Spacing.md,
    flexGrow: 1,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  statValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  intentFilterContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  intentPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  intentPillActive: {
    backgroundColor: Colors.primary + '10',
    borderColor: Colors.primary,
  },
  intentPillText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  intentPillTextActive: {
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    minHeight: 300,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
});
