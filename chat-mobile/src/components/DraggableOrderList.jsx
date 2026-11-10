import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, View, StyleSheet } from 'react-native';

/**
 * Compute new list index target from vertical center offset against measured row slots.
 */
export function resolveDropIndex(centers = [], fromIdx = 0, currentCenterY = 0) {
  if (!Array.isArray(centers) || centers.length === 0) return fromIdx;
  let bestIdx = fromIdx;
  let bestDist = Infinity;
  for (let i = 0; i < centers.length; i++) {
    const dist = Math.abs(currentCenterY - centers[i]);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function reorderArrayItem(list = [], fromIdx, toIdx) {
  if (
    !Array.isArray(list) ||
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= list.length ||
    toIdx >= list.length ||
    fromIdx === toIdx
  ) {
    return list;
  }
  const next = [...list];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return next;
}

/**
 * Pure React Native touch drag-and-drop vertical list.
 * Uses PanResponder + Animated so it works reliably inside React Native <Modal>
 * on Android, iOS, and Web without extra native portal dependencies.
 */
export default function DraggableOrderList({
  items = [],
  keyExtractor = (item, idx) => String(item?._id ?? item?.id ?? idx),
  renderItem,
  onReorder,
  onDragActiveChange,
  onDragStart,
  contentContainerStyle,
}) {
  const [activeDragIdx, setActiveDragIdx] = useState(-1);
  const [targetDragIdx, setTargetDragIdx] = useState(-1);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const callbacksRef = useRef({ onReorder, onDragActiveChange, onDragStart, keyExtractor });
  callbacksRef.current = { onReorder, onDragActiveChange, onDragStart, keyExtractor };

  const layoutsRef = useRef({});
  const shiftAnimsRef = useRef({});
  const dragY = useRef(new Animated.Value(0)).current;
  const dragScale = useRef(new Animated.Value(1)).current;
  const dragStateRef = useRef(null);
  const panCacheRef = useRef({});

  const getShiftAnim = (key) => {
    if (!shiftAnimsRef.current[key]) {
      shiftAnimsRef.current[key] = new Animated.Value(0);
    }
    return shiftAnimsRef.current[key];
  };

  useEffect(() => {
    // Clean up unused shift animations cleanly when items change
    const activeKeys = new Set(items.map((it, idx) => keyExtractor(it, idx)));
    Object.keys(shiftAnimsRef.current).forEach((k) => {
      if (!activeKeys.has(k)) {
        delete shiftAnimsRef.current[k];
        delete layoutsRef.current[k];
        delete panCacheRef.current[k];
      }
    });
  }, [items, keyExtractor]);

  const computeMetrics = () => {
    const list = itemsRef.current;
    const ke = callbacksRef.current.keyExtractor;
    const fallbackH = 58;
    let runningY = 0;

    return list.map((it, idx) => {
      const k = ke(it, idx);
      const measured = layoutsRef.current[k];
      const y = measured?.y ?? runningY;
      const height = measured?.height ?? fallbackH;
      runningY = y + height;
      return { key: k, y, height, center: y + height / 2 };
    });
  };

  const resetAllAnimations = () => {
    dragY.setValue(0);
    dragScale.setValue(1);
    Object.values(shiftAnimsRef.current).forEach((anim) => {
      anim.stopAnimation();
      anim.setValue(0);
    });
  };

  const animateSiblings = (fromIdx, newTargetIdx, metrics) => {
    const draggedMetric = metrics[fromIdx];
    const nextMetric = metrics[fromIdx + 1];
    const prevMetric = metrics[fromIdx - 1];
    const slotStep = nextMetric
      ? nextMetric.y - draggedMetric.y
      : prevMetric
      ? draggedMetric.y - prevMetric.y
      : draggedMetric.height;

    metrics.forEach((m, i) => {
      if (i === fromIdx) return;
      let shift = 0;
      if (fromIdx < newTargetIdx && i > fromIdx && i <= newTargetIdx) {
        shift = -slotStep;
      } else if (fromIdx > newTargetIdx && i < fromIdx && i >= newTargetIdx) {
        shift = slotStep;
      }
      Animated.timing(getShiftAnim(m.key), {
        toValue: shift,
        duration: 130,
        useNativeDriver: true,
      }).start();
    });
  };

  const finishDrag = () => {
    const ds = dragStateRef.current;
    dragStateRef.current = null;
    setActiveDragIdx(-1);
    setTargetDragIdx(-1);
    callbacksRef.current.onDragActiveChange?.(false);
    resetAllAnimations();

    if (ds && ds.fromIdx !== ds.targetIdx) {
      const reordered = reorderArrayItem(itemsRef.current, ds.fromIdx, ds.targetIdx);
      callbacksRef.current.onReorder?.(reordered);
    }
  };

  const getPanResponder = (itemKey) => {
    if (panCacheRef.current[itemKey]) return panCacheRef.current[itemKey];

    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => itemsRef.current.length > 1,
      onStartShouldSetPanResponderCapture: () => itemsRef.current.length > 1,
      onMoveShouldSetPanResponder: () => itemsRef.current.length > 1,
      onMoveShouldSetPanResponderCapture: () => itemsRef.current.length > 1,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,

      onPanResponderGrant: () => {
        const list = itemsRef.current;
        const ke = callbacksRef.current.keyExtractor;
        const fromIdx = list.findIndex((it, idx) => ke(it, idx) === itemKey);
        if (fromIdx < 0 || list.length <= 1) return;

        callbacksRef.current.onDragStart?.(list[fromIdx], fromIdx);
        callbacksRef.current.onDragActiveChange?.(true);

        const metrics = computeMetrics();
        const currentMetric = metrics[fromIdx];
        const firstY = metrics[0]?.y ?? 0;
        const last = metrics[metrics.length - 1];
        const maxBottomY = last ? last.y + last.height : 0;

        dragStateRef.current = {
          fromIdx,
          targetIdx: fromIdx,
          metrics,
          minDy: firstY - currentMetric.y - 8,
          maxDy: maxBottomY - (currentMetric.y + currentMetric.height) + 8,
        };

        setActiveDragIdx(fromIdx);
        setTargetDragIdx(fromIdx);
        dragY.setValue(0);
        Animated.spring(dragScale, {
          toValue: 1.02,
          friction: 7,
          useNativeDriver: true,
        }).start();
      },

      onPanResponderMove: (_, gestureState) => {
        const ds = dragStateRef.current;
        if (!ds) return;

        const clampedDy = Math.max(ds.minDy, Math.min(ds.maxDy, gestureState.dy));
        dragY.setValue(clampedDy);

        const centers = ds.metrics.map((m) => m.center);
        const currentCenterY = ds.metrics[ds.fromIdx].center + clampedDy;
        const nextTargetIdx = resolveDropIndex(centers, ds.fromIdx, currentCenterY);

        if (nextTargetIdx !== ds.targetIdx) {
          ds.targetIdx = nextTargetIdx;
          setTargetDragIdx(nextTargetIdx);
          animateSiblings(ds.fromIdx, nextTargetIdx, ds.metrics);
        }
      },

      onPanResponderRelease: finishDrag,
      onPanResponderTerminate: finishDrag,
    });

    panCacheRef.current[itemKey] = responder;
    return responder;
  };

  return (
    <View style={[styles.container, contentContainerStyle]}>
      {items.map((item, index) => {
        const key = keyExtractor(item, index);
        const isDragging = activeDragIdx === index;
        const isDropSlot = activeDragIdx !== -1 && !isDragging && targetDragIdx === index;
        const shiftAnim = getShiftAnim(key);
        const responder = getPanResponder(key);

        return (
          <Animated.View
            key={key}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              layoutsRef.current[key] = { y, height };
            }}
            style={[
              isDragging ? styles.draggingRow : styles.row,
              {
                transform: isDragging
                  ? [{ translateY: dragY }, { scale: dragScale }]
                  : [{ translateY: shiftAnim }],
              },
            ]}
          >
            {renderItem({
              item,
              index,
              isDragging,
              isDropSlot,
              dragHandleProps: responder.panHandlers,
            })}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  row: {
    zIndex: 1,
  },
  draggingRow: {
    zIndex: 999,
    elevation: 10,
  },
});
