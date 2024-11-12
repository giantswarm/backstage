const baseColors: Record<string, { light: string; dark: string }> = {
  gray: { light: '#F8F8F8', dark: '#333333' },
  red: { light: '#FFB3BA', dark: '#B22234' },
  orange: { light: '#FFD8B1', dark: '#FF8C42' },
  yellow: { light: '#FFFFBA', dark: '#BFA900' },
  green: { light: '#BFFCC6', dark: '#228B22' },
  teal: { light: '#B2F7EF', dark: '#008080' },
  blue: { light: '#B5D0FF', dark: '#22577A' },
  indigo: { light: '#C3C9E9', dark: '#3F51B5' },
  purple: { light: '#E2C2FF', dark: '#7C3AED' },
  pink: { light: '#FFB7E5', dark: '#C2185B' },
  brown: { light: '#EAD2B7', dark: '#8D5524' },
};

export function getColor(colorName: string, type: 'light' | 'dark') {
  const baseColor = baseColors[colorName] ?? baseColors.gray;

  return baseColor[type];
}
