import { type NodeConfig, type NodeHandler, type PortSchema } from '../types.js';

export const ConditionNode: NodeHandler = {
  spec: {
    id: 'logic/condition',
    label: '判断',
    category: 'Logic',
    description: '根据条件判断输入值，并输出到不同的端口',
    icon: 'TbGitBranch',
    inputs: [], // Dynamic
    outputs: [], // Dynamic
    config: [
      {
        key: 'inputs',
        label: '输入端口',
        type: 'array',
        inputType: 'port-list',
        default: [{ key: 'input', label: '默认输入' }],
        description: '定义需要判断的输入变量'
      },
      {
        key: 'conditions',
        label: '条件列表',
        type: 'array',
        inputType: 'condition-list',
        default: [],
        description: '定义判断条件和对应的输出'
      }
    ],
    hasDynamicInputs: true,
    hasDynamicOutputs: true
  },
  getInputs(config?: NodeConfig): PortSchema[] {
    const inputs = config?.inputs || [{ key: 'input', label: '默认输入' }];
    return inputs.map((p: any) => ({
      key: p.key,
      label: p.label,
      type: 'any',
      required: true
    }));
  },
  getOutputs(config?: NodeConfig): PortSchema[] {
    const conditions = config?.conditions || [];
    const outputs: PortSchema[] = [];

    if (Array.isArray(conditions)) {
      conditions.forEach((cond: any, index: number) => {
        if (cond.id) {
          outputs.push({
            key: cond.id,
            label: cond.name || `分支 ${index + 1}`,
            type: 'any'
          });
        }
      });
    }

    // Always add 'else' branch
    outputs.push({
      key: 'else',
      label: '否则',
      type: 'any'
    });

    return outputs;
  },
  async run({ input, config }) {
    const conditions = config?.conditions || [];
    const inputs = config?.inputs || [{ key: 'input', label: '默认输入' }];

    if (Array.isArray(conditions)) {
      for (const cond of conditions) {
        // Determine which input to use
        const targetInputKey = cond.targetInput || inputs[0]?.key || 'input';
        const value = input[targetInputKey];

        if (evaluate(value, cond)) {
          return { [cond.id]: value };
        }
      }
    }

    // If no condition met, return value from the first input (or default) to 'else'
    const defaultInputKey = inputs[0]?.key || 'input';
    return { else: input[defaultInputKey] };
  }
};

function evaluate(value: any, condition: any): boolean {
  const { operator, value: targetValue } = condition;

  // Handle empty/not_empty without targetValue
  if (operator === 'empty') {
    return value === null || value === undefined || value === '';
  }
  if (operator === 'not_empty') {
    return value !== null && value !== undefined && value !== '';
  }

  const strValue = String(value);
  const strTarget = String(targetValue);

  switch (operator) {
    case 'eq':
      return strValue === strTarget;
    case 'neq':
      return strValue !== strTarget;
    case 'contains':
      return strValue.includes(strTarget);
    case 'not_contains':
      return !strValue.includes(strTarget);
    case 'starts_with':
      return strValue.startsWith(strTarget);
    case 'ends_with':
      return strValue.endsWith(strTarget);
    case 'gt':
      return Number(value) > Number(targetValue);
    case 'lt':
      return Number(value) < Number(targetValue);
    case 'gte':
      return Number(value) >= Number(targetValue);
    case 'lte':
      return Number(value) <= Number(targetValue);
    case 'regex':
      try {
        return new RegExp(targetValue).test(strValue);
      } catch {
        return false;
      }
    default:
      return false;
  }
}
