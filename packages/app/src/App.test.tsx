import { render, waitFor } from '@testing-library/react';
import app from './App';

describe('App', () => {
  it('should render', async () => {
    process.env = {
      NODE_ENV: 'test',
      APP_CONFIG: [
        {
          data: {
            app: { title: 'Test' },
            backend: { baseUrl: 'http://localhost:7007' },
            techdocs: {
              storageUrl: 'http://localhost:7007/api/techdocs/static/docs',
            },
            gs: {
              installations: {},
            },
          },
          context: 'test',
        },
      ] as any,
    };

    // In new frontend system, app is a React element, not a component
    const rendered = render(app);
    await waitFor(() => {
      expect(rendered.baseElement).toBeInTheDocument();
    });
  });
});
