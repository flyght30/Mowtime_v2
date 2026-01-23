/**
 * CallLog Component
 * Displays individual call entries in a list
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';

interface CallLogProps {
  call: {
    call_id: string;
    from_number: string;
    to_number: string;
    direction: 'inbound' | 'outbound';
    status: string;
    intent: string;
    duration_seconds: number;
    created_at: string;
    customer_name?: string;
    conversation_summary?: string;
  };
  onPress: (callId: string) => void;
  onCall?: (phone: string) => void;
}

export default function CallLog({ call, onPress, onCall }: CallLogProps) {
  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }
    return phone;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    if (isToday) {
      return timeStr;
    } else if (isYesterday) {
      return `Yesterday ${timeStr}`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    }
  };

  const getIntentInfo = (intent: string) => {
    const intents: Record<string, { label: string; color: string; icon: string }> = {
      booking: { label: 'Booking', color: Colors.success, icon: 'calendar' },
      reschedule: { label: 'Reschedule', color: Colors.warning, icon: 'time' },
      cancel: { label: 'Cancellation', color: Colors.error, icon: 'close-circle' },
      inquiry: { label: 'Inquiry', color: Colors.primary, icon: 'help-circle' },
      support: { label: 'Support', color: Colors.info, icon: 'headset' },
      unknown: { label: 'General', color: Colors.gray500, icon: 'chatbubble' },
    };
    return intents[intent] || intents.unknown;
  };

  const getStatusInfo = (status: string) => {
    const statuses: Record<string, { color: string; icon: string }> = {
      completed: { color: Colors.success, icon: 'checkmark-circle' },
      missed: { color: Colors.error, icon: 'close-circle' },
      in_progress: { color: Colors.warning, icon: 'radio-button-on' },
      voicemail: { color: Colors.gray500, icon: 'mail' },
      failed: { color: Colors.error, icon: 'alert-circle' },
    };
    return statuses[status] || { color: Colors.gray500, icon: 'call' };
  };

  const intentInfo = getIntentInfo(call.intent);
  const statusInfo = getStatusInfo(call.status);
  const isInbound = call.direction === 'inbound';
  const phoneNumber = isInbound ? call.from_number : call.to_number;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onPress(call.call_id)}
      activeOpacity={0.7}
    >
      <View style={styles.leftSection}>
        {/* Direction Icon */}
        <View style={[styles.directionIcon, { backgroundColor: statusInfo.color + '15' }]}>
          <Ionicons
            name={isInbound ? 'call-outline' : 'arrow-redo'}
            size={20}
            color={statusInfo.color}
            style={isInbound ? styles.inboundIcon : styles.outboundIcon}
          />
        </View>
      </View>

      <View style={styles.content}>
        {/* Top Row: Name/Number and Time */}
        <View style={styles.topRow}>
          <Text style={styles.callerName} numberOfLines={1}>
            {call.customer_name || formatPhoneNumber(phoneNumber)}
          </Text>
          <Text style={styles.timestamp}>{formatTime(call.created_at)}</Text>
        </View>

        {/* Middle Row: Intent and Duration */}
        <View style={styles.middleRow}>
          <View style={[styles.intentBadge, { backgroundColor: intentInfo.color + '15' }]}>
            <Ionicons name={intentInfo.icon as any} size={12} color={intentInfo.color} />
            <Text style={[styles.intentText, { color: intentInfo.color }]}>
              {intentInfo.label}
            </Text>
          </View>
          <View style={styles.durationBadge}>
            <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
            <Text style={styles.durationText}>{formatDuration(call.duration_seconds)}</Text>
          </View>
        </View>

        {/* Bottom Row: Summary */}
        {call.conversation_summary && (
          <Text style={styles.summary} numberOfLines={2}>
            {call.conversation_summary}
          </Text>
        )}
      </View>

      {/* Right Section: Call Back Button */}
      {onCall && (
        <TouchableOpacity
          style={styles.callButton}
          onPress={(e) => {
            e.stopPropagation();
            onCall(phoneNumber);
          }}
        >
          <Ionicons name="call" size={18} color={Colors.primary} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    ...Shadows.sm,
  },
  leftSection: {
    marginRight: Spacing.md,
  },
  directionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inboundIcon: {
    transform: [{ rotate: '-135deg' }],
  },
  outboundIcon: {
    transform: [{ rotate: '0deg' }],
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  callerName: {
    flex: 1,
    fontSize: Typography.fontSize.base,
    fontWeight: Typography.fontWeight.semibold,
    color: Colors.text,
    marginRight: Spacing.sm,
  },
  timestamp: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  intentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  intentText: {
    fontSize: Typography.fontSize.xs,
    fontWeight: Typography.fontWeight.medium,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  durationText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
  },
  summary: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  callButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary + '10',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  },
});
