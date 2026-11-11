import type { Meta, StoryObj } from '@storybook/react';
import { ExternalUrlConsentDialog } from './ExternalUrlConsentDialog';
import { componentDocs } from '../../storybook/docs';

const meta = {
  title: 'Components/ExternalUrlConsentDialog',
  component: ExternalUrlConsentDialog,
  tags: ['autodocs'],
  args: {
    request: {
      id: 1,
      url: 'https://muster.example.com/oauth/proxy/start?state=abc',
      requester: 'miro',
      message: 'Sign in to miro to continue.',
    },
    onAnswer: () => {},
  },
  parameters: {
    docs: {
      description: {
        component: componentDocs({
          summary:
            'Asks before the portal opens an address a server provided: the ' +
            'full address as text with its domain highlighted, warnings for a ' +
            'punycode domain, plain http and a user name before the domain, ' +
            'and an explicit Open.',
          whenToUse:
            'Never directly. Call `externalUrlConsentApiRef`’s `open()` for ' +
            'any server-provided address (a sign-in, a connect, an MCP URL ' +
            'elicitation); `ExternalUrlConsentDialogHost` at the app root ' +
            'shows this dialog and opens the address on consent.',
          migration: 'bui',
        }),
      },
    },
  },
} satisfies Meta<typeof ExternalUrlConsentDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};

export const LookalikeDomain: Story = {
  args: {
    request: {
      id: 2,
      url: 'https://login.github.com.аpple.com/authorize',
      requester: 'GitHub',
    },
  },
};

export const SameTab: Story = {
  args: {
    request: {
      id: 3,
      url: 'https://muster.example.com/oauth/proxy/start?state=abc&redirect=https%3A%2F%2Fportal.example.com%2Fplans',
      requester: 'muster (GitHub connect)',
      message:
        'Connect your GitHub account in muster. The page comes back here once it is connected.',
      target: 'page',
    },
  },
};

export const NotAWebPage: Story = {
  args: {
    request: {
      id: 4,
      // eslint-disable-next-line no-script-url
      url: 'javascript:alert(1)',
      requester: 'miro',
    },
  },
};
