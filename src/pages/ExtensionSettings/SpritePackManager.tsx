import { CHARACTER_PACK_ARCHIVE_EXTENSION, CHARACTER_PACK_ARCHIVE_EXTENSION_NAME } from '@packages/sprite-core/character-pack-archive';
import type {
  CharacterPackEditorDraft,
  CharacterPackEditorSaveOptions,
  CharacterPackExportResult,
  CharacterPackSummary,
  CharacterPackTrustAssessment
} from '@packages/sprite-core/character-pack-manager';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { TbArchive, TbCheck, TbCopy, TbDownload, TbFolderOpen, TbLoader2, TbPencil, TbPlus, TbRefresh, TbShieldX, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { makeResSrc } from '@/pages/ResourcePage/utils/resourceProtocol';
import { SettingGroup, SettingItem, SettingPath } from '@/pages/SettingsPage/components/SettingComponents';

interface SpritePackManagerProps {
  afterRuntimeChange?: () => Promise<void> | void;
  editorExtra?: ReactNode;
}

interface ImportPromptState {
  inspection: Awaited<ReturnType<typeof window.YUA.persona.inspectCharacterPackFromArchive>>;
  activateAfterInstall: boolean;
}

interface EditorState {
  mode: 'create' | 'edit';
  draft: CharacterPackEditorDraft;
  basePack?: CharacterPackSummary;
  targetPack?: CharacterPackSummary;
  activateAfterSave: boolean;
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
  character?: CharacterInfoSummary | null;
  personaSlot?: {
    slotId: string;
    restored: boolean;
    switched: boolean;
  };
}

type CharacterPackEditorMutationResult = CharacterPackMutationResult & {
  created?: boolean;
  updated?: boolean;
};

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

function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinLines(value: string[] | undefined): string {
  return (value ?? []).join('\n');
}

function slugifyCharacterPackId(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/[^a-z0-9]+$/, '');
  return normalized || 'custom-character';
}

function getUniquePackId(candidate: string, packs: CharacterPackSummary[]): string {
  const baseId = slugifyCharacterPackId(candidate);
  const existingIds = new Set(packs.filter((pack) => pack.source === 'installed').map((pack) => pack.id));
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  for (let index = 2; index < 1000; index += 1) {
    const nextId = `${baseId}-${index}`;
    if (!existingIds.has(nextId)) {
      return nextId;
    }
  }

  return `${baseId}-${Date.now().toString(36)}`;
}

function withEditorDraft(editor: EditorState | null, update: (draft: CharacterPackEditorDraft) => CharacterPackEditorDraft): EditorState | null {
  if (!editor) return editor;
  return {
    ...editor,
    draft: update(editor.draft)
  };
}

function buildNewCharacterPackDraft(basePack: CharacterPackSummary | null | undefined, packs: CharacterPackSummary[]): CharacterPackEditorDraft {
  const seed = basePack?.name ? `${basePack.name} 自定义版` : '我的自定义角色';
  const id = getUniquePackId(`custom-${Date.now().toString(36)}`, packs);
  return {
    pack: {
      id,
      name: seed,
      version: '1.0.0',
      author: 'Local User',
      description: '本地创建的自定义角色包',
      license: 'Custom',
      tags: ['custom'],
      platform: [window.YUA.platform]
    },
    character: {
      id,
      name: seed,
      nameAliases: [],
      tagline: '我的桌面伙伴',
      background: '你是一个居住在用户电脑桌面上的智能精灵，会陪伴用户工作、学习和生活。',
      coreTraits: ['温暖真诚', '认真负责', '有一点自己的小个性'],
      boundaries: ['真诚帮助，不表演。', '像人一样自然说话。', '遇到问题先尝试解决，实在卡住再询问用户。'],
      speechTone: '温和、自然、略带活泼',
      language: 'zh-CN',
      firstPerson: '我',
      addressUser: '你',
      quirks: ['偶尔用轻快的语气回应', '完成任务时会简短确认结果'],
      speechExamples: [
        { situation: '打招呼', response: '嗨，今天想做点什么？' },
        { situation: '完成任务', response: '搞定啦。' }
      ],
      metaDescription: '本地创建的自定义角色',
      metaTags: ['custom', 'assistant']
    }
  };
}

function validateEditorDraft(draft: CharacterPackEditorDraft): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(draft.pack.id.trim())) {
    return '角色包 ID 只能使用小写字母、数字、点、横线或下划线。';
  }
  if (!draft.pack.name.trim()) return '角色包名称不能为空。';
  if (!draft.pack.version.trim()) return '版本不能为空。';
  if (!draft.pack.author.trim()) return '作者不能为空。';
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(draft.character.id.trim())) {
    return '角色 ID 只能使用小写字母、数字、点、横线或下划线。';
  }
  if (!draft.character.name.trim()) return '角色名称不能为空。';
  if (!draft.character.tagline.trim()) return '角色标语不能为空。';
  if (!draft.character.background.trim()) return '角色背景不能为空。';
  if (!draft.character.speechTone.trim()) return '说话语气不能为空。';
  return null;
}

export default function SpritePackManager({ afterRuntimeChange, editorExtra }: SpritePackManagerProps): JSX.Element {
  const [packs, setPacks] = useState<CharacterPackSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [importPrompt, setImportPrompt] = useState<ImportPromptState | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CharacterPackSummary | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

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

  const handleCreatePack = useCallback((): void => {
    const basePack = activePack ?? packs.find((pack) => pack.source === 'builtin') ?? packs[0] ?? undefined;
    setEditor({
      mode: 'create',
      draft: buildNewCharacterPackDraft(basePack, packs),
      basePack,
      activateAfterSave: true
    });
  }, [activePack, packs]);

  const handleClonePack = useCallback(
    async (pack: CharacterPackSummary): Promise<void> => {
      setBusyKey(getPackBusyKey('editor-draft', pack));
      try {
        const draft = await window.YUA.persona.getCharacterPackEditorDraft(pack.id, pack.source);
        if (!draft) {
          throw new Error(`读取角色包草稿失败: ${pack.name}`);
        }

        const nextId = getUniquePackId(`${draft.pack.id}-custom`, packs);
        setEditor({
          mode: 'create',
          draft: {
            ...draft,
            pack: {
              ...draft.pack,
              id: nextId,
              name: `${draft.pack.name} 自定义版`,
              author: draft.pack.author || 'Local User'
            },
            character: {
              ...draft.character,
              id: getUniquePackId(`${draft.character.id}-custom`, packs),
              name: `${draft.character.name} 自定义版`
            }
          },
          basePack: pack,
          activateAfterSave: true
        });
      } catch (error) {
        console.error('Failed to clone character pack draft:', error);
        toast.error(formatActionError('读取角色包草稿失败', error));
      } finally {
        setBusyKey(null);
      }
    },
    [packs]
  );

  const handleEditPack = useCallback(
    async (pack: CharacterPackSummary): Promise<void> => {
      if (pack.source !== 'installed') {
        await handleClonePack(pack);
        return;
      }

      setBusyKey(getPackBusyKey('editor-draft', pack));
      try {
        const draft = await window.YUA.persona.getCharacterPackEditorDraft(pack.id, pack.source);
        if (!draft) {
          throw new Error(`读取角色包草稿失败: ${pack.name}`);
        }

        setEditor({
          mode: 'edit',
          draft,
          targetPack: pack,
          basePack: pack,
          activateAfterSave: pack.isActive
        });
      } catch (error) {
        console.error('Failed to load character pack editor:', error);
        toast.error(formatActionError('读取角色包草稿失败', error));
      } finally {
        setBusyKey(null);
      }
    },
    [handleClonePack]
  );

  const updateEditorPack = useCallback((patch: Partial<CharacterPackEditorDraft['pack']>): void => {
    setEditor((current) =>
      withEditorDraft(current, (draft) => ({
        ...draft,
        pack: {
          ...draft.pack,
          ...patch
        }
      }))
    );
  }, []);

  const updateEditorCharacter = useCallback((patch: Partial<CharacterPackEditorDraft['character']>): void => {
    setEditor((current) =>
      withEditorDraft(current, (draft) => ({
        ...draft,
        character: {
          ...draft.character,
          ...patch
        }
      }))
    );
  }, []);

  const updateEditorExample = useCallback((index: number, patch: Partial<CharacterPackEditorDraft['character']['speechExamples'][number]>): void => {
    setEditor((current) =>
      withEditorDraft(current, (draft) => {
        const speechExamples = draft.character.speechExamples.map((entry, entryIndex) => (entryIndex === index ? { ...entry, ...patch } : entry));
        return {
          ...draft,
          character: {
            ...draft.character,
            speechExamples
          }
        };
      })
    );
  }, []);

  const removeEditorExample = useCallback((index: number): void => {
    setEditor((current) =>
      withEditorDraft(current, (draft) => ({
        ...draft,
        character: {
          ...draft.character,
          speechExamples: draft.character.speechExamples.filter((_, entryIndex) => entryIndex !== index)
        }
      }))
    );
  }, []);

  const addEditorExample = useCallback((): void => {
    setEditor((current) =>
      withEditorDraft(current, (draft) => ({
        ...draft,
        character: {
          ...draft.character,
          speechExamples: [...draft.character.speechExamples, { situation: '', response: '' }]
        }
      }))
    );
  }, []);

  const handleSaveEditor = useCallback(async (): Promise<void> => {
    if (!editor) return;

    const validationError = validateEditorDraft(editor.draft);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    const idConflict = editor.mode === 'create' && packs.some((pack) => pack.source === 'installed' && pack.id === editor.draft.pack.id);
    if (idConflict) {
      toast.error('已存在同 ID 的本地角色包，请换一个角色包 ID。');
      return;
    }

    const options: CharacterPackEditorSaveOptions = {
      basePackId: editor.basePack?.id,
      basePackSource: editor.basePack?.source,
      replaceExisting: editor.mode === 'edit',
      activate: editor.activateAfterSave
    };

    setBusyKey('editor-save');
    try {
      const result = (await window.YUA.persona.saveCharacterPackEditorDraft(editor.draft, options)) as CharacterPackEditorMutationResult | null;
      if (!result?.ok) {
        throw new Error(result?.error || '保存角色包失败');
      }

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

  return (
    <>
      <div className="space-y-4 mb-5">
        <div className="p-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={handleCreatePack} disabled={busyKey === 'editor-save'}>
              <TbPlus />
              创建角色
            </Button>
            <Button size="sm" onClick={() => void handleImportArchive()} disabled={busyKey === 'inspect-archive' || busyKey === 'install-archive'}>
              {busyKey === 'inspect-archive' || busyKey === 'install-archive' ? <TbLoader2 className="animate-spin" /> : <TbArchive />}
              导入角色
            </Button>
            <Button size="sm" variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbRefresh className="h-4 w-4" />}
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
                    <div className="flex items-center gap-2">
                      {pack.isActive ? (
                        <Button size="sm" variant="secondary" disabled>
                          <TbCheck className="h-4 w-4 mr-1" />
                          当前使用
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => void handleActivatePack(pack)} disabled={packBusyState.active}>
                          {packBusyState.key === getPackBusyKey('activate', pack) ? <TbLoader2 className="h-4 w-4 animate-spin mr-1" /> : <TbCheck className="h-4 w-4 mr-1" />}
                          切换
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => void window.YUA.file['file:openPath'](pack.rootDir)}>
                        <TbFolderOpen className="h-4 w-4 mr-1" />
                        打开
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleExportPack(pack)} disabled={packBusyState.active}>
                        {packBusyState.key === getPackBusyKey('export', pack) ? <TbLoader2 className="h-4 w-4 animate-spin mr-1" /> : <TbDownload className="h-4 w-4 mr-1" />}
                        导出
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleEditPack(pack)} disabled={packBusyState.active || busyKey === getPackBusyKey('editor-draft', pack)}>
                        {busyKey === getPackBusyKey('editor-draft', pack) ? (
                          <TbLoader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : pack.source === 'installed' ? (
                          <TbPencil className="h-4 w-4 mr-1" />
                        ) : (
                          <TbCopy className="h-4 w-4 mr-1" />
                        )}
                        {pack.source === 'installed' ? '编辑' : '复制编辑'}
                      </Button>
                      {pack.source === 'installed' && (
                        <Button size="sm" variant="destructive" onClick={() => setRemoveTarget(pack)} disabled={packBusyState.active}>
                          {packBusyState.key === getPackBusyKey('remove', pack) ? <TbLoader2 className="h-4 w-4 animate-spin mr-1" /> : <TbTrash className="h-4 w-4 mr-1" />}
                          删除
                        </Button>
                      )}
                    </div>
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
                      <SettingPath path={pack.rootDir} />
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
          {removeTarget && <SettingPath path={removeTarget.rootDir} />}
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemovePack()}>确认删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-h-[88vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editor?.mode === 'edit' ? '编辑角色包' : '创建自定义角色包'}</DialogTitle>
            <DialogDescription>{editor?.basePack ? `动画和资源将继承自：${editor.basePack.name}` : '保存后会写入本地角色包目录。'}</DialogDescription>
          </DialogHeader>

          {editor && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>角色包 ID</Label>
                  <Input value={editor.draft.pack.id} onChange={(event) => updateEditorPack({ id: slugifyCharacterPackId(event.target.value) })} disabled={editor.mode === 'edit'} />
                </div>
                <div className="space-y-2">
                  <Label>角色包名称</Label>
                  <Input value={editor.draft.pack.name} onChange={(event) => updateEditorPack({ name: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>版本</Label>
                  <Input value={editor.draft.pack.version} onChange={(event) => updateEditorPack({ version: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>作者</Label>
                  <Input value={editor.draft.pack.author} onChange={(event) => updateEditorPack({ author: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>许可证</Label>
                  <Input value={editor.draft.pack.license} onChange={(event) => updateEditorPack({ license: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>平台</Label>
                  <Input value={editor.draft.pack.platform.join(', ')} onChange={(event) => updateEditorPack({ platform: splitLines(event.target.value.replace(/[,，]/g, '\n')) })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>角色包描述</Label>
                  <Textarea className="min-h-20" value={editor.draft.pack.description} onChange={(event) => updateEditorPack({ description: event.target.value })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>标签</Label>
                  <Input value={editor.draft.pack.tags.join(', ')} onChange={(event) => updateEditorPack({ tags: splitLines(event.target.value.replace(/[,，]/g, '\n')) })} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>角色 ID</Label>
                  <Input value={editor.draft.character.id} onChange={(event) => updateEditorCharacter({ id: slugifyCharacterPackId(event.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>角色名称</Label>
                  <Input value={editor.draft.character.name} onChange={(event) => updateEditorCharacter({ name: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>角色标语</Label>
                  <Input value={editor.draft.character.tagline} onChange={(event) => updateEditorCharacter({ tagline: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>别名</Label>
                  <Input value={editor.draft.character.nameAliases.join(', ')} onChange={(event) => updateEditorCharacter({ nameAliases: splitLines(event.target.value.replace(/[,，]/g, '\n')) })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>角色背景</Label>
                  <Textarea className="min-h-24" value={editor.draft.character.background} onChange={(event) => updateEditorCharacter({ background: event.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>核心性格</Label>
                  <Textarea className="min-h-32" value={joinLines(editor.draft.character.coreTraits)} onChange={(event) => updateEditorCharacter({ coreTraits: splitLines(event.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>行为边界</Label>
                  <Textarea className="min-h-32" value={joinLines(editor.draft.character.boundaries)} onChange={(event) => updateEditorCharacter({ boundaries: splitLines(event.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>说话语气</Label>
                  <Input value={editor.draft.character.speechTone} onChange={(event) => updateEditorCharacter({ speechTone: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>语言</Label>
                  <Input value={editor.draft.character.language} onChange={(event) => updateEditorCharacter({ language: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>自称</Label>
                  <Input value={editor.draft.character.firstPerson} onChange={(event) => updateEditorCharacter({ firstPerson: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>称呼用户</Label>
                  <Input value={editor.draft.character.addressUser} onChange={(event) => updateEditorCharacter({ addressUser: event.target.value })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>口癖和表达习惯</Label>
                  <Textarea className="min-h-24" value={joinLines(editor.draft.character.quirks)} onChange={(event) => updateEditorCharacter({ quirks: splitLines(event.target.value) })} />
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>对话示例</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addEditorExample}>
                    <TbPlus className="h-4 w-4 mr-1" />
                    添加示例
                  </Button>
                </div>
                <div className="space-y-2">
                  {editor.draft.character.speechExamples.map((example, index) => (
                    <div key={index} className="grid grid-cols-1 gap-2 rounded-md border border-border/60 p-2 md:grid-cols-[1fr_2fr_auto]">
                      <Input placeholder="场景" value={example.situation} onChange={(event) => updateEditorExample(index, { situation: event.target.value })} />
                      <Input placeholder="回应" value={example.response} onChange={(event) => updateEditorExample(index, { response: event.target.value })} />
                      <Button type="button" size="sm" variant="outline" onClick={() => removeEditorExample(index)}>
                        <TbTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>角色说明</Label>
                  <Textarea className="min-h-24" value={editor.draft.character.metaDescription} onChange={(event) => updateEditorCharacter({ metaDescription: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>角色标签</Label>
                  <Textarea className="min-h-24" value={joinLines(editor.draft.character.metaTags)} onChange={(event) => updateEditorCharacter({ metaTags: splitLines(event.target.value) })} />
                </div>
              </div>

              <div className="flex items-center justify-between rounded-md border border-border/60 p-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">保存后立即切换</div>
                  <div className="text-xs text-muted-foreground">会刷新当前角色人格、能力状态和动画资源。</div>
                </div>
                <Switch checked={editor.activateAfterSave} onCheckedChange={(checked) => setEditor((current) => (current ? { ...current, activateAfterSave: checked } : current))} />
              </div>
            </div>
          )}

          {editor && editorExtra && <div className="mt-4">{editorExtra}</div>}

          <DialogFooter>
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
