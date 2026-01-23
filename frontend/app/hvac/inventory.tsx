/**
 * HVAC Inventory Management
 * Track parts and materials inventory with reorder alerts
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../constants/theme';
import { hvacApi, InventoryItem } from '../../services/hvacApi';

type FilterMode = 'all' | 'low_stock';
type AdjustmentType = 'receive' | 'use' | 'return' | 'adjust';

const ADJUSTMENT_TYPES: { value: AdjustmentType; label: string; icon: string; color: string }[] = [
  { value: 'receive', label: 'Receive', icon: 'add-circle-outline', color: Colors.success },
  { value: 'use', label: 'Use', icon: 'remove-circle-outline', color: Colors.error },
  { value: 'return', label: 'Return', icon: 'arrow-undo-outline', color: Colors.warning },
  { value: 'adjust', label: 'Adjust', icon: 'create-outline', color: Colors.primary },
];

export default function InventoryManagement() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [filteredInventory, setFilteredInventory] = useState<InventoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [stats, setStats] = useState({
    totalItems: 0,
    lowStockItems: 0,
    totalValue: 0,
  });

  // Adjustment modal state
  const [adjustModalVisible, setAdjustModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [adjustmentType, setAdjustmentType] = useState<AdjustmentType>('receive');
  const [adjustmentQuantity, setAdjustmentQuantity] = useState('');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const fetchInventory = useCallback(async () => {
    try {
      const filters = filterMode === 'low_stock' ? { low_stock: true } : undefined;
      const res = await hvacApi.getInventory(filters);
      if (res.success && res.data) {
        setInventory(res.data.items);
        setStats({
          totalItems: res.data.count,
          lowStockItems: res.data.items.filter(
            (item) => item.quantity_on_hand <= item.reorder_point
          ).length,
          totalValue: res.data.total_value,
        });
      }
    } catch (error) {
      console.error('Failed to fetch inventory:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filterMode]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  useEffect(() => {
    let filtered = inventory;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.sku.toLowerCase().includes(query) ||
          item.category.toLowerCase().includes(query)
      );
    }

    setFilteredInventory(filtered);
  }, [inventory, searchQuery]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchInventory();
  }, [fetchInventory]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const openAdjustModal = (item: InventoryItem) => {
    setSelectedItem(item);
    setAdjustmentType('receive');
    setAdjustmentQuantity('');
    setAdjustmentNotes('');
    setAdjustModalVisible(true);
  };

  const handleAdjustment = async () => {
    if (!selectedItem) return;

    const quantity = parseInt(adjustmentQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      Alert.alert('Invalid Quantity', 'Please enter a valid quantity');
      return;
    }

    setAdjusting(true);
    try {
      const res = await hvacApi.adjustInventory(selectedItem.item_id, {
        adjustment_type: adjustmentType,
        quantity: quantity,
        notes: adjustmentNotes || undefined,
      });

      if (res.success && res.data) {
        Alert.alert(
          'Inventory Updated',
          `Quantity changed from ${res.data.previous_quantity} to ${res.data.new_quantity}${
            res.data.needs_reorder ? '\n\nThis item needs to be reordered!' : ''
          }`
        );
        setAdjustModalVisible(false);
        fetchInventory();
      } else {
        Alert.alert('Error', res.error || 'Failed to adjust inventory');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to adjust inventory');
    } finally {
      setAdjusting(false);
    }
  };

  const renderInventoryItem = ({ item }: { item: InventoryItem }) => {
    const isLowStock = item.quantity_on_hand <= item.reorder_point;
    const isOutOfStock = item.quantity_on_hand === 0;

    return (
      <TouchableOpacity
        style={[styles.inventoryCard, isLowStock && styles.lowStockCard]}
        onPress={() => openAdjustModal(item)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.itemInfo}>
            <Text style={styles.itemName}>{item.name}</Text>
            <Text style={styles.itemSku}>SKU: {item.sku}</Text>
          </View>
          {isOutOfStock ? (
            <View style={[styles.stockBadge, styles.outOfStockBadge]}>
              <Text style={styles.outOfStockText}>Out of Stock</Text>
            </View>
          ) : isLowStock ? (
            <View style={[styles.stockBadge, styles.lowStockBadge]}>
              <Ionicons name="warning" size={12} color={Colors.warning} />
              <Text style={styles.lowStockText}>Low Stock</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.quantitySection}>
            <Text style={styles.quantityLabel}>On Hand</Text>
            <Text
              style={[
                styles.quantityValue,
                isOutOfStock && styles.outOfStockValue,
                isLowStock && !isOutOfStock && styles.lowStockValue,
              ]}
            >
              {item.quantity_on_hand}
            </Text>
            <Text style={styles.unitText}>{item.unit}</Text>
          </View>

          <View style={styles.reorderSection}>
            <Text style={styles.reorderLabel}>Reorder Point</Text>
            <Text style={styles.reorderValue}>{item.reorder_point}</Text>
          </View>

          <View style={styles.priceSection}>
            <Text style={styles.priceLabel}>Cost</Text>
            <Text style={styles.priceValue}>{formatCurrency(item.cost)}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.categoryTag}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
          {item.location && (
            <View style={styles.locationTag}>
              <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.locationText}>{item.location}</Text>
            </View>
          )}
          <TouchableOpacity style={styles.adjustButton}>
            <Ionicons name="swap-horizontal" size={16} color={Colors.primary} />
            <Text style={styles.adjustButtonText}>Adjust</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderAdjustModal = () => {
    if (!selectedItem) return null;

    return (
      <Modal
        visible={adjustModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAdjustModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAdjustModalVisible(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Adjust Inventory</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.itemSummary}>
              <Text style={styles.itemSummaryName}>{selectedItem.name}</Text>
              <Text style={styles.itemSummarySku}>SKU: {selectedItem.sku}</Text>
              <Text style={styles.currentQuantity}>
                Current Quantity: {selectedItem.quantity_on_hand} {selectedItem.unit}
              </Text>
            </View>

            <Text style={styles.sectionLabel}>Adjustment Type</Text>
            <View style={styles.typeGrid}>
              {ADJUSTMENT_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.typeButton,
                    adjustmentType === type.value && {
                      borderColor: type.color,
                      backgroundColor: `${type.color}10`,
                    },
                  ]}
                  onPress={() => setAdjustmentType(type.value)}
                >
                  <Ionicons
                    name={type.icon as any}
                    size={24}
                    color={adjustmentType === type.value ? type.color : Colors.gray500}
                  />
                  <Text
                    style={[
                      styles.typeButtonText,
                      adjustmentType === type.value && { color: type.color },
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>
              Quantity
            </Text>
            <TextInput
              style={styles.quantityInput}
              keyboardType="numeric"
              placeholder="Enter quantity"
              value={adjustmentQuantity}
              onChangeText={setAdjustmentQuantity}
            />

            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>
              Notes (Optional)
            </Text>
            <TextInput
              style={styles.notesInput}
              multiline
              numberOfLines={3}
              placeholder="Add notes about this adjustment..."
              value={adjustmentNotes}
              onChangeText={setAdjustmentNotes}
              textAlignVertical="top"
            />

            {adjustmentQuantity && !isNaN(parseInt(adjustmentQuantity)) && (
              <View style={styles.previewCard}>
                <Text style={styles.previewTitle}>Preview</Text>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Current:</Text>
                  <Text style={styles.previewValue}>
                    {selectedItem.quantity_on_hand} {selectedItem.unit}
                  </Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>
                    {adjustmentType === 'use' ? 'Subtract:' : 'Add:'}
                  </Text>
                  <Text
                    style={[
                      styles.previewValue,
                      {
                        color:
                          adjustmentType === 'use' ? Colors.error : Colors.success,
                      },
                    ]}
                  >
                    {adjustmentType === 'use' ? '-' : '+'}
                    {adjustmentQuantity} {selectedItem.unit}
                  </Text>
                </View>
                <View style={[styles.previewRow, styles.previewTotal]}>
                  <Text style={styles.previewTotalLabel}>New Total:</Text>
                  <Text style={styles.previewTotalValue}>
                    {adjustmentType === 'use' || adjustmentType === 'return'
                      ? selectedItem.quantity_on_hand - parseInt(adjustmentQuantity)
                      : selectedItem.quantity_on_hand + parseInt(adjustmentQuantity)}{' '}
                    {selectedItem.unit}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[
                styles.saveButton,
                (!adjustmentQuantity || adjusting) && styles.saveButtonDisabled,
              ]}
              onPress={handleAdjustment}
              disabled={!adjustmentQuantity || adjusting}
            >
              {adjusting ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="checkmark" size={20} color={Colors.white} />
                  <Text style={styles.saveButtonText}>Save Adjustment</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading inventory...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalItems}</Text>
          <Text style={styles.statLabel}>Items</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, stats.lowStockItems > 0 && { color: Colors.error }]}>
            {stats.lowStockItems}
          </Text>
          <Text style={styles.statLabel}>Low Stock</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statValue, { color: Colors.success }]}>
            {formatCurrency(stats.totalValue)}
          </Text>
          <Text style={styles.statLabel}>Total Value</Text>
        </View>
      </View>

      {/* Search and Filter */}
      <View style={styles.searchSection}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={20} color={Colors.gray400} />
          <TextInput
            style={styles.searchTextInput}
            placeholder="Search inventory..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor={Colors.gray400}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.gray400} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <TouchableOpacity
          style={[styles.filterTab, filterMode === 'all' && styles.filterTabActive]}
          onPress={() => setFilterMode('all')}
        >
          <Text
            style={[
              styles.filterTabText,
              filterMode === 'all' && styles.filterTabTextActive,
            ]}
          >
            All Items
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filterMode === 'low_stock' && styles.filterTabActive]}
          onPress={() => setFilterMode('low_stock')}
        >
          <Ionicons
            name="warning"
            size={14}
            color={filterMode === 'low_stock' ? Colors.white : Colors.warning}
            style={{ marginRight: 4 }}
          />
          <Text
            style={[
              styles.filterTabText,
              filterMode === 'low_stock' && styles.filterTabTextActive,
            ]}
          >
            Low Stock ({stats.lowStockItems})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Inventory List */}
      <FlatList
        data={filteredInventory}
        keyExtractor={(item) => item.item_id}
        renderItem={renderInventoryItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={Colors.gray400} />
            <Text style={styles.emptyText}>No inventory items</Text>
            <Text style={styles.emptySubtext}>
              {filterMode === 'low_stock'
                ? 'No items need restocking'
                : 'Add inventory items to track stock'}
            </Text>
          </View>
        }
      />

      {renderAdjustModal()}
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
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: Spacing.md,
    color: Colors.textSecondary,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statItem: {
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
  searchSection: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
  },
  searchInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  searchTextInput: {
    flex: 1,
    marginLeft: Spacing.sm,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  filterTabs: {
    flexDirection: 'row',
    padding: Spacing.md,
    paddingTop: 0,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  filterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.full,
  },
  filterTabActive: {
    backgroundColor: Colors.primary,
  },
  filterTabText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray600,
  },
  filterTabTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  listContent: {
    padding: Spacing.md,
  },
  inventoryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  lowStockCard: {
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  cardHeader: {
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
  itemSku: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  stockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  lowStockBadge: {
    backgroundColor: '#FFF3E0',
  },
  lowStockText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.warning,
    marginLeft: 2,
    fontWeight: Typography.fontWeight.medium,
  },
  outOfStockBadge: {
    backgroundColor: '#FFEBEE',
  },
  outOfStockText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.error,
    fontWeight: Typography.fontWeight.medium,
  },
  cardBody: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  quantitySection: {
    flex: 1,
    alignItems: 'center',
  },
  quantityLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  quantityValue: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  lowStockValue: {
    color: Colors.warning,
  },
  outOfStockValue: {
    color: Colors.error,
  },
  unitText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  reorderSection: {
    flex: 1,
    alignItems: 'center',
  },
  reorderLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  reorderValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  priceSection: {
    flex: 1,
    alignItems: 'center',
  },
  priceLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  priceValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  categoryTag: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  categoryText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  locationTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  locationText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginLeft: 2,
  },
  adjustButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  adjustButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    marginLeft: Spacing.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
  },
  emptyText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginTop: Spacing.md,
  },
  emptySubtext: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  modalContent: {
    flex: 1,
    padding: Spacing.md,
  },
  itemSummary: {
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  itemSummaryName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  itemSummarySku: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  currentQuantity: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    marginTop: Spacing.sm,
  },
  sectionLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  typeButton: {
    flex: 1,
    minWidth: '45%',
    alignItems: 'center',
    padding: Spacing.md,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray500,
    marginTop: Spacing.xs,
  },
  quantityInput: {
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    textAlign: 'center',
  },
  notesInput: {
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    minHeight: 80,
  },
  previewCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
  },
  previewTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.primary,
    marginBottom: Spacing.sm,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  previewLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  previewValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  previewTotal: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.primary + '30',
  },
  previewTotalLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  previewTotalValue: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  modalFooter: {
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
    marginLeft: Spacing.sm,
  },
});
