export type IpcParams<T = void, R = unknown> = {
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

export type ResParams<T = void> = {
  success: boolean;
  data?: T;
  message?: string;
};

export type PartialByKey<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredByKey<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
