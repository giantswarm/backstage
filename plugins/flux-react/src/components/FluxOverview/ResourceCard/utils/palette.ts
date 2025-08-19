const baseColors: Record<string, { light: string; dark: string }> = {
  default: { light: '#ffffff', dark: '#424242' },
  error: { light: '#ffe6e6', dark: '#693636' },
  inactive: { light: '#e0e0e0', dark: '#3c3c3c' },
};

export function getColor(colorName: string, type: 'light' | 'dark') {
  const baseColor = baseColors[colorName] ?? baseColors.gray;

  return baseColor[type];
}
