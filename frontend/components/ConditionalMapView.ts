/**
 * Conditional MapView Component - Index
 * Auto-imports the correct platform-specific file
 */

// Metro bundler will automatically choose the correct file:
// - ConditionalMapView.web.tsx for web
// - ConditionalMapView.native.tsx for iOS/Android

export { default, ConditionalMarker, ConditionalPolyline, PROVIDER_GOOGLE } from './ConditionalMapView.native';
export type { MapViewProps, MarkerProps, PolylineProps } from './ConditionalMapView.native';
