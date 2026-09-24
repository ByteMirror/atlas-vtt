export interface BundleProgress {
  message: string;
  /** 0..1 */
  fraction: number;
}
export type BundleProgressListener = (progress: BundleProgress) => void;

/** Reports step `index` of `total` as "`verb` 3 of 9 files…", spread over the fraction range `from`..`to`. */
export function reportFileStep(onProgress: BundleProgressListener, verb: string, index: number, total: number, from: number, to: number): void {
  onProgress({ message: `${verb} ${index + 1} of ${total} files…`, fraction: from + (index / Math.max(1, total)) * (to - from) });
}
