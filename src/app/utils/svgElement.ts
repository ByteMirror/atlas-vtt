const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Creates an SVG element in `doc`, so popout windows get nodes from their own document. */
export function createSvgElement(doc: Document, tag: string, attributes: Record<string, string>): SVGElement {
  const element = doc.createElementNS(SVG_NAMESPACE, tag);
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
  return element;
}
