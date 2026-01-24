import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../../constants/theme';
import { smsApi, SMSTemplate, TRIGGER_TYPE_LABELS, SMSTriggerType } from '../../services/smsApi';

const AVAILABLE_VARIABLES = [
  { key: 'customer_first_name', label: 'Customer First Name' },
  { key: 'customer_last_name', label: 'Customer Last Name' },
  { key: 'company_name', label: 'Company Name' },
  { key: 'company_phone', label: 'Company Phone' },
  { key: 'tech_first_name', label: 'Tech First Name' },
  { key: 'tech_phone', label: 'Tech Phone' },
  { key: 'scheduled_date', label: 'Scheduled Date' },
  { key: 'scheduled_time', label: 'Scheduled Time' },
  { key: 'job_type', label: 'Job Type' },
  { key: 'job_total', label: 'Job Total' },
  { key: 'eta_minutes', label: 'ETA (minutes)' },
  { key: 'eta_time', label: 'ETA Time' },
  { key: 'invoice_link', label: 'Invoice Link' },
];

export default function SMSTemplatesScreen() {
  const [templates, setTemplates] = useState<SMSTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<SMSTemplate | null>(null);
  const [editedBody, setEditedBody] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [saving, setSaving] = useState(false);
  const [showVariables, setShowVariables] = useState(false);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await smsApi.listTemplates();
      setTemplates(data);
    } catch (error) {
      console.error('Failed to load templates:', error);
      Alert.alert('Error', 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const openEditor = (template: SMSTemplate) => {
    setEditingTemplate(template);
    setEditedBody(template.body);
    setPreviewText('');
    loadPreview(template.body);
  };

  const loadPreview = async (body: string) => {
    try {
      const preview = await smsApi.previewTemplate(body);
      setPreviewText(preview.rendered);
    } catch (error) {
      console.error('Failed to load preview:', error);
    }
  };

  const insertVariable = (variable: string) => {
    const insertion = `{{${variable}}}`;
    setEditedBody(editedBody + insertion);
    setShowVariables(false);
  };

  const saveTemplate = async () => {
    if (!editingTemplate || !editedBody.trim()) return;

    setSaving(true);
    try {
      await smsApi.updateTemplate(editingTemplate.template_id, {
        body: editedBody,
      });
      await loadTemplates();
      setEditingTemplate(null);
      Alert.alert('Success', 'Template saved');
    } catch (error) {
      console.error('Failed to save template:', error);
      Alert.alert('Error', 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  const toggleTemplateActive = async (template: SMSTemplate) => {
    try {
      await smsApi.updateTemplate(template.template_id, {
        is_active: !template.is_active,
      });
      await loadTemplates();
    } catch (error) {
      console.error('Failed to toggle template:', error);
      Alert.alert('Error', 'Failed to update template');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerDescription}>
          Customize the messages sent at each stage of a job
        </Text>

        {templates.map((template) => (
          <TouchableOpacity
            key={template.template_id}
            style={styles.templateCard}
            onPress={() => openEditor(template)}
            activeOpacity={0.7}
          >
            <View style={styles.templateHeader}>
              <View style={styles.templateTitleRow}>
                <Text style={styles.templateName}>{template.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    template.is_active ? styles.activeBadge : styles.inactiveBadge,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      template.is_active ? styles.activeText : styles.inactiveText,
                    ]}
                  >
                    {template.is_active ? 'Active' : 'Inactive'}
                  </Text>
                </View>
              </View>
              <Text style={styles.triggerLabel}>
                {TRIGGER_TYPE_LABELS[template.trigger_type as SMSTriggerType]}
              </Text>
            </View>
            <Text style={styles.templateBody} numberOfLines={3}>
              {template.body}
            </Text>
            <View style={styles.templateFooter}>
              <Text style={styles.variablesLabel}>
                Variables: {template.variables.length > 0 ? template.variables.join(', ') : 'None'}
              </Text>
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
            </View>
          </TouchableOpacity>
        ))}

        {templates.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="document-text-outline" size={64} color={Colors.textSecondary} />
            <Text style={styles.emptyTitle}>No Templates</Text>
            <TouchableOpacity
              style={styles.seedButton}
              onPress={async () => {
                try {
                  await smsApi.seedTemplates();
                  await loadTemplates();
                } catch (error) {
                  console.error('Failed to seed templates:', error);
                }
              }}
            >
              <Text style={styles.seedButtonText}>Load Default Templates</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Editor Modal */}
      <Modal visible={!!editingTemplate} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setEditingTemplate(null)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Edit Template</Text>
            <TouchableOpacity
              onPress={saveTemplate}
              disabled={saving}
              style={styles.saveModalButton}
            >
              {saving ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.saveModalText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            <View style={styles.templateInfo}>
              <Text style={styles.editLabel}>{editingTemplate?.name}</Text>
              <Text style={styles.editTrigger}>
                Trigger: {TRIGGER_TYPE_LABELS[editingTemplate?.trigger_type as SMSTriggerType]}
              </Text>
            </View>

            <View style={styles.editorSection}>
              <View style={styles.editorHeader}>
                <Text style={styles.editorLabel}>Message</Text>
                <TouchableOpacity
                  style={styles.variablesButton}
                  onPress={() => setShowVariables(!showVariables)}
                >
                  <Ionicons name="code" size={18} color={Colors.primary} />
                  <Text style={styles.variablesButtonText}>Insert Variable</Text>
                </TouchableOpacity>
              </View>

              {showVariables && (
                <View style={styles.variablesList}>
                  {AVAILABLE_VARIABLES.map((v) => (
                    <TouchableOpacity
                      key={v.key}
                      style={styles.variableChip}
                      onPress={() => insertVariable(v.key)}
                    >
                      <Text style={styles.variableChipText}>{`{{${v.key}}}`}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <TextInput
                style={styles.bodyInput}
                value={editedBody}
                onChangeText={(text) => {
                  setEditedBody(text);
                  loadPreview(text);
                }}
                multiline
                maxLength={1600}
                placeholder="Enter message template..."
                placeholderTextColor={Colors.textSecondary}
              />
              <Text style={styles.charCounter}>{editedBody.length}/1600</Text>
            </View>

            <View style={styles.previewSection}>
              <Text style={styles.previewLabel}>Preview</Text>
              <View style={styles.previewBox}>
                <Text style={styles.previewText}>
                  {previewText || 'Loading preview...'}
                </Text>
              </View>
            </View>

            <View style={styles.actionsSection}>
              <TouchableOpacity
                style={styles.toggleButton}
                onPress={() => {
                  if (editingTemplate) {
                    toggleTemplateActive(editingTemplate);
                    setEditingTemplate({
                      ...editingTemplate,
                      is_active: !editingTemplate.is_active,
                    });
                  }
                }}
              >
                <Ionicons
                  name={editingTemplate?.is_active ? 'pause-circle' : 'play-circle'}
                  size={24}
                  color={editingTemplate?.is_active ? Colors.warning : Colors.success}
                />
                <Text style={styles.toggleText}>
                  {editingTemplate?.is_active ? 'Disable Template' : 'Enable Template'}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  headerDescription: {
    fontSize: Typography.fontSize.md,
    color: Colors.textSecondary,
    marginBottom: Spacing.md,
  },
  templateCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  templateHeader: {
    marginBottom: Spacing.sm,
  },
  templateTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  templateName: {
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  activeBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  inactiveBadge: {
    backgroundColor: 'rgba(158, 158, 158, 0.1)',
  },
  statusText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: '600',
  },
  activeText: {
    color: Colors.success,
  },
  inactiveText: {
    color: Colors.textSecondary,
  },
  triggerLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontWeight: '500',
  },
  templateBody: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: Spacing.sm,
  },
  templateFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },
  variablesLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  seedButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  seedButtonText: {
    color: Colors.white,
    fontWeight: '600',
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  closeButton: {
    padding: Spacing.xs,
  },
  modalTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  saveModalButton: {
    padding: Spacing.xs,
  },
  saveModalText: {
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
    color: Colors.primary,
  },
  modalContent: {
    flex: 1,
    padding: Spacing.md,
  },
  templateInfo: {
    marginBottom: Spacing.md,
  },
  editLabel: {
    fontSize: Typography.fontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  editTrigger: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    marginTop: 4,
  },
  editorSection: {
    marginBottom: Spacing.md,
  },
  editorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  editorLabel: {
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  variablesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    padding: Spacing.xs,
  },
  variablesButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: '500',
  },
  variablesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
  },
  variableChip: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.sm,
  },
  variableChipText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    fontFamily: 'monospace',
  },
  bodyInput: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: Typography.fontSize.md,
    color: Colors.text,
    minHeight: 150,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  charCounter: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  previewSection: {
    marginBottom: Spacing.md,
  },
  previewLabel: {
    fontSize: Typography.fontSize.md,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  previewBox: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  previewText: {
    fontSize: Typography.fontSize.md,
    color: Colors.text,
    lineHeight: 22,
  },
  actionsSection: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  toggleText: {
    fontSize: Typography.fontSize.md,
    color: Colors.text,
  },
});
