/**
 * Conditional MapView Component
 * Loads react-native-maps only on native platforms, shows placeholder on web
 */

import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { Colors, Typography } from '../constants/theme';

// Type definitions for MapView props
export interface MapViewProps {
  provider?: any;
  style?: any;
  initialRegion?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  region?: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  };
  onRegionChangeComplete?: (region: any) => void;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  followsUserLocation?: boolean;
  children?: React.ReactNode;
  ref?: any;
}

export interface MarkerProps {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  title?: string;
  description?: string;
  pinColor?: string;
  onPress?: () => void;
  children?: React.ReactNode;
}

export interface PolylineProps {
  coordinates: Array<{
    latitude: number;
    longitude: number;
  }>;
  strokeColor?: string;
  strokeWidth?: number;
}

// Conditionally load native modules
let MapView: any = null;
let Marker: any = null;
let Polyline: any = null;
let PROVIDER_GOOGLE: any = null;

if (Platform.OS !== 'web') {
  // Only load on native platforms
  const maps = require('react-native-maps');
  MapView = maps.default;
  Marker = maps.Marker;
  Polyline = maps.Polyline;
  PROVIDER_GOOGLE = maps.PROVIDER_GOOGLE;
}

// Web fallback component
function WebMapPlaceholder({ style }: { style?: any }) {
  return (
    <View style={[styles.webPlaceholder, style]}>
      <Text style={styles.placeholderText}>📍</Text>
      <Text style={styles.placeholderSubtext}>
        Map view available on mobile
      </Text>
      <Text style={styles.placeholderHint}>
        Use Expo Go app to view maps
      </Text>
    </View>
  );
}

// Conditional MapView export
export default function ConditionalMapView(props: MapViewProps) {
  if (Platform.OS === 'web' || !MapView) {
    return <WebMapPlaceholder style={props.style} />;
  }
  return <MapView {...props} />;
}

// Conditional Marker export
export function ConditionalMarker(props: MarkerProps) {
  if (Platform.OS === 'web' || !Marker) {
    return null;
  }
  return <Marker {...props} />;
}

// Conditional Polyline export
export function ConditionalPolyline(props: PolylineProps) {
  if (Platform.OS === 'web' || !Polyline) {
    return null;
  }
  return <Polyline {...props} />;
}

// Export provider constant
export { PROVIDER_GOOGLE };

const styles = StyleSheet.create({
  webPlaceholder: {
    flex: 1,
    backgroundColor: Colors.gray100,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    padding: 32,
  },
  placeholderText: {
    fontSize: 48,
    marginBottom: 16,
  },
  placeholderSubtext: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderHint: {
    fontSize: Typography.fontSize.sm,
    color: Colors.gray600,
    textAlign: 'center',
  },
});
