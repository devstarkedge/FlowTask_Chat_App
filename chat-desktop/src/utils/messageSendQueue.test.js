import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  enqueueMessageSend,
  nextOptimisticTimestamp,
  resetMessageSendQueueForTests,
} from "./messageSendQueue";

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("message send ordering", () => {
  beforeEach(() => {
    resetMessageSendQueueForTests();
    vi.restoreAllMocks();
  });

  it("creates strictly increasing timestamps for same-tick sends", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);

    const timestamps = [
      nextOptimisticTimestamp(),
      nextOptimisticTimestamp(),
      nextOptimisticTimestamp(),
    ].map(Date.parse);

    expect(timestamps).toEqual([
      1_700_000_000_000,
      1_700_000_000_001,
      1_700_000_000_002,
    ]);
  });

  it("runs sends sequentially within one conversation", async () => {
    const gate = deferred();
    const calls = [];
    const first = enqueueMessageSend("channel-1", async () => {
      calls.push("first:start");
      await gate.promise;
      calls.push("first:end");
      return "first";
    });
    const second = enqueueMessageSend("channel-1", () => {
      calls.push("second");
      return "second";
    });

    await Promise.resolve();
    expect(calls).toEqual(["first:start"]);
    gate.resolve();
    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    expect(calls).toEqual(["first:start", "first:end", "second"]);
  });

  it("continues after failure and does not block another conversation", async () => {
    const failed = enqueueMessageSend("channel-1", () =>
      Promise.reject(new Error("failed")),
    );
    const next = enqueueMessageSend("channel-1", () => "next");
    const independent = enqueueMessageSend("channel-2", () => "independent");

    await expect(independent).resolves.toBe("independent");
    await expect(failed).rejects.toThrow("failed");
    await expect(next).resolves.toBe("next");
  });
});
