/**
 * Conditional MapView Component - Web Version
 * Shows placeholder on web since maps are not supported
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography } from '../constants/theme';

// Type definitions
export interface MapViewProps {
  provider?: any;
  style?: any;
  initialRegion?: any;
  region?: any;
  onRegionChangeComplete?: (region: any) => void;
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  followsUserLocation?: boolean;
  children?: React.ReactNode;
  ref?: any;
  onMapReady?: () => void;
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
  lineDashPattern?: number[];
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
        Use Expo Go app or run on device to view maps
      </Text>
    </View>
  );
}

// Web MapView component
export default function ConditionalMapView(props: MapViewProps) {
  return <WebMapPlaceholder style={props.style} />;
}

// Web Marker component
export function ConditionalMarker(props: MarkerProps) {
  return null;
}

// Web Polyline component
export function ConditionalPolyline(props: PolylineProps) {
  return null;
}

// Export null provider for web
export const PROVIDER_GOOGLE = null;

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
