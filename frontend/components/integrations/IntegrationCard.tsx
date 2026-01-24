/**
 * IntegrationCard Component
 * Display integration status and actions
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import api from '../../services/api';

interface SyncStatus {
  last_sync?: string;
  last_error?: string;
  items_synced?: number;
  in_progress?: boolean;
}

interface Integration {
  integration_id: string;
  provider: string;
  is_active: boolean;
  connected_at?: string;
  remote_account_name?: string;
  sync_status?: SyncStatus;
}

interface ProviderConfig {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  description: string;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  housecall_pro: {
    name: 'Housecall Pro',
    icon: 'home',
    color: '#FF6B00',
    description: 'Sync customers and jobs bidirectionally',
  },
  quickbooks: {
    name: 'QuickBooks Online',
    icon: 'calculator',
    color: '#2CA01C',
    description: 'Push invoices and sync customers',
  },
  google_calendar: {
    name: 'Google Calendar',
    icon: 'calendar',
    color: '#4285F4',
    description: 'Sync tech schedules',
  },
  zapier: {
    name: 'Zapier',
    icon: 'flash',
    color: '#FF4A00',
    description: 'Automate workflows with 5000+ apps',
  },
};

interface Props {
  integration?: Integration;
  provider?: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onSettings?: () => void;
  onSync?: () => void;
  onRefresh?: () => void;
}

export default function IntegrationCard({
  integration,
  provider: providerProp,
  onConnect,
  onDisconnect,
  onSettings,
  onSync,
  onRefresh,
}: Props) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const provider = integration?.provider || providerProp || '';
  const config = PROVIDER_CONFIGS[provider] || {
    name: provider,
    icon: 'link',
    color: Colors.primary,
    description: 'Connect your account',
  };

  const isConnected = integration?.is_active;
  const syncStatus = integration?.sync_status;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const response = await api.post(`/api/v1/integrations/${provider}/connect`);
      const authUrl = response.data?.data?.auth_url;

      if (authUrl) {
        await Linking.openURL(authUrl);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to initiate connection');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    Alert.alert(
      'Disconnect Integration',
      `Are you sure you want to disconnect ${config.name}? All sync mappings will be removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setIsDisconnecting(true);
            try {
              await api.delete(`/api/v1/integrations/${provider}`);
              onRefresh?.();
              Alert.alert('Success', `${config.name} disconnected`);
            } catch (err) {
              Alert.alert('Error', 'Failed to disconnect');
            } finally {
              setIsDisconnecting(false);
            }
          },
        },
      ]
    );
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await api.post(`/api/v1/integrations/${provider}/sync`);
      const message = response.data?.data?.message || 'Sync completed';
      Alert.alert('Sync Complete', message);
      onRefresh?.();
    } catch (err) {
      Alert.alert('Error', 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatLastSync = (dateString?: string) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: config.color + '20' }]}>
          <Ionicons name={config.icon} size={24} color={config.color} />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.providerName}>{config.name}</Text>
          {isConnected ? (
            <View style={styles.statusBadge}>
              <View style={styles.statusDot} />
              <Text style={styles.statusText}>Connected</Text>
            </View>
          ) : (
            <Text style={styles.description}>{config.description}</Text>
          )}
        </View>
      </View>

      {isConnected && (
        <View style={styles.details}>
          {integration?.remote_account_name && (
            <View style={styles.detailRow}>
              <Ionicons name="business-outline" size={16} color={Colors.textSecondary} />
              <Text style={styles.detailText}>{integration.remote_account_name}</Text>
            </View>
          )}

          <View style={styles.detailRow}>
            <Ionicons name="sync-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.detailText}>
              Last sync: {formatLastSync(syncStatus?.last_sync)}
            </Text>
            {syncStatus?.items_synced !== undefined && (
              <Text style={styles.syncCount}>
                {syncStatus.items_synced} items
              </Text>
            )}
          </View>

          {syncStatus?.last_error && (
            <View style={styles.errorRow}>
              <Ionicons name="warning-outline" size={16} color={Colors.error} />
              <Text style={styles.errorText} numberOfLines={1}>
                {syncStatus.last_error}
              </Text>
            </View>
          )}

          {syncStatus?.in_progress && (
            <View style={styles.progressRow}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.progressText}>Sync in progress...</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.actions}>
        {isConnected ? (
          <>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleSync}
              disabled={isSyncing || syncStatus?.in_progress}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <>
                  <Ionicons name="sync" size={18} color={Colors.primary} />
                  <Text style={styles.actionText}>Sync Now</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionButton} onPress={onSettings}>
              <Ionicons name="settings-outline" size={18} color={Colors.textSecondary} />
              <Text style={[styles.actionText, { color: Colors.textSecondary }]}>Settings</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <>
                  <Ionicons name="unlink" size={18} color={Colors.error} />
                  <Text style={[styles.actionText, { color: Colors.error }]}>Disconnect</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={styles.connectButton}
            onPress={onConnect || handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <Ionicons name="link" size={18} color={Colors.white} />
                <Text style={styles.connectText}>Connect</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  headerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: 4,
  },
  description: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
    marginRight: 6,
  },
  statusText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.success,
    fontWeight: Typography.fontWeight.medium,
  },
  details: {
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  detailText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    flex: 1,
  },
  syncCount: {
    fontSize: Typography.fontSize.xs,
    color: Colors.primary,
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
    flex: 1,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  progressText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
  },
  actions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.md,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  actionText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  connectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  connectText: {
    fontSize: Typography.fontSize.base,
    color: Colors.white,
    fontWeight: Typography.fontWeight.bold,
  },
});
