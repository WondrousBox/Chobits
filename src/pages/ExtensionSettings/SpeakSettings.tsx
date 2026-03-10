/**
 * SpeakSettings — 精灵语音合成设置面板
 *
 * 配置精灵说话的声音、语速、音高等参数
 */
import React, { useCallback, useEffect, useState } from 'react';
import { TbTrash, TbVolume } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

interface SpriteSpeakConfig {
    enabled: boolean;
    serviceType: string;
    voiceName: string;
    rate: number;
    pitch: number;
    volume: number;
}

type SpeakSettingsProps = {
    expanded: boolean;
    onExpand: () => void;
};

/** 支持的 Edge TTS 语音列表（常用子集） */
const EDGE_VOICES = [
    { value: 'zh-CN-XiaoxiaoNeural', label: '小晓 (女声)', lang: '中文' },
    { value: 'zh-CN-YunxiNeural', label: '云希 (男声)', lang: '中文' },
    { value: 'zh-CN-YunjianNeural', label: '云健 (男声)', lang: '中文' },
    { value: 'zh-CN-XiaoyiNeural', label: '小艺 (女声)', lang: '中文' },
    { value: 'zh-CN-YunyangNeural', label: '云扬 (男声)', lang: '中文' },
    { value: 'zh-CN-liaoning-XiaobeiNeural', label: '小贝 (女声-东北)', lang: '中文方言' },
    { value: 'zh-TW-HsiaoChenNeural', label: '曉臻 (女声)', lang: '中文(台湾)' },
    { value: 'zh-TW-YunJheNeural', label: '雲哲 (男声)', lang: '中文(台湾)' },
    { value: 'ja-JP-NanamiNeural', label: 'Nanami (女声)', lang: '日本語' },
    { value: 'ja-JP-KeitaNeural', label: 'Keita (男声)', lang: '日本語' },
    { value: 'en-US-JennyNeural', label: 'Jenny (Female)', lang: 'English' },
    { value: 'en-US-GuyNeural', label: 'Guy (Male)', lang: 'English' },
    { value: 'en-US-AriaNeural', label: 'Aria (Female)', lang: 'English' },
    { value: 'en-GB-SoniaNeural', label: 'Sonia (Female)', lang: 'English (UK)' },
    { value: 'ko-KR-SunHiNeural', label: 'SunHi (여성)', lang: '한국어' },
    { value: 'ko-KR-InJoonNeural', label: 'InJoon (남성)', lang: '한국어' },
    { value: 'fr-FR-DeniseNeural', label: 'Denise (Femme)', lang: 'Français' },
    { value: 'de-DE-KatjaNeural', label: 'Katja (Weiblich)', lang: 'Deutsch' },
    { value: 'es-ES-ElviraNeural', label: 'Elvira (Mujer)', lang: 'Español' }
];

const SpeakSettings: React.FC<SpeakSettingsProps> = () => {
    const [config, setConfig] = useState<SpriteSpeakConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [testLoading, setTestLoading] = useState(false);
    const [cacheStats, setCacheStats] = useState<{ totalEntries: number; totalSizeBytes: number } | null>(null);

    // 加载配置
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const cfg = await window.YUA.sprite.getSpeakConfig();
                if (!cancelled) setConfig(cfg);
                const stats = await window.YUA.sprite.getSpeakCacheStats();
                if (!cancelled) setCacheStats(stats);
            } catch (err) {
                console.error('加载语音配置失败:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // 更新配置
    const updateConfig = useCallback(async (partial: Partial<SpriteSpeakConfig>) => {
        try {
            const updated = await window.YUA.sprite.setSpeakConfig(partial);
            setConfig(updated);
        } catch (err) {
            console.error('更新语音配置失败:', err);
        }
    }, []);

    // 测试说话
    const handleTest = useCallback(async () => {
        if (testLoading) return;
        setTestLoading(true);
        try {
            await window.YUA.sprite.speak('你好，我是你的桌面精灵助手！');
        } catch (err) {
            console.error('测试语音失败:', err);
        } finally {
            setTestLoading(false);
        }
    }, [testLoading]);

    // 清空缓存
    const handleClearCache = useCallback(async () => {
        try {
            await window.YUA.sprite.clearSpeakCache();
            const stats = await window.YUA.sprite.getSpeakCacheStats();
            setCacheStats(stats);
        } catch (err) {
            console.error('清空语音缓存失败:', err);
        }
    }, []);

    if (loading || !config) {
        return (
            <div className="space-y-3">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <div className="text-sm text-muted-foreground">加载中...</div>
                </div>
            </div>
        );
    }

    const formatSize = (bytes: number): string => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                {/* 头部 */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <TbVolume className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="text-base font-semibold text-foreground">语音合成</div>
                            <div className="text-sm text-muted-foreground">让精灵用声音说话，配置音色和语速。</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Switch checked={config.enabled} onCheckedChange={(checked) => updateConfig({ enabled: checked })} />
                    </div>
                </div>

                {/* 详细配置 */}
                {config.enabled && (
                    <div className="mt-5 space-y-5 pl-15">
                        {/* 语音选择 */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-foreground">音色</label>
                            <Select value={config.voiceName} onValueChange={(value) => updateConfig({ voiceName: value })}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="选择音色" />
                                </SelectTrigger>
                                <SelectContent>
                                    {EDGE_VOICES.map((voice) => (
                                        <SelectItem key={voice.value} value={voice.value}>
                                            <span>{voice.label}</span>
                                            <span className="ml-2 text-xs text-muted-foreground">{voice.lang}</span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 语速 */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">语速</label>
                                <span className="text-xs text-muted-foreground">{config.rate > 0 ? `+${config.rate}%` : `${config.rate}%`}</span>
                            </div>
                            <Slider value={[config.rate]} min={-50} max={200} step={10} onValueChange={([value]) => updateConfig({ rate: value })} />
                        </div>

                        {/* 音高 */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">音高</label>
                                <span className="text-xs text-muted-foreground">{config.pitch > 0 ? `+${config.pitch}%` : `${config.pitch}%`}</span>
                            </div>
                            <Slider value={[config.pitch]} min={-50} max={50} step={5} onValueChange={([value]) => updateConfig({ pitch: value })} />
                        </div>

                        {/* 音量 */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-foreground">音量</label>
                                <span className="text-xs text-muted-foreground">{Math.round(config.volume * 100)}%</span>
                            </div>
                            <Slider value={[config.volume]} min={0} max={1} step={0.05} onValueChange={([value]) => updateConfig({ volume: value })} />
                        </div>

                        {/* 操作按钮 */}
                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <Button variant="outline" size="sm" onClick={handleTest} disabled={testLoading}>
                                {testLoading ? '合成中...' : '🔊 试听'}
                            </Button>

                            {cacheStats && cacheStats.totalEntries > 0 && (
                                <Button variant="ghost" size="sm" onClick={handleClearCache} className="text-muted-foreground">
                                    <TbTrash className="mr-1 h-4 w-4" />
                                    清空缓存 ({cacheStats.totalEntries} 条, {formatSize(cacheStats.totalSizeBytes)})
                                </Button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SpeakSettings;
