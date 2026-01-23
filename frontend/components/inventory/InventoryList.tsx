/**
 * InventoryList Component
 * Display and manage inventory items with filtering and search
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
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import api from '../../services/api';

interface InventoryItem {
  item_id: string;
  name: string;
  description?: string;
  part_number?: string;
  category: string;
  unit: string;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  reorder_point: number;
  reorder_quantity: number;
  cost_per_unit: number;
  total_value: number;
  location: string;
  is_low_stock: boolean;
}

interface InventoryAlert {
  item_id: string;
  name: string;
  part_number?: string;
  category: string;
  location: string;
  quantity_on_hand: number;
  reorder_point: number;
  quantity_to_order: number;
  is_out_of_stock: boolean;
}

interface Props {
  onSelectItem?: (item: InventoryItem) => void;
  onAddItem?: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  parts: 'Parts',
  materials: 'Materials',
  refrigerant: 'Refrigerant',
  equipment: 'Equipment',
  tools: 'Tools',
  consumables: 'Consumables',
  other: 'Other',
};

const CATEGORY_COLORS: Record<string, string> = {
  parts: Colors.info,
  materials: Colors.warning,
  refrigerant: Colors.primary,
  equipment: Colors.success,
  tools: Colors.gray500,
  consumables: Colors.gray400,
  other: Colors.gray300,
};

export default function InventoryList({ onSelectItem, onAddItem }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<{ low_stock: InventoryAlert[]; out_of_stock: InventoryAlert[] }>({
    low_stock: [],
    out_of_stock: [],
  });
  const [summary, setSummary] = useState<{
    total_items: number;
    total_value: number;
    low_stock_count: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState('');
  const [adjustReason, setAdjustReason] = useState('');

  const loadData = useCallback(async () => {
    try {
      const params: Record<string, any> = {};
      if (selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      if (showLowStockOnly) {
        params.low_stock = true;
      }

      const [itemsRes, alertsRes, summaryRes] = await Promise.all([
        api.get('/api/v1/inventory', { params }),
        api.get('/api/v1/inventory/alerts'),
        api.get('/api/v1/inventory/summary'),
      ]);

      setItems(itemsRes.data?.data || []);
      setAlerts(alertsRes.data || { low_stock: [], out_of_stock: [] });
      setSummary(summaryRes.data || null);
    } catch (err) {
      console.error('Failed to load inventory:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, searchQuery, showLowStockOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAdjustStock = async () => {
    if (!selectedItem || !adjustQuantity || !adjustReason) return;

    try {
      await api.post(`/api/v1/inventory/${selectedItem.item_id}/adjust`, {
        quantity: parseFloat(adjustQuantity),
        reason: adjustReason,
      });

      setShowAdjustModal(false);
      setSelectedItem(null);
      setAdjustQuantity('');
      setAdjustReason('');
      loadData();
      Alert.alert('Success', 'Stock adjusted successfully');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.detail?.message || 'Failed to adjust stock');
    }
  };

  const openAdjustModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setShowAdjustModal(true);
  };

  const formatCurrency = (value: number) => {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary Cards */}
      {summary && (
        <View style={styles.summaryContainer}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.total_items}</Text>
            <Text style={styles.summaryLabel}>Items</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{formatCurrency(summary.total_value)}</Text>
            <Text style={styles.summaryLabel}>Total Value</Text>
          </View>
          <View style={[styles.summaryCard, summary.low_stock_count > 0 && styles.alertCard]}>
            <Text style={[styles.summaryValue, summary.low_stock_count > 0 && { color: Colors.warning }]}>
              {summary.low_stock_count}
            </Text>
            <Text style={styles.summaryLabel}>Low Stock</Text>
          </View>
        </View>
      )}

      {/* Alerts Banner */}
      {(alerts.low_stock.length > 0 || alerts.out_of_stock.length > 0) && (
        <TouchableOpacity
          style={styles.alertBanner}
          onPress={() => setShowLowStockOnly(!showLowStockOnly)}
        >
          <Ionicons name="warning" size={20} color={Colors.warning} />
          <Text style={styles.alertText}>
            {alerts.out_of_stock.length > 0 && `${alerts.out_of_stock.length} out of stock`}
            {alerts.out_of_stock.length > 0 && alerts.low_stock.length > 0 && ' | '}
            {alerts.low_stock.length > 0 && `${alerts.low_stock.length} low stock`}
          </Text>
          <Ionicons
            name={showLowStockOnly ? 'eye-off' : 'eye'}
            size={18}
            color={Colors.warning}
          />
        </TouchableOpacity>
      )}

      {/* Search and Filters */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={18} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchText}
            placeholder="Search items..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={Colors.textSecondary}
          />
          {searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
        {onAddItem && (
          <TouchableOpacity style={styles.addButton} onPress={onAddItem}>
            <Ionicons name="add" size={24} color={Colors.white} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category Filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterChip, selectedCategory === 'all' && styles.filterChipActive]}
          onPress={() => setSelectedCategory('all')}
        >
          <Text style={[styles.filterText, selectedCategory === 'all' && styles.filterTextActive]}>
            All
          </Text>
        </TouchableOpacity>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, selectedCategory === key && styles.filterChipActive]}
            onPress={() => setSelectedCategory(key)}
          >
            <Text style={[styles.filterText, selectedCategory === key && styles.filterTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Items List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={Colors.gray300} />
            <Text style={styles.emptyText}>No inventory items found</Text>
          </View>
        ) : (
          items.map((item) => (
            <TouchableOpacity
              key={item.item_id}
              style={[styles.itemCard, item.is_low_stock && styles.lowStockCard]}
              onPress={() => onSelectItem?.(item)}
            >
              <View style={styles.itemHeader}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.part_number && (
                    <Text style={styles.partNumber}>#{item.part_number}</Text>
                  )}
                </View>
                <View
                  style={[
                    styles.categoryBadge,
                    { backgroundColor: (CATEGORY_COLORS[item.category] || Colors.gray400) + '20' },
                  ]}
                >
                  <Text
                    style={[
                      styles.categoryText,
                      { color: CATEGORY_COLORS[item.category] || Colors.gray400 },
                    ]}
                  >
                    {CATEGORY_LABELS[item.category] || item.category}
                  </Text>
                </View>
              </View>

              <View style={styles.itemDetails}>
                <View style={styles.detailColumn}>
                  <Text style={styles.detailLabel}>On Hand</Text>
                  <Text style={[styles.detailValue, item.is_low_stock && styles.lowStockValue]}>
                    {item.quantity_on_hand} {item.unit}
                  </Text>
                </View>
                <View style={styles.detailColumn}>
                  <Text style={styles.detailLabel}>Reorder At</Text>
                  <Text style={styles.detailValue}>{item.reorder_point}</Text>
                </View>
                <View style={styles.detailColumn}>
                  <Text style={styles.detailLabel}>Unit Cost</Text>
                  <Text style={styles.detailValue}>{formatCurrency(item.cost_per_unit)}</Text>
                </View>
                <View style={styles.detailColumn}>
                  <Text style={styles.detailLabel}>Value</Text>
                  <Text style={styles.detailValue}>{formatCurrency(item.total_value)}</Text>
                </View>
              </View>

              <View style={styles.itemFooter}>
                <View style={styles.locationBadge}>
                  <Ionicons name="location" size={12} color={Colors.textSecondary} />
                  <Text style={styles.locationText}>{item.location}</Text>
                </View>
                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={() => openAdjustModal(item)}
                >
                  <Ionicons name="swap-horizontal" size={16} color={Colors.primary} />
                  <Text style={styles.adjustButtonText}>Adjust</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Adjust Stock Modal */}
      <Modal visible={showAdjustModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adjust Stock</Text>
              <TouchableOpacity onPress={() => setShowAdjustModal(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {selectedItem && (
              <>
                <Text style={styles.modalItemName}>{selectedItem.name}</Text>
                <Text style={styles.modalItemStock}>
                  Current: {selectedItem.quantity_on_hand} {selectedItem.unit}
                </Text>

                <Text style={styles.inputLabel}>Quantity Change</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., -2 to remove, +5 to add"
                  value={adjustQuantity}
                  onChangeText={setAdjustQuantity}
                  keyboardType="numeric"
                  placeholderTextColor={Colors.textSecondary}
                />

                <Text style={styles.inputLabel}>Reason</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Reason for adjustment"
                  value={adjustReason}
                  onChangeText={setAdjustReason}
                  multiline
                  numberOfLines={2}
                  placeholderTextColor={Colors.textSecondary}
                />

                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    (!adjustQuantity || !adjustReason) && styles.modalButtonDisabled,
                  ]}
                  onPress={handleAdjustStock}
                  disabled={!adjustQuantity || !adjustReason}
                >
                  <Text style={styles.modalButtonText}>Adjust Stock</Text>
                </TouchableOpacity>
              </>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: Spacing.sm,
    color: Colors.textSecondary,
  },
  summaryContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    ...Shadows.sm,
  },
  alertCard: {
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  summaryValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.warning + '15',
    marginHorizontal: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  alertText: {
    flex: 1,
    color: Colors.warning,
    fontWeight: Typography.fontWeight.medium,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    ...Shadows.sm,
  },
  searchText: {
    flex: 1,
    height: 44,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  addButton: {
    width: 44,
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    ...Shadows.sm,
  },
  filterContainer: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginRight: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
  },
  filterChipActive: {
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
  itemCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  lowStockCard: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.warning,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  partNumber: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  categoryBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  categoryText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  itemDetails: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  detailColumn: {
    flex: 1,
  },
  detailLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  lowStockValue: {
    color: Colors.warning,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.primary + '15',
    borderRadius: BorderRadius.sm,
  },
  adjustButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  modalItemName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: 4,
  },
  modalItemStock: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  input: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  modalButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
  },
  modalButtonDisabled: {
    backgroundColor: Colors.gray300,
  },
  modalButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
});
