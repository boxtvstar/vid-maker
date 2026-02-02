import { getApiKey } from '../utils';
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';

export interface LLMRequest {
  prompt: string;
  system_prompt?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  success: boolean;
  output?: string;
  error?: string;
}

export async function generateLLM(request: LLMRequest): Promise<string> {
  // 1. Try Client-Side Gemini Key first (DIRECT & FREE)
  const apiKey = getApiKey();
  const isGemini = request.model?.includes('gemini');

  if (apiKey && isGemini) {
    try {
      console.log('[LLM] Using Client-side Gemini API Key');
      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Map 'google/gemini-2.0-flash-001' -> 'gemini-2.0-flash' (or closest valid SDK model name)
      // Note: As of early 2025, 'gemini-2.0-flash-exp' or similar might be the exact name. 
      // Safe fallback to 'gemini-1.5-flash' if 2.0 fails, or try provided ID stripped of vendor prefix.
      let modelName = request.model?.replace('google/', '') || 'gemini-pro';
      
      // Simple mapping for common router IDs to SDK IDs
      if (modelName.includes('flash')) modelName = 'gemini-2.0-flash-exp'; // Update this as SDK supports stable 2.0
      
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature: request.temperature,
          maxOutputTokens: request.max_tokens,
        },
        systemInstruction: request.system_prompt
      });

      const result = await model.generateContent(request.prompt);
      const output = result.response.text();
      return output;

    } catch (clientError: any) {
      console.warn('[LLM] Client-side generation failed, falling back to server:', clientError);
      // Fallback to server if client key fails (e.g. quota exceeded or invalid model)
    }
  }

  // 2. Fallback to Server (Fal.ai / OpenRouter)
  const res = await fetch(`${API_BASE_URL}/api/llm/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `LLM request failed (${res.status})`);
  }

  const data: LLMResponse = await res.json();
  if (!data.success || !data.output) {
    throw new Error(data.error || 'Empty LLM response');
  }

  return data.output;
}
