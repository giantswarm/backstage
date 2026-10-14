# Generated kagent protobuf / Connect code

TypeScript for the kagent API v2 control-plane services
(`kagent.api.v1alpha1.{SessionService, AgentService, AgentTemplateService,
HarnessService, ModelService, SystemService}`, with the `RuntimeState` and
`RuntimeOperation` enums of `runtime.proto`) and the A2A v1 service
(`lf.a2a.v1.A2AService`),
generated with [buf](https://buf.build) and the remote `buf.build/bufbuild/es`
plugin (protoc-gen-es v2, `target=ts`, `include_imports: true` so the
`buf/validate` and `google/api` descriptors the kagent protos import come out
too). Nothing here is edited by hand, and the Docker build needs neither buf nor
the protos.

## Source pin

The protos are taken from the kagent line the platform consumes,
`github.com/giantswarm/kagent-upstream`, at commit

    f7bf3dafd6a8c21e084015a9310f4692778ebaeb

(upstream `kagent-dev/kagent` `bf8afa56`; the `api.kagent.dev/v1alpha3` Agent
line). Pin a commit SHA, never a branch: the consumed branch of the line is
rebased and force-pushed. Regenerate on every re-pin of the line and record the
new SHA here; the pin moves to the release tag once `giantswarm/kagent-upstream`
publishes it.

## Regenerate

```bash
# Export the protos of the pinned commit into a scratch directory.
git -C <kagent-upstream checkout> archive f7bf3dafd6a8c21e084015a9310f4692778ebaeb proto \
  | tar -x -C <scratch>

# Generate into this directory (buf resolves the buf.build deps named in buf.yaml).
cd <scratch>/proto
buf generate --template <this dir>/buf.gen.yaml -o <this dir> \
  --path kagent/api/v1alpha1/sessions.proto \
  --path kagent/api/v1alpha1/agents.proto \
  --path kagent/api/v1alpha1/runtime.proto \
  --path kagent/api/v1alpha1/agent_templates.proto \
  --path kagent/api/v1alpha1/harnesses.proto \
  --path kagent/api/v1alpha1/models.proto \
  --path kagent/api/v1alpha1/system.proto \
  --path a2a.proto
```

`system.proto` imports Substrate's `ateapi.proto`, which is why `ateapi_pb.ts`
is generated too.

Runtime: `@bufbuild/protobuf` v2 (`codegenv2`) with `@connectrpc/connect`.
