
import 'dotenv/config'; // .env 로드
import { fal } from '@fal-ai/client';

console.log("Testing FAL TTS with custom voice ID...");

// FAL_KEY 확인 (FAL_KEY 혹은 FAL_KEY_ID/SECRET를 사용할 수 있음)
if (!process.env.FAL_KEY) {
    console.error("Warning: FAL_KEY not found in env. Checking if credential works implicitly...");
}

const voiceId = 'mYk0rAapHek2oTw18z8x';

async function run() {
  try {
    console.log(`Submitting TTS request for Voice ID: ${voiceId}`);
    
    // as any 캐스팅은 fal-ai/client 버전에 따라 타입 정의 달라서 에러날까봐.
    const result = await fal.subscribe('fal-ai/elevenlabs/tts/turbo-v2.5', {
      input: {
        text: "안녕하세요, 이것은 테스트 음성입니다. 한국어가 잘 들리나요?",
        voice: voiceId,
        stability: 0.5,
        similarity_boost: 0.75,
        speed: 1.0,
        apply_text_normalization: 'auto'
      },
      logs: true, 
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
           update.logs.map((log) => log.message).forEach(console.log);
        }
      },
    }) as any;
    
    console.log("Success! Result:", JSON.stringify(result, null, 2));
    
    if (result.data?.audio?.url || result.audio?.url) {
        console.log("Audio URL generated successfully.");
    } else {
        console.error("No Audio URL found.");
    }
    
  } catch (error: any) {
    console.error("TTS Failed:", error.message || error);
    if (error.body) {
        console.error("Error Body:", JSON.stringify(error.body, null, 2));
    }
  }
}

run();
