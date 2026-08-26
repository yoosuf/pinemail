import { useEffect, useRef } from "react";
import type { ServerEvent } from "./types";

export function useServerEvents(onEvent: (event: ServerEvent) => void) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;

    function connect() {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${window.location.host}/api/events`);

      socket.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as ServerEvent;
          handlerRef.current(event);
        } catch {
          // ignore malformed events
        }
      };

      socket.onclose = () => {
        if (!closedByUs) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };
    }

    connect();

    return () => {
      closedByUs = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);
}
