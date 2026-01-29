
export enum CreationStep {
  TOPIC = 1,
  SCRIPT = 2,
  CUT_SELECTION = 3,
  SCENE_REVIEW = 4,
  MOTION = 5,
  AUDIO_STYLE = 6,
  FINAL = 7
}

export interface ScriptBlock {
  id: number;
  title: string;
  content: string;
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
  audioUrl?: string;  // 장면별 TTS 오디오 URL
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
