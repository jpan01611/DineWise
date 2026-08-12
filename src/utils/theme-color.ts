export function normalizeHex(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`;
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return null;
}

export function contrastColor(hex: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return '#ffffff';
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#ffffff';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const clean = normalized.slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const fgLum = relativeLuminance(foregroundHex);
  const bgLum = relativeLuminance(backgroundHex);
  if (fgLum === null || bgLum === null) return 1;
  const lighter = Math.max(fgLum, bgLum);
  const darker = Math.min(fgLum, bgLum);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickReadableColor(backgroundHex: string, candidates: string[], minimumRatio = 4.5): string {
  const validCandidates = candidates
    .map((candidate) => normalizeHex(candidate) || '')
    .filter(Boolean);

  if (!validCandidates.length) {
    return contrastColor(backgroundHex);
  }

  let best = validCandidates[0];
  let bestRatio = contrastRatio(best, backgroundHex);

  for (const candidate of validCandidates.slice(1)) {
    const ratio = contrastRatio(candidate, backgroundHex);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      best = candidate;
    }
  }

  if (bestRatio < minimumRatio) {
    const fallback = contrastColor(backgroundHex);
    const fallbackRatio = contrastRatio(fallback, backgroundHex);
    return fallbackRatio >= bestRatio ? fallback : best;
  }

  return best;
}
