import { Request, Response } from 'express';
import { fal } from '@fal-ai/client';

interface LLMRequestBody {
  prompt: string;
  system_prompt?: string;
  model?: string;
  temperature?: number;
  max_tokens?: number;
}

export const generateLLMResponse = async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      system_prompt,
      model = 'google/gemini-2.0-flash-001',
      temperature = 0.7,
      max_tokens = 800,
    } = req.body as LLMRequestBody;

    if (!prompt || !prompt.trim()) {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }

    console.log(`[LLM] Requesting model=${model}, prompt length=${prompt.length}`);
    console.log(`[LLM] FAL_KEY configured: ${!!process.env.FAL_KEY}`);

    // fal.ai 공식 문서 기준: fal.subscribe("openrouter/router", { input, logs, onQueueUpdate })
    const result = await fal.subscribe("openrouter/router", {
      input: {
        // System Prompt를 더 명확하게 구분하여 전달
        prompt: system_prompt 
          ? `[SYSTEM INSTRUCTION START]\n${system_prompt}\n[SYSTEM INSTRUCTION END]\n\n[USER REQUEST START]\n${prompt}\n[USER REQUEST END]` 
          : prompt,
        model,
        temperature,
        max_tokens,
      },
      logs: true,
      onQueueUpdate: (update) => {
        if (update.status === "IN_PROGRESS") {
          update.logs?.map((log) => log.message).forEach((msg) => console.log(`[LLM] progress: ${msg}`));
        }
      },
    }) as any;

    console.log(`[LLM] result.requestId:`, result?.requestId);
    console.log(`[LLM] result.data:`, JSON.stringify(result?.data)?.substring(0, 200));

    // 문서 Output Schema: { output: string, reasoning?: string, partial: boolean, error?: string, usage: {...} }
    const data = result?.data;

    if (data?.error) {
      console.error('[LLM] API returned error:', data.error);
      res.status(500).json({ success: false, error: data.error });
      return;
    }

    const output = data?.output;

    if (!output) {
      console.error('[LLM] No output in result:', JSON.stringify(result).substring(0, 500));
      res.status(500).json({ success: false, error: 'No output returned from LLM' });
      return;
    }

    console.log(`[LLM] Success, output length=${output.length}, tokens=${JSON.stringify(data?.usage)}`);

    res.json({
      success: true,
      output,
      usage: data?.usage || null,
    });
  } catch (error: any) {
    console.error('[LLM] Generation failed:', error?.message);
    console.error('[LLM] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)).substring(0, 1000));
    res.status(500).json({
      success: false,
      error: error.message || 'LLM generation failed',
    });
  }
};
