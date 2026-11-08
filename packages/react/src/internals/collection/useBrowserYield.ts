'use client';
import * as React from 'react';
import { useRefWithInit } from '@base-ui/utils/useRefWithInit';
import { useTimeout } from '@base-ui/utils/useTimeout';

export interface BrowserYield {
  /** Runs `callback` once the browser has had a chance to handle input and paint. */
  schedule: (callback: () => void) => void;
  /** Drops anything scheduled. */
  cancel: () => void;
  /** Changes on every `cancel`, so a loop can tell it was cancelled. */
  token: () => number;
}

/**
 * Schedules work after yielding to the browser. It posts a message rather than starting a timer,
 * since browsers delay nested timers by at least 4 ms.
 */
export function useBrowserYield(): BrowserYield {
  const channelRef = React.useRef<MessageChannel | null>(null);
  const tokenRef = React.useRef(0);
  const timeout = useTimeout();

  React.useEffect(
    () => () => {
      tokenRef.current += 1;
      channelRef.current?.port1.close();
      channelRef.current = null;
    },
    [],
  );

  return useRefWithInit((): BrowserYield => ({
    token: () => tokenRef.current,
    cancel() {
      tokenRef.current += 1;
      timeout.clear();
    },
    schedule(callback) {
      if (typeof MessageChannel === 'undefined') {
        timeout.start(0, callback);
        return;
      }
      if (!channelRef.current) {
        channelRef.current = new MessageChannel();
      }
      channelRef.current.port1.onmessage = () => callback();
      channelRef.current.port2.postMessage(null);
    },
  })).current;
}
