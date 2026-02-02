import { Request, Response } from 'express';
import { fal } from '@fal-ai/client';

interface ImageRequestBody {
  prompt: string;
  aspect_ratio?: string;
  style?: string;
  reference_image_url?: string;
  model?: string;
}

export const generateImageFromPrompt = async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      aspect_ratio = '16:9',
      style = '',
      reference_image_url,
      model = 'xai/grok-imagine-image'
    } = req.body as ImageRequestBody;

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }

    // 스타일 프리픽스를 프롬프트에 합치기
    const noTextInstruction = "Do not include any text, letters, words, subtitles, watermarks, or typography in the image. The image should be purely visual.";
    const styledPrompt = `${noTextInstruction} ${style ? `${style}, ${prompt}` : prompt}`;

    console.log(`[IMG] Generating image, model=${model}, ref=${!!reference_image_url}, prompt="${styledPrompt.substring(0, 80)}..."`);

    let endpoint = model;
    let input: any = {
      prompt: styledPrompt,
      num_images: 1,
      aspect_ratio,
      output_format: 'jpeg',
    };

    // Google Gemini 3 Pro Specific Options
    if (model.includes('gemini')) {
      input.resolution = '2K'; // Optional: Use 2K for better quality
      // Gemini 3 Pro likely doesn't support 'image_url' in this specific text-to-image endpoint preview
    }

    // 참조 이미지가 있으면 처리
    if (reference_image_url) {
      if (model.includes('grok')) {
          endpoint = 'xai/grok-imagine-image/edit';
          // Grok Edit 모드에서 원본 구도 고착화 방지를 위한 강력한 프롬프트 지시어 추가
          const mutationInstruction = "Ignore original pose/background. CREATE A COMPLETELY NEW SCENE. Keep ONLY the face/identity. CHANGE action/angle/lighting/environment significantly.";
          
          input = {
            prompt: `${mutationInstruction} ${styledPrompt}`,
            image_url: reference_image_url,
            num_images: 1,
            output_format: 'jpeg'
          };
      } else {
          console.warn(`[IMG] Model ${model} does not support reference_image_url or logic is not implemented. Using Text-to-Image.`);
          // For other models, we ignore reference_image_url and just use the strong text prompt
      }
    }

    const result = await fal.subscribe(endpoint, {
      input,
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
