// This test runs in Node and reads the stylesheet; nothing of it is bundled.
// eslint-disable-next-line no-restricted-imports
import { readFileSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';
import { agentShellLightColors } from './theme';

function cssColorValues(): string[] {
  const css = readFileSync(join(__dirname, 'agent-shell.css'), 'utf8');
  return [...css.matchAll(/(?:--[\w-]+|color|box-shadow)\s*:\s*([^;]+);/g)]
    .map(match => match[1].replace(/\s+/g, ' ').trim())
    .filter(value => value !== 'none' && !value.includes('Roboto'));
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('agentShellLightColors', () => {
  it('marks the current rail item at 3:1 or more against its background', () => {
    expect(
      contrast(
        agentShellLightColors.railItemActiveBar,
        agentShellLightColors.railItemActive,
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it('draws the focus ring at 3:1 or more against the background', () => {
    expect(
      contrast(
        agentShellLightColors.focusRing,
        agentShellLightColors.background,
      ),
    ).toBeGreaterThanOrEqual(3);
  });

  it('lists the light palette by role', () => {
    expect(agentShellLightColors).toEqual({
      primary: '#002645',
      primaryHover: '#001b31',
      primaryPressed: '#00111f',
      onPrimary: '#ffffff',
      text: '#002645',
      textSecondary: '#5b6c79',
      link: '#00609c',
      linkHover: '#002645',
      accent: '#009fff',
      accentHover: '#0088db',
      focusRing: '#00609c',
      background: '#ffffff',
      surface: '#ffffff',
      subtleSurface: '#f0f4f6',
      border: '#e3ebef',
      borderStrong: '#d6e1e7',
      divider: '#edf2f5',
      overlayShadow: '0 12px 32px rgba(0, 38, 69, 0.14)',
      railBackground: '#f0f7f9',
      railItemHover: '#e2ecf0',
      railItemActive: '#ffffff',
      railItemActiveBorder: '#dfe7ec',
      railItemActiveBar: '#00609c',
      avatarBackground: '#002645',
      avatarText: '#ffffff',
      success: '#1f9d48',
      successBackground: '#ddf5e3',
      successText: '#14612a',
      warning: '#e86d00',
      warningBackground: '#ffe9d6',
      warningText: '#8f4000',
      warningBorder: '#f2c9a3',
      error: '#c6283a',
      running: '#009fff',
      infoBackground: '#dff1ff',
      infoText: '#004a7a',
      bodyText: '#1b3850',
      quietText: '#30475a',
      chipBorder: '#dfe7ec',
      chipBorderHover: '#b9c8d2',
      cardBorderHover: '#c4d3dc',
      composerShadow:
        '0 1px 2px rgba(0, 38, 69, 0.04), 0 8px 24px rgba(0, 38, 69, 0.06)',
      settledStatus: '#9fb2c0',
    });
  });

  it('is the only source of the colours in agent-shell.css', () => {
    const tableValues = new Set<string>(Object.values(agentShellLightColors));
    const cssValues = new Set(cssColorValues());

    expect([...cssValues].filter(value => !tableValues.has(value))).toEqual([]);
    expect(
      Object.entries(agentShellLightColors)
        .filter(([, value]) => !cssValues.has(value))
        .map(([role]) => role),
    ).toEqual(['divider']);
  });
});
