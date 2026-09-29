declare module '*.webp' {
  const url: string;
  export default url;
}

declare module '*?inline' {
  const dataUrl: string;
  export default dataUrl;
}

declare module '*?worker&inline' {
  const InlineWorker: new (options?: { name?: string }) => Worker;
  export default InlineWorker;
}
