import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';

// Development setup for the AI Chat plugin
//
// Start up the backend by running `yarn start` in the package directory.
// Once it's up and running, try out the following requests:
//
// Check health:
//   curl http://localhost:7007/api/ai-chat/health
//
// Send a chat message (requires OPENAI_API_KEY environment variable):
//   curl http://localhost:7007/api/ai-chat/chat \
//     -H 'Content-Type: application/json' \
//     -d '{"messages": [{"role": "user", "content": "Hello!"}]}'

const backend = createBackend();

// Mock auth services for development
backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

// Add the AI chat plugin
backend.add(import('../src'));

backend.start();
