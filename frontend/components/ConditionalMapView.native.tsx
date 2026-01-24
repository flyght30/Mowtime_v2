/**
 * Conditional MapView Component - Native Version
 * Loads react-native-maps on iOS and Android
 */

import React from 'react';
import { Platform } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

// Export types
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

// Native MapView component
export default MapView;

// Native Marker component
export const ConditionalMarker = Marker;

// Native Polyline component
export const ConditionalPolyline = Polyline;

// Export provider constant
export { PROVIDER_GOOGLE };
