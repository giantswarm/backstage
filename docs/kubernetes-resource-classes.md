# Kubernetes resource classes

Resource classes in `plugins/kubernetes-react/src/lib/k8s/` wrap Kubernetes
CRDs. Their types come from `@giantswarm/k8s-types`; the available versions
are under `node_modules/@giantswarm/k8s-types/dist/types/crds/`. Reference
implementation: `plugins/kubernetes-react/src/lib/k8s/capi/Cluster.ts`.

## New resources: the latest version only

When creating a new resource class, use only the latest available API version:

```typescript
import { crds } from '@giantswarm/k8s-types';
import { KubeObject } from './KubeObject';

type MyResourceInterface = crds.mygroup.v1.MyResource;

export class MyResource extends KubeObject<MyResourceInterface> {
  static readonly supportedVersions = ['v1'] as const;
  static readonly group = 'mygroup.example.io';
  static readonly kind = 'MyResource' as const;
  static readonly plural = 'myresources';
}
```

## Multi-version resources, when backward compatibility is needed

For resources that must support multiple API versions:

```typescript
// 1. Define version-specific types - ONLY versions in @giantswarm/k8s-types
type MyResourceV1Beta1 = crds.mygroup.v1beta1.MyResource;
type MyResourceV1Beta2 = crds.mygroup.v1beta2.MyResource;

// 2. Version map (source of truth)
type MyResourceVersions = {
  v1beta1: MyResourceV1Beta1;
  v1beta2: MyResourceV1Beta2;
};

// 3. Interface is union
type MyResourceInterface = MyResourceVersions[keyof MyResourceVersions];

export class MyResource extends KubeObject<MyResourceInterface> {
  // 4. satisfies provides compile-time enforcement
  static readonly supportedVersions = [
    'v1beta1',
    'v1beta2',
  ] as const satisfies readonly (keyof MyResourceVersions)[];

  // 5. REQUIRED: Type guards for each supported version
  isV1Beta1(): this is MyResource & { jsonData: MyResourceV1Beta1 } {
    return this.getApiVersionSuffix() === 'v1beta1';
  }

  isV1Beta2(): this is MyResource & { jsonData: MyResourceV1Beta2 } {
    return this.getApiVersionSuffix() === 'v1beta2';
  }
}
```

## Rules

- A new resource uses only the latest available API version.
- Never add a version to `supportedVersions` without a corresponding type in
  `@giantswarm/k8s-types`.
- A multi-version resource uses a version map with `satisfies`, so the compiler
  checks the list.
- A multi-version resource has a type guard method (`isV1Beta1()`, ...) for each
  version.
