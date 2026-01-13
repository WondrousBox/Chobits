import { TbDots, TbFile, TbFileDescription, TbHome, TbLetterT, TbLink, TbMusic, TbPhoto, TbRss, TbVideo } from 'react-icons/tb';

export const ALL_TAG_VALUE = '__all__';

export const typeOptions: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: '', label: '全部', icon: TbHome },
  { key: 'image', label: '图片', icon: TbPhoto },
  { key: 'video', label: '视频', icon: TbVideo },
  { key: 'audio', label: '音频', icon: TbMusic },
  { key: 'text', label: '文本', icon: TbLetterT },
  { key: 'link', label: '链接', icon: TbLink },
  { key: 'file', label: '文件', icon: TbFile },
  { key: 'document', label: '文档', icon: TbFileDescription },
  { key: 'rss', label: '订阅', icon: TbRss },
  { key: 'other', label: '其他', icon: TbDots }
];
