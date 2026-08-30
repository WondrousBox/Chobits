/**
 * SpriteEffectPage — mini 分支占位
 *
 * 原 PersonaGainEffects（XP/好感度增益特效）已随游戏化功能移除，
 * 该窗口路由保留以兼容主进程窗口配置，但不再渲染任何内容。
 */
export function SpriteEffectPage(): JSX.Element {
  return <div className="h-full w-full bg-transparent" />;
}

export default SpriteEffectPage;
