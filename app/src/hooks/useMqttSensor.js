import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import  mqtt  from "mqtt";
import { Buffer } from "buffer";
import { MQTT_BROKER_URL, MQTT_TOPIC } from "../services/config.js";

if (typeof global.Buffer === "undefined") {
  global.Buffer = Buffer;
}

const clientOptions = {
  reconnectPeriod: 5000,
  connectTimeout: 30_000,
  protocolVersion: 4,
};

export function useMqttSensor() {
  const [state, setState] = useState({
    temperature: null,
    timestamp: null,
    // Starts as "connecting", not "disconnected": on first mount the socket has
    // not failed yet, and a red Offline chip before the first attempt reads as a
    // fault that is not there.
    connectionState: "connecting",
    error: null,
  });

  const clientRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    if (!MQTT_BROKER_URL || !MQTT_TOPIC) {
      setState((prev) => ({
        ...prev,
        error: "MQTT configuration missing. Update app.json",
      }));
      return;
    }

    const clientId = `rn-monitor-${Math.random().toString(16).slice(2)}`;
    const client = mqtt.connect(MQTT_BROKER_URL, {
      ...clientOptions,
      clientId,
      clean: true,
    });
    clientRef.current = client;

    const handleAppStateChange = (nextAppState) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
        client.reconnect();
      }
      appStateRef.current = nextAppState;
    };

  const subscription = AppState.addEventListener("change", handleAppStateChange);

    client.on("connect", () => {
      setState((prev) => ({ ...prev, connectionState: "connected", error: null }));
      client.subscribe(MQTT_TOPIC, { qos: 0 }, (err) => {
        if (err) {
          setState((prev) => ({ ...prev, error: err.message }));
        }
      });
    });

    client.on("reconnect", () => {
      setState((prev) => ({ ...prev, connectionState: "reconnecting" }));
    });

    // Without these, a dropped socket leaves the state at "connected" until the
    // first reconnect attempt 5 s later, so the chip claims a live feed while
    // nothing is arriving. mqtt.js emits "close" then "offline" on a drop.
    client.on("close", () => {
      setState((prev) =>
        prev.connectionState === "connected"
          ? { ...prev, connectionState: "disconnected" }
          : prev
      );
    });

    client.on("offline", () => {
      setState((prev) => ({ ...prev, connectionState: "disconnected" }));
    });

    client.on("error", (error) => {
      setState((prev) => ({ ...prev, error: error.message, connectionState: "error" }));
    });

    client.on("message", (_topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        // Coerce rather than trust: a publisher that sends "23.5" as a string
        // would otherwise blank the whole panel, because every consumer checks
        // typeof === "number".
        const reading = Number(payload.temperature);
        setState((prev) => ({
          ...prev,
          temperature: Number.isFinite(reading) ? reading : null,
          timestamp: payload.timestamp ?? new Date().toISOString(),
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({ ...prev, error: error.message }));
      }
    });

    return () => {
      subscription.remove();
      client.end(true);
    };
  }, []);

  return state;
}
