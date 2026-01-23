/**
 * PurchaseOrderList Component
 * Display and manage purchase orders
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import api from '../../services/api';

interface POSummary {
  po_id: string;
  po_number: string;
  status: string;
  distributor_name: string;
  total: number;
  items_count: number;
  job_id?: string;
  expected_delivery?: string;
  created_at: string;
}

interface Props {
  onSelectPO?: (po: POSummary) => void;
  onCreatePO?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft: Colors.gray400,
  pending_approval: Colors.warning,
  approved: Colors.info,
  sent: Colors.primary,
  partial: Colors.warning,
  received: Colors.success,
  cancelled: Colors.error,
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  sent: 'Sent',
  partial: 'Partial',
  received: 'Received',
  cancelled: 'Cancelled',
};

export default function PurchaseOrderList({ onSelectPO, onCreatePO }: Props) {
  const [purchaseOrders, setPurchaseOrders] = useState<POSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    try {
      const params: Record<string, any> = {};
      if (selectedFilter !== 'all') {
        params.status = selectedFilter;
      }

      const response = await api.get('/api/v1/purchase-orders', { params });
      setPurchaseOrders(response.data?.data || []);
    } catch (err) {
      console.error('Failed to load purchase orders:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleSendPO = async (po: POSummary) => {
    Alert.alert(
      'Send Purchase Order',
      `Mark ${po.po_number} as sent to ${po.distributor_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              await api.post(`/api/v1/purchase-orders/${po.po_id}/send`);
              loadData();
              Alert.alert('Success', 'PO marked as sent');
            } catch (err) {
              Alert.alert('Error', 'Failed to update PO');
            }
          },
        },
      ]
    );
  };

  const handleReceivePO = async (po: POSummary) => {
    Alert.alert(
      'Receive Items',
      `Mark all items on ${po.po_number} as received?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Receive All',
          onPress: async () => {
            try {
              // Get full PO to get line items
              const poRes = await api.get(`/api/v1/purchase-orders/${po.po_id}`);
              const fullPO = poRes.data?.data;

              if (fullPO?.items) {
                const itemsToReceive = fullPO.items.map((item: any) => ({
                  line_id: item.line_id,
                  quantity_received: item.quantity_ordered - item.quantity_received,
                }));

                await api.post(`/api/v1/purchase-orders/${po.po_id}/receive`, {
                  items: itemsToReceive,
                  update_inventory: true,
                });

                loadData();
                Alert.alert('Success', 'Items received and inventory updated');
              }
            } catch (err) {
              Alert.alert('Error', 'Failed to receive items');
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Calculate summary stats
  const stats = {
    draft: purchaseOrders.filter(po => po.status === 'draft').length,
    pending: purchaseOrders.filter(po => ['sent', 'partial'].includes(po.status)).length,
    totalValue: purchaseOrders
      .filter(po => ['sent', 'partial', 'approved'].includes(po.status))
      .reduce((sum, po) => sum + po.total, 0),
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading purchase orders...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.draft}</Text>
          <Text style={styles.statLabel}>Drafts</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{formatCurrency(stats.totalValue)}</Text>
          <Text style={styles.statLabel}>Outstanding</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
          {['all', 'draft', 'sent', 'partial', 'received'].map((filter) => (
            <TouchableOpacity
              key={filter}
              style={[styles.filterTab, selectedFilter === filter && styles.filterTabActive]}
              onPress={() => setSelectedFilter(filter)}
            >
              <Text style={[styles.filterText, selectedFilter === filter && styles.filterTextActive]}>
                {filter === 'all' ? 'All' : STATUS_LABELS[filter] || filter}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {onCreatePO && (
          <TouchableOpacity style={styles.createButton} onPress={onCreatePO}>
            <Ionicons name="add" size={20} color={Colors.white} />
            <Text style={styles.createButtonText}>New PO</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* PO List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {purchaseOrders.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-text-outline" size={48} color={Colors.gray300} />
            <Text style={styles.emptyText}>No purchase orders found</Text>
          </View>
        ) : (
          purchaseOrders.map((po) => (
            <TouchableOpacity
              key={po.po_id}
              style={styles.poCard}
              onPress={() => onSelectPO?.(po)}
            >
              <View style={styles.poHeader}>
                <View>
                  <Text style={styles.poNumber}>{po.po_number}</Text>
                  <Text style={styles.distributorName}>{po.distributor_name}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: (STATUS_COLORS[po.status] || Colors.gray400) + '20' },
                  ]}
                >
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: STATUS_COLORS[po.status] || Colors.gray400 },
                    ]}
                  />
                  <Text
                    style={[
                      styles.statusText,
                      { color: STATUS_COLORS[po.status] || Colors.gray400 },
                    ]}
                  >
                    {STATUS_LABELS[po.status] || po.status}
                  </Text>
                </View>
              </View>

              <View style={styles.poDetails}>
                <View style={styles.detailItem}>
                  <Ionicons name="cube" size={14} color={Colors.textSecondary} />
                  <Text style={styles.detailText}>{po.items_count} items</Text>
                </View>
                <View style={styles.detailItem}>
                  <Ionicons name="calendar" size={14} color={Colors.textSecondary} />
                  <Text style={styles.detailText}>{formatDate(po.created_at)}</Text>
                </View>
                {po.expected_delivery && (
                  <View style={styles.detailItem}>
                    <Ionicons name="time" size={14} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>ETA: {formatDate(po.expected_delivery)}</Text>
                  </View>
                )}
              </View>

              <View style={styles.poFooter}>
                <Text style={styles.poTotal}>{formatCurrency(po.total)}</Text>
                <View style={styles.actionButtons}>
                  {po.status === 'draft' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.primaryAction]}
                      onPress={() => handleSendPO(po)}
                    >
                      <Ionicons name="send" size={14} color={Colors.white} />
                      <Text style={styles.primaryActionText}>Send</Text>
                    </TouchableOpacity>
                  )}
                  {po.status === 'approved' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.primaryAction]}
                      onPress={() => handleSendPO(po)}
                    >
                      <Ionicons name="send" size={14} color={Colors.white} />
                      <Text style={styles.primaryActionText}>Send</Text>
                    </TouchableOpacity>
                  )}
                  {(po.status === 'sent' || po.status === 'partial') && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.successAction]}
                      onPress={() => handleReceivePO(po)}
                    >
                      <Ionicons name="checkmark" size={14} color={Colors.white} />
                      <Text style={styles.primaryActionText}>Receive</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
  },
  statsContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    ...Shadows.sm,
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
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: Spacing.md,
    marginBottom: Spacing.sm,
  },
  filterContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  filterTab: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
  },
  filterText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  filterTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    ...Shadows.sm,
  },
  createButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
  },
  emptyText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
  },
  poCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  poHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  poNumber: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  distributorName: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  poDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  poFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  poTotal: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  primaryAction: {
    backgroundColor: Colors.primary,
  },
  successAction: {
    backgroundColor: Colors.success,
  },
  primaryActionText: {
    color: Colors.white,
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
  },
});
