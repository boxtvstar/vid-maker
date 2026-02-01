
import { Voice, ScriptBlock } from './types';

export const INITIAL_SCRIPT_BLOCKS: ScriptBlock[] = [
  { id: 1, title: "장면 01: 인트로", content: "자동 영상 제작의 미래에 오신 것을 환영합니다. 오늘은 AI가 어떻게 전 세계 콘텐츠 크리에이터들의 환경을 재정의하고 있는지 살펴보겠습니다." },
  { id: 2, title: "장면 02: 문제 제기", content: "기존의 유튜브 영상 제작 방식은 대본 작성, 촬영, 그리고 편집까지 수일이 소요되었습니다. 이는 시간 소모가 크고 비용도 많이 듭니다." },
  { id: 3, title: "장면 03: 해결책 제시", content: "하지만 우리의 AI 기반 플랫폼을 사용하면 단 하나의 아이디어만으로 10분 이내에 완벽하게 편집된 걸작을 만들 수 있습니다." }
];

// ElevenLabs 음성 (fal.ai를 통해 사용)
export const VOICES: Voice[] = [
  { id: 'Rachel', name: '레이첼', type: '전문적인', description: '차분하고 전문적인 여성 목소리', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop', gender: 'female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/6edb9076-c3e4-420c-b6ab-11d43fe341b8.mp3' },
  { id: 'Aria', name: '아리아', type: '친근한', description: '밝고 친근한 여성 목소리', avatarUrl: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop', gender: 'female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/9BWtsMINqrJLrRacOk9x/c8e1b7e7-08b5-488e-a020-7bef50c884c8.mp3' },
  { id: 'Sarah', name: '사라', type: '내레이션', description: '부드럽고 따뜻한 여성 목소리', avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop', gender: 'female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/81b8d098-bcf1-43c4-b6e9-1f986c7bf2e0.mp3' },
  { id: 'Laura', name: '로라', type: '차분한', description: '자연스럽고 편안한 여성 목소리', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop', gender: 'female', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/FGY2WhTYpPnrIDTdsKH5/06f8f00f-7464-41c0-b3f9-7815b12a7c23.mp3' },
  { id: 'Adam', name: '아담', type: '전문적인', description: '깊고 전문적인 남성 목소리', avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop', gender: 'male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/e0d50cdf-779e-48d9-90e7-8368a1317bcf.mp3' },
  { id: 'Antoni', name: '안토니', type: '친근한', description: '따뜻하고 친근한 남성 목소리', avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop', gender: 'male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/38a1a689-5c52-4dde-9cf5-099e8fb489d8.mp3' },
  { id: 'Josh', name: '조쉬', type: '에너지', description: '젊고 역동적인 남성 목소리', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop', gender: 'male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/c8f40b2a-ca0f-43dd-9fc2-2b8d88a1a848.mp3' },
  { id: 'Arnold', name: '아놀드', type: '내레이션', description: '깊고 무게감 있는 남성 목소리', avatarUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&h=100&fit=crop', gender: 'male', previewUrl: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/VR6AewLTigWG4xSOukaG/6dfbcf71-c802-4e17-bf28-5a8c45dfac1e.mp3' },
];

export const MOTION_STYLES = [
  { id: 'cinematic', name: '시네마틱', icon: 'movie' },
  { id: 'fast', name: '빠른 편집', icon: 'bolt' },
  { id: 'smooth', name: '부드러운 전환', icon: 'auto_awesome' },
  { id: 'static', name: '정적 (이미지 중심)', icon: 'image' }
];
