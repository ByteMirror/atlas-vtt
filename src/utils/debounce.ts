/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 * 
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns The debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | undefined;

  return function debounced(...args: Parameters<T>) {
    const later = () => {
      timeout = undefined;
      func(...args);
    };

    if (timeout) {
      window.clearTimeout(timeout);
    }
    timeout = window.setTimeout(later, wait);
  };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds.
 * 
 * @param func The function to throttle
 * @param wait The number of milliseconds to throttle invocations to
 * @returns The throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let lastCallTime: number | undefined;
  let lastArgs: Parameters<T> | undefined;
  let timeoutId: number | undefined;

  return function throttled(...args: Parameters<T>) {
    const now = Date.now();
    
    if (lastCallTime === undefined) {
      lastCallTime = now;
      func(...args);
      return;
    }

    const timeSinceLastCall = now - lastCallTime;
    
    if (timeSinceLastCall >= wait) {
      lastCallTime = now;
      func(...args);
    } else {
      lastArgs = args;
      
      if (!timeoutId) {
        timeoutId = window.setTimeout(() => {
          lastCallTime = Date.now();
          timeoutId = undefined;
          if (lastArgs) {
            func(...lastArgs);
            lastArgs = undefined;
          }
        }, wait - timeSinceLastCall);
      }
    }
  };
}

/**
 * Creates a function that only emits events if the distance moved exceeds the threshold
 * 
 * @param func The function to call when distance threshold is met
 * @param threshold The minimum distance in pixels to trigger the function
 * @returns The distance-filtered function
 */
export function distanceThrottle<T extends (x: number, y: number, ...args: any[]) => any>(
  func: T,
  threshold: number
): (x: number, y: number, ...args: Parameters<T> extends [number, number, ...infer Rest] ? Rest : never[]) => void {
  let lastX: number | undefined;
  let lastY: number | undefined;

  return function distanceThrottled(x: number, y: number, ...args: any[]) {
    if (lastX === undefined || lastY === undefined) {
      lastX = x;
      lastY = y;
      func(x, y, ...args);
      return;
    }

    const distance = Math.sqrt((x - lastX) ** 2 + (y - lastY) ** 2);
    
    if (distance >= threshold) {
      lastX = x;
      lastY = y;
      func(x, y, ...args);
    }
  };
}

/**
 * Rate-limited requestAnimationFrame wrapper
 * 
 * @param callback The function to call on the next animation frame
 * @param maxFPS Maximum frames per second (default: 30)
 * @returns Cancel function to stop the scheduled frame
 */
export function requestAnimationFrameThrottled(
  callback: () => void,
  maxFPS: number = 30
): () => void {
  const minInterval = 1000 / maxFPS;
  let lastTime = 0;
  let rafId: number | undefined;

  const throttledCallback = (currentTime: number) => {
    if (currentTime - lastTime >= minInterval) {
      lastTime = currentTime;
      callback();
    }
  };

  rafId = window.requestAnimationFrame(throttledCallback);

  return () => {
    if (rafId !== undefined) {
      window.cancelAnimationFrame(rafId);
      rafId = undefined;
    }
  };
}