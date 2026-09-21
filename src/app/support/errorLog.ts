import { describeError } from '../utils/errors';

export interface LoggedError {
  /** Local wall-clock time, HH:MM:SS. */
  at: string;
  message: string;
}

const ATLAS_PREFIX = '[Atlas]';
const MAX_MESSAGE_LENGTH = 400;

function isAtlasStack(value: unknown): boolean {
  return value instanceof Error && typeof value.stack === 'string' && value.stack.includes('atlas-vtt');
}

function timestamp(): string {
  return new Date().toTimeString().slice(0, 8);
}

function describeArguments(args: unknown[]): string {
  return args.map(arg => (typeof arg === 'string' ? arg : describeError(arg))).join(' ');
}

/**
 * Keeps the most recent Atlas error messages so an issue report can include
 * them. Only `[Atlas]`-prefixed console errors and uncaught errors whose stack
 * points into this plugin are recorded; message text is truncated and no
 * stack frames are kept.
 */
export class AtlasErrorLog {
  private readonly entries: LoggedError[] = [];

  constructor(private readonly limit = 10) {}

  /** Starts recording; the returned function restores `console.error` and removes the listeners. */
  attach(target: Window = window): () => void {
    const originalError = console.error;
    console.error = (...args: unknown[]): void => {
      if (typeof args[0] === 'string' && args[0].startsWith(ATLAS_PREFIX)) this.record(describeArguments(args));
      originalError.apply(console, args);
    };
    const onError = (event: ErrorEvent): void => {
      if (isAtlasStack(event.error)) this.record(event.message);
    };
    const onRejection = (event: PromiseRejectionEvent): void => {
      if (isAtlasStack(event.reason)) this.record(`Unhandled rejection: ${describeError(event.reason)}`);
    };
    target.addEventListener('error', onError);
    target.addEventListener('unhandledrejection', onRejection);
    return () => {
      console.error = originalError;
      target.removeEventListener('error', onError);
      target.removeEventListener('unhandledrejection', onRejection);
    };
  }

  recent(): LoggedError[] {
    return [...this.entries];
  }

  private record(message: string): void {
    // Cut before normalising so an error storm with huge payloads stays cheap.
    const text = message.slice(0, MAX_MESSAGE_LENGTH * 2).replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!text) return;
    this.entries.push({ at: timestamp(), message: text });
    if (this.entries.length > this.limit) this.entries.shift();
  }
}

export function formatErrors(errors: LoggedError[]): string {
  return errors.map(error => `${error.at} ${error.message}`).join('\n');
}
