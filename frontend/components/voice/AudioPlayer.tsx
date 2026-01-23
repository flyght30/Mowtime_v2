/**
 * AudioPlayer Component
 * Reusable audio playback component for voice calls and recordings
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';

interface AudioPlayerProps {
  uri: string;
  duration?: number; // Total duration in seconds
  compact?: boolean;
  autoPlay?: boolean;
  onPlaybackComplete?: () => void;
  onError?: (error: string) => void;
}

export default function AudioPlayer({
  uri,
  duration: totalDuration,
  compact = false,
  autoPlay = false,
  onPlaybackComplete,
  onError,
}: AudioPlayerProps) {
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(totalDuration || 0);
  const [error, setError] = useState<string | null>(null);

  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    if (autoPlay) {
      loadAndPlay();
    }

    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [uri]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const loadAndPlay = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Unload previous sound
      if (sound) {
        await sound.unloadAsync();
      }

      // Set audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      // Load new sound
      const { sound: newSound, status } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setIsPlaying(true);

      if (status.isLoaded && status.durationMillis) {
        setDuration(status.durationMillis / 1000);
      }
    } catch (err: any) {
      console.error('Failed to load audio:', err);
      setError('Failed to load audio');
      onError?.(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const onPlaybackStatusUpdate = (status: any) => {
    if (status.isLoaded) {
      setPosition(status.positionMillis / 1000);
      setIsPlaying(status.isPlaying);

      if (status.durationMillis && !duration) {
        setDuration(status.durationMillis / 1000);
      }

      if (status.didJustFinish) {
        setIsPlaying(false);
        setPosition(0);
        onPlaybackComplete?.();
      }
    }
  };

  const togglePlayPause = async () => {
    if (!sound) {
      await loadAndPlay();
      return;
    }

    try {
      if (isPlaying) {
        await sound.pauseAsync();
      } else {
        // If at end, restart
        if (position >= duration - 0.5) {
          await sound.setPositionAsync(0);
        }
        await sound.playAsync();
      }
    } catch (err) {
      console.error('Playback error:', err);
    }
  };

  const seekTo = async (seconds: number) => {
    if (sound) {
      try {
        await sound.setPositionAsync(seconds * 1000);
        setPosition(seconds);
      } catch (err) {
        console.error('Seek error:', err);
      }
    }
  };

  const skip = async (seconds: number) => {
    const newPosition = Math.max(0, Math.min(duration, position + seconds));
    await seekTo(newPosition);
  };

  const progress = duration > 0 ? (position / duration) * 100 : 0;

  if (compact) {
    return (
      <TouchableOpacity
        style={styles.compactContainer}
        onPress={togglePlayPause}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={20}
            color={Colors.primary}
          />
        )}
        <View style={styles.compactProgress}>
          <View style={[styles.compactProgressFill, { width: `${progress}%` }]} />
        </View>
        <Text style={styles.compactTime}>
          {formatTime(position)}/{formatTime(duration)}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle" size={24} color={Colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadAndPlay}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Progress bar */}
          <TouchableOpacity
            style={styles.progressContainer}
            onPress={(e) => {
              const { locationX } = e.nativeEvent;
              const width = 280; // Approximate width
              const percent = locationX / width;
              seekTo(percent * duration);
            }}
            activeOpacity={0.8}
          >
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progress}%` }]} />
              <View
                style={[
                  styles.progressHandle,
                  { left: `${Math.min(progress, 98)}%` },
                ]}
              />
            </View>
          </TouchableOpacity>

          {/* Time display */}
          <View style={styles.timeContainer}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={styles.skipButton}
              onPress={() => skip(-10)}
              disabled={isLoading}
            >
              <Ionicons name="play-back" size={24} color={Colors.textSecondary} />
              <Text style={styles.skipText}>10s</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.playButton}
              onPress={togglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="large" color={Colors.white} />
              ) : (
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={32}
                  color={Colors.white}
                />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.skipButton}
              onPress={() => skip(10)}
              disabled={isLoading}
            >
              <Ionicons name="play-forward" size={24} color={Colors.textSecondary} />
              <Text style={styles.skipText}>10s</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.md,
  },
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.gray50,
    borderRadius: BorderRadius.sm,
  },
  compactProgress: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.gray200,
    borderRadius: 2,
  },
  compactProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  compactTime: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    minWidth: 60,
    textAlign: 'right',
  },
  progressContainer: {
    marginBottom: Spacing.sm,
  },
  progressBar: {
    height: 6,
    backgroundColor: Colors.gray200,
    borderRadius: 3,
    position: 'relative',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  progressHandle: {
    position: 'absolute',
    top: -5,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.primary,
    marginLeft: -8,
  },
  timeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  timeText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.textSecondary,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
  },
  skipButton: {
    alignItems: 'center',
  },
  skipText: {
    fontSize: Typography.fontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  errorText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.error,
  },
  retryText: {
    fontSize: Typography.fontSize.sm,
    color: Colors.primary,
    fontWeight: Typography.fontWeight.medium,
  },
});
