const baseColors: Record<string, { light: string; dark: string }> = {
  gray: { light: '#F8F8F8', dark: '#333333' },
  red: { light: '#f3b7bb', dark: '#a03538' },
  orange: { light: '#fccfb3', dark: '#aa6343' },
  yellow: { light: '#f7f7c9', dark: '#95872c' },
  green: { light: '#ccfbca', dark: '#366c29' },
  teal: { light: '#c1f5ef', dark: '#2e6a6c' },
  blue: { light: '#bacffb', dark: '#2c4f6d' },
  indigo: { light: '#bbbdef', dark: '#40418e' },
  purple: { light: '#ddc3fa', dark: '#704ac0' },
  pink: { light: '#f4bae3', dark: '#8d2f50' },
  brown: { light: '#b0a187', dark: '#614423' },
};

export function getColor(colorName: string, type: 'light' | 'dark') {
  const baseColor = baseColors[colorName] ?? baseColors.gray;

  return baseColor[type];
}
