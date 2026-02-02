import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';

import { CreationStep, ScriptBlock, Scene, Voice, CharacterProfile } from './types';
import { INITIAL_SCRIPT_BLOCKS, MOTION_STYLES } from './constants';
import { saveProject, getProjects, getApiKey, setApiKey as saveApiKey, downloadFile, generateSubtitles, ProjectData, autoSave, loadAutoSave, clearAutoSave, compressImage, apiQueue } from './utils';
import { VIDEO_TEMPLATES, BGM_OPTIONS, EXPORT_PRESETS } from './templates';
import { ApiKeyModal, ProjectsModal, TemplatesModal } from './Modals';
import { RecoveryModal } from './RecoveryModal';
import { ErrorDisplay } from './ErrorDisplay';
import { LoadingSpinner } from './LoadingSpinner';
import { generateImage, extractKeywords, imageToDataUrl } from './imageUtils';
import { generateVideoWithPolling } from './services/videoService';
import { generateBatchTTS, previewVoiceTTS, transcribeAudio } from './services/ttsService';
import { generateLLM } from './services/llmService';
import { generateFalImage, checkServerHealth } from './services/imageService';
import { AppSettings, fetchSettings } from './services/settingsService';
import { AdminModal } from './AdminModal';

const LANGUAGES = [
  { code: 'Korean', label: '🇰🇷 한국어' },
  { code: 'English', label: '🇺🇸 English' },
  { code: 'Japanese', label: '🇯🇵 日本語' },
];

const DURATIONS = [
  { code: '30s', label: '⚡ 30초 (Shorts/Reels)' },
  { code: '60s', label: '🕐 1분 (Shorts/TikTok)' },
  { code: 'short', label: '🕑 2~3분' },
  { code: 'medium', label: '🕒 3~5분' },
  { code: 'custom', label: '✨ 직접 입력' },
];

const PROCESS_STEPS = [
  { step: CreationStep.TOPIC, label: '기획', icon: 'edit_note' },
  { step: CreationStep.SCRIPT, label: '구성', icon: 'view_timeline' },
  { step: CreationStep.CUT_SELECTION, label: '이미지', icon: 'image' },
  { step: CreationStep.MOTION, label: '영상', icon: 'movie_filter' },
  { step: CreationStep.AUDIO_STYLE, label: '오디오', icon: 'graphic_eq' },
  { step: CreationStep.SUBTITLE, label: '자막편집', icon: 'subtitles' },
  { step: CreationStep.FINAL, label: '완료', icon: 'movie' },
];

const App: React.FC = () => {
  const [step, setStep] = useState<CreationStep>(CreationStep.TOPIC);
  const [topic, setTopic] = useState("");
  
  // 새로운 상태 변수들
  const [inputMode, setInputMode] = useState<'auto' | 'manual'>('auto');
  const [targetLanguage, setTargetLanguage] = useState('Korean');
  const [targetDuration, setTargetDuration] = useState('30s');
  const [customDuration, setCustomDuration] = useState('');
  const [manualScript, setManualScript] = useState('');
  const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>([
    { id: 'char-1', name: '주인공', description: '', status: 'active' }
  ]);
  const [isDarkMode, setIsDarkMode] = useState(true); // Default dark mode
  const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);
  const [useCharacterProfile, setUseCharacterProfile] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // Fetch settings on mount
  useEffect(() => {
    fetchSettings()
      .then(data => {
        setSettings(data);
        if (data.image.defaultStyle) {
          setSelectedImageStyle(data.image.defaultStyle);
        }
        if (data.audio.defaultVoice && !selectedVoice) {
          const v = data.audio.voices.find(v => v.id === data.audio.defaultVoice);
          if (v) setSelectedVoice(v as any);
        }
        if (data.video.defaultProvider) {
          setVideoProvider(data.video.defaultProvider);
        }
      })
      .catch(err => console.error('Failed to load settings:', err));
  }, []);

  // Toggle dark mode class
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // 대본 미리보기 상태
  const [scriptPreview, setScriptPreview] = useState<{synopsis: string, shots: {title: string, content: string, visual?: string}[]} | null>(null);

  // 2단계 (Shot 설계)용 상태
  const [synopsis, setSynopsis] = useState("");
  const [shots, setShots] = useState<{id: string, content: string, visual?: string}[]>([]);

  const [videoLength, setVideoLength] = useState<"shorts" | "long">("shorts");
  const [videoTone, setVideoTone] = useState<
    "info" | "story" | "emotional" | "fast"
  >("info");
  const [selectedCutCount, setSelectedCutCount] = useState<number | "auto">(8);



  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>(
    INITIAL_SCRIPT_BLOCKS,
  );
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(null);
  const [selectedImageStyle, setSelectedImageStyle] = useState('3d_cartoon');
  const [selectedMotion, setSelectedMotion] = useState(MOTION_STYLES[0].id);
  const [selectedBgm, setSelectedBgm] = useState("Cinematic");
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [maxReachedStep, setMaxReachedStep] = useState<CreationStep>(CreationStep.TOPIC);
  
  // Update maxReachedStep whenever step changes
  useEffect(() => {
    const currentIdx = PROCESS_STEPS.findIndex(s => s.step === step);
    const maxIdx = PROCESS_STEPS.findIndex(s => s.step === maxReachedStep);
    
    if (currentIdx > maxIdx && currentIdx !== -1) {
      setMaxReachedStep(step);
    }
  }, [step, maxReachedStep]);

  // New features state

  const [currentProjectId, setCurrentProjectId] = useState<string>('');
  const [savedProjects, setSavedProjects] = useState<ProjectData[]>([]);
  const [showProjectsModal, setShowProjectsModal] = useState(false);
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [exportPreset, setExportPreset] = useState(EXPORT_PRESETS[0]);

  // Motion Step specific states
  const [motionIntensity, setMotionIntensity] = useState(80);
  const [globalMotionStyle, setGlobalMotionStyle] = useState("cinematic");
  const [isBitSyncEnabled, setIsBitSyncEnabled] = useState(true);

  // Video Provider states
  const [videoProvider, setVideoProvider] = useState<'kling' | 'kling-standard' | 'grok' | 'veo' | 'sora'>('kling');
  const [showModelSelectModal, setShowModelSelectModal] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

  // Audio & Subtitle Step specific states
  const [subtitleFont, setSubtitleFont] = useState("본고딕 (기본)");
  const [subtitleColor, setSubtitleColor] = useState("#FFFFFF");
  const [subtitleBgColor, setSubtitleBgColor] = useState("#000000"); // 배경 색상 (기존 Highlight)
  const [subtitleBorderColor, setSubtitleBorderColor] = useState("#3713EC"); // 글씨 테두리 색상
  const [subtitleBorderWidth, setSubtitleBorderWidth] = useState(0); // 글씨 테두리 두께 최소값 0
  const [subtitleFontSize, setSubtitleFontSize] = useState(15); // 자막 크기 초기값 15
  const [subtitleBgRadius, setSubtitleBgRadius] = useState(0); // 배경 둥근 정도 최소값 0
  const [subtitleBgWidth, setSubtitleBgWidth] = useState(0); // 가로 여백 (Padding X)
  const [subtitleBgHeight, setSubtitleBgHeight] = useState(0); // 세로 여백 (Padding Y)
  const [subtitleY, setSubtitleY] = useState(2); // 세로 위치 최하단 2%
  const [showSubtitleBg, setShowSubtitleBg] = useState(true);
  const [subtitleShadow, setSubtitleShadow] = useState(true); // 텍스트 그림자 여부
  const [subtitleGlow, setSubtitleGlow] = useState(false); // 텍스트 네온/GLOW 효과 여부
  const [subtitleTemplate, setSubtitleTemplate] = useState("bold");
  const [showSubtitles, setShowSubtitles] = useState(true); // 자막 표시 여부
  const [playingPreviewVoice, setPlayingPreviewVoice] = useState<string | null>(null); // 미리듣기 중인 목소리 ID

  // 자막 직접 조작 관련 상태
  const [isSubSelected, setIsSubSelected] = useState(false);
  const [subDragMode, setSubDragMode] = useState<'move' | 'resize-r' | 'resize-l' | 'resize-t' | 'resize-b' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0, w: 0, h: 0, yPct: 0 });
  const previewRef = useRef<HTMLDivElement>(null);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [autoSyncProgress, setAutoSyncProgress] = useState('');
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);
  const [ttsProgress, setTtsProgress] = useState(0);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  const [isDraggingSubEdge, setIsDraggingSubEdge] = useState<{ segId: string; sceneId: string; edge: 'left' | 'right' } | null>(null);
  const subtitleTrackRef = useRef<HTMLDivElement>(null);

  // 오디오 파형 데이터 (장면별)
  const [waveformData, setWaveformData] = useState<Record<string, number[]>>({});

  // Final Rendering 상태
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [timelineHeight, setTimelineHeight] = useState(280); // Resizable timeline height
  const [timelineScale, setTimelineScale] = useState(1); // Timeline zoom scale (1x ~ 10x)
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);
  const [selectedTrackType, setSelectedTrackType] = useState<'subtitle' | 'scene' | 'audio' | null>(null);
  const [selectedAudioSceneId, setSelectedAudioSceneId] = useState<string | null>(null);

  // Auto-save 상태
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [hasAutoSave, setHasAutoSave] = useState(false);

  // Scene Preview Sync Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlayingScene, setIsPlayingScene] = useState(false);

  // 통합 플레이어 상태 (9단계 자막 확정용)
  const [integratedTime, setIntegratedTime] = useState(0);
  const [isIntegratedPlaying, setIsIntegratedPlaying] = useState(false);

  // 통합 플레이어 시간 계산
  const scenesWithTiming = useMemo(() => {
    let current = 0;
    return scenes.map(s => {
      let d = 5;
      if (s.duration) {
        if (s.duration.includes(':')) {
          const parts = s.duration.split(':').map(Number);
          d = (parts[0] || 0) * 60 + (parts[1] || 0);
        } else {
          d = parseFloat(s.duration.replace('s', '')) || 5;
        }
      }
      const startTime = current;
      current += d;
      return { ...s, startTime, durationSec: d };
    });
  }, [scenes]);

  const totalVideoDuration = useMemo(() => 
    scenesWithTiming.reduce((acc, s) => acc + s.durationSec, 0)
  , [scenesWithTiming]);

  // 통합 플레이어 재생 로직
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const update = () => {
      if (isIntegratedPlaying) {
        const now = performance.now();
        const delta = (now - lastTime) / 1000;
        lastTime = now;

        setIntegratedTime(prev => {
          const next = prev + delta;
          if (next >= totalVideoDuration) {
            setIsIntegratedPlaying(false);
            return 0; // 루프 혹은 종료
          }
          return next;
        });
      }
      animationFrameId = requestAnimationFrame(update);
    };

    if (isIntegratedPlaying) {
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(update);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isIntegratedPlaying, totalVideoDuration]);

  // 통합 시간에 따른 장면 전환 (재생/정지 무관하게 업데이트)
  useEffect(() => {
    if (step === CreationStep.SUBTITLE) {
      const activeScene = scenesWithTiming.find(s => 
        integratedTime >= s.startTime && integratedTime < s.startTime + s.durationSec
      );
      if (activeScene && activeScene.id !== selectedSceneId) {
        setSelectedSceneId(activeScene.id);
      }
    }
  }, [integratedTime, scenesWithTiming, step, selectedSceneId]);

  // Sync video and audio playback (Scene & Integrated)
  useEffect(() => {
    const isPlaying = isPlayingScene || isIntegratedPlaying;
    if (isPlaying) {
      videoRef.current?.play().catch(() => {});
      audioRef.current?.play().catch(() => {});
    } else {
      videoRef.current?.pause();
      audioRef.current?.pause();
    }
  }, [isPlayingScene, isIntegratedPlaying]);

  // 자막 캔버스 조작 핸들러
  const handleSubDragStart = (e: React.MouseEvent, mode: 'move' | 'resize-r' | 'resize-l' | 'resize-t' | 'resize-b') => {
    e.stopPropagation();
    setSubDragMode(mode);
    setDragStart({ 
      x: e.clientX, 
      y: e.clientY, 
      w: subtitleBgWidth, 
      h: subtitleBgHeight, 
      yPct: subtitleY 
    });
    setIsSubSelected(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!subDragMode || !previewRef.current) return;

      const rect = previewRef.current.getBoundingClientRect();
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      if (subDragMode === 'move') {
        const dyPct = (dy / rect.height) * 100;
        setSubtitleY(Math.max(0, Math.min(95, dragStart.yPct - dyPct)));
      } else if (subDragMode === 'resize-r') {
        setSubtitleBgWidth(Math.max(20, dragStart.w + dx * 2));
      } else if (subDragMode === 'resize-l') {
        setSubtitleBgWidth(Math.max(20, dragStart.w - dx * 2));
      } else if (subDragMode === 'resize-b') {
        setSubtitleBgHeight(Math.max(10, dragStart.h + dy * 2));
      } else if (subDragMode === 'resize-t') {
        setSubtitleBgHeight(Math.max(10, dragStart.h - dy * 2));
      }
    };

    const handleMouseUp = () => {
      setSubDragMode(null);
    };

    // 전역 클릭 감지 (자막 바깥 클릭 시 선택 해제)
    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // 자막 상자나 조절 핸들이 아닌 곳을 클릭했을 때만 해제
      if (isSubSelected && !target.closest('.subtitle-container')) {
        setIsSubSelected(false);
      }
    };

    if (subDragMode) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    window.addEventListener('mousedown', handleGlobalClick);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousedown', handleGlobalClick);
    };
  }, [subDragMode, dragStart, isSubSelected]);

  // 타임라인 드래그 (Scrubbing) 로직
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingTimeline || !timelineRef.current) return;
      
      const rect = timelineRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - 16;
      const percent = Math.max(0, Math.min(1, x / (rect.width - 32)));
      setIntegratedTime(percent * totalVideoDuration);
    };

    const handleMouseUp = () => {
      setIsDraggingTimeline(false);
    };

    if (isDraggingTimeline) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingTimeline, totalVideoDuration]);

  // Separate Effect for Timeline Height Resizing
  useEffect(() => {
    if (!isResizingTimeline) return;

    const onResizeMove = (e: MouseEvent) => {
      e.preventDefault();
      const newHeight = window.innerHeight - e.clientY;
      // Min 150px, Max 80% of screen
      if (newHeight > 150 && newHeight < window.innerHeight * 0.8) {
         setTimelineHeight(newHeight);
      }
    };

    const onResizeUp = () => {
      setIsResizingTimeline(false);
    };

    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeUp);

    return () => {
      window.removeEventListener('mousemove', onResizeMove);
      window.removeEventListener('mouseup', onResizeUp);
    };
  }, [isResizingTimeline]);
  const syncMediaToTimeline = useCallback(() => {
    if (step === CreationStep.SUBTITLE && videoRef.current) {
      const activeScene = scenesWithTiming.find(s => 
        integratedTime >= s.startTime && integratedTime < s.startTime + s.durationSec
      );
      if (activeScene) {
        const offset = integratedTime - activeScene.startTime;
        
        // 비디오 정밀 동기화
        if (Math.abs(videoRef.current.currentTime - offset) > 0.1) {
          videoRef.current.currentTime = offset;
        }

        // 오디오 정밀 동기화
        if (audioRef.current && Math.abs(audioRef.current.currentTime - offset) > 0.1) {
           audioRef.current.currentTime = offset;
           // 소리가 끊기는 현상 방지: 재생 중이라면 강제 재생 시도
           if (isIntegratedPlaying && audioRef.current.paused) {
             audioRef.current.play().catch(() => {});
           }
        }
      }
    }
  }, [integratedTime, step, scenesWithTiming, isIntegratedPlaying]);

  useEffect(() => {
    syncMediaToTimeline();
  }, [integratedTime, syncMediaToTimeline]);

  // 소리 끊김 방지: 소스 변경 시 즉시 재생 처리
  useEffect(() => {
    if (isIntegratedPlaying && audioRef.current && audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    }
  }, [selectedSceneId, isIntegratedPlaying]);

  // 오디오 파형 분석 (Web Audio API)
  useEffect(() => {
    if (step !== CreationStep.SUBTITLE && step !== CreationStep.FINAL) return;
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    let cancelled = false;

    const analyze = async () => {
      for (const scene of scenes) {
        if (cancelled) break;
        if (!scene.audioUrl || waveformData[scene.id]) continue;
        try {
          const resp = await fetch(scene.audioUrl);
          const buffer = await resp.arrayBuffer();
          const audioBuffer = await audioCtx.decodeAudioData(buffer);
          const raw = audioBuffer.getChannelData(0);
          const samples = 80; // 장면당 샘플 수
          const blockSize = Math.floor(raw.length / samples);
          const peaks: number[] = [];
          for (let i = 0; i < samples; i++) {
            let sum = 0;
            for (let j = 0; j < blockSize; j++) {
              sum += Math.abs(raw[i * blockSize + j]);
            }
            peaks.push(sum / blockSize);
          }
          // 정규화 (0~1)
          const max = Math.max(...peaks, 0.01);
          const normalized = peaks.map(p => p / max);
          if (!cancelled) {
            setWaveformData(prev => ({ ...prev, [scene.id]: normalized }));
          }
        } catch {
          // 분석 실패 시 무시
        }
      }
    };
    analyze();
    return () => { cancelled = true; audioCtx.close(); };
  }, [step, scenes.map(s => s.audioUrl).join(',')]);

  // 자막 단계 진입 시 세그먼트 자동 초기화 (없는 장면에 전체 길이 1개 세그먼트 생성)
  useEffect(() => {
    if (step === CreationStep.SUBTITLE) {
      setScenes(prev => {
        let changed = false;
        const updated = prev.map((s, idx) => {
          if (!s.subtitleSegments || s.subtitleSegments.length === 0) {
            if (s.script && s.script.trim()) {
              changed = true;
              const dur = scenesWithTiming[idx]?.durationSec || 5;
              return {
                ...s,
                subtitleSegments: [{
                  id: `${s.id}-seg-0`,
                  text: s.script,
                  startTime: 0,
                  endTime: dur,
                }]
              };
            }
          }
          return s;
        });
        return changed ? updated : prev;
      });
    }
  }, [step]);

  // 자막 블록 엣지 드래그 로직
  useEffect(() => {
    if (!isDraggingSubEdge) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!subtitleTrackRef.current) return;
      const { segId, sceneId, edge } = isDraggingSubEdge;
      const sceneWithTime = scenesWithTiming.find(s => s.id === sceneId);
      if (!sceneWithTime) return;

      // 해당 장면의 트랙 요소 찾기
      const sceneTrackEl = subtitleTrackRef.current.querySelector(`[data-scene-id="${sceneId}"]`) as HTMLElement;
      if (!sceneTrackEl) return;

      const rect = sceneTrackEl.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(1, x / rect.width));
      const newTime = Math.round(percent * sceneWithTime.durationSec * 10) / 10;

      setScenes(prev => prev.map(s => {
        if (s.id !== sceneId) return s;
        return {
          ...s,
          subtitleSegments: s.subtitleSegments?.map(seg => {
            if (seg.id !== segId) return seg;
            if (edge === 'left') {
              return { ...seg, startTime: Math.min(newTime, seg.endTime - 0.1) };
            } else {
              return { ...seg, endTime: Math.max(newTime, seg.startTime + 0.1) };
            }
          })
        };
      }));
    };

    const handleMouseUp = () => {
      setIsDraggingSubEdge(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingSubEdge, scenesWithTiming]);

  // Load auto-save on mount
  useEffect(() => {
    const savedData = loadAutoSave();
    if (savedData) {
      setHasAutoSave(true);
      setShowRecoveryModal(true);
    }
  }, []);

  // Auto-save effect
  useEffect(() => {
    if (step === CreationStep.TOPIC) return; // Don't autosave on initial screen

    const timer = setTimeout(() => {
      const dataToSave = {
        step,
        topic,
        videoLength,
        videoTone,
        scenes,
        scriptBlocks,
        selectedVoice,
        timestamp: new Date().toISOString()
      };
      
      if (autoSave(dataToSave)) {
        setLastSaved(new Date());
      }
    }, 5000); // Save 5 seconds after last change

    return () => clearTimeout(timer);
  }, [step, topic, videoLength, videoTone, scenes, scriptBlocks, selectedVoice]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveProject({
          id: Date.now().toString(),
          name: topic || 'Untitled Project',
          topic,
          videoLength,
          videoTone,
          scriptBlocks,
          scenes,
          selectedVoice,
          selectedMotion: '',
          selectedBgm: '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        setLastSaved(new Date());
        // Show temporary success message
        console.log('Project saved manually');
      }

      // Esc to close modals or deselect timeline element
      if (e.key === 'Escape') {
        if (selectedTrackType) {
          setSelectedTrackType(null);
          setSelectedSubtitleId(null);
          setSelectedAudioSceneId(null);
        } else {
          setShowRecoveryModal(false);
          setShowProjectsModal(false);
        }
      }

      // Delete key: remove selected timeline element
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedTrackType && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        if (selectedTrackType === 'subtitle' && selectedSubtitleId) {
          setScenes(prev => prev.map(s => ({
            ...s,
            subtitleSegments: s.subtitleSegments?.filter(seg => seg.id !== selectedSubtitleId)
          })));
          setSelectedSubtitleId(null);
          setSelectedTrackType(null);
        } else if (selectedTrackType === 'scene' && selectedSceneId) {
          setScenes(prev => prev.filter(s => s.id !== selectedSceneId));
          setSelectedSceneId(null);
          setSelectedTrackType(null);
        } else if (selectedTrackType === 'audio' && selectedAudioSceneId) {
          setScenes(prev => prev.map(s => s.id === selectedAudioSceneId ? { ...s, audioUrl: undefined } : s));
          setSelectedAudioSceneId(null);
          setSelectedTrackType(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [topic, videoLength, videoTone, scriptBlocks, scenes, selectedVoice, selectedTrackType, selectedSubtitleId, selectedSceneId, selectedAudioSceneId]);

  const handleRecoverAutoSave = () => {
    const savedData = loadAutoSave();
    if (savedData) {
      setStep(savedData.step);
      setTopic(savedData.topic);
      setVideoLength(savedData.videoLength);
      setVideoTone(savedData.videoTone);
      setScenes(savedData.scenes);
      setScriptBlocks(savedData.scriptBlocks);
      setSelectedVoice(savedData.selectedVoice);
      setShowRecoveryModal(false);
    }
  };



  // 2단계 진입 시 Shot 자동 생성 로직
  useEffect(() => {
    // Only run if we have scenes but NO shots (e.g. loading from save), otherwise we overwrite user edits
    if (step === CreationStep.SCRIPT && scenes.length > 0 && shots.length === 0) {
      // 1. 시놉시스 자동 생성
      const summary = topic || scenes[0].content.substring(0, 50) + "...";
      setSynopsis(summary);

      // 2. Shot 자동 분할 (최대 30자 제한)
      const allContent = scenes.map(s => s.script).join(' ');
      const sentences = allContent.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) || [allContent];

      const splitLongSentence = (text: string, limit: number): string[] => {
          if (text.length <= limit) return [text];
          
          const parts: string[] = [];
          let currentPool = "";
          const words = text.split(" ");
          
          for (const w of words) {
              if ((currentPool + w).length + 1 > limit) {
                  if (currentPool.trim()) parts.push(currentPool.trim());
                  currentPool = w + " ";
              } else {
                  currentPool += w + " ";
              }
          }
          if (currentPool.trim()) parts.push(currentPool.trim());
          return parts;
      };
      
      const newShots = sentences
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .flatMap(sent => splitLongSentence(sent, 30)) // 30자 제한으로 쪼개기
        .map((sent, idx) => ({
          id: `shot-${Date.now()}-${idx}`,
          content: sent
        }));
      
      setShots(newShots);
    }
  }, [step, scenes]);


  // 이미지 생성 단계 진입 시 첫 번째 씬 자동 선택
  useEffect(() => {
    if (step === CreationStep.CUT_SELECTION && scenes.length > 0 && !selectedSceneId) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [step, scenes, selectedSceneId]);

  useEffect(() => {
    setSavedProjects(getProjects());
  }, []);

  // AI Client Initializer


  // Calculate Stats
  const stats = useMemo(() => {
    const wordCount = scriptBlocks.reduce(
      (acc, block) => acc + (block.content || "").trim().split(/\s+/).length,
      0,
    );
    const durationSeconds = Math.ceil(wordCount * 0.4);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = durationSeconds % 60;
    return {
      wordCount,
      duration: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      cutCount: scriptBlocks.length,
    };
  }, [scriptBlocks]);

  const handleGenerateScript = async () => {
    if (!topic.trim()) return;
    setIsLoading(true);
    setLoadingMessage("AI가 대본과 장면 구성을 준비하고 있습니다...");

    try {
      const duration = targetDuration === 'custom' ? customDuration : targetDuration;
      
      // 글자수 제한 매핑
      const charLimitMap: Record<string, string> = {
        '30s': '전체 글자수(공백 포함)를 **150자~200자** 이내로 작성하세요.',
        '60s': '전체 글자수(공백 포함)를 **300자~450자** 이내로 작성하세요.',
        'short': '전체 글자수(공백 포함)를 **800자~1,300자** 이내로 작성하세요. (약 15~25개 장면)',
        'medium': '전체 글자수(공백 포함)를 **1,500자~2,500자** 이내로 작성하세요. (약 30~50개 장면)',
      };
      
      const shotCountMap: Record<string, string> = {
        '30s': '장면(shots)은 5~7개 정도로 구성하세요.',
        '60s': '장면(shots)은 8~12개 정도로 구성하세요.',
        'short': '장면(shots)은 15~25개 정도로 풍부하게 구성하세요.',
        'medium': '장면(shots)은 30~50개 정도로 매우 상세하게 구성하세요.',
      };

      const charLimit = charLimitMap[targetDuration] || '';
      const shotCountInstruction = shotCountMap[targetDuration] || '';

      const systemPromptTemplate = settings?.script.systemPrompt || `당신은 유튜브 영상 대본 전문 작가입니다.
사용자가 제공하는 주제로 {duration} 분량의 유튜브 영상 대본을 작성하세요.
언어: {language}
{char_limit}
{shot_count_instruction}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:
{
  "synopsis": "영상 전체 요약 (1~2문장)",
  "shots": [
    { "title": "장면 제목", "content": "해당 장면의 내레이션/대사 텍스트" }
  ]
}`;

      const rules = settings?.script.rules || `- shots는 3~10개로 구성 (길이에 맞게 조절)
- 각 shot의 content는 자연스러운 내레이션 문장으로 작성
- 시청자의 관심을 끄는 인트로와 마무리 포함
- JSON만 출력하고 마크다운 코드블록이나 설명을 붙이지 마세요`;

      const fullPrompt = `${systemPromptTemplate}\n\n규칙:\n${rules}`;

      const systemPrompt = fullPrompt
        .replace('{duration}', duration)
        .replace('{language}', targetLanguage)
        .replace('{char_limit}', charLimit)
        .replace('{shot_count_instruction}', shotCountInstruction);

      const output = await generateLLM({
        prompt: `주제: ${topic}\n주의: 작성할 장면 수에 대한 지침을 엄격히 준수하세요(반드시 ${shotCountInstruction}에 맞게 생성).`,
        system_prompt: systemPrompt,
        model: settings?.script.model || 'google/gemini-2.0-flash-001',
        temperature: settings?.script.temperature || 0.7,
        max_tokens: settings?.script.maxTokens || 4000,
      });

      // JSON 파싱 (코드블록 래핑 제거)
      const cleaned = output.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed.shots || !Array.isArray(parsed.shots)) {
        throw new Error('AI 응답에 shots 배열이 없습니다.');
      }

      // 미리보기 상태에 저장 (바로 이동하지 않음)
      const finalShots = parsed.shots.map((shot: any, idx: number) => ({
        title: shot.title || `장면 ${idx + 1}`,
        content: shot.content || shot.text || '',
        visual: shot.visual || '',
      }));

      setScriptPreview({
        synopsis: parsed.synopsis || topic,
        shots: finalShots,
      });
    } catch (error: any) {
      console.error("Script generation failed", error);
      const errorMessage = error.message || JSON.stringify(error);
      alert(`대본 생성 실패: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 대본 미리보기 확정 → 대본 단계로 이동 (캐릭터 자동 분석 포함)
  const handleConfirmPreview = async () => {
    if (!scriptPreview) return;

    setSynopsis(scriptPreview.synopsis);

    const newShots = scriptPreview.shots.map((shot, idx) => ({
      id: `shot-${Date.now()}-${idx}`,
      content: shot.content,
      visual: shot.visual || '',
    }));
    setShots(newShots);

    const newBlocks: ScriptBlock[] = scriptPreview.shots.map((shot, idx) => ({
      id: idx + 1,
      title: shot.title,
      content: shot.content,
      visual: shot.visual || '',
    }));
    setScriptBlocks(newBlocks);

    setStep(CreationStep.SCRIPT);

    try {
      const shotsText = scriptPreview.shots.map((s, i) => `Shot ${i+1}: ${s.content}`).join('\n');
      
      const charPrompt = `너는 대본 분석 및 캐릭터 디자이너 AI이다.
아래 대본(Shot List)을 보고 다음 두 가지 작업을 수행하라.

작업 1: 주요 등장인물(Characters) 추출
- 대본 전체를 관통하는 주요 인물 1~3명 추출
- 각 캐릭터의 'name' (한글)과 'description' (시각 묘사, 영어) 작성

작업 2: 대본 명확화 (Rewrite Shots)
- 각 Shot을 검토하여, 추출된 캐릭터가 등장하는 장면인지 판단한다.
- 캐릭터가 등장한다면, 대명사(그, 그녀, 아이 등)나 모호한 주어를 **'캐릭터 이름'**으로 교체하여 문장을 명확하게 수정한다.
- 예: "그가 검을 뽑는다" -> "철수가 검을 뽑는다"
- 캐릭터가 등장하지 않는 장면(배경, 사물 등)은 원문 그대로 둔다.
- **절대 [ ] 같은 괄호나 태그를 추가하지 말고, 자연스러운 문장으로 작성하라.**

대본(Shots):
${shotsText}

응답 형식 (JSON):
{
  "characters": [
    { "name": "이름", "description": "visual description..." }
  ],
  "revised_shots": [
    { "shot_index": 1, "content": "수정된 문장 또는 원문" },
    { "shot_index": 2, "content": "..." }
  ]
}`;

      const output = await generateLLM({
        prompt: charPrompt,
        model: settings?.script.model || 'google/gemini-2.0-flash-001',
        temperature: 0.3,
      });

      const cleaned = output.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (parsed.characters && Array.isArray(parsed.characters) && parsed.characters.length > 0) {
        const newProfiles: CharacterProfile[] = parsed.characters.map((c: any, idx: number) => ({
          id: `char-auto-${Date.now()}-${idx}`,
          name: c.name,
          description: c.description,
          status: 'active'
        }));
        
        setCharacterProfiles(newProfiles);
        
        // 대본 업데이트 (이름이 명시된 버전으로 교체)
        if (parsed.revised_shots && Array.isArray(parsed.revised_shots)) {
             setShots(prev => prev.map((shot, idx) => {
                 const revision = parsed.revised_shots.find((r: any) => r.shot_index === idx + 1);
                 
                 // 내용이 변경되었고, 길이가 너무 짧아지거나(오류 방지) 하지 않은 경우만 적용
                 if (revision && revision.content && revision.content.length > 5) {
                     return { 
                        ...shot, 
                        content: revision.content,
                        visual: shot.visual // Explicitly preserve the existing visual description
                     };
                 }
                 return shot;
             }));
        }
        
        console.log("✅ Auto-extracted characters & revised script:", newProfiles);
      }
    } catch (e) {
      console.error("Character auto-extraction failed", e);
    }
  };

  // Shot 편집 핸들러들
  const updateShot = (id: string, field: 'content' | 'visual', value: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const duplicateShot = (id: string) => {
    setShots(prev => {
      const index = prev.findIndex(s => s.id === id);
      if (index === -1) return prev;
      const shotToCopy = prev[index];
      const newShot = { ...shotToCopy, id: `shot-${Date.now()}-copy` };
      const newShots = [...prev];
      newShots.splice(index + 1, 0, newShot);
      return newShots;
    });
  };

  const deleteShot = (id: string) => {
    if (shots.length <= 1) {
      alert("최소 1개의 컷은 있어야 합니다.");
      return;
          setScenes(prev => prev.filter(s => s.id !== id));
    }
    setShots(prev => prev.filter(s => s.id !== id));
  };

  const handleAddCharacter = () => {
    setCharacterProfiles(prev => [
      ...prev,
      { id: `char-${Date.now()}`, name: `캐릭터 ${prev.length + 1}`, description: '', status: 'active' }
    ]);
  };

  const handleRemoveCharacter = (id: string) => {
    if (characterProfiles.length <= 1) return;
    setCharacterProfiles(prev => prev.filter(c => c.id !== id));
  };

  const handleUpdateCharacter = (id: string, updates: Partial<CharacterProfile>) => {
    setCharacterProfiles(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleGenerateCharacterImage = async (id: string) => {
    const char = characterProfiles.find(c => c.id === id);
    if (!char || !char.description) {
      alert("캐릭터 설명을 입력해주세요.");
      return;
    }

    handleUpdateCharacter(id, { status: 'processing' });
    try {
      const styles = settings?.image.styles || [];
      const styleObj = styles.find(s => s.id === selectedImageStyle);
      const stylePrefix = styleObj?.prefix || '';
      
      // 캐릭터 일관성 키워드 보강
      let refined = char.description.trim().replace(/\.$/, '');
      const kws = ['oval face', 'consistent facial features', 'consistent appearance'];
      if (!kws.some(k => refined.toLowerCase().includes(k))) {
        refined += `, ${kws[0]}, ${kws[1]}`;
      }

      const imageUrl = await generateFalImage({
        prompt: `${stylePrefix}, close-up portrait of ${refined}, neutral background`,
        aspect_ratio: '1:1',
      });

      handleUpdateCharacter(id, { imageUrl, status: 'active' });
    } catch (error) {
      console.error("Character image gen failed", error);
      alert("이미지 생성에 실패했습니다.");
      handleUpdateCharacter(id, { status: 'active' });
    }
  };

  const handleConfirmShots = async () => {
    // 상단에서 서버 연결 확인
    setIsLoading(true);
    const isServerHealthy = await checkServerHealth();
    if (!isServerHealthy) {
      setIsLoading(false);
      alert("서버 연결에 실패했습니다. 백엔드 서버가 실행 중인지 확인해주세요.\n\n터미널을 확인하고 'npm run dev'를 다시 실행해주세요.");
      return;
    }

    if (!shots || shots.length === 0) {
      setIsLoading(false);
      alert("구성된 장면(Shot)이 없습니다. 이전 단계에서 대본을 먼저 생성해주세요.");
      return;
    }

    setLoadingMessage("각 컷에 맞는 AI 이미지를 설계하고 있습니다...");
    setLoadingProgress(0);

    try {
      const styles = settings?.image.styles || [];
      const styleObj = styles.find(s => s.id === selectedImageStyle);
      const stylePrefix = styleObj?.prefix || '(no style)';
      const aspectRatio = videoLength === 'shorts' ? '9:16' : '16:9';

      // 모든 캐릭터 프로필 통합 및 정제
      const characterBlock = useCharacterProfile ? characterProfiles.map(char => {
        let desc = char.description.trim().replace(/\.$/, '');
        const kws = ['oval face', 'consistent facial features', 'consistent appearance'];
        if (!kws.some(k => desc.toLowerCase().includes(k))) {
          desc += `, ${kws[0]}, ${kws[1]}`;
        }
        return `[Character: ${char.name}] ${desc}`;
      }).join(' AND ') : '';

      const shotListString = shots.map((s, idx) => 
        `Shot ${idx + 1} [ID: ${s.id}]
        - Voiceover: "${s.content}"
        - Visual: "${s.visual || 'Make a scene that matches the voiceover.'}"`
      ).join('\n\n');
      
      const promptGenerationSystem = settings?.image?.promptGenerationSystem || `너는 AI 이미지 생성 시스템의 프롬프트 구조화 엔진이다.
이 작업의 최우선 목표는 "캐릭터 일관성"과 "그림체(스타일) 일관성"이다.

중요 전제:
1. 이미지 스타일은 UI에서 선택된 STYLE_PRESET 문자열로 전달된다.
2. STYLE_PRESET은 시스템 상수이며, 너는 이를 수정, 해석, 보완, 재작성하지 않는다.
3. 그림체, 렌더링, 조명, 색감, 화풍 관련 표현은 STYLE_PRESET 외부에서 절대 생성하지 않는다.

캐릭터 이미지 참조 규칙 (매우 중요):
1. 사용자가 CHARACTER_REFERENCE_IMAGE(캐릭터 참조 이미지)를 제공할 수 있다.
2. 이 이미지는 캐릭터의 외형을 고정하기 위한 "참조 이미지"다.
3. 참조 이미지에서는 다음 요소만 참고한다: 얼굴 비율, 헤어 스타일, 체형, 전체적인 인상.
4. 참조 이미지의 배경, 조명, 포즈, 스타일은 절대 따라하지 않는다.
5. 참조 이미지가 제공된 경우, 모든 컷에서 동일한 캐릭터로 인식될 수 있도록 외형을 최대한 일관되게 유지해야 한다.

캐릭터 텍스트 규칙:
1. CHARACTER_PROFILE은 캐릭터의 성별, 나이대, 얼굴형, 헤어, 의상을 정의한다.
2. CHARACTER_PROFILE은 하나의 고정 문장 블록이며, 모든 씬에서 단어 하나도 변경되지 않아야 한다.
3. 문장 끝에 마침표(.)를 사용하지 않고, 쉼표(,)로만 연결된 단일 문장으로 유지한다.
4. 캐릭터 일관성을 강화하기 위해 CHARACTER_PROFILE에는 다음 키워드 중 최소 1~2개를 반드시 포함한다: oval face, consistent facial features, consistent appearance.

장면 구성 규칙:
1. 이 작업은 영상이 아니라 "이미지 세트" 생성이다.
2. 장소(environment)는 컷마다 자유롭게 변경 가능하다.
3. 캐릭터의 외형과 그림체는 모든 이미지에서 절대 변경되지 않아야 한다.

너의 역할:
1. SHOT 텍스트를 분석하여 다음 SCENE 슬롯만 생성한다: camera_shot, action_or_pose, environment, mood.
2. main_subject는 생성하지 않는다. 모든 컷의 주체는 CHARACTER_PROFILE이다.

최종 이미지 프롬프트 생성 규칙:
final_image_prompt = [STYLE_PRESET] + [CHARACTER_REFERENCE_IMAGE (있을 경우 참조)] + [CHARACTER_PROFILE] + [camera_shot] + [action_or_pose] + [environment] + [mood]

반드시 아래 JSON 형식으로만 응답하세요:
{
  "results": [
    {
      "id": "샷의 ID",
      "shot_index": "번호",
      "character_profile": "[CHARACTER_PROFILE 내용]",
      "camera_shot": "영어 묘사",
      "action_or_pose": "영어 묘사",
      "environment": "영어 묘사",
      "mood": "영어 묘사",
      "final_image_prompt": "위 순서 규칙을 100% 준수하여 생성된 최종 영문 프롬프트"
    }
  ]
}`;

      // 사용자가 캐릭터를 생성했을 때의 이미지를 참조 이미지로 사용할 수 있도록 함
      const referenceSummary = useCharacterProfile
        ? characterProfiles
          .filter(c => c.imageUrl)
          .map(c => `CHARACTER_REFERENCE_IMAGE (for ${c.name}): ${c.imageUrl}`)
          .join('\n')
        : '';

      const promptOutput = await generateLLM({
        prompt: `Synopsis: ${synopsis}\nSTYLE_PRESET: ${stylePrefix}\nCHARACTER_PROFILE: ${characterBlock}\n${referenceSummary}\n\nSHOT 목록:\n${shotListString}\n\nIMPORTANT: output MUST be valid JSON as defined in system prompt.`,
        system_prompt: promptGenerationSystem,
        model: settings?.script.model || 'google/gemini-2.0-flash-001',
        temperature: 0.3,
      });

      // Robust JSON Extraction
      let jsonStr = promptOutput;
      const firstCurly = promptOutput.indexOf('{');
      const lastCurly = promptOutput.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly !== -1 && lastCurly > firstCurly) {
        jsonStr = promptOutput.substring(firstCurly, lastCurly + 1);
      }

      let promptResults: any[] = [];
      try {
        const parsed = JSON.parse(jsonStr);
        promptResults = parsed.results || (Array.isArray(parsed) ? parsed : []);
      } catch (e) {
        console.error("JSON Parse Error", e);
      }

      const newScenes: Scene[] = [];
      const total = shots.length;

      for (let i = 0; i < total; i++) {
        const shot = shots[i];
        const resObj = Array.isArray(promptResults) 
          ? promptResults.find(r => String(r.id) === String(shot.id) || Number(r.shot_index) === i + 1)
          : null;
        
        const finalPrompt = resObj?.final_image_prompt || `${stylePrefix}, ${characterBlock}, detailed cinematic scene`;

        setLoadingMessage(`이미지 생성 중... (${i + 1}/${total})`);
        setLoadingProgress(Math.round(((i + 0.1) / total) * 100));

        let imageUrl = "";
        try {
          // 캐릭터 참조 이미지 중 첫 번째 이미지를 메인 레퍼런스로 사용 (Grok Edit API는 단일 image_url 지원)
          const validChars = useCharacterProfile ? characterProfiles.filter(c => c.imageUrl) : [];
          const firstRefUrl = validChars.length > 0 ? validChars[0].imageUrl : undefined;

          // 만약 2명 이상이면 프롬프트에 텍스트로도 보강
          /* 
             NOTE: Grok Edit 모드는 'image_url'을 원본으로 보고 'prompt'대로 수정하는 모드입니다.
             따라서 원본 캐릭터의 느낌을 살리면서 상황을 묘사하는 방식으로 동작합니다.
          */

          imageUrl = await generateFalImage({ 
            prompt: finalPrompt, 
            aspect_ratio: aspectRatio,
            reference_image_url: firstRefUrl,
            model: settings?.image.defaultModel
          });
        } catch (err) {
          console.error("Image Gen Error", err);
          imageUrl = `https://picsum.photos/seed/${shot.id || i}/800/450`;
        }

        newScenes.push({
          id: shot.id || `scene-${Date.now()}-${i}`,
          name: `Shot ${i + 1}`,
          duration: `${Math.ceil(shot.content.length * 0.25)}s`,
          imageUrl,
          script: shot.content,
          prompt: finalPrompt,
          isManualPrompt: false,
          status: "active",
          motionStyle: "시네마틱",
        });
      }

      if (newScenes.length > 0) {
        setScenes(newScenes);
        setSelectedSceneId(newScenes[0].id);
        setStep(CreationStep.CUT_SELECTION);
      } else {
        throw new Error("No scenes were created");
      }

    } catch (error) {
      console.error("Bulk Generation Failed", error);
      alert("이미지 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  // 3단계: 프롬프트 AI 확장 기능
  const handleExpandPrompt = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setIsLoading(true);
    setLoadingMessage("AI가 프롬프트를 더 생생하게 확장하고 있습니다...");

    try {
      // 제미나이 연동 제거로 인해 기능 중지
      alert("AI 확장 기능이 제거되었습니다.");
      return;
      
    } catch (error) {
      console.error("Prompt expansion failed:", error);
      alert("프롬프트 확장 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  // 4단계 진입: 모션 생성 (Video Generation via fal.ai)
  const handleGenerateMotions = async () => {
    setIsLoading(true);
    setMotionError(null);
    const providerName = videoProvider === 'kling' ? 'Kling Pro' : videoProvider === 'kling-standard' ? 'Kling Standard' : videoProvider === 'grok' ? 'xAI Grok' : videoProvider === 'veo' ? 'Veo' : 'Sora';
    setLoadingMessage(`${providerName} AI가 정지된 이미지에 움직임을 불어넣고 있습니다...`);
    setLoadingProgress(0);

    const newScenes = [...scenes];
    const total = newScenes.length;
    let failedCount = 0;
    let lastError = '';

    try {
      for (let i = 0; i < total; i++) {
        const scene = newScenes[i];

        // 이미 생성된 비디오가 있으면 스킵
        if (scene.videoClipUrl && scene.videoClipUrl.length > 100) continue;

        setLoadingMessage(`장면 ${i + 1} / ${total} : ${providerName} 모션 생성 중...`);
        setLoadingProgress(Math.round((i / total) * 100));

        try {
          // 1. 이미지 Data URL 준비
          let imageData = scene.imageUrl;
          if (!imageData.startsWith('data:')) {
             try {
                imageData = await imageToDataUrl(imageData);
             } catch (err) {
                console.warn("Failed to convert image to base64, skipping video gen for this shot");
                failedCount++;
                continue;
             }
          }

          // 2. fal.ai 서버를 통해 비디오 생성 요청
          const videoUrl = await generateVideoWithPolling({
            imageData: imageData,
            prompt: scene.prompt,
            motionType: scene.motionType || 'Cinematic Slow Motion',
            duration: '5',
            aspectRatio: videoLength === 'shorts' ? '9:16' : '16:9',
            provider: videoProvider
          }, (progress, status) => {
            setLoadingProgress(Math.round((i / total) * 100) + Math.round(progress / total));
            setLoadingMessage(`장면 ${i + 1} / ${total} : ${status}...`);
          });

          // 성공 시 업데이트
          newScenes[i] = { ...scene, videoClipUrl: videoUrl, status: 'completed' };
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.warn(`Shot ${i+1} video gen failed:`, errorMsg);
          lastError = errorMsg;
          failedCount++;
          newScenes[i] = { ...scene, status: 'completed' };
        }
      }

      setScenes(newScenes);
      setStep(CreationStep.MOTION);
      setLoadingProgress(100);

      // 실패한 장면이 있으면 에러 메시지 표시
      if (failedCount > 0) {
        setMotionError(`${failedCount}개 장면 생성 실패: ${lastError}\n(CSS 애니메이션으로 대체됨)`);
      }

    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      console.error("Motion generation process failed:", errorMsg);
      setMotionError(`영상 생성 실패: ${errorMsg}`);
      setStep(CreationStep.MOTION);
    } finally {
      setIsLoading(false);
      setLoadingProgress(0);
    }
  };

  // 3단계: 단일 이미지 재생성
  const handleRegenerateSingleImage = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setIsLoading(true);
    // 상태를 'processing'으로 변경
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'processing' } : s));

    try {
      console.log(`🖼️ Regenerating image for scene: ${scene.name}`);
      const aspectRatio = videoLength === 'shorts' ? '9:16' : '16:9';
      
      const imageUrl = await generateFalImage({
        prompt: scene.prompt,
        aspect_ratio: aspectRatio,
        model: settings?.image.defaultModel
      });

      // 이미지 URL 및 상태 업데이트
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl, status: 'completed' } : s));
      console.log(`✅ Image regenerated: ${imageUrl.substring(0, 30)}...`);

    } catch (error) {
      console.error("Image regeneration failed:", error);
      alert("이미지 생성에 실패했습니다. 프롬프트를 확인해주세요.");
      // 상태 복구
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'active' } : s));
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateSceneImage = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;

    setIsLoading(true);
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'processing' } : s));

    try {
      console.log(`🎬 Regenerating image for scene: ${scene.name}`);
      const aspectRatio = videoLength === 'shorts' ? '9:16' : '16:9';
      
      const imageUrl = await generateFalImage({
        prompt: scene.prompt,
        aspect_ratio: aspectRatio,
        model: settings?.image.defaultModel
      });

      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl, status: 'completed' } : s));
      console.log(`✅ Image regenerated for scene: ${scene.name}`);

    } catch (error) {
      console.error("❌ Image regeneration failed:", error);
      alert("이미지 재생성에 실패했습니다.");
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'active' } : s));
    } finally {
      setIsLoading(false);
    }
  };

  const regenerateSceneVideo = async (sceneId: string) => {
    const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
    if (sceneIndex === -1) return;

    const newScenes = [...scenes];
    newScenes[sceneIndex].status = "processing";
    setScenes([...newScenes]);

    setTimeout(() => {
      newScenes[sceneIndex].status = "active";
      newScenes[sceneIndex].imageUrl =
        `https://picsum.photos/seed/${Math.random()}/800/450`;
      setScenes([...newScenes]);
    }, 2000);
  };

  const updateBlock = (id: number, field: keyof ScriptBlock, value: string) => {
    setScriptBlocks((prev) =>
      prev.map((block) =>
        block.id === id ? { ...block, [field]: value } : block,
      ),
    );
  };

  const updateScene = (id: string, field: keyof Scene, value: any) => {
    setScenes(scenes.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const deleteScene = (id: string) => {
    if (scenes.length <= 1) return;
    setScenes(scenes.filter((s) => s.id !== id));
  };

  const addScene = () => {
    const newScene: Scene = {
      id: `scene-${Date.now()}`,
      name: `새로운 장면`,
      duration: "0:04",
      imageUrl: `https://picsum.photos/seed/${Math.random()}/800/450`,
      script: "내레이션 대본을 입력하세요.",
      prompt: "A cinematic professional shot",
      isManualPrompt: true,
      status: "active",
      motionStyle: "시네마틱",
    };
    setScenes([...scenes, newScene]);
  };

  // 프로젝트 저장 핸들러
  const handleSaveProject = () => {
    const projectData: ProjectData = {
      id: currentProjectId || `project-${Date.now()}`,
      name: topic || '제목 없는 프로젝트',
      topic,
      videoLength,
      videoTone,
      scriptBlocks,
      scenes,
      selectedVoice,
      selectedMotion,
      selectedBgm,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    if (saveProject(projectData)) {
      setCurrentProjectId(projectData.id);
      setSavedProjects(getProjects());
      alert('프로젝트가 저장되었습니다!');
    }
  };

  // 템플릿 적용 핸들러
  const applyTemplate = (template: typeof VIDEO_TEMPLATES[0]) => {
    setTopic(template.topic);
    setVideoLength(template.videoLength);
    setVideoTone(template.videoTone);
    setShowTemplatesModal(false);
    alert(`${template.name} 템플릿이 적용되었습니다!`);
  };

  // 개별 샷 재산출 (4단계 - fal.ai)
  const handleReanimateShot = async (sceneId: string) => {
    const sceneIndex = scenes.findIndex(s => s.id === sceneId);
    if (sceneIndex === -1) return;

    setMotionError(null);

    // 상태 업데이트: processing
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'processing' } : s));

    try {
        let imageData = scenes[sceneIndex].imageUrl;
        if (!imageData.startsWith('data:')) {
            try {
                imageData = await imageToDataUrl(imageData);
            } catch (err) {
                console.error("Image conversion failed", err);
                throw new Error("이미지 변환 실패");
            }
        }

        const videoUrl = await generateVideoWithPolling({
            imageData: imageData,
            prompt: scenes[sceneIndex].prompt,
            motionType: scenes[sceneIndex].motionType || 'auto',
            duration: '5',
            aspectRatio: videoLength === 'shorts' ? '9:16' : '16:9',
            provider: videoProvider
        });

        // 성공 업데이트
        setScenes(prev => prev.map(s => s.id === sceneId ? {
            ...s,
            videoClipUrl: videoUrl,
            status: 'completed'
        } : s));
        setMotionError(null);

    } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.warn("Re-animate API failed:", errorMsg);
        setMotionError(`영상 재생성 실패: ${errorMsg}`);
        // 실패 시 완료 상태로 복구 (CSS fallback 사용)
        setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'completed' } : s));
    }
  };

  // Provider 이름 가져오기
  const getProviderDisplayName = () => {
    switch (videoProvider) {
      case 'kling': return 'Kling v1.6 Pro';
      case 'kling-standard': return 'Kling v1.6 Standard';
      case 'veo': return 'Google Veo';
      case 'sora': return 'OpenAI Sora';
      default: return 'Kling';
    }
  };

  // TTS 음성 생성 핸들러
  const handleGenerateTTS = async () => {
    if (!selectedVoice) {
      setTtsError('음성을 선택해주세요.');
      return;
    }

    const scenesWithScript = scenes.filter(s => s.script && s.script.trim().length > 0);
    if (scenesWithScript.length === 0) {
      setTtsError('스크립트가 있는 장면이 없습니다.');
      return;
    }

    setIsGeneratingTTS(true);
    setTtsError(null);
    setTtsProgress(0);

    try {
      const result = await generateBatchTTS({
        scenes: scenesWithScript.map(s => ({
          id: s.id,
          text: s.script
        })),
        voice: selectedVoice.id,
        speed: voiceSpeed
      });

      // 결과를 장면에 반영
      let updatedScenes = scenes.map(scene => {
        const ttsResult = result.results.find(r => r.sceneId === scene.id);
        if (ttsResult?.success && ttsResult.audioUrl) {
          return { ...scene, audioUrl: ttsResult.audioUrl };
        }
        return scene;
      });

      setScenes(updatedScenes);
      setTtsProgress(80);

      // Whisper 자동 전사 → 자막 세그먼트 자동 생성
      const successScenes = result.results.filter(r => r.success && r.audioUrl);
      if (successScenes.length > 0) {
        setTtsError(`🎤 음성 완료! 자막 싱크 분석 중... (0/${successScenes.length})`);
        let transcribed = 0;
        for (const r of successScenes) {
          try {
            const transcription = await transcribeAudio(r.audioUrl!);
            if (transcription.success && transcription.segments.length > 0) {
              updatedScenes = updatedScenes.map(s => {
                if (s.id !== r.sceneId) return s;
                return {
                  ...s,
                  subtitleSegments: transcription.segments.map((seg, i) => ({
                    id: `${s.id}-wseg-${i}`,
                    text: seg.text,
                    startTime: Math.round(seg.startTime * 10) / 10,
                    endTime: Math.round(seg.endTime * 10) / 10,
                  }))
                };
              });
              setScenes([...updatedScenes]);
            }
          } catch (err) {
            console.error(`Whisper failed for scene ${r.sceneId}:`, err);
          }
          transcribed++;
          setTtsError(`🎤 음성 완료! 자막 싱크 분석 중... (${transcribed}/${successScenes.length})`);
        }
      }

      setTtsProgress(100);

      // 완료 메시지
      if (result.successCount === result.totalCount) {
        setTtsError(`✅ 음성 생성 및 자막 싱크 완료! (${result.totalCount}개 장면)`);
      } else if (result.successCount < result.totalCount) {
        setTtsError(`${result.totalCount}개 중 ${result.successCount}개 장면의 음성이 생성되었습니다.`);
      }

    } catch (error) {
      console.error('TTS generation failed:', error);
      setTtsError(error instanceof Error ? error.message : 'TTS 생성 실패');
    } finally {
      setIsGeneratingTTS(false);
    }
  };

  // 최종 렌더링 및 다운로드
   const handleFinalRender = async () => {
    setIsRendering(true);
    setRenderError(null);
    setRenderProgress(0);
    setLoadingMessage("최종 영상을 병합하고 자막을 합성하고 있습니다...");

    try {
      setLoadingMessage("서버에서 최종 영상을 렌더링하고 있습니다... (시간이 걸릴 수 있습니다)");
      
      // 1. SRT 자막 생성
      let srtContent = '';
      let srtIndex = 1;
      let currentTime = 0;

      const formatSrtTime = (seconds: number) => {
          const date = new Date(0);
          date.setMilliseconds(seconds * 1000);
          return date.toISOString().substr(11, 12).replace('.', ',');
      };

      const renderScenes = scenes.map(scene => {
          let duration = 5;
          if (scene.duration) {
             if (scene.duration.includes(':')) {
                 const p = scene.duration.split(':').map(Number);
                 duration = (p[0] || 0) * 60 + (p[1] || 0);
             } else {
                 duration = parseFloat(scene.duration.replace('s', '')) || 5;
             }
          }

          // SRT Generate per scene
          if (scene.subtitleSegments && scene.subtitleSegments.length > 0) {
              scene.subtitleSegments.forEach((seg: any) => {
                  const start = currentTime + (seg.startTime || 0);
                  const end = currentTime + (seg.endTime || duration);
                  srtContent += `${srtIndex++}\n${formatSrtTime(start)} --> ${formatSrtTime(end)}\n${seg.text}\n\n`;
              });
          } else if (scene.script) {
              srtContent += `${srtIndex++}\n${formatSrtTime(currentTime)} --> ${formatSrtTime(currentTime + duration)}\n${scene.script}\n\n`;
          }

          currentTime += duration;

          return {
              id: scene.id,
              videoUrl: scene.videoClipUrl,
              audioUrl: scene.audioUrl,
              durationSec: duration
          };
      });

      // 2. 서버로 렌더링 요청
      const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
      
      // Determine resolution based on videoLength state
      // shorts: 1080x1920, otherwise 1920x1080 or custom?
      // Assuming 'shorts' = 9:16 (1080x1920), else 16:9 (1920x1080)
      const isShorts = videoLength === 'shorts';
      const width = isShorts ? 1080 : 1920;
      const height = isShorts ? 1920 : 1080;

      const renderRes = await fetch(`${API_BASE_URL}/api/video/render`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              scenes: renderScenes,
              srtContent,
              width,
              height
          })
      });

      if (!renderRes.ok) {
          const errData = await renderRes.json();
          throw new Error(errData.error || '렌더링 요청 실패');
      }

      const renderResult = await renderRes.json();
      
      setRenderProgress(100);
      setRenderError('✅ 전체 영상 렌더링 완료! 자동 다운로드됩니다.');

      // 3. 다운로드 트리거
      if (renderResult.videoUrl) {
          // If URL is relative, prepend API URL if needed, or if it's served statically
          // renderController returns /uploads/..., if frontend and backend are same origin or proxied it works.
          // If distinct, prepend VITE_API_URL
          const downloadUrl = renderResult.videoUrl.startsWith('http') ? renderResult.videoUrl : `${API_BASE_URL}${renderResult.videoUrl}`;
          
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `VidAI_Final_${Date.now()}.mp4`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
      }

    } catch (error) {
      console.error('Render failed:', error);
      setRenderError(error instanceof Error ? error.message : '렌더링 실패');
    } finally {
      setIsRendering(false);
    }
  };


  const renderMotionStep = () => {
    const currentScene = scenes.find(s => s.id === selectedSceneId) || scenes[0];
    
    if (!currentScene) {
         return (
             <div className="flex h-screen items-center justify-center text-white flex-col gap-4 bg-[#0a0618]">
                 <p className="text-xl font-bold">생성된 장면이 없습니다.</p>
                 <button 
                    onClick={() => setStep(CreationStep.CUT_SELECTION)}
                    className="px-4 py-2 bg-primary rounded-lg text-white font-bold"
                 >
                    이전 단계로 돌아가기
                 </button>
             </div>
         );
    }
    
    const isVideo = !!(currentScene.videoClipUrl && currentScene.videoClipUrl.length > 50);

    return (
      <main className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#0a0618]">
        {/* Top Bar (Progress) */}
        <div className="h-14 border-b border-[#292348] flex items-center justify-between px-6 bg-[#131022]">
          <div className="flex items-center gap-4">
             <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">animation</span>
                모션 생성 및 편집 ({getProviderDisplayName()})
             </h2>
             <div className="h-4 w-px bg-[#292348]"></div>
             <span className="text-xs font-medium text-white/50 hidden md:inline">Shot 단위로 모션을 확인하고, 원하는 장면만 재생성(Re-animate)해보세요.</span>
          </div>
          
          <button
            onClick={() => setStep(CreationStep.AUDIO_STYLE)}
            className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold text-sm shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
          >
            <span>Voice & Audio (Next)</span>
            <span className="material-symbols-outlined">graphic_eq</span>
          </button>
        </div>

        {/* 3-Column Layout */}
        <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr_320px]">
          
          {/* Left: Shot List */}
          <div className="border-r border-[#292348] bg-[#1a162e]/50 overflow-y-auto custom-scrollbar">
             <div className="p-4 space-y-2">
                <button
                   onClick={handleGenerateMotions}
                   disabled={isGeneratingVideo}
                   className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all mb-4 ${
                     isGeneratingVideo 
                        ? 'bg-[#292348] text-white/50 cursor-not-allowed'
                        : scenes.some(s => !s.videoClipUrl)
                           ? 'bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg hover:shadow-primary/30 hover:scale-[1.02]' 
                           : 'bg-[#292348] text-white/50 hover:bg-[#3b3267] hover:text-white'
                   }`}
                >
                   {isGeneratingVideo ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                        <span>생성 중...</span>
                      </>
                   ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px]">movie_filter</span>
                        <span>모든 장면 영상 생성</span>
                      </>
                   )}
                </button>
                {scenes.map((scene, idx) => (
                   <div 
                     key={scene.id}
                     onClick={() => setSelectedSceneId(scene.id)}
                     className={`p-3 rounded-xl border cursor-pointer transition-all flex gap-3 ${
                        (currentScene.id === scene.id) 
                           ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(55,19,236,0.1)]' 
                           : 'bg-[#131022] border-[#292348] hover:border-white/20'
                     }`}
                   >
                      <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-black flex-shrink-0 border border-white/10 group">
                         <img src={scene.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                         {/* Video Indicator */}
                         {scene.videoClipUrl && scene.videoClipUrl.length > 50 ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                               <span className="material-symbols-outlined text-white text-lg drop-shadow-md">videocam</span>
                            </div>
                         ) : (
                            <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-black/50 ${scene.status === 'processing' ? 'bg-blue-500 animate-bounce' : 'bg-yellow-500'}`}></div>
                         )}
                         <span className="absolute bottom-0.5 left-1 text-[9px] font-bold text-white drop-shadow-md">#{idx+1}</span>
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                         <div className="flex justify-between items-center mb-0.5">
                            <span className={`text-xs font-bold ${(currentScene.id === scene.id) ? 'text-white' : 'text-white/70'}`}>Shot {idx+1}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#292348] text-white/70">{scene.duration}</span>
                         </div>
                         <p className="text-[10px] text-white/40 line-clamp-1 truncate">
                            {scene.script}
                         </p>
                      </div>
                   </div>
                ))}
             </div>
          </div>

          {/* Center: Preview */}
          <div className="bg-black relative flex flex-col min-h-0">
             <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[url('/grid.svg')] bg-center relative overflow-hidden group/preview select-none min-h-0">
                {/* Background Blur */}
                 <div
                    className="absolute inset-0 bg-cover bg-center opacity-20 blur-3xl scale-150 pointer-events-none"
                    style={{ backgroundImage: `url(${currentScene.imageUrl})` }}
                 ></div>

                 {/* Main Video/Image Display */}
                 <div
                    className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-black flex-shrink"
                    style={{
                        aspectRatio: videoLength === 'shorts' ? '9/16' : '16/9',
                        maxHeight: 'calc(100% - 80px)',
                        maxWidth: '90%',
                    }}
                 >
                    {isVideo ? (
                       <video
                          key={currentScene.videoClipUrl}
                          src={currentScene.videoClipUrl}
                          autoPlay loop playsInline controls
                          crossOrigin="anonymous"
                          className="w-full h-full object-contain"
                          onError={(e) => console.error('Video load error:', e)}
                       />
                    ) : (
                       // API 미지원/실패/로딩 중일 때: CSS Fallback
                       <div className="w-full h-full relative overflow-hidden">
                          <img 
                            key={currentScene.id} 
                            src={currentScene.imageUrl} 
                            className={`w-full h-full object-cover transition-transform duration-[8s] ease-linear ${
                               currentScene.status === 'processing' ? 'scale-100 blur-sm brightness-50' :
                               currentScene.motionType === 'zoom_in' ? 'scale-125' :
                               currentScene.motionType === 'zoom_out' ? 'scale-100 origin-center' :
                               currentScene.motionType === 'pan_left' ? 'scale-110 translate-x-[-10%]' :
                               currentScene.motionType === 'pan_right' ? 'scale-110 translate-x-[10%]' :
                               'scale-105'
                            }`}
                            style={{ 
                               transform: currentScene.motionType === 'static' ? 'none' : undefined,
                               transitionProperty: 'transform'
                            }}
                          />
                          
                          {/* Processing Overlay */}
                          {currentScene.status === 'processing' && (
                             <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-black/40 backdrop-blur-sm">
                                <div className="w-10 h-10 border-4 border-primary border-t-white rounded-full animate-spin"></div>
                                <span className="text-sm font-bold text-white animate-pulse">{getProviderDisplayName()} 영상 생성 중...</span>
                             </div>
                          )}
                       </div>
                    )}
                 </div>
                 
                 {/* Script Text Below Video */}
                 <div className="mt-4 bg-[#1a162e] border border-[#292348] rounded-lg px-6 py-3 max-w-2xl">
                   <p className="text-white text-sm leading-relaxed text-center">
                     {currentScene.script}
                   </p>
                 </div>
             </div>
          </div>

          {/* Right: Motion Controls */}
          <div className="border-l border-[#292348] bg-[#1a162e]/30 px-6 py-8 flex flex-col h-full overflow-y-auto custom-scrollbar">
             <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-8 flex items-center gap-2 border-b border-[#292348] pb-4">
                <span className="material-symbols-outlined text-primary">tune</span>
                Motion Settings
             </h3>
             
             <div className="space-y-8">
                {/* Motion Type Section */}
                <div>
                   <div className="flex justify-between items-baseline mb-3">
                      <label className="text-xs text-[#9b92c9] font-bold">Motion Type</label>
                      <span className="text-[10px] text-white/30">현재 샷 적용</span>
                   </div>
                   <div className="grid grid-cols-2 gap-2.5">
                      {['Auto', 'Zoom In', 'Zoom Out', 'Pan Left', 'Pan Right', 'Static'].map(type => {
                         const typeKey = type.toLowerCase().replace(' ', '_');
                         const isSelected = (currentScene.motionType || 'auto') === typeKey;
                         
                         return (
                           <button
                              key={type}
                              onClick={() => {
                                 // 상태만 변경 (실제 재요청은 Re-animate 버튼으로)
                                 const newScenes = scenes.map(s => s.id === currentScene.id ? {...s, motionType: typeKey} : s);
                                 setScenes(newScenes);
                              }}
                              disabled={currentScene.status === 'processing'}
                              className={`px-3 py-2.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                                 isSelected
                                    ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20 scale-[1.02]'
                                    : 'bg-[#0d0a1a] border-[#292348] text-white/60 hover:border-white/30 hover:bg-[#292348]'
                              }`}
                           >
                              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white"></span>}
                              {type}
                           </button>
                         );
                      })}
                   </div>
                </div>

                {/* Re-animate Action */}
                <div className="p-1 rounded-2xl bg-gradient-to-br from-white/5 to-white/0 border border-white/5">
                    <button
                       onClick={() => handleReanimateShot(currentScene.id)}
                       disabled={currentScene.status === 'processing'}
                       className="w-full py-4 bg-gradient-to-r from-primary to-[#5b2fff] hover:to-[#6b4fff] rounded-xl font-bold text-white shadow-xl shadow-primary/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
                    >
                       {currentScene.status === 'processing' ? (
                          <>
                             <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                             <span>Generating...</span>
                          </>
                       ) : (
                          <>
                             <span className="material-symbols-outlined">restart_alt</span>
                             <span>Re-animate ({getProviderDisplayName()})</span>
                          </>
                       )}
                    </button>
                    <p className="text-[10px] text-center text-white/30 mt-3 font-medium">
                       * {getProviderDisplayName()} 모델 호출 (크레딧 소모)
                    </p>
                </div>

                {/* Download Button */}
                {isVideo && currentScene.videoClipUrl && (
                   <div className="p-1 rounded-xl bg-gradient-to-br from-green-500/10 to-green-500/0 border border-green-500/20">
                      <a
                         href={currentScene.videoClipUrl}
                         download={`shot_${scenes.findIndex(s => s.id === currentScene.id) + 1}.mp4`}
                         target="_blank"
                         rel="noopener noreferrer"
                         className="w-full py-3 bg-green-600 hover:bg-green-500 rounded-lg font-bold text-white shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                         <span className="material-symbols-outlined text-sm">download</span>
                         <span>Download Video</span>
                      </a>
                   </div>
                )}

                {/* Error Message */}
                {motionError && (
                   <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                      <p className="text-red-400 text-xs whitespace-pre-line">{motionError}</p>
                      <button
                         onClick={() => setMotionError(null)}
                         className="text-red-400/60 text-xs mt-2 hover:text-red-400"
                      >
                         닫기
                      </button>
                   </div>
                )}
             </div>
          </div>

        </div>
      </main>
    );
  };

  const renderTopNav = () => {
    const currentIdx = PROCESS_STEPS.findIndex(s => s.step === step);
    const maxIdx = PROCESS_STEPS.findIndex(s => s.step === maxReachedStep);

    return (
      <header className="h-16 border-b border-solid border-[#292348] px-6 lg:px-10 flex items-center justify-between bg-background-dark/80 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4 text-white min-w-[200px]" onClick={() => setStep(CreationStep.TOPIC)}>
          <div className="size-6 text-primary cursor-pointer">
            <svg fill="none" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
              <path clipRule="evenodd" d="M24 18.4228L42 11.475V34.3663C42 34.7796 41.7457 35.1504 41.3601 35.2992L24 42V18.4228Z" fill="currentColor" fillRule="evenodd"></path>
              <path clipRule="evenodd" d="M24 8.18819L33.4123 11.574L24 15.2071L14.5877 11.574L24 8.18819ZM9 15.8487L21 20.4805V37.6263L9 32.9945V15.8487ZM27 37.6263V20.4805L39 15.8487V32.9945L27 37.6263ZM25.354 2.29885C24.4788 1.98402 23.5212 1.98402 22.646 2.29885L4.98454 8.65208C3.7939 9.08038 3 10.2097 3 11.475V34.3663C3 36.0196 4.01719 37.5026 5.55962 38.098L22.9197 44.7987C23.6149 45.0671 24.3851 45.0671 25.0803 44.7987L42.4404 38.098C43.9828 37.5026 45 36.0196 45 34.3663V11.475C45 10.2097 44.2061 9.08038 43.0155 8.65208L25.354 2.29885Z" fill="currentColor" fillRule="evenodd"></path>
            </svg>
          </div>
          <h2 className="text-white text-lg font-bold font-display tracking-tight cursor-pointer hidden md:block">AI 비디오 크리에이터</h2>
        </div>

        <div className="flex-1"></div>

        <div className="flex justify-end gap-2 items-center">
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 text-xs font-medium transition-all">
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span className="hidden sm:inline">프로젝트 내역</span>
          </button>
          <button onClick={() => setIsAdminModalOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-primary hover:bg-primary/10 text-xs font-bold transition-all">
            <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
            <span className="hidden sm:inline">관리자</span>
          </button>
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 text-xs font-medium transition-all">
            <span className="material-symbols-outlined text-[16px]">layers</span>
            <span className="hidden sm:inline">템플릿</span>
          </button>
          <div className="w-px h-5 bg-border-dark mx-1"></div>
          <button onClick={handleSaveProject} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/20 border border-primary hover:bg-primary/30 text-white text-xs font-bold transition-all" title="프로젝트 저장">
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span className="hidden sm:inline">저장</span>
          </button>
          <div className="bg-center bg-no-repeat aspect-square bg-cover rounded-full size-8 border border-[#292348] cursor-pointer hover:border-primary transition-colors ml-1" style={{ backgroundImage: 'url("https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_1280.png")' }} />
        </div>
      </header>
    );
  };

  const SIDEBAR_STEPS = [
    { step: CreationStep.TOPIC, label: '기획', icon: 'edit_note' },
    { step: CreationStep.SCRIPT, label: '구성', icon: 'view_timeline' },
    { step: CreationStep.CUT_SELECTION, label: '이미지', icon: 'image' },
    { step: CreationStep.MOTION, label: '영상', icon: 'movie_filter' },
    { step: CreationStep.AUDIO_STYLE, label: '오디오', icon: 'graphic_eq' },
    { step: CreationStep.SUBTITLE, label: '자막편집', icon: 'subtitles' },
    { step: CreationStep.FINAL, label: '완료', icon: 'movie' },
  ];

  const renderSidebar = () => {
    const currentIndex = SIDEBAR_STEPS.findIndex(s => s.step === step);

    return (
      <div className="w-64 h-full border-r border-border-dark flex flex-col bg-[#0a0618] shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 p-5 border-b border-border-dark">
          <div className="w-9 h-9 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
            <span className="material-symbols-outlined text-white text-xl font-bold">
              movie_filter
            </span>
          </div>
          <h1 className="text-lg font-bold font-display tracking-tight text-white">
            VidAI Pro
          </h1>
        </div>

        {/* Progress */}
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider">진행 단계</span>
            <span className="text-[10px] font-bold text-primary">{currentIndex + 1}/{SIDEBAR_STEPS.length}</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-500 rounded-full"
              style={{ width: `${((currentIndex + 1) / SIDEBAR_STEPS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Step Navigation */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {SIDEBAR_STEPS.map((s, index) => {
            const isActive = s.step === step;
            const isCompleted = index < currentIndex;

            return (
              <button
                key={s.step}
                onClick={() => setStep(s.step)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all group relative ${
                  isActive
                    ? 'bg-primary/15 text-white'
                    : isCompleted
                    ? 'text-white/70 hover:bg-white/5'
                    : 'text-white/30 hover:bg-white/5 hover:text-white/50'
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : isCompleted
                    ? 'bg-primary/20 text-primary'
                    : 'bg-white/5 text-white/30 group-hover:bg-white/10'
                }`}>
                  {isCompleted ? (
                    <span className="material-symbols-outlined text-[16px]">check</span>
                  ) : (
                    <span className="material-symbols-outlined text-[16px]">{s.icon}</span>
                  )}
                </div>
                <span className={`text-sm font-bold ${isActive ? 'text-white' : ''}`}>{s.label}</span>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="p-4 border-t border-border-dark flex flex-col gap-2">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
              !isDarkMode 
                ? 'bg-primary/10 text-primary' 
                : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">
              {isDarkMode ? 'light_mode' : 'dark_mode'}
            </span>
            <span className="text-sm font-bold">
              {isDarkMode ? '밝게 보기' : '어둡게 보기'}
            </span>
          </button>

          <button
            onClick={() => {
              // 로그아웃 로직
              alert("로그아웃 되었습니다.");
            }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/40 hover:bg-red-500/10 hover:text-red-500 transition-all font-medium"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            <span className="text-sm">로그아웃</span>
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (step) {
      case CreationStep.TOPIC:
        return (
          <main className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#0a0618]">
            {/* Top Bar */}
            <div className="h-14 border-b border-[#292348] flex items-center justify-between px-6 bg-[#131022] shrink-0">
              <div className="flex items-center gap-4">
                <h2 className="text-white font-bold text-lg flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">lightbulb</span>
                  1단계: 주제 및 설정
                </h2>
                <div className="h-4 w-px bg-[#292348]"></div>
                <span className="text-xs font-medium text-white/50 hidden md:inline">영상의 주제를 입력하고 기본 설정을 구성하세요.</span>
              </div>
              <button
                onClick={handleSaveProject}
                className="px-4 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary hover:text-white border border-primary/50 hover:border-primary rounded-lg font-bold text-xs transition-all flex items-center gap-1"
              >
                <span className="material-symbols-outlined !text-base">save</span>
                프로젝트 저장
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 lg:p-8 flex flex-col items-center">
              <div className="max-w-5xl mx-auto w-full">
                {/* Input Mode Switcher - Compact */}
                <div className="flex justify-center mb-6">
                  <div className="bg-[#1a1630] border border-border-dark p-1 rounded-xl flex gap-1 shadow-lg shadow-black/20">
                    <button
                      onClick={() => setInputMode('auto')}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 ${inputMode === 'auto' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
                    >
                      <span className="material-symbols-outlined text-sm">auto_awesome</span>
                      AI 자동 생성
                    </button>
                    <button
                      onClick={() => setInputMode('manual')}
                      className={`px-4 py-2 rounded-lg font-bold text-sm transition-all flex items-center gap-1.5 ${inputMode === 'manual' ? 'bg-primary text-white shadow-md' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
                    >
                      <span className="material-symbols-outlined text-sm">edit_note</span>
                      직접 입력
                    </button>
                  </div>
                </div>

                <div className="bg-[#1a1630]/50 p-6 rounded-2xl border border-border-dark backdrop-blur-sm">
                  {inputMode === 'auto' ? (
                    <div className="flex flex-col lg:flex-row gap-6">
                      {/* Left Column: Options */}
                      <div className="w-full lg:w-1/3 space-y-5">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/70 flex items-center gap-1.5 uppercase tracking-wide">
                            <span className="material-symbols-outlined text-primary text-base">language</span>
                            언어 선택
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {LANGUAGES.map(lang => (
                              <button
                                key={lang.code}
                                onClick={() => setTargetLanguage(lang.code)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all truncate ${targetLanguage === lang.code ? 'bg-primary/20 border-primary text-primary' : 'bg-[#0d0a1a] border-border-dark text-text-muted hover:border-white/30'}`}
                              >
                                {lang.label}
                              </button>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-white/70 flex items-center gap-1.5 uppercase tracking-wide">
                            <span className="material-symbols-outlined text-primary text-base">schedule</span>
                            영상 길이
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {DURATIONS.map(dur => (
                              <button
                                key={dur.code}
                                onClick={() => setTargetDuration(dur.code)}
                                className={`px-3 py-2 rounded-lg text-xs font-bold border transition-all truncate ${targetDuration === dur.code ? 'bg-primary/20 border-primary text-primary' : 'bg-[#0d0a1a] border-border-dark text-text-muted hover:border-white/30'}`}
                              >
                                {dur.label}
                              </button>
                            ))}
                            {targetDuration === 'custom' && (
                              <div className="col-span-2 mt-1 animate-in fade-in slide-in-from-top-1">
                                 <div className="relative">
                                   <input 
                                     type="text" 
                                     value={customDuration}
                                     onChange={(e) => setCustomDuration(e.target.value)}
                                     placeholder="예: 45초, 10분"
                                     className="w-full bg-[#0d0a1a] border border-[#292348] rounded-lg px-3 py-2 text-xs text-white focus:border-primary outline-none focus:ring-1 focus:ring-primary transition-all shadow-inner"
                                   />
                                 </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Topic Input */}
                      <div className="w-full lg:w-2/3 flex flex-col gap-4">
                        <div className="flex-1 flex flex-col gap-2">
                          <label className="text-xs font-bold text-white/70 flex items-center gap-1.5 uppercase tracking-wide">
                            <span className="material-symbols-outlined text-primary text-base">edit</span>
                            영상 주제
                          </label>
                          <div className="relative flex-1 min-h-[180px] group">
                            <textarea
                              value={topic}
                              onChange={(e) => setTopic(e.target.value.slice(0, 500))}
                              placeholder="예: 화성 탐사의 비밀스러운 역사와 향후 10년 내에 발견될 수 있는 것들에 대해..."
                              className="w-full h-full min-h-[180px] bg-[#0d0a1a] border-border-dark border rounded-xl p-4 text-sm leading-relaxed focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none text-white placeholder:text-white/20 shadow-inner group-hover:border-white/20"
                            />
                            <div className="absolute bottom-3 right-3 text-[10px] text-text-muted font-medium bg-[#0d0a1a] px-1.5 py-0.5 rounded border border-white/5">
                              {topic.length} / 500
                            </div>
                          </div>
                        </div>

                        {/* Generate Button positioned with input */}
                        <button
                          onClick={handleGenerateScript}
                          disabled={!topic.trim() || isLoading}
                          className="w-full h-12 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-primary/20 transition-all active:scale-95 group"
                        >
                          {isLoading ? (
                            <>
                              <span className="animate-spin material-symbols-outlined text-lg">sync</span>
                              <span>분석 중...</span>
                            </>
                          ) : (
                            <>
                              <span>대본 및 구성 생성하기</span>
                              <span className="material-symbols-outlined filled text-lg group-hover:scale-110 transition-transform">bolt</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 직접 입력 영역 - Compact */
                    <div className="flex flex-col gap-4 h-full">
                      <div className="flex-1 flex flex-col gap-2 min-h-[300px]">
                        <label className="text-xs font-bold text-white/70 flex items-center gap-1.5 uppercase tracking-wide">
                          <span className="material-symbols-outlined text-primary text-base">description</span>
                          대본 내용
                        </label>
                        <div className="relative flex-1 group">
                          <textarea
                            value={manualScript}
                            onChange={(e) => setManualScript(e.target.value)}
                            placeholder="영상 대본을 여기에 붙여넣으세요..."
                            className="w-full h-full bg-[#0d0a1a] border-border-dark border rounded-xl p-4 text-sm leading-relaxed focus:ring-1 focus:ring-primary focus:border-primary transition-all resize-none text-white placeholder:text-white/20 shadow-inner group-hover:border-white/20"
                          />
                          <div className="absolute bottom-3 right-3 text-[10px] text-text-muted font-medium bg-[#0d0a1a] px-1.5 py-0.5 rounded border border-white/5">
                            {manualScript.length}자
                          </div>
                        </div>
                      </div>
                      
                      <button
                        onClick={handleGenerateScript}
                        disabled={!manualScript.trim() || isLoading}
                        className="w-full h-12 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl flex items-center justify-center gap-2 font-bold text-sm shadow-lg shadow-primary/20 transition-all active:scale-95 group"
                      >
                        {isLoading ? (
                          <>
                            <span className="animate-spin material-symbols-outlined text-lg">sync</span>
                            <span>분석 중...</span>
                          </>
                        ) : (
                          <>
                            <span>대본 분석 및 구조화</span>
                            <span className="material-symbols-outlined filled text-lg group-hover:scale-110 transition-transform">bolt</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {!isLoading && (
                     <p className="text-[10px] text-center text-white/30 mt-3 font-medium">
                       AI가 텍스트를 분석하여 최적의 영상 구조를 제안합니다.
                     </p>
                  )}

                  {shots.length > 0 && !scriptPreview && !isLoading && (
                     <div className="mt-6 pt-6 border-t border-[#292348] animate-in fade-in slide-in-from-top-2">
                        <div className="bg-[#1a162e] border border-primary/30 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                           <div className="flex items-center gap-3">
                              <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                                 <span className="material-symbols-outlined text-primary">history_edu</span>
                              </div>
                              <div className="text-center md:text-left">
                                 <p className="text-white text-sm font-bold">작성 중인 구성안이 있습니다.</p>
                                 <p className="text-[#9b92c9] text-xs mt-0.5">
                                    총 {shots.length}개 장면 / {shots.reduce((acc,s) => acc + (s.content || "").length, 0)}자
                                 </p>
                              </div>
                           </div>
                           <button
                              onClick={() => setStep(CreationStep.SCRIPT)}
                              className="w-full md:w-auto px-5 py-2.5 bg-white text-black hover:bg-white/90 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-white/5"
                           >
                              <span>구성(장면 설계) 계속하기</span>
                              <span className="material-symbols-outlined text-base">arrow_forward</span>
                           </button>
                        </div>
                     </div>
                  )}
                </div>

                {/* 생성된 대본 미리보기 영역 */}
                {scriptPreview && (
                  <div className="mt-8 border-t border-border-dark pt-6 animate-in fade-in slide-in-from-bottom-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                           <span className="material-symbols-outlined text-primary text-base">article</span>
                           생성된 대본 미리보기
                        </h3>
                        <p className="text-text-muted text-xs max-w-2xl line-clamp-1">{scriptPreview.synopsis}</p>
                      </div>
                      <div className="text-xs text-black bg-primary font-bold px-2.5 py-0.5 rounded-full shadow-lg shadow-primary/20">
                        총 {scriptPreview.shots.length}개 장면
                      </div>
                    </div>

                    <div className="bg-[#0d0a1a] border border-[#292348] rounded-xl p-6 custom-scrollbar max-h-[400px] overflow-y-auto">
                      <div className="space-y-4 text-center">
                        {scriptPreview.shots.map((shot, idx) => (
                           <p key={idx} className="text-white/90 text-sm leading-8 font-medium whitespace-pre-line">
                              {shot.content}
                           </p>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-3 justify-center">
                      <button
                        onClick={() => { setScriptPreview(null); handleGenerateScript(); }}
                        disabled={isLoading}
                        className="px-6 py-3 bg-white/5 border border-[#292348] hover:border-primary/50 text-white rounded-xl font-bold transition-all hover:bg-white/10 flex items-center gap-2 disabled:opacity-50 text-xs"
                      >
                        <span className="material-symbols-outlined text-sm">refresh</span>
                        다시 생성
                      </button>
                      <button
                        onClick={handleConfirmPreview}
                        className="px-8 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-2 text-xs hover:scale-105 active:scale-95"
                      >
                        <span>대본 확정하기</span>
                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        );

      case CreationStep.SCRIPT:
        const totalCharCount = shots.reduce((acc, shot) => acc + shot.content.length, 0);
        const estimatedDurationSec = Math.ceil(totalCharCount * 0.25) + (shots.length * 1);
        const estMin = Math.floor(estimatedDurationSec / 60);
        const estSec = estimatedDurationSec % 60;
        const estimatedCredit = 50 + (shots.length * 2);

        return (
          <main className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#0a0618]">
            {/* Header */}
            <div className="h-16 border-b border-[#292348] flex items-center justify-between px-6 bg-[#131022] shrink-0">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">view_timeline</span>
                  </div>
                  <div>
                    <h3 className="text-white text-sm font-bold uppercase tracking-wider">2단계: 구성 및 스타일</h3>
                    <p className="text-[#9b92c9] text-[10px]">영상의 컷별 대본과 시각적 스타일을 확정합니다.</p>
                  </div>
                </div>
                <div className="hidden lg:flex flex-col gap-1 w-48">
                  <div className="flex justify-between text-[10px] text-primary font-bold">
                    <span>전체 진행도</span>
                    <span>20%</span>
                  </div>
                  <div className="h-1.5 bg-[#3b3267] rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: "20%" }}></div>
                  </div>
                </div>
              </div>
              <button
                onClick={handleConfirmShots}
                disabled={isLoading}
                className="px-8 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold text-sm shadow-xl shadow-primary/20 flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                {isLoading ? <span className="animate-spin material-symbols-outlined text-sm">sync</span> : null}
                <span>이미지 생성 시작</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>

            <div className="flex-1 overflow-hidden p-6">
              <div className="max-w-[1600px] mx-auto h-full flex gap-6">
                {/* Main Content: Shot List */}
                <div className="flex-1 overflow-y-auto pr-4 custom-scrollbar h-full">
                 {/* Synopsis Panel */}
                 <div className="bg-[#1a162e] border border-[#292348] rounded-xl p-4 mb-4 shadow-sm">
                   <div className="flex items-center gap-2 mb-3">
                     <span className="material-symbols-outlined text-primary text-sm">description</span>
                     <h4 className="text-white text-xs font-bold">Synopsis 요약</h4>
                   </div>
                   <textarea
                     value={synopsis}
                     onChange={(e) => setSynopsis(e.target.value)}
                     className="w-full bg-[#0d0a1a] border border-[#292348] rounded-xl p-3 text-white/80 text-xs leading-relaxed focus:border-primary transition-all resize-none shadow-inner"
                     rows={2}
                   />
                 </div>

                 {/* Shot Timeline */}
                 <div className="relative pl-6 border-l border-[#292348] space-y-4 mb-10">
                   {shots.map((shot, idx) => (
                     <div key={shot.id} className="relative group">
                       <div className="absolute -left-[29px] top-6 w-3 h-3 rounded-full bg-[#3b3267] border-2 border-[#0d0a1a] group-hover:bg-primary transition-colors"></div>
                       <div className="bg-[#1a162e] border border-[#292348] rounded-xl p-4 hover:border-primary/40 transition-all shadow-sm">
                         <div className="flex items-start gap-4">
                           <div className="flex flex-col items-center min-w-[40px] pt-1">
                             <span className="text-[#9b92c9] text-[9px] font-bold uppercase tracking-tighter">Shot</span>
                             <span className="text-white text-xl font-black font-display leading-none">{idx + 1}</span>
                           </div>
                           <div className="flex-1 space-y-3">
                             {/* Audio Script (음성) */}
                             <div className="space-y-1">
                               <div className="flex items-center gap-1.5 ml-1">
                                 <span className="material-symbols-outlined text-[10px] text-blue-400">mic</span>
                                 <label className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Audio (내레이션)</label>
                               </div>
                               <textarea
                                 value={shot.content}
                                 onChange={(e) => updateShot(shot.id, 'content', e.target.value)}
                                 className="w-full bg-[#0d0a1a] border border-blue-900/30 rounded-lg p-3 text-white text-sm leading-relaxed focus:border-blue-500 transition-all resize-none placeholder:text-white/20"
                                 rows={2}
                                 placeholder="성우가 읽을 대사를 입력하세요..."
                               />
                             </div>

                             {/* Visual Prompt (화면) */}
                             <div className="space-y-1 relative">
                               <div className="flex items-center gap-1.5 ml-1">
                                 <span className="material-symbols-outlined text-[10px] text-orange-400">image</span>
                                 <label className="text-[10px] text-orange-400 font-bold uppercase tracking-wider">Visual (장면 설계)</label>
                               </div>
                               <textarea
                                 value={shot.visual || ''}
                                 onChange={(e) => updateShot(shot.id, 'visual', e.target.value)}
                                 className="w-full bg-[#0d0a1a] border border-orange-900/30 rounded-lg p-3 text-gray-300 text-xs leading-relaxed focus:border-orange-500 transition-all resize-none placeholder:text-white/20"
                                 rows={2}
                                 placeholder="화면에 보일 장면을 묘사하세요 (AI 이미지 생성용)..."
                               />
                             </div>
                           </div>
                           <div className="flex flex-col gap-2">
                             <button onClick={() => duplicateShot(shot.id)} className="w-8 h-8 rounded-lg bg-[#292348] hover:text-primary flex items-center justify-center transition-all" title="복제"><span className="material-symbols-outlined text-base">content_copy</span></button>
                             <button onClick={() => deleteShot(shot.id)} className="w-8 h-8 rounded-lg bg-[#292348] hover:text-red-500 flex items-center justify-center transition-all" title="삭제"><span className="material-symbols-outlined text-base">delete</span></button>
                           </div>
                         </div>
                       </div>
                     </div>
                   ))}
                   <button
                     onClick={() => setShots([...shots, { id: `shot-${Date.now()}`, content: "" }])}
                     className="ml-2 px-6 py-3 rounded-xl border border-dashed border-[#3b3267] text-[#9b92c9] hover:text-white hover:border-primary transition-all font-bold text-xs flex items-center gap-2 bg-white/5"
                   >
                     <span className="material-symbols-outlined text-sm">add</span>
                     새로운 컷 추가하기
                   </button>
                 </div>
              </div>

              {/* Right Sidebar */}
              <div className="w-[320px] flex flex-col gap-4 overflow-y-auto h-full pr-1 custom-scrollbar">
                 {/* Image Style Section */}
                 <div className="bg-[#1a162e] border border-[#292348] rounded-xl p-4 shadow-lg">
                    <h4 className="text-white text-xs font-bold mb-4 flex items-center gap-2">
                       <span className="material-symbols-outlined text-primary text-sm">palette</span>
                       이미지 스타일
                    </h4>
                    <div className="grid grid-cols-3 gap-2 pb-2">
                      {(settings?.image.styles || []).map(style => (
                        <button
                          key={style.id}
                          onClick={() => setSelectedImageStyle(style.id)}
                          style={{ height: '72px', minHeight: '72px' }}
                          className={`relative w-full rounded-lg overflow-hidden group border transition-all bg-[#0d0a1a] flex flex-col items-center justify-end ${
                            selectedImageStyle === style.id ? 'border-primary ring-1 ring-primary/20 bg-primary/20' : 'border-[#292348] opacity-60 hover:opacity-100 hover:border-white/10'
                          }`}
                        >
                           <img 
                              src={style.previewUrl} 
                              alt={style.label}
                              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = `https://via.placeholder.com/100x100/292348/ffffff?text=${encodeURIComponent(style.label.substring(0,1))}`;
                              }}
                           />
                           <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-transparent opacity-100" />
                           <div className="relative z-10 w-full p-1 text-center bg-black/40 backdrop-blur-[2px]">
                              <span className="text-[9px] font-bold text-white block leading-tight truncate">{style.label}</span>
                           </div>
                           {selectedImageStyle === style.id && (
                              <div className="absolute top-1 right-1 z-20 bg-primary rounded-full size-4 flex items-center justify-center shadow-lg border border-white/40">
                                <span className="material-symbols-outlined text-white text-[10px] font-bold">check</span>
                              </div>
                           )}
                        </button>
                      ))}
                    </div>
                 </div>

                 {/* Settings Section */}
                 <div className="bg-[#1a162e] border border-[#292348] rounded-xl p-5 shadow-lg">
                    <div className="space-y-6">
                       <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-[#9b92c9] text-[10px] font-bold uppercase mb-2 block tracking-wider">비율</label>
                            <div className="flex gap-1.5">
                               <button onClick={() => setVideoLength("shorts")} className={`flex-1 py-2 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${videoLength === "shorts" ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-[#0d0a1a] text-[#9b92c9] border-[#292348] hover:border-white/20"}`}>
                                  <span className="text-[11px] font-bold">9:16</span>
                               </button>
                               <button onClick={() => setVideoLength("1min")} className={`flex-1 py-2 rounded-lg border transition-all flex flex-col items-center gap-0.5 ${videoLength !== "shorts" ? "bg-primary text-white border-primary shadow-lg shadow-primary/20" : "bg-[#0d0a1a] text-[#9b92c9] border-[#292348] hover:border-white/20"}`}>
                                  <span className="text-[11px] font-bold">16:9</span>
                               </button>
                            </div>
                          </div>
                          <div>
                            <label className="text-[#9b92c9] text-[10px] font-bold uppercase mb-2 block tracking-wider">정보 요약</label>
                            <div className="bg-[#0d0a1a] rounded-lg p-2 border border-[#292348] space-y-1">
                               <div className="flex justify-between items-center"><span className="text-[9px] text-white/50">총 샷:</span><span className="text-[10px] text-white font-bold">{shots.length}개</span></div>
                               <div className="flex justify-between items-center"><span className="text-[9px] text-white/50">전체 길이:</span><span className="text-[10px] text-primary font-bold">{estMin}:{String(estSec).padStart(2,'0')}</span></div>
                            </div>
                          </div>
                       </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[#9b92c9] text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 cursor-pointer" onClick={() => setUseCharacterProfile(!useCharacterProfile)}>
                              <span>캐릭터 프로필 적용</span>
                              <div className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${useCharacterProfile ? 'bg-primary' : 'bg-[#292348]'}`}>
                                <span className={`${useCharacterProfile ? 'translate-x-[18px]' : 'translate-x-[2px]'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform duration-200`} />
                              </div>
                            </label>
                            <button 
                              onClick={handleAddCharacter}
                              disabled={!useCharacterProfile}
                              className={`text-primary hover:text-white transition-colors flex items-center gap-1 ${!useCharacterProfile ? 'opacity-30 cursor-not-allowed' : ''}`}
                            >
                              <span className="material-symbols-outlined text-[16px]">add_circle</span>
                              <span className="text-[9px]">추가</span>
                            </button>
                          </div>
                          
                          <div className={`space-y-3 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar transition-opacity duration-300 ${!useCharacterProfile ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                            {characterProfiles.map((char) => (
                              <div key={char.id} className="bg-[#0d0a1a] border border-[#292348] rounded-xl p-3 space-y-2 relative group">
                                <div className="flex items-center justify-between gap-2">
                                  <input 
                                    className="bg-transparent border-none text-white text-[11px] font-bold focus:ring-0 p-0 w-full"
                                    value={char.name}
                                    onChange={(e) => handleUpdateCharacter(char.id, { name: e.target.value })}
                                    placeholder="캐릭터 이름"
                                  />
                                  {characterProfiles.length > 1 && (
                                    <button 
                                      onClick={() => handleRemoveCharacter(char.id)}
                                      className="text-white/20 hover:text-red-400 transition-colors"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">delete</span>
                                    </button>
                                  )}
                                </div>
                                
                                <div className="flex gap-3">
                                  <div className="flex-1">
                                    <textarea
                                      value={char.description}
                                      onChange={(e) => handleUpdateCharacter(char.id, { description: e.target.value })}
                                      placeholder="외형 묘사 (나이, 머리카락, 옷 등)"
                                      className="w-full bg-black/30 border border-[#292348] rounded-lg p-2 text-white text-[10px] leading-relaxed focus:border-primary resize-none placeholder:text-white/10"
                                      rows={3}
                                    />
                                  </div>
                                  <div className="w-16 h-16 rounded-lg border border-[#292348] bg-black/50 overflow-hidden relative flex-shrink-0">
                                    {char.imageUrl ? (
                                      <img src={char.imageUrl} alt={char.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <span className="material-symbols-outlined text-white/10 text-xl">person</span>
                                      </div>
                                    )}
                                    <button
                                      onClick={() => handleGenerateCharacterImage(char.id)}
                                      disabled={char.status === 'processing'}
                                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                                    >
                                      {char.status === 'processing' ? (
                                        <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                      ) : (
                                        <span className="material-symbols-outlined text-white text-base">refresh</span>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 italic">
                          <p className="text-[10px] text-primary/80 leading-relaxed text-center">
                            * 캐릭터 프로필의 외형 정보와 선택된 스타일이 모든 장면에 고정 적용됩니다.
                          </p>
                        </div>
                     </div>
                  </div>
               </div>
            </div>
          </div>
        </main>
      );

      case CreationStep.CUT_SELECTION:
        // 현재 선택된 Scene 찾기 (없으면 첫 번째)
        const currentScene = scenes.find((s) => s.id === selectedSceneId) || scenes[0];
        // 영상 비율 스타일 설정
        const aspectRatioClass = videoLength === "shorts" ? "aspect-[9/16] h-[600px]" : "aspect-video w-full";

        if (!currentScene) {
          return (
            <div className="flex h-full items-center justify-center text-white flex-col gap-4 bg-[#0a0618]">
              <span className="material-symbols-outlined text-5xl text-white/20">image</span>
              <p className="text-xl font-bold">생성된 장면이 없습니다.</p>
              <p className="text-[#9b92c9] text-sm">대본 단계에서 먼저 대본을 생성해 주세요.</p>
              <button
                onClick={() => setStep(CreationStep.SCRIPT)}
                className="px-6 py-2.5 bg-primary hover:bg-primary/90 rounded-lg text-white font-bold transition-all mt-2"
              >
                대본 단계로 이동
              </button>
            </div>
          );
        }

        return (
          <div className="h-[calc(100vh-80px)] bg-[#0d0a1a] flex flex-col">
            {/* Top Bar */}
            <div className="h-16 border-b border-[#292348] flex items-center justify-between px-8 bg-[#1a162e]">
              <div className="flex items-center gap-4">
                 <h3 className="text-white text-lg font-bold uppercase">3단계: 이미지 시각화</h3>
                 <div className="flex items-center gap-2">
                   <div className="w-32 h-2 bg-[#292348] rounded-full overflow-hidden">
                     <div className="h-full bg-primary w-[40%]"></div>
                   </div>
                   <span className="text-primary text-xs font-bold">40%</span>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <button
                    onClick={() => setStep(CreationStep.SCRIPT)}
                    className="px-4 py-2 bg-[#292348] hover:bg-[#3b3267] text-white rounded-lg font-bold text-xs flex items-center gap-2 transition-all border border-[#3b3267]"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>구성 단계로</span>
                  </button>
                 <div className="flex items-center gap-2 px-4 py-2 bg-[#0d0a1a] rounded-lg border border-[#292348]">
                   <span className="text-[#9b92c9] text-xs">Total Shots:</span>
                   <span className="text-white font-bold">{scenes.length}</span>
                 </div>
                 <button
                   onClick={() => setShowModelSelectModal(true)}
                   className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold text-sm shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                 >
                   <span>Animate (Next)</span>
                   <span className="material-symbols-outlined">movie_filter</span>
                 </button>
              </div>
            </div>

            {/* 3-Column Layout */}
            <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr_360px]">
              
              {/* Left Panel: Shot List */}
              <div className="border-r border-[#292348] overflow-y-auto bg-[#1a162e]/50 flex flex-col">
                <div className="p-4 border-b border-[#292348]">
                  <h4 className="text-[#9b92c9] text-xs font-bold uppercase tracking-wider">Shot List</h4>
                </div>
                <div className="flex-1 p-2 space-y-2">
                  {scenes.map((scene, idx) => (
                    <button
                      key={scene.id}
                      onClick={() => setSelectedSceneId(scene.id)}
                      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all border ${selectedSceneId === scene.id ? 'bg-[#292348] border-primary' : 'hover:bg-[#292348]/50 border-transparent'}`}
                    >
                      <div className="relative w-16 aspect-video bg-black rounded overflow-hidden flex-shrink-0 border border-[#292348]">
                         {scene.status === 'processing' ? (
                           <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                             <span className="material-symbols-outlined animate-spin text-primary text-xs">sync</span>
                           </div>
                         ) : (
                           scene.imageUrl && <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
                         )}
                         <div className="absolute bottom-0 left-0 bg-black/70 text-white text-[8px] px-1 font-mono">
                           #{String(idx + 1).padStart(2, "0")}
                         </div>
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <div className="text-white text-xs font-bold truncate mb-0.5">Shot {idx + 1}</div>
                        <div className="text-[#9b92c9] text-[10px] truncate">{scene.script}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Center Panel: Canvas */}
              <div className="bg-[#0d0a1a] flex flex-col items-center justify-center p-8 relative overflow-hidden">
                 {/* Background Blur Effect */}
                 {currentScene.imageUrl && (
                   <div 
                     className="absolute inset-0 bg-cover bg-center opacity-10 blur-3xl scale-110 pointer-events-none"
                     style={{ backgroundImage: `url(${currentScene.imageUrl})` }}
                   ></div>
                 )}
                 
                 <div className="flex flex-col items-center gap-4">
                   {/* Main Image View */}
                   <div className={`relative shadow-2xl rounded-xl overflow-hidden border-2 border-[#292348] bg-black ${aspectRatioClass} transition-all duration-300`}>
                      {currentScene.status === 'processing' ? (
                         <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a162e]">
                           <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-6"></div>
                           <p className="text-primary font-bold animate-pulse">GENERATING IMAGE...</p>
                           <p className="text-[#9b92c9] text-sm mt-2">AI가 고화질 이미지를 생성하고 있습니다</p>
                         </div>
                      ) : (
                         <img 
                           src={currentScene.imageUrl || `https://via.placeholder.com/800x450?text=Shot+${currentScene.name}`} 
                           alt={currentScene.name}
                           className="w-full h-full object-cover"
                         />
                      )}
                   </div>
                   
                   {/* Script Text Below Image */}
                   <div className="bg-[#1a162e] border border-[#292348] rounded-lg px-6 py-3 max-w-2xl">
                     <p className="text-white text-sm leading-relaxed text-center">
                       {currentScene.script}
                     </p>
                   </div>
                 </div>
              </div>

              {/* Right Panel: Controls */}
              <div className="border-l border-[#292348] bg-[#1a162e] flex flex-col h-full overflow-hidden">
                 <div className="p-5 border-b border-[#292348]">
                   <h4 className="text-white font-bold mb-1 flex items-center gap-2">
                     <span className="material-symbols-outlined text-primary">edit</span>
                     Image Controls
                   </h4>
                   <p className="text-[#9b92c9] text-xs">Shot #{scenes.findIndex(s=>s.id === currentScene.id) + 1} 편집 중</p>
                 </div>
                 
                 <div className="flex-1 overflow-y-auto p-5 space-y-6">
                    {/* Prompt Editor */}
                    <div className="space-y-3">
                       <div className="flex justify-between items-center">
                         <label className="text-[#9b92c9] text-xs font-bold uppercase">이미지 프롬프트</label>
                         <button 
                           onClick={() => handleExpandPrompt(currentScene.id)}
                           disabled={isLoading}
                           className="text-primary text-[10px] font-bold flex items-center gap-1 hover:text-white transition-colors disabled:opacity-50"
                         >
                           <span className="material-symbols-outlined text-sm">auto_awesome</span>
                           AI Expand
                         </button>
                       </div>
                       <textarea 
                         value={currentScene.prompt}
                         onChange={(e) => {
                           // Prompt 수정
                           const newPrompt = e.target.value;
                           setScenes(prev => prev.map(s => s.id === currentScene.id ? { ...s, prompt: newPrompt } : s));
                         }}
                         className="w-full h-40 bg-[#0d0a1a] border border-[#292348] rounded-xl p-3 text-white/90 text-sm leading-relaxed focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                         placeholder="Describe the image..."
                       />
                       <div className="flex justify-end text-[10px] text-[#9b92c9]">
                         {currentScene.prompt.length} chars
                       </div>
                    </div>

                    {/* Re-generate Button */}
                    <div className="pt-2">
                        <button
                          onClick={() => handleRegenerateSingleImage(currentScene.id)}
                          disabled={isLoading}
                          className="w-full py-4 bg-[#292348] hover:bg-white hover:text-black text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 group border border-[#3b3267]"
                        >
                          {isLoading && currentScene.status === 'processing' ? (
                             <span className="material-symbols-outlined animate-spin">sync</span>
                          ) : (
                             <span className="material-symbols-outlined group-hover:rotate-180 transition-transform">refresh</span>
                          )}
                          <span>Re-generate Image</span>
                          <span className="text-[10px] bg-black/30 px-1.5 py-0.5 rounded text-[#9b92c9] group-hover:text-black/60">⚡ 10</span>
                        </button>
                        <p className="text-center text-[#9b92c9] text-[10px] mt-2">
                          현재 프롬프트로 이 컷의 이미지만 다시 생성합니다.
                        </p>
                    </div>

                 </div>
              </div>
            </div>
          </div>
        );

      case CreationStep.SCENE_REVIEW:
        return (
          <main className="max-w-[1200px] mx-auto px-6 py-8 pb-32">
            <div className="flex flex-col gap-3 mb-10">
              <div className="flex gap-6 justify-between items-center">
                <h3 className="text-white text-base font-bold uppercase tracking-wider">
                  4-5단계: 장면 검토 및 커스텀 프롬프트
                </h3>
                <p className="text-primary text-sm font-bold bg-primary/10 px-3 py-1 rounded-full">
                  80% 완료
                </p>
              </div>
              <div className="rounded-full bg-[#3b3267] h-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary shadow-[0_0_15px_rgba(55,19,236,0.5)] transition-all duration-1000"
                  style={{ width: "80%" }}
                ></div>
              </div>
              <p className="text-[#9b92c9] text-sm font-normal leading-relaxed">
                거의 다 왔습니다! 최종 고화질 비디오를 렌더링하기 전에 각 장면을
                확정하세요.
              </p>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-6 mb-10">
              <div className="flex min-w-72 flex-col gap-2">
                <h1 className="text-white text-4xl font-black leading-tight tracking-tight font-display">
                  장면별 대본 및 이미지 검토
                </h1>
                <p className="text-[#9b92c9] text-lg font-normal max-w-2xl">
                  각 컷의 대본과 생성된 비주얼을 확인하세요. 커스텀 프롬프트를
                  사용하여 특정 이미지 결과를 정교하게 조정할 수 있습니다.
                </p>
              </div>
              <div className="flex gap-3">
                <button className="flex items-center justify-center rounded-lg h-12 px-6 border border-[#292348] hover:bg-[#292348] text-sm font-bold transition-all text-white">
                  임시 저장
                </button>
                <button
                  onClick={() => setStep(CreationStep.MOTION)}
                  className="flex items-center justify-center rounded-lg h-12 px-8 bg-primary hover:bg-primary/90 text-white text-sm font-bold shadow-lg shadow-primary/25 transition-all"
                >
                  비디오 확정하기
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {scenes.map((scene, idx) => (
                <div
                  key={scene.id}
                  className={`flex flex-col bg-[#1a162e] border rounded-xl overflow-hidden group transition-all ${scene.status === "processing" ? "border-primary/40 ring-1 ring-primary/40" : "border-[#292348] hover:border-primary/50"}`}
                >
                  <div className="relative aspect-video w-full bg-slate-900 overflow-hidden">
                    {scene.status === "processing" ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-primary/10">
                        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest">
                          재생성 중...
                        </p>
                      </div>
                    ) : (
                      <div
                        className="absolute inset-0 bg-center bg-no-repeat bg-cover group-hover:scale-105 transition-transform duration-500"
                        style={{ backgroundImage: `url("${scene.imageUrl}")` }}
                      ></div>
                    )}
                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md text-white text-[10px] font-bold px-2 py-1 rounded border border-white/20 uppercase">
                      컷 #{String(idx + 1).padStart(2, "0")}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 backdrop-blur-[2px]">
                      <button
                        onClick={() => regenerateSceneImage(scene.id)}
                        className="bg-primary text-white p-3 rounded-full shadow-xl hover:scale-110 transition-transform"
                      >
                        <span className="material-symbols-outlined block text-[24px]">
                          auto_fix_high
                        </span>
                      </button>
                    </div>
                  </div>
                  <div className="p-5 flex flex-col gap-4">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-[#9b92c9] uppercase flex justify-between">
                        <span>내레이션 대본</span>
                        <span className="text-primary">
                          {scene.script.length}자
                        </span>
                      </label>
                      <textarea
                        value={scene.script}
                        onChange={(e) =>
                          updateScene(scene.id, "script", e.target.value)
                        }
                        className="bg-transparent border-0 p-0 text-white text-sm font-normal focus:ring-0 leading-relaxed min-h-[60px] resize-none"
                        rows={2}
                      />
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#292348]">
                      <button
                        onClick={() => regenerateSceneImage(scene.id)}
                        disabled={scene.status === "processing"}
                        className="text-[12px] font-bold px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-white transition-all disabled:opacity-50"
                      >
                        이미지 재생성
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                onClick={addScene}
                className="flex flex-col items-center justify-center bg-transparent border-2 border-dashed border-[#292348] rounded-xl min-h-[400px] hover:bg-primary/5 hover:border-primary/50 group transition-all"
              >
                <span className="material-symbols-outlined text-primary text-4xl mb-4 group-hover:scale-110 transition-transform">
                  add
                </span>
                <span className="text-sm font-bold text-[#9b92c9]">
                  새 컷 추가하기
                </span>
              </button>
            </div>
            <div className="fixed bottom-0 left-0 right-0 bg-background-dark/90 backdrop-blur-xl border-t border-[#292348] py-4 px-10 z-[60]">
              <div className="max-w-[1200px] mx-auto flex items-center justify-between">
                <button
                  onClick={() => setStep(CreationStep.SCRIPT)}
                  className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">
                    arrow_back
                  </span>
                  대본 편집기로 돌아가기
                </button>
                <div className="flex items-center gap-6">
                  <span className="text-sm font-bold text-white">
                    {stats.duration}
                  </span>
                  <button
                    onClick={() => setStep(CreationStep.MOTION)}
                    className="bg-primary hover:bg-primary/90 text-white px-10 py-3 rounded-lg font-bold shadow-xl shadow-primary/30 transition-all"
                  >
                    렌더링 단계로 이동
                  </button>
                </div>
              </div>
            </div>
          </main>
        );

      case CreationStep.MOTION:
        const currentSceneMotion = scenes.find(s => s.id === selectedSceneId) || scenes[0];
        
        if (!currentSceneMotion) {
             return (
                 <div className="flex h-screen items-center justify-center text-white flex-col gap-4 bg-[#0a0618]">
                     <p className="text-xl font-bold">생성된 장면이 없습니다.</p>
                     <button 
                        onClick={() => setStep(CreationStep.CUT_SELECTION)}
                        className="px-4 py-2 bg-primary rounded-lg text-white font-bold"
                     >
                        이전 단계로 돌아가기
                     </button>
                 </div>
             );
        }
        
        const isVideoAvailable = !!(currentSceneMotion.videoClipUrl && currentSceneMotion.videoClipUrl.length > 50);

        return (
          <main className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#0a0618]">
            {/* Top Bar (Progress) */}
            <div className="h-14 border-b border-[#292348] flex items-center justify-between px-6 bg-[#131022]">
              <div className="flex items-center gap-4">
                 <h2 className="text-white font-bold text-lg flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">movie_filter</span>
                    영상 생성 및 편집 ({getProviderDisplayName()})
                 </h2>
                 <div className="h-4 w-px bg-[#292348]"></div>
                 <span className="text-xs font-medium text-white/50 hidden md:inline">Shot 단위로 영상을 확인하고, 원하는 장면만 재생성(Re-animate)해보세요.</span>
              </div>
              
              <button
                onClick={() => setStep(CreationStep.AUDIO_STYLE)}
                className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold text-sm shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
              >
                <span>Voice & Audio (Next)</span>
                <span className="material-symbols-outlined">graphic_eq</span>
              </button>
            </div>

            {/* 2-Column Layout */}
            <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr]">
              
              {/* Left: Shot List */}
              <div className="border-r border-[#292348] bg-[#1a162e]/50 overflow-y-auto custom-scrollbar">
                 <div className="p-4 space-y-2">
                    <button
                       onClick={handleGenerateMotions}
                       disabled={isGeneratingVideo}
                       className={`w-full py-3 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-sm transition-all mb-4 ${
                         isGeneratingVideo 
                            ? 'bg-[#292348] text-white/50 cursor-not-allowed'
                            : scenes.some(s => !s.videoClipUrl)
                               ? 'bg-gradient-to-r from-primary to-purple-600 text-white shadow-lg hover:shadow-primary/30 hover:scale-[1.02]' 
                               : 'bg-[#292348] text-white/50 hover:bg-[#3b3267] hover:text-white'
                       }`}
                    >
                       {isGeneratingVideo ? (
                          <>
                            <span className="material-symbols-outlined animate-spin text-[18px]">sync</span>
                            <span>생성 중...</span>
                          </>
                       ) : (
                          <>
                            <span className="material-symbols-outlined text-[18px]">movie_filter</span>
                            <span>모든 장면 영상 생성</span>
                          </>
                       )}
                    </button>
                    {scenes.map((scene, idx) => (
                       <div 
                         key={scene.id}
                         onClick={() => setSelectedSceneId(scene.id)}
                         className={`p-3 rounded-xl border cursor-pointer transition-all flex gap-3 ${
                            (currentSceneMotion.id === scene.id) 
                               ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(55,19,236,0.1)]' 
                               : 'bg-[#131022] border-[#292348] hover:border-white/20'
                         }`}
                       >
                          <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-black flex-shrink-0 border border-white/10 group">
                             <img src={scene.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                             {/* Video Indicator */}
                             {scene.videoClipUrl && scene.videoClipUrl.length > 50 ? (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                   <span className="material-symbols-outlined text-white text-lg drop-shadow-md">videocam</span>
                                </div>
                             ) : (
                                <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-black/50 ${scene.status === 'processing' ? 'bg-blue-500 animate-bounce' : 'bg-yellow-500'}`}></div>
                             )}
                             <span className="absolute bottom-0.5 left-1 text-[9px] font-bold text-white drop-shadow-md">#{idx+1}</span>
                          </div>
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                             <div className="flex justify-between items-center mb-0.5">
                                <span className={`text-xs font-bold ${(currentSceneMotion.id === scene.id) ? 'text-white' : 'text-white/70'}`}>Shot {idx+1}</span>
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#292348] text-white/70">{scene.duration}</span>
                             </div>
                             <p className="text-[10px] text-white/40 line-clamp-1 truncate">{scene.script}</p>
                          </div>
                       </div>
                    ))}
                 </div>
              </div>

              {/* Center: Preview */}
              <div className="bg-black relative flex flex-col min-h-0">
                 <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[url('/grid.svg')] bg-center relative overflow-hidden group/preview select-none min-h-0">
                    <div 
                       className="absolute inset-0 bg-cover bg-center opacity-20 blur-3xl scale-150 pointer-events-none"
                       style={{ backgroundImage: `url(${currentSceneMotion.imageUrl})` }}
                    ></div>

                    <div 
                       className="relative shadow-2xl rounded-xl overflow-hidden border border-white/10 bg-black flex-shrink"
                       style={{ 
                          aspectRatio: videoLength === 'shorts' ? '9/16' : '16/9',
                          maxHeight: 'calc(100% - 100px)',
                          maxWidth: '90%',
                       }}
                    >
                       {isVideoAvailable ? (
                          <video 
                             key={currentSceneMotion.videoClipUrl}
                             src={currentSceneMotion.videoClipUrl}
                             autoPlay
                             loop
                             muted
                             playsInline
                             className="w-full h-full object-contain"
                          />
                       ) : (
                          <img key={currentSceneMotion.id} src={currentSceneMotion.imageUrl} className="w-full h-full object-cover" alt="" />
                       )}
                       
                       {/* Re-animate Button Overlay */}
                       <div className="absolute top-4 right-4 flex gap-2">
                           <button 
                              onClick={() => handleReanimateShot(currentSceneMotion.id)}
                              disabled={isGeneratingVideo}
                              className="bg-black/60 hover:bg-primary backdrop-blur-md text-white px-4 py-2 rounded-lg text-xs font-bold border border-white/10 flex items-center gap-2 transition-all hover:scale-105"
                           >
                              <span className={`material-symbols-outlined text-sm ${isGeneratingVideo && currentSceneMotion.status === 'processing' ? 'animate-spin' : ''}`}>refresh</span>
                              {currentSceneMotion.videoClipUrl ? '영상 다시 생성' : '영상 생성하기'}
                           </button>
                       </div>
                    </div>

                    {/* Script box below video */}
                    <div className="mt-8 bg-[#1a162e] border border-[#292348] rounded-xl px-8 py-4 max-w-2xl shadow-xl z-10">
                       <p className="text-white text-base leading-relaxed text-center font-medium">
                          {currentSceneMotion.script}
                       </p>
                    </div>
                 </div>
              </div>
            </div>
          </main>
        );

      case CreationStep.AUDIO_STYLE:
        return (() => {
          const currentScene = scenes.find(s => s.id === selectedSceneId) || scenes[0];
          
          if (!currentScene) {
            return (
              <div className="flex h-screen items-center justify-center text-white flex-col gap-4 bg-[#0a0618]">
                <p className="text-xl font-bold">생성된 장면이 없습니다.</p>
                <button 
                  onClick={() => setStep(CreationStep.CUT_SELECTION)}
                  className="px-4 py-2 bg-primary rounded-lg text-white font-bold"
                >
                  이전 단계로 돌아가기
                </button>
              </div>
            );
          }

          return (
            <main className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#0a0618]">
              {/* Top Bar */}
              <div className="h-14 border-b border-[#292348] flex items-center justify-between px-6 bg-[#131022]">
                <div className="flex items-center gap-4">
                  <h2 className="text-white font-bold text-lg flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">graphic_eq</span>
                    8단계: 오디오 설정
                  </h2>
                  <div className="h-4 w-px bg-[#292348]"></div>
                  <span className="text-xs font-medium text-white/50 hidden md:inline">장면별 목소리(TTS)를 선택하고 생성하세요.</span>
                </div>
                
                <button
                  onClick={() => setStep(CreationStep.SUBTITLE)}
                  className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold text-sm shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                >
                  <span>9단계: 자막 설정 (Next)</span>
                  <span className="material-symbols-outlined">subtitles</span>
                </button>
              </div>

              {/* 3-Column Layout */}
              <div className="flex-1 overflow-hidden grid grid-cols-[280px_1fr_320px]">
                {/* Left: Scene List */}
                <div className="border-r border-[#292348] bg-[#1a162e]/50 overflow-y-auto custom-scrollbar">
                  <div className="p-4 space-y-2">
                    {scenes.map((scene, idx) => (
                      <div 
                        key={scene.id}
                        onClick={() => setSelectedSceneId(scene.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex gap-3 ${
                          (currentScene.id === scene.id) 
                            ? 'bg-primary/10 border-primary shadow-[0_0_15px_rgba(55,19,236,0.1)]' 
                            : 'bg-[#131022] border-[#292348] hover:border-white/20'
                        }`}
                      >
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-black flex-shrink-0 border border-white/10 group">
                          <img src={scene.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" alt="" />
                          {scene.audioUrl ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <span className="material-symbols-outlined text-green-400 text-lg drop-shadow-md">volume_up</span>
                            </div>
                          ) : (
                            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-yellow-500 ring-2 ring-black/50"></div>
                          )}
                          <span className="absolute bottom-0.5 left-1 text-[9px] font-bold text-white drop-shadow-md">#{idx+1}</span>
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex justify-between items-center mb-0.5">
                            <span className={`text-xs font-bold ${(currentScene.id === scene.id) ? 'text-white' : 'text-white/70'}`}>Shot {idx+1}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#292348] text-white/70">{scene.duration}</span>
                          </div>
                          <p className="text-[10px] text-white/40 line-clamp-1 truncate">{scene.script}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Center: Preview */}
                <div className="bg-black relative flex flex-col min-h-0">
                  <div className="flex-1 flex flex-col items-center justify-center p-4 bg-[url('/grid.svg')] bg-center relative overflow-hidden group/preview select-none min-h-0">
                    <div
                      className="absolute inset-0 bg-cover bg-center opacity-20 blur-3xl scale-150 pointer-events-none"
                      style={{ backgroundImage: `url(${currentScene.imageUrl})` }}
                    ></div>

                    <div
                      className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-black flex-shrink"
                      style={{
                        aspectRatio: videoLength === 'shorts' ? '9/16' : '16/9',
                        maxHeight: 'calc(100% - 100px)',
                        maxWidth: '95%',
                      }}
                    >
                      {currentScene.videoClipUrl && currentScene.videoClipUrl.length > 50 ? (
                        <video
                          ref={videoRef}
                          key={currentScene.videoClipUrl}
                          src={currentScene.videoClipUrl}
                          playsInline
                          className="w-full h-full object-contain"
                          onEnded={() => setIsPlayingScene(false)}
                        />
                      ) : (
                        <img key={currentScene.id} src={currentScene.imageUrl} className="w-full h-full object-cover" alt="" />
                      )}

                      <div 
                        className="absolute inset-0 flex items-center justify-center cursor-pointer group/play"
                        onClick={() => setIsPlayingScene(!isPlayingScene)}
                      >
                         {!isPlayingScene && (
                            <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white transition-transform group-hover/play:scale-110 shadow-2xl">
                               <span className="material-symbols-outlined text-5xl ml-2">play_arrow</span>
                            </div>
                         )}
                      </div>

                      {currentScene.audioUrl && (
                        <div className="absolute bottom-4 left-4 right-4 bg-black/80 backdrop-blur-sm rounded-lg p-3 border border-white/10">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-green-400 !text-[20px]">volume_up</span>
                            <div className="flex-1">
                              <audio 
                                ref={audioRef}
                                key={currentScene.audioUrl}
                                src={currentScene.audioUrl}
                                controls
                                className="w-full h-8"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Script box below video */}
                    <div className="mt-6 bg-[#1a162e] border border-[#292348] rounded-xl px-8 py-4 max-w-2xl shadow-xl">
                      <p className="text-white text-base leading-relaxed text-center font-medium">
                        {currentScene.script}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right: Audio Settings */}
                <div className="border-l border-[#292348] bg-[#1a162e]/30 px-6 py-8 flex flex-col h-full overflow-y-auto custom-scrollbar">
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-8 flex items-center gap-2 border-b border-[#292348] pb-4">
                    <span className="material-symbols-outlined text-primary">record_voice_over</span>
                    Audio Settings
                  </h3>
                  
                  <div className="space-y-8">
                    <div>
                      <label className="text-xs text-[#9b92c9] font-bold mb-3 block">AI 목소리 선택</label>
                      <div className="grid grid-cols-2 gap-2">
                        {(settings?.audio.voices || []).map((voice) => {
                          const isSelected = selectedVoice?.id === voice.id;
                          const isPlaying = playingPreviewVoice === voice.id;
                          return (
                            <div
                              key={voice.id}
                              onClick={() => setSelectedVoice(voice as any)}
                              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                                isSelected ? 'border-primary bg-primary/10' : 'border-[#292348] hover:border-white/20 bg-[#0d0a1a]'
                              }`}
                            >
                              <div className="size-8 rounded-full bg-cover bg-center border border-white/10 flex-shrink-0" style={{ backgroundImage: `url('${voice.avatarUrl}')` }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold truncate">{voice.name}</p>
                                <p className="text-[9px] text-white/40 truncate">{voice.type}</p>
                              </div>
                              <button onClick={async (e) => {
                                e.stopPropagation();
                                if (isPlaying) return;
                                setPlayingPreviewVoice(voice.id);
                                try {
                                  // 프리뷰 URL 검증
                                  const audioUrl = (voice.previewUrl && voice.previewUrl.startsWith('http')) 
                                    ? voice.previewUrl 
                                    : await previewVoiceTTS(voice.id);
                                    
                                  if (!audioUrl) throw new Error("Audio URL not found");

                                  const a = new Audio(audioUrl);
                                  a.play().catch(err => {
                                     console.error("Audio Play Error:", err);
                                     alert("오디오 재생 실패: " + err.message);
                                     setPlayingPreviewVoice(null);
                                  });
                                  a.onended = () => setPlayingPreviewVoice(null);
                                  a.onerror = (e) => {
                                     console.error("Audio Load Error:", e);
                                     alert("오디오 로드 실패: 미리듣기 파일이 없거나 손상되었습니다.");
                                     setPlayingPreviewVoice(null);
                                  };
                                } catch (err: any) {
                                  console.error("Preview Logic Error:", err);
                                  alert("미리듣기 오류: " + err.message);
                                  setPlayingPreviewVoice(null);
                                }
                              }} className="p-1 rounded-full hover:bg-primary/20 transition-colors">
                                <span className={`material-symbols-outlined !text-[16px] ${isPlaying ? 'text-primary animate-pulse' : 'text-white/50'}`}>
                                  {isPlaying ? 'graphic_eq' : 'play_arrow'}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs text-[#9b92c9] font-bold mb-2 block">음성 속도: {voiceSpeed.toFixed(1)}x</label>
                      <input type="range" min="0.7" max="1.3" step="0.1" value={voiceSpeed} onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))} className="w-full accent-primary" />
                    </div>

                    <button
                      onClick={handleGenerateTTS}
                      disabled={isGeneratingTTS || !selectedVoice}
                      className="w-full py-4 bg-gradient-to-r from-primary to-[#5b2fff] hover:to-[#6b4fff] rounded-xl font-bold text-white shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale"
                    >
                      {isGeneratingTTS ? (
                        <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>생성 중... {ttsProgress}%</span></>
                      ) : (
                        <><span className="material-symbols-outlined">record_voice_over</span><span>모든 장면 음성 생성</span></>
                      )}
                    </button>

                    {ttsError && (
                      <div className={`p-3 border rounded-lg ${ttsError.startsWith('✅') ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                        <p className={`text-xs whitespace-pre-line ${ttsError.startsWith('✅') ? 'text-green-400' : 'text-red-400'}`}>{ttsError}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </main>
          );
        })();

      case CreationStep.SUBTITLE:
        return (() => {
          const currentScene = scenes.find(s => s.id === selectedSceneId) || scenes[0];
          if (!currentScene) return null;

          return (
            <main className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#0a0618]">
              {/* Top Bar */}
              <div className="h-14 border-b border-[#292348] flex items-center justify-between px-6 bg-[#131022]">
                <div className="flex items-center gap-4">
                  <h2 className="text-white font-bold text-lg flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">subtitles</span>
                    9단계: 자막 디자인 및 확정
                  </h2>
                  <div className="h-4 w-px bg-[#292348]"></div>
                  <span className="text-xs font-medium text-white/50 hidden md:inline">영상 전체의 자막 스타일을 통일하고 디자인을 완성하세요.</span>
                </div>
                
                <button
                  onClick={() => setStep(CreationStep.FINAL)}
                  className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold text-sm shadow-lg shadow-primary/20 transition-all flex items-center gap-2"
                >
                  <span>10단계: 최종 렌더링 (Finish)</span>
                  <span className="material-symbols-outlined">movie</span>
                </button>
              </div>

              <div className="flex-1 overflow-hidden grid grid-cols-[1fr_360px]">
                {/* Left: Preview & Unified Timeline */}
                <div className="flex flex-col bg-black min-h-0 relative h-full">
                  {/* Top: Video Preview */}
                  <div 
                    className="relative flex flex-col items-center justify-center p-4 bg-[url('/grid.svg')] bg-center overflow-hidden select-none min-h-0"
                    style={{ height: `calc(100% - ${timelineHeight}px)` }}
                  >
                    <div className="absolute inset-0 bg-cover bg-center opacity-20 blur-3xl scale-150 pointer-events-none" style={{ backgroundImage: `url(${currentScene.imageUrl})` }} />

                    <div
                      ref={previewRef}
                      className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-black flex-shrink"
                      style={{
                        aspectRatio: videoLength === 'shorts' ? '9/16' : '16/9',
                        maxHeight: 'calc(100% - 16px)',
                        maxWidth: videoLength === 'shorts' ? '40%' : '95%'
                      }}
                    >
                      {currentScene.videoClipUrl && currentScene.videoClipUrl.length > 50 ? (
                        <video
                          ref={videoRef}
                          key={currentScene.videoClipUrl}
                          src={currentScene.videoClipUrl}
                          playsInline 
                          className="w-full h-full object-contain" 
                          onLoadedData={syncMediaToTimeline}
                          onEnded={() => {
                            if (!isIntegratedPlaying) setIsPlayingScene(false);
                          }} 
                        />
                      ) : (
                        <img src={currentScene.imageUrl} className="w-full h-full object-cover" alt="" />
                      )}

                      <div className="absolute inset-0 flex items-center justify-center cursor-pointer group/play" onClick={(e) => {
                        setIsIntegratedPlaying(!isIntegratedPlaying);
                      }}>
                         {(!isPlayingScene && !isIntegratedPlaying) && (
                            <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white transition-transform group-hover/play:scale-110 shadow-2xl">
                               <span className="material-symbols-outlined text-5xl ml-2 text-white">play_arrow</span>
                            </div>
                         )}
                      </div>

                      {showSubtitles && currentScene.script && (() => {
                        // 현재 장면 내 상대 시간 계산
                        const sceneWithTime = scenesWithTiming.find(s => s.id === currentScene.id);
                        const relativeTime = sceneWithTime ? integratedTime - sceneWithTime.startTime : 0;
                        const segments = currentScene.subtitleSegments;
                        // 세그먼트가 있으면 현재 시간에 맞는 세그먼트 표시 (다음 세그먼트 전까지 유지)
                        let activeSegment = null;
                        if (segments && segments.length > 0) {
                          // 정확히 범위 안에 있는 세그먼트 우선
                          activeSegment = segments.find(seg => relativeTime >= seg.startTime && relativeTime < seg.endTime);
                          // 없으면: 현재 시간 이전에 시작된 가장 마지막 세그먼트를 유지
                          if (!activeSegment) {
                            const past = segments.filter(seg => relativeTime >= seg.endTime).sort((a, b) => b.endTime - a.endTime);
                            if (past.length > 0) {
                              // 다음 세그먼트가 아직 시작 안 했으면 이전 세그먼트 유지
                              const nextSeg = segments.find(seg => seg.startTime > relativeTime);
                              if (nextSeg || !nextSeg) {
                                activeSegment = past[0];
                              }
                            }
                          }
                        }
                        const displayText = segments && segments.length > 0
                          ? (activeSegment?.text || '')
                          : currentScene.script;
                        if (!displayText) return null;
                        return (
                        <div className="absolute left-0 right-0 flex justify-center" style={{ bottom: `${subtitleY}%` }}>
                          <div
                            className={`flex items-center justify-center shadow-xl transition-all relative subtitle-container ${showSubtitleBg ? 'backdrop-blur-md' : ''} ${isSubSelected ? 'ring-[1px] ring-white ring-offset-1 ring-offset-black/40 cursor-move' : 'cursor-pointer'}`}
                            style={{
                              backgroundColor: showSubtitleBg ? subtitleBgColor : 'transparent',
                              borderRadius: `${subtitleBgRadius}px`,
                              width: 'auto',
                              height: 'auto',
                              minWidth: showSubtitleBg ? '40px' : 'auto',
                              minHeight: showSubtitleBg ? '30px' : 'auto',
                              padding: showSubtitleBg ? `${subtitleBgHeight/2}px ${subtitleBgWidth/2}px` : '0px', // Use slider values as padding instead
                              fontFamily: subtitleFont,
                              userSelect: 'none',
                              boxShadow: showSubtitleBg ? '0 4px 6px rgba(0,0,0,0.1)' : 'none',
                              maxWidth: '90%'
                            }}
                            onMouseDown={(e) => handleSubDragStart(e, 'move')}
                            onClick={(e) => { e.stopPropagation(); setIsSubSelected(true); }}
                          >
                            {isSubSelected && (
                              <>
                                <div className="absolute -right-[2px] top-1/2 -translate-y-1/2 w-[2px] h-3 bg-white cursor-ew-resize z-20" onMouseDown={(e) => handleSubDragStart(e, 'resize-r')} />
                                <div className="absolute -left-[2px] top-1/2 -translate-y-1/2 w-[2px] h-3 bg-white cursor-ew-resize z-20" onMouseDown={(e) => handleSubDragStart(e, 'resize-l')} />
                                <div className="absolute -top-[2px] left-1/2 -translate-x-1/2 w-3 h-[2px] bg-white cursor-ns-resize z-20" onMouseDown={(e) => handleSubDragStart(e, 'resize-t')} />
                                <div className="absolute -bottom-[2px] left-1/2 -translate-x-1/2 w-3 h-[2px] bg-white cursor-ns-resize z-20" onMouseDown={(e) => handleSubDragStart(e, 'resize-b')} />
                              </>
                            )}

                            <p
                              contentEditable
                              suppressContentEditableWarning
                              onBlur={(e) => {
                                const newText = e.currentTarget.innerText;
                                if (activeSegment) {
                                  setScenes(prev => prev.map(s => s.id === currentScene.id ? { ...s, subtitleSegments: s.subtitleSegments?.map(seg => seg.id === activeSegment.id ? { ...seg, text: newText } : seg) } : s));
                                } else {
                                  setScenes(prev => prev.map(s => s.id === currentScene.id ? { ...s, script: newText } : s));
                                }
                              }}
                              className="font-bold leading-tight text-center whitespace-pre-wrap px-2 outline-none w-full cursor-text"
                              style={{
                                color: subtitleColor,
                                fontSize: `${subtitleFontSize}px`,
                                fontWeight: subtitleTemplate === "bold" ? "bold" : "normal",
                                fontStyle: subtitleTemplate === "italic" ? "italic" : "normal",
                                textShadow: subtitleShadow 
                                  ? '2px 2px 2px rgba(0,0,0,0.8)' 
                                  : subtitleGlow 
                                    ? `0 0 10px ${subtitleBorderColor || subtitleColor}, 0 0 20px ${subtitleBorderColor || subtitleColor}`
                                    : 'none',
                                WebkitTextStroke: subtitleBorderWidth > 0 ? `${subtitleBorderWidth}px ${subtitleBorderColor}` : undefined,
                                paintOrder: 'stroke fill',
                                textAlign: "center",
                                lineHeight: 1.4,
                                margin: 0,
                                zIndex: 10,
                                userSelect: 'text'
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) e.currentTarget.blur(); }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                            >
                              {displayText}
                            </p>
                          </div>
                        </div>
                        );
                      })()}

                      {/* Active Audio Visualizer Overlay (Optional UI touch) */}
                      {isIntegratedPlaying && currentScene.audioUrl && (
                        <div className="absolute top-4 right-4 bg-primary/20 backdrop-blur-md border border-primary/30 rounded-full px-3 py-1 flex items-center gap-2">
                           <div className="flex gap-0.5 items-end h-3">
                              <div className="w-0.5 h-1.5 bg-primary animate-[bounce_1s_infinite]"></div>
                              <div className="w-0.5 h-3 bg-primary animate-[bounce_0.8s_infinite]"></div>
                              <div className="w-0.5 h-2 bg-primary animate-[bounce_1.2s_infinite]"></div>
                           </div>
                           <span className="text-[10px] font-bold text-primary">AUDIO ON</span>
                        </div>
                      )}
                    </div>

                    <audio 
                      ref={audioRef} 
                      key={currentScene.audioUrl} // 키 추가로 오디오 소스 변경 시 초기화 보장
                      src={currentScene.audioUrl} 
                      className="hidden" 
                      onLoadedData={syncMediaToTimeline}
                      autoPlay={isIntegratedPlaying} // 자동 재생 속성 활용
                    />
                  </div>

                  {/* Resize Handle */}
                  <div
                    className="h-4 -mt-2 bg-transparent hover:bg-primary/10 cursor-row-resize z-50 flex justify-center items-center group/resize relative"
                    onMouseDown={(e) => { e.preventDefault(); setIsResizingTimeline(true); }}
                  >
                     <div className="absolute inset-x-0 h-0.5 bg-[#292348] group-hover/resize:bg-primary transition-colors top-1/2 -translate-y-1/2" />
                     <div className="w-10 h-1 rounded-full bg-white/20 group-hover/resize:bg-white/50 transition-colors relative z-10" />
                  </div>

                  {/* Bottom: Timeline Bar (Image Reference Style) */}
                  <div 
                    className="bg-[#131022] border-t border-[#292348] flex flex-col overflow-hidden relative"
                    style={{ height: timelineHeight }}
                  >
                     {/* Control Bar */}
                     <div className="h-10 px-4 flex items-center justify-between bg-[#1a162e]">
                        <div className="flex items-center gap-4">
                           <button
                             onClick={() => setIsIntegratedPlaying(!isIntegratedPlaying)}
                             className="size-7 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center text-white shadow-lg transition-transform active:scale-95"
                           >
                              <span className="material-symbols-outlined text-lg">
                                {isIntegratedPlaying ? 'pause' : 'play_arrow'}
                              </span>
                           </button>
                           <div className="flex items-baseline gap-1">
                              <span className="text-white font-bold text-xs tracking-tighter">
                                 {Math.floor(integratedTime / 60)}:{String(Math.floor(integratedTime % 60)).padStart(2, '0')}
                              </span>
                              <span className="text-white/30 text-[10px] font-bold">/</span>
                              <span className="text-white/30 text-[10px] font-bold">
                                 {Math.floor(totalVideoDuration / 60)}:{String(Math.floor(totalVideoDuration % 60)).padStart(2, '0')}
                              </span>
                           </div>
                        </div>

                        <div className="flex items-center gap-2">
                           {/* Zoom Controls */}
                           <div className="flex items-center gap-2 border-r border-white/10 pr-3 mr-1">
                              <span className="material-symbols-outlined text-sm text-white/50" title="타임라인 축소/확대">zoom_in</span>
                              <input 
                                type="range" 
                                min="1" 
                                max="8" 
                                step="0.1" 
                                value={timelineScale} 
                                onChange={(e) => setTimelineScale(parseFloat(e.target.value))}
                                className="w-20 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white/80 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:bg-white"
                              />
                           </div>

                           <span className="material-symbols-outlined text-sm text-white/50 cursor-pointer hover:text-white">volume_up</span>
                           <div className="w-16 h-0.5 bg-white/10 rounded-full relative cursor-pointer">
                              <div className="absolute inset-y-0 left-0 w-3/4 bg-white/40 rounded-full" />
                           </div>
                        </div>
                     </div>

                     {/* CapCut-style Editing Toolbar (Always Visible) */}
                     <div className={`h-10 px-4 flex items-center gap-1 bg-[#0d0a1a] border-t border-b border-[#292348] transition-opacity ${selectedTrackType ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                         {/* Track type indicator */}
                         <span className={`text-[9px] font-black uppercase tracking-wider mr-2 px-1.5 py-0.5 rounded ${
                           selectedTrackType === 'subtitle' ? 'bg-yellow-500/20 text-yellow-400' :
                           selectedTrackType === 'scene' ? 'bg-blue-500/20 text-blue-400' :
                           selectedTrackType === 'audio' ? 'bg-primary/20 text-primary' :
                           'bg-white/10 text-white/40'
                         }`}>
                           {selectedTrackType === 'subtitle' ? '자막' : selectedTrackType === 'scene' ? '영상' : selectedTrackType === 'audio' ? '오디오' : '선택 없음'}
                         </span>

                         <div className="w-px h-4 bg-white/10 mx-1" />

                         {/* Trim Left (뒤로 삭제 - 플레이헤드 앞 부분 삭제) */}
                         <button
                           onClick={() => {
                             const activeScene = scenesWithTiming.find(s => integratedTime >= s.startTime && integratedTime < s.startTime + s.durationSec);
                             if (!activeScene) return;
                             const relTime = Math.round((integratedTime - activeScene.startTime) * 10) / 10;

                             if (selectedTrackType === 'subtitle' && selectedSubtitleId) {
                               setScenes(prev => prev.map(s => ({
                                 ...s,
                                 subtitleSegments: s.subtitleSegments?.map(seg =>
                                   seg.id === selectedSubtitleId && relTime > seg.startTime && relTime < seg.endTime
                                     ? { ...seg, startTime: relTime } : seg
                                 )
                               })));
                             } else if (selectedTrackType === 'scene' && selectedSceneId) {
                               // Trim left: 장면의 시작을 플레이헤드로 이동 (duration 축소)
                               const scene = scenesWithTiming.find(s => s.id === selectedSceneId);
                               if (scene && relTime > 0 && relTime < scene.durationSec) {
                                 const newDur = scene.durationSec - relTime;
                                 setScenes(prev => prev.map(s => s.id === selectedSceneId ? { ...s, duration: `${newDur.toFixed(1)}s` } : s));
                                 setIntegratedTime(activeScene.startTime);
                               }
                             } else if (selectedTrackType === 'audio' && selectedAudioSceneId) {
                               // Audio trim left: audioUrl 제거
                               setScenes(prev => prev.map(s => s.id === selectedAudioSceneId ? { ...s, audioUrl: undefined } : s));
                               setSelectedTrackType(null);
                               setSelectedAudioSceneId(null);
                             }
                           }}
                           className="h-6 px-2 rounded hover:bg-white/10 flex items-center gap-1 transition-colors group/btn"
                           title="뒤로 삭제 (Trim Left)"
                         >
                           <span className="material-symbols-outlined !text-[14px] text-white/50 group-hover/btn:text-white">content_cut</span>
                           <span className="material-symbols-outlined !text-[10px] text-white/30 group-hover/btn:text-white/60 -ml-1">arrow_back</span>
                         </button>

                         {/* Split at Playhead (컷) */}
                         <button
                           onClick={() => {
                             const activeScene = scenesWithTiming.find(s => integratedTime >= s.startTime && integratedTime < s.startTime + s.durationSec);
                             if (!activeScene) return;
                             const relTime = Math.round((integratedTime - activeScene.startTime) * 10) / 10;

                             if (selectedTrackType === 'subtitle' && selectedSubtitleId) {
                               setScenes(prev => prev.map(s => {
                                 if (s.id !== activeScene.id) return s;
                                 const newSegs = (s.subtitleSegments || []).flatMap(seg => {
                                   if (seg.id !== selectedSubtitleId) return [seg];
                                   if (relTime <= seg.startTime + 0.1 || relTime >= seg.endTime - 0.1) return [seg];
                                   return [
                                     { ...seg, id: `${seg.id}-a`, endTime: relTime, text: seg.text },
                                     { ...seg, id: `${seg.id}-b`, startTime: relTime, text: seg.text },
                                   ];
                                 });
                                 return { ...s, subtitleSegments: newSegs };
                               }));
                               setSelectedSubtitleId(null);
                             } else if (selectedTrackType === 'scene' && selectedSceneId) {
                               // Split scene at playhead
                               const scene = scenesWithTiming.find(s => s.id === selectedSceneId);
                               if (scene && relTime > 0.5 && relTime < scene.durationSec - 0.5) {
                                 const dur1 = relTime;
                                 const dur2 = scene.durationSec - relTime;
                                 setScenes(prev => {
                                   const idx = prev.findIndex(s => s.id === selectedSceneId);
                                   if (idx === -1) return prev;
                                   const original = prev[idx];
                                   const scene1 = { ...original, id: `${original.id}-a`, duration: `${dur1.toFixed(1)}s`, name: `${original.name} (1)` };
                                   const scene2 = { ...original, id: `${original.id}-b`, duration: `${dur2.toFixed(1)}s`, name: `${original.name} (2)` };
                                   const newScenes = [...prev];
                                   newScenes.splice(idx, 1, scene1, scene2);
                                   return newScenes;
                                 });
                                 setSelectedSceneId(null);
                                 setSelectedTrackType(null);
                               }
                             }
                           }}
                           className="h-6 px-2 rounded hover:bg-white/10 flex items-center gap-1 transition-colors group/btn"
                           title="분할 (Split at Playhead)"
                         >
                            {/* Custom Split Icon */}
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-white/50 group-hover/btn:text-white">
                               <path d="M11 2H13V22H11V2Z" fill="currentColor"/>
                               <path d="M4 6H9V18H4V6Z" stroke="currentColor" strokeWidth="2"/>
                               <path d="M15 6H20V18H15V6Z" stroke="currentColor" strokeWidth="2"/>
                            </svg>
                         </button>

                         {/* Trim Right (앞으로 삭제 - 플레이헤드 뒤 부분 삭제) */}
                         <button
                           onClick={() => {
                             const activeScene = scenesWithTiming.find(s => integratedTime >= s.startTime && integratedTime < s.startTime + s.durationSec);
                             if (!activeScene) return;
                             const relTime = Math.round((integratedTime - activeScene.startTime) * 10) / 10;

                             if (selectedTrackType === 'subtitle' && selectedSubtitleId) {
                               setScenes(prev => prev.map(s => ({
                                 ...s,
                                 subtitleSegments: s.subtitleSegments?.map(seg =>
                                   seg.id === selectedSubtitleId && relTime > seg.startTime && relTime < seg.endTime
                                     ? { ...seg, endTime: relTime } : seg
                                 )
                               })));
                             } else if (selectedTrackType === 'scene' && selectedSceneId) {
                               const scene = scenesWithTiming.find(s => s.id === selectedSceneId);
                               if (scene && relTime > 0.5 && relTime < scene.durationSec) {
                                 setScenes(prev => prev.map(s => s.id === selectedSceneId ? { ...s, duration: `${relTime.toFixed(1)}s` } : s));
                               }
                             } else if (selectedTrackType === 'audio' && selectedAudioSceneId) {
                               setScenes(prev => prev.map(s => s.id === selectedAudioSceneId ? { ...s, audioUrl: undefined } : s));
                               setSelectedTrackType(null);
                               setSelectedAudioSceneId(null);
                             }
                           }}
                           className="h-6 px-2 rounded hover:bg-white/10 flex items-center gap-1 transition-colors group/btn"
                           title="앞으로 삭제 (Trim Right)"
                         >
                           <span className="material-symbols-outlined !text-[10px] text-white/30 group-hover/btn:text-white/60 -mr-1">arrow_forward</span>
                           <span className="material-symbols-outlined !text-[14px] text-white/50 group-hover/btn:text-white">content_cut</span>
                         </button>

                         <div className="w-px h-4 bg-white/10 mx-1" />

                         {/* Delete */}
                         <button
                           onClick={() => {
                             if (selectedTrackType === 'subtitle' && selectedSubtitleId) {
                               setScenes(prev => prev.map(s => ({
                                 ...s,
                                 subtitleSegments: s.subtitleSegments?.filter(seg => seg.id !== selectedSubtitleId)
                               })));
                               setSelectedSubtitleId(null);
                               setSelectedTrackType(null);
                             } else if (selectedTrackType === 'scene' && selectedSceneId) {
                               setScenes(prev => prev.filter(s => s.id !== selectedSceneId));
                               setSelectedSceneId(null);
                               setSelectedTrackType(null);
                             } else if (selectedTrackType === 'audio' && selectedAudioSceneId) {
                               setScenes(prev => prev.map(s => s.id === selectedAudioSceneId ? { ...s, audioUrl: undefined } : s));
                               setSelectedAudioSceneId(null);
                               setSelectedTrackType(null);
                             }
                           }}
                           className="h-6 px-2 rounded hover:bg-red-500/10 flex items-center gap-1 transition-colors group/btn"
                           title="삭제 (Delete)"
                         >
                           <span className="material-symbols-outlined !text-[14px] text-red-400/50 group-hover/btn:text-red-400">delete</span>
                         </button>

                         <div className="flex-1" />

                         {/* Deselect */}
                         <button
                           onClick={() => { setSelectedTrackType(null); setSelectedSubtitleId(null); setSelectedAudioSceneId(null); }}
                           className="h-6 px-2 rounded hover:bg-white/10 flex items-center transition-colors"
                           title="선택 해제"
                         >
                           <span className="material-symbols-outlined !text-[14px] text-white/30 hover:text-white/60">close</span>
                         </button>
                       </div>

                     {/* Timeline tracks */}
                     <div className="flex-1 relative overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#0d0a1a] select-none group/timeline">
                        <div className="relative h-full timeline-content-wrapper" style={{ width: `${timelineScale * 100}%`, minWidth: '100%' }}>
                        {/* Time Markers */}
                        <div className="h-5 border-b border-white/5 relative flex items-end">
                           {Array.from({ length: Math.ceil(totalVideoDuration) + 1 }).map((_, i) => (
                              <div 
                                key={i}
                                className="absolute bottom-0 border-l border-white/10 flex flex-col justify-end"
                                style={{ left: `${(i / totalVideoDuration) * 100}%`, height: i % 5 === 0 ? '10px' : '5px' }}
                              >
                                 {i % 5 === 0 && (
                                    <span className="absolute -top-4 -left-2 text-[8px] text-white/30 font-bold">{i}s</span>
                                 )}
                              </div>
                           ))}
                        </div>

                        <div className="px-4 py-2 space-y-1.5 relative">
                           {/* Audio Track (Real Waveform) */}
                           <div className="h-7 flex relative z-30">
                              {scenesWithTiming.map((s) => {
                                const peaks = waveformData[s.id];
                                return (
                                  <div
                                    key={`audio-${s.id}`}
                                    onClick={(e) => { 
                                      e.stopPropagation(); // prevent scene selection
                                      setSelectedAudioSceneId(s.id); 
                                      setSelectedTrackType('audio'); 
                                      setSelectedSubtitleId(null); 
                                      setSelectedSceneId(s.id); // highlight parent scene too
                                    }}
                                    className={`h-full relative border-r border-primary/10 overflow-hidden cursor-pointer ${
                                      selectedAudioSceneId === s.id && selectedTrackType === 'audio'
                                        ? 'ring-2 ring-primary ring-inset z-10 bg-primary/15 border border-primary/40'
                                        : s.audioUrl ? 'bg-primary/5 border border-primary/20 hover:bg-primary/10' : 'bg-white/3 border border-white/5 hover:bg-white/5'
                                    }`}
                                    style={{ width: `${(s.durationSec / totalVideoDuration) * 100}%` }}
                                  >
                                    {peaks ? (
                                      <div className="absolute inset-0 flex items-center gap-[1px] px-0.5">
                                        {peaks.map((v, i) => (
                                          <div
                                            key={i}
                                            className="flex-1 bg-primary/40 rounded-full min-w-[1px]"
                                            style={{ height: `${15 + v * 75}%` }}
                                          />
                                        ))}
                                      </div>
                                    ) : s.audioUrl ? (
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-[7px] text-primary/30 font-bold animate-pulse">분석중...</span>
                                      </div>
                                    ) : (
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-[7px] text-white/15 font-bold">음성 없음</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              <span className="absolute -top-3.5 left-2 text-[7px] font-bold text-primary/40 uppercase">Audio</span>
                           </div>

                           {/* Scene Track */}
                           <div className="h-11 flex relative z-30">
                              {scenesWithTiming.map((s, idx) => (
                                 <div 
                                    key={s.id}
                                    onClick={() => {
                                      setIntegratedTime(s.startTime);
                                      setSelectedSceneId(s.id);
                                      setSelectedTrackType('scene');
                                      setSelectedSubtitleId(null);
                                      setSelectedAudioSceneId(null);
                                    }}
                                    className={`h-full border border-white/10 relative transition-all cursor-pointer overflow-hidden group/scene ${
                                      selectedSceneId === s.id && selectedTrackType === 'scene' ? 'ring-2 ring-primary ring-inset z-10 bg-primary/10' : 'bg-white/5 hover:bg-white/10'
                                    }`}
                                    style={{ width: `${(s.durationSec / totalVideoDuration) * 100}%` }}
                                 >
                                    <img src={s.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover/scene:opacity-50 transition-opacity" />
                                    <div className="absolute inset-0 p-2 flex flex-col justify-between">
                                       <span className="text-[9px] font-black text-white bg-black/40 px-1 rounded self-start">#{idx + 1}</span>
                                       <span className="text-[8px] font-bold text-white/40 truncate">{s.script}</span>
                                    </div>
                                 </div>
                              ))}
                           </div>

                           {/* Subtitle Segments Track (CapCut-style interactive) */}
                           <div ref={subtitleTrackRef} className="h-7 flex relative z-30">
                              {scenesWithTiming.map((s) => {
                                const segs = s.subtitleSegments;
                                return (
                                  <div key={`sub-${s.id}`} data-scene-id={s.id} className="h-full relative border-r border-white/5" style={{ width: `${(s.durationSec / totalVideoDuration) * 100}%` }}>
                                    {segs && segs.length > 0 ? segs.map((seg: any) => {
                                      const isSelected = selectedSubtitleId === seg.id;
                                      return (
                                        <div
                                          key={seg.id}
                                          onClick={(e) => { e.stopPropagation(); setSelectedSubtitleId(seg.id); setSelectedTrackType('subtitle'); setSelectedSceneId(s.id); setSelectedAudioSceneId(null); }}
                                          className={`absolute top-0.5 bottom-0.5 rounded-sm overflow-hidden transition-all cursor-pointer group/seg ${
                                            isSelected
                                              ? 'bg-yellow-500/30 border-2 border-yellow-400 z-10 shadow-lg shadow-yellow-500/20'
                                              : 'bg-yellow-500/15 border border-yellow-500/30 hover:bg-yellow-500/25 hover:border-yellow-500/50'
                                          }`}
                                          style={{
                                            left: `${(seg.startTime / s.durationSec) * 100}%`,
                                            width: `${((seg.endTime - seg.startTime) / s.durationSec) * 100}%`,
                                          }}
                                        >
                                          <span className="text-[7px] font-bold text-yellow-300/80 px-1.5 truncate block leading-[24px] select-none">{seg.text}</span>
                                          {/* Edge drag handles */}
                                          <div
                                            className={`absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-yellow-400/60 transition-colors ${isSelected ? 'bg-yellow-400/40' : 'bg-transparent'}`}
                                            onMouseDown={(e) => { e.stopPropagation(); setSelectedSubtitleId(seg.id); setIsDraggingSubEdge({ segId: seg.id, sceneId: s.id, edge: 'left' }); }}
                                          />
                                          <div
                                            className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-yellow-400/60 transition-colors ${isSelected ? 'bg-yellow-400/40' : 'bg-transparent'}`}
                                            onMouseDown={(e) => { e.stopPropagation(); setSelectedSubtitleId(seg.id); setIsDraggingSubEdge({ segId: seg.id, sceneId: s.id, edge: 'right' }); }}
                                          />
                                        </div>
                                      );
                                    }) : (
                                      <div className="absolute inset-x-0 top-0.5 bottom-0.5 bg-white/3 rounded-sm flex items-center justify-center">
                                        <span className="text-[7px] text-white/15 font-bold">자막 없음</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              <span className="absolute -top-4 left-2 text-[7px] font-bold text-yellow-500/40 uppercase">Subtitles</span>

                              {/* Split button at playhead position */}
                              {(() => {
                                // 현재 플레이헤드 위치의 장면과 세그먼트 확인
                                const activeScene = scenesWithTiming.find(s =>
                                  integratedTime >= s.startTime && integratedTime < s.startTime + s.durationSec
                                );
                                if (!activeScene || !activeScene.subtitleSegments) return null;
                                const relTime = integratedTime - activeScene.startTime;
                                const hitSeg = activeScene.subtitleSegments.find(seg => relTime > seg.startTime + 0.2 && relTime < seg.endTime - 0.2);
                                if (!hitSeg) return null;
                                return (
                                  <button
                                    className="absolute z-30 -bottom-7 transform -translate-x-1/2 bg-yellow-500 hover:bg-yellow-400 text-black rounded-full w-6 h-6 flex items-center justify-center shadow-lg transition-all hover:scale-110 active:scale-95"
                                    style={{ left: `${(integratedTime / totalVideoDuration) * 100}%` }}
                                    title="자막 분할 (Split)"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const splitTime = Math.round(relTime * 10) / 10;
                                      setScenes(prev => prev.map(s => {
                                        if (s.id !== activeScene.id) return s;
                                        const newSegs = (s.subtitleSegments || []).flatMap(seg => {
                                          if (seg.id !== hitSeg.id) return [seg];
                                          // 분할: 2개의 새 세그먼트 생성
                                          const seg1 = { ...seg, id: `${seg.id}-a`, endTime: splitTime, text: seg.text };
                                          const seg2 = { ...seg, id: `${seg.id}-b`, startTime: splitTime, text: seg.text };
                                          return [seg1, seg2];
                                        });
                                        return { ...s, subtitleSegments: newSegs };
                                      }));
                                    }}
                                  >
                                    <span className="material-symbols-outlined !text-[14px]">content_cut</span>
                                  </button>
                                );
                              })()}
                           </div>

                           {/* Playhead */}
                           <div
                              className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_15px_rgba(55,19,236,1)] z-30 transition-none pointer-events-none"
                              style={{ left: `${(integratedTime / totalVideoDuration) * 100}%`, marginLeft: '16px' }}
                           >
                              <div 
                                 className="absolute -top-3 -left-[6px] w-4 h-6 bg-primary rounded-sm border-2 border-white shadow-xl cursor-grab active:cursor-grabbing pointer-events-auto flex items-center justify-center"
                                 onMouseDown={(e) => {
                                    e.stopPropagation();
                                    const container = e.currentTarget.closest('.timeline-content-wrapper'); 
                                    if (!container) return;
                                    
                                    const seekFromEvent = (ev: MouseEvent | React.MouseEvent) => {
                                      const rect = container.getBoundingClientRect();
                                      const x = ev.clientX - rect.left - 16;
                                      const percent = Math.max(0, Math.min(1, x / (rect.width - 32)));
                                      setIntegratedTime(percent * totalVideoDuration);
                                      // 드래그 중 해당 장면으로 전환
                                      const time = percent * totalVideoDuration;
                                      const matched = scenesWithTiming.find(s => time >= s.startTime && time < s.startTime + s.durationSec);
                                      if (matched && matched.id !== selectedSceneId) setSelectedSceneId(matched.id);
                                    };
                                    
                                    // Initial click
                                    // seekFromEvent(e); // Don't jump on initial grab, just start dragging
                                    
                                    const onMove = (ev: MouseEvent) => { ev.preventDefault(); seekFromEvent(ev); };
                                    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                                    window.addEventListener('mousemove', onMove);
                                    window.addEventListener('mouseup', onUp);
                                 }}
                               >
                                 <div className="w-0.5 h-3 bg-white/50 rounded-full"></div>
                               </div>
                           </div>

                           {/* Interactive Seek Layer (click + drag) */}
                           <div
                             className="absolute inset-0 z-20 cursor-crosshair"
                             onMouseDown={(e) => {
                                const seekFromEvent = (ev: MouseEvent | React.MouseEvent) => {
                                  const rect = e.currentTarget!.getBoundingClientRect();
                                  const x = ev.clientX - rect.left - 16;
                                  const percent = Math.max(0, Math.min(1, x / (rect.width - 32)));
                                  setIntegratedTime(percent * totalVideoDuration);
                                  // 드래그 중 해당 장면으로 전환
                                  const time = percent * totalVideoDuration;
                                  const matched = scenesWithTiming.find(s => time >= s.startTime && time < s.startTime + s.durationSec);
                                  if (matched && matched.id !== selectedSceneId) setSelectedSceneId(matched.id);
                                };
                                seekFromEvent(e as any);
                                const onMove = (ev: MouseEvent) => { ev.preventDefault(); seekFromEvent(ev); };
                                const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                                window.addEventListener('mousemove', onMove);
                                window.addEventListener('mouseup', onUp);
                             }}
                           />
                        </div>
                        </div>
                     </div>
                  </div>
                </div>

                {/* Right: Subtitle Styling Controls */}
                <div className="border-l border-[#292348] bg-[#1a162e] px-6 py-8 flex flex-col h-full overflow-y-auto custom-scrollbar">
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-8 flex items-center gap-2 border-b border-[#292348] pb-4">
                    <span className="material-symbols-outlined text-primary">format_paint</span>
                    Subtitle Design
                  </h3>

                  <div className="space-y-6">
                    {/* Preset Styles Selector (New) */}
                    <div className="mb-6">
                      <label className="text-xs text-secondary font-bold mb-3 block">사전 설정 스타일</label>
                      <div className="grid grid-cols-6 gap-2">
                         {[
                           // 1. None
                           { icon: 'block', label: '' }, 
                           // 2. White Text Black Border (Basic)
                           { color: '#ffffff', border: '#000000', width: 4, label: 'Aa' },
                           // 3. White Text Black Box (Rounded)
                           { color: '#ffffff', bg: '#000000', radius: 6, label: 'Aa' },
                           // 4. White Text Black Shadow
                           { color: '#ffffff', border: '#000000', width: 2, shadow: true, label: 'Aa' },
                           // 5. Yellow Text Black Border
                           { color: '#FFD700', border: '#000000', width: 4, label: 'Aa' },
                           // 6. Red Text White Border
                           { color: '#FF0000', border: '#FFFFFF', width: 4, label: 'Aa' },
                           // 7. Green Text Black Border (Neon?)
                           { color: '#00FF00', border: '#000000', width: 4, label: 'Aa' },
                           // 8. Blue Text White Border
                           { color: '#0000FF', border: '#FFFFFF', width: 4, label: 'Aa' },
                           // 9. Pink Text White Border
                           { color: '#FF00FF', border: '#FFFFFF', width: 4, label: 'Aa' },
                           // 10. Cyan Text Black Border
                           { color: '#00FFFF', border: '#000000', width: 4, label: 'Aa' },
                           // 11. Purple Glow
                           { color: '#FFFFFF', border: '#FF00FF', width: 0, glow: true, label: 'Aa' },
                           // 12. Yellow Glow
                           { color: '#FFFFFF', border: '#FFFF00', width: 0, glow: true, label: 'Aa' },
                         ].map((preset: any, i) => (
                           <button
                             key={i}
                             onClick={() => {
                               if (preset.icon === 'block') {
                                  setSubtitleColor('#FFFFFF');
                                  setSubtitleBorderColor('#000000');
                                  setSubtitleBorderWidth(0);
                                  setSubtitleBgColor('#000000');
                                  setSubtitleBgRadius(0);
                                  setSubtitleShadow(false);
                                  setSubtitleGlow(false);
                                  setShowSubtitleBg(false);
                                  return;
                               }
                               setSubtitleColor(preset.color);
                               if (preset.border) setSubtitleBorderColor(preset.border);
                               if (typeof preset.width === 'number') setSubtitleBorderWidth(preset.width);
                               if (preset.bg) setSubtitleBgColor(preset.bg); else setSubtitleBgColor('transparent');
                               if (preset.radius) setSubtitleBgRadius(preset.radius);
                               setSubtitleShadow(!!preset.shadow);
                               setSubtitleGlow(!!preset.glow);
                               setShowSubtitleBg(!!preset.bg);
                             }}
                             className="aspect-square rounded-lg border border-white/10 flex items-center justify-center hover:scale-105 transition-all text-2xl font-black relative overflow-hidden bg-[#1a162e]"
                             title={preset.label || '초기화'}
                           >
                             {preset.icon ? (
                               <span className="material-symbols-outlined text-white/30 group-hover:text-white/60">block</span>
                             ) : (
                               <span style={{
                                 color: preset.color,
                                 // Use paintOrder to draw stroke BEHIND the text fill
                                 // This fixes the issue of stroke appearing "inside" the letters
                                 WebkitTextStroke: preset.width ? `3px ${preset.border}` : undefined,
                                 paintOrder: 'stroke fill',
                                 textShadow: preset.shadow 
                                    ? '1px 1px 1px rgba(0,0,0,0.8)' 
                                    : preset.glow 
                                      ? `0 0 4px ${preset.border}, 0 0 8px ${preset.border}` 
                                      : undefined,
                                 backgroundColor: preset.bg || 'transparent',
                                 padding: preset.bg ? '0px 4px' : undefined,
                                 borderRadius: preset.bg ? '4px' : undefined,
                                 lineHeight: '1',
                                 display: 'block'
                               }}>
                                 {preset.label}
                               </span>
                             )}
                           </button>
                         ))}
                      </div>
                    </div>

                    {/* Selected Subtitle Segment Editor (CapCut-style) */}
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs text-primary font-bold flex items-center gap-1.5">
                          <span className="material-symbols-outlined !text-[14px]">edit_note</span>
                          선택된 자막
                        </label>
                        <span className="text-[10px] text-white/30 font-bold">Shot #{scenes.findIndex(s => s.id === selectedSceneId) + 1}</span>
                      </div>

                      {(() => {
                        // 선택된 세그먼트 찾기
                        const selectedSeg = selectedSubtitleId
                          ? scenes.flatMap(s => (s.subtitleSegments || []).map(seg => ({ ...seg, sceneId: s.id }))).find(seg => seg.id === selectedSubtitleId)
                          : null;

                        if (!selectedSeg) {
                          return (
                            <div className="text-center py-6">
                              <span className="material-symbols-outlined text-4xl text-white/10 block mb-2">touch_app</span>
                              <p className="text-xs text-white/30">타임라인에서 자막 블록을 클릭하세요</p>
                              <p className="text-[10px] text-white/20 mt-1">가위 버튼으로 분할, 양 끝 드래그로 길이 조절</p>
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-3">
                            <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono bg-[#0d0a1a] rounded-lg px-3 py-1.5">
                              <span className="material-symbols-outlined !text-[12px] text-yellow-500">schedule</span>
                              {selectedSeg.startTime.toFixed(1)}s ~ {selectedSeg.endTime.toFixed(1)}s
                              <span className="text-white/20 ml-auto">({(selectedSeg.endTime - selectedSeg.startTime).toFixed(1)}s)</span>
                            </div>
                            <textarea
                              value={selectedSeg.text}
                              onChange={(e) => {
                                setScenes(scenes.map(s => s.id === selectedSeg.sceneId ? {
                                  ...s,
                                  subtitleSegments: s.subtitleSegments?.map(seg => seg.id === selectedSeg.id ? { ...seg, text: e.target.value } : seg)
                                } : s));
                              }}
                              className="w-full bg-[#0d0a1a] border border-[#292348] rounded-lg p-3 text-white text-sm leading-relaxed focus:border-yellow-500 focus:outline-none resize-none"
                              rows={3}
                              placeholder="자막 텍스트 입력..."
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  // 플레이헤드를 이 세그먼트 시작 시간으로 이동
                                  const sceneWithTime = scenesWithTiming.find(s => s.id === selectedSeg.sceneId);
                                  if (sceneWithTime) {
                                    setIntegratedTime(sceneWithTime.startTime + selectedSeg.startTime);
                                  }
                                }}
                                className="flex-1 py-1.5 bg-[#292348] hover:bg-[#3b3267] text-white/70 hover:text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                              >
                                <span className="material-symbols-outlined !text-[14px]">play_arrow</span>
                                이동
                              </button>
                              <button
                                onClick={() => {
                                  // 선택된 세그먼트 삭제
                                  setScenes(scenes.map(s => {
                                    if (s.id !== selectedSeg.sceneId) return s;
                                    const remaining = (s.subtitleSegments || []).filter(seg => seg.id !== selectedSeg.id);
                                    return { ...s, subtitleSegments: remaining.length > 0 ? remaining : undefined };
                                  }));
                                  setSelectedSubtitleId(null);
                                }}
                                className="py-1.5 px-3 bg-[#292348] hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1 transition-all"
                              >
                                <span className="material-symbols-outlined !text-[14px]">delete</span>
                                삭제
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Quick actions (Removed) */}
                    <div className="hidden" />

                    <div className="h-px bg-[#292348]" />

                    <div className="flex items-center justify-between">
                      <label className="text-xs text-[#9b92c9] font-bold">자막 표시</label>
                      <button onClick={() => setShowSubtitles(!showSubtitles)} className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${showSubtitles ? 'bg-primary text-white' : 'bg-[#292348] text-white/50'}`}>{showSubtitles ? 'ON' : 'OFF'}</button>
                    </div>

                    {showSubtitles && (
                      <div className="space-y-5">
                        <div>
                          <label className="text-[10px] text-white/50 mb-1 block">글씨체</label>
                          <select value={subtitleFont} onChange={(e) => setSubtitleFont(e.target.value)} className="w-full bg-[#0d0a1a] border border-[#292348] rounded-lg text-sm text-white py-2 px-3 focus:border-primary focus:outline-none" >
                            <option>본고딕 (기본)</option>
                            <option>프리텐다드 Bold</option>
                            <option>나눔스퀘어 Black</option>
                            <option>G마켓 산스</option>
                            <option>배달의민족 주아</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div><label className="text-[10px] text-white/50 mb-1 block">글자 색상</label><input type="color" value={subtitleColor} onChange={(e) => setSubtitleColor(e.target.value)} className="w-full h-8 rounded border border-[#292348] bg-transparent cursor-pointer" /></div>
                          <div><label className="text-[10px] text-white/50 mb-1 block">테두리 색상</label><input type="color" value={subtitleBorderColor} onChange={(e) => setSubtitleBorderColor(e.target.value)} className="w-full h-8 rounded border border-[#292348] bg-transparent cursor-pointer" /></div>
                        </div>

                        <div className="space-y-4">
                           <div><label className="text-[10px] text-white/50 mb-1 block flex justify-between"><span>자막 크기</span><span>{subtitleFontSize}px</span></label><input type="range" min="6" max="48" value={subtitleFontSize} onChange={(e) => setSubtitleFontSize(parseInt(e.target.value))} className="w-full accent-primary" /></div>
                           <div><label className="text-[10px] text-white/50 mb-1 block flex justify-between"><span>테두리 두께</span><span>{subtitleBorderWidth}px</span></label><input type="range" min="0" max="8" value={subtitleBorderWidth} onChange={(e) => setSubtitleBorderWidth(parseInt(e.target.value))} className="w-full accent-primary" /></div>
                        </div>

                        <div className="h-px bg-[#292348]" />

                        <div className="space-y-4">
                          <div className="flex items-center justify-between"><label className="text-[10px] text-white/50">배경 상자 표시</label><button onClick={() => setShowSubtitleBg(!showSubtitleBg)} className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${showSubtitleBg ? 'bg-primary/20 text-primary border border-primary' : 'bg-[#292348] text-white/50 border border-transparent'}`}>{showSubtitleBg ? 'ON' : 'OFF'}</button></div>
                          {showSubtitleBg && (
                            <div className="space-y-4">
                              <div><label className="text-[10px] text-white/50 mb-1 block">배경 색상</label><input type="color" value={subtitleBgColor} onChange={(e) => setSubtitleBgColor(e.target.value)} className="w-full h-8 rounded border border-[#292348] bg-transparent cursor-pointer" /></div>
                              <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] text-white/50 mb-1 block">모서리 곡률</label><input type="range" min="0" max="50" value={subtitleBgRadius === 9999 ? 50 : subtitleBgRadius} onChange={(e) => setSubtitleBgRadius(parseInt(e.target.value) === 50 ? 9999 : parseInt(e.target.value))} className="w-full accent-primary" /></div>
                                <div className="space-y-4">
                                  <div><label className="text-[10px] text-white/50 mb-1 block flex justify-between"><span>가로 여백 (Padding X)</span><span>{subtitleBgWidth}px</span></label><input type="range" min="0" max="100" value={subtitleBgWidth} onChange={(e) => setSubtitleBgWidth(parseInt(e.target.value))} className="w-full accent-primary" /></div>
                                  <div><label className="text-[10px] text-white/50 mb-1 block flex justify-between"><span>세로 여백 (Padding Y)</span><span>{subtitleBgHeight}px</span></label><input type="range" min="0" max="50" value={subtitleBgHeight} onChange={(e) => setSubtitleBgHeight(parseInt(e.target.value))} className="w-full accent-primary" /></div>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div><label className="text-[10px] text-white/50 mb-1 block flex justify-between"><span>세로 위치</span><span>{subtitleY}%</span></label><input type="range" min="0" max="95" value={subtitleY} onChange={(e) => setSubtitleY(parseInt(e.target.value))} className="w-full accent-primary" /></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </main>
          );
        })();

      case CreationStep.FINAL:
        return (() => {
          const currentScene = scenesWithTiming.find(s => 
            integratedTime >= s.startTime && integratedTime < s.startTime + s.durationSec
          ) || scenes[0];

          if (!currentScene) return null;

          return (
            <main className="flex-1 flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[#0a0618]">
              {/* Top Bar */}
              <div className="h-14 border-b border-[#292348] flex items-center justify-between px-6 bg-[#131022]">
                <div className="flex items-center gap-4">
                  <h2 className="text-white font-bold text-lg flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">movie</span>
                    10단계: 최종 영상 확인 및 다운로드
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveProject}
                    className="px-4 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary hover:text-white border border-primary/50 hover:border-primary rounded-lg font-bold text-xs transition-all flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined !text-base">save</span>
                    프로젝트 저장
                  </button>
                  <button
                    onClick={() => setStep(CreationStep.SUBTITLE)}
                    className="px-4 py-1.5 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined !text-base">arrow_back</span>
                    이전 단계
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden grid grid-cols-[1fr_360px]">
                {/* Left: Preview & Unified Timeline (COPIED FROM STEP 9) */}
                <div className="flex flex-col bg-black min-h-0 relative h-full">
                  {/* Top: Video Preview */}
                  <div 
                    className="relative flex flex-col items-center justify-center p-4 bg-[url('/grid.svg')] bg-center overflow-hidden select-none min-h-0"
                    style={{ height: `calc(100% - ${timelineHeight}px)` }}
                  >
                    <div className="absolute inset-0 bg-cover bg-center opacity-20 blur-3xl scale-150 pointer-events-none" style={{ backgroundImage: `url(${currentScene.imageUrl})` }} />

                    <div
                      ref={previewRef}
                      className="relative shadow-2xl rounded-lg overflow-hidden border border-white/10 bg-black flex-shrink"
                      style={{
                        aspectRatio: videoLength === 'shorts' ? '9/16' : '16/9',
                        maxHeight: 'calc(100% - 16px)',
                        maxWidth: videoLength === 'shorts' ? '40%' : '95%'
                      }}
                    >
                      {currentScene.videoClipUrl && currentScene.videoClipUrl.length > 50 ? (
                        <video
                          ref={videoRef}
                          key={currentScene.videoClipUrl}
                          src={currentScene.videoClipUrl}
                          playsInline 
                          className="w-full h-full object-contain" 
                          onLoadedData={syncMediaToTimeline}
                          onEnded={() => {
                            if (!isIntegratedPlaying) setIsPlayingScene(false);
                          }} 
                        />
                      ) : (
                        <img src={currentScene.imageUrl} className="w-full h-full object-cover" alt="" />
                      )}

                      <div className="absolute inset-0 flex items-center justify-center cursor-pointer group/play" onClick={(e) => {
                        setIsIntegratedPlaying(!isIntegratedPlaying);
                      }}>
                         {(!isPlayingScene && !isIntegratedPlaying) && (
                            <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white transition-transform group-hover/play:scale-110 shadow-2xl">
                               <span className="material-symbols-outlined text-5xl ml-2 text-white">play_arrow</span>
                            </div>
                         )}
                      </div>

                      {showSubtitles && currentScene.script && (() => {
                        const sceneWithTime = scenesWithTiming.find(s => s.id === currentScene.id);
                        const relativeTime = sceneWithTime ? integratedTime - sceneWithTime.startTime : 0;
                        const segments = currentScene.subtitleSegments;
                        let activeSegment = null;
                        if (segments && segments.length > 0) {
                          activeSegment = segments.find(seg => relativeTime >= seg.startTime && relativeTime < seg.endTime);
                          if (!activeSegment) {
                            const past = segments.filter(seg => relativeTime >= seg.endTime).sort((a, b) => b.endTime - a.endTime);
                            if (past.length > 0) {
                              const nextSeg = segments.find(seg => seg.startTime > relativeTime);
                              if (nextSeg || !nextSeg) activeSegment = past[0];
                            }
                          }
                        }
                        const displayText = segments && segments.length > 0 ? (activeSegment?.text || '') : currentScene.script;
                        if (!displayText) return null;
                        return (
                        <div className="absolute left-0 right-0 flex justify-center" style={{ bottom: `${subtitleY}%` }}>
                          <div
                            className={`flex items-center justify-center shadow-xl transition-all relative subtitle-container ${showSubtitleBg ? 'backdrop-blur-md' : ''}`}
                            style={{
                              backgroundColor: showSubtitleBg ? subtitleBgColor : 'transparent',
                              borderRadius: `${subtitleBgRadius}px`,
                              width: 'auto',
                              height: 'auto',
                              minWidth: showSubtitleBg ? '40px' : 'auto',
                              minHeight: showSubtitleBg ? '30px' : 'auto',
                              padding: showSubtitleBg ? `${subtitleBgHeight/2}px ${subtitleBgWidth/2}px` : '0px',
                              fontFamily: subtitleFont,
                              userSelect: 'none',
                              boxShadow: showSubtitleBg ? '0 4px 6px rgba(0,0,0,0.1)' : 'none',
                              maxWidth: '90%'
                            }}
                          >
                            <p
                              className="font-bold leading-tight text-center whitespace-pre-wrap px-2 outline-none w-full cursor-default"
                              style={{
                                color: subtitleColor,
                                fontSize: `${subtitleFontSize}px`,
                                fontWeight: subtitleTemplate === "bold" ? "bold" : "normal",
                                fontStyle: subtitleTemplate === "italic" ? "italic" : "normal",
                                textShadow: subtitleShadow ? '2px 2px 2px rgba(0,0,0,0.8)' : subtitleGlow ? `0 0 10px ${subtitleBorderColor || subtitleColor}, 0 0 20px ${subtitleBorderColor || subtitleColor}` : 'none',
                                WebkitTextStroke: subtitleBorderWidth > 0 ? `${subtitleBorderWidth}px ${subtitleBorderColor}` : undefined,
                                paintOrder: 'stroke fill',
                                textAlign: "center",
                                lineHeight: 1.4,
                                margin: 0,
                                zIndex: 10
                              }}
                            >
                              {displayText}
                            </p>
                          </div>
                        </div>
                        );
                      })()}

                      {isIntegratedPlaying && currentScene.audioUrl && (
                        <div className="absolute top-4 right-4 bg-primary/20 backdrop-blur-md border border-primary/30 rounded-full px-3 py-1 flex items-center gap-2">
                           <div className="flex gap-0.5 items-end h-3">
                              <div className="w-0.5 h-1.5 bg-primary animate-[bounce_1s_infinite]"></div>
                              <div className="w-0.5 h-3 bg-primary animate-[bounce_0.8s_infinite]"></div>
                              <div className="w-0.5 h-2 bg-primary animate-[bounce_1.2s_infinite]"></div>
                           </div>
                           <span className="text-[10px] font-bold text-primary">AUDIO ON</span>
                        </div>
                      )}
                    </div>

                    <audio 
                      ref={audioRef} 
                      key={currentScene.audioUrl} 
                      src={currentScene.audioUrl} 
                      className="hidden" 
                      onLoadedData={syncMediaToTimeline}
                      autoPlay={isIntegratedPlaying}
                    />
                  </div>

                  {/* Resize Handle */}
                  <div
                    className="h-4 -mt-2 bg-transparent hover:bg-primary/10 cursor-row-resize z-50 flex justify-center items-center group/resize relative"
                    onMouseDown={(e) => { e.preventDefault(); setIsResizingTimeline(true); }}
                  >
                     <div className="absolute inset-x-0 h-0.5 bg-[#292348] group-hover/resize:bg-primary transition-colors top-1/2 -translate-y-1/2" />
                     <div className="w-10 h-1 rounded-full bg-white/20 group-hover/resize:bg-white/50 transition-colors relative z-10" />
                  </div>

                  {/* Bottom: Timeline Bar */}
                  <div 
                    className="bg-[#131022] border-t border-[#292348] flex flex-col overflow-hidden relative"
                    style={{ height: timelineHeight }}
                  >
                     {/* Control Bar */}
                     <div className="h-10 px-4 flex items-center justify-between bg-[#1a162e]">
                        <div className="flex items-center gap-4">
                           <button
                             onClick={() => setIsIntegratedPlaying(!isIntegratedPlaying)}
                             className="size-7 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center text-white shadow-lg transition-transform active:scale-95"
                           >
                              <span className="material-symbols-outlined text-lg">
                                {isIntegratedPlaying ? 'pause' : 'play_arrow'}
                              </span>
                           </button>
                           <div className="flex items-baseline gap-1">
                              <span className="text-white font-bold text-xs tracking-tighter">
                                 {Math.floor(integratedTime / 60)}:{String(Math.floor(integratedTime % 60)).padStart(2, '0')}
                              </span>
                              <span className="text-white/30 text-[10px] font-bold">/</span>
                              <span className="text-white/30 text-[10px] font-bold">
                                 {Math.floor(totalVideoDuration / 60)}:{String(Math.floor(totalVideoDuration % 60)).padStart(2, '0')}
                              </span>
                           </div>
                        </div>

                        <div className="flex items-center gap-2">
                           <div className="flex items-center gap-2 border-r border-white/10 pr-3 mr-1">
                              <span className="material-symbols-outlined text-sm text-white/50">zoom_in</span>
                              <input 
                                type="range" 
                                min="1" 
                                max="8" 
                                step="0.1" 
                                value={timelineScale} 
                                onChange={(e) => setTimelineScale(parseFloat(e.target.value))}
                                className="w-20 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:bg-white/80 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-white"
                              />
                           </div>
                           <span className="material-symbols-outlined text-sm text-white/50 cursor-pointer hover:text-white">volume_up</span>
                        </div>
                     </div>

                     {/* Toolbar (Read-only for Final Step, mostly) */}
                     <div className={`h-10 px-4 flex items-center gap-1 bg-[#0d0a1a] border-t border-b border-[#292348] opacity-50 pointer-events-none`}>
                         <div className="flex items-center gap-2 text-xs text-white/30 font-bold">
                            <span className="material-symbols-outlined text-sm">lock</span>
                            최종 렌더링 단계 (수정 불가)
                         </div>
                     </div>

                     {/* Timeline tracks */}
                     <div className="flex-1 relative overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#0d0a1a] select-none group/timeline">
                        <div className="relative h-full timeline-content-wrapper" style={{ width: `${timelineScale * 100}%`, minWidth: '100%' }}>
                        {/* Time Markers */}
                        <div className="h-5 border-b border-white/5 relative flex items-end">
                           {Array.from({ length: Math.ceil(totalVideoDuration) + 1 }).map((_, i) => (
                              <div 
                                key={i}
                                className="absolute bottom-0 border-l border-white/10 flex flex-col justify-end"
                                style={{ left: `${(i / totalVideoDuration) * 100}%`, height: i % 5 === 0 ? '10px' : '5px' }}
                              >
                                 {i % 5 === 0 && (
                                    <span className="absolute -top-4 -left-2 text-[8px] text-white/30 font-bold">{i}s</span>
                                 )}
                              </div>
                           ))}
                        </div>

                        <div className="px-4 py-2 space-y-1.5 relative">
                           {/* Audio Track */}
                           <div className="h-7 flex relative z-30">
                              {scenesWithTiming.map((s) => {
                                const peaks = waveformData[s.id];
                                return (
                                  <div
                                    key={`audio-${s.id}`}
                                    className={`h-full relative border-r border-primary/10 overflow-hidden ${s.audioUrl ? 'bg-primary/5 border border-primary/20' : 'bg-white/3 border border-white/5'}`}
                                    style={{ width: `${(s.durationSec / totalVideoDuration) * 100}%` }}
                                  >
                                    {peaks ? (
                                      <div className="absolute inset-0 flex items-center gap-[1px] px-0.5">
                                        {peaks.map((v, i) => (
                                          <div key={i} className="flex-1 bg-primary/40 rounded-full min-w-[1px]" style={{ height: `${15 + v * 75}%` }} />
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-[7px] text-white/15 font-bold">Audio</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                           </div>

                           {/* Scene Track */}
                           <div className="h-11 flex relative z-30">
                              {scenesWithTiming.map((s, idx) => (
                                 <div 
                                    key={s.id}
                                    className="h-full border border-white/10 relative overflow-hidden bg-white/5"
                                    style={{ width: `${(s.durationSec / totalVideoDuration) * 100}%` }}
                                 >
                                    <img src={s.imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-30" />
                                    <div className="absolute inset-0 p-2 flex flex-col justify-between">
                                       <span className="text-[9px] font-black text-white bg-black/40 px-1 rounded self-start">#{idx + 1}</span>
                                       <span className="text-[8px] font-bold text-white/40 truncate">{s.script}</span>
                                    </div>
                                 </div>
                              ))}
                           </div>

                           {/* Subtitle Segments Track */}
                           <div ref={subtitleTrackRef} className="h-7 flex relative z-30">
                              {scenesWithTiming.map((s) => {
                                const segs = s.subtitleSegments;
                                return (
                                  <div key={`sub-${s.id}`} className="h-full relative border-r border-white/5" style={{ width: `${(s.durationSec / totalVideoDuration) * 100}%` }}>
                                    {segs && segs.length > 0 ? segs.map((seg: any) => (
                                        <div
                                          key={seg.id}
                                          className="absolute top-0.5 bottom-0.5 rounded-sm overflow-hidden bg-yellow-500/15 border border-yellow-500/30"
                                          style={{
                                            left: `${(seg.startTime / s.durationSec) * 100}%`,
                                            width: `${((seg.endTime - seg.startTime) / s.durationSec) * 100}%`,
                                          }}
                                        >
                                          <span className="text-[7px] font-bold text-yellow-300/80 px-1.5 truncate block leading-[24px] select-none">{seg.text}</span>
                                        </div>
                                    )) : null}
                                  </div>
                                );
                              })}
                           </div>

                           {/* Playhead */}
                           <div
                              className="absolute top-0 bottom-0 w-0.5 bg-primary shadow-[0_0_15px_rgba(55,19,236,1)] z-30 transition-none pointer-events-none"
                              style={{ left: `${(integratedTime / totalVideoDuration) * 100}%`, marginLeft: '16px' }}
                           >
                              <div className="absolute -top-3 -left-[6px] w-4 h-6 bg-primary rounded-sm border-2 border-white shadow-xl flex items-center justify-center">
                                 <div className="w-0.5 h-3 bg-white/50 rounded-full"></div>
                              </div>
                           </div>

                           {/* Interactive Seek Layer */}
                           <div
                             className="absolute inset-0 z-20 cursor-crosshair"
                             onMouseDown={(e) => {
                                const seekFromEvent = (ev: MouseEvent | React.MouseEvent) => {
                                  const rect = e.currentTarget!.getBoundingClientRect();
                                  const x = ev.clientX - rect.left - 16;
                                  const percent = Math.max(0, Math.min(1, x / (rect.width - 32)));
                                  setIntegratedTime(percent * totalVideoDuration);
                                };
                                seekFromEvent(e as any);
                                const onMove = (ev: MouseEvent) => { ev.preventDefault(); seekFromEvent(ev); };
                                const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
                                window.addEventListener('mousemove', onMove);
                                window.addEventListener('mouseup', onUp);
                             }}
                           />
                        </div>
                        </div>
                     </div>
                  </div>
                </div>

                {/* Right: Export Options */}
                <div className="border-l border-[#292348] bg-[#1a162e] px-6 py-8 flex flex-col h-full overflow-y-auto custom-scrollbar">
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-8 flex items-center gap-2 border-b border-[#292348] pb-4">
                    <span className="material-symbols-outlined text-primary">download</span>
                    Export
                  </h3>

                  <div className="space-y-6">
                    {/* Rendering Progress */}
                    <div className="p-5 bg-white/5 rounded-xl border border-white/10">
                      <div className="flex items-center justify-between mb-2 text-xs font-bold">
                        <span className="text-white/50">진행률</span>
                        <span className="text-primary">{renderProgress}%</span>
                      </div>
                      <div className="w-full bg-[#0d0a1a] h-2 rounded-full overflow-hidden mb-3 border border-white/5">
                        <div 
                          className="h-full bg-primary shadow-[0_0_10px_rgba(55,19,236,0.5)] transition-all duration-300"
                          style={{ width: `${renderProgress}%` }}
                        />
                      </div>
                      {renderError ? (
                        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 p-2 rounded">
                          <span className="material-symbols-outlined !text-sm">error</span>
                          {renderError}
                        </div>
                      ) : (
                        <p className="text-[10px] text-white/30">
                          {renderProgress === 100 ? '렌더링 완료. 다운로드 가능합니다.' : '영상을 렌더링하고 있습니다...'}
                        </p>
                      )}
                    </div>

                    {/* Export Actions */}
                    <button 
                      onClick={() => {
                        if (renderProgress === 100) {
                            const finalVideoUrl = scenes.find(s => s.videoClipUrl)?.videoClipUrl;
                            if (finalVideoUrl) {
                               const triggerDownload = async () => {
                                  try {
                                     const response = await fetch(finalVideoUrl);
                                     const blob = await response.blob();
                                     const url = window.URL.createObjectURL(blob);
                                     const a = document.createElement('a');
                                     a.href = url;
                                     a.download = `VidAI_Final_${Date.now()}.mp4`;
                                     document.body.appendChild(a);
                                     a.click();
                                     window.URL.revokeObjectURL(url);
                                     document.body.removeChild(a);
                                  } catch (e) {
                                     window.open(finalVideoUrl, '_blank');
                                  }
                               };
                               triggerDownload();
                            }
                        } else {
                             handleFinalRender();
                        }
                      }}
                      disabled={isRendering}
                      className="w-full py-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed group"
                    >
                      {isRendering ? (
                         <span className="material-symbols-outlined animate-spin">sync</span>
                      ) : (
                         <span className="material-symbols-outlined group-hover:scale-110 transition-transform">download</span>
                      )}
                      {isRendering ? '렌더링 중...' : (renderProgress === 100 ? 'MP4 다운로드 (저장)' : '최종 렌더링 및 다운로드')}
                    </button>

                    <button className="w-full py-3 bg-[#0d0a1a] border border-white/10 hover:border-red-500/50 hover:bg-red-500/5 text-white/70 hover:text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                       <span className="material-symbols-outlined text-red-500">smart_display</span>
                       유튜브 바로 공유
                    </button>

                    <div className="h-px bg-white/10 my-2" />

                    <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
                       <h4 className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Metadata</h4>
                       <div className="flex justify-between text-xs">
                          <span className="text-white/40">해상도</span>
                          <span className="text-white/80">1920 x 1080</span>
                       </div>
                       <div className="flex justify-between text-xs">
                          <span className="text-white/40">프레임</span>
                          <span className="text-white/80">30 fps</span>
                       </div>
                       <div className="flex justify-between text-xs">
                          <span className="text-white/40">길이</span>
                          <span className="text-white/80">{Math.floor(totalVideoDuration / 60)}분 {Math.floor(totalVideoDuration % 60)}초</span>
                       </div>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          );
        })();
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden text-white bg-background-dark font-sans selection:bg-primary/30 selection:text-white">

      {showRecoveryModal && hasAutoSave && (
        <RecoveryModal
          timestamp={loadAutoSave()?.timestamp || new Date().toISOString()}
          onRecover={handleRecoverAutoSave}
          onDismiss={() => {
            setShowRecoveryModal(false);
            clearAutoSave();
          }}
        />
      )}

      {renderSidebar()}

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {renderTopNav()}

        <div className="flex-1 overflow-y-auto custom-scrollbar relative z-10 flex flex-col">
          {renderContent()}
        </div>

      {/* Non-blocking Progress Indicator (Toast Style) */}
      {(isLoading || isGeneratingTTS || isRendering || isGeneratingVideo) && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-5 fade-in duration-300">
           <div className="bg-[#1a162e] border border-primary/50 rounded-xl shadow-2xl p-5 w-80 flex flex-col gap-3 relative overflow-hidden">
              {/* Animated Background Progress */}
              <div 
                className="absolute bottom-0 left-0 h-1 bg-primary transition-all duration-300 ease-out"
                style={{ width: `${loadingProgress || ttsProgress || renderProgress || 100}%` }}
              />
              
              <div className="flex items-start gap-4 z-10">
                 <div className="relative">
                    <div className="w-10 h-10 rounded-full border-2 border-primary/30 border-t-primary animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                       <span className="material-symbols-outlined text-primary text-lg animate-pulse">bolt</span>
                    </div>
                 </div>
                 <div className="flex-1">
                    <h4 className="text-white font-bold text-sm mb-1">엔진 가동 중...</h4>
                    <p className="text-[#9b92c9] text-xs leading-relaxed line-clamp-2">
                      {loadingMessage || ttsError || "작업을 처리하고 있습니다."}
                    </p>
                    <p className="text-primary text-[10px] font-bold mt-2 text-right">
                       {(loadingProgress || ttsProgress || renderProgress) > 0 ? `${loadingProgress || ttsProgress || renderProgress}%` : ''}
                    </p>
                 </div>
              </div>
           </div>
        </div>
      )}
      </div>
      
      {/* Modals */}

      
      <ProjectsModal
        show={showProjectsModal}
        onClose={() => setShowProjectsModal(false)}
        projects={savedProjects}
        onLoadProject={(project) => {
          setCurrentProjectId(project.id);
          setTopic(project.topic);
          setVideoLength(project.videoLength);
          setVideoTone(project.videoTone);
          setScriptBlocks(project.scriptBlocks);
          setScenes(project.scenes);
          setSelectedVoice(project.selectedVoice);
          setSelectedMotion(project.selectedMotion);
          setSelectedBgm(project.selectedBgm);
          setStep(CreationStep.SCRIPT);
        }}
      />
      
      <TemplatesModal
        show={showTemplatesModal}
        onClose={() => setShowTemplatesModal(false)}
        onApplyTemplate={applyTemplate}
      />

      {/* Model Selection Modal */}
      {showModelSelectModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowModelSelectModal(false)} />
          <div className="relative bg-[#1a162e] border border-[#292348] rounded-2xl p-8 w-[500px] max-w-[90vw] shadow-2xl">
            <h2 className="text-white text-xl font-bold mb-2">영상 생성 모델 선택</h2>
            <p className="text-[#9b92c9] text-sm mb-6">이미지를 영상으로 변환할 AI 모델을 선택하세요.</p>

            <div className="space-y-3 mb-8">
              {(settings?.video.providers || []).map(provider => (
                <button
                  key={provider.id}
                  disabled={!provider.enabled}
                  onClick={() => setVideoProvider(provider.id)}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    !provider.enabled ? 'border-[#292348] opacity-50 cursor-not-allowed' :
                    videoProvider === provider.id
                      ? 'border-primary bg-primary/10'
                      : 'border-[#292348] hover:border-white/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-white font-bold flex items-center gap-2">
                        {provider.label}
                        {provider.enabled ? (
                          <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">사용 가능</span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">Coming Soon</span>
                        )}
                      </div>
                      <p className="text-[#9b92c9] text-xs mt-1">{provider.description}</p>
                    </div>
                    {videoProvider === provider.id && (
                      <span className="material-symbols-outlined text-primary">check_circle</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowModelSelectModal(false)}
                className="flex-1 py-3 rounded-xl border border-[#292348] text-white font-bold hover:bg-[#292348] transition-all"
              >
                취소
              </button>
              <button
                onClick={() => {
                  setShowModelSelectModal(false);
                  handleGenerateMotions();
                }}
                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition-all flex items-center justify-center gap-2"
              >
                <span>영상 생성 시작</span>
                <span className="material-symbols-outlined text-sm">play_arrow</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {settings && (
        <AdminModal 
          isOpen={isAdminModalOpen} 
          onClose={() => setIsAdminModalOpen(false)} 
          settings={settings}
          onSettingsUpdate={(newSettings) => setSettings(newSettings)}
        />
      )}

      <style>{`
        .active-card {
            border-color: #3713ec !important;
            background: rgba(55, 19, 236, 0.1) !important;
            box-shadow: 0 0 20px rgba(55, 19, 236, 0.2) !important;
        }
        .custom-glow {
            box-shadow: 0 0 30px rgba(55, 19, 236, 0.2);
        }
      `}</style>
    </div>
  );
};

export default App;
