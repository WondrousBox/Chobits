export type IPCParams<T = void, R = unknown> = {
  /**
   * 输入
   *
   * @type {T}
   */
  request: T;
  /**
   * 输出
   *
   * @type {R}
   */
  response: R;
};