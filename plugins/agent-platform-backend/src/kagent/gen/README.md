# Generated kagent protobuf/Connect code

Generated with [buf](https://buf.build) from the kagent `main` protos
(`proto/` in github.com/kagent-dev/kagent, package `kagent.api.v1alpha1` and
the A2A v1 `lf.a2a.v1` service) using the remote `buf.build/bufbuild/es`
plugin, so the Docker build needs neither buf nor the protos.

Regenerate from a kagent checkout:

```bash
cd <kagent checkout>/proto
buf generate --template <this dir>/buf.gen.yaml -o <this dir> \
  --path kagent/api/v1alpha1/agent_instances.proto \
  --path kagent/api/v1alpha1/agent_templates.proto \
  --path kagent/api/v1alpha1/harnesses.proto \
  --path kagent/api/v1alpha1/system.proto \
  --path a2a.proto
```

Runtime: `@bufbuild/protobuf` v2 (`codegenv2`). Do not edit by hand.
