/**
 * JobChecklist Component
 * Displays and manages job completion checklist items
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  required?: boolean;
}

interface JobChecklistProps {
  items: ChecklistItem[];
  onToggle: (id: string) => void;
  onAddItem?: (label: string) => void;
  editable?: boolean;
  title?: string;
}

export default function JobChecklist({
  items,
  onToggle,
  onAddItem,
  editable = true,
  title = 'Job Checklist',
}: JobChecklistProps) {
  const [newItemText, setNewItemText] = React.useState('');
  const [isAdding, setIsAdding] = React.useState(false);

  const handleAddItem = () => {
    if (!newItemText.trim()) {
      setIsAdding(false);
      return;
    }

    if (onAddItem) {
      onAddItem(newItemText.trim());
    }
    setNewItemText('');
    setIsAdding(false);
  };

  const completedCount = items.filter((item) => item.completed).length;
  const progress = items.length > 0 ? (completedCount / items.length) * 100 : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.progress}>
          {completedCount}/{items.length}
        </Text>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>

      {/* Checklist Items */}
      <View style={styles.list}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.item}
            onPress={() => editable && onToggle(item.id)}
            disabled={!editable}
            activeOpacity={editable ? 0.7 : 1}
          >
            <View
              style={[
                styles.checkbox,
                item.completed && styles.checkboxCompleted,
              ]}
            >
              {item.completed && (
                <Ionicons name="checkmark" size={16} color={Colors.white} />
              )}
            </View>
            <Text
              style={[
                styles.itemLabel,
                item.completed && styles.itemLabelCompleted,
              ]}
            >
              {item.label}
              {item.required && !item.completed && (
                <Text style={styles.requiredAsterisk}> *</Text>
              )}
            </Text>
          </TouchableOpacity>
        ))}

        {/* Add Item */}
        {editable && onAddItem && (
          <>
            {isAdding ? (
              <View style={styles.addItemInput}>
                <TextInput
                  style={styles.textInput}
                  placeholder="Enter checklist item..."
                  placeholderTextColor={Colors.gray400}
                  value={newItemText}
                  onChangeText={setNewItemText}
                  onSubmitEditing={handleAddItem}
                  onBlur={handleAddItem}
                  autoFocus
                />
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={handleAddItem}
                >
                  <Ionicons name="add" size={20} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.addItemButton}
                onPress={() => setIsAdding(true)}
              >
                <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
                <Text style={styles.addItemText}>Add item</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// Default checklists for different job types
export const DEFAULT_CHECKLISTS: Record<string, ChecklistItem[]> = {
  installation: [
    { id: '1', label: 'Old unit removed', completed: false, required: true },
    { id: '2', label: 'New unit installed', completed: false, required: true },
    { id: '3', label: 'Refrigerant charged', completed: false, required: true },
    { id: '4', label: 'Electrical connected', completed: false, required: true },
    { id: '5', label: 'Thermostat programmed', completed: false },
    { id: '6', label: 'Customer walkthrough', completed: false, required: true },
  ],
  maintenance: [
    { id: '1', label: 'Filter replaced', completed: false, required: true },
    { id: '2', label: 'Coils cleaned', completed: false },
    { id: '3', label: 'Refrigerant checked', completed: false },
    { id: '4', label: 'Electrical tested', completed: false },
    { id: '5', label: 'Thermostat calibrated', completed: false },
    { id: '6', label: 'System tested', completed: false, required: true },
  ],
  service: [
    { id: '1', label: 'Diagnosed issue', completed: false, required: true },
    { id: '2', label: 'Repair completed', completed: false, required: true },
    { id: '3', label: 'System tested', completed: false, required: true },
    { id: '4', label: 'Customer informed', completed: false },
  ],
  lawn_care: [
    { id: '1', label: 'Front yard mowed', completed: false, required: true },
    { id: '2', label: 'Back yard mowed', completed: false, required: true },
    { id: '3', label: 'Edges trimmed', completed: false },
    { id: '4', label: 'Debris cleaned', completed: false, required: true },
    { id: '5', label: 'Equipment stored', completed: false },
  ],
  default: [
    { id: '1', label: 'Work completed', completed: false, required: true },
    { id: '2', label: 'Area cleaned', completed: false },
    { id: '3', label: 'Customer walkthrough', completed: false },
  ],
};

// Helper to get checklist for a job type
export function getChecklistForJobType(serviceType: string): ChecklistItem[] {
  const type = serviceType.toLowerCase().replace(/[^a-z_]/g, '_');
  const checklist = DEFAULT_CHECKLISTS[type] || DEFAULT_CHECKLISTS.default;
  // Return a fresh copy with unique IDs
  return checklist.map((item, index) => ({
    ...item,
    id: `${Date.now()}_${index}`,
    completed: false,
  }));
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  progress: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.textSecondary,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.gray200,
    borderRadius: 2,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
    borderRadius: 2,
  },
  list: {
    gap: Spacing.sm,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.gray300,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  checkboxCompleted: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  itemLabel: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  itemLabelCompleted: {
    textDecorationLine: 'line-through',
    color: Colors.textSecondary,
  },
  requiredAsterisk: {
    color: Colors.error,
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  addItemText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  addItemInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.sm,
  },
  textInput: {
    flex: 1,
    paddingVertical: Spacing.sm,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },
  addButton: {
    padding: Spacing.sm,
  },
});
