# Generated kagent protobuf / Connect code

TypeScript for the kagent API v2 control-plane services
(`kagent.api.v1alpha1.{AgentInstanceService, AgentTemplateService, HarnessService,
ModelService, SystemService}`) and the A2A v1 service (`lf.a2a.v1.A2AService`),
generated with [buf](https://buf.build) and the remote `buf.build/bufbuild/es`
plugin (protoc-gen-es v2, `target=ts`, `include_imports: true` so the
`buf/validate` and `google/api` descriptors the kagent protos import come out
too). Nothing here is edited by hand, and the Docker build needs neither buf nor
the protos.

## Source pin

The protos are taken from the kagent line the platform consumes,
`github.com/giantswarm/kagent-upstream`, at commit

    0ac524031db451634359df3081d7d5d08cea4c93

(upstream `kagent-dev/kagent` `4a91c273`). Pin a commit SHA, never a branch: the
consumed branch of the line is rebased and force-pushed. Regenerate on every
re-pin of the line and record the new SHA here.

## Regenerate

```bash
# Export the protos of the pinned commit into a scratch directory.
git -C <kagent-upstream checkout> archive 0ac524031db451634359df3081d7d5d08cea4c93 proto \
  | tar -x -C <scratch>

# Generate into this directory (buf resolves the buf.build deps named in buf.yaml).
cd <scratch>/proto
buf generate --template <this dir>/buf.gen.yaml -o <this dir> \
  --path kagent/api/v1alpha1/agent_instances.proto \
  --path kagent/api/v1alpha1/agent_templates.proto \
  --path kagent/api/v1alpha1/harnesses.proto \
  --path kagent/api/v1alpha1/models.proto \
  --path kagent/api/v1alpha1/system.proto \
  --path a2a.proto
```

Runtime: `@bufbuild/protobuf` v2 (`codegenv2`) with `@connectrpc/connect`.
