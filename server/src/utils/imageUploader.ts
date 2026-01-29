import { fal } from '@fal-ai/client';

/**
 * Base64 이미지를 fal.ai storage에 업로드하고 URL 반환
 * fal.ai는 image_url 파라미터로 URL만 받으므로 변환 필요
 */
export async function uploadBase64Image(base64Data: string): Promise<string> {
  // Base64 데이터 추출
  const base64Content = base64Data.split(',')[1] || base64Data;

  // MIME 타입 추출
  const mimeMatch = base64Data.match(/data:([^;]+);/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
  const extension = mimeType.split('/')[1] || 'png';

  // Buffer로 변환
  const buffer = Buffer.from(base64Content, 'base64');

  // Blob 생성 (Node.js 18+ 지원)
  const blob = new Blob([buffer], { type: mimeType });

  // File 객체 생성
  const file = new File([blob], `image.${extension}`, { type: mimeType });

  // fal storage에 업로드
  const uploadedUrl = await fal.storage.upload(file);

  return uploadedUrl;
}
