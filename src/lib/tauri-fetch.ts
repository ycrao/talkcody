// src/lib/tauri-fetch.ts
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { logger } from './logger';

interface ProxyRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

interface StreamResponse {
  request_id: number;
  status: number;
  headers: Record<string, string>;
}

type StreamEvent = {
  request_id?: number;
  chunk?: number[];
  status?: number;
};

/**
 * Tauri fetch function type that is compatible across different environments
 */
export type TauriFetchFunction = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

/**
 * Create a fetch function that uses Tauri's Rust backend to make HTTP requests with true streaming
 * This bypasses webview CORS restrictions and enables real-time streaming via Tauri events
 */
export function createTauriFetch(): TauriFetchFunction {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const signal = init?.signal;

    // Extract headers
    const headers: Record<string, string> = {
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': navigator.userAgent,
    };

    if (init?.headers) {
      const headerObj = new Headers(init.headers);
      headerObj.forEach((value, key) => {
        headers[key] = value;
      });
    }

    // Extract body
    let body: string | undefined;
    if (init?.body) {
      if (typeof init.body === 'string') {
        body = init.body;
      } else {
        // Convert other body types to string
        body = JSON.stringify(init.body);
      }
    }

    const proxyRequest: ProxyRequest = {
      url,
      method,
      headers,
      body,
    };

    // Setup streaming infrastructure
    let unlisten: UnlistenFn | undefined;

    const ts = new TransformStream();
    const writer = ts.writable.getWriter();

    let closed = false;
    let lastChunkTime = Date.now();
    let streamTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const resetStreamTimeout = () => {
      lastChunkTime = Date.now();
      if (streamTimeoutId) {
        clearTimeout(streamTimeoutId);
      }
      // Check for stream timeout every 60 seconds
      streamTimeoutId = setTimeout(() => {
        const timeSinceLastChunk = Date.now() - lastChunkTime;
        if (!closed && timeSinceLastChunk > 60000) {
          logger.error(
            `[Tauri Fetch] Stream timeout: no data received for ${timeSinceLastChunk}ms`
          );
          close();
        }
      }, 60000);
    };

    const close = () => {
      if (closed) return;
      closed = true;
      if (streamTimeoutId) {
        clearTimeout(streamTimeoutId);
      }
      unlisten?.();
      writer.ready.then(() => {
        writer.close().catch((e) => logger.error('[Tauri Fetch] Error closing writer:', e));
      });
    };

    // Handle abort signal
    if (signal) {
      signal.addEventListener('abort', () => close());
    }

    // Track current request_id (will be set after invoke completes)
    let currentRequestId: number | undefined;
    // Queue events that arrive before request_id is set
    const pendingEvents: StreamEvent[] = [];

    // Process a single stream event
    let chunkCount = 0;
    const processEvent = (payload: StreamEvent) => {
      const { request_id: rid, chunk, status } = payload || {};

      if (currentRequestId !== rid) {
        return;
      }

      if (chunk) {
        chunkCount++;
        // Reset timeout on each chunk received
        resetStreamTimeout();
        // // Log first chunk and every 100th chunk
        // if (chunkCount === 1 || chunkCount % 100 === 0) {
        //   logger.info(
        //     `[Tauri Fetch] Received chunk #${chunkCount} (${chunk.length} bytes) for request_id: ${rid}`
        //   );
        // }
        // Write chunk to stream
        writer.ready.then(() => {
          writer.write(new Uint8Array(chunk)).catch((e) => {
            logger.error('[Tauri Fetch] Error writing chunk:', e);
          });
        });
      } else if (status === 0) {
        // End of stream
        logger.info(
          `[Tauri Fetch] Stream ended for request_id: ${rid} (total chunks: ${chunkCount})`
        );
        close();
      }
    };

    // Listen for streaming events - MUST await to ensure listener is registered
    let totalEventsReceived = 0;
    unlisten = await listen<StreamEvent>('stream-response', (event) => {
      totalEventsReceived++;
      // Log first event received to confirm listener is working
      if (totalEventsReceived === 1) {
        logger.info(
          `[Tauri Fetch] First event received (total: ${totalEventsReceived}), currentRequestId: ${currentRequestId}, event.payload.request_id: ${event.payload?.request_id}`
        );
      }
      if (currentRequestId === undefined) {
        // Request ID not yet set, queue the event
        pendingEvents.push(event.payload);
        logger.info(
          `[Tauri Fetch] Queued event (request_id not set yet), queue size: ${pendingEvents.length}`
        );
      } else {
        processEvent(event.payload);
      }
    });

    try {
      // Invoke stream_fetch command
      const response = await invoke<StreamResponse>('stream_fetch', { request: proxyRequest });

      const { request_id, status, headers: responseHeaders } = response;

      // Set the request ID and process any queued events
      currentRequestId = request_id;
      logger.info(`[Tauri Fetch] Stream started for request_id: ${request_id}`);

      // Start the stream timeout
      resetStreamTimeout();

      // Process any events that arrived before request_id was set
      for (const pendingEvent of pendingEvents) {
        processEvent(pendingEvent);
      }
      pendingEvents.length = 0; // Clear the queue

      // Create Response object with streaming body
      const streamingResponse = new Response(ts.readable, {
        status,
        headers: new Headers(responseHeaders),
      });

      // Auto-close on error status
      if (status >= 300) {
        setTimeout(close, 100);
      }

      return streamingResponse;
    } catch (error) {
      logger.error('[Tauri Fetch] Error:', error);
      close();
      throw new Error(`Tauri fetch failed: ${error}`);
    }
  };
}
