/**
 * Image Generation Service
 * fal.ai xai/grok-imagine-image를 통한 이미지 생성
 */

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export interface ImageRequest {
  prompt: string;
  aspect_ratio?: string;
  style?: string;
  reference_image_url?: string;
  model?: string;
}

export interface ImageResponse {
  success: boolean;
  imageUrl?: string;
  revisedPrompt?: string;
  error?: string;
}

export async function generateFalImage(request: ImageRequest): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/image/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Image generation failed (${res.status})`);
  }

  const data: ImageResponse = await res.json();
  if (!data.success || !data.imageUrl) {
    throw new Error(data.error || 'No image URL returned');
  }

  return data.imageUrl;
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    return res.ok;
  } catch (e) {
    return false;
  }
}
