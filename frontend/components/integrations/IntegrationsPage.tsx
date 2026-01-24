/**
 * IntegrationsPage Component
 * Settings page for managing integrations and webhooks
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import api from '../../services/api';
import IntegrationCard from './IntegrationCard';
import WebhookCard from './WebhookCard';

interface Integration {
  integration_id: string;
  provider: string;
  is_active: boolean;
  connected_at?: string;
  remote_account_name?: string;
  sync_status?: {
    last_sync?: string;
    last_error?: string;
    items_synced?: number;
    in_progress?: boolean;
  };
}

interface Webhook {
  subscription_id: string;
  name?: string;
  url: string;
  events: string[];
  is_active: boolean;
  last_triggered?: string;
  failure_count: number;
  consecutive_failures: number;
  auto_disabled: boolean;
}

const AVAILABLE_PROVIDERS = ['housecall_pro', 'quickbooks', 'google_calendar'];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [availableProviders, setAvailableProviders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'integrations' | 'webhooks'>('integrations');

  const loadData = useCallback(async () => {
    try {
      const [integrationsRes, webhooksRes] = await Promise.all([
        api.get('/api/v1/integrations'),
        api.get('/api/v1/webhooks'),
      ]);

      setIntegrations(integrationsRes.data?.data || []);
      setAvailableProviders(integrationsRes.data?.meta?.available_providers || []);
      setWebhooks(webhooksRes.data?.data || []);
    } catch (err) {
      console.error('Failed to load integrations:', err);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const handleAddWebhook = () => {
    Alert.prompt(
      'New Webhook',
      'Enter the webhook URL:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (url) => {
            if (!url?.trim()) return;
            try {
              await api.post('/api/v1/webhooks', {
                url: url.trim(),
                events: ['job.created', 'job.completed', 'customer.created'],
              });
              loadData();
              Alert.alert('Success', 'Webhook created');
            } catch (err) {
              Alert.alert('Error', 'Failed to create webhook');
            }
          },
        },
      ],
      'plain-text',
      '',
      'url'
    );
  };

  const connectedIntegrations = integrations.filter((i) => i.is_active);
  const activeWebhooks = webhooks.filter((w) => w.is_active && !w.auto_disabled);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading integrations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'integrations' && styles.activeTab]}
          onPress={() => setActiveTab('integrations')}
        >
          <Ionicons
            name="link"
            size={20}
            color={activeTab === 'integrations' ? Colors.primary : Colors.textSecondary}
          />
          <Text
            style={[styles.tabText, activeTab === 'integrations' && styles.activeTabText]}
          >
            Integrations
          </Text>
          {connectedIntegrations.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{connectedIntegrations.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'webhooks' && styles.activeTab]}
          onPress={() => setActiveTab('webhooks')}
        >
          <Ionicons
            name="flash"
            size={20}
            color={activeTab === 'webhooks' ? Colors.primary : Colors.textSecondary}
          />
          <Text style={[styles.tabText, activeTab === 'webhooks' && styles.activeTabText]}>
            Webhooks
          </Text>
          {activeWebhooks.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeWebhooks.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {activeTab === 'integrations' ? (
          <>
            {/* Connected Integrations */}
            {connectedIntegrations.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Connected</Text>
                {connectedIntegrations.map((integration) => (
                  <IntegrationCard
                    key={integration.integration_id}
                    integration={integration}
                    onRefresh={loadData}
                  />
                ))}
              </View>
            )}

            {/* Available Integrations */}
            {availableProviders.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Available</Text>
                {availableProviders.map((provider) => (
                  <IntegrationCard
                    key={provider}
                    provider={provider}
                    onRefresh={loadData}
                  />
                ))}
              </View>
            )}

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle" size={20} color={Colors.info} />
              <Text style={styles.infoText}>
                Integrations allow you to sync data with other services you use. Connect
                Housecall Pro to sync customers and jobs, or QuickBooks to manage invoices.
              </Text>
            </View>
          </>
        ) : (
          <>
            {/* Webhooks Header */}
            <View style={styles.webhooksHeader}>
              <Text style={styles.sectionTitle}>Webhook Subscriptions</Text>
              <TouchableOpacity style={styles.addButton} onPress={handleAddWebhook}>
                <Ionicons name="add" size={20} color={Colors.white} />
                <Text style={styles.addButtonText}>Add Webhook</Text>
              </TouchableOpacity>
            </View>

            {/* Webhook List */}
            {webhooks.length > 0 ? (
              webhooks.map((webhook) => (
                <WebhookCard
                  key={webhook.subscription_id}
                  webhook={webhook}
                  onRefresh={loadData}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="flash-outline" size={48} color={Colors.gray300} />
                <Text style={styles.emptyTitle}>No Webhooks</Text>
                <Text style={styles.emptyText}>
                  Webhooks let you send real-time notifications to other services when
                  events happen in your account.
                </Text>
                <TouchableOpacity style={styles.emptyButton} onPress={handleAddWebhook}>
                  <Text style={styles.emptyButtonText}>Create First Webhook</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Webhook Info */}
            {webhooks.length > 0 && (
              <View style={styles.infoBox}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.info} />
                <Text style={styles.infoText}>
                  Webhooks are signed using HMAC-SHA256. Use the signing secret to verify
                  that requests are from TheWorx.
                </Text>
              </View>
            )}
          </>
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
    borderRadius: BorderRadius.md,
  },
  activeTab: {
    backgroundColor: Colors.primary + '15',
  },
  tabText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    fontWeight: Typography.fontWeight.medium,
  },
  activeTabText: {
    color: Colors.primary,
  },
  badge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: 'center',
  },
  badgeText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },
  section: {
    marginBottom: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  webhooksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    gap: Spacing.xs,
  },
  addButtonText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  emptyState: {
    alignItems: 'center',
    padding: Spacing.xl,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
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
    marginBottom: Spacing.md,
  },
  emptyButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  emptyButtonText: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    fontWeight: Typography.fontWeight.medium,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: Colors.info + '15',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  infoText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.info,
    lineHeight: 20,
  },
});
