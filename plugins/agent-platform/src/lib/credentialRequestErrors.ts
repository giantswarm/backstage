import { AgentManagerError } from './agentManager';

/**
 * agent-manager's refusal of a write that writes a credential Secret whole
 * with the one key it names, while another object reads another key of it
 * (`otherKey` in its internal/organizations/credential_replace.go). The
 * refusal has no code of its own (`conflict`), so its wording is matched;
 * a rewording falls back to the generic conflict sentence.
 */
const OTHER_KEY = /reads key \S+ of Secret \S+, which a write of key/;

/**
 * Why agent-manager refused to prepare a credential request, in words that
 * say what to do, followed by its own answer. Its codes decide; anything
 * else is passed on as it came.
 */
export function credentialRequestErrorMessage(error: Error): string {
  if (!(error instanceof AgentManagerError)) {
    return error.message;
  }
  const answer = `agent-manager answered: ${error.message}`;
  switch (error.code) {
    case 'forbidden':
      return `Only an admin of the organization replaces its credentials. ${answer}`;
    case 'not_found':
      return `Nothing in the organization reads this credential any more, so there is nothing to replace. Read the list again. ${answer}`;
    case 'gitops_owned':
      return `An object that uses this credential is applied from git, which would undo a change made here. Change the credential with a pull request to the organization's repository. ${answer}`;
    case 'invalid_request':
      return `agent-manager does not replace this credential as it is named. Nothing was changed. ${answer}`;
    case 'conflict':
      return OTHER_KEY.test(error.message)
        ? `Another object reads a different key of the same Secret. The Secret is written whole with one key, so that key would be lost: give that object a Secret of its own first. Nothing was changed. ${answer}`
        : `Something that uses this credential stands in the way, so nothing was changed. ${answer}`;
    default:
      return error.message;
  }
}
