import React from 'react';

export type TintableSvgProps = {
  src: string;
  className?: string;
  alt?: string;
  title?: string;
  // Force treat as monochrome and tint with currentColor; overrides auto detection
  monochrome?: boolean;
  // If provided, overrides currentColor for this icon only
  color?: string;
};

function isAbsoluteOrProtocol(src: string) {
  return /^(https?:)?\/\//.test(src) || src.startsWith('res://') || src.startsWith('/') || src.startsWith('data:');
}

function normalizeSrc(src: string) {
  if (isAbsoluteOrProtocol(src)) return src;
  // Treat as app resource relative path
  const forward = src.replace(/\\/g, '/');
  return 'res://local/' + encodeURIComponent(forward);
}

function shouldMono(src: string, force?: boolean) {
  if (typeof force === 'boolean') return force;
  // URL override markers
  const monoMarked = /(#|\?)mono(=1)?\b/.test(src) || /[?&]tint(=1)?\b/.test(src);
  const colorMarked = /(#|\?)color(=1)?\b/.test(src) || /[?&]noMono(=1)?\b/.test(src);
  if (monoMarked) return true;
  if (colorMarked) return false;

  // Rule for local paths: if filename contains '-color', treat as multi-color (do not tint).
  const isLocal = !isAbsoluteOrProtocol(src);
  if (isLocal) {
    const fname = (src.split(/[\\/]/).pop() || '').toLowerCase();
    if (fname.includes('-color')) return false;
    // default: local non "-color" icons are considered monochrome and will be tinted
    return true;
  }
  // For non-local sources: default not monochrome unless explicitly marked
  return false;
}

function stripTintMarkers(src: string) {
  return src
    .replace(/#mono\b/, '')
    .replace(/([?&])mono=1\b/, '$1')
    .replace(/([?&])tint=1\b/, '$1')
    .replace(/#color\b/, '')
    .replace(/([?&])color=1\b/, '$1')
    .replace(/([?&])noMono=1\b/, '$1')
    .replace(/([?&])&+/, '$1')
    .replace(/[?&]$/, '');
}

export default function TintableSvg({ src, className, alt, title, monochrome, color }: TintableSvgProps) {
  const mono = shouldMono(src, monochrome);
  const normalized = normalizeSrc(src);
  const cleaned = stripTintMarkers(normalized);

  if (!mono) {
    return <img src={normalized} className={className} alt={alt} title={title || alt} />;
  }

  const style: React.CSSProperties = {
    backgroundColor: color || 'currentColor',
    WebkitMaskImage: `url(${cleaned})`,
    maskImage: `url(${cleaned})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    display: 'inline-block',
  };

  return (
    <span
      className={className}
      style={style}
      role="img"
      aria-label={alt}
      title={title || alt}
    />
  );
}
