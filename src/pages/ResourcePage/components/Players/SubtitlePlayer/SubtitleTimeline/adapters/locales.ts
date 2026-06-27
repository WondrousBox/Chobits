import type { TimelineLabels } from './types';

// ========== Chinese Simplified (zh-CN) - Default ==========

const zhCN: Required<TimelineLabels> = {
  // Toolbar
  zoomOut: '缩小',
  zoomIn: '放大',
  zoomLevel: '缩放级别: {value} px/s',
  selectTool: '选择工具',
  cutTool: '裁剪工具',
  importMedia: '导入媒体',
  trackCount: '{count} 轨道',
  segmentCount: '{count} 片段',
  trackSegmentSummary: '{tracks} · {segments}',
  waveform: '波形',
  waveformClip: '波形/剪辑',
  clip: '剪辑',
  clipDeleted: '已删除',
  clipSplitBeforeSuffix: ' (前)',
  clipSplitAfterSuffix: ' (后)',
  defaultTrackLabels: ['原文', '译文', '轨道 3', '轨道 4', '轨道 5', '轨道 6'],
  trackLabelTemplate: '轨道 {index}',

  // Common
  cancel: '取消',
  delete: '删除',
  settings: '设置',
  show: '显示',
  hide: '隐藏',
  deleteTrack: '删除轨道',
  deleteConfirmTitle: '确定删除「{label}」吗？',
  deleteConfirmDescription: '将永久删除该轨道内所有内容，无法恢复。',
  comingSoon: '即将推出',
  annotationDefaultLabel: '标注',
  annotationDelete: '删除标注',
  seekBackward5: '后退 5 秒',
  seekForward5: '前进 5 秒',
  audioEnd: '音频结束: {time}s',
  timecodeCurrentAriaLabel: '当前时间码',

  // Inline input
  inlineInputPlaceholder: '输入内容，enter 确认，esc 取消',

  // Track add menu
  trackAddButtonLabel: '添加轨道',
  trackAddSubtitle: '字幕',
  trackAddTTS: '语音合成',
  trackAddMedia: '图片和视频',

  // Block actions
  blockEdit: '编辑',
  blockPause: '暂停',
  blockPlay: '播放',
  blockMoveUp: '上移（提前播放）',
  blockMoveDown: '下移（延后播放）',
  blockDragEdgeSpeed: '拖拽块两端边缘可调整速度',
  blockTransformSettings: '变换设置',
  blockRotate90: '旋转 90°',
  blockRestore: '恢复片段',
  blockMergePrev: '合并到上一条',
  blockDelete: '删除',
  blockValidationEmpty: '内容不能为空',
  blockValidationControlChar: '不能包含控制字符',
  blockValidationArrow: '不能包含 "-->"',
  blockValidationMaxLength: '内容不能超过 {maxLength} 字符',
  blockValidationInvalid: '内容无效',
  blockEditHint: '回车确定，Esc 取消',
  blockWaveformLoading: '加载波形...',

  // Block handles
  blockHandlesDragSpeed: '拖拽调整速度',
  blockHandlesDragTime: '拖拽调整时间',

  // Block order
  blockOrderPlayback: '播放顺序: 第 {order} 个',

  // Block status
  blockStatusSynthesizing: '合成中',
  blockStatusSynthesisFailed: '合成失败',
  blockStatusPending: '等待',

  // Media import
  mediaImportNoValidFiles: '没有找到有效的媒体文件（支持视频和图片)',
  mediaImportProcessError: '处理文件时出错',
  mediaImportDragDropPathError: '无法获取文件路径，请使用"选择文件"按钮',
  mediaImportOpenDialogError: '打开文件对话框失败',
  mediaImportTitle: '导入媒体文件',
  mediaImportProcessing: '正在处理文件...',
  mediaImportDragDropHint: '拖拽视频或图片文件到此处',
  mediaImportSelectFiles: '选择文件',
  mediaImportSelectedFiles: '已选择的文件 ({count})',
  mediaImportAddToTrack: '添加到轨道',
  mediaImportNewTrack: '新建轨道',
  mediaImportClearSelection: '清空选择',
  mediaImportConfirm: '导入 ({count})',

  // Media track
  mediaTrackHide: '隐藏轨道',
  mediaTrackShow: '显示轨道',
  mediaTrackDelete: '删除轨道',
  mediaTrackDeleteConfirmTitle: '删除轨道',
  mediaTrackDeleteConfirmDescription: '确定要删除轨道「{label}」吗？此操作将永久删除该资源，无法恢复。',

  // Media quick add
  mediaQuickAddDropToRelease: '释放以添加媒体',
  mediaQuickAddProcessing: '处理中...',
  mediaQuickAddEmptyHint: '右键或拖拽文件添加媒体',
  mediaQuickAddMenuTitle: '添加媒体',
  mediaQuickAddSelectFile: '选择文件...',
  mediaQuickAddFromLibrary: '从资源库选择',

  // Media transform
  mediaTransformTitle: '变换设置',
  mediaTransformQuickActions: '快速操作',
  mediaTransformCenter: '居中',
  mediaTransformFitScreen: '适应屏幕',
  mediaTransformFit: '适应',
  mediaTransformFillScreen: '填充屏幕',
  mediaTransformFill: '填充',
  mediaTransformPositionX: '水平位置 (X)',
  mediaTransformPositionY: '垂直位置 (Y)',
  mediaTransformScale: '缩放',
  mediaTransformRotation: '旋转',
  mediaTransformOpacity: '不透明度',
  mediaTransformFlip: '翻转',
  mediaTransformFlipHorizontal: '水平翻转',
  mediaTransformFlipVertical: '垂直翻转',
  mediaTransformReset: '重置为默认值',

  // Media transition
  transitionTypeNone: '无',
  transitionTypeNoneDesc: '无转场效果',
  transitionTypeFade: '淡入淡出',
  transitionTypeFadeDesc: '渐变透明度过渡',
  transitionTypeDissolve: '溶解',
  transitionTypeDissolveDesc: '像素级溶解效果',
  transitionTypeWipeLeft: '左擦除',
  transitionTypeWipeLeftDesc: '从左向右擦除',
  transitionTypeWipeRight: '右擦除',
  transitionTypeWipeRightDesc: '从右向左擦除',
  transitionIn: '入场',
  transitionOut: '出场',
  transitionLabel: '转场',
  transitionDuration: '时长',
  transitionRemove: '移除转场',
  transitionAddIn: '添加{position}转场',
  transitionAddOut: '添加{position}转场',

  // Thumbnail
  thumbnailLoading: '加载中...',
  thumbnailNoPreview: '无预览',
  thumbnailLoadFailed: '加载缩略图失败',
  thumbnailAlt: '缩略图 {index}',

  // Waveform
  waveformNoData: '暂无波形数据',

  // TTS track
  ttsTrackEmptyHint: '点击添加配音片段',

  // TTS batch
  ttsBatchClearText: '清空文本',
  ttsBatchConfigWarning: '请先配置 TTS 语音设置',
  ttsBatchInputLabel: '输入文本（每行一句）',
  ttsBatchPlaceholder: '在此粘贴文本，一行为一句',
  ttsBatchPlaceholderLine1: '这是第一句话',
  ttsBatchPlaceholderLine2: '这是第二句话',
  ttsBatchPlaceholderLine3: '这是第三句话',
  ttsBatchPreviewLabel: '预览',
  ttsBatchCompleted: '已完成',
  ttsBatchSynthesizing: '合成中...',
  ttsBatchStopSynthesis: '停止合成',
  ttsBatchStartSynthesis: '依次合成'
};

// ========== English (en) ==========

const en: Required<TimelineLabels> = {
  // Toolbar
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  zoomLevel: 'Zoom: {value} px/s',
  selectTool: 'Select',
  cutTool: 'Cut',
  importMedia: 'Import media',
  trackCount: '{count} tracks',
  segmentCount: '{count} segments',
  trackSegmentSummary: '{tracks} · {segments}',
  waveform: 'Waveform',
  waveformClip: 'Waveform/Clip',
  clip: 'Clip',
  clipDeleted: 'Deleted',
  clipSplitBeforeSuffix: ' (before)',
  clipSplitAfterSuffix: ' (after)',
  defaultTrackLabels: ['Original', 'Translation', 'Track 3', 'Track 4', 'Track 5', 'Track 6'],
  trackLabelTemplate: 'Track {index}',

  // Common
  cancel: 'Cancel',
  delete: 'Delete',
  settings: 'Settings',
  show: 'Show',
  hide: 'Hide',
  deleteTrack: 'Delete track',
  deleteConfirmTitle: 'Delete "{label}"?',
  deleteConfirmDescription: 'This will permanently delete all content in this track. This action cannot be undone.',
  comingSoon: 'Coming soon',
  annotationDefaultLabel: 'Annotation',
  annotationDelete: 'Delete annotation',
  seekBackward5: 'Back 5 seconds',
  seekForward5: 'Forward 5 seconds',
  audioEnd: 'Audio end: {time}s',
  timecodeCurrentAriaLabel: 'Current timecode',

  // Inline input
  inlineInputPlaceholder: 'Type content, Enter to confirm, Esc to cancel',

  // Track add menu
  trackAddButtonLabel: 'Add track',
  trackAddSubtitle: 'Subtitle',
  trackAddTTS: 'Text-to-Speech',
  trackAddMedia: 'Images & Videos',

  // Block actions
  blockEdit: 'Edit',
  blockPause: 'Pause',
  blockPlay: 'Play',
  blockMoveUp: 'Move up (play earlier)',
  blockMoveDown: 'Move down (play later)',
  blockDragEdgeSpeed: 'Drag block edges to adjust speed',
  blockTransformSettings: 'Transform',
  blockRotate90: 'Rotate 90°',
  blockRestore: 'Restore segment',
  blockMergePrev: 'Merge with previous',
  blockDelete: 'Delete',
  blockValidationEmpty: 'Content cannot be empty',
  blockValidationControlChar: 'Cannot contain control characters',
  blockValidationArrow: 'Cannot contain "-->"',
  blockValidationMaxLength: 'Content cannot exceed {maxLength} characters',
  blockValidationInvalid: 'Invalid content',
  blockEditHint: 'Enter to confirm, Esc to cancel',
  blockWaveformLoading: 'Loading waveform...',

  // Block handles
  blockHandlesDragSpeed: 'Drag to adjust speed',
  blockHandlesDragTime: 'Drag to adjust time',

  // Block order
  blockOrderPlayback: 'Playback order: #{order}',

  // Block status
  blockStatusSynthesizing: 'Synthesizing',
  blockStatusSynthesisFailed: 'Synthesis failed',
  blockStatusPending: 'Pending',

  // Media import
  mediaImportNoValidFiles: 'No valid media files found (supports video and images)',
  mediaImportProcessError: 'Error processing file',
  mediaImportDragDropPathError: 'Cannot get file path, please use the "Select files" button',
  mediaImportOpenDialogError: 'Failed to open file dialog',
  mediaImportTitle: 'Import media files',
  mediaImportProcessing: 'Processing files...',
  mediaImportDragDropHint: 'Drag and drop video or image files here',
  mediaImportSelectFiles: 'Select files',
  mediaImportSelectedFiles: 'Selected files ({count})',
  mediaImportAddToTrack: 'Add to track',
  mediaImportNewTrack: 'New track',
  mediaImportClearSelection: 'Clear selection',
  mediaImportConfirm: 'Import ({count})',

  // Media track
  mediaTrackHide: 'Hide track',
  mediaTrackShow: 'Show track',
  mediaTrackDelete: 'Delete track',
  mediaTrackDeleteConfirmTitle: 'Delete track',
  mediaTrackDeleteConfirmDescription: 'Are you sure you want to delete track "{label}"? This will permanently delete the resource and cannot be undone.',

  // Media quick add
  mediaQuickAddDropToRelease: 'Release to add media',
  mediaQuickAddProcessing: 'Processing...',
  mediaQuickAddEmptyHint: 'Right-click or drag files to add media',
  mediaQuickAddMenuTitle: 'Add media',
  mediaQuickAddSelectFile: 'Select file...',
  mediaQuickAddFromLibrary: 'From library',

  // Media transform
  mediaTransformTitle: 'Transform',
  mediaTransformQuickActions: 'Quick actions',
  mediaTransformCenter: 'Center',
  mediaTransformFitScreen: 'Fit screen',
  mediaTransformFit: 'Fit',
  mediaTransformFillScreen: 'Fill screen',
  mediaTransformFill: 'Fill',
  mediaTransformPositionX: 'Position X',
  mediaTransformPositionY: 'Position Y',
  mediaTransformScale: 'Scale',
  mediaTransformRotation: 'Rotation',
  mediaTransformOpacity: 'Opacity',
  mediaTransformFlip: 'Flip',
  mediaTransformFlipHorizontal: 'Flip horizontal',
  mediaTransformFlipVertical: 'Flip vertical',
  mediaTransformReset: 'Reset to default',

  // Media transition
  transitionTypeNone: 'None',
  transitionTypeNoneDesc: 'No transition',
  transitionTypeFade: 'Fade',
  transitionTypeFadeDesc: 'Gradual opacity transition',
  transitionTypeDissolve: 'Dissolve',
  transitionTypeDissolveDesc: 'Pixel-level dissolve effect',
  transitionTypeWipeLeft: 'Wipe left',
  transitionTypeWipeLeftDesc: 'Wipe from left to right',
  transitionTypeWipeRight: 'Wipe right',
  transitionTypeWipeRightDesc: 'Wipe from right to left',
  transitionIn: 'In',
  transitionOut: 'Out',
  transitionLabel: 'Transition',
  transitionDuration: 'Duration',
  transitionRemove: 'Remove transition',
  transitionAddIn: 'Add {position} transition',
  transitionAddOut: 'Add {position} transition',

  // Thumbnail
  thumbnailLoading: 'Loading...',
  thumbnailNoPreview: 'No preview',
  thumbnailLoadFailed: 'Failed to load thumbnail',
  thumbnailAlt: 'Thumbnail {index}',

  // Waveform
  waveformNoData: 'No waveform data',

  // TTS track
  ttsTrackEmptyHint: 'Click to add voice segment',

  // TTS batch
  ttsBatchClearText: 'Clear text',
  ttsBatchConfigWarning: 'Please configure TTS voice settings first',
  ttsBatchInputLabel: 'Enter text (one sentence per line)',
  ttsBatchPlaceholder: 'Paste text here, one sentence per line',
  ttsBatchPlaceholderLine1: 'This is the first sentence',
  ttsBatchPlaceholderLine2: 'This is the second sentence',
  ttsBatchPlaceholderLine3: 'This is the third sentence',
  ttsBatchPreviewLabel: 'Preview',
  ttsBatchCompleted: 'completed',
  ttsBatchSynthesizing: 'Synthesizing...',
  ttsBatchStopSynthesis: 'Stop synthesis',
  ttsBatchStartSynthesis: 'Start synthesis'
};

// ========== Chinese Traditional (zh-TW) ==========

const zhTW: Required<TimelineLabels> = {
  // Toolbar
  zoomOut: '縮小',
  zoomIn: '放大',
  zoomLevel: '縮放級別: {value} px/s',
  selectTool: '選擇工具',
  cutTool: '裁剪工具',
  importMedia: '匯入媒體',
  trackCount: '{count} 軌道',
  segmentCount: '{count} 片段',
  trackSegmentSummary: '{tracks} · {segments}',
  waveform: '波形',
  waveformClip: '波形/剪輯',
  clip: '剪輯',
  clipDeleted: '已刪除',
  clipSplitBeforeSuffix: ' (前)',
  clipSplitAfterSuffix: ' (後)',
  defaultTrackLabels: ['原文', '譯文', '軌道 3', '軌道 4', '軌道 5', '軌道 6'],
  trackLabelTemplate: '軌道 {index}',

  // Common
  cancel: '取消',
  delete: '刪除',
  settings: '設定',
  show: '顯示',
  hide: '隱藏',
  deleteTrack: '刪除軌道',
  deleteConfirmTitle: '確定刪除「{label}」嗎？',
  deleteConfirmDescription: '將永久刪除該軌道內所有內容，無法恢復。',
  comingSoon: '即將推出',
  annotationDefaultLabel: '標註',
  annotationDelete: '刪除標註',
  seekBackward5: '後退 5 秒',
  seekForward5: '前進 5 秒',
  audioEnd: '音訊結束: {time}s',
  timecodeCurrentAriaLabel: '目前時間碼',

  // Inline input
  inlineInputPlaceholder: '輸入內容，enter 確認，esc 取消',

  // Track add menu
  trackAddButtonLabel: '新增軌道',
  trackAddSubtitle: '字幕',
  trackAddTTS: '語音合成',
  trackAddMedia: '圖片和影片',

  // Block actions
  blockEdit: '編輯',
  blockPause: '暫停',
  blockPlay: '播放',
  blockMoveUp: '上移（提前播放）',
  blockMoveDown: '下移（延後播放）',
  blockDragEdgeSpeed: '拖曳區塊兩端邊緣可調整速度',
  blockTransformSettings: '變換設定',
  blockRotate90: '旋轉 90°',
  blockRestore: '恢復片段',
  blockMergePrev: '合併到上一條',
  blockDelete: '刪除',
  blockValidationEmpty: '內容不能為空',
  blockValidationControlChar: '不能包含控制字元',
  blockValidationArrow: '不能包含 "-->"',
  blockValidationMaxLength: '內容不能超過 {maxLength} 字元',
  blockValidationInvalid: '內容無效',
  blockEditHint: 'Enter 確定，Esc 取消',
  blockWaveformLoading: '載入波形...',

  // Block handles
  blockHandlesDragSpeed: '拖曳調整速度',
  blockHandlesDragTime: '拖曳調整時間',

  // Block order
  blockOrderPlayback: '播放順序: 第 {order} 個',

  // Block status
  blockStatusSynthesizing: '合成中',
  blockStatusSynthesisFailed: '合成失敗',
  blockStatusPending: '等待',

  // Media import
  mediaImportNoValidFiles: '沒有找到有效的媒體檔案（支援影片和圖片)',
  mediaImportProcessError: '處理檔案時出錯',
  mediaImportDragDropPathError: '無法取得檔案路徑，請使用「選擇檔案」按鈕',
  mediaImportOpenDialogError: '開啟檔案對話框失敗',
  mediaImportTitle: '匯入媒體檔案',
  mediaImportProcessing: '正在處理檔案...',
  mediaImportDragDropHint: '拖曳影片或圖片檔案到此處',
  mediaImportSelectFiles: '選擇檔案',
  mediaImportSelectedFiles: '已選擇的檔案 ({count})',
  mediaImportAddToTrack: '加入軌道',
  mediaImportNewTrack: '新建軌道',
  mediaImportClearSelection: '清空選擇',
  mediaImportConfirm: '匯入 ({count})',

  // Media track
  mediaTrackHide: '隱藏軌道',
  mediaTrackShow: '顯示軌道',
  mediaTrackDelete: '刪除軌道',
  mediaTrackDeleteConfirmTitle: '刪除軌道',
  mediaTrackDeleteConfirmDescription: '確定要刪除軌道「{label}」嗎？此操作將永久刪除該資源，無法恢復。',

  // Media quick add
  mediaQuickAddDropToRelease: '釋放以加入媒體',
  mediaQuickAddProcessing: '處理中...',
  mediaQuickAddEmptyHint: '右鍵或拖曳檔案新增媒體',
  mediaQuickAddMenuTitle: '加入媒體',
  mediaQuickAddSelectFile: '選擇檔案...',
  mediaQuickAddFromLibrary: '從資源庫選擇',

  // Media transform
  mediaTransformTitle: '變換設定',
  mediaTransformQuickActions: '快速操作',
  mediaTransformCenter: '置中',
  mediaTransformFitScreen: '適應螢幕',
  mediaTransformFit: '適應',
  mediaTransformFillScreen: '填滿螢幕',
  mediaTransformFill: '填滿',
  mediaTransformPositionX: '水平位置 (X)',
  mediaTransformPositionY: '垂直位置 (Y)',
  mediaTransformScale: '縮放',
  mediaTransformRotation: '旋轉',
  mediaTransformOpacity: '不透明度',
  mediaTransformFlip: '翻轉',
  mediaTransformFlipHorizontal: '水平翻轉',
  mediaTransformFlipVertical: '垂直翻轉',
  mediaTransformReset: '重設為預設值',

  // Media transition
  transitionTypeNone: '無',
  transitionTypeNoneDesc: '無轉場效果',
  transitionTypeFade: '淡入淡出',
  transitionTypeFadeDesc: '漸變透明度過渡',
  transitionTypeDissolve: '溶解',
  transitionTypeDissolveDesc: '像素級溶解效果',
  transitionTypeWipeLeft: '左擦除',
  transitionTypeWipeLeftDesc: '從左向右擦除',
  transitionTypeWipeRight: '右擦除',
  transitionTypeWipeRightDesc: '從右向左擦除',
  transitionIn: '入場',
  transitionOut: '出場',
  transitionLabel: '轉場',
  transitionDuration: '時長',
  transitionRemove: '移除轉場',
  transitionAddIn: '新增{position}轉場',
  transitionAddOut: '新增{position}轉場',

  // Thumbnail
  thumbnailLoading: '載入中...',
  thumbnailNoPreview: '無預覽',
  thumbnailLoadFailed: '載入縮圖失敗',
  thumbnailAlt: '縮圖 {index}',

  // Waveform
  waveformNoData: '暫無波形資料',

  // TTS track
  ttsTrackEmptyHint: '點擊新增配音片段',

  // TTS batch
  ttsBatchClearText: '清空文字',
  ttsBatchConfigWarning: '請先設定 TTS 語音設定',
  ttsBatchInputLabel: '輸入文字（每行一句）',
  ttsBatchPlaceholder: '在此貼上文字，一行為一句',
  ttsBatchPlaceholderLine1: '這是第一句話',
  ttsBatchPlaceholderLine2: '這是第二句話',
  ttsBatchPlaceholderLine3: '這是第三句話',
  ttsBatchPreviewLabel: '預覽',
  ttsBatchCompleted: '已完成',
  ttsBatchSynthesizing: '合成中...',
  ttsBatchStopSynthesis: '停止合成',
  ttsBatchStartSynthesis: '依次合成'
};

// ========== Japanese (ja) ==========

const ja: Required<TimelineLabels> = {
  // Toolbar
  zoomOut: '縮小',
  zoomIn: '拡大',
  zoomLevel: 'ズーム: {value} px/s',
  selectTool: '選択ツール',
  cutTool: 'カットツール',
  importMedia: 'メディアをインポート',
  trackCount: '{count} トラック',
  segmentCount: '{count} セグメント',
  trackSegmentSummary: '{tracks} · {segments}',
  waveform: '波形',
  waveformClip: '波形/クリップ',
  clip: 'クリップ',
  clipDeleted: '削除済み',
  clipSplitBeforeSuffix: ' (前半)',
  clipSplitAfterSuffix: ' (後半)',
  defaultTrackLabels: ['原文', '訳文', 'トラック 3', 'トラック 4', 'トラック 5', 'トラック 6'],
  trackLabelTemplate: 'トラック {index}',

  // Common
  cancel: 'キャンセル',
  delete: '削除',
  settings: '設定',
  show: '表示',
  hide: '非表示',
  deleteTrack: 'トラックを削除',
  deleteConfirmTitle: '「{label}」を削除しますか？',
  deleteConfirmDescription: 'このトラック内のすべての内容が永久に削除され、元に戻すことはできません。',
  comingSoon: '近日公開',
  annotationDefaultLabel: '注釈',
  annotationDelete: '注釈を削除',
  seekBackward5: '5秒戻る',
  seekForward5: '5秒進む',
  audioEnd: '音声終了: {time}s',
  timecodeCurrentAriaLabel: '現在のタイムコード',

  // Inline input
  inlineInputPlaceholder: '内容を入力、Enterで確認、Escでキャンセル',

  // Track add menu
  trackAddButtonLabel: 'トラックを追加',
  trackAddSubtitle: '字幕',
  trackAddTTS: '音声合成',
  trackAddMedia: '画像と動画',

  // Block actions
  blockEdit: '編集',
  blockPause: '一時停止',
  blockPlay: '再生',
  blockMoveUp: '上に移動（先に再生）',
  blockMoveDown: '下に移動（後に再生）',
  blockDragEdgeSpeed: 'ブロックの端をドラッグして速度を調整',
  blockTransformSettings: '変換設定',
  blockRotate90: '90°回転',
  blockRestore: 'セグメントを復元',
  blockMergePrev: '前のセグメントと結合',
  blockDelete: '削除',
  blockValidationEmpty: '内容を空にすることはできません',
  blockValidationControlChar: '制御文字を含めることはできません',
  blockValidationArrow: '"-->"を含めることはできません',
  blockValidationMaxLength: '内容は{maxLength}文字を超えることはできません',
  blockValidationInvalid: '無効な内容です',
  blockEditHint: 'Enterで確認、Escでキャンセル',
  blockWaveformLoading: '波形を読み込み中...',

  // Block handles
  blockHandlesDragSpeed: 'ドラッグして速度を調整',
  blockHandlesDragTime: 'ドラッグして時間を調整',

  // Block order
  blockOrderPlayback: '再生順序: {order}番目',

  // Block status
  blockStatusSynthesizing: '合成中',
  blockStatusSynthesisFailed: '合成に失敗しました',
  blockStatusPending: '待機中',

  // Media import
  mediaImportNoValidFiles: '有効なメディアファイルが見つかりません（動画と画像をサポート）',
  mediaImportProcessError: 'ファイルの処理中にエラーが発生しました',
  mediaImportDragDropPathError: 'ファイルパスを取得できません。「ファイルを選択」ボタンを使用してください',
  mediaImportOpenDialogError: 'ファイルダイアログを開けませんでした',
  mediaImportTitle: 'メディアファイルをインポート',
  mediaImportProcessing: 'ファイルを処理中...',
  mediaImportDragDropHint: '動画または画像ファイルをここにドラッグ＆ドロップ',
  mediaImportSelectFiles: 'ファイルを選択',
  mediaImportSelectedFiles: '選択されたファイル ({count})',
  mediaImportAddToTrack: 'トラックに追加',
  mediaImportNewTrack: '新しいトラック',
  mediaImportClearSelection: '選択をクリア',
  mediaImportConfirm: 'インポート ({count})',

  // Media track
  mediaTrackHide: 'トラックを非表示',
  mediaTrackShow: 'トラックを表示',
  mediaTrackDelete: 'トラックを削除',
  mediaTrackDeleteConfirmTitle: 'トラックを削除',
  mediaTrackDeleteConfirmDescription: 'トラック「{label}」を削除しますか？この操作は元に戻すことができません。',

  // Media quick add
  mediaQuickAddDropToRelease: 'ドロップしてメディアを追加',
  mediaQuickAddProcessing: '処理中...',
  mediaQuickAddEmptyHint: '右クリックまたはファイルをドラッグしてメディアを追加',
  mediaQuickAddMenuTitle: 'メディアを追加',
  mediaQuickAddSelectFile: 'ファイルを選択...',
  mediaQuickAddFromLibrary: 'ライブラリから選択',

  // Media transform
  mediaTransformTitle: '変換設定',
  mediaTransformQuickActions: 'クイックアクション',
  mediaTransformCenter: '中央',
  mediaTransformFitScreen: '画面に合わせる',
  mediaTransformFit: 'フィット',
  mediaTransformFillScreen: '画面に埋める',
  mediaTransformFill: 'フィル',
  mediaTransformPositionX: '水平位置 (X)',
  mediaTransformPositionY: '垂直位置 (Y)',
  mediaTransformScale: 'スケール',
  mediaTransformRotation: '回転',
  mediaTransformOpacity: '不透明度',
  mediaTransformFlip: '反転',
  mediaTransformFlipHorizontal: '水平反転',
  mediaTransformFlipVertical: '垂直反転',
  mediaTransformReset: 'デフォルトにリセット',

  // Media transition
  transitionTypeNone: 'なし',
  transitionTypeNoneDesc: 'トランジションなし',
  transitionTypeFade: 'フェード',
  transitionTypeFadeDesc: '段階的な不透明度遷移',
  transitionTypeDissolve: 'ディゾルブ',
  transitionTypeDissolveDesc: 'ピクセルレベルのディゾルブ効果',
  transitionTypeWipeLeft: '左ワイプ',
  transitionTypeWipeLeftDesc: '左から右へのワイプ',
  transitionTypeWipeRight: '右ワイプ',
  transitionTypeWipeRightDesc: '右から左へのワイプ',
  transitionIn: 'イン',
  transitionOut: 'アウト',
  transitionLabel: 'トランジション',
  transitionDuration: '時間',
  transitionRemove: 'トランジションを削除',
  transitionAddIn: '{position}トランジションを追加',
  transitionAddOut: '{position}トランジションを追加',

  // Thumbnail
  thumbnailLoading: '読み込み中...',
  thumbnailNoPreview: 'プレビューなし',
  thumbnailLoadFailed: 'サムネイルの読み込みに失敗しました',
  thumbnailAlt: 'サムネイル {index}',

  // Waveform
  waveformNoData: '波形データがありません',

  // TTS track
  ttsTrackEmptyHint: 'クリックして音声セグメントを追加',

  // TTS batch
  ttsBatchClearText: 'テキストをクリア',
  ttsBatchConfigWarning: '先にTTS音声設定を構成してください',
  ttsBatchInputLabel: 'テキストを入力（1行に1文）',
  ttsBatchPlaceholder: 'ここにテキストを貼り付け、1行に1文',
  ttsBatchPlaceholderLine1: 'これは最初の文です',
  ttsBatchPlaceholderLine2: 'これは2番目の文です',
  ttsBatchPlaceholderLine3: 'これは3番目の文です',
  ttsBatchPreviewLabel: 'プレビュー',
  ttsBatchCompleted: '完了',
  ttsBatchSynthesizing: '合成中...',
  ttsBatchStopSynthesis: '合成を停止',
  ttsBatchStartSynthesis: '順次合成'
};

// ========== Korean (ko) ==========

const ko: Required<TimelineLabels> = {
  // Toolbar
  zoomOut: '축소',
  zoomIn: '확대',
  zoomLevel: '줌: {value} px/s',
  selectTool: '선택 도구',
  cutTool: '자르기 도구',
  importMedia: '미디어 가져오기',
  trackCount: '{count} 트랙',
  segmentCount: '{count} 세그먼트',
  trackSegmentSummary: '{tracks} · {segments}',
  waveform: '파형',
  waveformClip: '파형/클립',
  clip: '클립',
  clipDeleted: '삭제됨',
  clipSplitBeforeSuffix: ' (앞)',
  clipSplitAfterSuffix: ' (뒤)',
  defaultTrackLabels: ['원문', '번역', '트랙 3', '트랙 4', '트랙 5', '트랙 6'],
  trackLabelTemplate: '트랙 {index}',

  // Common
  cancel: '취소',
  delete: '삭제',
  settings: '설정',
  show: '표시',
  hide: '숨기기',
  deleteTrack: '트랙 삭제',
  deleteConfirmTitle: '"{label}"을(를) 삭제하시겠습니까?',
  deleteConfirmDescription: '이 트랙의 모든 콘텐츠가 영구적으로 삭제되며 복원할 수 없습니다.',
  comingSoon: '출시 예정',
  annotationDefaultLabel: '주석',
  annotationDelete: '주석 삭제',
  seekBackward5: '5초 뒤로',
  seekForward5: '5초 앞으로',
  audioEnd: '오디오 종료: {time}s',
  timecodeCurrentAriaLabel: '현재 타임코드',

  // Inline input
  inlineInputPlaceholder: '내용을 입력하고 Enter로 확인, Esc로 취소',

  // Track add menu
  trackAddButtonLabel: '트랙 추가',
  trackAddSubtitle: '자막',
  trackAddTTS: '음성 합성',
  trackAddMedia: '이미지 및 동영상',

  // Block actions
  blockEdit: '편집',
  blockPause: '일시 정지',
  blockPlay: '재생',
  blockMoveUp: '위로 이동 (빠른 재생)',
  blockMoveDown: '아래로 이동 (늦은 재생)',
  blockDragEdgeSpeed: '블록 가장자리를 드래그하여 속도 조정',
  blockTransformSettings: '변형 설정',
  blockRotate90: '90° 회전',
  blockRestore: '세그먼트 복원',
  blockMergePrev: '이전과 병합',
  blockDelete: '삭제',
  blockValidationEmpty: '내용을 비워둘 수 없습니다',
  blockValidationControlChar: '제어 문자를 포함할 수 없습니다',
  blockValidationArrow: '"-->"를 포함할 수 없습니다',
  blockValidationMaxLength: '내용은 {maxLength}자를 초과할 수 없습니다',
  blockValidationInvalid: '유효하지 않은 내용입니다',
  blockEditHint: 'Enter로 확인, Esc로 취소',
  blockWaveformLoading: '파형 로딩 중...',

  // Block handles
  blockHandlesDragSpeed: '드래그하여 속도 조정',
  blockHandlesDragTime: '드래그하여 시간 조정',

  // Block order
  blockOrderPlayback: '재생 순서: {order}번째',

  // Block status
  blockStatusSynthesizing: '합성 중',
  blockStatusSynthesisFailed: '합성 실패',
  blockStatusPending: '대기 중',

  // Media import
  mediaImportNoValidFiles: '유효한 미디어 파일을 찾을 수 없습니다 (동영상 및 이미지 지원)',
  mediaImportProcessError: '파일 처리 중 오류가 발생했습니다',
  mediaImportDragDropPathError: '파일 경로를 가져올 수 없습니다. "파일 선택" 버튼을 사용하세요',
  mediaImportOpenDialogError: '파일 대화상자를 열지 못했습니다',
  mediaImportTitle: '미디어 파일 가져오기',
  mediaImportProcessing: '파일 처리 중...',
  mediaImportDragDropHint: '동영상 또는 이미지 파일을 여기에 드래그 앤 드롭',
  mediaImportSelectFiles: '파일 선택',
  mediaImportSelectedFiles: '선택된 파일 ({count})',
  mediaImportAddToTrack: '트랙에 추가',
  mediaImportNewTrack: '새 트랙',
  mediaImportClearSelection: '선택 초기화',
  mediaImportConfirm: '가져오기 ({count})',

  // Media track
  mediaTrackHide: '트랙 숨기기',
  mediaTrackShow: '트랙 표시',
  mediaTrackDelete: '트랙 삭제',
  mediaTrackDeleteConfirmTitle: '트랙 삭제',
  mediaTrackDeleteConfirmDescription: '트랙 "{label}"을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',

  // Media quick add
  mediaQuickAddDropToRelease: '놓아서 미디어 추가',
  mediaQuickAddProcessing: '처리 중...',
  mediaQuickAddEmptyHint: '오른쪽 클릭하거나 파일을 드래그하여 미디어 추가',
  mediaQuickAddMenuTitle: '미디어 추가',
  mediaQuickAddSelectFile: '파일 선택...',
  mediaQuickAddFromLibrary: '라이브러리에서 선택',

  // Media transform
  mediaTransformTitle: '변형 설정',
  mediaTransformQuickActions: '빠른 작업',
  mediaTransformCenter: '가운데',
  mediaTransformFitScreen: '화면에 맞추기',
  mediaTransformFit: '맞춤',
  mediaTransformFillScreen: '화면 채우기',
  mediaTransformFill: '채우기',
  mediaTransformPositionX: '수평 위치 (X)',
  mediaTransformPositionY: '수직 위치 (Y)',
  mediaTransformScale: '크기 조정',
  mediaTransformRotation: '회전',
  mediaTransformOpacity: '불투명도',
  mediaTransformFlip: '뒤집기',
  mediaTransformFlipHorizontal: '수평 뒤집기',
  mediaTransformFlipVertical: '수직 뒤집기',
  mediaTransformReset: '기본값으로 재설정',

  // Media transition
  transitionTypeNone: '없음',
  transitionTypeNoneDesc: '전환 효과 없음',
  transitionTypeFade: '페이드',
  transitionTypeFadeDesc: '점진적 불투명도 전환',
  transitionTypeDissolve: '디졸브',
  transitionTypeDissolveDesc: '픽셀 수준 디졸브 효과',
  transitionTypeWipeLeft: '왼쪽 와이프',
  transitionTypeWipeLeftDesc: '왼쪽에서 오른쪽으로 와이프',
  transitionTypeWipeRight: '오른쪽 와이프',
  transitionTypeWipeRightDesc: '오른쪽에서 왼쪽으로 와이프',
  transitionIn: '인',
  transitionOut: '아웃',
  transitionLabel: '전환',
  transitionDuration: '지속 시간',
  transitionRemove: '전환 제거',
  transitionAddIn: '{position} 전환 추가',
  transitionAddOut: '{position} 전환 추가',

  // Thumbnail
  thumbnailLoading: '로딩 중...',
  thumbnailNoPreview: '미리보기 없음',
  thumbnailLoadFailed: '썸네일 로드 실패',
  thumbnailAlt: '썸네일 {index}',

  // Waveform
  waveformNoData: '파형 데이터 없음',

  // TTS track
  ttsTrackEmptyHint: '클릭하여 음성 세그먼트 추가',

  // TTS batch
  ttsBatchClearText: '텍스트 지우기',
  ttsBatchConfigWarning: '먼저 TTS 음성 설정을 구성하세요',
  ttsBatchInputLabel: '텍스트 입력 (한 줄에 한 문장)',
  ttsBatchPlaceholder: '여기에 텍스트를 붙여넣기, 한 줄에 한 문장',
  ttsBatchPlaceholderLine1: '이것은 첫 번째 문장입니다',
  ttsBatchPlaceholderLine2: '이것은 두 번째 문장입니다',
  ttsBatchPlaceholderLine3: '이것은 세 번째 문장입니다',
  ttsBatchPreviewLabel: '미리보기',
  ttsBatchCompleted: '완료',
  ttsBatchSynthesizing: '합성 중...',
  ttsBatchStopSynthesis: '합성 중지',
  ttsBatchStartSynthesis: '순차 합성'
};

// ========== German (de) ==========

const de: Required<TimelineLabels> = {
  // Toolbar
  zoomOut: 'Verkleinern',
  zoomIn: 'Vergrößern',
  zoomLevel: 'Zoom: {value} px/s',
  selectTool: 'Auswahl',
  cutTool: 'Schnitt',
  importMedia: 'Medien importieren',
  trackCount: '{count} Spuren',
  segmentCount: '{count} Segmente',
  trackSegmentSummary: '{tracks} · {segments}',
  waveform: 'Wellenform',
  waveformClip: 'Wellenform/Clip',
  clip: 'Clip',
  clipDeleted: 'Gelöscht',
  clipSplitBeforeSuffix: ' (vorher)',
  clipSplitAfterSuffix: ' (nachher)',
  defaultTrackLabels: ['Original', 'Übersetzung', 'Spur 3', 'Spur 4', 'Spur 5', 'Spur 6'],
  trackLabelTemplate: 'Spur {index}',

  // Common
  cancel: 'Abbrechen',
  delete: 'Löschen',
  settings: 'Einstellungen',
  show: 'Anzeigen',
  hide: 'Ausblenden',
  deleteTrack: 'Spur löschen',
  deleteConfirmTitle: '"{label}" löschen?',
  deleteConfirmDescription: 'Alle Inhalte dieser Spur werden dauerhaft gelöscht. Dies kann nicht rückgängig gemacht werden.',
  comingSoon: 'Demnächst',
  annotationDefaultLabel: 'Anmerkung',
  annotationDelete: 'Anmerkung löschen',
  seekBackward5: '5 Sekunden zurück',
  seekForward5: '5 Sekunden vor',
  audioEnd: 'Audioende: {time}s',
  timecodeCurrentAriaLabel: 'Aktueller Timecode',

  // Inline input
  inlineInputPlaceholder: 'Inhalt eingeben, Enter zum Bestätigen, Esc zum Abbrechen',

  // Track add menu
  trackAddButtonLabel: 'Spur hinzufügen',
  trackAddSubtitle: 'Untertitel',
  trackAddTTS: 'Sprachsynthese',
  trackAddMedia: 'Bilder & Videos',

  // Block actions
  blockEdit: 'Bearbeiten',
  blockPause: 'Pause',
  blockPlay: 'Abspielen',
  blockMoveUp: 'Nach oben (früher abspielen)',
  blockMoveDown: 'Nach unten (später abspielen)',
  blockDragEdgeSpeed: 'Blockkanten ziehen, um die Geschwindigkeit anzupassen',
  blockTransformSettings: 'Transformation',
  blockRotate90: '90° drehen',
  blockRestore: 'Segment wiederherstellen',
  blockMergePrev: 'Mit vorherigem zusammenführen',
  blockDelete: 'Löschen',
  blockValidationEmpty: 'Inhalt darf nicht leer sein',
  blockValidationControlChar: 'Darf keine Steuerzeichen enthalten',
  blockValidationArrow: 'Darf "-->" nicht enthalten',
  blockValidationMaxLength: 'Inhalt darf {maxLength} Zeichen nicht überschreiten',
  blockValidationInvalid: 'Ungültiger Inhalt',
  blockEditHint: 'Enter zum Bestätigen, Esc zum Abbrechen',
  blockWaveformLoading: 'Wellenform laden...',

  // Block handles
  blockHandlesDragSpeed: 'Ziehen zum Anpassen der Geschwindigkeit',
  blockHandlesDragTime: 'Ziehen zum Anpassen der Zeit',

  // Block order
  blockOrderPlayback: 'Wiedergabereihenfolge: #{order}',

  // Block status
  blockStatusSynthesizing: 'Synthese läuft',
  blockStatusSynthesisFailed: 'Synthese fehlgeschlagen',
  blockStatusPending: 'Ausstehend',

  // Media import
  mediaImportNoValidFiles: 'Keine gültigen Mediendateien gefunden (unterstützt Video und Bilder)',
  mediaImportProcessError: 'Fehler beim Verarbeiten der Datei',
  mediaImportDragDropPathError: 'Dateipfad kann nicht abgerufen werden, bitte "Dateien auswählen" verwenden',
  mediaImportOpenDialogError: 'Dateidialog konnte nicht geöffnet werden',
  mediaImportTitle: 'Mediendateien importieren',
  mediaImportProcessing: 'Dateien werden verarbeitet...',
  mediaImportDragDropHint: 'Video- oder Bilddateien hierher ziehen',
  mediaImportSelectFiles: 'Dateien auswählen',
  mediaImportSelectedFiles: 'Ausgewählte Dateien ({count})',
  mediaImportAddToTrack: 'Zur Spur hinzufügen',
  mediaImportNewTrack: 'Neue Spur',
  mediaImportClearSelection: 'Auswahl leeren',
  mediaImportConfirm: 'Importieren ({count})',

  // Media track
  mediaTrackHide: 'Spur ausblenden',
  mediaTrackShow: 'Spur anzeigen',
  mediaTrackDelete: 'Spur löschen',
  mediaTrackDeleteConfirmTitle: 'Spur löschen',
  mediaTrackDeleteConfirmDescription: 'Möchten Sie die Spur "{label}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.',

  // Media quick add
  mediaQuickAddDropToRelease: 'Loslassen, um Medien hinzuzufügen',
  mediaQuickAddProcessing: 'Verarbeitung...',
  mediaQuickAddEmptyHint: 'Rechtsklick oder Dateien ziehen, um Medien hinzuzufügen',
  mediaQuickAddMenuTitle: 'Medien hinzufügen',
  mediaQuickAddSelectFile: 'Datei auswählen...',
  mediaQuickAddFromLibrary: 'Aus Bibliothek',

  // Media transform
  mediaTransformTitle: 'Transformation',
  mediaTransformQuickActions: 'Schnellaktionen',
  mediaTransformCenter: 'Zentrieren',
  mediaTransformFitScreen: 'An Bildschirm anpassen',
  mediaTransformFit: 'Anpassen',
  mediaTransformFillScreen: 'Bildschirm füllen',
  mediaTransformFill: 'Füllen',
  mediaTransformPositionX: 'Horizontale Position (X)',
  mediaTransformPositionY: 'Vertikale Position (Y)',
  mediaTransformScale: 'Skalierung',
  mediaTransformRotation: 'Drehung',
  mediaTransformOpacity: 'Deckkraft',
  mediaTransformFlip: 'Spiegeln',
  mediaTransformFlipHorizontal: 'Horizontal spiegeln',
  mediaTransformFlipVertical: 'Vertikal spiegeln',
  mediaTransformReset: 'Auf Standard zurücksetzen',

  // Media transition
  transitionTypeNone: 'Keine',
  transitionTypeNoneDesc: 'Kein Übergang',
  transitionTypeFade: 'Überblenden',
  transitionTypeFadeDesc: 'Allmählicher Deckkraftübergang',
  transitionTypeDissolve: 'Auflösen',
  transitionTypeDissolveDesc: 'Pixelbasierte Auflösung',
  transitionTypeWipeLeft: 'Wischlinks',
  transitionTypeWipeLeftDesc: 'Von links nach rechts wischen',
  transitionTypeWipeRight: 'Wischrechts',
  transitionTypeWipeRightDesc: 'Von rechts nach links wischen',
  transitionIn: 'Ein',
  transitionOut: 'Aus',
  transitionLabel: 'Übergang',
  transitionDuration: 'Dauer',
  transitionRemove: 'Übergang entfernen',
  transitionAddIn: '{position} Übergang hinzufügen',
  transitionAddOut: '{position} Übergang hinzufügen',

  // Thumbnail
  thumbnailLoading: 'Laden...',
  thumbnailNoPreview: 'Keine Vorschau',
  thumbnailLoadFailed: 'Vorschaubild konnte nicht geladen werden',
  thumbnailAlt: 'Vorschaubild {index}',

  // Waveform
  waveformNoData: 'Keine Wellenformdaten',

  // TTS track
  ttsTrackEmptyHint: 'Klicken, um Sprachsegment hinzuzufügen',

  // TTS batch
  ttsBatchClearText: 'Text löschen',
  ttsBatchConfigWarning: 'Bitte konfigurieren Sie zuerst die TTS-Spracheinstellungen',
  ttsBatchInputLabel: 'Text eingeben (ein Satz pro Zeile)',
  ttsBatchPlaceholder: 'Text hier einfügen, ein Satz pro Zeile',
  ttsBatchPlaceholderLine1: 'Dies ist der erste Satz',
  ttsBatchPlaceholderLine2: 'Dies ist der zweite Satz',
  ttsBatchPlaceholderLine3: 'Dies ist der dritte Satz',
  ttsBatchPreviewLabel: 'Vorschau',
  ttsBatchCompleted: 'abgeschlossen',
  ttsBatchSynthesizing: 'Synthese läuft...',
  ttsBatchStopSynthesis: 'Synthese stoppen',
  ttsBatchStartSynthesis: 'Sequentielle Synthese'
};

// ========== Spanish (es) ==========

const es: Required<TimelineLabels> = {
  // Toolbar
  zoomOut: 'Reducir',
  zoomIn: 'Ampliar',
  zoomLevel: 'Zoom: {value} px/s',
  selectTool: 'Seleccionar',
  cutTool: 'Cortar',
  importMedia: 'Importar medios',
  trackCount: '{count} pistas',
  segmentCount: '{count} segmentos',
  trackSegmentSummary: '{tracks} · {segments}',
  waveform: 'Forma de onda',
  waveformClip: 'Onda/Clip',
  clip: 'Clip',
  clipDeleted: 'Eliminado',
  clipSplitBeforeSuffix: ' (antes)',
  clipSplitAfterSuffix: ' (después)',
  defaultTrackLabels: ['Original', 'Traducción', 'Pista 3', 'Pista 4', 'Pista 5', 'Pista 6'],
  trackLabelTemplate: 'Pista {index}',

  // Common
  cancel: 'Cancelar',
  delete: 'Eliminar',
  settings: 'Configuración',
  show: 'Mostrar',
  hide: 'Ocultar',
  deleteTrack: 'Eliminar pista',
  deleteConfirmTitle: '¿Eliminar "{label}"?',
  deleteConfirmDescription: 'Se eliminará permanentemente todo el contenido de esta pista. Esta acción no se puede deshacer.',
  comingSoon: 'Próximamente',
  annotationDefaultLabel: 'Anotación',
  annotationDelete: 'Eliminar anotación',
  seekBackward5: 'Retroceder 5 segundos',
  seekForward5: 'Avanzar 5 segundos',
  audioEnd: 'Fin del audio: {time}s',
  timecodeCurrentAriaLabel: 'Código de tiempo actual',

  // Inline input
  inlineInputPlaceholder: 'Escribe contenido, Enter para confirmar, Esc para cancelar',

  // Track add menu
  trackAddButtonLabel: 'Agregar pista',
  trackAddSubtitle: 'Subtítulos',
  trackAddTTS: 'Síntesis de voz',
  trackAddMedia: 'Imágenes y videos',

  // Block actions
  blockEdit: 'Editar',
  blockPause: 'Pausar',
  blockPlay: 'Reproducir',
  blockMoveUp: 'Mover arriba (reproducir antes)',
  blockMoveDown: 'Mover abajo (reproducir después)',
  blockDragEdgeSpeed: 'Arrastra los bordes del bloque para ajustar la velocidad',
  blockTransformSettings: 'Transformación',
  blockRotate90: 'Rotar 90°',
  blockRestore: 'Restaurar segmento',
  blockMergePrev: 'Fusionar con anterior',
  blockDelete: 'Eliminar',
  blockValidationEmpty: 'El contenido no puede estar vacío',
  blockValidationControlChar: 'No puede contener caracteres de control',
  blockValidationArrow: 'No puede contener "-->"',
  blockValidationMaxLength: 'El contenido no puede superar {maxLength} caracteres',
  blockValidationInvalid: 'Contenido inválido',
  blockEditHint: 'Enter para confirmar, Esc para cancelar',
  blockWaveformLoading: 'Cargando forma de onda...',

  // Block handles
  blockHandlesDragSpeed: 'Arrastra para ajustar velocidad',
  blockHandlesDragTime: 'Arrastra para ajustar tiempo',

  // Block order
  blockOrderPlayback: 'Orden de reproducción: #{order}',

  // Block status
  blockStatusSynthesizing: 'Sintetizando',
  blockStatusSynthesisFailed: 'Síntesis fallida',
  blockStatusPending: 'Pendiente',

  // Media import
  mediaImportNoValidFiles: 'No se encontraron archivos multimedia válidos (soporta video e imágenes)',
  mediaImportProcessError: 'Error al procesar el archivo',
  mediaImportDragDropPathError: 'No se puede obtener la ruta del archivo, use el botón "Seleccionar archivos"',
  mediaImportOpenDialogError: 'Error al abrir el diálogo de archivos',
  mediaImportTitle: 'Importar archivos multimedia',
  mediaImportProcessing: 'Procesando archivos...',
  mediaImportDragDropHint: 'Arrastra archivos de video o imagen aquí',
  mediaImportSelectFiles: 'Seleccionar archivos',
  mediaImportSelectedFiles: 'Archivos seleccionados ({count})',
  mediaImportAddToTrack: 'Agregar a pista',
  mediaImportNewTrack: 'Nueva pista',
  mediaImportClearSelection: 'Limpiar selección',
  mediaImportConfirm: 'Importar ({count})',

  // Media track
  mediaTrackHide: 'Ocultar pista',
  mediaTrackShow: 'Mostrar pista',
  mediaTrackDelete: 'Eliminar pista',
  mediaTrackDeleteConfirmTitle: 'Eliminar pista',
  mediaTrackDeleteConfirmDescription: '¿Está seguro de que desea eliminar la pista "{label}"? Esta acción no se puede deshacer.',

  // Media quick add
  mediaQuickAddDropToRelease: 'Suelta para agregar medios',
  mediaQuickAddProcessing: 'Procesando...',
  mediaQuickAddEmptyHint: 'Clic derecho o arrastra archivos para agregar medios',
  mediaQuickAddMenuTitle: 'Agregar medios',
  mediaQuickAddSelectFile: 'Seleccionar archivo...',
  mediaQuickAddFromLibrary: 'Desde la biblioteca',

  // Media transform
  mediaTransformTitle: 'Transformación',
  mediaTransformQuickActions: 'Acciones rápidas',
  mediaTransformCenter: 'Centrar',
  mediaTransformFitScreen: 'Ajustar a pantalla',
  mediaTransformFit: 'Ajustar',
  mediaTransformFillScreen: 'Llenar pantalla',
  mediaTransformFill: 'Llenar',
  mediaTransformPositionX: 'Posición horizontal (X)',
  mediaTransformPositionY: 'Posición vertical (Y)',
  mediaTransformScale: 'Escala',
  mediaTransformRotation: 'Rotación',
  mediaTransformOpacity: 'Opacidad',
  mediaTransformFlip: 'Voltear',
  mediaTransformFlipHorizontal: 'Voltear horizontal',
  mediaTransformFlipVertical: 'Voltear vertical',
  mediaTransformReset: 'Restablecer valores predeterminados',

  // Media transition
  transitionTypeNone: 'Ninguno',
  transitionTypeNoneDesc: 'Sin transición',
  transitionTypeFade: 'Fundido',
  transitionTypeFadeDesc: 'Transición gradual de opacidad',
  transitionTypeDissolve: 'Disolver',
  transitionTypeDissolveDesc: 'Efecto de disolución a nivel de píxel',
  transitionTypeWipeLeft: 'Barrido izquierdo',
  transitionTypeWipeLeftDesc: 'Barrido de izquierda a derecha',
  transitionTypeWipeRight: 'Barrido derecho',
  transitionTypeWipeRightDesc: 'Barrido de derecha a izquierda',
  transitionIn: 'Entrada',
  transitionOut: 'Salida',
  transitionLabel: 'Transición',
  transitionDuration: 'Duración',
  transitionRemove: 'Eliminar transición',
  transitionAddIn: 'Agregar transición de {position}',
  transitionAddOut: 'Agregar transición de {position}',

  // Thumbnail
  thumbnailLoading: 'Cargando...',
  thumbnailNoPreview: 'Sin vista previa',
  thumbnailLoadFailed: 'Error al cargar miniatura',
  thumbnailAlt: 'Miniatura {index}',

  // Waveform
  waveformNoData: 'Sin datos de forma de onda',

  // TTS track
  ttsTrackEmptyHint: 'Haz clic para agregar segmento de voz',

  // TTS batch
  ttsBatchClearText: 'Limpiar texto',
  ttsBatchConfigWarning: 'Configure primero los ajustes de voz TTS',
  ttsBatchInputLabel: 'Ingrese texto (una oración por línea)',
  ttsBatchPlaceholder: 'Pegue texto aquí, una oración por línea',
  ttsBatchPlaceholderLine1: 'Esta es la primera oración',
  ttsBatchPlaceholderLine2: 'Esta es la segunda oración',
  ttsBatchPlaceholderLine3: 'Esta es la tercera oración',
  ttsBatchPreviewLabel: 'Vista previa',
  ttsBatchCompleted: 'completado',
  ttsBatchSynthesizing: 'Sintetizando...',
  ttsBatchStopSynthesis: 'Detener síntesis',
  ttsBatchStartSynthesis: 'Síntesis secuencial'
};

// ========== Italian (it) ==========

const it: Required<TimelineLabels> = {
  // Toolbar
  zoomOut: 'Riduci',
  zoomIn: 'Ingrandisci',
  zoomLevel: 'Zoom: {value} px/s',
  selectTool: 'Seleziona',
  cutTool: 'Taglia',
  importMedia: 'Importa media',
  trackCount: '{count} tracce',
  segmentCount: '{count} segmenti',
  trackSegmentSummary: '{tracks} · {segments}',
  waveform: "Forma d'onda",
  waveformClip: 'Onda/Clip',
  clip: 'Clip',
  clipDeleted: 'Eliminato',
  clipSplitBeforeSuffix: ' (prima)',
  clipSplitAfterSuffix: ' (dopo)',
  defaultTrackLabels: ['Originale', 'Traduzione', 'Traccia 3', 'Traccia 4', 'Traccia 5', 'Traccia 6'],
  trackLabelTemplate: 'Traccia {index}',

  // Common
  cancel: 'Annulla',
  delete: 'Elimina',
  settings: 'Impostazioni',
  show: 'Mostra',
  hide: 'Nascondi',
  deleteTrack: 'Elimina traccia',
  deleteConfirmTitle: 'Eliminare "{label}"?',
  deleteConfirmDescription: 'Tutto il contenuto di questa traccia verrà eliminato permanentemente. Questa azione non può essere annullata.',
  comingSoon: 'Prossimamente',
  annotationDefaultLabel: 'Annotazione',
  annotationDelete: 'Elimina annotazione',
  seekBackward5: 'Indietro di 5 secondi',
  seekForward5: 'Avanti di 5 secondi',
  audioEnd: 'Fine audio: {time}s',
  timecodeCurrentAriaLabel: 'Timecode corrente',

  // Inline input
  inlineInputPlaceholder: 'Inserisci contenuto, Invio per confermare, Esc per annullare',

  // Track add menu
  trackAddButtonLabel: 'Aggiungi traccia',
  trackAddSubtitle: 'Sottotitoli',
  trackAddTTS: 'Sintesi vocale',
  trackAddMedia: 'Immagini e video',

  // Block actions
  blockEdit: 'Modifica',
  blockPause: 'Pausa',
  blockPlay: 'Riproduci',
  blockMoveUp: 'Sposta su (riproduci prima)',
  blockMoveDown: 'Sposta giù (riproduci dopo)',
  blockDragEdgeSpeed: 'Trascina i bordi del blocco per regolare la velocità',
  blockTransformSettings: 'Trasformazione',
  blockRotate90: 'Ruota 90°',
  blockRestore: 'Ripristina segmento',
  blockMergePrev: 'Unisci con precedente',
  blockDelete: 'Elimina',
  blockValidationEmpty: 'Il contenuto non può essere vuoto',
  blockValidationControlChar: 'Non può contenere caratteri di controllo',
  blockValidationArrow: 'Non può contenere "-->"',
  blockValidationMaxLength: 'Il contenuto non può superare {maxLength} caratteri',
  blockValidationInvalid: 'Contenuto non valido',
  blockEditHint: 'Invio per confermare, Esc per annullare',
  blockWaveformLoading: "Caricamento forma d'onda...",

  // Block handles
  blockHandlesDragSpeed: 'Trascina per regolare la velocità',
  blockHandlesDragTime: 'Trascina per regolare il tempo',

  // Block order
  blockOrderPlayback: 'Ordine di riproduzione: #{order}',

  // Block status
  blockStatusSynthesizing: 'Sintesi in corso',
  blockStatusSynthesisFailed: 'Sintesi fallita',
  blockStatusPending: 'In attesa',

  // Media import
  mediaImportNoValidFiles: 'Nessun file multimediale valido trovato (supporta video e immagini)',
  mediaImportProcessError: "Errore durante l'elaborazione del file",
  mediaImportDragDropPathError: 'Impossibile ottenere il percorso del file, utilizzare il pulsante "Seleziona file"',
  mediaImportOpenDialogError: 'Impossibile aprire la finestra di dialogo dei file',
  mediaImportTitle: 'Importa file multimediali',
  mediaImportProcessing: 'Elaborazione file...',
  mediaImportDragDropHint: 'Trascina file video o immagini qui',
  mediaImportSelectFiles: 'Seleziona file',
  mediaImportSelectedFiles: 'File selezionati ({count})',
  mediaImportAddToTrack: 'Aggiungi alla traccia',
  mediaImportNewTrack: 'Nuova traccia',
  mediaImportClearSelection: 'Cancella selezione',
  mediaImportConfirm: 'Importa ({count})',

  // Media track
  mediaTrackHide: 'Nascondi traccia',
  mediaTrackShow: 'Mostra traccia',
  mediaTrackDelete: 'Elimina traccia',
  mediaTrackDeleteConfirmTitle: 'Elimina traccia',
  mediaTrackDeleteConfirmDescription: 'Sei sicuro di voler eliminare la traccia "{label}"? Questa azione non può essere annullata.',

  // Media quick add
  mediaQuickAddDropToRelease: 'Rilascia per aggiungere media',
  mediaQuickAddProcessing: 'Elaborazione...',
  mediaQuickAddEmptyHint: 'Clic destro o trascina file per aggiungere media',
  mediaQuickAddMenuTitle: 'Aggiungi media',
  mediaQuickAddSelectFile: 'Seleziona file...',
  mediaQuickAddFromLibrary: 'Dalla libreria',

  // Media transform
  mediaTransformTitle: 'Trasformazione',
  mediaTransformQuickActions: 'Azioni rapide',
  mediaTransformCenter: 'Centra',
  mediaTransformFitScreen: 'Adatta allo schermo',
  mediaTransformFit: 'Adatta',
  mediaTransformFillScreen: 'Riempi schermo',
  mediaTransformFill: 'Riempi',
  mediaTransformPositionX: 'Posizione orizzontale (X)',
  mediaTransformPositionY: 'Posizione verticale (Y)',
  mediaTransformScale: 'Scala',
  mediaTransformRotation: 'Rotazione',
  mediaTransformOpacity: 'Opacità',
  mediaTransformFlip: 'Capovolgi',
  mediaTransformFlipHorizontal: 'Capovolgi orizzontalmente',
  mediaTransformFlipVertical: 'Capovolgi verticalmente',
  mediaTransformReset: 'Ripristina valori predefiniti',

  // Media transition
  transitionTypeNone: 'Nessuno',
  transitionTypeNoneDesc: 'Nessuna transizione',
  transitionTypeFade: 'Dissolvenza',
  transitionTypeFadeDesc: "Transizione graduale dell'opacità",
  transitionTypeDissolve: 'Dissolvi',
  transitionTypeDissolveDesc: 'Effetto dissolvi a livello di pixel',
  transitionTypeWipeLeft: 'Cancella a sinistra',
  transitionTypeWipeLeftDesc: 'Cancella da sinistra a destra',
  transitionTypeWipeRight: 'Cancella a destra',
  transitionTypeWipeRightDesc: 'Cancella da destra a sinistra',
  transitionIn: 'Ingresso',
  transitionOut: 'Uscita',
  transitionLabel: 'Transizione',
  transitionDuration: 'Durata',
  transitionRemove: 'Rimuovi transizione',
  transitionAddIn: 'Aggiungi transizione {position}',
  transitionAddOut: 'Aggiungi transizione {position}',

  // Thumbnail
  thumbnailLoading: 'Caricamento...',
  thumbnailNoPreview: 'Nessuna anteprima',
  thumbnailLoadFailed: 'Caricamento miniatura non riuscito',
  thumbnailAlt: 'Miniatura {index}',

  // Waveform
  waveformNoData: "Nessun dato forma d'onda",

  // TTS track
  ttsTrackEmptyHint: 'Fai clic per aggiungere segmento vocale',

  // TTS batch
  ttsBatchClearText: 'Cancella testo',
  ttsBatchConfigWarning: 'Configura prima le impostazioni voce TTS',
  ttsBatchInputLabel: 'Inserisci testo (una frase per riga)',
  ttsBatchPlaceholder: 'Incolla testo qui, una frase per riga',
  ttsBatchPlaceholderLine1: 'Questa è la prima frase',
  ttsBatchPlaceholderLine2: 'Questa è la seconda frase',
  ttsBatchPlaceholderLine3: 'Questa è la terza frase',
  ttsBatchPreviewLabel: 'Anteprima',
  ttsBatchCompleted: 'completato',
  ttsBatchSynthesizing: 'Sintesi in corso...',
  ttsBatchStopSynthesis: 'Ferma sintesi',
  ttsBatchStartSynthesis: 'Sintesi sequenziale'
};

// ========== Locale Map ==========

const LOCALE_MAP: Record<string, Required<TimelineLabels>> = {
  'zh-CN': zhCN,
  zh: zhCN,
  'zh-Hans': zhCN,
  en: en,
  'en-US': en,
  'en-GB': en,
  'zh-TW': zhTW,
  'zh-Hant': zhTW,
  ja: ja,
  'ja-JP': ja,
  ko: ko,
  'ko-KR': ko,
  de: de,
  'de-DE': de,
  es: es,
  'es-ES': es,
  it: it,
  'it-IT': it
};

/**
 * Get labels for a given locale string.
 * Falls back to zh-CN if locale is not found.
 */
export function getLabelsForLocale(locale: string): Required<TimelineLabels> {
  return LOCALE_MAP[locale] ?? LOCALE_MAP[locale.split('-')[0]] ?? zhCN;
}

export { de, en, es, it, ja, ko, zhCN, zhTW };
