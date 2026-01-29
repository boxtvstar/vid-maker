import type { Request, Response, NextFunction } from 'express';
import { ProviderFactory, type ProviderType } from '../providers/ProviderFactory.js';
import { uploadBase64Image } from '../utils/imageUploader.js';

interface GenerateRequestBody {
  imageData: string;        // base64 또는 URL
  prompt: string;
  motionType?: string;
  duration?: '5' | '10';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  provider?: ProviderType;
}

/**
 * 비동기 생성 요청 제출
 * POST /api/video/generate
 */
export async function submitVideoGeneration(
  req: Request<{}, {}, GenerateRequestBody>,
  res: Response,
  next: NextFunction
) {
  try {
    const { imageData, prompt, motionType, duration, aspectRatio, provider = 'kling' } = req.body;

    // 입력 검증
    if (!imageData) {
      return res.status(400).json({ error: 'imageData is required' });
    }
    if (!prompt) {
      return res.status(400).json({ error: 'prompt is required' });
    }

    // Base64 이미지를 URL로 변환 (fal.ai는 URL 필요)
    let imageUrl = imageData;
    if (imageData.startsWith('data:')) {
      console.log('Converting base64 image to URL...');
      imageUrl = await uploadBase64Image(imageData);
      console.log('Image uploaded:', imageUrl);
    }

    // Provider 선택 및 생성 요청
    const videoProvider = ProviderFactory.getProvider(provider);
    const result = await videoProvider.submitGeneration({
      imageUrl,
      prompt,
      motionType,
      duration,
      aspectRatio
    });

    console.log(`Video generation submitted: ${result.requestId}`);

    res.json({
      success: true,
      requestId: result.requestId,
      provider: videoProvider.name
    });

  } catch (error) {
    next(error);
  }
}

/**
 * 상태 확인
 * GET /api/video/status/:requestId
 */
export async function getVideoStatus(
  req: Request<{ requestId: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { requestId } = req.params;
    const provider = (req.query.provider as ProviderType) || 'kling';

    const videoProvider = ProviderFactory.getProvider(provider);
    const status = await videoProvider.checkStatus(requestId);

    res.json(status);

  } catch (error) {
    next(error);
  }
}

/**
 * 결과 가져오기
 * GET /api/video/result/:requestId
 */
export async function getVideoResult(
  req: Request<{ requestId: string }>,
  res: Response,
  next: NextFunction
) {
  try {
    const { requestId } = req.params;
    const provider = (req.query.provider as ProviderType) || 'kling';

    const videoProvider = ProviderFactory.getProvider(provider);
    const result = await videoProvider.getResult(requestId);

    res.json(result);

  } catch (error) {
    next(error);
  }
}

/**
 * 지원 Provider 목록
 * GET /api/video/providers
 */
export function getSupportedProviders(req: Request, res: Response) {
  res.json({
    providers: ProviderFactory.getSupportedProviders(),
    default: 'kling'
  });
}
