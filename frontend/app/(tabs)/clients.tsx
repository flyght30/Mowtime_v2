/**
 * Clients Screen
 * List and manage customers
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../../services/api';
import { Card } from '../../components/ui';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface Client {
  client_id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone: string;
  status: string;
  total_appointments: number;
  completed_appointments: number;
  lifetime_value: number;
  tags: string[];
}

export default function ClientsScreen() {
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    fetchClients(true);
  }, [searchQuery]);

  const fetchClients = async (reset = false) => {
    if (!reset && !hasMore) return;

    const currentPage = reset ? 1 : page;

    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: '20',
      });

      if (searchQuery) {
        params.append('search', searchQuery);
      }

      const response = await api.get(`/clients?${params}`);

      if (response.success && response.data) {
        if (reset) {
          setClients(response.data);
        } else {
          setClients(prev => [...prev, ...response.data]);
        }
        setHasMore(response.meta?.has_next || false);
        setPage(currentPage + 1);
      }
    } catch (error) {
      console.error('Failed to fetch clients:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchClients(true);
    setRefreshing(false);
  }, [searchQuery]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return Colors.success;
      case 'inactive': return Colors.gray500;
      case 'prospect': return Colors.info;
      case 'do_not_service': return Colors.error;
      default: return Colors.gray500;
    }
  };

  const renderItem = ({ item }: { item: Client }) => (
    <Card style={styles.clientCard}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.first_name[0]}{item.last_name[0]}
          </Text>
        </View>
        <View style={styles.clientInfo}>
          <Text style={styles.clientName}>
            {item.first_name} {item.last_name}
          </Text>
          <Text style={styles.clientContact}>{item.phone}</Text>
          {item.email && (
            <Text style={styles.clientContact}>{item.email}</Text>
          )}
        </View>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: getStatusColor(item.status) },
          ]}
        />
      </View>

      {item.tags.length > 0 && (
        <View style={styles.tagsContainer}>
          {item.tags.slice(0, 3).map((tag, index) => (
            <View key={index} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
          {item.tags.length > 3 && (
            <Text style={styles.moreText}>+{item.tags.length - 3}</Text>
          )}
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{item.completed_appointments}</Text>
          <Text style={styles.statLabel}>Jobs</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>
            ${item.lifetime_value.toLocaleString()}
          </Text>
          <Text style={styles.statLabel}>Lifetime</Text>
        </View>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chevron-forward" size={20} color={Colors.gray400} />
        </TouchableOpacity>
      </View>
    </Card>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="people-outline" size={64} color={Colors.gray300} />
      <Text style={styles.emptyTitle}>No clients</Text>
      <Text style={styles.emptyText}>
        {searchQuery
          ? 'No clients match your search'
          : 'Add your first client to get started'}
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color={Colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search clients..."
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

      {/* Clients List */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={clients}
          renderItem={renderItem}
          keyExtractor={item => item.client_id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListEmptyComponent={renderEmpty}
          onEndReached={() => fetchClients(false)}
          onEndReachedThreshold={0.3}
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab}>
        <Ionicons name="person-add" size={24} color={Colors.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  searchContainer: {
    padding: Spacing.md,
    backgroundColor: Colors.white,
  },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
  },

  searchInput: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    color: Colors.text,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  listContent: {
    padding: Spacing.md,
    flexGrow: 1,
  },

  clientCard: {
    marginBottom: Spacing.md,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },

  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },

  avatarText: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.white,
  },

  clientInfo: {
    flex: 1,
  },

  clientName: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },

  clientContact: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },

  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },

  tag: {
    backgroundColor: Colors.gray100,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },

  tagText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },

  moreText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    alignSelf: 'center',
  },

  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.sm,
  },

  stat: {
    flex: 1,
  },

  statValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },

  statLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },

  actionButton: {
    padding: Spacing.sm,
  },

  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },

  emptyTitle: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.md,
  },

  emptyText: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },

  fab: {
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.md,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
