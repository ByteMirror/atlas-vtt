declare module '*.webp' {
  const url: string;
  export default url;
}

declare module '*?inline' {
  const dataUrl: string;
  export default dataUrl;
}
