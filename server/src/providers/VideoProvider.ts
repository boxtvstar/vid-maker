/**
 * 영상 생성 요청 인터페이스
 */
export interface VideoGenerationRequest {
  imageUrl: string;           // 이미지 URL (fal storage URL)
  prompt: string;             // 동작 설명 프롬프트
  duration?: '5' | '10';      // 영상 길이 (초)
  aspectRatio?: '16:9' | '9:16' | '1:1';
  motionType?: string;        // 모션 타입 힌트
  negativePrompt?: string;    // 제외할 요소
}

/**
 * 영상 생성 결과 인터페이스
 */
export interface VideoGenerationResult {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string;
  error?: string;
  progress?: number;          // 0-100
}

/**
 * VideoProvider 인터페이스
 * 향후 Veo, Sora 등 다른 Provider 추가를 위한 추상화
 */
export interface VideoProvider {
  readonly name: string;
  readonly supportedDurations: string[];
  readonly supportedAspectRatios: string[];

  /**
   * 비동기 생성 요청 제출 (queue submit)
   */
  submitGeneration(request: VideoGenerationRequest): Promise<{ requestId: string }>;

  /**
   * 상태 확인
   */
  checkStatus(requestId: string): Promise<VideoGenerationResult>;

  /**
   * 결과 가져오기
   */
  getResult(requestId: string): Promise<VideoGenerationResult>;
}
