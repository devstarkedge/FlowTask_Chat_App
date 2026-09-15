import { describe, expect, it } from "vitest";
import {
  advanceMessageItemIndex,
  getVirtuosoMessageKey,
  INITIAL_MESSAGE_ITEM_INDEX,
} from "./virtuosoMessageIndex";

const rows = (...ids) => ids.map((_id) => ({ _id }));

describe("Virtuoso message first item index", () => {
  it("stays stable when a message is appended", () => {
    const initial = advanceMessageItemIndex(
      null,
      "channel-1",
      rows("date", "message-1"),
      "message-1",
    );
    const appended = advanceMessageItemIndex(
      initial,
      "channel-1",
      rows("date", "message-1", "message-2"),
      "message-1",
    );

    expect(appended.firstItemIndex).toBe(INITIAL_MESSAGE_ITEM_INDEX);
  });

  it("decreases only by rows prepended above the previous anchor", () => {
    const initial = advanceMessageItemIndex(
      null,
      "channel-1",
      rows("date-today", "message-2"),
      "message-2",
    );
    const prepended = advanceMessageItemIndex(
      initial,
      "channel-1",
      rows("date-yesterday", "message-1", "date-today", "message-2"),
      "message-1",
    );

    expect(prepended.firstItemIndex).toBe(INITIAL_MESSAGE_ITEM_INDEX - 2);
  });

  it("resets for a different channel", () => {
    const previous = {
      channelId: "channel-1",
      firstMessageId: "message-1",
      anchorIndex: 1,
      firstItemIndex: INITIAL_MESSAGE_ITEM_INDEX - 10,
    };

    const next = advanceMessageItemIndex(
      previous,
      "channel-2",
      rows("date", "message-2"),
      "message-2",
    );
    expect(next.firstItemIndex).toBe(INITIAL_MESSAGE_ITEM_INDEX);
  });
});

describe("Virtuoso message keys", () => {
  it("keeps the optimistic row key after server reconciliation", () => {
    const optimistic = { _id: "temp-1" };
    const reconciled = { _id: "message-1", _virtuosoKey: "temp-1" };

    expect(getVirtuosoMessageKey(10, optimistic)).toBe("temp-1");
    expect(getVirtuosoMessageKey(10, reconciled)).toBe("temp-1");
  });

  it("falls back to the row index for non-message rows without an id", () => {
    expect(getVirtuosoMessageKey(10, {})).toBe(10);
  });
});
