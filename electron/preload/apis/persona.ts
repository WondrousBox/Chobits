/**
 * Persona State Preload API
 *
 * window.YUA.persona.* 接口
 * 通道已重定向至 sprite:persona:* 统一前缀
 * 人格状态订阅统一通过 sprite:state 读取 personaSnapshot
 */

import { ipcRenderer } from 'electron';

import { SPRITE_CAPABILITY_CHANGED_CHANNEL, type SpriteCapabilityChangedPayload } from '../../../packages/sprite-core/capability-events';
import type { SpriteCapabilitySnapshot } from '../../../packages/sprite-core/capability-registry';
import type {
  CharacterGalleryAIEditContext,
  CharacterGalleryAIEditDraft,
  CharacterGalleryAIHints,
  CharacterGalleryCanvasLayout,
  CharacterGalleryItem,
  CharacterGalleryItemDraft,
  CharacterGalleryItemKind,
  CharacterGalleryItemOrigin,
  CharacterGalleryItemPatch,
  CharacterGalleryOriginType,
  CharacterGalleryReferenceRole,
  CharacterGallerySemantic,
  CharacterGalleryViewAngle
} from '../../../packages/sprite-core/character-gallery';
import type {
  CharacterPackEditorDraft,
  CharacterPackEditorSaveOptions,
  CharacterPackEditorSaveResult,
  CharacterPackExportResult,
  CharacterPackImportInspection,
  CharacterPackInstallOptions,
  CharacterPackRemovalResult,
  CharacterPackSource,
  CharacterPackSummary
} from '../../../packages/sprite-core/character-pack-manager';
import type { PersonaPromptBuildOptions } from '../../../packages/sprite-core/character-service';
import type { PersonaSnapshot, SpritePersonaStateResult, SpriteStateSnapshot } from '../../../packages/sprite-core/types';

export interface CharacterGalleryListResult {
  ok: true;
  pack: {
    id: string;
    name: string;
    source: CharacterPackSource;
    rootDir: string;
    writable: boolean;
  };
  indexPath: string;
  items: CharacterGalleryItem[];
}

export interface CharacterGalleryCanvasLayoutResult {
  layout: CharacterGalleryCanvasLayout;
  ok: true;
  path: string;
  writable: boolean;
}

export interface CharacterGalleryImportPayload {
  packId?: string;
  source?: CharacterPackSource;
  filePath: string;
  draft?: CharacterGalleryItemDraft;
}

export interface CharacterGalleryUpdatePayload {
  packId?: string;
  source?: CharacterPackSource;
  itemId: string;
  patch: CharacterGalleryItemPatch;
}

export interface CharacterGalleryReplaceImagePayload {
  packId?: string;
  source?: CharacterPackSource;
  itemId: string;
  filePath: string;
  origin?: CharacterGalleryItemPatch['origin'];
}

export type {
  CharacterGalleryAIEditContext,
  CharacterGalleryAIEditDraft,
  CharacterGalleryAIHints,
  CharacterGalleryCanvasLayout,
  CharacterGalleryItem,
  CharacterGalleryItemDraft,
  CharacterGalleryItemKind,
  CharacterGalleryItemOrigin,
  CharacterGalleryItemPatch,
  CharacterGalleryOriginType,
  CharacterGalleryReferenceRole,
  CharacterGallerySemantic,
  CharacterGalleryViewAngle
};

export const personaApi = {
  /** 获取完整人格状态 */
  getState: (): Promise<SpritePersonaStateResult> => ipcRenderer.invoke('sprite:persona:getState'),

  /** 获取运行时 capability snapshot */
  getCapabilitySnapshot: (): Promise<SpriteCapabilitySnapshot> => ipcRenderer.invoke('sprite:capabilities:getSnapshot'),

  /** 订阅 capability 运行态变化事件 */
  onCapabilityChanged: (callback: (payload: SpriteCapabilityChangedPayload) => void) => {
    const handler = (_: any, payload: SpriteCapabilityChangedPayload): void => callback(payload);
    ipcRenderer.on(SPRITE_CAPABILITY_CHANGED_CHANNEL, handler);
    return () => ipcRenderer.off(SPRITE_CAPABILITY_CHANGED_CHANNEL, handler);
  },

  // --- 事件订阅 (统一通过 sprite:state 新通道) ---

  /** 订阅人格状态变化事件 */
  onStateChanged: (callback: (state: PersonaSnapshot) => void) => {
    const handler = (_: any, data: SpriteStateSnapshot): void => {
      if (data?.personaSnapshot) callback(data.personaSnapshot);
    };
    ipcRenderer.on('sprite:state', handler);
    return () => ipcRenderer.off('sprite:state', handler);
  },

  // --- 角色人格 API ---

  /** 获取当前角色基础信息 (id, name, tagline) */
  getCharacterInfo: () => ipcRenderer.invoke('sprite:character:getInfo'),

  /** 获取基于当前好感度/心情动态生成的角色人格系统提示词 */
  getCharacterPersonaPrompt: (options?: PersonaPromptBuildOptions) => ipcRenderer.invoke('sprite:character:getPersonaPrompt', options),

  /** 获取当前可用角色包列表 */
  listCharacterPacks: (): Promise<CharacterPackSummary[]> => ipcRenderer.invoke('sprite:character:listPacks'),

  /** 获取当前激活的角色包 */
  getActiveCharacterPack: (): Promise<CharacterPackSummary | null> => ipcRenderer.invoke('sprite:character:getActivePack'),

  /** 激活指定角色包 */
  activateCharacterPack: (packId: string, source?: CharacterPackSource) => ipcRenderer.invoke('sprite:character:activatePack', { packId, source }),

  /** 预检 .cbpk / zip 压缩包，返回 pack manifest 与冲突/警告信息 */
  inspectCharacterPackFromArchive: (archivePath: string): Promise<CharacterPackImportInspection> =>
    ipcRenderer.invoke('sprite:character:inspectPackFromArchive', {
      archivePath
    }),

  /** 从 .cbpk / zip 压缩包导入角色包 */
  installCharacterPackFromArchive: (archivePath: string, options?: CharacterPackInstallOptions) =>
    ipcRenderer.invoke('sprite:character:installPackFromArchive', {
      archivePath,
      replaceExisting: options?.replaceExisting,
      activate: options?.activate
    }),

  /** 将已安装/内置角色包完整导出为 .cbpk / zip 压缩包 */
  exportCharacterPack: (
    packId: string,
    outputPath: string,
    source?: CharacterPackSource
  ): Promise<
    | (CharacterPackExportResult & {
        ok: true;
      })
    | null
  > => ipcRenderer.invoke('sprite:character:exportPack', { packId, outputPath, source }),

  /** 删除已安装角色包；若当前角色包正在使用，会先切回 fallback pack 再移除 */
  removeCharacterPack: (
    packId: string,
    source?: CharacterPackSource
  ): Promise<
    | (CharacterPackRemovalResult & {
        ok: true;
        character?: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
        runtime?: unknown;
        personaSlot?: { slotId: string; restored: boolean; switched: boolean };
      })
    | null
  > => ipcRenderer.invoke('sprite:character:removePack', { packId, source }),

  /** 获取角色包制作/编辑表单草稿 */
  getCharacterPackEditorDraft: (packId: string, source?: CharacterPackSource): Promise<CharacterPackEditorDraft | null> => ipcRenderer.invoke('sprite:character:getEditorDraft', { packId, source }),

  /** 保存角色包制作/编辑表单草稿到本地 installed pack */
  saveCharacterPackEditorDraft: (
    draft: CharacterPackEditorDraft,
    options?: CharacterPackEditorSaveOptions
  ): Promise<
    | (CharacterPackEditorSaveResult & {
        ok: true;
        character?: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
        runtime?: unknown;
        personaSlot?: { slotId: string; restored: boolean; switched: boolean };
      })
    | null
  > => ipcRenderer.invoke('sprite:character:saveEditorDraft', { draft, options }),

  /** 列出角色包图集图片。默认读取当前激活角色包。 */
  listCharacterGallery: (payload?: { packId?: string; source?: CharacterPackSource; query?: string }): Promise<CharacterGalleryListResult | null> =>
    ipcRenderer.invoke('sprite:character:gallery:list', payload ?? {}),

  /** 获取角色图集画布布局。只读包可能返回自动布局空壳。 */
  getCharacterGalleryCanvasLayout: (payload?: { packId?: string; source?: CharacterPackSource }): Promise<CharacterGalleryCanvasLayoutResult | null> =>
    ipcRenderer.invoke('sprite:character:gallery:canvas:get', payload ?? {}),

  /** 保存角色图集画布布局。只允许写入本地 installed 角色包。 */
  saveCharacterGalleryCanvasLayout: (payload: { packId?: string; source?: CharacterPackSource; layout: CharacterGalleryCanvasLayout }): Promise<CharacterGalleryCanvasLayoutResult | null> =>
    ipcRenderer.invoke('sprite:character:gallery:canvas:save', payload),

  /** 导入图片到角色包图集。只允许写入本地 installed 角色包。 */
  importCharacterGalleryItem: (payload: CharacterGalleryImportPayload): Promise<{ ok: true; item: CharacterGalleryItem }> => ipcRenderer.invoke('sprite:character:gallery:import', payload),

  /** 更新角色图集条目的元数据。 */
  updateCharacterGalleryItem: (payload: CharacterGalleryUpdatePayload): Promise<{ ok: boolean; item?: CharacterGalleryItem }> => ipcRenderer.invoke('sprite:character:gallery:update', payload),

  /** 替换角色图集条目的图片文件，用于局部重绘或 AI 编辑产物回写。 */
  replaceCharacterGalleryItemImage: (payload: CharacterGalleryReplaceImagePayload): Promise<{ ok: boolean; item?: CharacterGalleryItem }> =>
    ipcRenderer.invoke('sprite:character:gallery:replaceImage', payload),

  /** 删除角色图集条目。默认同时清理不再被引用的包内图片文件。 */
  removeCharacterGalleryItem: (payload: { packId?: string; source?: CharacterPackSource; itemId: string; deleteFile?: boolean }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('sprite:character:gallery:remove', payload),

  /** 构建发送给 AI 图片编辑/分镜生成的图集引用上下文。 */
  buildCharacterGalleryAIEditContext: (payload: { packId?: string; source?: CharacterPackSource; draft: CharacterGalleryAIEditDraft }): Promise<CharacterGalleryAIEditContext> =>
    ipcRenderer.invoke('sprite:character:gallery:buildAIEditContext', payload),

  /** 重新加载当前角色定义并同步 runtime persona rules */
  reloadCharacter: () => ipcRenderer.invoke('sprite:character:reload'),

  /** 订阅角色切换事件 */
  onCharacterSwitched: (
    callback: (payload: {
      previousPack: CharacterPackSummary | null;
      nextPack: CharacterPackSummary;
      previousCharacter: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
      nextCharacter: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
      personaSlotId: string;
    }) => void
  ) => {
    const handler = (
      _: any,
      payload: {
        previousPack: CharacterPackSummary | null;
        nextPack: CharacterPackSummary;
        previousCharacter: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
        nextCharacter: { id: string; name: string; nameAliases: string[]; tagline: string } | null;
        personaSlotId: string;
      }
    ): void => callback(payload);
    ipcRenderer.on('persona:character-switched', handler);
    return () => ipcRenderer.off('persona:character-switched', handler);
  }
};

export type PersonaApiBridgeType = typeof personaApi;
