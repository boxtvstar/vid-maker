import { Request, Response } from 'express';
import { fal } from '@fal-ai/client';

interface ImageRequestBody {
  prompt: string;
  aspect_ratio?: string;
  style?: string;
}

export const generateImageFromPrompt = async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      aspect_ratio = '16:9',
      style = '',
    } = req.body as ImageRequestBody;

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }

    // 스타일 프리픽스를 프롬프트에 합치기
    const styledPrompt = style ? `${style}, ${prompt}` : prompt;

    console.log(`[IMG] Generating image (grok-imagine), prompt="${styledPrompt.substring(0, 80)}...", ratio=${aspect_ratio}`);

    const result = await fal.subscribe('xai/grok-imagine-image', {
      input: {
        prompt: styledPrompt,
        num_images: 1,
        aspect_ratio,
        output_format: 'jpeg',
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          update.logs?.map((log) => log.message).forEach((msg) => console.log(`[IMG] ${msg}`));
        }
      },
    }) as any;

    const imageUrl = result?.data?.images?.[0]?.url;

    if (!imageUrl) {
      console.error('[IMG] No image URL in result:', JSON.stringify(result?.data).substring(0, 300));
      res.status(500).json({ success: false, error: 'No image returned' });
      return;
    }

    console.log(`[IMG] Success: ${imageUrl.substring(0, 60)}...`);

    res.json({
      success: true,
      imageUrl,
      revisedPrompt: result?.data?.revised_prompt || null,
    });
  } catch (error: any) {
    console.error('[IMG] Generation failed:', error?.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Image generation failed',
    });
  }
};
