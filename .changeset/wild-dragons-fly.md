---
'@giantswarm/backstage-plugin-kubernetes-react': patch
'@giantswarm/backstage-plugin-flux-react': patch
'@giantswarm/backstage-plugin-gs': patch
---

Integrate API version incompatibility errors into the error display system

- Add IncompatibilityErrorInfo type and ErrorInfoUnion discriminated union
- Update useShowErrors to handle both regular fetch errors and incompatibility errors
- Include incompatibilities in errors array from useResource and useResources hooks
- Add IncompatibilityPanel component for displaying incompatibility details
- Move getIncompatibilityMessage and getErrorMessage helpers to kubernetes-react
