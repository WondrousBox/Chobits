import type { WorkflowIdFactory } from '../ports/control.js';

export class FakeWorkflowIdFactory implements WorkflowIdFactory {
  private index = 0;

  constructor(
    private readonly ids: readonly string[] = [],
    private readonly prefix = 'run'
  ) {}

  createRunId(): string {
    const id = this.ids[this.index] || `${this.prefix}-${this.index + 1}`;
    this.index += 1;
    return id;
  }
}
