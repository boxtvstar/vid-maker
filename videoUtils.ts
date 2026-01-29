/**
 * @deprecated 이 파일은 더 이상 사용되지 않습니다.
 * 대신 services/videoService.ts를 사용하세요.
 *
 * 하위 호환성을 위해 래퍼 함수로 유지합니다.
 */

import { generateVideoWithPolling } from './services/videoService';

interface VideoGenerationOptions {
  prompt: string;
  imageBase64: string;
  motionType: string;
  duration?: number;
  apiKey?: string; // 더 이상 사용 안함 (서버에서 관리)
}

/**
 * @deprecated generateVideoWithPolling을 직접 사용하세요.
 */
export async function generateVideoClip(options: VideoGenerationOptions): Promise<string> {
  console.warn('generateVideoClip is deprecated. Use generateVideoWithPolling from services/videoService instead.');

  return generateVideoWithPolling({
    imageData: options.imageBase64,
    prompt: options.prompt,
    motionType: options.motionType,
    duration: '5'
  });
}
