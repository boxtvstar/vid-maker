
import { fal } from '@fal-ai/client';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' }); // Adjust for server dir

async function test() {
  try {
    console.log("Testing LLM with model: google/gemini-2.0-flash");
    const result = await fal.subscribe("openrouter/router", {
      input: {
        prompt: "Hello, how are you?",
        model: "google/gemini-2.0-flash",
        temperature: 0.7,
        max_tokens: 100
      }
    });
    console.log("Success:", result.data);
  } catch (e) {
    console.error("Failed:", e);
  }
}

test();
