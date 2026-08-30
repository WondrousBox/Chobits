import { CHARACTER_PACK_ARCHIVE_EXTENSION, CHARACTER_PACK_ARCHIVE_EXTENSION_NAME } from '@packages/sprite-core/character-pack-archive';
import type { CharacterPackExportResult, CharacterPackSummary, CharacterPackTrustAssessment } from '@packages/sprite-core/character-pack-manager';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { TbArchive, TbCheck, TbDownload, TbFolderOpen, TbLoader2, TbPencil, TbPlus, TbRefresh, TbShieldX, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { maskPath } from '@/lib/helpers';
import { makeResSrc } from '@/lib/resource-protocol';
import { SettingGroup, SettingItem, SettingPath } from '@/pages/SettingsPage/components/SettingComponents';

import { SpritePackEditorContent } from './SpritePackEditor';
import {
  buildCreateSpritePackEditorState,
  getSpritePackEditorDescription,
  getSpritePackEditorTitle,
  loadSpritePackEditorStateForPack,
  saveSpritePackEditorState,
  SPRITE_PACK_EDITOR_WINDOW_KEY,
  type SpritePackEditorPresentation,
  type SpritePackEditorState,
  type SpritePackEditorWindowPayload,
  subscribeSpritePackEditorEvents
} from './SpritePackEditorModel';

interface SpritePackManagerProps {
  afterRuntimeChange?: () => Promise<void> | void;
  editorExtra?: ReactNode;
  editorPresentation?: SpritePackEditorPresentation;
}

interface ImportPromptState {
  inspection: Awaited<ReturnType<typeof window.YUA.persona.inspectCharacterPackFromArchive>>;
  activateAfterInstall: boolean;
}

interface CharacterPackMutationResult {
  ok: true;
  error?: string;
  changed?: boolean;
  replaced?: boolean;
  activated?: boolean;
  switchedActivePack?: boolean;
  pack?: CharacterPackSummary;
  removedPack?: CharacterPackSummary;
  activePack?: CharacterPackSummary | null;
  character?: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
  personaSlot?: {
    slotId: string;
    restored: boolean;
    switched: boolean;
  };
}

type CharacterPackMutationOptions = {
  replaceExisting?: boolean;
  activate?: boolean;
};

type TrustPackLike = {
  trust: CharacterPackTrustAssessment;
  signature?: {
    algorithm?: string;
    keyId?: string;
    digest?: string;
    value?: string;
  };
};

type PreviewMedia = {
  kind: 'image' | 'video';
  src: string;
};

function PackActionButton({ label, disabled, onClick, className, children }: { label: string; disabled?: boolean; onClick?: () => void; className?: string; children: ReactNode }): JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button type="button" size="icon" variant="ghost" className={`h-8 w-8 ${className ?? ''}`} disabled={disabled} onClick={onClick} aria-label={label}>
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

type CharacterPackDigestStatus = NonNullable<CharacterPackTrustAssessment['digest']>['status'];
type CharacterPackSignatureStatus = NonNullable<CharacterPackTrustAssessment['signatureVerification']>['status'];

function getPackBusyKey(prefix: string, pack: Pick<CharacterPackSummary, 'id' | 'source'>): string {
  return `${prefix}:${pack.source}:${pack.id}`;
}

function formatPackSource(source: CharacterPackSummary['source']): string {
  return source === 'builtin' ? '内置' : '已安装';
}

function getPackBusyState(busyKey: string | null, pack: Pick<CharacterPackSummary, 'id' | 'source'>): { active: boolean; key: string | null } {
  const activateKey = getPackBusyKey('activate', pack);
  const exportKey = getPackBusyKey('export', pack);
  const removeKey = getPackBusyKey('remove', pack);
  if (busyKey === activateKey || busyKey === exportKey || busyKey === removeKey) {
    return {
      active: true,
      key: busyKey
    };
  }

  return {
    active: false,
    key: null
  };
}

function getImportBusyKey(): string {
  return 'install-archive';
}

function getInspectionPreviewMedia(prompt: ImportPromptState | null): PreviewMedia | null {
  const previewVideoPath = prompt?.inspection.pack.previewVideoPath;
  if (previewVideoPath) {
    return {
      kind: 'video',
      src: makeResSrc(previewVideoPath)
    };
  }

  const previewPath = prompt?.inspection.pack.previewGifPath ?? prompt?.inspection.pack.previewAvatarPath;
  if (!previewPath) {
    return null;
  }

  return {
    kind: 'image',
    src: makeResSrc(previewPath)
  };
}

function getPackPreviewMedia(pack: Pick<CharacterPackSummary, 'resolvedAssets'>): PreviewMedia | null {
  const previewPath = pack.resolvedAssets.preview?.avatar ?? pack.resolvedAssets.preview?.gif ?? pack.resolvedAssets.preview?.video;
  if (!previewPath) {
    return null;
  }

  return {
    kind: pack.resolvedAssets.preview?.avatar || pack.resolvedAssets.preview?.gif ? 'image' : 'video',
    src: makeResSrc(previewPath)
  };
}

function formatTrustLevel(level: CharacterPackTrustAssessment['level']): string {
  switch (level) {
    case 'signature-declared':
      return '已声明签名';
    case 'publisher-declared':
      return '已声明来源';
    default:
      return '未声明来源';
  }
}

function formatTrustVerificationStatus(status: CharacterPackTrustAssessment['verificationStatus']): string | null {
  if (status === 'builtin-bundled') {
    return '应用内置';
  }

  if (status === 'signature-verified') {
    return '签名已验证';
  }

  if (status === 'signature-mismatch') {
    return '签名校验失败';
  }

  if (status === 'signature-untrusted') {
    return '签名未受信';
  }

  if (status === 'digest-verified') {
    return '摘要已校验';
  }

  if (status === 'digest-mismatch') {
    return '摘要不匹配';
  }

  if (status === 'declared-unverified') {
    return '未验签';
  }

  return null;
}

function formatSignatureVerificationStatus(status: CharacterPackSignatureStatus | undefined): string | null {
  if (status === 'verified') {
    return '签名已验证';
  }

  if (status === 'mismatch') {
    return '签名校验失败';
  }

  if (status === 'untrusted') {
    return '签名未受信';
  }

  if (status === 'unsupported' || status === 'error') {
    return '签名未校验';
  }

  return null;
}

function formatDigestVerificationStatus(status: CharacterPackDigestStatus | undefined): string | null {
  if (status === 'verified') {
    return '摘要已校验';
  }

  if (status === 'mismatch') {
    return '摘要不匹配';
  }

  if (status === 'unsupported' || status === 'error') {
    return '摘要未校验';
  }

  return null;
}

function formatTrustLinkLabel(label: CharacterPackTrustAssessment['links'][number]['label']): string {
  switch (label) {
    case 'homepage':
      return '主页';
    case 'repository':
      return '仓库';
    case 'support':
      return '支持';
    default:
      return 'Canonical';
  }
}

function abbreviateMetadataValue(value: string | undefined, maxLength = 24): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= maxLength) {
    return value;
  }

  const head = Math.max(8, Math.floor((maxLength - 3) / 2));
  const tail = Math.max(6, maxLength - head - 3);
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatSignatureSummary(pack: TrustPackLike): string | null {
  const details = [
    pack.signature?.algorithm ? `算法 ${pack.signature.algorithm}` : null,
    pack.signature?.keyId ? `Key ${abbreviateMetadataValue(pack.signature.keyId, 22)}` : null,
    pack.signature?.digest ? `Digest ${abbreviateMetadataValue(pack.signature.digest, 28)}` : null,
    formatSignatureVerificationStatus(pack.trust.signatureVerification?.status),
    formatDigestVerificationStatus(pack.trust.digest?.status)
  ].filter((value): value is string => !!value);

  if (details.length > 0) {
    return details.join(' · ');
  }

  return pack.trust.signatureDeclared ? '已声明签名值' : null;
}

function getPackTrustBadges(pack: TrustPackLike): string[] {
  const verificationStatus = formatTrustVerificationStatus(pack.trust.verificationStatus);
  const signatureStatus =
    pack.trust.verificationStatus === 'signature-verified' || pack.trust.verificationStatus === 'signature-mismatch' || pack.trust.verificationStatus === 'signature-untrusted'
      ? null
      : formatSignatureVerificationStatus(pack.trust.signatureVerification?.status);
  const digestStatus = pack.trust.verificationStatus === 'digest-verified' || pack.trust.verificationStatus === 'digest-mismatch' ? null : formatDigestVerificationStatus(pack.trust.digest?.status);

  return [
    formatTrustLevel(pack.trust.level),
    pack.trust.publisher ? `发布者: ${pack.trust.publisher}` : null,
    pack.trust.channel ? `渠道: ${pack.trust.channel}` : null,
    pack.trust.signatureDeclared ? '签名声明' : null,
    verificationStatus,
    signatureStatus,
    digestStatus
  ].filter((value): value is string => !!value);
}

function formatPackTrustSummary(pack: TrustPackLike): string {
  const signatureStatus =
    pack.trust.verificationStatus === 'signature-verified' || pack.trust.verificationStatus === 'signature-mismatch' || pack.trust.verificationStatus === 'signature-untrusted'
      ? null
      : formatSignatureVerificationStatus(pack.trust.signatureVerification?.status);
  const digestStatus = pack.trust.verificationStatus === 'digest-verified' || pack.trust.verificationStatus === 'digest-mismatch' ? null : formatDigestVerificationStatus(pack.trust.digest?.status);
  const parts = [formatTrustLevel(pack.trust.level), pack.trust.publisher, pack.trust.channel, formatTrustVerificationStatus(pack.trust.verificationStatus), signatureStatus, digestStatus].filter(
    (value): value is string => !!value
  );

  return parts.join(' · ');
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }

  return null;
}

function formatActionError(prefix: string, error: unknown): string {
  const message = getErrorMessage(error);
  return message ? `${prefix}：${message}` : prefix;
}

function sanitizeExportFilenameSegment(value: string | undefined): string {
  const normalized = (value || '')
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .split('')
    .map((char) => (char.charCodeAt(0) < 32 ? '-' : char))
    .join('')
    .replace(/\s+/g, '-');
  return normalized.replace(/-+/g, '-').replace(/^-|-$/g, '') || 'character-pack';
}

function buildCharacterPackExportFilename(pack: Pick<CharacterPackSummary, 'id' | 'version'>): string {
  return `${sanitizeExportFilenameSegment(pack.id)}-${sanitizeExportFilenameSegment(pack.version)}${CHARACTER_PACK_ARCHIVE_EXTENSION}`;
}

function getPackMetadataBadges(pack: Pick<CharacterPackSummary, 'formatVersion' | 'minAppVersion' | 'platform' | 'capabilities'>): string[] {
  return [
    `format v${pack.formatVersion}`,
    pack.minAppVersion ? `App >= ${pack.minAppVersion}` : null,
    pack.platform && pack.platform.length > 0 ? `平台: ${pack.platform.join(', ')}` : null,
    pack.capabilities?.supportedLanguages && pack.capabilities.supportedLanguages.length > 0 ? `语言: ${pack.capabilities.supportedLanguages.join(', ')}` : null,
    pack.capabilities?.hasVoice ? '语音' : null,
    pack.capabilities?.hasCustomAnimations ? '自定义动画' : null,
    pack.capabilities?.has3DModel ? '3D' : null
  ].filter((value): value is string => !!value);
}

export default function SpritePackManager({ afterRuntimeChange, editorExtra, editorPresentation = 'window' }: SpritePackManagerProps): JSX.Element {
  const [packs, setPacks] = useState<CharacterPackSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [importPrompt, setImportPrompt] = useState<ImportPromptState | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CharacterPackSummary | null>(null);
  const [editor, setEditor] = useState<SpritePackEditorState | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const nextPacks = await window.YUA.persona.listCharacterPacks();
      setPacks(nextPacks ?? []);
    } catch (error) {
      console.error('Failed to load character packs:', error);
      toast.error('读取角色包失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unsubscribe = window.YUA.persona.onCharacterSwitched(async () => {
      await refresh();
      await afterRuntimeChange?.();
    });
    return () => {
      unsubscribe();
    };
  }, [afterRuntimeChange, refresh]);

  const activePack = useMemo(() => packs.find((pack) => pack.isActive) ?? null, [packs]);

  const runAfterPackMutation = useCallback(async (): Promise<void> => {
    await refresh();
    await afterRuntimeChange?.();
  }, [afterRuntimeChange, refresh]);

  useEffect(() => {
    return subscribeSpritePackEditorEvents(() => {
      void runAfterPackMutation();
    });
  }, [runAfterPackMutation]);

  const handleActivatePack = useCallback(
    async (pack: CharacterPackSummary): Promise<void> => {
      const actionKey = getPackBusyKey('activate', pack);
      setBusyKey(actionKey);
      try {
        const result = (await window.YUA.persona.activateCharacterPack(pack.id, pack.source)) as CharacterPackMutationResult | null;
        if (!result?.ok) {
          throw new Error(result?.error || `激活角色包失败: ${pack.name}`);
        }

        await runAfterPackMutation();
        toast.success(`已切换到 ${result.pack?.name ?? pack.name}`);
      } catch (error) {
        console.error('Failed to activate character pack:', error);
        toast.error('激活角色包失败');
      } finally {
        setBusyKey(null);
      }
    },
    [runAfterPackMutation]
  );

  const openImportPrompt = useCallback((inspection: Awaited<ReturnType<typeof window.YUA.persona.inspectCharacterPackFromArchive>>): void => {
    setImportPrompt({
      inspection,
      activateAfterInstall: false
    });
  }, []);

  const inspectArchiveImport = useCallback(
    async (archivePath: string): Promise<void> => {
      setBusyKey('inspect-archive');
      try {
        const inspection = await window.YUA.persona.inspectCharacterPackFromArchive(archivePath);
        openImportPrompt(inspection);
      } catch (error) {
        console.error('Failed to inspect character pack archive:', error);
        toast.error(formatActionError('读取角色包信息失败', error));
      } finally {
        setBusyKey(null);
      }
    },
    [openImportPrompt]
  );

  const installFromArchive = useCallback(
    async (archivePath: string, options?: CharacterPackMutationOptions): Promise<void> => {
      setBusyKey('install-archive');
      try {
        const result = (await window.YUA.persona.installCharacterPackFromArchive(archivePath, {
          replaceExisting: options?.replaceExisting,
          activate: options?.activate
        })) as CharacterPackMutationResult | null;

        if (!result?.ok) {
          throw new Error(result?.error || `导入角色包失败: ${archivePath}`);
        }

        await runAfterPackMutation();
        if (result.pack?.name && options?.activate) {
          toast.success(`${result.pack.name} 已导入并切换`);
        } else {
          toast.success(`${result.pack?.name ?? '角色包'} 已导入`);
        }
      } catch (error) {
        console.error('Failed to install character pack archive:', error);
        toast.error(formatActionError('导入角色包失败', error));
      } finally {
        setBusyKey(null);
      }
    },
    [runAfterPackMutation]
  );

  const handleImportArchive = useCallback(async (): Promise<void> => {
    const pick = await window.YUA.file['file:pickFile']({
      filters: [
        { name: 'Chobits Character Pack', extensions: [CHARACTER_PACK_ARCHIVE_EXTENSION_NAME] },
        { name: 'Zip Archive', extensions: ['zip'] }
      ],
      multi: false
    });

    if (pick.canceled || !pick.path) {
      return;
    }

    await inspectArchiveImport(pick.path);
  }, [inspectArchiveImport]);

  const handleExportPack = useCallback(async (pack: CharacterPackSummary): Promise<void> => {
    const save = await window.YUA.file['file:saveFile']({
      title: '导出角色包',
      defaultPath: buildCharacterPackExportFilename(pack),
      filters: [
        { name: 'Chobits Character Pack', extensions: [CHARACTER_PACK_ARCHIVE_EXTENSION_NAME] },
        { name: 'Zip Archive', extensions: ['zip'] }
      ]
    });

    if (save.canceled || !save.path) {
      return;
    }

    const actionKey = getPackBusyKey('export', pack);
    setBusyKey(actionKey);
    try {
      const result = (await window.YUA.persona.exportCharacterPack(pack.id, save.path, pack.source)) as (CharacterPackExportResult & { ok: true }) | null;
      if (!result?.ok) {
        throw new Error(`导出角色包失败: ${pack.name}`);
      }

      toast.success(`${result.pack.name} 已导出为 zip`);
      await window.YUA.file['file:reveal'](result.outputPath);
    } catch (error) {
      console.error('Failed to export character pack:', error);
      toast.error(formatActionError('导出角色包失败', error));
    } finally {
      setBusyKey(null);
    }
  }, []);

  const handleConfirmImport = useCallback(async (): Promise<void> => {
    if (!importPrompt || !importPrompt.inspection.installable) {
      return;
    }

    const currentPrompt = importPrompt;
    setImportPrompt(null);
    await installFromArchive(currentPrompt.inspection.sourcePath, {
      replaceExisting: currentPrompt.inspection.requiresReplace,
      activate: currentPrompt.activateAfterInstall
    });
  }, [importPrompt, installFromArchive]);

  const handleRemovePack = useCallback(async (): Promise<void> => {
    if (!removeTarget) return;

    const target = removeTarget;
    setBusyKey(getPackBusyKey('remove', target));
    try {
      const result = (await window.YUA.persona.removeCharacterPack(target.id, target.source)) as CharacterPackMutationResult | null;
      if (!result?.ok) {
        throw new Error(result?.error || `删除角色包失败: ${target.name}`);
      }

      setRemoveTarget(null);
      await runAfterPackMutation();
      if (result.switchedActivePack && result.activePack?.name) {
        toast.success(`已删除 ${target.name}，当前切回 ${result.activePack.name}`);
      } else {
        toast.success(`已删除 ${target.name}`);
      }
    } catch (error) {
      console.error('Failed to remove character pack:', error);
      toast.error('删除角色包失败');
    } finally {
      setBusyKey(null);
    }
  }, [removeTarget, runAfterPackMutation]);

  const openEditorWindow = useCallback(async (payload: SpritePackEditorWindowPayload): Promise<void> => {
    await window.YUA.window['window:open'](SPRITE_PACK_EDITOR_WINDOW_KEY as any, payload, { sameDisplayAsSender: true });
  }, []);

  const handleCreatePack = useCallback((): void => {
    if (editorPresentation === 'window') {
      void openEditorWindow({ mode: 'create' });
      return;
    }

    const basePack = activePack ?? packs.find((pack) => pack.source === 'builtin') ?? packs[0] ?? undefined;
    setEditor(buildCreateSpritePackEditorState(basePack, packs));
  }, [activePack, editorPresentation, openEditorWindow, packs]);

  const handleEditPack = useCallback(
    async (pack: CharacterPackSummary): Promise<void> => {
      if (editorPresentation === 'window') {
        await openEditorWindow({ mode: 'edit', packId: pack.id, source: pack.source });
        return;
      }

      setBusyKey(getPackBusyKey('editor-draft', pack));
      try {
        setEditor(await loadSpritePackEditorStateForPack(pack, packs));
      } catch (error) {
        console.error('Failed to load character pack editor:', error);
        toast.error(formatActionError('读取角色包草稿失败', error));
      } finally {
        setBusyKey(null);
      }
    },
    [editorPresentation, openEditorWindow, packs]
  );

  const handleSaveEditor = useCallback(async (): Promise<void> => {
    if (!editor) return;

    setBusyKey('editor-save');
    try {
      const result = await saveSpritePackEditorState(editor, packs);
      setEditor(null);
      await runAfterPackMutation();
      toast.success(editor.activateAfterSave ? `${result.pack?.name ?? editor.draft.pack.name} 已保存并切换` : `${result.pack?.name ?? editor.draft.pack.name} 已保存`);
    } catch (error) {
      console.error('Failed to save character pack editor draft:', error);
      toast.error(formatActionError('保存角色包失败', error));
    } finally {
      setBusyKey(null);
    }
  }, [editor, packs, runAfterPackMutation]);

  const importPreviewMedia = getInspectionPreviewMedia(importPrompt);
  const importMetadataBadges = importPrompt ? getPackMetadataBadges(importPrompt.inspection.pack) : [];
  const importTrustBadges = importPrompt ? getPackTrustBadges(importPrompt.inspection.pack) : [];
  const importSignatureSummary = importPrompt ? formatSignatureSummary(importPrompt.inspection.pack) : null;
  const editorUsesExpandedModal = editorPresentation === 'modal';
  const editorDialogContentClassName = editorUsesExpandedModal
    ? 'grid h-[min(92vh,900px)] w-[min(1180px,calc(100vw-32px))] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0'
    : 'max-h-[88vh] max-w-4xl overflow-y-auto';
  const editorHeaderClassName = editorUsesExpandedModal ? 'border-b border-border/60 px-6 py-5 pr-12' : undefined;
  const editorBodyClassName = editorUsesExpandedModal ? 'min-h-0 overflow-y-auto px-6 py-5' : undefined;
  const editorFooterClassName = editorUsesExpandedModal ? 'border-t border-border/60 px-6 py-4' : undefined;

  return (
    <>
      <div className="space-y-4 mb-5">
        <div className="p-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleCreatePack} disabled={busyKey === 'editor-save'}>
              <TbPlus />
              创建
            </Button>
            <Button variant={'outline'} size="sm" onClick={() => void handleImportArchive()} disabled={busyKey === 'inspect-archive' || busyKey === 'install-archive'}>
              {busyKey === 'inspect-archive' || busyKey === 'install-archive' ? <TbLoader2 className="animate-spin" /> : <TbArchive />}
              导入
            </Button>
            <Button size="icon" className="w-8 h-8" variant="ghost" onClick={() => void refresh()} disabled={loading}>
              {loading ? <TbLoader2 className="animate-spin" /> : <TbRefresh />}
            </Button>
          </div>
        </div>

        <SettingGroup title="已发现角色包">
          {packs.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">当前还没有可用的角色包。</div>
          ) : (
            packs.map((pack) => {
              const packBusyState = getPackBusyState(busyKey, pack);
              const packPreviewMedia = getPackPreviewMedia(pack);
              const packMetadataBadges = getPackMetadataBadges(pack);
              const packTrustBadges = getPackTrustBadges(pack);
              return (
                <SettingItem
                  key={`${pack.source}:${pack.id}`}
                  title={pack.name}
                  description={`${formatPackSource(pack.source)} · v${pack.version}${pack.description ? ` · ${pack.description}` : ''}`}
                  action={
                    <TooltipProvider delayDuration={120}>
                      <div className="flex items-center gap-1">
                        {pack.isActive ? (
                          <PackActionButton label="当前使用" disabled>
                            <TbCheck className="h-4 w-4" />
                          </PackActionButton>
                        ) : (
                          <PackActionButton label="切换" onClick={() => void handleActivatePack(pack)} disabled={packBusyState.active}>
                            {packBusyState.key === getPackBusyKey('activate', pack) ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbCheck className="h-4 w-4" />}
                          </PackActionButton>
                        )}
                        <PackActionButton label="打开" onClick={() => void window.YUA.file['file:openPath'](pack.rootDir)}>
                          <TbFolderOpen className="h-4 w-4" />
                        </PackActionButton>
                        <PackActionButton label="导出" onClick={() => void handleExportPack(pack)} disabled={packBusyState.active}>
                          {packBusyState.key === getPackBusyKey('export', pack) ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbDownload className="h-4 w-4" />}
                        </PackActionButton>
                        <PackActionButton label="编辑" onClick={() => void handleEditPack(pack)} disabled={packBusyState.active || busyKey === getPackBusyKey('editor-draft', pack)}>
                          {busyKey === getPackBusyKey('editor-draft', pack) ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbPencil className="h-4 w-4" />}
                        </PackActionButton>
                        {pack.source === 'installed' && (
                          <PackActionButton
                            label="删除"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setRemoveTarget(pack)}
                            disabled={packBusyState.active}
                          >
                            {packBusyState.key === getPackBusyKey('remove', pack) ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbTrash className="h-4 w-4" />}
                          </PackActionButton>
                        )}
                      </div>
                    </TooltipProvider>
                  }
                >
                  <div className="flex items-start gap-3">
                    {packPreviewMedia ? (
                      packPreviewMedia.kind === 'video' ? (
                        <video src={packPreviewMedia.src} aria-label={pack.name} className="h-14 w-14 shrink-0 rounded-md object-cover" autoPlay loop muted playsInline preload="metadata" />
                      ) : (
                        <img src={packPreviewMedia.src} alt={pack.name} className="h-14 w-14 shrink-0 rounded-md object-cover" />
                      )
                    ) : (
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] text-muted-foreground">无预览</div>
                    )}
                    <div className="min-w-0 flex-1 space-y-2">
                      {(pack.tags.length > 0 || packMetadataBadges.length > 0 || packTrustBadges.length > 0) && (
                        <div className="flex flex-wrap gap-1">
                          {packMetadataBadges.map((badge) => (
                            <span key={badge} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {badge}
                            </span>
                          ))}
                          {packTrustBadges.map((badge) => (
                            <span key={badge} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              {badge}
                            </span>
                          ))}
                          {pack.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground">{formatPackTrustSummary(pack)}</div>
                      {pack.trust.links.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          {pack.trust.links.map((link) => (
                            <a key={`${link.label}:${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              {formatTrustLinkLabel(link.label)}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </SettingItem>
              );
            })
          )}
        </SettingGroup>
      </div>

      <AlertDialog open={!!importPrompt} onOpenChange={(open) => !open && setImportPrompt(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{!importPrompt?.inspection.installable ? '角色包暂不可安装' : importPrompt?.inspection.requiresReplace ? '替换已安装角色包？' : '安装角色包'}</AlertDialogTitle>
            <AlertDialogDescription>
              {!importPrompt?.inspection.installable
                ? `已读取到角色包 ${importPrompt?.inspection.pack.name}，但当前运行环境还不满足安装条件。你可以先查看下面的阻塞原因，再决定是否升级应用或调整角色包格式。`
                : importPrompt?.inspection.requiresReplace
                  ? `检测到同 ID 的已安装角色包：${importPrompt.inspection.pack.name}。继续后会覆盖已安装内容；如果当前运行时正在使用这个角色包，也会同步刷新。`
                  : `即将导入角色包 ${importPrompt?.inspection.pack.name}。确认后会写入本地角色包目录。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {importPrompt && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                {importPreviewMedia ? (
                  importPreviewMedia.kind === 'video' ? (
                    <video
                      src={importPreviewMedia.src}
                      aria-label={importPrompt.inspection.pack.name}
                      className="h-16 w-16 rounded-md object-cover shrink-0"
                      autoPlay
                      loop
                      muted
                      playsInline
                      preload="metadata"
                    />
                  ) : (
                    <img src={importPreviewMedia.src} alt={importPrompt.inspection.pack.name} className="h-16 w-16 rounded-md object-cover shrink-0" />
                  )
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">无预览</div>
                )}
                <div className="min-w-0 space-y-1 text-sm">
                  <div className="font-medium text-foreground">{importPrompt.inspection.pack.name}</div>
                  <div className="text-xs text-muted-foreground">
                    ID: {importPrompt.inspection.pack.id} · v{importPrompt.inspection.pack.version} · {importPrompt.inspection.pack.author}
                  </div>
                  {importPrompt.inspection.pack.description && <div className="text-xs text-muted-foreground">{importPrompt.inspection.pack.description}</div>}
                  {(importPrompt.inspection.pack.tags.length > 0 || importMetadataBadges.length > 0 || importTrustBadges.length > 0) && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {importMetadataBadges.map((badge) => (
                        <span key={badge} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                          {badge}
                        </span>
                      ))}
                      {importTrustBadges.map((badge) => (
                        <span key={badge} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                          {badge}
                        </span>
                      ))}
                      {importPrompt.inspection.pack.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                <div className="text-sm font-medium text-foreground">来源与信任</div>
                <div>信任摘要：{formatPackTrustSummary(importPrompt.inspection.pack)}</div>
                {importSignatureSummary && <div>签名声明：{importSignatureSummary}</div>}
                <div>{importPrompt.inspection.pack.trust.note}</div>
                {importPrompt.inspection.pack.trust.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {importPrompt.inspection.pack.trust.links.map((link) => (
                      <a key={`${link.label}:${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {formatTrustLinkLabel(link.label)}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                <div>来源：{importPrompt.inspection.sourcePath}</div>
                {importPrompt.inspection.activePack && <div>当前角色包：{importPrompt.inspection.activePack.name}</div>}
                {importPrompt.inspection.existingPack && (
                  <div>
                    已安装冲突项：{importPrompt.inspection.existingPack.name} ({formatPackSource(importPrompt.inspection.existingPack.source)})
                  </div>
                )}
                {importPrompt.inspection.willReplaceActive && <div className="text-amber-600">该角色包当前正在使用，替换后会立即刷新当前 runtime。</div>}
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                <div className="text-sm font-medium text-foreground">兼容性检查</div>
                <div>
                  Pack Format：v{importPrompt.inspection.pack.formatVersion} / 当前支持至 v{importPrompt.inspection.compatibility.supportedFormatVersion}
                </div>
                {importPrompt.inspection.compatibility.currentAppVersion && (
                  <div>
                    应用版本：{importPrompt.inspection.compatibility.currentAppVersion}
                    {importPrompt.inspection.compatibility.minAppVersion ? ` / 角色包要求 >= ${importPrompt.inspection.compatibility.minAppVersion}` : ' / 角色包未声明最低版本'}
                  </div>
                )}
                <div>
                  平台：{importPrompt.inspection.compatibility.currentPlatform}
                  {importPrompt.inspection.pack.platform && importPrompt.inspection.pack.platform.length > 0
                    ? ` / 角色包声明 ${importPrompt.inspection.pack.platform.join(', ')}`
                    : ' / 角色包未限制平台'}
                </div>
                {importPrompt.inspection.pack.capabilities?.supportedLanguages && importPrompt.inspection.pack.capabilities.supportedLanguages.length > 0 && (
                  <div>支持语言：{importPrompt.inspection.pack.capabilities.supportedLanguages.join(', ')}</div>
                )}
              </div>

              {importPrompt.inspection.blockingErrors.length > 0 && (
                <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <TbShieldX className="h-4 w-4 text-red-500" />
                    当前不可安装
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {importPrompt.inspection.blockingErrors.map((error) => (
                      <div key={error.code}>{error.message}</div>
                    ))}
                  </div>
                </div>
              )}

              {importPrompt.inspection.warnings.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                  <div className="text-sm font-medium text-foreground">导入警告</div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {importPrompt.inspection.warnings.map((warning) => (
                      <div key={warning.code}>{warning.message}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">安装后立即切换</div>
                  <div className="text-xs text-muted-foreground">
                    {!importPrompt.inspection.installable
                      ? '当前角色包尚未通过安装校验，暂时不能切换。'
                      : importPrompt.inspection.willReplaceActive
                        ? '当前角色包会在替换后保持激活，无需额外切换。'
                        : '开启后，安装完成会直接切换到这个角色包。'}
                  </div>
                </div>
                <Switch
                  checked={importPrompt.activateAfterInstall || importPrompt.inspection.willReplaceActive}
                  onCheckedChange={(checked) => {
                    setImportPrompt((current) => (current ? { ...current, activateAfterInstall: checked } : current));
                  }}
                  disabled={!importPrompt.inspection.installable || importPrompt.inspection.willReplaceActive || busyKey === getImportBusyKey()}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmImport()} disabled={!!importPrompt && (!importPrompt.inspection.installable || busyKey === getImportBusyKey())}>
              {!importPrompt?.inspection.installable ? '当前不可安装' : importPrompt?.inspection.requiresReplace ? '确认替换' : '确认安装'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除角色包</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.isActive ? `当前正在使用 ${removeTarget?.name}。删除前会先切回其他可用角色包，再移除此安装包。` : `将从本地移除 ${removeTarget?.name} 的安装目录。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeTarget && <SettingPath path={maskPath(removeTarget.rootDir)} />}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemovePack()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className={editorDialogContentClassName}>
          <DialogHeader className={editorHeaderClassName}>
            <DialogTitle>{getSpritePackEditorTitle(editor)}</DialogTitle>
            <DialogDescription>{getSpritePackEditorDescription(editor)}</DialogDescription>
          </DialogHeader>

          <div className={editorBodyClassName}>
            {editor && (
              <SpritePackEditorContent
                editor={editor}
                setEditor={setEditor}
                extra={editorExtra ? <div className={editorUsesExpandedModal ? 'mt-5 border-t border-border/60 pt-5' : 'mt-4'}>{editorExtra}</div> : undefined}
              />
            )}
          </div>

          <DialogFooter className={editorFooterClassName}>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={busyKey === 'editor-save'}>
              取消
            </Button>
            <Button onClick={() => void handleSaveEditor()} disabled={busyKey === 'editor-save'}>
              {busyKey === 'editor-save' && <TbLoader2 className="h-4 w-4 animate-spin mr-1" />}
              保存角色包
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
