import { fal } from '@fal-ai/client';
import type { VideoProvider, VideoGenerationRequest, VideoGenerationResult } from './VideoProvider.js';

/**
 * fal.ai Kling v1.6 Pro Provider
 * Image-to-Video 변환을 위한 Provider 구현
 */
export class FalKlingProvider implements VideoProvider {
  readonly name = 'kling-v1.6-pro';
  readonly modelId = 'fal-ai/kling-video/v1.6/pro/image-to-video';
  readonly supportedDurations = ['5', '10'];
  readonly supportedAspectRatios = ['16:9', '9:16', '1:1'];

  /**
   * 영상 생성 요청 제출
   */
  async submitGeneration(request: VideoGenerationRequest): Promise<{ requestId: string }> {
    const result = await fal.queue.submit(this.modelId, {
      input: {
        image_url: request.imageUrl,
        prompt: this.buildPrompt(request),
        duration: request.duration || '5',
        aspect_ratio: request.aspectRatio || '16:9',
        negative_prompt: request.negativePrompt || 'blur, distort, low quality, watermark',
        cfg_scale: 0.5
      }
    });

    return { requestId: result.request_id };
  }

  /**
   * 상태 확인
   */
  async checkStatus(requestId: string): Promise<VideoGenerationResult> {
    const status = await fal.queue.status(this.modelId, {
      requestId,
      logs: false
    });

    return {
      requestId,
      status: this.mapStatus(status.status),
      progress: this.calculateProgress(status)
    };
  }

  /**
   * 결과 가져오기
   */
  async getResult(requestId: string): Promise<VideoGenerationResult> {
    try {
      const result = await fal.queue.result(this.modelId, { requestId }) as any;

      // 디버깅: 응답 구조 확인
      console.log('Kling Pro result structure:', JSON.stringify(result, null, 2));

      // 여러 가능한 경로에서 video URL 찾기
      const videoUrl = result.video?.url
        || result.data?.video?.url
        || result.output?.video?.url
        || result.data?.url
        || result.url;

      if (!videoUrl) {
        console.error('No video URL found in result:', result);
      }

      return {
        requestId,
        status: 'completed',
        videoUrl
      };
    } catch (error) {
      console.error('getResult error:', error);
      return {
        requestId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 모션 타입을 프롬프트에 반영
   */
  private buildPrompt(request: VideoGenerationRequest): string {
    let prompt = request.prompt;

    if (request.motionType && request.motionType !== 'auto') {
      const motionMap: Record<string, string> = {
        'zoom_in': 'Camera slowly zooms in',
        'zoom_out': 'Camera gradually zooms out',
        'pan_left': 'Camera pans smoothly from right to left',
        'pan_right': 'Camera pans smoothly from left to right',
        'static': 'Static camera with subtle ambient movement',
        'Cinematic Slow Motion': 'Cinematic slow motion with smooth camera movement'
      };

      const motionInstruction = motionMap[request.motionType];
      if (motionInstruction) {
        prompt = `${motionInstruction}. ${prompt}`;
      }
    }

    return prompt;
  }

  /**
   * fal.ai 상태를 내부 상태로 매핑
   */
  private mapStatus(falStatus: string): VideoGenerationResult['status'] {
    switch (falStatus) {
      case 'IN_QUEUE':
        return 'pending';
      case 'IN_PROGRESS':
        return 'processing';
      case 'COMPLETED':
        return 'completed';
      default:
        return 'failed';
    }
  }

  /**
   * 진행률 계산
   */
  private calculateProgress(status: any): number {
    if (status.status === 'COMPLETED') return 100;
    if (status.status === 'IN_QUEUE') {
      // queue position 기반 추정
      const position = status.queue_position || 0;
      return Math.max(5, 30 - position * 5);
    }
    if (status.status === 'IN_PROGRESS') {
      return 60; // 진행 중일 때 대략적인 값
    }
    return 0;
  }
}
