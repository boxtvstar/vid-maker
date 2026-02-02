
import { fal } from '@fal-ai/client';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function test() {
  try {
    console.log("Testing LLM with model: google/gemini-2.0-flash-001");
    const result = await fal.subscribe("openrouter/router", {
      input: {
        prompt: "Hello",
        model: "google/gemini-2.0-flash-001", 
        temperature: 0.7,
        max_tokens: 10
      }
    });
    console.log("Success:", result.data);
  } catch (e) {
    console.error("Failed:", e);
  }
}

test();
