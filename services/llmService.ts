/**
 * LLM Service
 * fal.ai openrouter를 통한 LLM 텍스트 생성
 */

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
