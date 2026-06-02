export function hexToRgb(hex = '#000') {
  const clean = String(hex).replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  return {
    r: (int >> 16) & 255,
    g: (int >> 8) & 255,
    b: int & 255,
  };
}

export function hexToRgba(hex = '#000', alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function rnShadowToBoxShadow(shadowColor = '#000', shadowOffset = { width: 0, height: 0 }, shadowOpacity = 0.2, shadowRadius = 4) {
  const x = (shadowOffset && shadowOffset.width) || 0;
  const y = (shadowOffset && shadowOffset.height) || 0;
  const blur = shadowRadius || 0;
  const color = hexToRgba(shadowColor || '#000', shadowOpacity ?? 1);
  return `${x}px ${y}px ${blur}px ${color}`;
}

export default rnShadowToBoxShadow;
