import { describe, test, expect, beforeEach } from "bun:test";
import { emitter } from "./emitter.ts";

describe("SessionEmitter", () => {
  const sessionId = "test_session";

  beforeEach(() => {
    emitter.cleanup(sessionId);
  });

  describe("subscribeOutput", () => {
    test("should call callback when output is emitted", () => {
      const received: string[] = [];
      emitter.subscribeOutput(sessionId, (data) => received.push(data));

      emitter.emitOutput(sessionId, "hello");
      emitter.emitOutput(sessionId, "world");

      expect(received).toEqual(["hello", "world"]);
    });

    test("should support multiple subscribers", () => {
      const received1: string[] = [];
      const received2: string[] = [];

      emitter.subscribeOutput(sessionId, (data) => received1.push(data));
      emitter.subscribeOutput(sessionId, (data) => received2.push(data));

      emitter.emitOutput(sessionId, "test");

      expect(received1).toEqual(["test"]);
      expect(received2).toEqual(["test"]);
    });

    test("should return unsubscribe function", () => {
      const received: string[] = [];
      const unsub = emitter.subscribeOutput(sessionId, (data) => received.push(data));

      emitter.emitOutput(sessionId, "before");
      unsub();
      emitter.emitOutput(sessionId, "after");

      expect(received).toEqual(["before"]);
    });

    test("should not affect other sessions", () => {
      const received1: string[] = [];
      const received2: string[] = [];

      emitter.subscribeOutput("session1", (data) => received1.push(data));
      emitter.subscribeOutput("session2", (data) => received2.push(data));

      emitter.emitOutput("session1", "only for session1");

      expect(received1).toEqual(["only for session1"]);
      expect(received2).toEqual([]);
    });
  });

  describe("subscribeState", () => {
    test("should call callback when state changes", () => {
      const received: Array<{ status: string; exitCode?: number }> = [];
      emitter.subscribeState(sessionId, (status, exitCode) => {
        received.push({ status, exitCode });
      });

      emitter.emitState(sessionId, "exited", 0);
      emitter.emitState(sessionId, "killed");

      expect(received).toEqual([
        { status: "exited", exitCode: 0 },
        { status: "killed", exitCode: undefined },
      ]);
    });

    test("should return unsubscribe function", () => {
      const received: string[] = [];
      const unsub = emitter.subscribeState(sessionId, (status) => received.push(status));

      emitter.emitState(sessionId, "running");
      unsub();
      emitter.emitState(sessionId, "exited", 0);

      expect(received).toEqual(["running"]);
    });
  });

  describe("cleanup", () => {
    test("should remove all listeners for a session", () => {
      const outputReceived: string[] = [];
      const stateReceived: string[] = [];

      emitter.subscribeOutput(sessionId, (data) => outputReceived.push(data));
      emitter.subscribeState(sessionId, (status) => stateReceived.push(status));

      emitter.cleanup(sessionId);

      emitter.emitOutput(sessionId, "ignored");
      emitter.emitState(sessionId, "exited", 0);

      expect(outputReceived).toEqual([]);
      expect(stateReceived).toEqual([]);
    });
  });

  describe("getSubscriberCount", () => {
    test("should return correct counts", () => {
      expect(emitter.getSubscriberCount(sessionId)).toEqual({ output: 0, state: 0 });

      const unsub1 = emitter.subscribeOutput(sessionId, () => {});
      const unsub2 = emitter.subscribeOutput(sessionId, () => {});
      emitter.subscribeState(sessionId, () => {});

      expect(emitter.getSubscriberCount(sessionId)).toEqual({ output: 2, state: 1 });

      unsub1();
      expect(emitter.getSubscriberCount(sessionId)).toEqual({ output: 1, state: 1 });

      unsub2();
      expect(emitter.getSubscriberCount(sessionId)).toEqual({ output: 0, state: 1 });
    });
  });

  describe("error handling", () => {
    test("should continue calling other callbacks if one throws", () => {
      const received: string[] = [];

      emitter.subscribeOutput(sessionId, () => {
        throw new Error("callback error");
      });
      emitter.subscribeOutput(sessionId, (data) => received.push(data));

      emitter.emitOutput(sessionId, "test");

      expect(received).toEqual(["test"]);
    });
  });
});
