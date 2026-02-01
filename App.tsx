import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';

import { CreationStep, ScriptBlock, Scene, Voice } from './types';
import { INITIAL_SCRIPT_BLOCKS, VOICES, MOTION_STYLES } from './constants';
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
import { generateFalImage } from './services/imageService';

const IMAGE_STYLES = [
  { id: 'cinematic', label: '시네마틱', icon: 'movie', prefix: 'Cinematic film still, dramatic lighting, shallow depth of field, 35mm film grain, professional cinematography', color: '#e67e22' },
  { id: 'anime', label: '애니메이션', icon: 'animation', prefix: 'Anime style illustration, vibrant colors, detailed character design, Studio Ghibli inspired, clean linework', color: '#e74c3c' },
  { id: 'realistic', label: '사실적', icon: 'photo_camera', prefix: 'Photorealistic, ultra detailed, 8K UHD, DSLR photography, natural lighting, sharp focus', color: '#3498db' },
  { id: '3d', label: '3D 렌더', icon: 'view_in_ar', prefix: '3D render, Pixar style, octane render, volumetric lighting, soft shadows, vibrant colors', color: '#9b59b6' },
  { id: 'watercolor', label: '수채화', icon: 'brush', prefix: 'Watercolor painting, soft brushstrokes, pastel colors, artistic illustration, paper texture', color: '#1abc9c' },
  { id: 'minimal', label: '미니멀', icon: 'crop_square', prefix: 'Minimalist illustration, flat design, clean lines, modern graphic design, limited color palette', color: '#95a5a6' },
];

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
  { step: CreationStep.CUT_SELECTION, label: '시각화', icon: 'image' },
  { step: CreationStep.MOTION, label: '모션', icon: 'animation' },
  { step: CreationStep.AUDIO_STYLE, label: '오디오', icon: 'graphic_eq' },
  { step: CreationStep.SUBTITLE, label: '자막', icon: 'subtitles' },
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

  // 대본 미리보기 상태
  const [scriptPreview, setScriptPreview] = useState<{synopsis: string, shots: {title: string, content: string}[]} | null>(null);

  // 2단계 (Shot 설계)용 상태
  const [synopsis, setSynopsis] = useState("");
  const [shots, setShots] = useState<{id: string, content: string}[]>([]);
  const [selectedImageStyle, setSelectedImageStyle] = useState('cinematic');

  const [videoLength, setVideoLength] = useState<"shorts" | "long">("shorts");
  const [videoTone, setVideoTone] = useState<
    "info" | "story" | "emotional" | "fast"
  >("info");
  const [selectedCutCount, setSelectedCutCount] = useState<number | "auto">(8);



  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>(
    INITIAL_SCRIPT_BLOCKS,
  );
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<Voice | null>(VOICES[0]);
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
  const [videoProvider, setVideoProvider] = useState<'kling' | 'kling-standard' | 'veo' | 'sora'>('kling');
  const [showModelSelectModal, setShowModelSelectModal] = useState(false);
  const [motionError, setMotionError] = useState<string | null>(null);

  // Audio & Subtitle Step specific states
  const [subtitleFont, setSubtitleFont] = useState("본고딕 (기본)");
  const [subtitleColor, setSubtitleColor] = useState("#FFFFFF");
  const [subtitleBgColor, setSubtitleBgColor] = useState("#000000"); // 배경 색상 (기존 Highlight)
  const [subtitleBorderColor, setSubtitleBorderColor] = useState("#3713EC"); // 글씨 테두리 색상
  const [subtitleBorderWidth, setSubtitleBorderWidth] = useState(0); // 글씨 테두리 두께 최소값 0
  const [subtitleFontSize, setSubtitleFontSize] = useState(12); // 자막 크기 초기값 12, 최소값 6으로 변경 예정
  const [subtitleBgRadius, setSubtitleBgRadius] = useState(0); // 배경 둥근 정도 최소값 0
  const [subtitleBgWidth, setSubtitleBgWidth] = useState(150); // 배경 가로 크기
  const [subtitleBgHeight, setSubtitleBgHeight] = useState(40); // 배경 세로 크기
  const [subtitleY, setSubtitleY] = useState(0); // 세로 위치 최하단 0%
  const [showSubtitleBg, setShowSubtitleBg] = useState(true);
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
    if (step === CreationStep.SCRIPT && scenes.length > 0) {
      // 1. 시놉시스 자동 생성
      const summary = topic || scenes[0].content.substring(0, 50) + "...";
      setSynopsis(summary);

      // 2. Shot 자동 분할
      const allContent = scenes.map(s => s.script).join(' ');
      const sentences = allContent.match(/[^.!?]+[.!?]+[\s]*|[^.!?]+$/g) || [allContent];
      
      const newShots = sentences
        .map(s => s.trim())
        .filter(s => s.length > 0)
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

      const systemPrompt = `당신은 유튜브 영상 대본 전문 작가입니다.
사용자가 제공하는 주제로 ${duration} 분량의 유튜브 영상 대본을 작성하세요.
언어: ${targetLanguage}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요:
{
  "synopsis": "영상 전체 요약 (1~2문장)",
  "shots": [
    { "title": "장면 제목", "content": "해당 장면의 내레이션/대사 텍스트" }
  ]
}

규칙:
- shots는 3~8개로 구성
- 각 shot의 content는 자연스러운 내레이션 문장으로 작성
- 시청자의 관심을 끄는 인트로와 마무리 포함
- JSON만 출력하고 마크다운 코드블록이나 설명을 붙이지 마세요`;

      const output = await generateLLM({
        prompt: `주제: ${topic}`,
        system_prompt: systemPrompt,
        model: 'google/gemini-2.5-flash',
        temperature: 0.7,
        max_tokens: 800,
      });

      // JSON 파싱 (코드블록 래핑 제거)
      const cleaned = output.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!parsed.shots || !Array.isArray(parsed.shots)) {
        throw new Error('AI 응답에 shots 배열이 없습니다.');
      }

      // 미리보기 상태에 저장 (바로 이동하지 않음)
      setScriptPreview({
        synopsis: parsed.synopsis || topic,
        shots: parsed.shots.map((shot: any, idx: number) => ({
          title: shot.title || `장면 ${idx + 1}`,
          content: shot.content || shot.text || '',
        })),
      });
    } catch (error: any) {
      console.error("Script generation failed", error);
      const errorMessage = error.message || JSON.stringify(error);
      alert(`대본 생성 실패: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 대본 미리보기 확정 → 대본 단계로 이동
  const handleConfirmPreview = () => {
    if (!scriptPreview) return;

    setSynopsis(scriptPreview.synopsis);

    const newShots = scriptPreview.shots.map((shot, idx) => ({
      id: `shot-${Date.now()}-${idx}`,
      content: shot.content,
    }));
    setShots(newShots);

    const newBlocks: ScriptBlock[] = scriptPreview.shots.map((shot, idx) => ({
      id: idx + 1,
      title: shot.title,
      content: shot.content,
    }));
    setScriptBlocks(newBlocks);

    setScriptPreview(null);
    setStep(CreationStep.SCRIPT);
  };

  // Shot 편집 핸들러들
  const updateShot = (id: string, newContent: string) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, content: newContent } : s));
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
    }
    setShots(prev => prev.filter(s => s.id !== id));
  };

  const handleConfirmShots = async () => {
    // Shot들을 Scene 구조로 변환하여 다음 단계(이미지 생성)로 진행
    setIsLoading(true);
    setLoadingMessage("각 컷에 맞는 AI 이미지를 생성하고 있습니다...");
    setLoadingProgress(0);

    try {
      const newScenes: Scene[] = [];
      const total = shots.length;

      // 선택된 스타일의 prefix 가져오기
      const styleObj = IMAGE_STYLES.find(s => s.id === selectedImageStyle);
      const stylePrefix = styleObj?.prefix || '';
      const aspectRatio = videoLength === 'shorts' ? '9:16' : '16:9';

      for (let i = 0; i < total; i++) {
        const shot = shots[i];

        // 메시지 및 진척도 업데이트
        setLoadingMessage(`컷 ${i + 1} / ${total} : 이미지 생성 중...`);
        setLoadingProgress(Math.round((i / total) * 100));

        let imageUrl = '';
        try {
          // xai/grok-imagine-image 이미지 생성
          imageUrl = await generateFalImage({
            prompt: shot.content,
            aspect_ratio: aspectRatio,
            style: stylePrefix,
          });
        } catch (e) {
          console.error(`Shot ${i+1} image generation failed`, e);
          imageUrl = `https://picsum.photos/seed/${shot.id}/800/450`;
        }

        newScenes.push({
          id: shot.id,
          name: `Shot ${i + 1}`,
          duration: `${Math.ceil(shot.content.length * 0.25)}s`,
          imageUrl,
          script: shot.content,
          prompt: `${stylePrefix}, ${shot.content}`,
          isManualPrompt: false,
          status: "active" as const,
          motionStyle: "시네마틱",
        });
      }

      setLoadingProgress(100);
      setScenes(newScenes);
      // 이미지 생성 단계(CUT_SELECTION)로 이동
      setStep(CreationStep.CUT_SELECTION);
      
    } catch (error) {
      console.error("Failed to generate shot images:", error);
      alert("이미지 준비 중 오류가 발생했습니다.");
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
    const providerName = videoProvider === 'kling' ? 'Kling Pro' : videoProvider === 'kling-standard' ? 'Kling Standard' : videoProvider === 'veo' ? 'Veo' : 'Sora';
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

    // 상태를 'processing'으로 변경
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'processing' } : s));

    try {
      console.log(`🖼️ Regenerating image for scene: ${scene.name}`);
      const imageUrl = await generateImage({
        prompt: scene.prompt,
        keywords: extractKeywords(scene.script, "scene", "context"), // 키워드 재추출 불필요하면 prompt만 사용해도 됨
        width: videoLength === "shorts" ? 450 : 800, // 비율에 맞게
        height: videoLength === "shorts" ? 800 : 450 
      });

      // 이미지 URL 및 상태 업데이트
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, imageUrl, status: 'completed' } : s));
      console.log(`✅ Image regenerated: ${imageUrl.substring(0, 30)}...`);

    } catch (error) {
      console.error("Image regeneration failed:", error);
      alert("이미지 생성에 실패했습니다. 프롬프트를 확인해주세요.");
      // 상태 복구
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, status: 'error' } : s));
    }
  };

  const regenerateSceneImage = async (sceneId: string) => {
    const sceneIndex = scenes.findIndex((s) => s.id === sceneId);
    if (sceneIndex === -1) return;

    const newScenes = [...scenes];
    const currentScene = newScenes[sceneIndex];
    
    // 즉시 처리 중 상태로 변경하여 사용자에게 피드백
    newScenes[sceneIndex].status = "processing";
    setScenes(newScenes);

    try {
      // const genAI = getAI(); // This line will be removed
      // // 사용자 API 키로 테스트한 결과: nano-banana-pro-preview 모델 사용 확인
      // const model = genAI.getGenerativeModel({ model: "nano-banana-pro-preview" }); // This line will be removed
      
      // Step 1: Gemini API로 장면 분석 및 최적화된 이미지 검색 키워드 생성
      console.log(`🎬 Analyzing scene: ${currentScene.name}`);
      
      const prompt = `Analyze this video scene and generate optimized image search keywords:

**Scene Title:** ${currentScene.name}
**Script/Narration:** ${currentScene.script}
**Current Image Prompt:** ${currentScene.prompt}

Please provide:
1. An enhanced, cinematic English image generation prompt (detailed, professional, 8k quality)
2. 5-7 specific English search keywords that will help find the perfect image
3. The mood/atmosphere of the scene (e.g., dark, bright, mysterious, energetic)

Respond in JSON format:
{
  "prompt": "enhanced detailed prompt here",
  "keywords": "keyword1,keyword2,keyword3,keyword4,keyword5",
  "mood": "atmospheric description"
}`;
      
      // const result = await model.generateContent(prompt); // This line will be removed
      // const response = await result.response; // This line will be removed
      // let text = response.text(); // This line will be removed
      
      // // JSON 파싱을 위한 전처리
      // text = text.replace(/```json/g, '').replace(/```/g, '').trim(); // This line will be removed

      // const analysis = JSON.parse(text || '{}'); // This line will be removed
      // const enhancedPrompt = analysis.prompt || currentScene.prompt; // This line will be removed
      // const keywords = analysis.keywords || extractKeywords( // This line will be removed
      //   currentScene.name, // This line will be removed
      //   currentScene.script, // This line will be removed
      //   currentScene.prompt // This line will be removed
      // ); // This line will be removed
      // const mood = analysis.mood || 'cinematic'; // This line will be removed

      // console.log(`✨ Generated keywords: ${keywords}`); // This line will be removed
      // console.log(`🎨 Mood: ${mood}`); // This line will be removed
      // console.log(`📝 Enhanced prompt: ${enhancedPrompt}`); // This line will be removed

      // // Step 2: 프롬프트 업데이트
      // newScenes[sceneIndex].prompt = enhancedPrompt; // This line will be removed

      // Step 3: 여러 이미지 소스를 시도하여 최적의 이미지 가져오기
      const imageUrl = await generateImage({
        prompt: currentScene.prompt, // Use current prompt as fallback
        keywords: extractKeywords(currentScene.name, currentScene.script, currentScene.prompt), // Fallback keyword extraction
        width: 800,
        height: 450
      });

      console.log(`🖼️ Image generated: ${imageUrl}`);
      
      // Step 4: 이미지 URL 업데이트
      newScenes[sceneIndex].imageUrl = imageUrl;
      newScenes[sceneIndex].status = "active";
      
      // 성공적으로 완료
      setScenes([...newScenes]);
      
      // 사용자에게 성공 피드백 (선택사항)
      console.log(`✅ Image successfully regenerated for scene: ${currentScene.name}`);
      
    } catch (error) {
      console.error("❌ Image regeneration failed:", error);
      
      // 에러 발생 시에도 대체 이미지 제공
      try {
        // 간단한 키워드로 대체 이미지 시도
        const fallbackKeywords = currentScene.name
          .split(' ')
          .slice(0, 3)
          .join(',');
        
        const fallbackImage = await generateImage({
          prompt: currentScene.name,
          keywords: `${fallbackKeywords},video,cinematic`,
          width: 800,
          height: 450
        });
        
        newScenes[sceneIndex].imageUrl = fallbackImage;
        console.log(`⚠️ Used fallback image: ${fallbackImage}`);
      } catch (fallbackError) {
        // 최종 폴백: 랜덤 이미지
        newScenes[sceneIndex].imageUrl = `https://picsum.photos/seed/${Date.now()}/800/450`;
        console.error("⚠️ All image sources failed, using random image");
      }
      
      newScenes[sceneIndex].status = "active";
      setScenes([...newScenes]);
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
      const steps = [
        { progress: 10, message: "비디오 클립 분석 중..." },
        { progress: 25, message: "오디오 트랙 정합 및 노이즈 제거..." },
        { progress: 45, message: "사용자 정의 자막 레이어 합성 중..." },
        { progress: 65, message: "프레임 보간 및 화질 최적화 (AI Upscaling)..." },
        { progress: 85, message: "최종 인코딩 및 파일 생성 중..." },
        { progress: 100, message: "렌더링 완료!" }
      ];

      for (const step of steps) {
        await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1000));
        setRenderProgress(step.progress);
        setLoadingMessage(step.message);
      }

      setRenderError('✅ 전체 영상 렌더링이 완료되었습니다! 아래 다운로드 버튼을 눌러 확인하세요.');
      
      // 실제 다운로드 트리거 (첫 번째 장면 예시)
      const firstValidVideo = scenes.find(s => s.videoClipUrl)?.videoClipUrl;
      if (firstValidVideo) {
        const link = document.createElement('a');
        link.href = firstValidVideo;
        link.download = `VidAI_Project_${new Date().getTime()}.mp4`;
        document.body.appendChild(link);
        // link.click(); // 자동 다운로드는 사용자가 버튼을 눌렀을 때만 하도록 수정 (선택사항)
        document.body.removeChild(link);
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
    { step: CreationStep.TOPIC, label: '주제', icon: 'lightbulb' },
    { step: CreationStep.SCRIPT, label: '대본', icon: 'description' },
    { step: CreationStep.CUT_SELECTION, label: '시각화', icon: 'image' },
    { step: CreationStep.MOTION, label: '모션', icon: 'animation' },
    { step: CreationStep.AUDIO_STYLE, label: '오디오', icon: 'graphic_eq' },
    { step: CreationStep.SUBTITLE, label: '자막', icon: 'subtitles' },
    { step: CreationStep.FINAL, label: '완료', icon: 'check_circle' },
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
        <div className="p-4 border-t border-border-dark">
          <button
            onClick={() => {
              setStep(CreationStep.TOPIC);
              setTopic("");
              setVideoUrl(null);
            }}
            className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-primary/10 border border-primary/30 text-primary text-sm font-bold hover:bg-primary/20 transition-all"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            <span>새 프로젝트</span>
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (step) {
      case CreationStep.TOPIC:
        return (
          <div className="max-w-4xl mx-auto w-full px-6 pb-20 pt-10">
            <div className="flex flex-col items-center mb-8">
              <h2 className="text-4xl font-bold font-display mb-4 text-center">
                {inputMode === 'auto' ? '1단계: 유튜브 주제 입력' : '1단계: 대본 직접 입력'}
              </h2>
              <p className="text-text-muted text-lg max-w-xl mx-auto text-center mb-6">
                {inputMode === 'auto'
                  ? '만들고 싶은 영상의 주제를 입력해 주세요. AI가 대본 작성부터 자료 조사까지 자동으로 진행합니다.'
                  : '이미 작성된 대본이 있다면 입력해 주세요. AI가 장면을 나누고 이미지 프롬프트를 생성합니다.'
                }
              </p>
              <div className="bg-[#1a1630] border border-border-dark p-1.5 rounded-2xl flex gap-1">
                <button
                  onClick={() => setInputMode('auto')}
                  className={`px-6 py-3 rounded-xl font-bold transition-all ${inputMode === 'auto' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
                >
                  ✨ AI 자동 생성
                </button>
                <button
                  onClick={() => setInputMode('manual')}
                  className={`px-6 py-3 rounded-xl font-bold transition-all ${inputMode === 'manual' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'text-text-muted hover:text-white hover:bg-white/5'}`}
                >
                  📝 직접 입력
                </button>
              </div>
            </div>

            <div className="space-y-8 bg-[#1a1630]/50 p-8 rounded-3xl border border-border-dark">
              {inputMode === 'auto' ? (
                <>
                  {/* 옵션 선택 영역 */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">language</span>
                        언어 선택
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {LANGUAGES.map(lang => (
                          <button
                            key={lang.code}
                            onClick={() => setTargetLanguage(lang.code)}
                            className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${targetLanguage === lang.code ? 'bg-primary/20 border-primary text-primary' : 'bg-[#0d0a1a] border-border-dark text-text-muted hover:border-white/30'}`}
                          >
                            {lang.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-lg">schedule</span>
                        영상 길이
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {DURATIONS.map(dur => (
                          <button
                            key={dur.code}
                            onClick={() => setTargetDuration(dur.code)}
                            className={`px-3 py-2 rounded-lg text-sm font-bold border transition-all ${targetDuration === dur.code ? 'bg-primary/20 border-primary text-primary' : 'bg-[#0d0a1a] border-border-dark text-text-muted hover:border-white/30'}`}
                          >
                            {dur.label}
                          </button>
                        ))}
                        {targetDuration === 'custom' && (
                          <div className="w-full mt-2 animate-in fade-in slide-in-from-top-2">
                             <div className="relative">
                               <input 
                                 type="text" 
                                 value={customDuration}
                                 onChange={(e) => setCustomDuration(e.target.value)}
                                 placeholder="예: 45초, 10분, 90s 등"
                                 className="w-full bg-[#0d0a1a] border border-[#292348] rounded-lg px-4 py-3 text-sm text-white focus:border-primary outline-none focus:ring-1 focus:ring-primary transition-all"
                               />
                               <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/40 font-bold">직접 입력</span>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 주제 입력 영역 */}
                  <div className="space-y-3">
                    <label className="text-sm font-bold text-white flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-lg">edit</span>
                      영상 주제
                    </label>
                    <div className="relative">
                      <textarea
                        value={topic}
                        onChange={(e) => setTopic(e.target.value.slice(0, 500))}
                        placeholder="예: 화성 탐사의 비밀스러운 역사와 향후 10년 내에 발견될 수 있는 것들에 대해..."
                        className="w-full h-32 bg-[#0d0a1a] border-border-dark border-2 rounded-xl p-5 text-base focus:ring-primary focus:border-primary transition-all resize-none text-white placeholder:text-white/20"
                      />
                      <div className="absolute bottom-4 right-4 text-[11px] text-text-muted font-medium">
                        {topic.length} / 500
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                /* 직접 입력 영역 */
                <div className="space-y-3">
                  <label className="text-sm font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">description</span>
                    대본 내용
                  </label>
                  <div className="relative">
                    <textarea
                      value={manualScript}
                      onChange={(e) => setManualScript(e.target.value)}
                      placeholder="영상 대본을 여기에 붙여넣으세요..."
                      className="w-full h-64 bg-[#0d0a1a] border-border-dark border-2 rounded-xl p-5 text-base focus:ring-primary focus:border-primary transition-all resize-none text-white placeholder:text-white/20"
                    />
                    <div className="absolute bottom-4 right-4 text-[11px] text-text-muted font-medium">
                      {manualScript.length}자
                    </div>
                  </div>
                </div>
              )}
            
              <div className="flex flex-col items-center pt-4">
                <button
                  onClick={handleGenerateScript}
                  disabled={(inputMode === 'auto' ? !topic.trim() : !manualScript.trim()) || isLoading}
                  className="w-full max-w-sm bg-primary hover:bg-primary/90 disabled:opacity-50 text-white h-14 rounded-xl flex items-center justify-center gap-3 font-bold text-lg shadow-xl shadow-primary/20 transition-all active:scale-95"
                >
                  {isLoading ? (
                    <span className="animate-spin material-symbols-outlined">sync</span>
                  ) : (
                    <>
                      <span>{inputMode === 'auto' ? '대본 생성하기' : '대본 분석하기'}</span>
                      <span className="material-symbols-outlined filled text-xl">bolt</span>
                    </>
                  )}
                </button>
              </div>

              {/* 생성된 대본 미리보기 영역 */}
              {scriptPreview && (
                <div className="mt-8 border-t border-border-dark pt-8">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-xl font-bold text-white mb-1">생성된 대본 미리보기</h3>
                      <p className="text-text-muted text-sm">{scriptPreview.synopsis}</p>
                    </div>
                    <div className="text-sm text-primary font-bold">
                      총 {scriptPreview.shots.length}개 장면
                    </div>
                  </div>

                  <div className="space-y-3 mb-6">
                    {scriptPreview.shots.map((shot, idx) => (
                      <div key={idx} className="bg-[#0d0a1a] border border-[#292348] rounded-xl p-5 hover:border-primary/40 transition-all">
                        <div className="flex items-start gap-4">
                          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-primary font-bold text-xs">{idx + 1}</span>
                          </div>
                          <div className="flex-1">
                            <h4 className="text-primary font-bold text-sm mb-1.5">{shot.title}</h4>
                            <p className="text-white/80 text-sm leading-relaxed">{shot.content}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => { setScriptPreview(null); handleGenerateScript(); }}
                      disabled={isLoading}
                      className="px-6 py-3 bg-white/5 border border-[#292348] hover:border-primary/50 text-white rounded-xl font-bold transition-all hover:bg-white/10 flex items-center gap-2 disabled:opacity-50 text-sm"
                    >
                      <span className="material-symbols-outlined text-lg">refresh</span>
                      다시 생성
                    </button>
                    <button
                      onClick={handleConfirmPreview}
                      className="px-10 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold shadow-lg shadow-primary/20 transition-all flex items-center gap-2 text-sm"
                    >
                      <span>대본 확정하기</span>
                      <span className="material-symbols-outlined text-lg">arrow_forward</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case CreationStep.SCRIPT:
        const totalCharCount = shots.reduce((acc, shot) => acc + shot.content.length, 0);
        // 대략 1초당 4글자 기준 + 샷당 기본 1초 여유
        const estimatedDurationSec = Math.ceil(totalCharCount * 0.25) + (shots.length * 1);
        const estMin = Math.floor(estimatedDurationSec / 60);
        const estSec = estimatedDurationSec % 60;
        const estimatedCredit = 50 + (shots.length * 2);

        return (
          <div className="max-w-[1200px] mx-auto w-full px-6 py-8 pb-32">
            {/* Header Area */}
            <div className="flex flex-col gap-3 mb-10">
              <div className="flex justify-between items-center">
                <h3 className="text-white text-base font-bold uppercase tracking-wider">
                  2단계: 영상 구조 설계 (Shot List)
                </h3>
                <p className="text-primary text-sm font-bold bg-primary/10 px-3 py-1 rounded-full">
                  20% 완료
                </p>
              </div>
              <div className="rounded-full bg-[#3b3267] h-2.5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary shadow-[0_0_15px_rgba(55,19,236,0.5)] transition-all duration-1000"
                  style={{ width: "20%" }}
                ></div>
              </div>
              <p className="text-[#9b92c9] text-sm font-normal leading-relaxed">
                대본을 영상 컷(Shot) 단위로 분해하고 확정하는 단계입니다. 각 컷의 자막을 검토하세요.
              </p>
            </div>

            <div className="flex gap-8 items-start">
              {/* Main Content: Shot List */}
              <div className="flex-1 space-y-8">
                
                {/* Synopsis Panel */}
                <div className="bg-[#1a162e] border border-[#292348] rounded-2xl p-6">
                  <h4 className="text-primary font-bold mb-3 flex items-center gap-2">
                    <span className="material-symbols-outlined">description</span>
                    Synopsis (요약)
                  </h4>
                  <textarea
                    value={synopsis}
                    onChange={(e) => setSynopsis(e.target.value)}
                    className="w-full bg-[#0d0a1a] border border-[#292348] rounded-xl p-4 text-white/90 text-sm leading-relaxed focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                    rows={3}
                  />
                </div>

                {/* Shot Timeline */}
                <div className="relative pl-8 border-l-2 border-[#292348] space-y-8">
                  {/* Scene Header */}
                  <div className="relative">
                    <div className="absolute -left-[41px] top-1/2 -translate-y-1/2 w-5 h-5 bg-primary rounded-full border-4 border-[#0d0a1a]"></div>
                    <div className="bg-[#292348] text-white px-6 py-3 rounded-r-xl font-bold font-display text-lg inline-block shadow-lg">
                      SCENE 1 : INT. {topic ? topic.substring(0, 15) : 'TOPIC'}... - DAY
                    </div>
                  </div>

                  {shots.map((shot, idx) => (
                    <div key={shot.id} className="relative group">
                      {/* Timeline Marker */}
                      <div className="absolute -left-[40px] top-6 w-4 h-4 rounded-full bg-[#3b3267] border-2 border-[#0d0a1a] group-hover:bg-primary transition-colors"></div>
                      
                      {/* Shot Card */}
                      <div className="bg-[#1a162e] border border-[#292348] rounded-xl p-5 hover:border-primary/50 transition-all shadow-md group-hover:shadow-lg group-hover:shadow-primary/5">
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center gap-1 min-w-[60px]">
                            <span className="text-[#9b92c9] text-xs font-bold uppercase tracking-wider">Shot</span>
                            <span className="text-white text-2xl font-black font-display">{idx + 1}</span>
                          </div>
                          
                          <div className="flex-1">
                            <label className="text-xs font-bold text-[#9b92c9] mb-1.5 block">
                              자막 / 나레이션 (TTS)
                            </label>
                            <textarea
                              value={shot.content}
                              onChange={(e) => updateShot(shot.id, e.target.value)}
                              className="w-full bg-[#0d0a1a] border border-[#292348] rounded-lg p-3 text-white text-base leading-relaxed focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                              rows={2}
                            />
                            <div className="flex justify-end mt-2">
                              <span className="text-[11px] text-[#9b92c9] font-medium">
                                {shot.content.length} 자
                              </span>
                            </div>
                          </div>

                          {/* Control Buttons */}
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => duplicateShot(shot.id)}
                              className="w-10 h-10 rounded-lg bg-[#292348] hover:bg-primary/20 hover:text-primary text-[#9b92c9] flex items-center justify-center transition-all"
                              title="복제"
                            >
                              <span className="material-symbols-outlined text-lg">content_copy</span>
                            </button>
                            <button
                              onClick={() => deleteShot(shot.id)}
                              className="w-10 h-10 rounded-lg bg-[#292348] hover:bg-red-500/20 hover:text-red-500 text-[#9b92c9] flex items-center justify-center transition-all"
                              title="삭제"
                            >
                              <span className="material-symbols-outlined text-lg">delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* End Marker */}
                  <div className="relative pt-4">
                     <div className="absolute -left-[37px] top-6 w-3 h-3 rounded-full bg-[#292348]"></div>
                     <button
                       onClick={() => setShots([...shots, { id: `shot-${Date.now()}`, content: "" }])}
                       className="ml-4 px-6 py-3 rounded-xl border border-dashed border-[#3b3267] text-[#9b92c9] hover:text-white hover:border-primary hover:bg-primary/10 transition-all font-bold text-sm flex items-center gap-2"
                     >
                       <span className="material-symbols-outlined">add</span>
                       새로운 컷(Shot) 추가하기
                     </button>
                  </div>
                </div>
              </div>

              {/* Right Sidebar (Stats & Action) */}
              <div className="w-[300px] sticky top-8 flex flex-col gap-6">
                 <div className="bg-[#1a162e] border border-[#292348] rounded-2xl p-6 shadow-xl">
                   <h4 className="text-white font-bold mb-6 text-lg">영상 정보 요약</h4>
                   
                   <div className="space-y-4 mb-8">
                     <div className="flex justify-between items-center pb-4 border-b border-[#292348]">
                       <span className="text-[#9b92c9] text-sm">총 Shot 개수</span>
                       <span className="text-white font-bold text-lg">{shots.length} <span className="text-sm font-normal text-[#9b92c9]">cuts</span></span>
                     </div>
                     <div className="flex justify-between items-center pb-4 border-b border-[#292348]">
                       <span className="text-[#9b92c9] text-sm">예상 영상 길이</span>
                       <span className="text-primary font-bold text-lg">
                         {String(estMin).padStart(2, '0')}:{String(estSec).padStart(2, '0')}
                       </span>
                     </div>
                     <div className="flex justify-between items-center">
                       <span className="text-[#9b92c9] text-sm">예상 소모 크레딧</span>
                       <span className="text-yellow-400 font-bold flex items-center gap-1">
                         <span className="material-symbols-outlined filled text-sm">bolt</span>
                         {estimatedCredit}
                       </span>
                     </div>
                   </div>

                   {/* Aspect Ratio Selector */}
                   {/* 이미지 스타일 선택 */}
                   <div className="mb-6">
                      <label className="text-[#9b92c9] text-xs font-bold uppercase mb-3 block">
                        이미지 스타일
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {IMAGE_STYLES.map(style => (
                          <button
                            key={style.id}
                            onClick={() => setSelectedImageStyle(style.id)}
                            className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all text-left ${
                              selectedImageStyle === style.id
                                ? 'border-primary bg-primary/15 text-white'
                                : 'bg-[#0d0a1a] text-[#9b92c9] border-[#292348] hover:border-primary/50'
                            }`}
                          >
                            <span
                              className="material-symbols-outlined text-lg"
                              style={{ color: selectedImageStyle === style.id ? style.color : undefined }}
                            >
                              {style.icon}
                            </span>
                            <span className="text-xs font-bold">{style.label}</span>
                          </button>
                        ))}
                      </div>
                   </div>

                   {/* 이미지 비율 선택 */}
                   <div className="mb-6">
                      <label className="text-[#9b92c9] text-xs font-bold uppercase mb-3 block">
                        이미지 비율
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setVideoLength("shorts")}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                            videoLength === "shorts"
                              ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                              : "bg-[#0d0a1a] text-[#9b92c9] border-[#292348] hover:border-primary/50"
                          }`}
                        >
                          <div className="w-4 h-6 border-2 border-current rounded-sm mb-2"></div>
                          <span className="text-xs font-bold">9:16 Shorts</span>
                        </button>
                        <button
                          onClick={() => setVideoLength("1min")}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                            videoLength !== "shorts"
                              ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                              : "bg-[#0d0a1a] text-[#9b92c9] border-[#292348] hover:border-primary/50"
                          }`}
                        >
                          <div className="w-8 h-4 border-2 border-current rounded-sm mb-2 translate-y-1"></div>
                          <span className="text-xs font-bold">16:9 Cinema</span>
                        </button>
                      </div>
                   </div>

                   <button
                     onClick={handleConfirmShots}
                     disabled={isLoading}
                     className="w-full bg-primary hover:bg-primary/90 disabled:opacity-50 text-white h-14 rounded-xl flex items-center justify-center gap-2 font-bold text-lg shadow-lg shadow-primary/25 transition-all active:scale-95"
                   >
                      {isLoading ? (
                        <>
                          <span className="animate-spin material-symbols-outlined">sync</span>
                          <span>처리 중...</span>
                        </>
                      ) : (
                        <>
                          <span>이미지 생성 (Next)</span>
                          <span className="material-symbols-outlined">arrow_forward</span>
                        </>
                      )}
                   </button>
                   <p className="text-center text-[#9b92c9] text-xs mt-3">
                     클릭 시 Shot 구조가 확정되고<br/>이미지 생성이 시작됩니다.
                   </p>
                 </div>
                 
                 <div className="bg-[#1a162e]/50 border border-[#292348] rounded-xl p-5">
                   <h5 className="text-[#9b92c9] text-xs font-bold uppercase mb-2">Tip</h5>
                   <p className="text-xs text-[#9b92c9]/80 leading-relaxed">
                     각 컷의 자막 길이를 조절하여 영상의 호흡을 맞추세요. 너무 긴 문장은 두 개의 컷으로 나누는 것이 좋습니다.
                   </p>
                 </div>
              </div>
            </div>
          </div>
        );

      case CreationStep.CUT_SELECTION: {
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

                    {/* Style Controls */}
                    <div className="border-t border-[#292348] pt-6 space-y-4">
                       <label className="text-[#9b92c9] text-xs font-bold uppercase block">Effect Style</label>
                       <div className="grid grid-cols-3 gap-2">
                          {['Cinematic', 'Anime', '3D Render'].map(style => (
                             <button 
                               key={style}
                               className={`px-2 py-2 rounded-lg text-[10px] font-bold border transition-all ${currentScene.prompt.includes(style) ? 'bg-primary/20 border-primary text-primary' : 'bg-[#0d0a1a] border-[#292348] text-[#9b92c9] hover:border-white/30'}`}
                               onClick={() => {
                                  // Add style keyword to prompt
                                  if (!currentScene.prompt.includes(style)) {
                                     const newPrompt = `${currentScene.prompt}, ${style}`;
                                     setScenes(prev => prev.map(s => s.id === currentScene.id ? { ...s, prompt: newPrompt } : s));
                                  }
                               }}
                             >
                               {style}
                             </button>
                          ))}
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        );
      }

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
        return renderMotionStep();

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
                      <div className="grid grid-cols-1 gap-2">
                        {VOICES.map((voice) => {
                          const isSelected = selectedVoice?.id === voice.id;
                          const isPlaying = playingPreviewVoice === voice.id;
                          return (
                            <div
                              key={voice.id}
                              onClick={() => setSelectedVoice(voice)}
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
                                  const audioUrl = await previewVoiceTTS(voice.id);
                                  const a = new Audio(audioUrl);
                                  a.play();
                                  a.onended = () => setPlayingPreviewVoice(null);
                                  a.onerror = () => setPlayingPreviewVoice(null);
                                } catch {
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
                <div className="flex flex-col bg-black min-h-0 relative">
                  {/* Top: Video Preview */}
                  <div className="flex-1 relative flex flex-col items-center justify-center p-4 bg-[url('/grid.svg')] bg-center overflow-hidden select-none min-h-0">
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
                              width: `${subtitleBgWidth}px`,
                              height: `${subtitleBgHeight}px`,
                              fontFamily: subtitleFont,
                              userSelect: 'none'
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
                                WebkitTextStroke: `${subtitleBorderWidth}px ${subtitleBorderColor}`,
                                paintOrder: 'stroke fill',
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

                  {/* Bottom: Timeline Bar (Image Reference Style) */}
                  <div className="h-48 bg-[#131022] border-t border-[#292348] flex flex-col overflow-hidden">
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

                        <div className="flex items-center gap-3">
                           <span className="material-symbols-outlined text-sm text-white/50 cursor-pointer hover:text-white">volume_up</span>
                           <div className="w-16 h-0.5 bg-white/10 rounded-full relative cursor-pointer">
                              <div className="absolute inset-y-0 left-0 w-3/4 bg-white/40 rounded-full" />
                           </div>
                        </div>
                     </div>

                     {/* CapCut-style Editing Toolbar */}
                     {selectedTrackType && (
                       <div className="h-8 px-4 flex items-center gap-1 bg-[#0d0a1a] border-t border-b border-[#292348]">
                         {/* Track type indicator */}
                         <span className={`text-[9px] font-black uppercase tracking-wider mr-2 px-1.5 py-0.5 rounded ${
                           selectedTrackType === 'subtitle' ? 'bg-yellow-500/20 text-yellow-400' :
                           selectedTrackType === 'scene' ? 'bg-blue-500/20 text-blue-400' :
                           'bg-primary/20 text-primary'
                         }`}>
                           {selectedTrackType === 'subtitle' ? '자막' : selectedTrackType === 'scene' ? '영상' : '오디오'}
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
                           <span className="material-symbols-outlined !text-[14px] text-white/50 group-hover/btn:text-white">content_cut</span>
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
                     )}

                     {/* Timeline tracks */}
                     <div className="flex-1 relative overflow-x-auto overflow-y-hidden custom-scrollbar bg-[#0d0a1a] select-none group/timeline">
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
                           <div className="h-7 flex relative">
                              {scenesWithTiming.map((s) => {
                                const peaks = waveformData[s.id];
                                return (
                                  <div
                                    key={`audio-${s.id}`}
                                    onClick={() => { setSelectedAudioSceneId(s.id); setSelectedTrackType('audio'); setSelectedSubtitleId(null); setSelectedSceneId(s.id); }}
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
                           <div className="h-11 flex relative">
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
                           <div ref={subtitleTrackRef} className="h-7 flex relative">
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
                              <div className="absolute -top-1 -left-[5px] w-3 h-3 bg-primary rounded-full border-2 border-white shadow-xl" />
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

                {/* Right: Subtitle Styling Controls */}
                <div className="border-l border-[#292348] bg-[#1a162e] px-6 py-8 flex flex-col h-full overflow-y-auto custom-scrollbar">
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider mb-8 flex items-center gap-2 border-b border-[#292348] pb-4">
                    <span className="material-symbols-outlined text-primary">format_paint</span>
                    Subtitle Design
                  </h3>

                  <div className="space-y-6">
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

                    {/* Quick actions */}
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                      <label className="text-xs text-white/50 font-bold mb-3 block">빠른 작업</label>
                      <div className="space-y-2">
                        {/* Whisper 자동 싱크 (전체 장면) */}
                        <button
                          disabled={isAutoSyncing}
                          onClick={async () => {
                            const scenesWithAudio = scenes.filter(s => s.audioUrl);
                            if (scenesWithAudio.length === 0) {
                              alert('오디오가 생성된 장면이 없습니다. 오디오 단계에서 먼저 음성을 생성하세요.');
                              return;
                            }
                            setIsAutoSyncing(true);
                            setAutoSyncProgress(`0 / ${scenesWithAudio.length} 분석 중...`);
                            try {
                              let completed = 0;
                              for (const scene of scenesWithAudio) {
                                setAutoSyncProgress(`${completed + 1} / ${scenesWithAudio.length} 분석 중...`);
                                try {
                                  const result = await transcribeAudio(scene.audioUrl!);
                                  if (result.success && result.segments.length > 0) {
                                    setScenes(prev => prev.map(s => {
                                      if (s.id !== scene.id) return s;
                                      return {
                                        ...s,
                                        subtitleSegments: result.segments.map((seg, i) => ({
                                          id: `${s.id}-wseg-${i}`,
                                          text: seg.text,
                                          startTime: Math.round(seg.startTime * 10) / 10,
                                          endTime: Math.round(seg.endTime * 10) / 10,
                                        }))
                                      };
                                    }));
                                  }
                                } catch (err) {
                                  console.error(`Scene ${scene.id} transcription failed:`, err);
                                }
                                completed++;
                              }
                              setAutoSyncProgress('');
                            } catch (err) {
                              console.error('Auto sync failed:', err);
                              setAutoSyncProgress('');
                            } finally {
                              setIsAutoSyncing(false);
                            }
                          }}
                          className="w-full py-2.5 bg-gradient-to-r from-green-600/20 to-emerald-600/20 hover:from-green-600/30 hover:to-emerald-600/30 border border-green-500/20 text-green-300/80 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isAutoSyncing ? (
                            <>
                              <span className="material-symbols-outlined !text-[14px] animate-spin">progress_activity</span>
                              {autoSyncProgress}
                            </>
                          ) : (
                            <>
                              <span className="material-symbols-outlined !text-[14px]">mic</span>
                              AI 자동 싱크 (Whisper)
                            </>
                          )}
                        </button>

                        <div className="h-px bg-[#292348]" />

                        {/* 문장 기반 자동 분할 (기존) */}
                        <button
                          onClick={() => {
                            const sceneTime = scenesWithTiming.find(s => s.id === currentScene.id);
                            const dur = sceneTime?.durationSec || 5;
                            const parts = currentScene.script.split(/(?<=[.!?,，。！？])\s*/).filter((t: string) => t.trim());
                            const segs = parts.length > 1 ? parts : [currentScene.script];
                            const segDur = dur / segs.length;
                            const newSegments = segs.map((text: string, i: number) => ({
                              id: `${currentScene.id}-seg-${Date.now()}-${i}`,
                              text: text.trim(),
                              startTime: Math.round(segDur * i * 10) / 10,
                              endTime: Math.round(segDur * (i + 1) * 10) / 10,
                            }));
                            setScenes(scenes.map(s => s.id === currentScene.id ? { ...s, subtitleSegments: newSegments } : s));
                          }}
                          className="w-full py-2 bg-[#292348] hover:bg-[#3b3267] text-white/50 hover:text-white/80 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <span className="material-symbols-outlined !text-[14px]">auto_fix_high</span>
                          문장 단위 분할 (현재 장면)
                        </button>
                        <button
                          onClick={() => {
                            // 현재 장면 세그먼트 초기화 (전체 길이 1개로)
                            const sceneTime = scenesWithTiming.find(s => s.id === currentScene.id);
                            const dur = sceneTime?.durationSec || 5;
                            setScenes(scenes.map(s => s.id === currentScene.id ? {
                              ...s,
                              subtitleSegments: [{
                                id: `${s.id}-seg-reset`,
                                text: s.script,
                                startTime: 0,
                                endTime: dur,
                              }]
                            } : s));
                            setSelectedSubtitleId(null);
                          }}
                          className="w-full py-2 bg-[#292348] hover:bg-red-500/10 text-white/30 hover:text-red-400/70 rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-all"
                        >
                          <span className="material-symbols-outlined !text-[14px]">restart_alt</span>
                          현재 장면 초기화
                        </button>
                      </div>
                    </div>

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
                                  <div><label className="text-[10px] text-white/50 mb-1 block flex justify-between"><span>배경 너비 (Width)</span><span>{subtitleBgWidth}px</span></label><input type="range" min="20" max="600" value={subtitleBgWidth} onChange={(e) => setSubtitleBgWidth(parseInt(e.target.value))} className="w-full accent-primary" /></div>
                                  <div><label className="text-[10px] text-white/50 mb-1 block flex justify-between"><span>배경 높이 (Height)</span><span>{subtitleBgHeight}px</span></label><input type="range" min="10" max="200" value={subtitleBgHeight} onChange={(e) => setSubtitleBgHeight(parseInt(e.target.value))} className="w-full accent-primary" /></div>
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
            <main className="max-w-[1600px] mx-auto px-6 py-8">
              <nav className="flex items-center gap-2 mb-6 text-sm">
                <a
                  className="text-slate-500 hover:text-primary flex items-center gap-1"
                  href="#"
                  onClick={() => setStep(CreationStep.TOPIC)}
                >
                  <span className="material-symbols-outlined text-sm">home</span>
                  프로젝트
                </a>
                <span className="text-slate-600">/</span>
                <a className="text-slate-500 hover:text-primary" href="#">
                  합성 단계
                </a>
                <span className="text-slate-600">/</span>
                <span className="text-primary font-semibold">최종 내보내기</span>
              </nav>

              <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                  <h1 className="text-4xl font-black tracking-tight font-display">
                    10단계: 최종 영상 확인 및 다운로드
                  </h1>
                  <p className="text-slate-400 text-lg">
                    AI가 생성한 당신의 걸작이 완성되었습니다.
                  </p>
                </div>
                <div className="flex items-center gap-4 bg-primary/10 border border-primary/20 px-4 py-2 rounded-xl">
                  <div className="text-right">
                    <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                      프로젝트 상태
                    </p>
                    <p className="text-primary font-bold">내보내기 준비 완료</p>
                  </div>
                  <span className="material-symbols-outlined text-primary size-8 flex items-center justify-center bg-white dark:bg-background-dark rounded-full">
                    check_circle
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-9 space-y-6">
                  <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-black shadow-2xl custom-glow">
                    <div
                      className="aspect-video w-full flex items-center justify-center relative overflow-hidden"
                      style={{ 
                        backgroundColor: '#000',
                      }}
                    >
                      {/* Integrated Playback in Final Step */}
                      {currentScene.videoClipUrl && currentScene.videoClipUrl.length > 50 ? (
                        <video 
                          ref={videoRef} 
                          key={currentScene.videoClipUrl}
                          src={currentScene.videoClipUrl} 
                          className="w-full h-full object-contain"
                          onEnded={() => {
                            if (!isIntegratedPlaying) setIsPlayingScene(false);
                          }}
                        />
                      ) : (
                        <img src={currentScene.imageUrl} className="w-full h-full object-cover opacity-60" alt="" />
                      )}

                      {!isIntegratedPlaying && (
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <button 
                            onClick={() => setIsIntegratedPlaying(true)}
                            className="size-24 bg-primary hover:scale-110 transition-transform rounded-full flex items-center justify-center text-white shadow-2xl group/playbtn"
                          >
                            <span className="material-symbols-outlined text-5xl fill-1 group-hover/playbtn:scale-110 transition-transform">
                              play_arrow
                            </span>
                          </button>
                        </div>
                      )}

                      <audio ref={audioRef} src={currentScene.audioUrl} className="hidden" />

                      {/* Subtitle Rendering */}
                      {showSubtitles && currentScene.script && (
                        <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ bottom: `${subtitleY}%` }}>
                          <div 
                            className={`flex items-center justify-center shadow-xl transition-all ${showSubtitleBg ? 'backdrop-blur-md' : ''}`}
                            style={{ 
                              backgroundColor: showSubtitleBg ? subtitleBgColor : 'transparent', 
                              borderRadius: `${subtitleBgRadius}px`, 
                              width: `${subtitleBgWidth}px`,
                              height: `${subtitleBgHeight}px`,
                              fontFamily: subtitleFont 
                            }}
                          >
                          <p 
                            className="font-bold leading-tight text-center whitespace-pre-wrap px-2" 
                            style={{ 
                              color: subtitleColor, 
                              fontSize: `${subtitleFontSize}px`, 
                              WebkitTextStroke: `${subtitleBorderWidth}px ${subtitleBorderColor}`, 
                              paintOrder: 'stroke fill' 
                            }}
                          >
                            {currentScene.script}
                          </p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="p-6 bg-[#1a162e] border-t border-white/5">
                      <div className="flex flex-col gap-4">
                        {/* Integrated Time Progress */}
                        <div className="relative h-2 w-full bg-white/5 rounded-full cursor-pointer overflow-hidden group/finalpb">
                          <div 
                             className="absolute inset-y-0 left-0 bg-primary shadow-[0_0_15px_rgba(55,19,236,0.6)] rounded-full"
                             style={{ width: `${(integratedTime / totalVideoDuration) * 100}%` }}
                          />
                          <div 
                             className="absolute inset-0 opacity-0 group-hover/finalpb:opacity-100 transition-opacity"
                             onClick={(e) => {
                               const rect = e.currentTarget.getBoundingClientRect();
                               const x = e.clientX - rect.left;
                               const percent = x / rect.width;
                               setIntegratedTime(percent * totalVideoDuration);
                             }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-white text-xs font-bold tracking-wider">
                          <div className="flex items-center gap-4">
                            <button onClick={() => setIsIntegratedPlaying(!isIntegratedPlaying)} className="hover:text-primary transition-colors">
                               <span className="material-symbols-outlined !text-[20px]">
                                  {isIntegratedPlaying ? 'pause' : 'play_arrow'}
                               </span>
                            </button>
                            <div className="flex items-center gap-1.5 min-w-[100px]">
                               <span className="text-white">
                                  {Math.floor(integratedTime / 60)}:{String(Math.floor(integratedTime % 60)).padStart(2, '0')}
                                </span>
                               <span className="opacity-20">/</span>
                               <span className="opacity-40">
                                  {Math.floor(totalVideoDuration / 60)}:{String(Math.floor(totalVideoDuration % 60)).padStart(2, '0')}
                               </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                              <span className="material-symbols-outlined text-sm cursor-pointer hover:text-primary">
                                volume_up
                              </span>
                              <span className="material-symbols-outlined text-sm cursor-pointer hover:text-primary">
                                settings
                              </span>
                              <span className="material-symbols-outlined text-sm cursor-pointer hover:text-primary">
                                fullscreen
                              </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rendering Progress Section */}
                  <div className="p-8 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-xl overflow-hidden relative">
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-2 text-sm font-bold">
                        <span className="text-slate-500">비디오 렌더링 진행률</span>
                        <span className="text-primary">{renderProgress}%</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-white/10 h-3 rounded-full overflow-hidden mb-3">
                        <div 
                          className="h-full bg-primary shadow-[0_0_10px_rgba(55,19,236,0.5)] transition-all duration-500"
                          style={{ width: `${renderProgress}%` }}
                        ></div>
                      </div>
                      {renderError && (
                        <div className={`flex items-center gap-2 text-sm p-3 rounded-lg mb-3 ${renderError.startsWith('✅') ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                          <span className="material-symbols-outlined text-sm">
                            {renderError.startsWith('✅') ? 'check_circle' : 'error'}
                          </span>
                          <span>{renderError}</span>
                        </div>
                      )}
                      {!renderError && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                          <span className="material-symbols-outlined text-sm text-blue-500">
                            info
                          </span>
                          <span>다운로드 버튼을 클릭하여 영상을 저장하세요.</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="lg:col-span-3 space-y-6">
                  <div className="p-6 bg-white dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/10 flex flex-col gap-4 shadow-xl">
                    <h3 className="text-lg font-bold mb-2">내보내기 옵션</h3>
                    <button 
                      onClick={handleFinalRender}
                      disabled={isRendering}
                      className="w-full py-4 px-6 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold flex items-center justify-center gap-3 transition-all transform active:scale-[0.98] shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRendering ? (
                        <>
                          <span className="material-symbols-outlined animate-spin">sync</span>
                          렌더링 중...
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined">download</span>
                          MP4 다운로드 (1080p)
                        </>
                      )}
                    </button>
                    <button className="w-full py-4 px-6 bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 hover:border-primary/50 text-slate-900 dark:text-white rounded-xl font-bold flex items-center justify-center gap-3 transition-all">
                      <span className="material-symbols-outlined text-red-600">
                        smart_display
                      </span>
                      유튜브에 공유
                    </button>

                    <div className="relative py-4">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-slate-200 dark:border-white/10"></div>
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white dark:bg-[#131022] px-2 text-slate-500 font-bold">
                          기타 옵션
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <button className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg flex flex-col items-center gap-1 transition-colors">
                        <span className="material-symbols-outlined text-blue-500">
                          share
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-tighter">
                          링크 복사
                        </span>
                      </button>
                      <button className="p-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg flex flex-col items-center gap-1 transition-colors">
                        <span className="material-symbols-outlined text-pink-500">
                          qr_code
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-tighter">
                          QR 코드
                        </span>
                      </button>
                    </div>
                    <button
                      onClick={() => setStep(CreationStep.SUBTITLE)}
                      className="mt-4 text-center text-sm font-semibold text-slate-500 hover:text-primary flex items-center justify-center gap-2 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">
                        edit
                      </span>
                      자막 수정하러 가기
                    </button>
                  </div>

                  <div className="p-6 bg-slate-100 dark:bg-white/5 rounded-2xl border border-transparent dark:border-white/10">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">
                      메타데이터
                    </h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">해상도</span>
                        <span className="font-medium">1920 x 1080 (HD)</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">프레임 레이트</span>
                        <span className="font-medium">30 fps</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">길이</span>
                        <span className="font-medium">{stats.duration}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-slate-500">용량</span>
                        <span className="font-medium">42.8 MB</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-primary/5 rounded-2xl border border-primary/20 relative overflow-hidden">
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 text-primary mb-2">
                        <span className="material-symbols-outlined">
                          lightbulb
                        </span>
                        <span className="font-bold text-sm">전문가 팁</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        맞춤 자막이 포함된 영상은 유튜브 쇼츠나 틱톡에서 시청
                        지표가 80% 더 높습니다. 이 영상에는 이미 AI가 싱크를 맞춘
                        자막이 포함되어 있습니다!
                      </p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 opacity-5">
                      <span className="material-symbols-outlined text-8xl">
                        auto_awesome
                      </span>
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

        {/* Loading Overlay - 콘텐츠 영역만 덮음 (사이드바는 사용 가능) */}
        {(isLoading || isGeneratingVideo) && (
          <div className="absolute inset-0 z-[100] bg-[#131022]/80 backdrop-blur-xl flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-300">
            <div className="relative mb-10">
              <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-4xl animate-pulse">
                  auto_awesome
                </span>
              </div>
            </div>
            <h3 className="text-2xl font-bold mb-4 font-display">
              VidAI Pro 엔진 가동 중
            </h3>
            <p className="text-[#9b92c9] max-w-sm leading-relaxed">
              {loadingMessage}
            </p>
            {loadingProgress > 0 && (
              <div className="w-64 mt-6">
                <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                  <div 
                    className="h-full bg-primary transition-all duration-300 ease-out shadow-[0_0_10px_rgba(55,19,236,0.5)]"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <p className="text-primary text-xs font-bold">{loadingProgress}% 진행 완료</p>
              </div>
            )}
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
              {/* Kling Pro */}
              <button
                onClick={() => setVideoProvider('kling')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                  videoProvider === 'kling'
                    ? 'border-primary bg-primary/10'
                    : 'border-[#292348] hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold flex items-center gap-2">
                      Kling v1.6 Pro
                      <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">사용 가능</span>
                    </div>
                    <p className="text-[#9b92c9] text-xs mt-1">fal.ai 제공 | 고품질 영상 생성 | ~$0.10/영상</p>
                  </div>
                  {videoProvider === 'kling' && (
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                  )}
                </div>
              </button>

              {/* Kling Standard */}
              <button
                onClick={() => setVideoProvider('kling-standard')}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                  videoProvider === 'kling-standard'
                    ? 'border-primary bg-primary/10'
                    : 'border-[#292348] hover:border-white/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold flex items-center gap-2">
                      Kling v1.6 Standard
                      <span className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full">사용 가능</span>
                    </div>
                    <p className="text-[#9b92c9] text-xs mt-1">fal.ai 제공 | 빠른 생성 | ~$0.05/영상</p>
                  </div>
                  {videoProvider === 'kling-standard' && (
                    <span className="material-symbols-outlined text-primary">check_circle</span>
                  )}
                </div>
              </button>

              {/* Veo (Coming Soon) */}
              <button
                disabled
                className="w-full p-4 rounded-xl border-2 border-[#292348] text-left opacity-50 cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold flex items-center gap-2">
                      Google Veo
                      <span className="text-[10px] px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">Coming Soon</span>
                    </div>
                    <p className="text-[#9b92c9] text-xs mt-1">Google 제공 | Vertex AI 연동 필요</p>
                  </div>
                </div>
              </button>

              {/* Sora (Coming Soon) */}
              <button
                disabled
                className="w-full p-4 rounded-xl border-2 border-[#292348] text-left opacity-50 cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold flex items-center gap-2">
                      OpenAI Sora
                      <span className="text-[10px] px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full">Coming Soon</span>
                    </div>
                    <p className="text-[#9b92c9] text-xs mt-1">OpenAI 제공 | API 대기 중</p>
                  </div>
                </div>
              </button>
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
