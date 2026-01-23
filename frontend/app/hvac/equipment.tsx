/**
 * HVAC Equipment Catalog
 * Browse and manage equipment inventory with Good/Better/Best tiers
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
import { hvacApi, Equipment } from '../../services/hvacApi';

type Category = 'all' | 'air_conditioner' | 'furnace' | 'heat_pump' | 'mini_split' | 'air_handler' | 'thermostat';
type Tier = 'all' | 'good' | 'better' | 'best';

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'all', label: 'All', icon: 'grid-outline' },
  { value: 'air_conditioner', label: 'AC', icon: 'snow-outline' },
  { value: 'furnace', label: 'Furnace', icon: 'flame-outline' },
  { value: 'heat_pump', label: 'Heat Pump', icon: 'repeat-outline' },
  { value: 'mini_split', label: 'Mini Split', icon: 'apps-outline' },
  { value: 'air_handler', label: 'Air Handler', icon: 'git-branch-outline' },
  { value: 'thermostat', label: 'T-stat', icon: 'thermometer-outline' },
];

const TIERS: { value: Tier; label: string; color: string }[] = [
  { value: 'all', label: 'All Tiers', color: Colors.gray500 },
  { value: 'good', label: 'Good', color: '#4CAF50' },
  { value: 'better', label: 'Better', color: '#2196F3' },
  { value: 'best', label: 'Best', color: '#9C27B0' },
];

export default function EquipmentCatalog() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [filteredEquipment, setFilteredEquipment] = useState<Equipment[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [selectedTier, setSelectedTier] = useState<Tier>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState<Equipment | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  const fetchEquipment = useCallback(async () => {
    try {
      const filters: { category?: string; tier?: string } = {};
      if (selectedCategory !== 'all') filters.category = selectedCategory;
      if (selectedTier !== 'all') filters.tier = selectedTier;

      const res = await hvacApi.getEquipment(filters);
      if (res.success && res.data) {
        setEquipment(res.data.equipment);
      }
    } catch (error) {
      console.error('Failed to fetch equipment:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedCategory, selectedTier]);

  useEffect(() => {
    fetchEquipment();
  }, [fetchEquipment]);

  useEffect(() => {
    let filtered = equipment;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (e) =>
          e.name.toLowerCase().includes(query) ||
          e.brand.toLowerCase().includes(query) ||
          e.model.toLowerCase().includes(query)
      );
    }

    setFilteredEquipment(filtered);
  }, [equipment, searchQuery]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchEquipment();
  }, [fetchEquipment]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'good':
        return '#4CAF50';
      case 'better':
        return '#2196F3';
      case 'best':
        return '#9C27B0';
      default:
        return Colors.gray500;
    }
  };

  const getCategoryIcon = (category: string) => {
    const cat = CATEGORIES.find((c) => c.value === category);
    return cat?.icon || 'cube-outline';
  };

  const openDetailModal = (item: Equipment) => {
    setSelectedEquipment(item);
    setDetailModalVisible(true);
  };

  const renderEquipmentItem = ({ item }: { item: Equipment }) => (
    <TouchableOpacity style={styles.equipmentCard} onPress={() => openDetailModal(item)}>
      <View style={styles.cardHeader}>
        <View style={[styles.categoryIcon, { backgroundColor: `${getTierColor(item.tier)}15` }]}>
          <Ionicons
            name={getCategoryIcon(item.category) as any}
            size={24}
            color={getTierColor(item.tier)}
          />
        </View>
        <View style={[styles.tierBadge, { backgroundColor: getTierColor(item.tier) }]}>
          <Text style={styles.tierBadgeText}>{item.tier.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.equipmentName}>{item.name}</Text>
      <Text style={styles.equipmentBrand}>
        {item.brand} - {item.model}
      </Text>

      <View style={styles.specsRow}>
        {item.capacity_tons && (
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>Capacity</Text>
            <Text style={styles.specValue}>{item.capacity_tons} ton</Text>
          </View>
        )}
        {item.seer && (
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>SEER</Text>
            <Text style={styles.specValue}>{item.seer}</Text>
          </View>
        )}
        {item.afue && (
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>AFUE</Text>
            <Text style={styles.specValue}>{item.afue}%</Text>
          </View>
        )}
        {item.hspf && (
          <View style={styles.specItem}>
            <Text style={styles.specLabel}>HSPF</Text>
            <Text style={styles.specValue}>{item.hspf}</Text>
          </View>
        )}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.equipmentPrice}>{formatCurrency(item.cost)}</Text>
        <Text style={styles.laborHours}>{item.labor_hours}h labor</Text>
      </View>
    </TouchableOpacity>
  );

  const renderDetailModal = () => {
    if (!selectedEquipment) return null;

    return (
      <Modal
        visible={detailModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setDetailModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setDetailModalVisible(false)}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Equipment Details</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.detailHeader}>
              <View
                style={[
                  styles.detailCategoryIcon,
                  { backgroundColor: `${getTierColor(selectedEquipment.tier)}15` },
                ]}
              >
                <Ionicons
                  name={getCategoryIcon(selectedEquipment.category) as any}
                  size={40}
                  color={getTierColor(selectedEquipment.tier)}
                />
              </View>
              <View
                style={[
                  styles.detailTierBadge,
                  { backgroundColor: getTierColor(selectedEquipment.tier) },
                ]}
              >
                <Text style={styles.detailTierText}>
                  {selectedEquipment.tier.toUpperCase()}
                </Text>
              </View>
            </View>

            <Text style={styles.detailName}>{selectedEquipment.name}</Text>
            <Text style={styles.detailBrand}>
              {selectedEquipment.brand} - {selectedEquipment.model}
            </Text>

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>Specifications</Text>
              <View style={styles.detailGrid}>
                {selectedEquipment.capacity_tons && (
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailGridLabel}>Capacity</Text>
                    <Text style={styles.detailGridValue}>
                      {selectedEquipment.capacity_tons} tons
                    </Text>
                  </View>
                )}
                {selectedEquipment.capacity_btu && (
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailGridLabel}>BTU/h</Text>
                    <Text style={styles.detailGridValue}>
                      {selectedEquipment.capacity_btu.toLocaleString()}
                    </Text>
                  </View>
                )}
                {selectedEquipment.seer && (
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailGridLabel}>SEER Rating</Text>
                    <Text style={styles.detailGridValue}>{selectedEquipment.seer}</Text>
                  </View>
                )}
                {selectedEquipment.afue && (
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailGridLabel}>AFUE</Text>
                    <Text style={styles.detailGridValue}>{selectedEquipment.afue}%</Text>
                  </View>
                )}
                {selectedEquipment.hspf && (
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailGridLabel}>HSPF</Text>
                    <Text style={styles.detailGridValue}>{selectedEquipment.hspf}</Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>Pricing & Labor</Text>
              <View style={styles.detailGrid}>
                <View style={styles.detailGridItem}>
                  <Text style={styles.detailGridLabel}>Equipment Cost</Text>
                  <Text style={styles.detailGridValue}>
                    {formatCurrency(selectedEquipment.cost)}
                  </Text>
                </View>
                <View style={styles.detailGridItem}>
                  <Text style={styles.detailGridLabel}>Labor Hours</Text>
                  <Text style={styles.detailGridValue}>
                    {selectedEquipment.labor_hours} hours
                  </Text>
                </View>
                <View style={styles.detailGridItem}>
                  <Text style={styles.detailGridLabel}>Warranty</Text>
                  <Text style={styles.detailGridValue}>
                    {selectedEquipment.warranty_years} years
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.detailSectionTitle}>Category</Text>
              <Text style={styles.detailCategoryText}>
                {selectedEquipment.category.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Text>
            </View>

            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: selectedEquipment.is_active
                      ? Colors.success + '20'
                      : Colors.error + '20',
                  },
                ]}
              >
                <Ionicons
                  name={selectedEquipment.is_active ? 'checkmark-circle' : 'close-circle'}
                  size={16}
                  color={selectedEquipment.is_active ? Colors.success : Colors.error}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: selectedEquipment.is_active ? Colors.success : Colors.error },
                  ]}
                >
                  {selectedEquipment.is_active ? 'Active' : 'Inactive'}
                </Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading equipment...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={20} color={Colors.gray400} />
          <TextInput
            style={styles.searchTextInput}
            placeholder="Search equipment..."
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

      {/* Category Filter */}
      <View style={styles.filterSection}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {CATEGORIES.map((category) => (
            <TouchableOpacity
              key={category.value}
              style={[
                styles.categoryChip,
                selectedCategory === category.value && styles.categoryChipActive,
              ]}
              onPress={() => setSelectedCategory(category.value)}
            >
              <Ionicons
                name={category.icon as any}
                size={16}
                color={selectedCategory === category.value ? Colors.white : Colors.gray600}
              />
              <Text
                style={[
                  styles.categoryChipText,
                  selectedCategory === category.value && styles.categoryChipTextActive,
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Tier Filter */}
      <View style={styles.tierFilterRow}>
        {TIERS.map((tier) => (
          <TouchableOpacity
            key={tier.value}
            style={[
              styles.tierChip,
              selectedTier === tier.value && { backgroundColor: tier.color },
            ]}
            onPress={() => setSelectedTier(tier.value)}
          >
            <Text
              style={[
                styles.tierChipText,
                selectedTier === tier.value && styles.tierChipTextActive,
              ]}
            >
              {tier.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Equipment List */}
      <FlatList
        data={filteredEquipment}
        keyExtractor={(item) => item.equipment_id}
        renderItem={renderEquipmentItem}
        numColumns={2}
        columnWrapperStyle={styles.listRow}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={48} color={Colors.gray400} />
            <Text style={styles.emptyText}>No equipment found</Text>
            <Text style={styles.emptySubtext}>
              Try adjusting your filters or search query
            </Text>
          </View>
        }
      />

      {renderDetailModal()}
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
  searchContainer: {
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
  filterSection: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
  },
  categoryChipActive: {
    backgroundColor: Colors.primary,
  },
  categoryChipText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray600,
    marginLeft: Spacing.xs,
  },
  categoryChipTextActive: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  tierFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  tierChip: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
  },
  tierChipText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.gray600,
  },
  tierChipTextActive: {
    color: Colors.white,
  },
  listContent: {
    padding: Spacing.md,
  },
  listRow: {
    justifyContent: 'space-between',
  },
  equipmentCard: {
    width: '48%',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.sm,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  tierBadgeText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  equipmentName: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: 2,
  },
  equipmentBrand: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  specsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  specItem: {
    marginRight: Spacing.md,
    marginBottom: Spacing.xs,
  },
  specLabel: {
    fontSize: 10,
    color: Colors.gray400,
    textTransform: 'uppercase',
  },
  specValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  equipmentPrice: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  laborHours: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
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
    padding: Spacing.lg,
  },
  detailHeader: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  detailCategoryIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  detailTierBadge: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  detailTierText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  detailName: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xs,
  },
  detailBrand: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  detailSection: {
    marginBottom: Spacing.xl,
  },
  detailSectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.md,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
  },
  detailGridItem: {
    width: '50%',
    padding: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  detailGridLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  detailGridValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  detailCategoryText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  statusRow: {
    marginTop: Spacing.lg,
    alignItems: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    marginLeft: Spacing.xs,
  },
});
