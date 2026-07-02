import type { SkillInfo } from '@packages/ai/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbRobot } from 'react-icons/tb';
import { toast } from 'sonner';

import { ProviderModelSelect } from '@/components/common/ProviderModelSelect';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  applySkillPickerSelection,
  extractSkillCommandArgs,
  isTypingSlashSkillQuery,
  listSkillSuggestions,
  resolveActiveSkillInfo,
  resolveSuggestedSkillInfo,
  shouldEnableSkillPicker
} from '@/lib/chat-skill-picker';
import { pickCodingWorkspace } from '@/lib/coding-workspace';
import { getSkillTrustPresentation } from '@/lib/skill-trust';
import { useChatSelection } from '@/pages/ChatPage/context/ChatSelectionContext';

import ChatAgentSelect from './ChatAgentSelect';
import ChatFooterActions from './ChatFooterActions';
import CodingWorkspaceButton from './CodingWorkspaceButton';
import EmojiPackButton from './EmojiPackButton';
import SkillPickerButton from './SkillPickerButton';
import UnifiedChatInput, { UnifiedChatInputHandle, UnifiedChatInputProps } from './UnifiedChatInput';
import { mergeTranscriptWithInput, useSpeechInput } from './useSpeechInput';
import WebSearchToggle from './WebSearchToggle';

export interface ChatInputWithServiceProps extends Omit<UnifiedChatInputProps, 'onSend' | 'footerLeft'> {
  onStart: (params: {
    content: string;
    providerId: string;
    modelId: string;
    preferredPresetId?: string;
    agentId: string;
    codingWorkspaceRoot?: string;
    codingWorkspaceLabel?: string;
    webSearchEnabled?: boolean;
    characterPersonaEnabled?: boolean;
    emojiPacksEnabled?: boolean;
    emojiPacksDisplayTarget?: 'chat' | 'sprite-bubble';
  }) => void | Promise<void>;
  onMenuOpenChange?: (open: boolean) => void;
  onMenuOpenPrepare?: () => void;
  menuPlacement?: 'auto' | 'assistant-floating';
}

export default function ChatInputWithService({ onStart, onMenuOpenChange, onMenuOpenPrepare, footerRightExtra, disabled, menuPlacement = 'auto', ...rest }: ChatInputWithServiceProps): JSX.Element {
  const {
    agents,
    providerId,
    modelId,
    presetId,
    agentId,
    codingWorkspaceRoot,
    codingWorkspaceLabel,
    webSearchEnabled,
    emojiPacksEnabled,
    emojiPacksDisplayTarget,
    characterPersonaEnabled,
    setProviderId,
    setModelId,
    setAgentId,
    setCodingWorkspace,
    setWebSearchEnabled,
    setEmojiPacksEnabled,
    setEmojiPacksDisplayTarget,
    setCharacterPersonaEnabled
  } = useChatSelection();
  const inputRef = useRef<UnifiedChatInputHandle>(null);
  const [draft, setDraft] = useState('');
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(false);
  const [highlightedSkillIndex, setHighlightedSkillIndex] = useState(0);

  const isCoder = agentId === 'coder';
  const skillPickerEnabled = shouldEnableSkillPicker(agentId);
  const activeSkillInfo = useMemo(() => resolveActiveSkillInfo(draft, skills), [draft, skills]);
  const suggestedSkillInfo = useMemo(() => resolveSuggestedSkillInfo(draft, skills), [draft, skills]);
  const activeSkillArgs = useMemo(() => extractSkillCommandArgs(draft), [draft]);
  const slashSuggestions = useMemo(() => listSkillSuggestions(draft, skills).slice(0, 8), [draft, skills]);
  const slashMenuActive = skillPickerEnabled && isTypingSlashSkillQuery(draft) && slashSuggestions.length > 0;
  const highlightedSkillInfo = slashSuggestions[highlightedSkillIndex] || slashSuggestions[0];
  const activeSkillTrust = useMemo(() => (activeSkillInfo ? getSkillTrustPresentation(activeSkillInfo) : undefined), [activeSkillInfo]);
  const floatingMenuProps = menuPlacement === 'assistant-floating' ? ({ contentSide: 'bottom' as const, contentAlign: 'start' as const, avoidCollisions: false } as const) : undefined;
  const floatingModelMenuProps =
    menuPlacement === 'assistant-floating' ? ({ menuSide: 'bottom' as const, menuAlign: 'start' as const, subMenuSide: 'right' as const, avoidCollisions: false } as const) : undefined;

  useEffect(() => {
    if (!skillPickerEnabled) {
      const timer = window.setTimeout(() => {
        setSkills([]);
        setSkillsLoading(false);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let cancelled = false;
    const loadingTimer = window.setTimeout(() => {
      if (!cancelled) {
        setSkillsLoading(true);
      }
    }, 0);

    window.YUA.ai
      .listSkills({
        agentId,
        ...(codingWorkspaceRoot ? { workspaceRoot: codingWorkspaceRoot } : {})
      })
      .then((rows) => {
        if (!cancelled) {
          setSkills(rows || []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSkills([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSkillsLoading(false);
        }
      });

    return () => {
      cancelled = true;
      window.clearTimeout(loadingTimer);
    };
  }, [agentId, codingWorkspaceRoot, skillPickerEnabled]);

  useEffect(() => {
    if (!slashMenuActive) {
      const timer = window.setTimeout(() => setHighlightedSkillIndex(0), 0);
      return () => window.clearTimeout(timer);
    }

    const timer = window.setTimeout(() => {
      setHighlightedSkillIndex((currentIndex) => Math.min(currentIndex, Math.max(slashSuggestions.length - 1, 0)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [slashMenuActive, slashSuggestions]);

  const handlePickWorkspace = async (): Promise<void> => {
    const workspace = await pickCodingWorkspace(codingWorkspaceRoot);
    if (!workspace) {
      return;
    }

    setCodingWorkspace(workspace);
  };

  const handleSend = async (content: string): Promise<void> => {
    if (!providerId || !modelId) return;

    if (isCoder && !codingWorkspaceRoot) {
      toast.error('代码助手需要先选择项目目录');
      return;
    }

    await onStart?.({
      content,
      providerId,
      modelId,
      preferredPresetId: presetId || undefined,
      agentId,
      webSearchEnabled,
      characterPersonaEnabled,
      emojiPacksEnabled,
      emojiPacksDisplayTarget,
      ...(isCoder && codingWorkspaceRoot
        ? {
            codingWorkspaceRoot,
            codingWorkspaceLabel: codingWorkspaceLabel || undefined
          }
        : {})
    });
  };

  const handleTranscriptFinal = useCallback((text: string): void => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.setValue(mergeTranscriptWithInput(input.getValue(), text));
    input.focus();
  }, []);

  const speechInput = useSpeechInput({
    onTranscriptFinal: handleTranscriptFinal
  });

  return (
    <UnifiedChatInput
      ref={inputRef}
      {...rest}
      disabled={disabled}
      value={draft}
      onChange={setDraft}
      onSend={handleSend}
      onKeyDown={(event, value) => {
        if (!skillPickerEnabled) {
          return;
        }

        if (slashMenuActive && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
          event.preventDefault();
          setHighlightedSkillIndex((currentIndex) => {
            if (event.key === 'ArrowDown') {
              return currentIndex >= slashSuggestions.length - 1 ? 0 : currentIndex + 1;
            }
            return currentIndex <= 0 ? slashSuggestions.length - 1 : currentIndex - 1;
          });
          return;
        }

        if (slashMenuActive && event.key === 'Enter' && highlightedSkillInfo) {
          event.preventDefault();
          setDraft(applySkillPickerSelection(value, highlightedSkillInfo.name));
          window.setTimeout(() => {
            inputRef.current?.focus();
          }, 0);
          return;
        }

        if (event.key === 'Tab' && !event.shiftKey && suggestedSkillInfo) {
          event.preventDefault();
          setDraft(applySkillPickerSelection(value, suggestedSkillInfo.name));
          window.setTimeout(() => {
            inputRef.current?.focus();
          }, 0);
        }
      }}
      showSaveButton={false}
      footerLeft={
        <div className="flex items-center gap-1 shrink-0 no-drag">
          <ChatAgentSelect agents={agents} value={agentId} onValueChange={setAgentId} onOpenChange={onMenuOpenChange} onOpenPrepare={onMenuOpenPrepare} {...floatingMenuProps} />
          <ProviderModelSelect
            providerId={providerId}
            presetId={presetId || undefined}
            modelId={modelId || undefined}
            onChange={(pid, nextModelId) => {
              setProviderId(pid);
              setModelId(nextModelId);
            }}
            buttonVariant="ghost"
            buttonSize="sm"
            placeholder="选择模型"
            autoLoadFirst
            modelTypes={['chat']}
            onOpenChange={onMenuOpenChange}
            onOpenPrepare={onMenuOpenPrepare}
            {...floatingModelMenuProps}
          />
          <SkillPickerButton
            agentId={agentId}
            highlightedSkillName={highlightedSkillInfo?.name}
            loading={skillsLoading}
            onHighlightSkill={(skillName) => {
              const nextIndex = slashSuggestions.findIndex((skill) => skill.name === skillName);
              if (nextIndex >= 0) {
                setHighlightedSkillIndex(nextIndex);
              }
            }}
            skills={skills}
            suggestions={slashSuggestions}
            value={draft}
            onOpenChange={onMenuOpenChange}
            {...floatingMenuProps}
            onSelect={(nextValue) => {
              setDraft(nextValue);
              window.setTimeout(() => {
                inputRef.current?.focus();
              }, 0);
            }}
          />
          {activeSkillInfo && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden max-w-[260px] items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground md:flex">
                  <Badge variant="secondary" className="shrink-0 rounded-full px-1.5 py-0 text-[10px]">
                    Skill
                  </Badge>
                  {activeSkillTrust && (
                    <Badge variant="outline" className={`shrink-0 rounded-full px-1.5 py-0 text-[10px] ${activeSkillTrust.badgeClassName}`}>
                      {activeSkillTrust.badgeLabel}
                    </Badge>
                  )}
                  <span className="truncate">/{activeSkillInfo.name}</span>
                  <span className="truncate text-muted-foreground/80">{activeSkillInfo.argumentHint || activeSkillInfo.description}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent align="start" className="max-w-sm">
                <p className="font-medium">{activeSkillInfo.name}</p>
                <p>{activeSkillInfo.description}</p>
                {activeSkillInfo.whenToUse && <p className="mt-1 text-xs text-muted-foreground">{activeSkillInfo.whenToUse}</p>}
                {activeSkillInfo.argumentHint && <p className="mt-1 text-xs text-muted-foreground">参数提示: {activeSkillInfo.argumentHint}</p>}
                {(activeSkillInfo.sourceLabel || activeSkillInfo.sourceDetail) && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    来源: {activeSkillInfo.sourceLabel || activeSkillInfo.source}
                    {activeSkillInfo.sourceDetail ? ` · ${activeSkillInfo.sourceDetail}` : ''}
                  </p>
                )}
                {activeSkillTrust?.note && <p className="mt-1 text-xs text-muted-foreground">{activeSkillTrust.note}</p>}
              </TooltipContent>
            </Tooltip>
          )}
          {activeSkillInfo && !activeSkillArgs && activeSkillInfo.argumentHint && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="hidden max-w-[320px] items-center gap-1 rounded-full border border-dashed px-2 py-1 text-xs text-muted-foreground lg:flex">
                  <span className="shrink-0">参数提示</span>
                  <span className="truncate">{activeSkillInfo.argumentHint}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground/70">Tab 可补全 skill</span>
                </div>
              </TooltipTrigger>
              <TooltipContent align="start">
                <p>继续在 skill 名后输入参数即可。</p>
              </TooltipContent>
            </Tooltip>
          )}
          <WebSearchToggle enabled={webSearchEnabled} onToggle={setWebSearchEnabled} onOpenChange={onMenuOpenChange} {...floatingMenuProps} />
          {!isCoder && (
            <EmojiPackButton
              displayTarget={emojiPacksDisplayTarget}
              enabled={emojiPacksEnabled}
              onDisplayTargetChange={setEmojiPacksDisplayTarget}
              onEnabledChange={setEmojiPacksEnabled}
              onOpenChange={onMenuOpenChange}
              {...floatingMenuProps}
            />
          )}
          {!isCoder && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={characterPersonaEnabled ? 'default' : 'ghost'}
                  size="icon"
                  className={`h-8 w-8 shrink-0 rounded-full ${characterPersonaEnabled ? 'bg-violet-600 hover:bg-violet-700 text-white' : ''}`}
                  onClick={() => setCharacterPersonaEnabled(!characterPersonaEnabled)}
                >
                  <TbRobot />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{characterPersonaEnabled ? '角色已注入' : '注入人格，好感度和心情会影响说话风格'}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {isCoder && (
            <CodingWorkspaceButton
              workspaceRoot={codingWorkspaceRoot}
              workspaceLabel={codingWorkspaceLabel}
              onPick={handlePickWorkspace}
              onClear={() => setCodingWorkspace(null)}
              triggerVariant="outline"
              triggerSize="sm"
              triggerClassName="h-8 rounded-full text-xs"
              clearVariant="ghost"
              clearSize="icon"
              clearClassName="h-8 w-8 rounded-full"
            />
          )}
        </div>
      }
      footerRightExtra={
        <ChatFooterActions
          speechInput={{
            disabled,
            interimText: speechInput.interimText,
            isBusy: speechInput.isBusy,
            isListening: speechInput.isListening,
            onToggle: speechInput.toggle
          }}
        >
          {footerRightExtra}
        </ChatFooterActions>
      }
    />
  );
}
