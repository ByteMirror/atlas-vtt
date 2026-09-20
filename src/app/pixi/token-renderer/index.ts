/**
 * Token Renderer Facade
 * 
 * This module serves as the primary export point for the TokenRenderer functionality.
 * It provides a stable interface that allows us to refactor the internal implementation
 * without affecting consumers of the TokenRenderer API.
 * 
 * Current implementation exports the monolithic TokenRenderer class directly,
 * but this facade enables future refactoring into smaller, focused modules.
 */

// Export the existing TokenRenderer implementation
export { TokenRenderer } from '../TokenRenderer';
