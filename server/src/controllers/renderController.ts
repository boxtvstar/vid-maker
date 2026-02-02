import { Request, Response } from 'express';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define job directory
const UPLOAD_DIR = path.resolve(__dirname, '../../public/uploads');
const JOBS_DIR = path.join(UPLOAD_DIR, 'render_jobs');

if (!fs.existsSync(JOBS_DIR)) {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
}

interface RenderScene {
  id: string;
  videoUrl?: string;
  audioUrl?: string;
  durationSec: number;
}

interface RenderRequest {
  scenes: RenderScene[];
  srtContent?: string; // Global SRT string
  width?: number;
  height?: number;
}

const downloadFile = async (url: string, destPath: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download ${url}`);
  const buffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(buffer));
};

export const renderVideo = async (req: Request, res: Response) => {
  const { scenes, srtContent, width = 1080, height = 1920 } = req.body as RenderRequest;
  
  if (!scenes || scenes.length === 0) {
    return res.status(400).json({ error: 'No scenes provided' });
  }

  // Create Job ID
  const jobId = crypto.randomUUID();
  const jobDir = path.join(JOBS_DIR, jobId);
  fs.mkdirSync(jobDir);

  try {
    console.log(`[Render] Starting job ${jobId} with ${scenes.length} scenes`);

    // Download phase
    const downloads = scenes.map(async (scene, index) => {
      const scenePrefix = `scene_${index}`;
      let videoPath: string | null = null;
      let audioPath: string | null = null;

      if (scene.videoUrl) {
        if (scene.videoUrl.startsWith('http')) {
          videoPath = path.join(jobDir, `${scenePrefix}_video.mp4`);
          await downloadFile(scene.videoUrl, videoPath);
        } else if (scene.videoUrl.startsWith('/uploads')) {
          const relPath = scene.videoUrl.replace(/^\/uploads/, '');
          const absPath = path.join(UPLOAD_DIR, relPath);
          if (fs.existsSync(absPath)) {
            videoPath = absPath;
          }
        }
      }

      if (scene.audioUrl) {
        if (scene.audioUrl.startsWith('http')) {
          audioPath = path.join(jobDir, `${scenePrefix}_audio.mp3`);
          await downloadFile(scene.audioUrl, audioPath);
        } else if (scene.audioUrl.startsWith('/uploads')) {
           const relPath = scene.audioUrl.replace(/^\/uploads/, '');
           const absPath = path.join(UPLOAD_DIR, relPath);
           if (fs.existsSync(absPath)) {
             audioPath = absPath;
           }
        } else if (scene.audioUrl.startsWith('data:')) {
           audioPath = path.join(jobDir, `${scenePrefix}_audio.mp3`);
           const base64Data = scene.audioUrl.split(',')[1];
           fs.writeFileSync(audioPath, Buffer.from(base64Data, 'base64'));
        }
      }

      return { index, videoPath, audioPath, duration: scene.durationSec };
    });

    const downloadedScenes = await Promise.all(downloads);
    
    const ffmpegCmd = ffmpeg();
    
    // Prepare inputs
    downloadedScenes.forEach(s => {
      if (s.videoPath) ffmpegCmd.input(s.videoPath);
      if (s.audioPath) ffmpegCmd.input(s.audioPath);
    });

    // Subtitle file
    let srtPath: string | null = null;
    if (srtContent) {
      srtPath = path.join(jobDir, 'subtitles.srt');
      fs.writeFileSync(srtPath, srtContent);
    }

    const complexFilter: string[] = [];
    let streamIndex = 0;
    let concatFilterInputs = '';
    
    downloadedScenes.forEach((s, idx) => {
      // Determine input indices
      let vIdx = -1;
      let aIdx = -1;

      if (s.videoPath) {
        vIdx = streamIndex++;
      }
      if (s.audioPath) {
        aIdx = streamIndex++;
      }

      // Handle missing video input (use black screen equivalent?)
      if (vIdx !== -1) {
        // Scale video
         complexFilter.push(`[${vIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1[v${idx}]`);
      } else {
         // Create dummy video
         complexFilter.push(`color=s=${width}x${height}:c=black:d=${s.duration}[v${idx}]`);
      }
      
      if (aIdx !== -1) {
        complexFilter.push(`[${aIdx}:a]aformat=sample_rates=44100:channel_layouts=stereo[a${idx}]`);
      } else {
        // Generate silence
        complexFilter.push(`anullsrc=r=44100:cl=stereo:d=${s.duration}[a${idx}]`);
      }
      
      concatFilterInputs += `[v${idx}][a${idx}]`;
    });

    const outputV = 'outv';
    const outputA = 'outa';
    
    complexFilter.push(`${concatFilterInputs}concat=n=${downloadedScenes.length}:v=1:a=1[${outputV}][${outputA}]`);
    
    let finalV = outputV;
    if (srtPath) {
      // Basic escaping for filter
      const escapedSrtPath = srtPath.replace(/\\/g, '/').replace(/:/g, '\\\\:');
      // Adding force_style to ensure visibility
      complexFilter.push(`[${outputV}]subtitles='${escapedSrtPath}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,MarginV=60,Alignment=2'[burnedv]`);
      finalV = 'burnedv';
    }

    ffmpegCmd.complexFilter(complexFilter)
      .outputOptions([
        `-map [${finalV}]`,
        `-map [${outputA}]`,
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-c:a aac',
        '-shortest',
        '-movflags +faststart'
      ]);

    const outputFileName = `final_${jobId}.mp4`;
    const outputPath = path.join(jobDir, outputFileName);
    const publicUrl = `/uploads/render_jobs/${jobId}/${outputFileName}`;

    console.log('[Render] Running FFmpeg...');
    
    ffmpegCmd
      .on('end', () => {
        console.log(`[Render] Job ${jobId} finished.`);
        res.json({ 
          success: true, 
          videoUrl: publicUrl 
        });
        
        // Cleanup inputs? Optional
      })
      .on('error', (err: any) => {
        console.error(`[Render] Job ${jobId} error:`, err);
        // Do not double send response if headers sent, but usually it's fine here
        if (!res.headersSent) {
            res.status(500).json({ error: 'Rendering failed', details: err.message });
        }
      })
      .save(outputPath);

  } catch (error: any) {
    console.error('[Render] Request failed:', error);
    if (!res.headersSent) {
        res.status(500).json({ error: error.message });
    }
  }
};
