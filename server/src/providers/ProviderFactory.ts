import type { VideoProvider } from './VideoProvider.js';
import { FalKlingProvider } from './FalKlingProvider.js';
import { FalKlingStandardProvider } from './FalKlingStandardProvider.js';

export type ProviderType = 'kling' | 'kling-standard' | 'veo' | 'sora';

/**
 * Provider Factory
 * 싱글톤 패턴으로 Provider 인스턴스 관리
 */
export class ProviderFactory {
  private static providers: Map<ProviderType, VideoProvider> = new Map();

  /**
   * Provider 인스턴스 가져오기
   */
  static getProvider(type: ProviderType = 'kling'): VideoProvider {
    if (!this.providers.has(type)) {
      switch (type) {
        case 'kling':
          this.providers.set(type, new FalKlingProvider());
          break;
        case 'kling-standard':
          this.providers.set(type, new FalKlingStandardProvider());
          break;
        // 향후 추가
        // case 'veo':
        //   this.providers.set(type, new FalVeoProvider());
        //   break;
        // case 'sora':
        //   this.providers.set(type, new SoraProvider());
        //   break;
        default:
          throw new Error(`Unknown provider: ${type}`);
      }
    }
    return this.providers.get(type)!;
  }

  /**
   * 지원하는 Provider 목록
   */
  static getSupportedProviders(): ProviderType[] {
    return ['kling', 'kling-standard']; // 향후 veo, sora 추가 예정
  }
}
