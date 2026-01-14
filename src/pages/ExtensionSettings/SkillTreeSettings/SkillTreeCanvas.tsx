import { motion } from 'framer-motion';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import ParticleBackground from './ParticleBackground';
import SkillNode from './SkillNode';
import { canUnlockSkill, getNodeColors, SkillStatus, SkillTier, skillTierConfig, skillTreeNodes } from './skillTreeData';

interface SkillTreeCanvasProps {
  skillStatuses: Record<string, SkillStatus>;
  selectedSkill: string | null;
  onSelectSkill: (skillId: string) => void;
}

// 等级列配置
const TIER_ORDER: SkillTier[] = ['beginner', 'intermediate', 'advanced', 'professional', 'master'];
const COLUMN_WIDTH = 250; // 每小列宽度
const ROW_HEIGHT = 130; // 每行高度
const CORE_X = 100; // 精灵核心X位置
const BRANCH_POINT_X = 180; // 分支点X位置（核心和第一级技能之间，缩短直线部分）
const START_X = 500; // 起始X位置（第一级技能的位置，增加距离）
const START_Y = 100; // 起始Y位置
const TIER_GAP = 60; // 等级之间的额外间距

// 计算每个等级的起始列索引
// 每个等级内有最多 N 列（column 0, 1, 2...）
const MAX_COLUMNS_PER_TIER = 2; // 每个等级最多2列

const SkillTreeCanvas: React.FC<SkillTreeCanvasProps> = ({ skillStatuses, selectedSkill, onSelectSkill }) => {
  // 拖拽滚动状态
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [scrollPos, setScrollPos] = useState({ x: 0, y: 0 });

  // 鼠标拖拽开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // 只在点击背景时启用拖拽
    if ((e.target as HTMLElement).closest('.skill-node-interactive')) return;

    setIsDragging(true);
    setStartPos({ x: e.clientX, y: e.clientY });
    if (containerRef.current) {
      setScrollPos({
        x: containerRef.current.scrollLeft,
        y: containerRef.current.scrollTop
      });
    }
    e.preventDefault();
  }, []);

  // 鼠标拖拽移动
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const deltaX = e.clientX - startPos.x;
      const deltaY = e.clientY - startPos.y;

      containerRef.current.scrollLeft = scrollPos.x - deltaX;
      containerRef.current.scrollTop = scrollPos.y - deltaY;
    },
    [isDragging, startPos, scrollPos]
  );

  // 鼠标拖拽结束
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 鼠标离开容器
  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);
  // 计算活跃技能集合
  const activeSkills = useMemo(() => {
    const active = new Set<string>();
    Object.entries(skillStatuses).forEach(([id, status]) => {
      if (status === 'active') {
        active.add(id);
      }
    });
    return active;
  }, [skillStatuses]);

  // 计算每个技能节点的位置
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};

    skillTreeNodes.forEach((node) => {
      const tierIndex = TIER_ORDER.indexOf(node.tier);
      // X = 起始位置 + 等级基础位置 + 等级内列偏移 + 等级间间距
      const tierBaseX = tierIndex * (MAX_COLUMNS_PER_TIER * COLUMN_WIDTH + TIER_GAP);
      const columnOffset = (node.column || 0) * COLUMN_WIDTH;
      const x = START_X + tierBaseX + columnOffset;
      const y = START_Y + node.row * ROW_HEIGHT;
      positions[node.id] = { x, y };
    });

    return positions;
  }, []);

  // 计算连接线
  const connections = useMemo(() => {
    const lines: Array<{
      id: string;
      from: { x: number; y: number };
      to: { x: number; y: number };
      fromId: string;
      toId: string;
      branch: string;
      isActive: boolean;
    }> = [];

    skillTreeNodes.forEach((node) => {
      node.prerequisites.forEach((prereqId) => {
        const fromPos = nodePositions[prereqId];
        const toPos = nodePositions[node.id];
        if (fromPos && toPos) {
          const prereqStatus = skillStatuses[prereqId] || 'locked';
          const nodeStatus = skillStatuses[node.id] || 'locked';
          const isActive = prereqStatus === 'active' && (nodeStatus === 'active' || nodeStatus === 'unlocked');

          lines.push({
            id: `${prereqId}-${node.id}`,
            from: { x: fromPos.x + 40, y: fromPos.y }, // 从节点右侧出发
            to: { x: toPos.x - 40, y: toPos.y }, // 到节点左侧
            fromId: prereqId,
            toId: node.id,
            branch: node.branch,
            isActive
          });
        }
      });
    });

    return lines;
  }, [nodePositions, skillStatuses]);

  // 计算画布总宽度 - 每个等级有 MAX_COLUMNS_PER_TIER 列，加上等级间间距
  const canvasWidth = START_X + TIER_ORDER.length * (MAX_COLUMNS_PER_TIER * COLUMN_WIDTH + TIER_GAP) + 200;
  // 计算画布总高度（基于最大行数）
  const maxRow = Math.max(...skillTreeNodes.map((n) => n.row));
  const canvasHeight = START_Y + (maxRow + 1) * ROW_HEIGHT + 150;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"
      style={{
        cursor: isDragging ? 'grabbing' : 'grab',
        overflow: 'auto',
        overflowX: 'scroll',
        overflowY: 'scroll'
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {/* 粒子背景 - 固定 */}
      <div className="fixed inset-0 pointer-events-none">
        <ParticleBackground />
      </div>

      {/* 可滚动内容区域 */}
      <div
        className="relative"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          minWidth: canvasWidth,
          minHeight: canvasHeight
        }}
      >
        {/* 等级列标题 */}
        <div className="absolute top-0 left-0 right-0 flex" style={{ paddingLeft: START_X - 60 }}>
          {TIER_ORDER.map((tier, index) => {
            const config = skillTierConfig[tier];
            // 每个等级标题居中于该等级的所有列
            const tierWidth = MAX_COLUMNS_PER_TIER * COLUMN_WIDTH;
            return (
              <motion.div
                key={tier}
                className="flex flex-col items-center justify-center"
                style={{
                  width: tierWidth,
                  marginRight: TIER_GAP,
                  paddingTop: 20
                }}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <div
                  className="px-4 py-2 rounded-full text-sm font-bold"
                  style={{
                    backgroundColor: `${config.color}20`,
                    color: config.color,
                    border: `2px solid ${config.color}40`,
                    textShadow: `0 0 10px ${config.color}60`
                  }}
                >
                  {config.label}技能
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* 精灵核心 - 左侧起点 */}
        <motion.div
          className="absolute flex flex-col items-center skill-node-interactive"
          style={{
            left: CORE_X - 40,
            top: canvasHeight / 2 - 60
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          {/* 核心圆圈 */}
          <motion.div
            className="relative w-24 h-24 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
              boxShadow: '0 0 30px rgba(251, 191, 36, 0.6), 0 0 60px rgba(251, 191, 36, 0.3)'
            }}
            animate={{
              boxShadow: [
                '0 0 30px rgba(251, 191, 36, 0.6), 0 0 60px rgba(251, 191, 36, 0.3)',
                '0 0 40px rgba(251, 191, 36, 0.8), 0 0 80px rgba(251, 191, 36, 0.4)',
                '0 0 30px rgba(251, 191, 36, 0.6), 0 0 60px rgba(251, 191, 36, 0.3)'
              ]
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {/* 精灵占位图标 */}
            <span className="text-4xl">🧚</span>

            {/* 旋转光环 */}
            <motion.div className="absolute inset-[-8px] rounded-full border-2 border-amber-400/40" animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: 'linear' }} />
            <motion.div
              className="absolute inset-[-16px] rounded-full border border-amber-300/20"
              style={{ borderStyle: 'dashed' }}
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>

          {/* 标签 */}
          <motion.span className="mt-3 px-3 py-1 rounded-lg text-sm font-bold text-amber-400 bg-slate-800/80" style={{ textShadow: '0 0 10px rgba(251, 191, 36, 0.5)' }}>
            精灵核心
          </motion.span>
        </motion.div>

        {/* 从核心到初级技能的连接线 */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: canvasWidth, height: canvasHeight }}>
          <defs>
            <filter id="line-glow-canvas" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 获取所有第一级技能（beginner tier，无前置技能） */}
          {(() => {
            const beginnerNodes = skillTreeNodes.filter((n) => n.tier === 'beginner' && n.prerequisites.length === 0);
            const coreY = canvasHeight / 2 - 20;
            const branchY = coreY; // 分支点Y位置（与核心同高）

            // 检查是否有任何第一级技能已激活（只有 active 才显示高光）
            const hasActiveBeginner = beginnerNodes.some((node) => {
              const status = skillStatuses[node.id] || 'locked';
              return status === 'active';
            });

            return (
              <>
                {/* 从核心到分支点的主线（水平线） */}
                <g>
                  {/* 发光底线 */}
                  {hasActiveBeginner && (
                    <motion.line
                      x1={CORE_X + 40}
                      y1={coreY}
                      x2={BRANCH_POINT_X}
                      y2={branchY}
                      stroke="#fbbf24"
                      strokeWidth="6"
                      opacity={0.3}
                      filter="url(#line-glow-canvas)"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1 }}
                    />
                  )}
                  {/* 主线 */}
                  <motion.line
                    x1={CORE_X + 40}
                    y1={coreY}
                    x2={BRANCH_POINT_X}
                    y2={branchY}
                    stroke={hasActiveBeginner ? '#fbbf24' : '#374151'}
                    strokeWidth={hasActiveBeginner ? 3 : 2}
                    opacity={hasActiveBeginner ? 0.8 : 0.3}
                    strokeDasharray={hasActiveBeginner ? '0' : '8 8'}
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.8 }}
                  />
                </g>

                {/* 从分支点到各个第一级技能的贝塞尔曲线 */}
                {beginnerNodes.map((node, index) => {
                  const targetPos = nodePositions[node.id];
                  if (!targetPos) return null;

                  const colors = getNodeColors(node.branch);
                  const status = skillStatuses[node.id] || 'locked';
                  // 只有真正激活（active）的技能才显示高光和流动粒子
                  const isActive = status === 'active';

                  // 计算距离和方向
                  const dx = targetPos.x - 40 - BRANCH_POINT_X;
                  const dy = targetPos.y - branchY;

                  // S曲线控制点计算 - 开始水平 → 弯曲 → 末端水平
                  // 第一个控制点：从分支点水平延伸，Y保持与分支点相同
                  // X方向：向右延伸约60px，保持水平
                  // Y方向：与分支点相同，确保开始部分水平
                  const cp1X = BRANCH_POINT_X + 60;
                  const cp1Y = branchY; // 与分支点Y相同，确保开始水平

                  // 第二个控制点：在目标点左侧，Y等于目标Y，确保末端水平指向
                  // X方向：距离目标X约60px，让末端有足够长度水平指向
                  // Y方向：等于目标Y，确保曲线末端水平
                  const cp2X = targetPos.x - 40 - 60;
                  const cp2Y = targetPos.y; // 与目标Y相同，确保末端水平

                  // 使用平滑的S曲线路径
                  const pathData = `M ${BRANCH_POINT_X} ${branchY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${targetPos.x - 40} ${targetPos.y}`;

                  return (
                    <g key={`branch-${node.id}`}>
                      {/* 发光底线 - 只有激活时显示 */}
                      {isActive && (
                        <motion.path
                          d={pathData}
                          stroke={colors.color}
                          strokeWidth="6"
                          fill="none"
                          opacity={0.3}
                          filter="url(#line-glow-canvas)"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 1, delay: 0.5 + index * 0.1 }}
                        />
                      )}
                      {/* 贝塞尔曲线主线 */}
                      <motion.path
                        d={pathData}
                        stroke={isActive ? colors.color : '#374151'}
                        strokeWidth={isActive ? 3 : 2}
                        fill="none"
                        opacity={isActive ? 0.8 : 0.3}
                        strokeDasharray={isActive ? '0' : '8 8'}
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.8, delay: 0.3 + index * 0.1 }}
                      />
                      {/* 流动粒子 - 只有激活时显示 */}
                      {isActive && (
                        <motion.circle r="4" fill={colors.color} filter="url(#line-glow-canvas)">
                          <animateMotion dur="2s" repeatCount="indefinite" path={pathData} />
                        </motion.circle>
                      )}
                    </g>
                  );
                })}
              </>
            );
          })()}

          {/* 技能间的连接线 */}
          {connections.map((line) => {
            const colors = getNodeColors(line.branch);

            // 计算贝塞尔曲线控制点
            const midX = (line.from.x + line.to.x) / 2;

            return (
              <g key={line.id}>
                {/* 发光底线 */}
                {line.isActive && (
                  <motion.path
                    d={`M ${line.from.x} ${line.from.y} C ${midX} ${line.from.y}, ${midX} ${line.to.y}, ${line.to.x} ${line.to.y}`}
                    stroke={colors.color}
                    strokeWidth="6"
                    fill="none"
                    opacity={0.3}
                    filter="url(#line-glow-canvas)"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1 }}
                  />
                )}
                {/* 主线 */}
                <motion.path
                  d={`M ${line.from.x} ${line.from.y} C ${midX} ${line.from.y}, ${midX} ${line.to.y}, ${line.to.x} ${line.to.y}`}
                  stroke={line.isActive ? colors.color : '#374151'}
                  strokeWidth={line.isActive ? 3 : 2}
                  fill="none"
                  opacity={line.isActive ? 0.8 : 0.3}
                  strokeDasharray={line.isActive ? '0' : '8 8'}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8 }}
                />
                {/* 流动粒子 */}
                {line.isActive && (
                  <motion.circle r="4" fill={colors.color} filter="url(#line-glow-canvas)">
                    <animateMotion dur="2s" repeatCount="indefinite" path={`M ${line.from.x} ${line.from.y} C ${midX} ${line.from.y}, ${midX} ${line.to.y}, ${line.to.x} ${line.to.y}`} />
                  </motion.circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* 技能节点层 */}
        <div className="absolute inset-0" style={{ zIndex: 10 }}>
          {skillTreeNodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;

            const status = skillStatuses[node.id] || 'locked';
            // 如果前置都已激活但自己还是 locked，则显示为 unlocked（可解锁）
            const canUnlock = canUnlockSkill(node.id, activeSkills);
            const displayStatus = status === 'locked' && canUnlock ? 'unlocked' : status;

            return <SkillNode key={node.id} node={node} status={displayStatus} isSelected={selectedSkill === node.id} onClick={() => onSelectSkill(node.id)} position={pos} />;
          })}
        </div>

        {/* 分支标签（左侧） */}
        <div className="absolute left-2 top-0 bottom-0 flex flex-col justify-center gap-8" style={{ paddingTop: START_Y }}>
          {[
            { branch: 'perception', rows: [0, 1, 2], label: '感知系' },
            { branch: 'care', rows: [3], label: '关怀系' },
            { branch: 'avatar', rows: [5, 6], label: '化身系' },
            { branch: 'intelligence', rows: [7, 8], label: '智能系' }
          ].map(({ branch, rows, label }) => {
            const colors = getNodeColors(branch);
            const minRow = Math.min(...rows);
            const maxRow = Math.max(...rows);
            const topY = START_Y + minRow * ROW_HEIGHT - 20;
            const height = (maxRow - minRow + 1) * ROW_HEIGHT;

            return (
              <motion.div
                key={branch}
                className="absolute left-0 flex items-center"
                style={{
                  top: topY + height / 2 - 15,
                  writingMode: 'vertical-rl',
                  textOrientation: 'mixed'
                }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 }}
              >
                <span
                  className="px-2 py-3 rounded-lg text-xs font-bold tracking-wider"
                  style={{
                    backgroundColor: `${colors.color}15`,
                    color: colors.color,
                    border: `1px solid ${colors.color}30`,
                    textShadow: `0 0 8px ${colors.glowColor}`
                  }}
                >
                  {label}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SkillTreeCanvas;
