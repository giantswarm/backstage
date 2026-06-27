import { classifyTool } from './mutationGuard';

describe('classifyTool', () => {
  it('treats list/get/describe tools as read-only', () => {
    expect(classifyTool('core_workflow_list')).toBe('readonly');
    expect(classifyTool('core_mcpserver_list')).toBe('readonly');
    expect(classifyTool('x_kubernetes_get')).toBe('readonly');
    expect(classifyTool('describe_tool')).toBe('readonly');
  });

  it('hard-blocks cluster-write verbs regardless of installation', () => {
    expect(classifyTool('x_kubernetes_apply')).toBe('blocked');
    expect(classifyTool('x_kubernetes_patch_resource')).toBe('blocked');
  });

  it('flags other mutating verbs as mutating (confirm-gated)', () => {
    expect(classifyTool('core_service_stop')).toBe('mutating');
    expect(classifyTool('core_workflow_create')).toBe('mutating');
    expect(classifyTool('core_workflow_delete')).toBe('mutating');
    expect(classifyTool('x_kubernetes_scale_deployment')).toBe('mutating');
  });
});
