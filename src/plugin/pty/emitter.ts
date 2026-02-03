/**
 * Event emitter for real-time PTY session output streaming.
 * Enables WebSocket connections to subscribe to session output.
 */

export type OutputCallback = (data: string) => void;
export type StateCallback = (status: "running" | "exited" | "killed", exitCode?: number) => void;

class SessionEmitter {
  private outputListeners = new Map<string, Set<OutputCallback>>();
  private stateListeners = new Map<string, Set<StateCallback>>();

  /**
   * Subscribe to output events for a session.
   * @returns Unsubscribe function
   */
  subscribeOutput(sessionId: string, callback: OutputCallback): () => void {
    if (!this.outputListeners.has(sessionId)) {
      this.outputListeners.set(sessionId, new Set());
    }
    this.outputListeners.get(sessionId)!.add(callback);

    return () => {
      this.outputListeners.get(sessionId)?.delete(callback);
      if (this.outputListeners.get(sessionId)?.size === 0) {
        this.outputListeners.delete(sessionId);
      }
    };
  }

  /**
   * Subscribe to state change events for a session.
   * @returns Unsubscribe function
   */
  subscribeState(sessionId: string, callback: StateCallback): () => void {
    if (!this.stateListeners.has(sessionId)) {
      this.stateListeners.set(sessionId, new Set());
    }
    this.stateListeners.get(sessionId)!.add(callback);

    return () => {
      this.stateListeners.get(sessionId)?.delete(callback);
      if (this.stateListeners.get(sessionId)?.size === 0) {
        this.stateListeners.delete(sessionId);
      }
    };
  }

  /**
   * Emit output data to all subscribers.
   */
  emitOutput(sessionId: string, data: string): void {
    const listeners = this.outputListeners.get(sessionId);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(data);
        } catch {
        }
      }
    }
  }

  /**
   * Emit state change to all subscribers.
   */
  emitState(sessionId: string, status: "running" | "exited" | "killed", exitCode?: number): void {
    const listeners = this.stateListeners.get(sessionId);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(status, exitCode);
        } catch {
        }
      }
    }
  }

  /**
   * Clean up all listeners for a session.
   */
  cleanup(sessionId: string): void {
    this.outputListeners.delete(sessionId);
    this.stateListeners.delete(sessionId);
  }

  /**
   * Get subscriber count for a session (useful for debugging).
   */
  getSubscriberCount(sessionId: string): { output: number; state: number } {
    return {
      output: this.outputListeners.get(sessionId)?.size ?? 0,
      state: this.stateListeners.get(sessionId)?.size ?? 0,
    };
  }
}

export const emitter = new SessionEmitter();
