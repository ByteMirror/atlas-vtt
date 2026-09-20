import { EventEmitter } from 'events';

/**
 * Simple shared event bus type used by legacy tool/renderer classes.
 */
export class EventBus extends EventEmitter {}
