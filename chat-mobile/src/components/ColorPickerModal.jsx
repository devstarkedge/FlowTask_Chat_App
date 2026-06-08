import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Dimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/* ── HSV ↔ RGB helpers ── */
const hsvToRgb = (h, s, v) => {
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const map = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ];
  const [r, g, b] = map[i];
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255),
  };
};

const rgbToHsv = (r, g, b) => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
};

const rgbToHex = (r, g, b) =>
  "#" +
  ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

const hexToRgb = (hex) => {
  if (!hex) return { r: 180, g: 60, b: 60 };
  let s = hex.replace("#", "");
  if (s.length === 3)
    s = s
      .split("")
      .map((c) => c + c)
      .join("");
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return { r: 180, g: 60, b: 60 };
  const num = parseInt(s, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

/* ── Layout ── */
const { width: SCREEN_W } = Dimensions.get("window");
const PANEL_SIZE = Math.min(SCREEN_W - 64, 300);
const HUE_H = 22;

const ColorPickerModal = ({
  visible,
  onClose,
  onApply,
  initialHex,
  onPreview,
}) => {
  const initRgb = hexToRgb(initialHex);
  const initHsv = rgbToHsv(initRgb.r, initRgb.g, initRgb.b);

  const [hsv, setHsv] = useState({
    h: initHsv.h,
    s: Math.max(initHsv.s, 0.6),
    v: Math.max(initHsv.v, 0.6),
  });

  // Use refs so PanResponder closures always see latest values
  const hsvRef = useRef(hsv);
  const onPreviewRef = useRef(onPreview);
  const savedHsvRef = useRef(null);

  useEffect(() => {
    hsvRef.current = hsv;
  }, [hsv]);
  useEffect(() => {
    onPreviewRef.current = onPreview;
  }, [onPreview]);

  const firePreview = useCallback((nextHsv) => {
    const rgb = hsvToRgb(nextHsv.h, nextHsv.s, nextHsv.v);
    onPreviewRef.current?.(rgbToHex(rgb.r, rgb.g, rgb.b));
  }, []);

  useEffect(() => {
    if (visible) {
      const rgb = hexToRgb(initialHex);
      const h = rgbToHsv(rgb.r, rgb.g, rgb.b);
      const next = { h: h.h, s: Math.max(h.s, 0.6), v: Math.max(h.v, 0.6) };
      setHsv(next);
      savedHsvRef.current = { ...next };
    }
  }, [visible, initialHex]);

  /* ── Saturation / Brightness pan ── */
  const handleSatMove = useCallback(
    (x, y) => {
      const s = Math.max(0, Math.min(1, x / PANEL_SIZE));
      const v = Math.max(0, Math.min(1, 1 - y / PANEL_SIZE));
      const next = { ...hsvRef.current, s, v };
      setHsv(next);
      firePreview(next);
    },
    [firePreview],
  );

  const satResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) =>
        handleSatMove(e.nativeEvent.locationX, e.nativeEvent.locationY),
      onPanResponderMove: (e) =>
        handleSatMove(e.nativeEvent.locationX, e.nativeEvent.locationY),
    }),
  ).current;

  /* ── Hue slider pan ── */
  const handleHueMove = useCallback(
    (x) => {
      const h = Math.max(0, Math.min(359, (x / PANEL_SIZE) * 360));
      const next = { ...hsvRef.current, h };
      setHsv(next);
      firePreview(next);
    },
    [firePreview],
  );

  const hueResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => handleHueMove(e.nativeEvent.locationX),
      onPanResponderMove: (e) => handleHueMove(e.nativeEvent.locationX),
    }),
  ).current;

  const curRgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const curHex = rgbToHex(curRgb.r, curRgb.g, curRgb.b);
  const pureHueRgb = hsvToRgb(hsv.h, 1, 1);
  const pureHueHex = rgbToHex(pureHueRgb.r, pureHueRgb.g, pureHueRgb.b);

  const satX = hsv.s * PANEL_SIZE;
  const satY = (1 - hsv.v) * PANEL_SIZE;
  const hueX = (hsv.h / 360) * PANEL_SIZE;

  const handleApply = () => onApply(curHex);
  const handleCancel = () => {
    if (savedHsvRef.current) {
      const rgb = hsvToRgb(
        savedHsvRef.current.h,
        savedHsvRef.current.s,
        savedHsvRef.current.v,
      );
      onPreview?.(rgbToHex(rgb.r, rgb.g, rgb.b));
    }
    onClose();
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Choose Accent Color</Text>

          {/* ── Saturation / Brightness square ── */}
          <View
            style={[styles.satWrap, { width: PANEL_SIZE, height: PANEL_SIZE }]}
            {...satResponder.panHandlers}
          >
            <LinearGradient
              colors={["#FFFFFF", pureHueHex]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <LinearGradient
              colors={["rgba(0,0,0,0)", "rgba(0,0,0,1)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                styles.circleSelector,
                { left: satX - 14, top: satY - 14 },
              ]}
            />
          </View>

          {/* ── Hue slider ── */}
          <View
            style={[styles.hueWrap, { width: PANEL_SIZE, height: HUE_H }]}
            {...hueResponder.panHandlers}
          >
            <LinearGradient
              colors={[
                "#FF0000",
                "#FFFF00",
                "#00FF00",
                "#00FFFF",
                "#0000FF",
                "#FF00FF",
                "#FF0000",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[styles.hueSelector, { left: Math.max(0, hueX - 10) }]}
            />
          </View>

          {/* ── Live preview + hex + rgb ── */}
          <View style={styles.infoRow}>
            <View style={[styles.swatch, { backgroundColor: curHex }]} />
            <View style={styles.infoText}>
              <Text style={styles.hexText}>{curHex}</Text>
              <Text style={styles.rgbText}>
                R:{curRgb.r} G:{curRgb.g} B:{curRgb.b}
              </Text>
            </View>
          </View>

          {/* ── Actions ── */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyBtn, { backgroundColor: curHex }]}
              onPress={handleApply}
              activeOpacity={0.7}
            >
              <Text style={styles.applyText}>Apply</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  container: {
    width: "92%",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 22,
    alignItems: "center",
    boxShadow: "0px 8px 20px rgba(0, 0, 0, 0.25)",
    elevation: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 18,
  },

  /* Saturation panel */
  satWrap: {
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
  },
  circleSelector: {
    position: "absolute",
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    boxShadow: "0px 2px 6px rgba(0, 0, 0, 0.35)",
    elevation: 6,
  },

  /* Hue bar */
  hueWrap: {
    marginTop: 18,
    borderRadius: 11,
    overflow: "hidden",
    position: "relative",
  },
  hueSelector: {
    position: "absolute",
    top: -4,
    width: 20,
    height: HUE_H + 8,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    boxShadow: "0px 1px 4px rgba(0, 0, 0, 0.3)",
    elevation: 5,
  },

  /* Info row */
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    width: "100%",
    gap: 14,
  },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoText: {
    flex: 1,
    gap: 4,
  },
  hexText: {
    fontSize: 17,
    fontWeight: "700",
    fontFamily: "monospace",
    color: "#1F2937",
  },
  rgbText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
    fontFamily: "monospace",
  },

  /* Actions */
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 24,
    width: "100%",
  },
  cancelBtn: {
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4B5563",
  },
  applyBtn: {
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  applyText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

export default ColorPickerModal;
