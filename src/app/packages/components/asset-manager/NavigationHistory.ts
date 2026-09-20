/**
 * Manages forward/back navigation through folder history in the asset manager.
 */
export class NavigationHistory {
  private history: (string | null)[] = [];
  private currentIndex: number = -1;

  push(folderId: string | null): void {
    // Remove any forward history when navigating to a new location
    this.history = this.history.slice(0, this.currentIndex + 1);
    this.history.push(folderId);
    this.currentIndex++;
  }

  back(): string | null | undefined {
    if (this.canGoBack()) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return undefined;
  }

  forward(): string | null | undefined {
    if (this.canGoForward()) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return undefined;
  }

  canGoBack(): boolean {
    return this.currentIndex > 0;
  }

  canGoForward(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }
}
