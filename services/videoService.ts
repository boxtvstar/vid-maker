/**
 * Video Generation Service
 * 백엔드 API와 통신하여 영상 생성을 관리
 */

// 프록시 사용: VITE_API_URL이 설정되지 않으면 상대 경로 사용 (/api -> localhost:3001/api)
const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export type ProviderType = 'kling' | 'kling-standard' | 'veo' | 'sora';

export interface GenerateVideoRequest {
  imageData: string;        // base64 Data URL
  prompt: string;
  motionType?: string;
  duration?: '5' | '10';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  provider?: ProviderType;
}

export interface VideoStatus {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  progress?: number;
}

/**
 * 1. 생성 요청 제출
 */
export async function submitVideoGeneration(request: GenerateVideoRequest): Promise<{ requestId: string; provider: string }> {
  const response = await fetch(`${API_BASE_URL}/api/video/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || 'Video generation failed');
  }

  return response.json();
}

/**
 * 2. 상태 폴링
 */
export async function pollVideoStatus(
  requestId: string,
  provider: ProviderType = 'kling'
): Promise<VideoStatus> {
  const response = await fetch(
    `${API_BASE_URL}/api/video/status/${requestId}?provider=${provider}`
  );

  if (!response.ok) {
    throw new Error('Failed to check status');
  }

  return response.json();
}

/**
 * 3. 결과 가져오기
 */
export async function getVideoResult(
  requestId: string,
  provider: ProviderType = 'kling'
): Promise<VideoStatus> {
  const response = await fetch(
    `${API_BASE_URL}/api/video/result/${requestId}?provider=${provider}`
  );

  if (!response.ok) {
    throw new Error('Failed to get result');
  }

  return response.json();
}

/**
 * 4. 완료까지 대기하는 헬퍼 함수 (폴링 방식)
 */
export async function generateVideoWithPolling(
  request: GenerateVideoRequest,
  onProgress?: (progress: number, status: string) => void
): Promise<string> {
  // 생성 요청
  const { requestId, provider } = await submitVideoGeneration(request);

  // 폴링으로 완료 대기
  const pollInterval = 3000; // 3초
  const maxAttempts = 120;   // 최대 6분

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    const status = await pollVideoStatus(requestId, request.provider || 'kling');

    if (onProgress) {
      const displayProgress = status.progress || Math.min(10 + attempt * 2, 90);
      const displayStatus = status.status === 'processing' ? '생성 중' : '대기 중';
      onProgress(displayProgress, displayStatus);
    }

    if (status.status === 'completed') {
      const result = await getVideoResult(requestId, request.provider || 'kling');
      if (result.videoUrl) {
        return result.videoUrl;
      }
      throw new Error('No video URL in result');
    }

    if (status.status === 'failed') {
      throw new Error(status.error || 'Video generation failed');
    }
  }

  throw new Error('Video generation timed out');
}

/**
 * 5. 폴백 포함 생성 함수
 */
export async function generateVideoWithFallback(
  request: GenerateVideoRequest,
  onProgress?: (progress: number, status: string) => void
): Promise<string | null> {
  try {
    return await generateVideoWithPolling(request, onProgress);
  } catch (error) {
    console.warn('Video generation failed:', error);
    // 실패 시 null 반환 (CSS 애니메이션 폴백 사용)
    return null;
  }
}
