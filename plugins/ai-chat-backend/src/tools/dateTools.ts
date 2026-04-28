import { tool } from 'ai';
import { z } from 'zod/v3';

export const date = tool({
  description:
    'Returns the current date and time as an ISO 8601 string with seconds and timezone offset. Use this whenever you need to know what time it is now.',
  inputSchema: z.object({}),
  execute: async () => {
    return {
      now: new Date().toISOString(),
    };
  },
});
