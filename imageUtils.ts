// 이미지 생성 API 통합 유틸리티
// 사용자 요청: 오직 'nano-banana-pro-preview' 모델만 사용하여 이미지를 생성합니다.

interface ImageGenerationOptions {
  prompt: string;
  keywords?: string;
  width?: number;
  height?: number;
  apiKey?: string;
}

/**
 * Google Gemini (nano-banana-pro-preview) 이미지 생성
 * 사용자의 API Key와 지정된 모델만 사용합니다.
 */
async function generateGoogleImagenImage(options: ImageGenerationOptions): Promise<string> {
  if (!options.apiKey) throw new Error("API Key required for Image Generation");

  const { prompt, width = 1280, height = 720 } = options;
  const aspectRatio = (width || 1280) > (height || 720) ? "16:9" : "9:16";

  // 사용자 지정 단일 모델 사용
  const modelName = "nano-banana-pro-preview";
  // predict -> generateContent 로 변경 (Gemini 계열 프로토콜 사용)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${options.apiKey}`;
  
  // console.log(`🎨 Generating image using ${modelName} via generateContent...`);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{
        parts: [{
          text: `Generate a photorealistic image of: ${prompt}. IMPORTANT: Do not include any text, letters, words, numbers, watermarks, logos, or typography in the image. The image should be purely visual without any written content. --aspect_ratio ${aspectRatio}`
        }]
      }],
      // 이미지 생성을 위한 설정 (필요 시 모델 스펙에 따라 조정)
      generationConfig: {
        temperature: 0.4,
        topK: 32,
        topP: 1,
        maxOutputTokens: 2048,
      }
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error(`API Error (${modelName}):`, errorData);
    throw new Error(`Image Generation Error: ${errorData.error?.message || response.statusText}`);
  }

  const data = await response.json();
  
  // 응답 데이터 파싱 시도 (Gemini Vision/Image 응답 구조 대응)
  // 구조 1: candidates[0].content.parts[0].inlineData (이미지 데이터)
  // 구조 2: candidates[0].content.parts[0].text (이미지 URL이 텍스트로 오는 경우)
  
  const candidate = data.candidates?.[0];
  const part = candidate?.content?.parts?.[0];

  if (part) {
     // 1. 인라인 데이터로 이미지가 온 경우 (Base64)
     if (part.inlineData && part.inlineData.data) {
        const mimeType = part.inlineData.mimeType || "image/png";
        return `data:${mimeType};base64,${part.inlineData.data}`;
     }
     
     // 2. 텍스트로 이미지 URL이나 Base64가 포함된 경우 (텍스트 응답 파싱)
     if (part.text) {
        // 혹시 텍스트 안에 마크다운 이미지 링크나 URL이 있는지 확인
        const urlMatch = part.text.match(/https?:\/\/[^\s")]+/);
        if (urlMatch) return urlMatch[0];
        
        // 텍스트 자체가 Base64일 수도 있음 (드물지만)
        if (part.text.startsWith('data:image')) return part.text;
     }
  }

  // 예측된 데이터 구조 (Imagen Legacy fallback)
  if (data.predictions?.[0]?.bytesBase64Encoded) {
    const mimeType = data.predictions[0].mimeType || "image/png";
    return `data:${mimeType};base64,${data.predictions[0].bytesBase64Encoded}`;
  }

  console.error("Unknown API Response structure:", data);
  throw new Error("No image data returned from API (Response structure mismatch)");
}


/**
 * AI 이미지 생성 통합 함수
 * 오직 nano-banana-pro-preview 모델만 사용합니다.
 */
export async function generateImage(options: ImageGenerationOptions): Promise<string> {
  if (!options.apiKey) {
    console.error("API Key is missing");
    return `https://via.placeholder.com/${options.width || 800}x${options.height || 450}?text=API+Key+Missing`;
  }

  try {
    return await generateGoogleImagenImage(options);
  } catch (err) {
    console.error('Image generation failed:', err);
    // 실패 시 사용자에게 시각적으로 알림 (다른 API 모델을 몰래 쓰지 않음)
    return `https://via.placeholder.com/${options.width || 800}x${options.height || 450}?text=Generation+Failed`;
  }
}

/**
 * AI 이미지 프롬프트 최적화
 */
export function optimizeImagePrompt(prompt: string, context?: string): string {
  const cinematicKeywords = ['cinematic', 'professional', 'high quality', '8k', 'detailed'];
  let optimized = prompt;
  
  cinematicKeywords.forEach(keyword => {
    if (!optimized.toLowerCase().includes(keyword)) {
      optimized += `, ${keyword}`;
    }
  });
  
  return optimized;
}

/**
 * 장면 설명에서 검색 키워드 추출
 */
export function extractKeywords(sceneTitle: string, sceneScript: string, prompt: string): string {
  const allText = `${sceneTitle} ${sceneScript} ${prompt}`;
  const words = allText
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2);
  
  const frequency: Record<string, number> = {};
  words.forEach(word => {
    frequency[word] = (frequency[word] || 0) + 1;
  });
  
  const topKeywords = Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
  
  return topKeywords.join(',');
}

/**
 * 이미지 URL 검증
 */
export async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 이미지를 다운로드하고 Data URL로 변환
 */
export async function imageToDataUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error('Failed to convert image to data URL:', err);
    throw err;
  }
}
