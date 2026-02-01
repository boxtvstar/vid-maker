
export enum CreationStep {
  TOPIC = 1,
  SCRIPT = 2,
  CUT_SELECTION = 3,
  SCENE_REVIEW = 4,
  MOTION = 5,
  AUDIO_STYLE = 6,
  SUBTITLE = 7,
  FINAL = 8
}

export interface ScriptBlock {
  id: number;
  title: string;
  content: string;
}

export interface SubtitleSegment {
  id: string;
  text: string;
  startTime: number;  // 장면 내 상대 시간 (초)
  endTime: number;
}

export interface Scene {
  id: string;
  name: string;
  duration: string;
  imageUrl: string;
  script: string;
  prompt: string;
  isManualPrompt: boolean;
  status: 'active' | 'processing' | 'waiting' | 'completed';
  motionStyle?: string;
  videoClipUrl?: string;
  motionType?: 'auto' | 'zoom_in' | 'zoom_out' | 'pan_left' | 'pan_right' | 'static';
  audioUrl?: string;
  subtitleSegments?: SubtitleSegment[];  // 자막 분할 구간
}

export interface Voice {
  id: string;
  name: string;
  type: string;
  description: string;
  avatarUrl: string;
  gender?: 'male' | 'female';
  previewUrl?: string;  // 목소리 미리듣기용 샘플 오디오 URL
}
