/**
 * The frontmatter fields of a statblock note that may name its artwork, in the
 * order they are read: Fantasy Statblocks' `image` (which Atlas writes when it
 * links a token), a `token` property, and `token-image` of the removed in-house
 * statblocks.
 */
export const STATBLOCK_IMAGE_KEYS = ['image', 'token', 'token-image'] as const;

export type StatblockImageKey = (typeof STATBLOCK_IMAGE_KEYS)[number];
