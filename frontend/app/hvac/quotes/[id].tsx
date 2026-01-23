/**
 * HVAC Quote Detail
 * View quote details, edit line items, send to customer, and manage status
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../../constants/theme';
import { hvacApi, Quote, QuoteLineItem } from '../../../services/hvacApi';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: '#E3F2FD', text: '#1976D2' },
  sent: { bg: '#FFF3E0', text: '#F57C00' },
  viewed: { bg: '#F3E5F5', text: '#7B1FA2' },
  accepted: { bg: '#E8F5E9', text: '#388E3C' },
  rejected: { bg: '#FFEBEE', text: '#D32F2F' },
  expired: { bg: '#ECEFF1', text: '#546E7A' },
};

const ITEM_TYPES = ['equipment', 'labor', 'materials', 'other'];

interface EditingLineItem {
  index: number;
  item_type: string;
  description: string;
  quantity: string;
  unit_price: string;
}

export default function QuoteDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [sendingQuote, setSendingQuote] = useState(false);
  const [saving, setSaving] = useState(false);

  // Line item editing state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<EditingLineItem | null>(null);
  const [lineItems, setLineItems] = useState<QuoteLineItem[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchQuote = useCallback(async () => {
    if (!id) return;

    try {
      const res = await hvacApi.getQuote(id);
      if (res.success && res.data) {
        setQuote(res.data.quote);
        setLineItems(res.data.quote.line_items || []);
      }
    } catch (error) {
      console.error('Failed to fetch quote:', error);
      Alert.alert('Error', 'Failed to load quote details');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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

  // Calculate totals from line items
  const calculateTotals = useCallback(() => {
    const equipment_total = lineItems
      .filter((i) => i.item_type === 'equipment')
      .reduce((sum, i) => sum + i.total, 0);
    const labor_total = lineItems
      .filter((i) => i.item_type === 'labor')
      .reduce((sum, i) => sum + i.total, 0);
    const materials_total = lineItems
      .filter((i) => i.item_type === 'materials' || i.item_type === 'other')
      .reduce((sum, i) => sum + i.total, 0);
    const subtotal = equipment_total + labor_total + materials_total;
    const tax_rate = quote?.tax_rate || 0.0825;
    const taxable = equipment_total + materials_total;
    const tax = taxable * tax_rate;
    const total = subtotal + tax;
    const margin_percent = quote?.margin_percent || 35;
    const cost_total = subtotal / (1 + margin_percent / 100);
    const profit = subtotal - cost_total;

    return {
      equipment_total,
      labor_total,
      materials_total,
      subtotal,
      tax,
      total,
      cost_total,
      profit,
    };
  }, [lineItems, quote]);

  // Open edit modal for a line item
  const handleEditLineItem = (index: number) => {
    if (quote?.status !== 'draft') {
      Alert.alert('Cannot Edit', 'Only draft quotes can be edited');
      return;
    }
    const item = lineItems[index];
    setEditingItem({
      index,
      item_type: item.item_type,
      description: item.description,
      quantity: item.quantity.toString(),
      unit_price: item.unit_price.toString(),
    });
    setEditModalVisible(true);
  };

  // Add new line item
  const handleAddLineItem = () => {
    if (quote?.status !== 'draft') {
      Alert.alert('Cannot Edit', 'Only draft quotes can be edited');
      return;
    }
    setEditingItem({
      index: -1, // New item
      item_type: 'materials',
      description: '',
      quantity: '1',
      unit_price: '0',
    });
    setEditModalVisible(true);
  };

  // Save line item edit
  const handleSaveLineItem = () => {
    if (!editingItem) return;

    const quantity = parseFloat(editingItem.quantity) || 0;
    const unit_price = parseFloat(editingItem.unit_price) || 0;
    const total = quantity * unit_price;

    if (!editingItem.description.trim()) {
      Alert.alert('Error', 'Please enter a description');
      return;
    }

    const newItem: QuoteLineItem = {
      item_type: editingItem.item_type as QuoteLineItem['item_type'],
      description: editingItem.description.trim(),
      quantity,
      unit_price,
      total,
    };

    setLineItems((prev) => {
      if (editingItem.index === -1) {
        // New item
        return [...prev, newItem];
      } else {
        // Edit existing
        const updated = [...prev];
        updated[editingItem.index] = newItem;
        return updated;
      }
    });

    setHasChanges(true);
    setEditModalVisible(false);
    setEditingItem(null);
  };

  // Delete line item
  const handleDeleteLineItem = (index: number) => {
    if (quote?.status !== 'draft') {
      Alert.alert('Cannot Edit', 'Only draft quotes can be edited');
      return;
    }

    Alert.alert('Delete Line Item', 'Are you sure you want to remove this item?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setLineItems((prev) => prev.filter((_, i) => i !== index));
          setHasChanges(true);
        },
      },
    ]);
  };

  // Save all changes to the quote
  const handleSaveChanges = async () => {
    if (!quote || !hasChanges) return;

    setSaving(true);
    try {
      const totals = calculateTotals();
      const res = await hvacApi.updateQuote(quote.quote_id, {
        line_items: lineItems,
        equipment_total: totals.equipment_total,
        labor_total: totals.labor_total,
        materials_total: totals.materials_total,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        cost_total: totals.cost_total,
        profit: totals.profit,
      });

      if (res.success) {
        setHasChanges(false);
        Alert.alert('Success', 'Quote updated successfully');
        fetchQuote(); // Refresh
      } else {
        Alert.alert('Error', res.error || 'Failed to save changes');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleSendQuote = async (method: 'email' | 'sms') => {
    if (!quote) return;

    if (hasChanges) {
      Alert.alert('Save Changes', 'Please save your changes before sending the quote');
      return;
    }

    Alert.alert(
      'Send Quote',
      `Send this quote via ${method === 'email' ? 'email' : 'SMS'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSendingQuote(true);
            try {
              const res = await hvacApi.sendQuote(quote.quote_id, method);
              if (res.success) {
                Alert.alert('Success', 'Quote sent successfully');
                fetchQuote();
              } else {
                Alert.alert('Error', res.error || 'Failed to send quote');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to send quote');
            } finally {
              setSendingQuote(false);
            }
          },
        },
      ]
    );
  };

  const handleDownloadPdf = async () => {
    if (!quote) return;

    try {
      const res = await hvacApi.getQuotePdf(quote.quote_id);
      if (res.success && res.data) {
        Alert.alert('PDF Ready', `Quote PDF generated: ${res.data.filename}`);
      } else {
        Alert.alert('Error', 'Failed to generate PDF');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to generate PDF');
    }
  };

  const handleUpdateStatus = (newStatus: Quote['status']) => {
    if (!quote) return;

    Alert.alert('Update Status', `Change quote status to "${newStatus}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Update',
        onPress: async () => {
          try {
            const res = await hvacApi.updateQuoteStatus(quote.quote_id, newStatus);
            if (res.success) {
              fetchQuote();
            } else {
              Alert.alert('Error', res.error || 'Failed to update status');
            }
          } catch (error) {
            Alert.alert('Error', 'Failed to update status');
          }
        },
      },
    ]);
  };

  const handleDeleteQuote = () => {
    if (!quote) return;

    Alert.alert(
      'Delete Quote',
      'Are you sure you want to delete this quote? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await hvacApi.deleteQuote(quote.quote_id);
              if (res.success) {
                router.back();
              } else {
                Alert.alert('Error', res.error || 'Failed to delete quote');
              }
            } catch (error) {
              Alert.alert('Error', 'Failed to delete quote');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading quote...</Text>
      </View>
    );
  }

  if (!quote) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.error} />
        <Text style={styles.errorText}>Quote not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[quote.status] || STATUS_COLORS.draft;
  const totals = calculateTotals();
  const isEditable = quote.status === 'draft';

  return (
    <View style={styles.container}>
      {/* Save Bar - shows when there are unsaved changes */}
      {hasChanges && (
        <View style={styles.saveBar}>
          <Text style={styles.saveBarText}>Unsaved changes</Text>
          <TouchableOpacity
            style={styles.saveBarButton}
            onPress={handleSaveChanges}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={styles.saveBarButtonText}>Save Changes</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.quoteNumber}>
                {quote.job_number || `Quote #${quote.quote_id.slice(-6)}`}
              </Text>
              <Text style={styles.quoteDate}>Created {formatDate(quote.created_at)}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.statusText, { color: statusColor.text }]}>
                {quote.status}
              </Text>
            </View>
          </View>

          <View style={styles.tierRow}>
            <View style={[styles.tierBadge, { backgroundColor: getTierColor(quote.tier) }]}>
              <Text style={styles.tierText}>{quote.tier.toUpperCase()}</Text>
            </View>
            <Text style={styles.jobType}>
              {quote.job_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </Text>
          </View>

          <View style={styles.expiryRow}>
            <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.expiryText}>Expires: {formatDate(quote.expires_at)}</Text>
          </View>
        </View>

        {/* Line Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Line Items</Text>
            {isEditable && (
              <TouchableOpacity style={styles.addButton} onPress={handleAddLineItem}>
                <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                <Text style={styles.addButtonText}>Add Item</Text>
              </TouchableOpacity>
            )}
          </View>

          {lineItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.lineItem}
              onPress={() => handleEditLineItem(index)}
              onLongPress={() => handleDeleteLineItem(index)}
              disabled={!isEditable}
            >
              <View style={styles.lineItemHeader}>
                <View style={styles.lineItemType}>
                  <Ionicons
                    name={
                      item.item_type === 'equipment'
                        ? 'cube-outline'
                        : item.item_type === 'labor'
                        ? 'construct-outline'
                        : 'ellipse-outline'
                    }
                    size={16}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.lineItemTypeText}>{item.item_type}</Text>
                </View>
                <View style={styles.lineItemRight}>
                  <Text style={styles.lineItemTotal}>{formatCurrency(item.total)}</Text>
                  {isEditable && (
                    <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
                  )}
                </View>
              </View>
              <Text style={styles.lineItemDescription}>{item.description}</Text>
              <Text style={styles.lineItemQuantity}>
                {item.quantity} x {formatCurrency(item.unit_price)}
              </Text>
            </TouchableOpacity>
          ))}

          {lineItems.length === 0 && (
            <View style={styles.emptyItems}>
              <Text style={styles.emptyItemsText}>No line items yet</Text>
              {isEditable && (
                <TouchableOpacity onPress={handleAddLineItem}>
                  <Text style={styles.emptyItemsLink}>Add your first item</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Pricing Summary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Pricing Summary</Text>
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Equipment</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totals.equipment_total)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Labor</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totals.labor_total)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Materials</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totals.materials_total)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Subtotal</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totals.subtotal)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                Tax ({((quote.tax_rate || 0.0825) * 100).toFixed(1)}%)
              </Text>
              <Text style={styles.summaryValue}>{formatCurrency(totals.tax)}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatCurrency(totals.total)}</Text>
            </View>
          </View>
        </View>

        {/* Profit Analysis */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profit Analysis</Text>
          <View style={styles.profitCard}>
            <View style={styles.profitRow}>
              <View style={styles.profitItem}>
                <Text style={styles.profitLabel}>Cost</Text>
                <Text style={styles.profitValue}>{formatCurrency(totals.cost_total)}</Text>
              </View>
              <View style={styles.profitItem}>
                <Text style={styles.profitLabel}>Profit</Text>
                <Text style={[styles.profitValue, { color: Colors.success }]}>
                  {formatCurrency(totals.profit)}
                </Text>
              </View>
              <View style={styles.profitItem}>
                <Text style={styles.profitLabel}>Margin</Text>
                <Text style={[styles.profitValue, { color: Colors.primary }]}>
                  {quote.margin_percent.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quote.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.notesCard}>
              <Text style={styles.notesText}>{quote.notes}</Text>
            </View>
          </View>
        )}

        {/* Status Actions */}
        {quote.status === 'draft' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Actions</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#E3F2FD' }]}
                onPress={() => handleSendQuote('email')}
                disabled={sendingQuote || hasChanges}
              >
                <Ionicons name="mail-outline" size={24} color="#1976D2" />
                <Text style={[styles.actionButtonText, { color: '#1976D2' }]}>Send Email</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#E8F5E9' }]}
                onPress={() => handleSendQuote('sms')}
                disabled={sendingQuote || hasChanges}
              >
                <Ionicons name="chatbubble-outline" size={24} color="#388E3C" />
                <Text style={[styles.actionButtonText, { color: '#388E3C' }]}>Send SMS</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {quote.status === 'sent' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer Response</Text>
            <View style={styles.actionsGrid}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#E8F5E9' }]}
                onPress={() => handleUpdateStatus('accepted')}
              >
                <Ionicons name="checkmark-circle-outline" size={24} color="#388E3C" />
                <Text style={[styles.actionButtonText, { color: '#388E3C' }]}>Mark Accepted</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#FFEBEE' }]}
                onPress={() => handleUpdateStatus('rejected')}
              >
                <Ionicons name="close-circle-outline" size={24} color="#D32F2F" />
                <Text style={[styles.actionButtonText, { color: '#D32F2F' }]}>Mark Rejected</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* More Actions */}
        <View style={styles.section}>
          <TouchableOpacity style={styles.secondaryButton} onPress={handleDownloadPdf}>
            <Ionicons name="document-outline" size={20} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Download PDF</Text>
          </TouchableOpacity>

          {quote.status === 'draft' && (
            <TouchableOpacity
              style={[styles.secondaryButton, { borderColor: Colors.error }]}
              onPress={handleDeleteQuote}
            >
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
              <Text style={[styles.secondaryButtonText, { color: Colors.error }]}>
                Delete Quote
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Edit Line Item Modal */}
      <Modal
        visible={editModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem?.index === -1 ? 'Add Line Item' : 'Edit Line Item'}
              </Text>
              <TouchableOpacity onPress={() => setEditModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {/* Item Type */}
            <Text style={styles.inputLabel}>Type</Text>
            <View style={styles.typeSelector}>
              {ITEM_TYPES.map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeButton,
                    editingItem?.item_type === type && styles.typeButtonSelected,
                  ]}
                  onPress={() => setEditingItem((prev) => prev && { ...prev, item_type: type })}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      editingItem?.item_type === type && styles.typeButtonTextSelected,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Description */}
            <Text style={styles.inputLabel}>Description</Text>
            <TextInput
              style={styles.textInput}
              value={editingItem?.description || ''}
              onChangeText={(v) => setEditingItem((prev) => prev && { ...prev, description: v })}
              placeholder="Enter description..."
              multiline
            />

            {/* Quantity and Price */}
            <View style={styles.inputRow}>
              <View style={styles.inputHalf}>
                <Text style={styles.inputLabel}>Quantity</Text>
                <TextInput
                  style={styles.textInput}
                  value={editingItem?.quantity || ''}
                  onChangeText={(v) => setEditingItem((prev) => prev && { ...prev, quantity: v })}
                  keyboardType="decimal-pad"
                  placeholder="1"
                />
              </View>
              <View style={styles.inputHalf}>
                <Text style={styles.inputLabel}>Unit Price</Text>
                <View style={styles.priceInput}>
                  <Text style={styles.priceSymbol}>$</Text>
                  <TextInput
                    style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
                    value={editingItem?.unit_price || ''}
                    onChangeText={(v) =>
                      setEditingItem((prev) => prev && { ...prev, unit_price: v })
                    }
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                  />
                </View>
              </View>
            </View>

            {/* Total Preview */}
            <View style={styles.totalPreview}>
              <Text style={styles.totalPreviewLabel}>Total:</Text>
              <Text style={styles.totalPreviewValue}>
                {formatCurrency(
                  (parseFloat(editingItem?.quantity || '0') || 0) *
                    (parseFloat(editingItem?.unit_price || '0') || 0)
                )}
              </Text>
            </View>

            {/* Save Button */}
            <TouchableOpacity style={styles.saveButton} onPress={handleSaveLineItem}>
              <Text style={styles.saveButtonText}>
                {editingItem?.index === -1 ? 'Add Item' : 'Save Changes'}
              </Text>
            </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xl,
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
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  errorText: {
    fontSize: Typography.fontSize.lg,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  backButton: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
  },
  backButtonText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.semibold,
  },
  saveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.warning,
    padding: Spacing.md,
  },
  saveBarText: {
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  saveBarButton: {
    backgroundColor: Colors.white,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  saveBarButtonText: {
    color: Colors.warning,
    fontWeight: Typography.fontWeight.semibold,
  },
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.md,
  },
  quoteNumber: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  quoteDate: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    textTransform: 'capitalize',
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  tierBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
    marginRight: Spacing.sm,
  },
  tierText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },
  jobType: {
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  expiryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    marginLeft: Spacing.xs,
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
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    marginLeft: Spacing.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  lineItem: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  lineItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  lineItemType: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineItemTypeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
    marginLeft: Spacing.xs,
  },
  lineItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineItemTotal: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginRight: Spacing.xs,
  },
  lineItemDescription: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    marginBottom: 2,
  },
  lineItemQuantity: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  emptyItems: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyItemsText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  emptyItemsLink: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    marginTop: Spacing.sm,
    fontWeight: Typography.fontWeight.medium,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  summaryLabel: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  summaryValue: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.sm,
  },
  totalLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  totalValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  profitCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  profitRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  profitItem: {
    alignItems: 'center',
  },
  profitLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  profitValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  notesCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    ...Shadows.sm,
  },
  notesText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    lineHeight: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  actionButton: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  actionButtonText: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    marginTop: Spacing.xs,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  secondaryButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.primary,
    marginLeft: Spacing.sm,
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
    padding: Spacing.lg,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  inputLabel: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  typeSelector: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  typeButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typeButtonSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.text,
    textTransform: 'capitalize',
  },
  typeButtonTextSelected: {
    color: Colors.white,
  },
  textInput: {
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    fontSize: Typography.fontSize.base,
    marginBottom: Spacing.md,
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  inputHalf: {
    flex: 1,
  },
  priceInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingLeft: Spacing.md,
  },
  priceSymbol: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    marginRight: Spacing.xs,
  },
  totalPreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
  },
  totalPreviewLabel: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.text,
  },
  totalPreviewValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.primary,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  saveButtonText: {
    color: Colors.white,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
  },
});
