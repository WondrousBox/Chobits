import type { AgentSession } from '@earendil-works/pi-coding-agent';

export function installSameTurnDynamicToolActivation(session: AgentSession): void {
  const agent = (session as any).agent;
  if (!agent?.state) return;

  const setActiveToolsByName = session.setActiveToolsByName.bind(session);
  const prepareNextTurn = typeof agent.prepareNextTurn === 'function' ? agent.prepareNextTurn.bind(agent) : undefined;
  let activationRevision = 0;
  let preparedRevision = 0;

  session.setActiveToolsByName = (names: string[]) => {
    const previousNames = session.getActiveToolNames();
    setActiveToolsByName(names);
    const nextNames = session.getActiveToolNames();

    if (previousNames.length !== nextNames.length || previousNames.some((name, index) => name !== nextNames[index])) {
      activationRevision += 1;
    }
  };

  agent.prepareNextTurn = async (signal?: AbortSignal) => {
    const update = await prepareNextTurn?.(signal);
    if (preparedRevision === activationRevision) return update;

    preparedRevision = activationRevision;
    const updatedContext = update?.context;
    return {
      ...update,
      context: {
        messages: updatedContext?.messages ?? agent.state.messages.slice(),
        systemPrompt: updatedContext?.systemPrompt ?? agent.state.systemPrompt,
        tools: agent.state.tools.slice()
      }
    };
  };
}
