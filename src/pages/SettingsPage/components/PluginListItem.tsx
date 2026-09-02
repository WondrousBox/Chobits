import { isSystemPresetPlugin, PluginDefinition } from '@packages/plugins/types';
import prettyBytes from 'pretty-bytes';
import React, { useState } from 'react';
import { TbDownload, TbLoader2, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import type { InstalledResource } from './types';

interface PluginListItemProps {
  resource: PluginDefinition;
  installedResource?: InstalledResource;
  isInstalling: boolean;
  onInstall: (pluginId: string, resourceId: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove?: (id: string) => void;
}

// 获取当前平台对应的包大小
const getPackageSize = (resource: PluginDefinition): number | undefined => {
  const platform = window.chobits?.platform || 'win32';
  const arch = window.chobits?.arch || 'x64';

  // 优先匹配精确的平台和架构
  let match = resource.platforms.find((p) => p.platform === platform && p.arch === arch);
  if (!match) {
    match = resource.platforms.find((p) => p.platform === platform && p.arch === 'all');
  }
  if (!match) {
    match = resource.platforms.find((p) => p.platform === platform);
  }
  if (!match) {
    match = resource.platforms.find((p) => p.platform === 'all' && p.arch === 'all');
  }
  if (!match) {
    match = resource.platforms.find((p) => p.platform === 'all');
  }

  if (match?.sizeBytes) return match.sizeBytes;
  const filesSize = match?.files?.reduce((sum, file) => sum + (file.sizeBytes || 0), 0);
  return filesSize && filesSize > 0 ? filesSize : undefined;
};

// 分类代码到中文名称的映射
const getCategoryName = (category?: string): string => {
  const categoryMap: Record<string, string> = {
    // 核心基础
    core: '核心引擎',
    // 语音相关
    asr: '语音识别',
    tts: '语音合成',
    stt: '语音转文字',
    vad: '语音检测',
    'voice-clone': '声音克隆',
    // 文本/语言相关
    llm: '大语言模型',
    nlp: '自然语言处理',
    translation: '翻译',
    punctuation: '标点恢复',
    embedding: '文本嵌入',
    // 图像相关
    'image-gen': '图像生成',
    'image-edit': '图像编辑',
    ocr: '文字识别',
    'image-recognition': '图像识别',
    face: '人脸识别',
    'image-super-res': '图像超分',
    'audio-process': '音频处理',
    // 视频相关
    'video-gen': '视频生成',
    'video-edit': '视频编辑',
    'video-analysis': '视频分析',
    // 多模态
    multimodal: '多模态',
    // 其他
    agent: 'AI代理',
    code: '代码生成',
    music: '音乐生成',
    'three-d': '3D生成',
    other: '其他'
  };
  return category ? categoryMap[category] || category : '';
};

// 语言代码到中文名称的映射
const getLanguageName = (code: string): string => {
  const languageMap: Record<string, string> = {
    multi: '多语言',
    en: '英语',
    zh: '中文',
    ja: '日语',
    ko: '韩语',
    yue: '粤语',
    de: '德语',
    es: '西班牙语',
    ru: '俄语',
    fr: '法语',
    pt: '葡萄牙语',
    tr: '土耳其语',
    pl: '波兰语',
    ca: '加泰罗尼亚语',
    nl: '荷兰语',
    ar: '阿拉伯语',
    sv: '瑞典语',
    it: '意大利语',
    id: '印尼语',
    hi: '印地语',
    fi: '芬兰语',
    vi: '越南语',
    he: '希伯来语',
    uk: '乌克兰语',
    el: '希腊语',
    ms: '马来语',
    cs: '捷克语',
    ro: '罗马尼亚语',
    da: '丹麦语',
    hu: '匈牙利语',
    ta: '泰米尔语',
    no: '挪威语',
    th: '泰语',
    ur: '乌尔都语',
    hr: '克罗地亚语',
    bg: '保加利亚语',
    lt: '立陶宛语',
    la: '拉丁语',
    mi: '毛利语',
    ml: '马拉雅拉姆语',
    cy: '威尔士语',
    sk: '斯洛伐克语',
    te: '泰卢固语',
    fa: '波斯语',
    lv: '拉脱维亚语',
    bn: '孟加拉语',
    sr: '塞尔维亚语',
    az: '阿塞拜疆语',
    sl: '斯洛文尼亚语',
    kn: '卡纳达语',
    et: '爱沙尼亚语',
    mk: '马其顿语',
    br: '布列塔尼语',
    eu: '巴斯克语',
    is: '冰岛语',
    hy: '亚美尼亚语',
    ne: '尼泊尔语',
    mn: '蒙古语',
    bs: '波斯尼亚语',
    kk: '哈萨克语',
    sq: '阿尔巴尼亚语',
    sw: '斯瓦希里语',
    gl: '加利西亚语',
    mr: '马拉地语',
    pa: '旁遮普语',
    si: '僧伽罗语',
    km: '高棉语',
    sn: '绍纳语',
    yo: '约鲁巴语',
    so: '索马里语',
    af: '南非荷兰语',
    oc: '奥克西唐语',
    ka: '格鲁吉亚语',
    be: '白俄罗斯语',
    tg: '塔吉克语',
    sd: '信德语'
  };
  return languageMap[code] || code.toUpperCase();
};

// 轻量状态徽章组件
const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: '排队', cls: 'bg-gray-200 text-gray-700' },
    downloading: { label: '下载中', cls: 'bg-blue-500/90 text-white' },
    extracting: { label: '解压中', cls: 'bg-purple-500/90 text-white' },
    verifying: { label: '校验中', cls: 'bg-amber-500/90 text-white' },
    installed: { label: '已安装', cls: 'bg-green-500/90 text-white' },
    failed: { label: '失败', cls: 'bg-red-500/90 text-white' },
    cancelled: { label: '已取消', cls: 'bg-zinc-400 text-white' },
    removed: { label: '已移除', cls: 'bg-zinc-300 text-zinc-600' }
  };
  const info = status ? map[status] : undefined;
  if (!info) return <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">未知</span>;
  return <span className={'text-[10px] px-1.5 rounded-md ' + info.cls}>{info.label}</span>;
};

export const PluginListItem: React.FC<PluginListItemProps> = ({ resource, installedResource, isInstalling, onInstall, onCancel, onRetry, onRemove }) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isSystemPreset = isSystemPresetPlugin(resource);
  const status = installedResource?.status as string | undefined;
  const percent = installedResource?.sizeBytes ? Math.round((((installedResource?.progressBytes as number) || 0) / ((installedResource?.sizeBytes as number) || 1)) * 100) : 0;
  const isInstalled = status === 'installed' || isSystemPreset;

  // 获取包大小
  const packageSize = getPackageSize(resource);
  const displaySize = installedResource?.sizeBytes || packageSize;
  const resourceLabel = resource.type === 'model' ? '模型' : '插件';

  const content = (
    <>
      <div className="flex flex-col gap-1 flex-1">
        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
          <span className="text-[10px] rounded bg-muted px-1 py-0.5">{resource.type === 'engine' ? '引擎' : '模型'}</span>
          <span>{resource.displayName || resource.name}</span>
          <span className="text-[10px] rounded bg-muted px-1 py-0.5">v{resource.version}</span>
          {resource.category &&
            (Array.isArray(resource.category) ? (
              resource.category.map((cat) => (
                <span key={cat} className="text-[10px] rounded px-1.5 py-0.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                  {getCategoryName(cat)}
                </span>
              ))
            ) : (
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">{getCategoryName(resource.category)}</span>
            ))}
          {displaySize !== undefined && typeof displaySize === 'number' && displaySize >= 0 && (
            <span className="text-[10px] rounded bg-muted px-1 py-0.5 text-muted-foreground">{prettyBytes(displaySize || 0)}</span>
          )}
          {status && <StatusBadge status={status} />}
        </div>
        {resource.description && <div className="text-xs text-muted-foreground">{resource.description}</div>}
        {resource.languages && resource.languages.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <span className="text-[10px] text-muted-foreground">支持语言：</span>
            {resource.languages.map((lang) => {
              const isMulti = lang === 'multi';
              return (
                <span
                  key={lang}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isMulti
                      ? 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 dark:from-purple-900/40 dark:to-pink-900/40 dark:text-purple-300 font-medium'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  }`}
                >
                  {getLanguageName(lang)}
                </span>
              );
            })}
          </div>
        )}
        {status === 'downloading' && installedResource?.sizeBytes && (
          <div className="w-full bg-muted h-2 rounded overflow-hidden mt-1">
            <div className="h-full bg-blue-500 transition-all" style={{ width: percent + '%' }}></div>
          </div>
        )}
        {status === 'downloading' && (
          <div className="text-[10px] text-muted-foreground flex justify-between">
            <span>
              {percent}%{' '}
              {installedResource?.progressBytes && installedResource?.sizeBytes
                ? `(${((installedResource.progressBytes as number) / 1024 / 1024).toFixed(2)}MB / ${((installedResource.sizeBytes as number) / 1024 / 1024).toFixed(2)}MB)`
                : ''}
            </span>
            <span>
              {installedResource?.speedBps ? `${((installedResource.speedBps as number) / 1024).toFixed(1)} KB/s` : ''}{' '}
              {installedResource?.etaMs ? `ETA ${((installedResource.etaMs as number) / 1000).toFixed(1)}s` : ''}
            </span>
          </div>
        )}
        {status === 'queued' && <div className="text-[10px] text-muted-foreground">排队中…</div>}
        {status === 'extracting' && <div className="text-[10px] text-muted-foreground">解压中…</div>}
        {status === 'verifying' && <div className="text-[10px] text-muted-foreground">校验中…</div>}
        {status === 'failed' && <div className="text-[10px] text-red-500">安装失败{installedResource?.lastError ? `: ${installedResource.lastError}` : '，可重试'}</div>}
      </div>
      <div className="ml-3 flex items-center gap-1">
        {['queued', 'downloading', 'extracting', 'verifying'].includes(status || '') && installedResource?.id && (
          <Button size="sm" variant={'outline'} onClick={() => onCancel(installedResource.id)}>
            取消
          </Button>
        )}
        {['failed', 'cancelled'].includes(status || '') && installedResource?.id && (
          <Button size="sm" variant={'outline'} onClick={() => onRetry(installedResource.id)}>
            重试
          </Button>
        )}
        {isInstalled && installedResource?.id && onRemove && !isSystemPreset && (
          <Button size="icon" variant={'destructive'} onClick={() => setShowDeleteDialog(true)}>
            <TbTrash />
          </Button>
        )}
        {!status && !isSystemPreset && (
          <Button size="sm" variant={'outline'} disabled={isInstalling} onClick={() => onInstall(resource.pluginId, resource.id)}>
            {isInstalling ? (
              <>
                <TbLoader2 className="animate-spin" /> 安装中...
              </>
            ) : (
              <>
                <TbDownload />
                安装
              </>
            )}
          </Button>
        )}
        {isSystemPreset && <span className="text-[10px] px-1.5 rounded-md bg-muted text-muted-foreground">系统预设</span>}
      </div>
    </>
  );

  return (
    <>
      <div className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors">{content}</div>
      {onRemove && installedResource?.id && (
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>删除{resourceLabel}</DialogTitle>
              <DialogDescription>确定要删除 &quot;{resource.displayName || resource.name}&quot; 吗？此操作会移除安装记录并删除本地已下载文件，之后再次使用需要重新下载。</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onRemove(installedResource.id);
                  setShowDeleteDialog(false);
                }}
              >
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export { StatusBadge };
