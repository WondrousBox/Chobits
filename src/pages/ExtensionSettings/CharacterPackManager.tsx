import { CHARACTER_PACK_ARCHIVE_EXTENSION, CHARACTER_PACK_ARCHIVE_EXTENSION_NAME } from '@packages/sprite-core/character-pack-archive';
import type { CharacterPackExportResult, CharacterPackSummary, CharacterPackTrustAssessment } from '@packages/sprite-core/character-pack-manager';
import type { TFunction } from 'i18next';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

import {
  buildCreateCharacterPackEditorState,
  CHARACTER_PACK_EDITOR_WINDOW_KEY,
  type CharacterPackEditorPresentation,
  type CharacterPackEditorState,
  type CharacterPackEditorWindowPayload,
  getCharacterPackEditorDescription,
  getCharacterPackEditorTitle,
  loadCharacterPackEditorStateForPack,
  saveCharacterPackEditorState,
  subscribeCharacterPackEditorEvents
} from './character-pack-editor-model';
import { CharacterPackEditorContent } from './CharacterPackEditor';

interface CharacterPackManagerProps {
  afterRuntimeChange?: () => Promise<void> | void;
  editorExtra?: ReactNode;
  editorPresentation?: CharacterPackEditorPresentation;
}

interface ImportPromptState {
  inspection: Awaited<ReturnType<typeof window.chobits.character.inspectCharacterPackFromArchive>>;
  activateAfterInstall: boolean;
}

interface CharacterPackMutationResult {
  ok: true;
  error?: string;
  didChange?: boolean;
  wasReplaced?: boolean;
  wasActivated?: boolean;
  didSwitchActivePack?: boolean;
  pack?: CharacterPackSummary;
  removedPack?: CharacterPackSummary;
  activePack?: CharacterPackSummary | null;
  character?: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
  characterSlot?: {
    slotId: string;
    wasRestored: boolean;
    wasSwitched: boolean;
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

function formatPackSource(t: TFunction, source: CharacterPackSummary['source']): string {
  return source === 'builtin' ? t('pack.source.builtin') : t('pack.source.installed');
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

function formatTrustLevel(t: TFunction, level: CharacterPackTrustAssessment['level']): string {
  switch (level) {
    case 'signature-declared':
      return t('trust.level.signatureDeclared');
    case 'publisher-declared':
      return t('trust.level.publisherDeclared');
    default:
      return t('trust.level.undeclared');
  }
}

function formatTrustVerificationStatus(t: TFunction, status: CharacterPackTrustAssessment['verificationStatus']): string | null {
  if (status === 'builtin-bundled') {
    return t('trust.verification.builtinBundled');
  }

  if (status === 'signature-verified') {
    return t('trust.verification.signatureVerified');
  }

  if (status === 'signature-mismatch') {
    return t('trust.verification.signatureMismatch');
  }

  if (status === 'signature-untrusted') {
    return t('trust.verification.signatureUntrusted');
  }

  if (status === 'digest-verified') {
    return t('trust.verification.digestVerified');
  }

  if (status === 'digest-mismatch') {
    return t('trust.verification.digestMismatch');
  }

  if (status === 'declared-unverified') {
    return t('trust.verification.declaredUnverified');
  }

  return null;
}

function formatSignatureVerificationStatus(t: TFunction, status: CharacterPackSignatureStatus | undefined): string | null {
  if (status === 'verified') {
    return t('trust.signature.verified');
  }

  if (status === 'mismatch') {
    return t('trust.signature.mismatch');
  }

  if (status === 'untrusted') {
    return t('trust.signature.untrusted');
  }

  if (status === 'unsupported' || status === 'error') {
    return t('trust.signature.unchecked');
  }

  return null;
}

function formatDigestVerificationStatus(t: TFunction, status: CharacterPackDigestStatus | undefined): string | null {
  if (status === 'verified') {
    return t('trust.digest.verified');
  }

  if (status === 'mismatch') {
    return t('trust.digest.mismatch');
  }

  if (status === 'unsupported' || status === 'error') {
    return t('trust.digest.unchecked');
  }

  return null;
}

function formatTrustLinkLabel(t: TFunction, label: CharacterPackTrustAssessment['links'][number]['label']): string {
  switch (label) {
    case 'homepage':
      return t('trust.link.homepage');
    case 'repository':
      return t('trust.link.repository');
    case 'support':
      return t('trust.link.support');
    default:
      return t('trust.link.canonical');
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

function formatSignatureSummary(t: TFunction, pack: TrustPackLike): string | null {
  const details = [
    pack.signature?.algorithm ? t('trust.signature.algorithm', { value: pack.signature.algorithm }) : null,
    pack.signature?.keyId ? t('trust.signature.keyId', { value: abbreviateMetadataValue(pack.signature.keyId, 22) }) : null,
    pack.signature?.digest ? t('trust.signature.digest', { value: abbreviateMetadataValue(pack.signature.digest, 28) }) : null,
    formatSignatureVerificationStatus(t, pack.trust.signatureVerification?.status),
    formatDigestVerificationStatus(t, pack.trust.digest?.status)
  ].filter((value): value is string => !!value);

  if (details.length > 0) {
    return details.join(' · ');
  }

  return pack.trust.signatureDeclared ? t('trust.signature.declaredValue') : null;
}

function getPackTrustBadges(t: TFunction, pack: TrustPackLike): string[] {
  const verificationStatus = formatTrustVerificationStatus(t, pack.trust.verificationStatus);
  const signatureStatus =
    pack.trust.verificationStatus === 'signature-verified' || pack.trust.verificationStatus === 'signature-mismatch' || pack.trust.verificationStatus === 'signature-untrusted'
      ? null
      : formatSignatureVerificationStatus(t, pack.trust.signatureVerification?.status);
  const digestStatus = pack.trust.verificationStatus === 'digest-verified' || pack.trust.verificationStatus === 'digest-mismatch' ? null : formatDigestVerificationStatus(t, pack.trust.digest?.status);

  return [
    formatTrustLevel(t, pack.trust.level),
    pack.trust.publisher ? t('trust.publisher', { name: pack.trust.publisher }) : null,
    pack.trust.channel ? t('trust.channel', { name: pack.trust.channel }) : null,
    pack.trust.signatureDeclared ? t('trust.signature.declared') : null,
    verificationStatus,
    signatureStatus,
    digestStatus
  ].filter((value): value is string => !!value);
}

function formatPackTrustSummary(t: TFunction, pack: TrustPackLike): string {
  const signatureStatus =
    pack.trust.verificationStatus === 'signature-verified' || pack.trust.verificationStatus === 'signature-mismatch' || pack.trust.verificationStatus === 'signature-untrusted'
      ? null
      : formatSignatureVerificationStatus(t, pack.trust.signatureVerification?.status);
  const digestStatus = pack.trust.verificationStatus === 'digest-verified' || pack.trust.verificationStatus === 'digest-mismatch' ? null : formatDigestVerificationStatus(t, pack.trust.digest?.status);
  const parts = [
    formatTrustLevel(t, pack.trust.level),
    pack.trust.publisher,
    pack.trust.channel,
    formatTrustVerificationStatus(t, pack.trust.verificationStatus),
    signatureStatus,
    digestStatus
  ].filter((value): value is string => !!value);

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

function formatActionError(t: TFunction, prefix: string, error: unknown): string {
  const message = getErrorMessage(error);
  return message ? t('pack.actionError', { prefix, message }) : prefix;
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

function getPackMetadataBadges(t: TFunction, pack: Pick<CharacterPackSummary, 'formatVersion' | 'minAppVersion' | 'platform' | 'capabilities'>): string[] {
  return [
    t('metadata.formatVersion', { version: pack.formatVersion }),
    pack.minAppVersion ? t('metadata.minAppVersion', { version: pack.minAppVersion }) : null,
    pack.platform && pack.platform.length > 0 ? t('metadata.platform', { platforms: pack.platform.join(', ') }) : null,
    pack.capabilities?.supportedLanguages && pack.capabilities.supportedLanguages.length > 0 ? t('metadata.languages', { languages: pack.capabilities.supportedLanguages.join(', ') }) : null,
    pack.capabilities?.hasVoice ? t('metadata.voice') : null,
    pack.capabilities?.hasCustomAnimations ? t('metadata.customAnimations') : null,
    pack.capabilities?.has3DModel ? t('metadata.model3d') : null
  ].filter((value): value is string => !!value);
}

export default function CharacterPackManager({ afterRuntimeChange, editorExtra, editorPresentation = 'window' }: CharacterPackManagerProps): JSX.Element {
  const [packs, setPacks] = useState<CharacterPackSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [importPrompt, setImportPrompt] = useState<ImportPromptState | null>(null);
  const [removeTarget, setRemoveTarget] = useState<CharacterPackSummary | null>(null);
  const [editor, setEditor] = useState<CharacterPackEditorState | null>(null);
  const { t } = useTranslation('character');

  const refresh = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const nextPacks = await window.chobits.character.listCharacterPacks();
      setPacks(nextPacks ?? []);
    } catch (error) {
      console.error('Failed to load character packs:', error);
      toast.error(t('pack.toast.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时异步加载角色包列表,加载态切换是有意的
    void refresh();
    const unsubscribe = window.chobits.character.onCharacterSwitched(async () => {
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
    return subscribeCharacterPackEditorEvents(() => {
      void runAfterPackMutation();
    });
  }, [runAfterPackMutation]);

  const handleActivatePack = useCallback(
    async (pack: CharacterPackSummary): Promise<void> => {
      const actionKey = getPackBusyKey('activate', pack);
      setBusyKey(actionKey);
      try {
        const result = (await window.chobits.character.activateCharacterPack(pack.id, pack.source)) as CharacterPackMutationResult | null;
        if (!result?.ok) {
          throw new Error(result?.error || t('pack.toast.activateFailedWithName', { name: pack.name }));
        }

        await runAfterPackMutation();
        toast.success(t('pack.toast.switched', { name: result.pack?.name ?? pack.name }));
      } catch (error) {
        console.error('Failed to activate character pack:', error);
        toast.error(t('pack.toast.activateFailed'));
      } finally {
        setBusyKey(null);
      }
    },
    [runAfterPackMutation, t]
  );

  const openImportPrompt = useCallback((inspection: Awaited<ReturnType<typeof window.chobits.character.inspectCharacterPackFromArchive>>): void => {
    setImportPrompt({
      inspection,
      activateAfterInstall: false
    });
  }, []);

  const inspectArchiveImport = useCallback(
    async (archivePath: string): Promise<void> => {
      setBusyKey('inspect-archive');
      try {
        const inspection = await window.chobits.character.inspectCharacterPackFromArchive(archivePath);
        openImportPrompt(inspection);
      } catch (error) {
        console.error('Failed to inspect character pack archive:', error);
        toast.error(formatActionError(t, t('pack.toast.inspectFailed'), error));
      } finally {
        setBusyKey(null);
      }
    },
    [openImportPrompt, t]
  );

  const installFromArchive = useCallback(
    async (archivePath: string, options?: CharacterPackMutationOptions): Promise<void> => {
      setBusyKey('install-archive');
      try {
        const result = (await window.chobits.character.installCharacterPackFromArchive(archivePath, {
          replaceExisting: options?.replaceExisting,
          activate: options?.activate
        })) as CharacterPackMutationResult | null;

        if (!result?.ok) {
          throw new Error(result?.error || t('pack.toast.importFailedWithPath', { path: archivePath }));
        }

        await runAfterPackMutation();
        if (result.pack?.name && options?.activate) {
          toast.success(t('pack.toast.importedAndActivated', { name: result.pack.name }));
        } else {
          toast.success(t('pack.toast.imported', { name: result.pack?.name ?? t('pack.fallbackName') }));
        }
      } catch (error) {
        console.error('Failed to install character pack archive:', error);
        toast.error(formatActionError(t, t('pack.toast.importFailed'), error));
      } finally {
        setBusyKey(null);
      }
    },
    [runAfterPackMutation, t]
  );

  const handleImportArchive = useCallback(async (): Promise<void> => {
    const pick = await window.chobits.file['file:pick-file']({
      filters: [
        { name: 'Chobits Character Pack', extensions: [CHARACTER_PACK_ARCHIVE_EXTENSION_NAME] },
        { name: 'Zip Archive', extensions: ['zip'] }
      ],
      multi: false
    });

    if (!pick.ok || !pick.path) {
      return;
    }

    await inspectArchiveImport(pick.path);
  }, [inspectArchiveImport]);

  const handleExportPack = useCallback(
    async (pack: CharacterPackSummary): Promise<void> => {
      const save = await window.chobits.file['file:save-file']({
        title: t('pack.exportDialogTitle'),
        defaultPath: buildCharacterPackExportFilename(pack),
        filters: [
          { name: 'Chobits Character Pack', extensions: [CHARACTER_PACK_ARCHIVE_EXTENSION_NAME] },
          { name: 'Zip Archive', extensions: ['zip'] }
        ]
      });

      if (!save.ok || !save.path) {
        return;
      }

      const actionKey = getPackBusyKey('export', pack);
      setBusyKey(actionKey);
      try {
        const result = (await window.chobits.character.exportCharacterPack(pack.id, save.path, pack.source)) as (CharacterPackExportResult & { ok: true }) | null;
        if (!result?.ok) {
          throw new Error(t('pack.toast.exportFailedWithName', { name: pack.name }));
        }

        toast.success(t('pack.toast.exported', { name: result.pack.name }));
        await window.chobits.file['file:reveal'](result.outputPath);
      } catch (error) {
        console.error('Failed to export character pack:', error);
        toast.error(formatActionError(t, t('pack.toast.exportFailed'), error));
      } finally {
        setBusyKey(null);
      }
    },
    [t]
  );

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
      const result = (await window.chobits.character.removeCharacterPack(target.id, target.source)) as CharacterPackMutationResult | null;
      if (!result?.ok) {
        throw new Error(result?.error || t('pack.toast.removeFailedWithName', { name: target.name }));
      }

      setRemoveTarget(null);
      await runAfterPackMutation();
      if (result.didSwitchActivePack && result.activePack?.name) {
        toast.success(t('pack.toast.removedAndSwitched', { name: target.name, activeName: result.activePack.name }));
      } else {
        toast.success(t('pack.toast.removed', { name: target.name }));
      }
    } catch (error) {
      console.error('Failed to remove character pack:', error);
      toast.error(t('pack.toast.removeFailed'));
    } finally {
      setBusyKey(null);
    }
  }, [removeTarget, runAfterPackMutation, t]);

  const openEditorWindow = useCallback(async (payload: CharacterPackEditorWindowPayload): Promise<void> => {
    await window.chobits.window['window:open'](CHARACTER_PACK_EDITOR_WINDOW_KEY as any, payload, { sameDisplayAsSender: true });
  }, []);

  const handleCreatePack = useCallback((): void => {
    if (editorPresentation === 'window') {
      void openEditorWindow({ mode: 'create' });
      return;
    }

    const basePack = activePack ?? packs.find((pack) => pack.source === 'builtin') ?? packs[0] ?? undefined;
    setEditor(buildCreateCharacterPackEditorState(t, basePack, packs));
  }, [activePack, editorPresentation, openEditorWindow, packs, t]);

  const handleEditPack = useCallback(
    async (pack: CharacterPackSummary): Promise<void> => {
      if (editorPresentation === 'window') {
        await openEditorWindow({ mode: 'edit', packId: pack.id, source: pack.source });
        return;
      }

      setBusyKey(getPackBusyKey('editor-draft', pack));
      try {
        setEditor(await loadCharacterPackEditorStateForPack(t, pack, packs));
      } catch (error) {
        console.error('Failed to load character pack editor:', error);
        toast.error(formatActionError(t, t('pack.toast.draftLoadFailed'), error));
      } finally {
        setBusyKey(null);
      }
    },
    [editorPresentation, openEditorWindow, packs, t]
  );

  const handleSaveEditor = useCallback(async (): Promise<void> => {
    if (!editor) return;

    setBusyKey('editor-save');
    try {
      const result = await saveCharacterPackEditorState(t, editor, packs);
      setEditor(null);
      await runAfterPackMutation();
      const savedPackName = result.pack?.name ?? editor.draft.pack.name;
      toast.success(editor.activateAfterSave ? t('editor.toast.savedAndActivated', { name: savedPackName }) : t('editor.toast.saved', { name: savedPackName }));
    } catch (error) {
      console.error('Failed to save character pack editor draft:', error);
      toast.error(formatActionError(t, t('editor.error.saveFailed'), error));
    } finally {
      setBusyKey(null);
    }
  }, [editor, packs, runAfterPackMutation, t]);

  const importPreviewMedia = getInspectionPreviewMedia(importPrompt);
  const importMetadataBadges = importPrompt ? getPackMetadataBadges(t, importPrompt.inspection.pack) : [];
  const importTrustBadges = importPrompt ? getPackTrustBadges(t, importPrompt.inspection.pack) : [];
  const importSignatureSummary = importPrompt ? formatSignatureSummary(t, importPrompt.inspection.pack) : null;
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
              {t('pack.action.create')}
            </Button>
            <Button variant={'outline'} size="sm" onClick={() => void handleImportArchive()} disabled={busyKey === 'inspect-archive' || busyKey === 'install-archive'}>
              {busyKey === 'inspect-archive' || busyKey === 'install-archive' ? <TbLoader2 className="animate-spin" /> : <TbArchive />}
              {t('pack.action.import')}
            </Button>
            <Button size="icon" className="w-8 h-8" variant="ghost" onClick={() => void refresh()} disabled={isLoading}>
              {isLoading ? <TbLoader2 className="animate-spin" /> : <TbRefresh />}
            </Button>
          </div>
        </div>

        <SettingGroup title={t('pack.listTitle')}>
          {packs.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">{t('pack.empty')}</div>
          ) : (
            packs.map((pack) => {
              const packBusyState = getPackBusyState(busyKey, pack);
              const packPreviewMedia = getPackPreviewMedia(pack);
              const packMetadataBadges = getPackMetadataBadges(t, pack);
              const packTrustBadges = getPackTrustBadges(t, pack);
              return (
                <SettingItem
                  key={`${pack.source}:${pack.id}`}
                  title={pack.name}
                  description={`${formatPackSource(t, pack.source)} · v${pack.version}${pack.description ? ` · ${pack.description}` : ''}`}
                  action={
                    <TooltipProvider delayDuration={120}>
                      <div className="flex items-center gap-1">
                        {pack.isActive ? (
                          <PackActionButton label={t('pack.action.current')} disabled>
                            <TbCheck className="h-4 w-4" />
                          </PackActionButton>
                        ) : (
                          <PackActionButton label={t('pack.action.activate')} onClick={() => void handleActivatePack(pack)} disabled={packBusyState.active}>
                            {packBusyState.key === getPackBusyKey('activate', pack) ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbCheck className="h-4 w-4" />}
                          </PackActionButton>
                        )}
                        <PackActionButton label={t('pack.action.open')} onClick={() => void window.chobits.file['file:open-path'](pack.rootDir)}>
                          <TbFolderOpen className="h-4 w-4" />
                        </PackActionButton>
                        <PackActionButton label={t('pack.action.export')} onClick={() => void handleExportPack(pack)} disabled={packBusyState.active}>
                          {packBusyState.key === getPackBusyKey('export', pack) ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbDownload className="h-4 w-4" />}
                        </PackActionButton>
                        <PackActionButton label={t('pack.action.edit')} onClick={() => void handleEditPack(pack)} disabled={packBusyState.active || busyKey === getPackBusyKey('editor-draft', pack)}>
                          {busyKey === getPackBusyKey('editor-draft', pack) ? <TbLoader2 className="h-4 w-4 animate-spin" /> : <TbPencil className="h-4 w-4" />}
                        </PackActionButton>
                        {pack.source === 'installed' && (
                          <PackActionButton
                            label={t('pack.action.remove')}
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
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] text-muted-foreground">{t('pack.noPreview')}</div>
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
                      <div className="text-[11px] text-muted-foreground">{formatPackTrustSummary(t, pack)}</div>
                      {pack.trust.links.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-[11px]">
                          {pack.trust.links.map((link) => (
                            <a key={`${link.label}:${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                              {formatTrustLinkLabel(t, link.label)}
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
            <AlertDialogTitle>
              {!importPrompt?.inspection.installable ? t('pack.import.titleBlocked') : importPrompt?.inspection.requiresReplace ? t('pack.import.titleReplace') : t('pack.import.titleInstall')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {!importPrompt?.inspection.installable
                ? t('pack.import.descriptionBlocked', { name: importPrompt?.inspection.pack.name })
                : importPrompt?.inspection.requiresReplace
                  ? t('pack.import.descriptionReplace', { name: importPrompt.inspection.pack.name })
                  : t('pack.import.descriptionInstall', { name: importPrompt?.inspection.pack.name })}
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
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">{t('pack.noPreview')}</div>
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
                <div className="text-sm font-medium text-foreground">{t('pack.import.trustTitle')}</div>
                <div>{t('pack.import.trustSummary', { summary: formatPackTrustSummary(t, importPrompt.inspection.pack) })}</div>
                {importSignatureSummary && <div>{t('pack.import.signatureDeclaration', { summary: importSignatureSummary })}</div>}
                <div>{importPrompt.inspection.pack.trust.note}</div>
                {importPrompt.inspection.pack.trust.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {importPrompt.inspection.pack.trust.links.map((link) => (
                      <a key={`${link.label}:${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {formatTrustLinkLabel(t, link.label)}
                      </a>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                <div>{t('pack.import.sourcePath', { path: importPrompt.inspection.sourcePath })}</div>
                {importPrompt.inspection.activePack && <div>{t('pack.import.activePack', { name: importPrompt.inspection.activePack.name })}</div>}
                {importPrompt.inspection.existingPack && (
                  <div>{t('pack.import.existingConflict', { name: importPrompt.inspection.existingPack.name, source: formatPackSource(t, importPrompt.inspection.existingPack.source) })}</div>
                )}
                {importPrompt.inspection.willReplaceActive && <div className="text-amber-600">{t('pack.import.willReplaceActiveNote')}</div>}
              </div>

              <div className="space-y-2 rounded-lg border border-border/60 p-3 text-xs text-muted-foreground">
                <div className="text-sm font-medium text-foreground">{t('pack.import.compatibilityTitle')}</div>
                <div>{t('pack.import.formatVersion', { packVersion: importPrompt.inspection.pack.formatVersion, supportedVersion: importPrompt.inspection.compatibility.supportedFormatVersion })}</div>
                {importPrompt.inspection.compatibility.currentAppVersion && (
                  <div>
                    {importPrompt.inspection.compatibility.minAppVersion
                      ? t('pack.import.appVersionWithMin', { version: importPrompt.inspection.compatibility.currentAppVersion, minVersion: importPrompt.inspection.compatibility.minAppVersion })
                      : t('pack.import.appVersionNoMin', { version: importPrompt.inspection.compatibility.currentAppVersion })}
                  </div>
                )}
                <div>
                  {importPrompt.inspection.pack.platform && importPrompt.inspection.pack.platform.length > 0
                    ? t('pack.import.platformDeclared', { platform: importPrompt.inspection.compatibility.currentPlatform, packPlatforms: importPrompt.inspection.pack.platform.join(', ') })
                    : t('pack.import.platformUnrestricted', { platform: importPrompt.inspection.compatibility.currentPlatform })}
                </div>
                {importPrompt.inspection.pack.capabilities?.supportedLanguages && importPrompt.inspection.pack.capabilities.supportedLanguages.length > 0 && (
                  <div>{t('pack.import.supportedLanguages', { languages: importPrompt.inspection.pack.capabilities.supportedLanguages.join(', ') })}</div>
                )}
              </div>

              {importPrompt.inspection.blockingErrors.length > 0 && (
                <div className="space-y-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <TbShieldX className="h-4 w-4 text-red-500" />
                    {t('pack.import.blockedTitle')}
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
                  <div className="text-sm font-medium text-foreground">{t('pack.import.warningsTitle')}</div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {importPrompt.inspection.warnings.map((warning) => (
                      <div key={warning.code}>{warning.message}</div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">{t('pack.import.activateAfterInstall')}</div>
                  <div className="text-xs text-muted-foreground">
                    {!importPrompt.inspection.installable
                      ? t('pack.import.activateBlockedHint')
                      : importPrompt.inspection.willReplaceActive
                        ? t('pack.import.activateReplacedHint')
                        : t('pack.import.activateHint')}
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
            <AlertDialogCancel>{t('common:action.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmImport()} disabled={!!importPrompt && (!importPrompt.inspection.installable || busyKey === getImportBusyKey())}>
              {!importPrompt?.inspection.installable ? t('pack.import.blockedTitle') : importPrompt?.inspection.requiresReplace ? t('pack.import.confirmReplace') : t('pack.import.confirmInstall')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('pack.remove.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.isActive ? t('pack.remove.descriptionActive', { name: removeTarget?.name }) : t('pack.remove.description', { name: removeTarget?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeTarget && <SettingPath path={maskPath(removeTarget.rootDir)} />}
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:action.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemovePack()}>{t('pack.remove.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className={editorDialogContentClassName}>
          <DialogHeader className={editorHeaderClassName}>
            <DialogTitle>{getCharacterPackEditorTitle(t, editor)}</DialogTitle>
            <DialogDescription>{getCharacterPackEditorDescription(t, editor)}</DialogDescription>
          </DialogHeader>

          <div className={editorBodyClassName}>
            {editor && (
              <CharacterPackEditorContent
                editor={editor}
                setEditor={setEditor}
                extra={editorExtra ? <div className={editorUsesExpandedModal ? 'mt-5 border-t border-border/60 pt-5' : 'mt-4'}>{editorExtra}</div> : undefined}
              />
            )}
          </div>

          <DialogFooter className={editorFooterClassName}>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={busyKey === 'editor-save'}>
              {t('common:action.cancel')}
            </Button>
            <Button onClick={() => void handleSaveEditor()} disabled={busyKey === 'editor-save'}>
              {busyKey === 'editor-save' && <TbLoader2 className="animate-spin" />}
              {t('editor.action.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
