import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadInstructionFiles } from '../packages/ai/runtime/pi/skills'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (targetPath) => {
      await fs.rm(targetPath, { force: true, recursive: true })
    })
  )
})

describe('instruction loader', () => {
  it('loads user-global instructions before repo instructions and prefers nearer project files later', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-instruction-loader-'))
    tempRoots.push(tempRoot)

    const homeDir = path.join(tempRoot, 'home')
    const repoRoot = path.join(tempRoot, 'repo')
    const workspaceRoot = path.join(repoRoot, 'apps', 'demo')

    await fs.mkdir(path.join(repoRoot, '.git'), { recursive: true })
    await writeText(path.join(homeDir, '.chobits', 'AGENTS.md'), 'user chobits')
    await writeText(path.join(homeDir, '.claude', 'CLAUDE.md'), 'user claude')
    await writeText(path.join(repoRoot, 'AGENTS.md'), 'repo root')
    await writeText(path.join(workspaceRoot, '.chobits', 'AGENTS.md'), 'workspace local')

    const result = await loadInstructionFiles({
      homeDir,
      workspaceRoot
    })

    expect(result.issues).toEqual([])
    expect(
      result.files.map((file) => ({
        content: file.content,
        path: path.relative(tempRoot, file.filePath).replace(/\\/g, '/'),
        source: file.source
      }))
    ).toEqual([
      {
        content: 'user chobits',
        path: 'home/.chobits/AGENTS.md',
        source: 'user'
      },
      {
        content: 'user claude',
        path: 'home/.claude/CLAUDE.md',
        source: 'user'
      },
      {
        content: 'repo root',
        path: 'repo/AGENTS.md',
        source: 'project'
      },
      {
        content: 'workspace local',
        path: 'repo/apps/demo/.chobits/AGENTS.md',
        source: 'project'
      }
    ])
  })
})

async function writeText(filePath: string, content: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, 'utf8')
}
