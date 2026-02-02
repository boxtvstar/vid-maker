import { fal } from '@fal-ai/client';
import type { VideoProvider, VideoGenerationRequest, VideoGenerationResult } from './VideoProvider.js';

/**
 * fal.ai xAI Grok Imagine Video Provider
 * Image-to-Video 변환을 위한 Provider 구현
 * Model ID: xai/grok-imagine-video/image-to-video
 */
export class FalGrokVideoProvider implements VideoProvider {
  readonly name = 'grok-imagine-video';
  readonly modelId = 'xai/grok-imagine-video/image-to-video';
  readonly supportedDurations = ['5', '9']; // API supports integer duration, default 6. Let's map 5->5, 10->9 (max) or just pass integer.
  readonly supportedAspectRatios = ['16:9', '9:16', '1:1', '4:3', '3:4'];

  /**
   * 영상 생성 요청 제출
   */
  async submitGeneration(request: VideoGenerationRequest): Promise<{ requestId: string }> {
    // duration mapping: App uses '5' or '10'.
    // Grok uses integer seconds.
    const durationInt = request.duration === '10' ? 9 : 5; // Use 5 for short, 9 for long (if max is 9? Docs don't say explicitly but 5-10 is common range. Default is 6)
    
    // aspect_ratio can be 'auto' or specific.
    const aspectRatio = request.aspectRatio || '16:9';

    const result = await fal.queue.submit(this.modelId, {
      input: {
        image_url: request.imageUrl,
        prompt: this.buildPrompt(request),
        duration: durationInt,
        aspect_ratio: aspectRatio,
        resolution: "720p" 
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
      // Grok output schema: { video: { url: ... } }
      const result = await fal.queue.result(this.modelId, { requestId }) as any;

      console.log('Grok Video result structure:', JSON.stringify(result, null, 2));

      const videoUrl = result.video?.url || result.data?.video?.url;

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
        'zoom_in': 'Camera zooms in',
        'zoom_out': 'Camera zooms out',
        'pan_left': 'Camera pans left',
        'pan_right': 'Camera pans right',
        'static': 'Static camera, minimal movement',
        'Cinematic Slow Motion': 'Cinematic slow motion'
      };

      const motionInstruction = motionMap[request.motionType];
      if (motionInstruction) {
        prompt = `${motionInstruction}. ${prompt}`;
      }
    }
    
    // Add prompt template logic if needed, but for now simple concatenation
    if (request.promptTemplate) {
        // e.g. "{motion}. {prompt}"
        // We already handled motion via buildPrompt, but if the template is complex we might need to revisit.
        // For now, assume the user wants the motion instruction integrated.
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
      const position = status.queue_position || 0;
      return Math.max(5, 30 - position * 5);
    }
    if (status.status === 'IN_PROGRESS') {
      return 50; 
    }
    return 0;
  }
}
