import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../../../constants/theme';
import {
  smsApi,
  SMSConversation,
  SMSMessage,
  formatPhoneNumber,
  STATUS_COLORS,
} from '../../../services/smsApi';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const flatListRef = useRef<FlatList>(null);

  const [conversation, setConversation] = useState<SMSConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [messageText, setMessageText] = useState('');

  const loadConversation = useCallback(async () => {
    if (!id) return;
    try {
      const data = await smsApi.getConversation(id);
      setConversation(data);
      navigation.setOptions({ title: data.customer_name });
    } catch (error) {
      console.error('Failed to load conversation:', error);
      Alert.alert('Error', 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, [id, navigation]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  const sendMessage = async () => {
    if (!messageText.trim() || !id || sending) return;

    setSending(true);
    try {
      const result = await smsApi.sendSMS({
        customer_id: id,
        message: messageText.trim(),
      });

      if (result.success) {
        setMessageText('');
        await loadConversation();
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      } else {
        Alert.alert('Failed', result.error || 'Could not send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDateHeader = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString([], {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  const renderMessage = ({ item, index }: { item: SMSMessage; index: number }) => {
    const isOutbound = item.direction === 'outbound';
    const messages = conversation?.messages || [];
    const prevMessage = index > 0 ? messages[index - 1] : null;

    // Show date header if different day
    const showDateHeader =
      !prevMessage ||
      new Date(item.created_at).toDateString() !==
        new Date(prevMessage.created_at).toDateString();

    return (
      <>
        {showDateHeader && (
          <View style={styles.dateHeader}>
            <Text style={styles.dateHeaderText}>{formatDateHeader(item.created_at)}</Text>
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isOutbound ? styles.outboundBubble : styles.inboundBubble,
          ]}
        >
          <Text style={[styles.messageText, isOutbound && styles.outboundText]}>
            {item.body}
          </Text>
          <View style={styles.messageFooter}>
            <Text style={[styles.timeText, isOutbound && styles.outboundTime]}>
              {formatTime(item.created_at)}
            </Text>
            {isOutbound && (
              <View style={styles.statusContainer}>
                {item.status === 'delivered' && (
                  <Ionicons name="checkmark-done" size={14} color={colors.success} />
                )}
                {item.status === 'sent' && (
                  <Ionicons name="checkmark" size={14} color="rgba(255,255,255,0.7)" />
                )}
                {item.status === 'failed' && (
                  <Ionicons name="alert-circle" size={14} color={colors.error} />
                )}
                {item.status === 'queued' && (
                  <Ionicons name="time" size={14} color="rgba(255,255,255,0.7)" />
                )}
              </View>
            )}
          </View>
        </View>
      </>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!conversation) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={64} color={colors.textSecondary} />
        <Text style={styles.errorText}>Conversation not found</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Customer Info Header */}
      <View style={styles.customerHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {conversation.customer_name
              .split(' ')
              .map((n) => n[0])
              .join('')
              .substring(0, 2)
              .toUpperCase()}
          </Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName}>{conversation.customer_name}</Text>
          <Text style={styles.customerPhone}>
            {formatPhoneNumber(conversation.customer_phone)}
          </Text>
        </View>
        <TouchableOpacity style={styles.callButton}>
          <Ionicons name="call-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={conversation.messages}
        keyExtractor={(item) => item.message_id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messagesList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="chatbubble-outline" size={48} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No messages yet</Text>
          </View>
        }
      />

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={colors.textSecondary}
          value={messageText}
          onChangeText={setMessageText}
          multiline
          maxLength={1600}
        />
        <TouchableOpacity
          style={[styles.sendButton, !messageText.trim() && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!messageText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="send" size={20} color={colors.white} />
          )}
        </TouchableOpacity>
      </View>

      {/* Character count */}
      {messageText.length > 100 && (
        <View style={styles.charCount}>
          <Text style={styles.charCountText}>{messageText.length}/1600</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  errorText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  customerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: colors.white,
    fontSize: typography.sizes.md,
    fontWeight: '600',
  },
  customerInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  customerName: {
    fontSize: typography.sizes.md,
    fontWeight: '600',
    color: colors.text,
  },
  customerPhone: {
    fontSize: typography.sizes.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  callButton: {
    padding: spacing.sm,
  },
  messagesList: {
    padding: spacing.md,
    paddingBottom: spacing.lg,
  },
  dateHeader: {
    alignItems: 'center',
    marginVertical: spacing.md,
  },
  dateHeaderText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    marginVertical: spacing.xs,
  },
  inboundBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  outboundBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  messageText: {
    fontSize: typography.sizes.md,
    color: colors.text,
    lineHeight: 22,
  },
  outboundText: {
    color: colors.white,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: spacing.xs,
    gap: 4,
  },
  timeText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
  outboundTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  statusContainer: {
    marginLeft: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyText: {
    fontSize: typography.sizes.md,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sizes.md,
    color: colors.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.textSecondary,
  },
  charCount: {
    position: 'absolute',
    right: 70,
    bottom: 64,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  charCountText: {
    fontSize: typography.sizes.xs,
    color: colors.textSecondary,
  },
});
