/**
 * Sprite Speak Types
 *
 * 绮剧伒鍏ㄥ眬璇煶鍚堟垚鐨勭被鍨嬪畾涔?
 */

// ============================================================================
// 璇煶鍚堟垚閰嶇疆
// ============================================================================

/**
 * TTS 鏈嶅姟鎻愪緵鍟嗙被鍨?
 * - Edge: 寰蒋 Edge TTS锛堝唴缃厤璐癸級
 * - 鏈潵鎵╁睍: OpenAI, Azure, Volc 绛?
 */
export type SpeakServiceType = 'Edge' | string;

/**
 * 绮剧伒璇煶鍚堟垚閰嶇疆
 * 鐢ㄦ埛鍙渶閰嶇疆涓€娆★紝鍚庣画鎵€鏈夌簿鐏佃璇濋兘浣跨敤姝ら厤缃?
 */
export interface SpriteSpeakConfig {
  /** 鏄惁鍚敤璇煶鍚堟垚 */
  enabled: boolean;
  /** TTS 鏈嶅姟绫诲瀷 */
  serviceType: SpeakServiceType;
  /** 璇煶鍚嶇О锛堝 zh-CN-XiaoxiaoNeural锛?*/
  voiceName: string;
  /** 璇€熺櫨鍒嗘瘮锛?100 鍒?200锛岄粯璁?20锛?*/
  rate: number;
  /** 闊抽珮鐧惧垎姣旓紙-100 鍒?200锛岄粯璁?0锛?*/
  pitch: number;
  /** 闊抽噺 0-1锛岄粯璁?1 */
  volume: number;
}

/**
 * 榛樿绮剧伒璇煶鍚堟垚閰嶇疆
 */
export const DEFAULT_SPEAK_CONFIG: SpriteSpeakConfig = {
  enabled: true,
  serviceType: 'Edge',
  voiceName: 'zh-CN-XiaoxiaoNeural',
  rate: 20,
  pitch: 0,
  volume: 1
};

// ============================================================================
// 璇煶缂撳瓨
// ============================================================================

/**
 * 璇煶缂撳瓨鏉＄洰
 */
export interface SpeakCacheEntry {
  /** 缂撳瓨 ID (MD5 hash of config + text) */
  cacheId: string;
  /** 鍚堟垚鐨勬枃鏈?*/
  text: string;
  /** 鍚堟垚鏃朵娇鐢ㄧ殑閰嶇疆蹇収 */
  config: {
    serviceType: SpeakServiceType;
    voiceName: string;
    rate: number;
    pitch: number;
  };
  /** 闊抽鏂囦欢鍚?*/
  fileName: string;
  /** 闊抽鏃堕暱锛堟绉掞紝鍙€夛級 */
  durationMs?: number;
  /** 鍒涘缓鏃堕棿鎴?*/
  createdAt: number;
  /** 鏈€鍚庝娇鐢ㄦ椂闂存埑 */
  lastUsedAt: number;
}

/**
 * 璇煶缂撳瓨绱㈠紩
 */
export interface SpeakCacheIndex {
  /** 鐗堟湰鍙?*/
  version: number;
  /** 缂撳瓨鏉＄洰鏄犲皠 (cacheId -> entry) */
  entries: Record<string, SpeakCacheEntry>;
}

// ============================================================================
// IPC 閫氫俊
// ============================================================================

/**
 * sprite:speak 浜嬩欢鐨?payload
 * 涓昏繘绋?鈫?娓叉煋杩涚▼锛氬憡璇夋覆鏌撹繘绋嬫挱鏀惧悎鎴愮殑闊抽
 */
export interface SpriteSpeakPayload {
  /** 璇磋瘽鐨勬枃鏈?*/
  text: string;
  /** 鍚堟垚鐨勯煶棰戞枃浠剁粷瀵硅矾寰?*/
  audioPath: string;
  /** 缂撳瓨 ID */
  cacheId: string;
  /** 鎾斁闊抽噺 (0-1) */
  volume: number;
}

/**
 * speak 璇锋眰鍙傛暟
 */
export interface SpeakRequest {
  /** 瑕佽鐨勬枃鏈?*/
  text: string;
  /** 鏄惁鍚屾椂鏄剧ず鏂囧瓧姘旀场锛堥粯璁?true锛?*/
  showBubble?: boolean;
  /** 姘旀场鏄剧ず鏃堕暱锛坢s锛岄粯璁?auto 鍩轰簬鏂囧瓧闀垮害锛?*/
  bubbleDuration?: number;
}

/**
 * speak 缁撴灉
 */
export interface SpeakResult {
  /** 鏄惁鎴愬姛 */
  success: boolean;
  /** 缂撳瓨 ID */
  cacheId?: string;
  /** 闊抽鏂囦欢璺緞 */
  audioPath?: string;
  /** 鏄惁鏉ヨ嚜缂撳瓨 */
  fromCache?: boolean;
  /** 閿欒淇℃伅 */
  error?: string;
}
