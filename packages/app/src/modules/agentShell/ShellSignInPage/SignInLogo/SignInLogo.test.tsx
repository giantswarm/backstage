import { renderInTestApp } from '@backstage/frontend-test-utils';
import { UnifiedThemeProvider, themes } from '@backstage/theme';
import { screen } from '@testing-library/react';
import { SignInLogo } from './SignInLogo';

let mockBrandingLoading = false;
const mockBrandingAssets: string[] = [];
jest.mock('../../../branding/useBranding', () => ({
  useBranding: () => ({
    isLoading: mockBrandingLoading,
    hasAsset: (name: string) => mockBrandingAssets.includes(name),
    getAssetUrl: (name: string) => `/api/branding/${name}?v=1`,
  }),
}));

function renderLogo({
  dark = false,
  logoHeight,
}: { dark?: boolean; logoHeight?: number } = {}) {
  return renderInTestApp(
    <UnifiedThemeProvider theme={dark ? themes.dark : themes.light}>
      <div data-testid="slot">
        <SignInLogo />
      </div>
    </UnifiedThemeProvider>,
    {
      config: {
        app: {
          title: 'Acme Portal',
          ...(logoHeight ? { branding: { logo: { height: logoHeight } } } : {}),
        },
      },
    },
  );
}

describe('SignInLogo', () => {
  afterEach(() => {
    mockBrandingLoading = false;
    mockBrandingAssets.length = 0;
  });

  it.each([
    ['light', false],
    ['dark', true],
  ])(
    'shows the full Giant Swarm logo in the brand file’s colors (%s theme)',
    async (_theme, dark) => {
      await renderLogo({ dark });

      const logo = screen.getByRole('img', { name: 'Giant Swarm' });
      // The lockup's wordmark is `currentColor`: the brand file's #234A61,
      // never recolored for the theme.
      expect(logo.querySelector('[fill="currentColor"]')).not.toBeNull();
      expect(logo).toHaveStyle({ color: '#234A61' });
      // The ant keeps the brand file's gradient and markings.
      expect(
        Array.from(logo.querySelectorAll('stop')).map(stop =>
          stop.getAttribute('stop-color'),
        ),
      ).toEqual(['#E14760', '#FA8816']);
      expect(
        Array.from(logo.querySelectorAll('[fill^="#"]')).map(el =>
          el.getAttribute('fill'),
        ),
      ).toEqual(['#FFFFFF', '#E54D42', '#FFFFFF', '#E54D42']);
    },
  );

  it('shows nothing until the branding manifest is in', async () => {
    mockBrandingLoading = true;
    await renderLogo();

    expect(screen.getByTestId('slot')).toBeEmptyDOMElement();
  });

  it('prefers the theme’s home page logo, named after the portal', async () => {
    mockBrandingAssets.push(
      'home-logo.svg',
      'home-logo-dark.png',
      'logo-full.svg',
    );
    await renderLogo({ dark: true });

    const logo = screen.getByRole('img', { name: 'Acme Portal' });
    expect(logo).toHaveAttribute('src', '/api/branding/home-logo-dark.png?v=1');
    expect(logo).toHaveStyle({ height: '40px', objectFit: 'contain' });
  });

  it('falls back to the sidebar logo at its configured height', async () => {
    mockBrandingAssets.push('logo-full.png', 'logo-icon.svg');
    await renderLogo({ logoHeight: 32 });

    const logo = screen.getByRole('img', { name: 'Acme Portal' });
    expect(logo).toHaveAttribute('src', '/api/branding/logo-full.png?v=1');
    // Scaled inside its box where the card is narrower, never distorted.
    expect(logo).toHaveStyle({
      height: '32px',
      maxWidth: '100%',
      objectFit: 'contain',
    });
  });
});
