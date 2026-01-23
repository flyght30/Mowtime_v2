/**
 * Dispatch WebSocket Hook
 * Real-time updates for dispatch board with auto-reconnection
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../constants/config';

interface WebSocketMessage {
  type: 'tech_location' | 'tech_status' | 'job_assigned' | 'job_status' | 'connected' | 'pong';
  data: any;
  timestamp?: string;
}

interface TechLocationUpdate {
  tech_id: string;
  latitude: number;
  longitude: number;
  status: string;
}

interface TechStatusUpdate {
  tech_id: string;
  status: string;
  job_id?: string;
}

interface JobAssignedUpdate {
  job_id: string;
  tech_id: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
}

interface JobStatusUpdate {
  job_id: string;
  status: string;
  tech_id?: string;
}

interface UseDispatchWebSocketOptions {
  businessId: string;
  onTechLocation?: (data: TechLocationUpdate) => void;
  onTechStatus?: (data: TechStatusUpdate) => void;
  onJobAssigned?: (data: JobAssignedUpdate) => void;
  onJobStatus?: (data: JobStatusUpdate) => void;
  onConnectionChange?: (connected: boolean) => void;
}

interface UseDispatchWebSocketReturn {
  connected: boolean;
  reconnecting: boolean;
  reconnectAttempts: number;
  lastMessage: WebSocketMessage | null;
  connect: () => void;
  disconnect: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const PING_INTERVAL = 30000; // 30 seconds

export function useDispatchWebSocket({
  businessId,
  onTechLocation,
  onTechStatus,
  onJobAssigned,
  onJobStatus,
  onConnectionChange,
}: UseDispatchWebSocketOptions): UseDispatchWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isManualDisconnect = useRef(false);

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = useCallback((attempt: number): number => {
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, attempt);
    return Math.min(delay, MAX_RECONNECT_DELAY);
  }, []);

  // Clean up timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  // Handle incoming messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      setLastMessage(message);

      switch (message.type) {
        case 'tech_location':
          onTechLocation?.(message.data);
          break;
        case 'tech_status':
          onTechStatus?.(message.data);
          break;
        case 'job_assigned':
          onJobAssigned?.(message.data);
          break;
        case 'job_status':
          onJobStatus?.(message.data);
          break;
        case 'connected':
          console.log('[WS] Connected to dispatch', message.data);
          break;
        case 'pong':
          // Heartbeat response, connection is alive
          break;
      }
    } catch (error) {
      console.error('[WS] Failed to parse message:', error);
    }
  }, [onTechLocation, onTechStatus, onJobAssigned, onJobStatus]);

  // Start ping interval to keep connection alive
  const startPingInterval = useCallback(() => {
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL);
  }, []);

  // Connect to WebSocket
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }

    isManualDisconnect.current = false;

    try {
      // Get auth token
      const token = await AsyncStorage.getItem('access_token');
      if (!token) {
        console.error('[WS] No auth token available');
        return;
      }

      // Build WebSocket URL
      const wsUrl = API_URL.replace('http', 'ws').replace('/api/v1', '');
      const url = `${wsUrl}/ws/dispatch/${businessId}?token=${token}`;

      console.log('[WS] Connecting to:', url.replace(token, '***'));

      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        console.log('[WS] Connected');
        setConnected(true);
        setReconnecting(false);
        setReconnectAttempts(0);
        onConnectionChange?.(true);
        startPingInterval();
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onerror = (error) => {
        console.error('[WS] Error:', error);
      };

      wsRef.current.onclose = (event) => {
        console.log('[WS] Closed:', event.code, event.reason);
        setConnected(false);
        onConnectionChange?.(false);
        clearTimers();

        // Auto-reconnect unless manually disconnected
        if (!isManualDisconnect.current && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          setReconnecting(true);
          const delay = getReconnectDelay(reconnectAttempts);
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connect();
          }, delay);
        } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[WS] Max reconnect attempts reached');
          setReconnecting(false);
        }
      };
    } catch (error) {
      console.error('[WS] Connection error:', error);
    }
  }, [businessId, handleMessage, startPingInterval, clearTimers, getReconnectDelay, reconnectAttempts, onConnectionChange]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    isManualDisconnect.current = true;
    clearTimers();

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setConnected(false);
    setReconnecting(false);
    setReconnectAttempts(0);
    onConnectionChange?.(false);
  }, [clearTimers, onConnectionChange]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (businessId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [businessId]); // Only depend on businessId to avoid reconnecting on every render

  return {
    connected,
    reconnecting,
    reconnectAttempts,
    lastMessage,
    connect,
    disconnect,
  };
}

export default useDispatchWebSocket;
