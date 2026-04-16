import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'

import { getWorkflow, listAllWorkflowDefinitions, runWorkflow } from '../../../../workflow'
import type { WorkflowDefinition } from '../../../../workflow/types'
import { resolveGuardedToolExecution } from '../skills'
import type { PiSessionToolContext } from '../tool-context'
import { createJsonToolResult } from './result'

async function resolveWorkflowMetadata(toolContext: PiSessionToolContext, workflowInput?: Record<string, any>): Promise<Record<string, any>> {
  const metadata: Record<string, any> = {}
  const resourceId = workflowInput?.resourceId

  if (resourceId) {
    try {
      const resource = await toolContext.resourcesRepo.getById(resourceId)
      if (resource) {
        if (resource.workspaceId) metadata.workspaceId = resource.workspaceId
        if (resource.folderId) metadata.folderId = resource.folderId
      }
    } catch (error) {
      console.warn('[workflowRunTool] Failed to resolve resource metadata:', error)
    }
  }

  if (!metadata.workspaceId) {
    try {
      const { WorkspacesRepo } = await import('../../../../common/db')
      const workspace = await WorkspacesRepo.getDefault()
      if (workspace?.id) {
        metadata.workspaceId = workspace.id
      }
    } catch (error) {
      console.warn('[workflowRunTool] Failed to resolve default workspace:', error)
    }
  }

  return metadata
}

interface WorkflowSummary {
  acceptedResourceKinds?: string[]
  coreNodeTypes: string[]
  description?: string
  id: string
  inputMode?: string
  isPreset: boolean
  name: string
}

function extractWorkflowSummary(definition: WorkflowDefinition): WorkflowSummary {
  const startNode = definition.nodes.find((node) => node.type === 'core/start')
  const inputMode = (startNode?.config?.inputMode as string) || 'resource'
  const acceptedResourceKinds: string[] = (startNode?.config?.resourceKinds as string[]) || []

  const utilityTypes = new Set(['core/start', 'core/end', 'resource/load', 'resource/create', 'resource/update'])
  const coreNodeTypes = [...new Set(definition.nodes.map((node) => node.type).filter((type) => !utilityTypes.has(type)))]

  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    inputMode,
    acceptedResourceKinds: acceptedResourceKinds.length > 0 ? acceptedResourceKinds : undefined,
    coreNodeTypes,
    isPreset: Boolean(definition.isPreset)
  }
}

const workflowRunParameters = Type.Object({
  action: Type.Union([Type.Literal('search'), Type.Literal('list'), Type.Literal('run')], {
    description: 'list lists workflows, search finds matching workflows, and run executes a specific workflow.'
  }),
  query: Type.Optional(Type.String({ description: 'Keyword query used by the search action.' })),
  workflowId: Type.Optional(Type.String({ description: 'Workflow ID returned by list or search and used by the run action.' })),
  waitForCompletion: Type.Optional(
    Type.Boolean({
      description: 'For run only. True waits for completion, false starts the workflow and returns immediately.'
    })
  ),
  input: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: 'Workflow input payload. Common examples include resourceId, text, url, or file.'
      }
    )
  ),
  configOverrides: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: 'Optional node config overrides, keyed by node ID.'
      }
    )
  )
})

export function createPiWorkflowRunTool(toolContext: PiSessionToolContext): ToolDefinition<typeof workflowRunParameters> {
  return {
    name: 'workflowRunTool',
    label: 'workflowRunTool',
    description: 'List, search, and run workflows for tasks such as OCR, transcription, extraction, or media generation.',
    parameters: workflowRunParameters,
    async execute(toolCallId, input) {
      const { action, query, workflowId, input: workflowInput, configOverrides, waitForCompletion } = input
      const shouldWait = waitForCompletion !== false
      console.log('[workflowRunTool] called:', { action, query, workflowId, waitForCompletion: shouldWait })

      if (action === 'list') {
        try {
          const definitions = await listAllWorkflowDefinitions()
          const workflows = definitions.filter((definition) => definition.id !== 'blank').map(extractWorkflowSummary)
          return createJsonToolResult({ success: true, workflows, total: workflows.length })
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || 'Failed to load workflows.' })
        }
      }

      if (action === 'search') {
        if (!query) {
          return createJsonToolResult({ success: false, error: 'The search action requires a query.' })
        }

        try {
          const definitions = await listAllWorkflowDefinitions()
          const normalizedQuery = query.toLowerCase()
          const results = definitions
            .filter((definition) => definition.id !== 'blank')
            .filter((definition) => {
              const name = (definition.name || '').toLowerCase()
              const description = (definition.description || '').toLowerCase()
              const nodeTypes = definition.nodes.map((node) => node.type.toLowerCase()).join(' ')
              return name.includes(normalizedQuery) || description.includes(normalizedQuery) || nodeTypes.includes(normalizedQuery)
            })
            .map(extractWorkflowSummary)

          if (results.length === 0) {
            const allWorkflows = definitions.filter((definition) => definition.id !== 'blank').map(extractWorkflowSummary)
            return createJsonToolResult({
              success: true,
              results: [],
              message: `No workflows matched "${query}".`,
              allWorkflows
            })
          }

          return createJsonToolResult({ success: true, results })
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || 'Failed to search workflows.' })
        }
      }

      if (action === 'run') {
        if (!workflowId) {
          return createJsonToolResult({ success: false, error: 'The run action requires a workflowId.' })
        }

        try {
          const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'workflow-run')
          if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
            return createJsonToolResult(guardResolution.details)
          }

          const definition = await getWorkflow(workflowId)
          if (!definition) {
            return createJsonToolResult({
              success: false,
              error: `Workflow "${workflowId}" was not found.`,
              hint: 'Use the list or search action to inspect available workflows first.'
            })
          }

          const runInput: Record<string, any> = { ...(workflowInput || {}) }
          if (configOverrides) {
            runInput.__configOverrides__ = configOverrides
          }

          const metadata = await resolveWorkflowMetadata(toolContext, runInput)
          console.log('[workflowRunTool] run metadata:', metadata)

          const onProgress = toolContext.reportProgress
            ? (progress: number, message?: string) => {
                toolContext.reportProgress!(toolCallId, progress, message)
              }
            : undefined

          const runRecord = await runWorkflow(definition, runInput, metadata, onProgress)

          if (!shouldWait) {
            return createJsonToolResult({
              success: true,
              runId: runRecord.runId,
              workflowId: runRecord.workflowId,
              status: runRecord.status,
              ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
              message: `Workflow "${definition.name}" started successfully. Run ID: ${runRecord.runId}`
            })
          }

          const result: Record<string, any> = {
            success: runRecord.status === 'completed',
            runId: runRecord.runId,
            workflowId: runRecord.workflowId,
            status: runRecord.status,
            duration: runRecord.duration
          }

          if (runRecord.status === 'completed') {
            result.message = `Workflow "${definition.name}" completed successfully.`
            if (runRecord.output && Object.keys(runRecord.output).length > 0) {
              result.output = runRecord.output
            }
          } else if (runRecord.status === 'failed') {
            result.message = `Workflow "${definition.name}" failed.`
            result.error = runRecord.error
          } else {
            result.message = `Workflow "${definition.name}" finished with status ${runRecord.status}.`
          }

          return createJsonToolResult({
            ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
            ...result
          })
        } catch (error: any) {
          return createJsonToolResult({ success: false, error: error?.message || 'Failed to run workflow.' })
        }
      }

      return createJsonToolResult({ success: false, error: `Unknown action: ${action}` })
    }
  }
}
