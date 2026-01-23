/**
 * DistributorList Component
 * Display and manage distributors/suppliers
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
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import api from '../../services/api';

interface Distributor {
  distributor_id: string;
  name: string;
  contact_name?: string;
  email?: string;
  phone?: string;
  account_number?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  website?: string;
  notes?: string;
  price_list_updated?: string;
  price_list_items_count: number;
  is_active: boolean;
  is_preferred: boolean;
  created_at: string;
}

interface Props {
  onSelectDistributor?: (distributor: Distributor) => void;
  onUploadPriceList?: (distributor: Distributor) => void;
}

interface DistributorFormData {
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  account_number: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  website: string;
  notes: string;
  is_preferred: boolean;
}

const emptyFormData: DistributorFormData = {
  name: '',
  contact_name: '',
  email: '',
  phone: '',
  account_number: '',
  address: '',
  city: '',
  state: '',
  zip_code: '',
  website: '',
  notes: '',
  is_preferred: false,
};

export default function DistributorList({ onSelectDistributor, onUploadPriceList }: Props) {
  const [distributors, setDistributors] = useState<Distributor[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPreferredOnly, setShowPreferredOnly] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingDistributor, setEditingDistributor] = useState<Distributor | null>(null);
  const [formData, setFormData] = useState<DistributorFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const params: Record<string, any> = {};
      if (searchQuery.trim()) {
        params.search = searchQuery;
      }
      if (showPreferredOnly) {
        params.is_preferred = true;
      }

      const response = await api.get('/api/v1/distributors', { params });
      setDistributors(response.data?.data || []);
    } catch (err) {
      console.error('Failed to load distributors:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [searchQuery, showPreferredOnly]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleOpenModal = (distributor?: Distributor) => {
    if (distributor) {
      setEditingDistributor(distributor);
      setFormData({
        name: distributor.name,
        contact_name: distributor.contact_name || '',
        email: distributor.email || '',
        phone: distributor.phone || '',
        account_number: distributor.account_number || '',
        address: distributor.address || '',
        city: distributor.city || '',
        state: distributor.state || '',
        zip_code: distributor.zip_code || '',
        website: distributor.website || '',
        notes: distributor.notes || '',
        is_preferred: distributor.is_preferred,
      });
    } else {
      setEditingDistributor(null);
      setFormData(emptyFormData);
    }
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setEditingDistributor(null);
    setFormData(emptyFormData);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      Alert.alert('Error', 'Distributor name is required');
      return;
    }

    setIsSaving(true);
    try {
      if (editingDistributor) {
        await api.put(`/api/v1/distributors/${editingDistributor.distributor_id}`, formData);
        Alert.alert('Success', 'Distributor updated');
      } else {
        await api.post('/api/v1/distributors', formData);
        Alert.alert('Success', 'Distributor created');
      }
      handleCloseModal();
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to save distributor');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (distributor: Distributor) => {
    Alert.alert(
      'Delete Distributor',
      `Are you sure you want to delete ${distributor.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/api/v1/distributors/${distributor.distributor_id}`);
              loadData();
              Alert.alert('Success', 'Distributor deleted');
            } catch (err) {
              Alert.alert('Error', 'Failed to delete distributor');
            }
          },
        },
      ]
    );
  };

  const handleTogglePreferred = async (distributor: Distributor) => {
    try {
      await api.put(`/api/v1/distributors/${distributor.distributor_id}`, {
        is_preferred: !distributor.is_preferred,
      });
      loadData();
    } catch (err) {
      Alert.alert('Error', 'Failed to update distributor');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Stats
  const stats = {
    total: distributors.length,
    preferred: distributors.filter((d) => d.is_preferred).length,
    withPriceList: distributors.filter((d) => d.price_list_items_count > 0).length,
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading distributors...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{stats.total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="star" size={16} color={Colors.warning} />
          <Text style={[styles.statValue, { marginLeft: 4 }]}>{stats.preferred}</Text>
          <Text style={styles.statLabel}>Preferred</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.primary }]}>{stats.withPriceList}</Text>
          <Text style={styles.statLabel}>With Prices</Text>
        </View>
      </View>

      {/* Search and Filters */}
      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <Ionicons name="search" size={20} color={Colors.gray400} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search distributors..."
            placeholderTextColor={Colors.gray400}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={loadData}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={Colors.gray400} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.filterButton, showPreferredOnly && styles.filterButtonActive]}
          onPress={() => setShowPreferredOnly(!showPreferredOnly)}
        >
          <Ionicons
            name="star"
            size={18}
            color={showPreferredOnly ? Colors.white : Colors.warning}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.addButton} onPress={() => handleOpenModal()}>
          <Ionicons name="add" size={22} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Distributor List */}
      <ScrollView
        style={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {distributors.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="business-outline" size={48} color={Colors.gray300} />
            <Text style={styles.emptyText}>No distributors found</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={() => handleOpenModal()}>
              <Text style={styles.emptyButtonText}>Add First Distributor</Text>
            </TouchableOpacity>
          </View>
        ) : (
          distributors.map((distributor) => (
            <TouchableOpacity
              key={distributor.distributor_id}
              style={styles.distributorCard}
              onPress={() => onSelectDistributor?.(distributor)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.nameContainer}>
                  <Text style={styles.distributorName}>{distributor.name}</Text>
                  {distributor.is_preferred && (
                    <Ionicons name="star" size={16} color={Colors.warning} style={styles.starIcon} />
                  )}
                </View>
                <TouchableOpacity
                  style={styles.moreButton}
                  onPress={() => handleOpenModal(distributor)}
                >
                  <Ionicons name="create-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>
              </View>

              {distributor.contact_name && (
                <Text style={styles.contactName}>{distributor.contact_name}</Text>
              )}

              <View style={styles.cardDetails}>
                {distributor.phone && (
                  <View style={styles.detailItem}>
                    <Ionicons name="call-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>{distributor.phone}</Text>
                  </View>
                )}
                {distributor.email && (
                  <View style={styles.detailItem}>
                    <Ionicons name="mail-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>{distributor.email}</Text>
                  </View>
                )}
                {distributor.account_number && (
                  <View style={styles.detailItem}>
                    <Ionicons name="card-outline" size={14} color={Colors.textSecondary} />
                    <Text style={styles.detailText}>Acct: {distributor.account_number}</Text>
                  </View>
                )}
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.priceListInfo}>
                  <Ionicons
                    name="list"
                    size={14}
                    color={distributor.price_list_items_count > 0 ? Colors.success : Colors.gray400}
                  />
                  <Text
                    style={[
                      styles.priceListText,
                      distributor.price_list_items_count > 0 && { color: Colors.success },
                    ]}
                  >
                    {distributor.price_list_items_count > 0
                      ? `${distributor.price_list_items_count} items`
                      : 'No price list'}
                  </Text>
                  {distributor.price_list_updated && (
                    <Text style={styles.updatedText}>
                      Updated {formatDate(distributor.price_list_updated)}
                    </Text>
                  )}
                </View>

                <View style={styles.cardActions}>
                  {onUploadPriceList && (
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => onUploadPriceList(distributor)}
                    >
                      <Ionicons name="cloud-upload-outline" size={16} color={Colors.primary} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleTogglePreferred(distributor)}
                  >
                    <Ionicons
                      name={distributor.is_preferred ? 'star' : 'star-outline'}
                      size={16}
                      color={Colors.warning}
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDelete(distributor)}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingDistributor ? 'Edit Distributor' : 'New Distributor'}
              </Text>
              <TouchableOpacity onPress={handleCloseModal}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Distributor name"
                placeholderTextColor={Colors.gray400}
              />

              <Text style={styles.inputLabel}>Contact Name</Text>
              <TextInput
                style={styles.input}
                value={formData.contact_name}
                onChangeText={(text) => setFormData({ ...formData, contact_name: text })}
                placeholder="Primary contact"
                placeholderTextColor={Colors.gray400}
              />

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>Email</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.email}
                    onChangeText={(text) => setFormData({ ...formData, email: text })}
                    placeholder="email@example.com"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>Phone</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.phone}
                    onChangeText={(text) => setFormData({ ...formData, phone: text })}
                    placeholder="(555) 123-4567"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Account Number</Text>
              <TextInput
                style={styles.input}
                value={formData.account_number}
                onChangeText={(text) => setFormData({ ...formData, account_number: text })}
                placeholder="Your account number with this distributor"
                placeholderTextColor={Colors.gray400}
              />

              <Text style={styles.inputLabel}>Address</Text>
              <TextInput
                style={styles.input}
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                placeholder="Street address"
                placeholderTextColor={Colors.gray400}
              />

              <View style={styles.row}>
                <View style={[styles.halfField, { flex: 2 }]}>
                  <Text style={styles.inputLabel}>City</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.city}
                    onChangeText={(text) => setFormData({ ...formData, city: text })}
                    placeholder="City"
                    placeholderTextColor={Colors.gray400}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>State</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.state}
                    onChangeText={(text) => setFormData({ ...formData, state: text })}
                    placeholder="ST"
                    placeholderTextColor={Colors.gray400}
                    maxLength={2}
                    autoCapitalize="characters"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>ZIP</Text>
                  <TextInput
                    style={styles.input}
                    value={formData.zip_code}
                    onChangeText={(text) => setFormData({ ...formData, zip_code: text })}
                    placeholder="12345"
                    placeholderTextColor={Colors.gray400}
                    keyboardType="number-pad"
                    maxLength={10}
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Website</Text>
              <TextInput
                style={styles.input}
                value={formData.website}
                onChangeText={(text) => setFormData({ ...formData, website: text })}
                placeholder="https://www.example.com"
                placeholderTextColor={Colors.gray400}
                keyboardType="url"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.notes}
                onChangeText={(text) => setFormData({ ...formData, notes: text })}
                placeholder="Additional notes..."
                placeholderTextColor={Colors.gray400}
                multiline
                numberOfLines={3}
              />

              <TouchableOpacity
                style={styles.preferredToggle}
                onPress={() => setFormData({ ...formData, is_preferred: !formData.is_preferred })}
              >
                <Ionicons
                  name={formData.is_preferred ? 'star' : 'star-outline'}
                  size={20}
                  color={Colors.warning}
                />
                <Text style={styles.preferredText}>Mark as Preferred Supplier</Text>
              </TouchableOpacity>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCloseModal}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editingDistributor ? 'Update' : 'Create'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  statsContainer: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
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
    marginLeft: Spacing.xs,
  },
  searchContainer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  searchInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    ...Shadows.sm,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  filterButton: {
    width: 44,
    height: 44,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  filterButtonActive: {
    backgroundColor: Colors.warning,
  },
  addButton: {
    width: 44,
    height: 44,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
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
    marginBottom: Spacing.md,
  },
  emptyButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  emptyButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  distributorCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  distributorName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  starIcon: {
    marginLeft: Spacing.xs,
  },
  moreButton: {
    padding: Spacing.xs,
  },
  contactName: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  cardDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.sm,
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
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  priceListInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  priceListText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray400,
  },
  updatedText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
  },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    padding: Spacing.xs,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  modalBody: {
    padding: Spacing.md,
    maxHeight: 500,
  },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
    marginBottom: 4,
    marginTop: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  halfField: {
    flex: 1,
  },
  preferredToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
  },
  preferredText: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  modalFooter: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  cancelButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  cancelButtonText: {
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  saveButton: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    backgroundColor: Colors.primary,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
  },
});
