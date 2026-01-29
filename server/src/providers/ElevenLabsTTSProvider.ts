import { fal } from '@fal-ai/client';

export interface TTSRequest {
  text: string;
  voice?: string;
  stability?: number;
  similarityBoost?: number;
  speed?: number;
}

export interface TTSResult {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  audioUrl?: string;
  error?: string;
}

// ElevenLabs 지원 음성 목록
export const ELEVENLABS_VOICES = [
  { id: 'Rachel', name: 'Rachel', description: '여성, 차분하고 전문적인 목소리', gender: 'female' },
  { id: 'Aria', name: 'Aria', description: '여성, 밝고 친근한 목소리', gender: 'female' },
  { id: 'Sarah', name: 'Sarah', description: '여성, 부드럽고 따뜻한 목소리', gender: 'female' },
  { id: 'Laura', name: 'Laura', description: '여성, 자연스럽고 편안한 목소리', gender: 'female' },
  { id: 'Domi', name: 'Domi', description: '여성, 젊고 활기찬 목소리', gender: 'female' },
  { id: 'Adam', name: 'Adam', description: '남성, 깊고 전문적인 목소리', gender: 'male' },
  { id: 'Antoni', name: 'Antoni', description: '남성, 따뜻하고 친근한 목소리', gender: 'male' },
  { id: 'Josh', name: 'Josh', description: '남성, 젊고 역동적인 목소리', gender: 'male' },
  { id: 'Arnold', name: 'Arnold', description: '남성, 깊고 무게감 있는 목소리', gender: 'male' },
  { id: 'Sam', name: 'Sam', description: '남성, 차분하고 안정적인 목소리', gender: 'male' },
] as const;

export type VoiceId = typeof ELEVENLABS_VOICES[number]['id'];

/**
 * ElevenLabs TTS Provider (via fal.ai)
 * 텍스트를 음성으로 변환
 */
export class ElevenLabsTTSProvider {
  readonly name = 'elevenlabs-turbo-v2.5';
  readonly modelId = 'fal-ai/elevenlabs/tts/turbo-v2.5';

  /**
   * TTS 생성 요청 (동기 방식 - 빠른 응답)
   */
  async generate(request: TTSRequest): Promise<TTSResult> {
    try {
      const result = await fal.subscribe(this.modelId, {
        input: {
          text: request.text,
          voice: request.voice || 'Rachel',
          stability: request.stability ?? 0.5,
          similarity_boost: request.similarityBoost ?? 0.75,
          speed: request.speed ?? 1.0,
          apply_text_normalization: 'auto'
        },
        logs: true
      }) as any;

      console.log('ElevenLabs TTS result:', JSON.stringify(result, null, 2));

      const audioUrl = result.data?.audio?.url || result.audio?.url;

      if (!audioUrl) {
        console.error('No audio URL in result:', result);
        return {
          requestId: result.requestId || 'unknown',
          status: 'failed',
          error: 'No audio URL in result'
        };
      }

      return {
        requestId: result.requestId || 'sync',
        status: 'completed',
        audioUrl
      };
    } catch (error) {
      console.error('TTS generation error:', error);
      return {
        requestId: 'error',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * TTS 생성 요청 (비동기 큐 방식)
   */
  async submitGeneration(request: TTSRequest): Promise<{ requestId: string }> {
    const result = await fal.queue.submit(this.modelId, {
      input: {
        text: request.text,
        voice: request.voice || 'Rachel',
        stability: request.stability ?? 0.5,
        similarity_boost: request.similarityBoost ?? 0.75,
        speed: request.speed ?? 1.0,
        apply_text_normalization: 'auto'
      }
    });

    return { requestId: result.request_id };
  }

  /**
   * 상태 확인
   */
  async checkStatus(requestId: string): Promise<TTSResult> {
    const status = await fal.queue.status(this.modelId, {
      requestId,
      logs: false
    });

    return {
      requestId,
      status: this.mapStatus(status.status)
    };
  }

  /**
   * 결과 가져오기
   */
  async getResult(requestId: string): Promise<TTSResult> {
    try {
      const result = await fal.queue.result(this.modelId, { requestId }) as any;

      console.log('ElevenLabs TTS queue result:', JSON.stringify(result, null, 2));

      const audioUrl = result.data?.audio?.url || result.audio?.url;

      return {
        requestId,
        status: 'completed',
        audioUrl
      };
    } catch (error) {
      return {
        requestId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 지원 음성 목록
   */
  getSupportedVoices() {
    return ELEVENLABS_VOICES;
  }

  private mapStatus(falStatus: string): TTSResult['status'] {
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
}

// 싱글톤 인스턴스
export const elevenLabsTTS = new ElevenLabsTTSProvider();
