/** Runtime files for the archived PlayCanvas prototype only. */
export const LEGACY_ASSET_BASE = `${import.meta.env.BASE_URL}legacy/assets/`;

export const legacyAsset = (path: string): string => `${LEGACY_ASSET_BASE}${path}`;
