import { render, screen } from '@testing-library/react';
import { FactList } from '../components/FactList';
import { namespacedNameFacts } from './namespacedNameFacts';

function definitionOf(term: string) {
  return screen.getByText(term).closest('dt')?.nextElementSibling;
}

describe('namespacedNameFacts', () => {
  it('lists the namespace and the name as two facts', () => {
    render(
      <FactList
        facts={namespacedNameFacts({ namespace: 'org-acme', name: 'triage' })}
      />,
    );

    expect(definitionOf('Namespace')).toHaveTextContent(/^org-acme$/);
    expect(definitionOf('Name')).toHaveTextContent(/^triage$/);
    expect(screen.queryByText('org-acme/triage')).not.toBeInTheDocument();
  });

  it('prefixes the labels with the kind of a second resource in the list', () => {
    render(
      <FactList
        facts={namespacedNameFacts({
          namespace: 'flux-system',
          name: 'jira',
          kind: 'HelmRelease',
        })}
      />,
    );

    expect(definitionOf('HelmRelease namespace')).toHaveTextContent(
      'flux-system',
    );
    expect(definitionOf('HelmRelease name')).toHaveTextContent('jira');
  });

  it('has no Namespace fact without a namespace, and takes a value for the name', () => {
    render(
      <FactList
        facts={namespacedNameFacts({
          name: 'jira',
          nameValue: <a href="/jira">jira</a>,
        })}
      />,
    );

    expect(screen.queryByText('Namespace')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'jira' })).toBeInTheDocument();
  });
});
