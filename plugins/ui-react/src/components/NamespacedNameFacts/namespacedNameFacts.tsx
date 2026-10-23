import type { ReactNode } from 'react';
import type { Fact } from '../FactList';
import { Mono } from '../Mono';

export type NamespacedNameFactsOptions = {
  /** The resource's namespace; a cluster-scoped one, or one not known, has no Namespace fact. */
  namespace?: string;
  name: string;
  /**
   * The resource's kind, for a resource that is not the one its list is
   * about: the labels become "<kind> namespace" and "<kind> name", so a list
   * can name two resources (a connector and the HelmRelease behind it).
   */
  kind?: string;
  /** The Name fact's value where it is more than the name in `Mono`, e.g. a link to the resource's page. */
  nameValue?: ReactNode;
};

/**
 * A Kubernetes resource's namespace and name as two facts of a `FactList`,
 * never one `namespace/name` value: each is something to read, copy or type
 * into `kubectl -n <namespace> get <kind> <name>` on its own.
 */
export function namespacedNameFacts({
  namespace,
  name,
  kind,
  nameValue,
}: NamespacedNameFactsOptions): Fact[] {
  const facts: Fact[] = [];
  if (namespace) {
    facts.push({
      label: kind ? `${kind} namespace` : 'Namespace',
      value: <Mono>{namespace}</Mono>,
    });
  }
  facts.push({
    label: kind ? `${kind} name` : 'Name',
    value: nameValue ?? <Mono>{name}</Mono>,
  });
  return facts;
}
