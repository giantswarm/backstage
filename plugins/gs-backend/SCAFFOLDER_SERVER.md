---
title: Scaffolder Server - Backstage Actions Implementation
description: Find, validate, and execute Backstage scaffolder templates through MCP tools
---

## Overview

This implementation exposes Backstage scaffolder functionality as MCP (Model Context Protocol) tools through Backstage Actions. AI assistants can discover, validate, and execute Backstage scaffolder templates directly through the Backstage Actions Registry.

**Implementation Location:** `plugins/gs-backend/src/actions/`

## Implementation Details

This implementation creates 5 Backstage Actions that are registered in the Actions Registry:

1. **`gs:find-scaffolder-templates`** - Search for available templates
2. **`gs:retrieve-scaffolder-template`** - Get detailed template information
3. **`gs:validate-template-values`** - Validate input parameters
4. **`gs:run-scaffolder-template`** - Execute templates (placeholder implementation)
5. **`gs:get-scaffolder-task`** - Monitor task status (placeholder implementation)

## Available Actions

### gs:find-scaffolder-templates

Search for available scaffolder templates using queries that match template names, descriptions, and tags.

**Input:**

- `queryString` (string): Search term for finding templates

**Output:**

- `results` (array): Array of matching templates with metadata

**Attributes:** `{ readOnly: true, idempotent: true, destructive: false }`

### gs:retrieve-scaffolder-template

Get detailed information about a specific template, including parameters, steps, and requirements.

**Input:**

- `name` (string): Template name
- `namespace` (string, optional): Template namespace (defaults to "default")

**Output:**

- `entityRef` (string): Template entity reference
- `spec` (string): Template specification as JSON string

**Attributes:** `{ readOnly: true, idempotent: true, destructive: false }`

### gs:validate-template-values

Check if your input values meet the template's parameter requirements before execution, preventing common errors.

**Input:**

- `templateRef` (string): Template reference (e.g., "template:default/my-template")
- `values` (object): Parameter values to validate

**Output:**

- `valid` (boolean): Whether the values are valid
- `errors` (array): List of validation errors
- `schema` (object): Template parameter schema

**Attributes:** `{ readOnly: true, idempotent: true, destructive: false }`

### gs:run-scaffolder-template

Execute a scaffolder template with the provided values and optional secrets.

**Input:**

- `templateRef` (string): Template reference
- `values` (object): Required parameter values
- `secrets` (object, optional): Secrets needed by the template
- `skipValidation` (boolean, optional): Skip validation step

**Output:**

- `id` (string): The created task ID
- `taskUrl` (string): URL to monitor the task

**Attributes:** `{ readOnly: false, idempotent: false, destructive: false }`

**Note:** This is currently a placeholder implementation that returns mock data.

### gs:get-scaffolder-task

Monitor the status and progress of template execution.

**Input:**

- `id` (string): Task ID returned from template execution

**Output:**

- `task` (object): Task details including status, spec, and output

**Attributes:** `{ readOnly: true, idempotent: true, destructive: false }`

**Note:** This is currently a placeholder implementation that returns mock data.

## Implementation Notes

### Architecture

The implementation uses the Backstage Actions Registry system to expose scaffolder functionality as MCP tools. Each action is registered with proper input/output schemas using Zod validation and appropriate attributes for behavior classification.

### Authentication

All actions use the new Backstage auth services (`AuthService`) to handle authentication and generate tokens for backend-to-backend communication with the catalog service.

### Current Status

- ✅ **Template Discovery**: Fully implemented using catalog service
- ✅ **Template Retrieval**: Fully implemented using catalog service
- ✅ **Input Validation**: Implemented with basic schema validation
- 🚧 **Template Execution**: Placeholder implementation (needs scaffolder backend integration)
- 🚧 **Task Monitoring**: Placeholder implementation (needs scaffolder backend integration)

### Future Enhancements

To complete the implementation, the following components need to be integrated:

1. **Scaffolder Backend Integration**: Replace placeholder implementations in `createRunScaffolderTemplateAction` and `createGetScaffolderTaskAction` with actual scaffolder backend calls
2. **Enhanced Validation**: Improve template parameter validation with more sophisticated schema checking
3. **Error Handling**: Add comprehensive error handling for scaffolder-specific failures
4. **Permissions**: Implement proper permission checking for scaffolder operations

Once the actions are registered, AI agents can use them through the Backstage Actions service:

1. **Find templates**: `gs:find-scaffolder-templates` with query "react"
2. **Get template details**: `gs:retrieve-scaffolder-template` with template name
3. **Validate parameters**: `gs:validate-template-values` with values
4. **Execute template**: `gs:run-scaffolder-template` (placeholder)
5. **Monitor progress**: `gs:get-scaffolder-task` (placeholder)

## Installation

The actions are automatically registered when the `gs-backend` plugin is loaded in your Backstage backend. The plugin is configured to register all scaffolder actions during initialization.

## Files Structure

```
plugins/gs-backend/src/actions/
├── createFindScaffolderTemplatesAction.ts
├── createRetrieveScaffolderTemplateAction.ts
├── createValidateTemplateValuesAction.ts
├── createRunScaffolderTemplateAction.ts
├── createGetScaffolderTaskAction.ts
└── index.ts
```
