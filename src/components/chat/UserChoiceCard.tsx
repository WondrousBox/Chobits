/**
 * 交互式选择卡片组件
 *
 * 支持：
 * - 单选 / 多选
 * - 多题滑动（swipe between questions）
 * - 选择完成后回调
 */

import type { UserChoiceRequest } from '@packages/ai/types';
import { useCallback, useState } from 'react';
import { TbCheck, TbChevronLeft, TbChevronRight } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

interface UserChoiceCardProps {
  request: UserChoiceRequest;
  /** 用户全部回答完毕后的回调 */
  onSubmit: (answers: Record<string, string[]>) => void;
  /** 是否已提交（只读模式） */
  submitted?: boolean;
  /** 已提交的答案（只读模式下显示） */
  submittedAnswers?: Record<string, string[]>;
}

export default function UserChoiceCard({ request, onSubmit, submitted, submittedAnswers }: UserChoiceCardProps): JSX.Element {
  const { questions, prompt } = request;
  const totalQuestions = questions.length;

  // 当前题目索引
  const [currentIndex, setCurrentIndex] = useState(0);
  // 每题的已选值
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {};
    for (const q of questions) {
      init[q.id] = [];
    }
    return init;
  });

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === totalQuestions - 1;
  const isFirstQuestion = currentIndex === 0;

  // 当前题目是否有选择
  const currentHasSelection = (answers[currentQuestion?.id] || []).length > 0;

  const toggleOption = useCallback(
    (questionId: string, value: string, multiple: boolean) => {
      if (submitted) return;
      setAnswers((prev) => {
        const current = prev[questionId] || [];
        if (multiple) {
          // 多选：toggle
          const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
          return { ...prev, [questionId]: next };
        }
        // 单选：替换
        return { ...prev, [questionId]: [value] };
      });
    },
    [submitted]
  );

  const handleNext = useCallback(() => {
    if (isLastQuestion) {
      onSubmit(answers);
    } else {
      setCurrentIndex((i) => Math.min(i + 1, totalQuestions - 1));
    }
  }, [isLastQuestion, answers, onSubmit, totalQuestions]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(i - 1, 0));
  }, []);

  // 只读模式
  if (submitted && submittedAnswers) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
        {prompt && <div className="text-xs text-muted-foreground mb-1">{prompt}</div>}
        {questions.map((q) => {
          const selected = submittedAnswers[q.id] || [];
          return (
            <div key={q.id} className="space-y-1">
              <div className="text-sm font-medium">{q.title}</div>
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const isSelected = selected.includes(opt.value);
                  return (
                    <span
                      key={opt.value}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                        isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isSelected && <TbCheck className="h-3 w-3" />}
                      {opt.label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 交互模式
  return (
    <div className="rounded-xl border border-primary/30 bg-background shadow-sm overflow-hidden">
      {/* 顶部提示 */}
      {prompt && <div className="px-3 pt-2.5 text-xs text-muted-foreground">{prompt}</div>}

      {/* 题目内容 */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">{currentQuestion.title}</div>
            {currentQuestion.description && <div className="text-xs text-muted-foreground mt-0.5">{currentQuestion.description}</div>}
          </div>
          {totalQuestions > 1 && (
            <div className="text-xs text-muted-foreground shrink-0 ml-2">
              {currentIndex + 1} / {totalQuestions}
            </div>
          )}
        </div>

        {/* 选项类型提示 */}
        <div className="text-[10px] text-muted-foreground">{currentQuestion.multiple ? '多选 — 可选择多个' : '单选 — 请选择一个'}</div>

        {/* 选项列表 */}
        <div className="flex flex-col gap-1.5">
          {currentQuestion.options.map((opt) => {
            const isSelected = (answers[currentQuestion.id] || []).includes(opt.value);
            return (
              <button
                key={opt.value}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-all border ${
                  isSelected ? 'border-primary bg-primary/10 text-foreground' : 'border-border/50 bg-muted/20 hover:bg-muted/40 text-foreground/80'
                }`}
                onClick={() => toggleOption(currentQuestion.id, opt.value, !!currentQuestion.multiple)}
              >
                {/* 选中指示器 */}
                <span
                  className={`mt-0.5 shrink-0 flex items-center justify-center rounded-full border transition-colors ${
                    currentQuestion.multiple ? 'w-4 h-4' : 'w-4 h-4'
                  } ${isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}
                  style={currentQuestion.multiple ? { borderRadius: '4px' } : {}}
                >
                  {isSelected && <TbCheck className="h-2.5 w-2.5" />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{opt.label}</div>
                  {opt.description && <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="px-3 pb-2.5 flex items-center justify-between gap-2">
        <div>
          {!isFirstQuestion && (
            <Button size="sm" variant="ghost" onClick={handlePrev} className="h-7 px-2 text-xs">
              <TbChevronLeft className="h-3.5 w-3.5 mr-0.5" />
              上一题
            </Button>
          )}
        </div>
        <Button size="sm" onClick={handleNext} disabled={!currentHasSelection} className="h-7 px-3 text-xs">
          {isLastQuestion ? (
            <>
              <TbCheck className="h-3.5 w-3.5 mr-0.5" />
              确认提交
            </>
          ) : (
            <>
              下一题
              <TbChevronRight className="h-3.5 w-3.5 ml-0.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
