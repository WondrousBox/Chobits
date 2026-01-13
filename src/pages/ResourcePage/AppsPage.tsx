import React, { useState } from 'react';
import { TbApps, TbArrowLeft, TbLanguage, TbLoader2, TbMicrophone, TbSearch, TbUpload } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SidebarInset } from '@/components/ui/sidebar';
import { Textarea } from '@/components/ui/textarea';

// 模拟应用数据 - 只保留两个可用的应用
const mockApps = [
  {
    id: 'video-transcribe',
    name: '视频转写',
    description: '将视频中的语音自动转换为文字，支持多种语言',
    icon: TbMicrophone,
    category: 'transcribe',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
  },
  {
    id: 'subtitle-translate',
    name: '字幕翻译',
    description: '一键翻译字幕文件，支持多种语言互译',
    icon: TbLanguage,
    category: 'translate',
    color: 'text-green-500',
    bgColor: 'bg-green-500/10'
  }
];

// 视频转写应用组件
const TranscribeApp: React.FC = () => {
  const [file, setFile] = useState<string>('');
  const [language, setLanguage] = useState('zh');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState('');

  // 模拟文件选择
  const handleSelectFile = () => {
    setFile('示例视频.mp4');
    setResult('');
  };

  // 模拟转写过程
  const handleTranscribe = () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setResult('');

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setIsProcessing(false);
          setResult(`[00:00:00] 大家好，欢迎观看本期视频。
[00:00:05] 今天我们来聊一聊人工智能的发展趋势。
[00:00:12] 首先，让我们回顾一下近几年 AI 领域的重大突破。
[00:00:20] 从深度学习到大语言模型，技术迭代速度令人惊叹。
[00:00:28] 接下来，我们将详细分析几个关键领域的应用场景...`);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 300);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 文件选择 */}
      <div className="space-y-2">
        <Label>选择视频文件</Label>
        <div className="flex gap-2">
          <Input value={file} placeholder="请选择视频文件..." readOnly className="flex-1" />
          <Button variant="outline" onClick={handleSelectFile}>
            <TbUpload className="w-4 h-4 mr-2" />
            选择文件
          </Button>
        </div>
      </div>

      {/* 语言选择 */}
      <div className="space-y-2">
        <Label>识别语言</Label>
        <Select value={language} onValueChange={setLanguage}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="zh">中文</SelectItem>
            <SelectItem value="en">英文</SelectItem>
            <SelectItem value="ja">日语</SelectItem>
            <SelectItem value="ko">韩语</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 开始按钮 */}
      <Button onClick={handleTranscribe} disabled={!file || isProcessing} className="w-full">
        {isProcessing && <TbLoader2 className="w-4 h-4 mr-2 animate-spin" />}
        {isProcessing ? '转写中...' : '开始转写'}
      </Button>

      {/* 进度条 */}
      {isProcessing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>正在处理...</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {/* 转写结果 */}
      {result && (
        <div className="space-y-2">
          <Label>转写结果</Label>
          <Textarea value={result} readOnly className="h-64 font-mono text-sm" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm">
              复制结果
            </Button>
            <Button variant="outline" size="sm">
              导出 SRT
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

// 字幕翻译应用组件
const TranslateApp: React.FC = () => {
  const [sourceText, setSourceText] = useState('');
  const [targetLang, setTargetLang] = useState('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const [result, setResult] = useState('');

  const handleTranslate = () => {
    if (!sourceText.trim()) return;

    setIsTranslating(true);
    setResult('');

    setTimeout(() => {
      setIsTranslating(false);
      const translations: Record<string, string> = {
        en: `Hello everyone, welcome to this video.
Today we're going to talk about the development trends of artificial intelligence.
First, let's review the major breakthroughs in the AI field in recent years.
From deep learning to large language models, the pace of technological iteration is amazing.`,
        ja: `皆さん、こんにちは。本日の動画へようこそ。
今日は人工知能の発展トレンドについてお話しします。
まず、近年のAI分野における重要なブレークスルーを振り返りましょう。
ディープラーニングから大規模言語モデルまで、技術の反復速度は驚くべきものです。`,
        ko: `안녕하세요, 이번 영상에 오신 것을 환영합니다.
오늘은 인공지능의 발전 추세에 대해 이야기해 보겠습니다.
먼저 최근 몇 년간 AI 분야의 주요 돌파구를 살펴보겠습니다.
딥러닝에서 대형 언어 모델까지, 기술 반복 속도는 놀랍습니다.`
      };
      setResult(translations[targetLang] || translations.en);
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* 左侧：源文本 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>源文本（中文）</Label>
          </div>
          <Textarea
            value={sourceText}
            onChange={(e) => setSourceText(e.target.value)}
            placeholder="请输入要翻译的字幕文本..."
            className="h-64 resize-none"
          />
        </div>

        {/* 右侧：翻译结果 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>翻译结果</Label>
            <Select value={targetLang} onValueChange={setTargetLang}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">英文</SelectItem>
                <SelectItem value="ja">日语</SelectItem>
                <SelectItem value="ko">韩语</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Textarea value={result} readOnly placeholder="翻译结果将显示在这里..." className="h-64 resize-none" />
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-center mt-6">
        <Button onClick={handleTranslate} disabled={!sourceText.trim() || isTranslating} className="px-8">
          {isTranslating && <TbLoader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isTranslating ? '翻译中...' : '开始翻译'}
        </Button>
      </div>

      {result && (
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" size="sm">
            复制结果
          </Button>
          <Button variant="outline" size="sm">
            导出文件
          </Button>
        </div>
      )}
    </div>
  );
};

const AppsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeApp, setActiveApp] = useState<string | null>(null);

  // 根据搜索筛选应用
  const filteredApps = mockApps.filter((app) => {
    return app.name.toLowerCase().includes(searchQuery.toLowerCase()) || app.description.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // 获取当前打开的应用信息
  const currentApp = mockApps.find((app) => app.id === activeApp);

  // 如果有打开的应用，显示应用界面
  if (activeApp && currentApp) {
    return (
      <SidebarInset className="bg-background">
        <div className="flex flex-col h-full">
          {/* 应用顶部栏 */}
          <div className="flex items-center gap-4 px-6 py-4 border-b">
            <Button variant="ghost" size="sm" onClick={() => setActiveApp(null)} className="gap-2">
              <TbArrowLeft className="w-4 h-4" />
              返回
            </Button>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${currentApp.bgColor} ${currentApp.color}`}>
                <currentApp.icon className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">{currentApp.name}</h1>
                <p className="text-sm text-muted-foreground">{currentApp.description}</p>
              </div>
            </div>
          </div>

          {/* 应用内容 */}
          <div className="flex-1 overflow-auto p-6">
            {activeApp === 'video-transcribe' && <TranscribeApp />}
            {activeApp === 'subtitle-translate' && <TranslateApp />}
          </div>
        </div>
      </SidebarInset>
    );
  }

  // 应用列表页面
  return (
    <SidebarInset className="bg-background">
      <div className="flex flex-col h-full">
        {/* 顶部工具栏 */}
        <div className="flex items-center gap-4 px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <TbApps className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">应用中心</h1>
          </div>
          <div className="flex-1" />
          <div className="relative w-64">
            <TbSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="搜索应用..." className="pl-9 h-9" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        {/* 应用列表 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredApps.map((app) => (
              <Card key={app.id} className="cursor-pointer hover:shadow-md transition-shadow group" onClick={() => setActiveApp(app.id)}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className={`p-2 rounded-lg ${app.bgColor} ${app.color}`}>
                      <app.icon className="w-6 h-6" />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveApp(app.id);
                      }}
                    >
                      启动
                    </Button>
                  </div>
                  <CardTitle className="text-base mt-3">{app.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="line-clamp-2">{app.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredApps.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <TbApps className="w-12 h-12 mb-4" />
              <p>没有找到匹配的应用</p>
            </div>
          )}
        </div>
      </div>
    </SidebarInset>
  );
};

export default AppsPage;
