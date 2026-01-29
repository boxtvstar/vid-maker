import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fal } from '@fal-ai/client';
import videoRoutes from './routes/videoRoutes.js';
import ttsRoutes from './routes/ttsRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파일 경로 명시적 지정 (server/.env)
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 디버깅: FAL_KEY 로드 확인
console.log('FAL_KEY loaded:', process.env.FAL_KEY ? `${process.env.FAL_KEY.substring(0, 10)}...` : 'NOT SET');

// fal.ai 클라이언트 설정
if (process.env.FAL_KEY) {
  fal.config({
    credentials: process.env.FAL_KEY
  });
}

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '50mb' })); // 큰 base64 이미지 허용

// Routes
app.use('/api/video', videoRoutes);
app.use('/api/tts', ttsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    falConfigured: !!process.env.FAL_KEY
  });
});

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Video API Server running on port ${PORT}`);
  console.log(`fal.ai configured: ${!!process.env.FAL_KEY}`);
});
