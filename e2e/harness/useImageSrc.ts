// A plain stone-floor picture standing in for the map image (20 × 14 squares).
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="980"><defs><pattern id="f" width="70" height="70" patternUnits="userSpaceOnUse"><rect width="70" height="70" fill="#5b5446"/><rect x="2" y="2" width="66" height="66" fill="#6b6352"/></pattern></defs><rect width="1400" height="980" fill="url(#f)"/><rect x="0" y="0" width="1400" height="140" fill="#2b2620"/><rect x="0" y="840" width="1400" height="140" fill="#2b2620"/><circle cx="1050" cy="300" r="90" fill="#3d6b7a" opacity=".6"/></svg>`;
const map = 'data:image/svg+xml;base64,' + btoa(svg);
export function useImageSrc(ref: string | null | undefined) { return { src: ref === 'media:m1' ? map : null, loading: false, error: null } as never; }
