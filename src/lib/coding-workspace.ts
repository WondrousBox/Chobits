export function inferCodingWorkspaceLabel(workspacePath: string): string {
  const normalized = workspacePath.replace(/[\\/]+$/, '');
  const segments = normalized.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] || workspacePath;
}

export interface CodingWorkspaceSelection {
  root: string;
  label: string;
}

export async function pickCodingWorkspace(defaultPath?: string): Promise<CodingWorkspaceSelection | null> {
  const result = await window.YUA.file['file:pickDir']({
    defaultPath: defaultPath || undefined
  });

  if (result?.canceled || !result.path) {
    return null;
  }

  return {
    root: result.path,
    label: inferCodingWorkspaceLabel(result.path)
  };
}
