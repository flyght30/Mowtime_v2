/**
 * Error Boundary Component
 * Catches JavaScript errors in child components and displays a fallback UI
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../constants/theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Log to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Return custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <View style={styles.iconContainer}>
              <Ionicons name="alert-circle" size={64} color={Colors.error} />
            </View>

            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              We're sorry, but something unexpected happened. Please try again.
            </Text>

            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Ionicons name="refresh" size={20} color={Colors.white} />
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>

            {__DEV__ && this.state.error && (
              <ScrollView style={styles.errorDetails}>
                <Text style={styles.errorTitle}>Error Details (Dev Only)</Text>
                <Text style={styles.errorMessage}>
                  {this.state.error.toString()}
                </Text>
                {this.state.errorInfo && (
                  <Text style={styles.errorStack}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * Screen-level error boundary with navigation-aware recovery
 */
interface ScreenErrorBoundaryProps {
  children: ReactNode;
  screenName?: string;
}

interface ScreenErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ScreenErrorBoundary extends Component<ScreenErrorBoundaryProps, ScreenErrorBoundaryState> {
  constructor(props: ScreenErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ScreenErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[${this.props.screenName || 'Screen'}] Error:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.screenErrorContainer}>
          <View style={styles.screenErrorContent}>
            <Ionicons name="warning" size={48} color={Colors.warning} />
            <Text style={styles.screenErrorTitle}>
              Unable to load {this.props.screenName || 'this screen'}
            </Text>
            <Text style={styles.screenErrorMessage}>
              There was a problem loading the content. Please try again.
            </Text>
            <TouchableOpacity
              style={styles.screenErrorButton}
              onPress={this.handleRetry}
            >
              <Text style={styles.screenErrorButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * Widget-level error boundary with compact error display
 */
interface WidgetErrorBoundaryProps {
  children: ReactNode;
  widgetName?: string;
}

interface WidgetErrorBoundaryState {
  hasError: boolean;
}

export class WidgetErrorBoundary extends Component<WidgetErrorBoundaryProps, WidgetErrorBoundaryState> {
  constructor(props: WidgetErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): Partial<WidgetErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[Widget: ${this.props.widgetName || 'Unknown'}] Error:`, error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.widgetError}>
          <Ionicons name="alert-circle-outline" size={24} color={Colors.gray400} />
          <Text style={styles.widgetErrorText}>
            {this.props.widgetName ? `${this.props.widgetName} unavailable` : 'Widget unavailable'}
          </Text>
          <TouchableOpacity onPress={this.handleRetry}>
            <Text style={styles.widgetRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  content: {
    alignItems: 'center',
    maxWidth: 320,
  },
  iconContainer: {
    marginBottom: Spacing.lg,
  },
  title: {
    fontSize: Typography.fontSize.xl,
    fontWeight: Typography.fontWeight.bold,
    color: Colors.text,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  message: {
    fontSize: Typography.fontSize.base,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
    lineHeight: 22,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  buttonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.white,
  },
  errorDetails: {
    marginTop: Spacing.lg,
    maxHeight: 200,
    width: '100%',
    backgroundColor: Colors.gray100,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
  },
  errorTitle: {
    fontSize: Typography.fontSize.sm,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.error,
    marginBottom: Spacing.sm,
  },
  errorMessage: {
    fontSize: Typography.fontSize.xs,
    color: Colors.text,
    fontFamily: 'monospace',
  },
  errorStack: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: Spacing.sm,
  },

  // Screen Error Boundary Styles
  screenErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.background,
  },
  screenErrorContent: {
    alignItems: 'center',
  },
  screenErrorTitle: {
    fontSize: Typography.fontSize.lg,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  screenErrorMessage: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  screenErrorButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  screenErrorButtonText: {
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.medium,
    color: Colors.white,
  },

  // Widget Error Boundary Styles
  widgetError: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  widgetErrorText: {
    flex: 1,
    fontSize: Typography.fontSize.sm,
    color: Colors.gray500,
  },
  widgetRetryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
});

export default ErrorBoundary;
