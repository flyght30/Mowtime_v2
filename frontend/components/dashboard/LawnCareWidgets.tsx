/**
 * Lawn Care Dashboard Widgets
 * Widgets specific to the lawn care vertical
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, Typography, Shadows } from '../../constants/theme';
import { api } from '../../services/api';

interface WeatherData {
  temp: number;
  condition: string;
  icon: string;
  rainChance: number;
  windSpeed: number;
}

interface RouteStats {
  totalStops: number;
  completedStops: number;
  estimatedMiles: number;
  estimatedHours: number;
}

export function WeatherWidget() {
  const [loading, setLoading] = useState(true);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [hasAlert, setHasAlert] = useState(false);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // This would be a real weather API call
        // For demo, use mock data
        setWeather({
          temp: 75,
          condition: 'Partly Cloudy',
          icon: 'partly-sunny',
          rainChance: 20,
          windSpeed: 8,
        });
        setHasAlert(false);
      } catch (error) {
        console.error('Failed to fetch weather:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchWeather();
  }, []);

  if (loading) {
    return (
      <View style={styles.weatherContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (!weather) return null;

  const getWeatherIcon = () => {
    switch (weather.icon) {
      case 'sunny':
        return 'sunny';
      case 'partly-sunny':
        return 'partly-sunny';
      case 'cloudy':
        return 'cloudy';
      case 'rainy':
        return 'rainy';
      default:
        return 'partly-sunny';
    }
  };

  return (
    <View style={styles.weatherContainer}>
      <View style={styles.weatherMain}>
        <Ionicons name={getWeatherIcon()} size={40} color="#FFA000" />
        <View style={styles.weatherInfo}>
          <Text style={styles.weatherTemp}>{weather.temp}°F</Text>
          <Text style={styles.weatherCondition}>{weather.condition}</Text>
        </View>
      </View>

      <View style={styles.weatherDetails}>
        <View style={styles.weatherDetail}>
          <Ionicons name="water" size={16} color={Colors.info} />
          <Text style={styles.weatherDetailText}>{weather.rainChance}% rain</Text>
        </View>
        <View style={styles.weatherDetail}>
          <Ionicons name="flag" size={16} color={Colors.textSecondary} />
          <Text style={styles.weatherDetailText}>{weather.windSpeed} mph</Text>
        </View>
      </View>

      {hasAlert && (
        <View style={styles.weatherAlert}>
          <Ionicons name="warning" size={16} color={Colors.warning} />
          <Text style={styles.weatherAlertText}>Rain expected - consider rescheduling</Text>
        </View>
      )}
    </View>
  );
}

export function RouteSummaryWidget() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [routeStats, setRouteStats] = useState<RouteStats | null>(null);

  useEffect(() => {
    const fetchRouteStats = async () => {
      try {
        // This would fetch today's route data
        // For demo, use mock data
        setRouteStats({
          totalStops: 8,
          completedStops: 3,
          estimatedMiles: 24,
          estimatedHours: 6.5,
        });
      } catch (error) {
        console.error('Failed to fetch route stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRouteStats();
  }, []);

  if (loading) {
    return (
      <View style={styles.routeContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  if (!routeStats) return null;

  const progressPercent = (routeStats.completedStops / routeStats.totalStops) * 100;

  return (
    <TouchableOpacity
      style={styles.routeContainer}
      onPress={() => router.push('/routes')}
    >
      <View style={styles.routeHeader}>
        <Ionicons name="navigate" size={20} color="#4CAF50" />
        <Text style={styles.routeTitle}>Today's Route</Text>
        <Text style={styles.routeSeeAll}>View map</Text>
      </View>

      <View style={styles.routeProgress}>
        <View style={styles.progressBar}>
          <View
            style={[styles.progressFill, { width: `${progressPercent}%` }]}
          />
        </View>
        <Text style={styles.progressText}>
          {routeStats.completedStops} of {routeStats.totalStops} stops completed
        </Text>
      </View>

      <View style={styles.routeStats}>
        <View style={styles.routeStat}>
          <Ionicons name="location" size={16} color={Colors.textSecondary} />
          <Text style={styles.routeStatText}>{routeStats.totalStops} stops</Text>
        </View>
        <View style={styles.routeStat}>
          <Ionicons name="speedometer" size={16} color={Colors.textSecondary} />
          <Text style={styles.routeStatText}>{routeStats.estimatedMiles} miles</Text>
        </View>
        <View style={styles.routeStat}>
          <Ionicons name="time" size={16} color={Colors.textSecondary} />
          <Text style={styles.routeStatText}>{routeStats.estimatedHours}h est.</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export function LawnCareQuickStats() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todayJobs: 0,
    weeklyRevenue: 0,
    activeClients: 0,
    pendingEstimates: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/businesses/me/stats');
        if (response.success && response.data) {
          setStats({
            todayJobs: response.data.appointments?.scheduled || 0,
            weeklyRevenue: response.data.weekly_revenue || 0,
            activeClients: response.data.clients || 0,
            pendingEstimates: response.data.pending_estimates || 0,
          });
        }
      } catch (error) {
        console.error('Failed to fetch lawn care stats:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <View style={styles.quickStatsContainer}>
        <ActivityIndicator size="small" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.quickStatsContainer}>
      <View style={styles.quickStatsHeader}>
        <View style={styles.quickStatsIcon}>
          <Ionicons name="leaf" size={20} color="#4CAF50" />
        </View>
        <Text style={styles.quickStatsTitle}>Lawn Care Overview</Text>
      </View>

      <View style={styles.quickStatsGrid}>
        <TouchableOpacity
          style={styles.quickStatItem}
          onPress={() => router.push('/(tabs)/appointments')}
        >
          <Ionicons name="today" size={20} color="#4CAF50" />
          <Text style={styles.quickStatValue}>{stats.todayJobs}</Text>
          <Text style={styles.quickStatLabel}>Today's Jobs</Text>
        </TouchableOpacity>

        <View style={styles.quickStatItem}>
          <Ionicons name="trending-up" size={20} color="#2196F3" />
          <Text style={styles.quickStatValue}>{formatCurrency(stats.weeklyRevenue)}</Text>
          <Text style={styles.quickStatLabel}>This Week</Text>
        </View>

        <TouchableOpacity
          style={styles.quickStatItem}
          onPress={() => router.push('/(tabs)/clients')}
        >
          <Ionicons name="people" size={20} color="#9C27B0" />
          <Text style={styles.quickStatValue}>{stats.activeClients}</Text>
          <Text style={styles.quickStatLabel}>Active Clients</Text>
        </TouchableOpacity>

        <View style={styles.quickStatItem}>
          <Ionicons name="document-text" size={20} color="#FF9800" />
          <Text style={styles.quickStatValue}>{stats.pendingEstimates}</Text>
          <Text style={styles.quickStatLabel}>Estimates</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weatherContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  weatherMain: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  weatherInfo: {
    marginLeft: Spacing.md,
  },
  weatherTemp: {
    fontSize: Typography.fontSize['2xl'],
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
  },
  weatherCondition: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  weatherDetails: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  weatherDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  weatherDetailText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  weatherAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    marginTop: Spacing.md,
    gap: Spacing.xs,
  },
  weatherAlertText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.warning,
    fontWeight: Typography.fontWeight.medium,
  },
  routeContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  routeTitle: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginLeft: Spacing.sm,
  },
  routeSeeAll: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
  routeProgress: {
    marginBottom: Spacing.md,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.gray200,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  progressText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  routeStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  routeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  routeStatText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  quickStatsContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    ...Shadows.sm,
  },
  quickStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  quickStatsIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.md,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  quickStatsTitle: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
  },
  quickStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  quickStatItem: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  quickStatValue: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginTop: Spacing.xs,
  },
  quickStatLabel: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
});
