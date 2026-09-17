import { Config } from '@backstage/config';
import { AuthenticationError, InputError } from '@backstage/errors';
import express from 'express';
import Router from 'express-promise-router';
import {
  completionsUrl,
  SERVED_MODEL_AUTH_HEADER,
  tryServedModel,
} from './tryServedModel';

export interface TryRouterOptions {
  config: Config;
  /** Overridable for tests. */
  fetchFn?: typeof fetch;
}

/** The longest model id and endpoint a try takes along. */
const MODEL_ID_MAX_LENGTH = 253;
const ENDPOINT_MAX_LENGTH = 2048;
const MODEL_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-:/]*$/;

function readString(
  body: Record<string, unknown>,
  field: string,
  maxLength: number,
): string {
  const value = body[field];
  if (typeof value !== 'string') {
    throw new InputError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new InputError(`${field} must not be empty`);
  }
  if (trimmed.length > maxLength) {
    throw new InputError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

/**
 * `POST /served-models/try`: the one model-manager-related call the portal's
 * backend carries out itself. Body: `installation` (a `gs.installations`
 * name, for its base domain), `model` (the serving object's name — the model
 * id the completion is sent for) and `url` (the served model's endpoint as
 * model-manager reports it, held to the installation's domain). Header:
 * the person's installation token ({@link SERVED_MODEL_AUTH_HEADER}), sent
 * as `Authorization: Bearer` on the second of the two completions. Answers
 * `TryServedModelResult`; a 200 here says the try ran, the outcomes inside say
 * what the gateway and the model answered.
 */
export function createTryRouter(options: TryRouterOptions): express.Router {
  const { config } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const router = Router();
  router.use(express.json());

  router.post('/served-models/try', async (req, res) => {
    const body = (
      req.body && typeof req.body === 'object' ? req.body : {}
    ) as Record<string, unknown>;
    const installation = readString(body, 'installation', MODEL_ID_MAX_LENGTH);
    const model = readString(body, 'model', MODEL_ID_MAX_LENGTH);
    if (!MODEL_ID_PATTERN.test(model)) {
      throw new InputError(
        'model must be a model reference such as qwen3-4b-instruct or hf.co/org/repo:Q4_K_M',
      );
    }
    const endpoint = readString(body, 'url', ENDPOINT_MAX_LENGTH);

    const headerValue = req.headers[SERVED_MODEL_AUTH_HEADER];
    const userToken = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!userToken) {
      throw new AuthenticationError(
        'The request did not include a user token for the target installation.',
      );
    }

    const baseDomain = config
      .getOptionalConfig('gs.installations')
      ?.getOptionalConfig(installation)
      ?.getOptionalString('baseDomain');
    const url = completionsUrl(endpoint, baseDomain);
    res.json(await tryServedModel({ url, model, userToken, fetchFn }));
  });

  return router;
}
