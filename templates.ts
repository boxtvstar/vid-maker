export const VIDEO_TEMPLATES = [
  {
    id: 'tech-review',
    name: '기술 리뷰',
    icon: 'devices',
    description: '신제품이나 기술을 소개하는 영상',
    topic: '최신 AI 칩셋의 성능과 활용 사례',
    videoLength: 'shorts' as const,
    videoTone: 'info' as const,
    scenes: 3
  },
  {
    id: 'tutorial',
    name: '튜토리얼',
    icon: 'school',
    description: '단계별 가이드 영상',
    topic: '초보자를 위한 영상 편집 기초',
    videoLength: 'long' as const,
    videoTone: 'info' as const,
    scenes: 5
  },
  {
    id: 'storytelling',
    name: '스토리텔링',
    icon: 'auto_stories',
    description: '감동적인 이야기 전달',
    topic: '작은 회사가 세계적 기업이 되기까지',
    videoLength: 'long' as const,
    videoTone: 'emotional' as const,
    scenes: 6
  },
  {
    id: 'news',
    name: '뉴스 요약',
    icon: 'newspaper',
    description: '빠른 뉴스 브리핑',
    topic: '오늘의 주요 기술 뉴스 3가지',
    videoLength: 'shorts' as const,
    videoTone: 'fast' as const,
    scenes: 3
  },
  {
    id: 'educational',
    name: '교육 콘텐츠',
    icon: 'psychology',
    description: '지식 전달 영상',
    topic: '양자 컴퓨터의 원리와 미래',
    videoLength: 'long' as const,
    videoTone: 'info' as const,
    scenes: 5
  },
  {
    id: 'motivation',
    name: '동기부여',
    icon: 'emoji_events',
    description: '영감을 주는 메시지',
    topic: '실패를 성공으로 바꾼 사람들의 이야기',
    videoLength: 'shorts' as const,
    videoTone: 'emotional' as const,
    scenes: 4
  }
];

export const BGM_OPTIONS = [
  { id: 'cinematic', name: 'Cinematic', mood: '웅장함', genre: '오케스트라' },
  { id: 'upbeat', name: 'Upbeat Pop', mood: '경쾌함', genre: '팝' },
  { id: 'corporate', name: 'Corporate', mood: '전문적', genre: '일렉트로닉' },
  { id: 'ambient', name: 'Ambient', mood: '차분함', genre: '앰비언트' },
  { id: 'electronic', name: 'Electronic Beat', mood: '활기참', genre: '일렉트로닉' },
  { id: 'inspiring', name: 'Inspiring Piano', mood: '감동적', genre: '피아노' },
  { id: 'none', name: 'No BGM', mood: '없음', genre: '배경음악 없음' }
];

export const EXPORT_PRESETS = [
  {
    id: 'youtube',
    name: 'YouTube (1080p)',
    resolution: '1920x1080',
    fps: 30,
    format: 'MP4',
    codec: 'H.264',
    bitrate: '8 Mbps'
  },
  {
    id: 'shorts',
    name: 'YouTube Shorts (1080x1920)',
    resolution: '1080x1920',
    fps: 30,
    format: 'MP4',
    codec: 'H.264',
    bitrate: '8 Mbps'
  },
  {
    id: 'instagram',
    name: 'Instagram Reel (1080x1920)',
    resolution: '1080x1920',
    fps: 30,
    format: 'MP4',
    codec: 'H.264',
    bitrate: '8 Mbps'
  },
  {
    id: 'tiktok',
    name: 'TikTok (1080x1920)',
    resolution: '1080x1920',
    fps: 30,
    format: 'MP4',
    codec: 'H.264',
    bitrate: '8 Mbps'
  },
  {
    id: '4k',
    name: '4K UHD (3840x2160)',
    resolution: '3840x2160',
    fps: 60,
    format: 'MP4',
    codec: 'H.265',
    bitrate: '16 Mbps'
  }
];

export const SUBTITLE_TEMPLATES = [
  {
    id: 'bold',
    name: '볼드 스타일',
    fontFamily: 'Pretendard',
    fontSize: 42,
    fontWeight: 800,
    outline: true,
    shadow: true
  },
  {
    id: 'minimal',
    name: '미니멀',
    fontFamily: 'Noto Sans KR',
    fontSize: 36,
    fontWeight: 500,
    outline: false,
    shadow: true
  },
  {
    id: 'gaming',
    name: '게이밍',
    fontFamily: 'G마켓 산스',
    fontSize: 48,
    fontWeight: 900,
    outline: true,
    shadow: true
  },
  {
    id: 'elegant',
    name: '우아함',
    fontFamily: 'Nanum Myeongjo',
    fontSize: 38,
    fontWeight: 600,
    outline: false,
    shadow: false
  }
];
