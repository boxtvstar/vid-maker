import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, updateSettings as saveSettings } from './services/settingsService';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSettingsUpdate: (newSettings: AppSettings) => void;
}

type TabType = 'script' | 'rules' | 'image' | 'audio' | 'video';

export const AdminModal: React.FC<AdminModalProps> = ({ isOpen, onClose, settings, onSettingsUpdate }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [activeTab, setActiveTab] = useState<TabType>('script');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettings(localSettings);
      onSettingsUpdate(localSettings);
      alert('설정이 저장되었습니다.');
      onClose();
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  // Generic Update Helpers
  const updateScript = (field: keyof AppSettings['script'], value: any) => {
    setLocalSettings({
      ...localSettings,
      script: { ...localSettings.script, [field]: value }
    });
  };

  // Style Helpers
  const handleAddStyle = () => {
    const newStyle = {
      id: `style_${Date.now()}`,
      label: 'New Style',
      prefix: '',
      previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=300&h=300&fit=crop'
    };
    setLocalSettings({
      ...localSettings,
      image: {
        ...localSettings.image,
        styles: [...localSettings.image.styles, newStyle]
      }
    });
  };

  const handleUpdateStyle = (id: string, field: string, value: string) => {
    setLocalSettings({
      ...localSettings,
      image: {
        ...localSettings.image,
        styles: localSettings.image.styles.map(s => s.id === id ? { ...s, [field]: value } : s)
      }
    });
  };

  const handleRemoveStyle = (id: string) => {
    setLocalSettings({
      ...localSettings,
      image: {
        ...localSettings.image,
        styles: localSettings.image.styles.filter(s => s.id !== id)
      }
    });
  };

  // Voice Helpers
  const handleAddVoice = () => {
    const newVoice = {
      id: `voice_${Date.now()}`,
      name: '새 음성',
      type: '일반',
      description: '',
      avatarUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&h=100&fit=crop',
      gender: 'female' as const,
      previewUrl: ''
    };
    setLocalSettings({
      ...localSettings,
      audio: {
        ...localSettings.audio,
        voices: [...localSettings.audio.voices, newVoice]
      }
    });
  };

  const handleUpdateVoice = (id: string, field: string, value: string) => {
    setLocalSettings({
      ...localSettings,
      audio: {
        ...localSettings.audio,
        voices: localSettings.audio.voices.map(v => v.id === id ? { ...v, [field]: value } : v)
      }
    });
  };

  const handleRemoveVoice = (id: string) => {
    setLocalSettings({
      ...localSettings,
      audio: {
        ...localSettings.audio,
        voices: localSettings.audio.voices.filter(v => v.id !== id)
      }
    });
  };

  const fetchElevenLabsInfo = async (voiceId: string) => {
    if (!voiceId || voiceId.length < 5) return alert('유효한 Voice ID를 입력해주세요.');
    
    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
      document.body.style.cursor = 'wait';
      
      const res = await fetch(`${API_BASE_URL}/api/tts/voice/${voiceId}`);
      document.body.style.cursor = 'default';

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `정보 조회 실패 (${res.status}): ID가 정확한지 확인해주세요.`);
      }
      
      const data = await res.json();
      if (data.success && data.voice) {
        const { name, type, previewUrl } = data.voice;
        
        setLocalSettings(prev => ({
          ...prev,
          audio: {
            ...prev.audio,
            voices: prev.audio.voices.map(v => v.id === voiceId ? { 
                ...v, 
                name: name || v.name, 
                type: type || v.type,
                previewUrl: previewUrl || v.previewUrl
            } : v)
          }
        }));
        
        alert(`[${name}] 정보를 성공적으로 동기화했습니다.`);
      }
    } catch (e: any) {
      document.body.style.cursor = 'default';
      alert(e.message);
    }
  };

  // Video Provider Helpers
  const handleUpdateProvider = (id: string, field: string, value: any) => {
    setLocalSettings({
      ...localSettings,
      video: {
        ...localSettings.video,
        providers: localSettings.video.providers.map(p => p.id === id ? { ...p, [field]: value } : p)
      }
    });
  };

  const handleUpdateMotionRule = (key: string, value: string) => {
    setLocalSettings({
      ...localSettings,
      video: {
        ...localSettings.video,
        motionRules: {
          ...(localSettings.video.motionRules || {}),
          [key]: value
        }
      }
    });
  };

  const handleFileUpload = async (type: 'style' | 'voice' | 'audio', id: string, file: File) => {
    const formData = new FormData();
    const fieldName = type === 'audio' ? 'audio' : 'image';
    const endpoint = type === 'audio' ? 'audio' : 'style';
    formData.append(fieldName, file);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_URL ?? '';
      const res = await fetch(`${API_BASE_URL}/api/upload/${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (data.success) {
        if (type === 'style') {
          handleUpdateStyle(id, 'previewUrl', data.imageUrl);
        } else if (type === 'voice') {
          handleUpdateVoice(id, 'avatarUrl', data.imageUrl);
        } else if (type === 'audio') {
          handleUpdateVoice(id, 'previewUrl', data.imageUrl);
        }
      }
    } catch (error) {
      console.error('File upload failed:', error);
      alert('파일 업로드에 실패했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-hidden">
      <div 
        className="bg-[#131022] border border-[#292348] w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[#292348] flex justify-between items-center bg-[#1a162e]">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl">settings_applications</span>
            <div>
              <h2 className="text-xl font-bold text-white">관리자 통합 설정</h2>
              <p className="text-sm text-white/50">서비스 전반의 AI 프롬프트 및 리소스 관리</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-[#0a0618] border-b border-[#292348] overflow-x-auto no-scrollbar">
          {[
            { id: 'script', label: '1. 기획', icon: 'edit_note' },
            { id: 'rules', label: '2. 구성', icon: 'format_list_bulleted' },
            { id: 'audio', label: '3. 오디오', icon: 'record_voice_over' },
            { id: 'image', label: '4. 이미지', icon: 'palette' },
            { id: 'video', label: '5. 영상', icon: 'movie_filter' },
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`px-6 py-4 text-xs font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-white/50 hover:text-white'}`}
            >
              <span className="material-symbols-outlined text-sm">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 pt-4 custom-scrollbar bg-[#0d0a1a]">
          {/* Tab 1: Script */}
          {activeTab === 'script' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-6">
                <span className="material-symbols-outlined text-primary">psychology</span>
                <h3 className="text-white font-bold">대본 생성 지침 (LLM)</h3>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-white/30 mb-2 uppercase tracking-widest">System Prompt</label>
                <textarea 
                  value={localSettings.script.systemPrompt}
                  onChange={(e) => updateScript('systemPrompt', e.target.value)}
                  className="w-full h-48 bg-[#0a0618] border border-[#292348] rounded-xl p-4 text-white text-sm focus:border-primary outline-none transition-all resize-none font-mono"
                  placeholder="{duration}, {language}, {char_limit} 포함 가능"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-white/30 mb-2 uppercase">Model Selection</label>
                  <div className="grid grid-cols-1 gap-2 mb-2">
                    {(localSettings.script.models || []).map(model => (
                      <div 
                        key={model.id}
                        onClick={() => updateScript('defaultModel', model.id)}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                          (localSettings.script.defaultModel || localSettings.script.model) === model.id 
                            ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' 
                            : 'bg-[#0d0a1a] border-[#292348] hover:border-white/20'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                              <span className="text-white font-bold text-xs">{model.label}</span>
                              {(localSettings.script.defaultModel || localSettings.script.model) === model.id && (
                                <span className="bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded">ACTIVE</span>
                              )}
                          </div>
                          <p className="text-white/50 text-[10px] mt-0.5">{model.description}</p>
                        </div>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                            (localSettings.script.defaultModel || localSettings.script.model) === model.id 
                              ? 'border-primary bg-primary' 
                              : 'border-white/20 group-hover:border-white/50'
                        }`}>
                            {(localSettings.script.defaultModel || localSettings.script.model) === model.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                      </div>
                    ))}
                    {/* Fallback for manual entry if models array is empty, though settings.json should have it */}
                    {(!localSettings.script.models || localSettings.script.models.length === 0) && (
                       <input type="text" value={localSettings.script.model} onChange={(e) => updateScript('model', e.target.value)} className="w-full bg-[#0a0618] border border-[#292348] rounded-lg p-3 text-white text-sm focus:border-primary outline-none" />
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-white/30 mb-2 uppercase">Temperature</label>
                  <input type="number" step="0.1" value={localSettings.script.temperature} onChange={(e) => updateScript('temperature', parseFloat(e.target.value))} className="w-full bg-[#0a0618] border border-[#292348] rounded-lg p-3 text-white text-sm focus:border-primary outline-none" />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-white/30 mb-2 uppercase">Max Tokens</label>
                  <input type="number" value={localSettings.script.maxTokens} onChange={(e) => updateScript('maxTokens', parseInt(e.target.value))} className="w-full bg-[#0a0618] border border-[#292348] rounded-lg p-3 text-white text-sm focus:border-primary outline-none" />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Rules */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-6">
                <span className="material-symbols-outlined text-primary">rule</span>
                <h3 className="text-white font-bold">장면 구성 상세 규칙</h3>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-white/30 mb-2 uppercase tracking-widest">Detailed Rules</label>
                <textarea 
                  value={localSettings.script.rules}
                  onChange={(e) => updateScript('rules', e.target.value)}
                  className="w-full h-64 bg-[#0a0618] border border-[#292348] rounded-xl p-4 text-white text-sm focus:border-primary outline-none transition-all resize-none font-mono"
                  placeholder="예: - 장면은 3개로 구성, - 친근한 말투 사용"
                />
              </div>
            </div>
          )}

          {/* Tab 3: Audio */}
          {activeTab === 'audio' && (
            <div className="space-y-6">
               <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">mic</span>
                  <h3 className="text-white font-bold">AI 음성 관리 (ElevenLabs)</h3>
                </div>
                <button onClick={handleAddVoice} className="px-4 py-2 bg-primary rounded-lg text-white text-[11px] font-bold hover:bg-primary/90 transition-all flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">add</span> 음성 추가
                </button>
              </div>

               {/* Audio Model Selection */}
               {localSettings.audio.models && localSettings.audio.models.length > 0 && (
                <div className="bg-[#1a162e] border border-[#292348] rounded-xl p-4 mb-6">
                  <h4 className="text-[11px] font-bold text-white/50 uppercase tracking-widest mb-3">Speech Generation Model</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {localSettings.audio.models.map(model => (
                      <div 
                        key={model.id}
                        onClick={() => setLocalSettings({
                          ...localSettings,
                          audio: { ...localSettings.audio, defaultModel: model.id }
                        })}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between group ${
                          localSettings.audio.defaultModel === model.id 
                            ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' 
                            : 'bg-[#0d0a1a] border-[#292348] hover:border-white/20'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-2">
                              <span className="text-white font-bold text-xs">{model.label}</span>
                              {localSettings.audio.defaultModel === model.id && (
                                <span className="bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded">ACTIVE</span>
                              )}
                          </div>
                          <p className="text-white/50 text-[10px] mt-0.5">{model.description}</p>
                        </div>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                            localSettings.audio.defaultModel === model.id 
                              ? 'border-primary bg-primary' 
                              : 'border-white/20 group-hover:border-white/50'
                        }`}>
                            {localSettings.audio.defaultModel === model.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
               )}
              
              <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg mb-4 text-[11px] text-[#9b92c9]">
                <p className="font-bold text-white mb-1">📢 AI 목소리 설정 가이드</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>기본 등록된 목소리는 ElevenLabs 다국어 모델(영어 기반)입니다. 한국어도 가능하지만 원어민 억양과 차이가 있을 수 있습니다.</li>
                  <li><b>완벽한 한국어 발음</b>을 원하시면, ElevenLabs Voice Lab이나 Library에서 <b>한국인 성우의 Voice ID</b>를 찾아 입력해주세요.</li>
                  <li><b>목소리 찾기:</b> <a href="https://elevenlabs.io/voice-library" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-bold">ElevenLabs Voice Library 바로가기</a> (Language: Korean 선택 추천)</li>
                  <li><b>FAL 연동:</b> ElevenLabs의 공개 Voice ID라면, 여기에 입력만 해도 <b>FAL을 통해 즉시 생성</b>됩니다. (별도 등록/결제 불필요)</li>
                  <li>관리자 모드에서 Voice ID를 변경하면 즉시 반영됩니다.</li>
                </ul>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {localSettings.audio.voices.map((voice, idx) => (
                  <div key={idx} className="bg-[#1a162e] border border-[#292348] rounded-xl p-4 relative flex gap-4 transition-all hover:border-primary/30">
                    <button onClick={() => handleRemoveVoice(voice.id)} className="absolute top-2 right-2 text-white/20 hover:text-red-500 transition-colors" title="삭제"><span className="material-symbols-outlined text-sm">delete</span></button>
                    <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-[#292348] flex-shrink-0 relative group self-center">
                      <img src={voice.avatarUrl} className="w-full h-full object-cover" />
                      <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                        <span className="material-symbols-outlined text-white text-xs">upload</span>
                        <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload('voice', voice.id, e.target.files[0])} />
                      </label>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[9px] text-white/40 block mb-1">표시 이름</label>
                        <input type="text" value={voice.name} onChange={(e) => handleUpdateVoice(voice.id, 'name', e.target.value)} placeholder="이름" className="w-full bg-[#0a0618] border border-[#292348] rounded p-2 text-white text-xs focus:border-primary outline-none" />
                      </div>
                      <div>
                        <label className="text-[9px] text-primary/80 font-bold block mb-1">ElevenLabs Voice ID</label>
                        <div className="flex gap-1">
                           <input type="text" value={voice.id} onChange={(e) => handleUpdateVoice(voice.id, 'id', e.target.value)} placeholder="Voice ID 붙여넣기" className="flex-1 bg-[#0a0618] border border-primary/30 text-primary rounded p-2 text-xs font-mono focus:border-primary outline-none focus:bg-primary/5" />
                           <button onClick={() => fetchElevenLabsInfo(voice.id)} className="bg-primary/20 text-primary hover:bg-primary hover:text-white px-2 rounded transition-all text-xs font-bold" title="Voice 정보 불러오기">
                             <span className="material-symbols-outlined text-sm">sync</span>
                           </button>
                        </div>
                      </div>
                      <div>
                         <label className="text-[9px] text-white/40 block mb-1">성격/타입</label>
                         <input type="text" value={voice.type} onChange={(e) => handleUpdateVoice(voice.id, 'type', e.target.value)} placeholder="예: 차분한, 전문적인" className="w-full bg-[#0a0618] border border-[#292348] rounded p-2 text-white text-xs focus:border-primary outline-none" />
                      </div>
                      <div>
                        <label className="text-[9px] text-white/40 block mb-1">미리듣기 URL</label>
                        <div className="flex gap-1">
                          <input type="text" value={voice.previewUrl} onChange={(e) => handleUpdateVoice(voice.id, 'previewUrl', e.target.value)} placeholder="https://..." className="flex-1 bg-[#0a0618] border border-[#292348] rounded p-2 text-white text-[10px] focus:border-primary outline-none" />
                          <label className="flex items-center justify-center bg-primary/20 hover:bg-primary/30 border border-primary/40 rounded px-2 cursor-pointer transition-all" title="오디오 파일 업로드">
                             <span className="material-symbols-outlined text-xs text-primary">upload_file</span>
                             <input type="file" className="hidden" accept="audio/*" onChange={(e) => e.target.files?.[0] && handleFileUpload('audio', voice.id, e.target.files[0])} />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 4: Image Styles */}
          {activeTab === 'image' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center border-b border-white/5 pb-4 mb-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">burst_mode</span>
                  <h3 className="text-white font-bold">이미지 스타일 셋팅</h3>
                </div>
                <button onClick={handleAddStyle} className="px-4 py-2 bg-primary rounded-lg text-white text-[11px] font-bold hover:bg-primary/90 transition-all flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">add</span> 스타일 추가
                </button>
              </div>

              {/* Image Model Selection */}
              <div className="bg-[#1a162e] border border-[#292348] rounded-xl p-5 mb-6">
                <div className="flex items-center gap-2 mb-4">
                   <span className="material-symbols-outlined text-primary">rocket_launch</span>
                   <h3 className="text-white font-bold">이미지 생성 모델 선택</h3>
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  {(localSettings.image.models || []).map(model => (
                    <div 
                      key={model.id}
                      onClick={() => setLocalSettings({
                        ...localSettings,
                        image: { ...localSettings.image, defaultModel: model.id }
                      })}
                      className={`p-4 rounded-xl border-2 transition-all cursor-pointer flex items-center justify-between group ${
                        localSettings.image.defaultModel === model.id 
                          ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10' 
                          : 'bg-[#0d0a1a] border-[#292348] hover:border-white/20'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                           <span className="text-white font-bold text-sm">{model.label}</span>
                           {localSettings.image.defaultModel === model.id && (
                             <span className="bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded">ACTIVE</span>
                           )}
                        </div>
                        <p className="text-white/50 text-xs mt-0.5">{model.description}</p>
                        <code className="text-[9px] text-white/30 font-mono mt-1 block">{model.id}</code>
                      </div>
                      
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                         localSettings.image.defaultModel === model.id 
                           ? 'border-primary bg-primary' 
                           : 'border-white/20 group-hover:border-white/50'
                      }`}>
                         {localSettings.image.defaultModel === model.id && <div className="w-2 h-2 bg-white rounded-full" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-8">
                <label className="block text-[11px] font-bold text-white/30 mb-2 uppercase tracking-widest">Image Generation System Prompt (캐릭터/일관성 규칙)</label>
                <textarea 
                  value={localSettings.image.promptGenerationSystem || ''}
                  onChange={(e) => setLocalSettings({...localSettings, image: {...localSettings.image, promptGenerationSystem: e.target.value}})}
                  className="w-full h-80 bg-[#0a0618] border border-[#292348] rounded-xl p-4 text-white text-sm focus:border-primary outline-none transition-all resize-none font-mono"
                  placeholder="이미지 프롬프트 생성 및 캐릭터 일관성 규칙을 입력하세요..."
                />
              </div>

              <div className="grid grid-cols-1 gap-6">
                {localSettings.image.styles.map(style => (
                  <div key={style.id} className="bg-[#1a162e] border border-[#292348] rounded-xl p-5 relative flex gap-6">
                    <button onClick={() => handleRemoveStyle(style.id)} className="absolute top-2 right-2 text-white/20 hover:text-red-500 transition-colors"><span className="material-symbols-outlined text-sm">delete</span></button>
                    <div className="w-24 h-24 rounded-lg overflow-hidden border border-[#292348] flex-shrink-0 relative group">
                      <img src={style.previewUrl} className="w-full h-full object-cover" />
                      <label className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                        <span className="material-symbols-outlined text-white text-sm">upload</span>
                        <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload('style', style.id, e.target.files[0])} />
                      </label>
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="flex gap-2">
                        <input type="text" value={style.label} onChange={(e) => handleUpdateStyle(style.id, 'label', e.target.value)} className="flex-1 bg-[#0a0618] border border-[#292348] rounded p-2 text-white text-xs font-bold" />
                        <input type="text" value={style.id} disabled className="w-32 bg-[#0a0618]/50 border border-[#292348] rounded p-2 text-white/30 text-[10px]" />
                      </div>
                      <input 
                        type="text" 
                        value={style.previewUrl} 
                        onChange={(e) => handleUpdateStyle(style.id, 'previewUrl', e.target.value)}
                        placeholder="이미지 URL 직접 입력 (https://...)" 
                        className="w-full bg-[#0a0618] border border-[#292348] rounded p-2 text-white/70 text-[10px]" 
                      />
                      <textarea value={style.prefix} onChange={(e) => handleUpdateStyle(style.id, 'prefix', e.target.value)} placeholder="프롬프트 접두사 (Prompt Prefix)" className="w-full h-16 bg-[#0a0618] border border-[#292348] rounded p-2 text-white text-[11px] resize-none" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 5: Video Settings */}
          {activeTab === 'video' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 border-b border-white/5 pb-4 mb-6">
                <span className="material-symbols-outlined text-primary">smart_display</span>
                <h3 className="text-white font-bold">영상 생성 모델 (Video Extractor)</h3>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {localSettings.video.providers.map(provider => (
                  <div key={provider.id} className={`p-5 rounded-xl border-2 transition-all ${provider.enabled ? 'bg-primary/5 border-primary/40' : 'bg-[#1a162e] border-[#292348] opacity-60'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary">video_stable</span>
                        <div>
                          <input type="text" value={provider.label} onChange={(e) => handleUpdateProvider(provider.id, 'label', e.target.value)} className="bg-transparent border-none text-white font-bold focus:outline-none" />
                          <p className="text-[10px] text-white/50">{provider.name.toUpperCase()} API 기반</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => handleUpdateProvider(provider.id, 'enabled', !provider.enabled)}
                        className={`px-3 py-1 rounded-full text-[10px] font-bold ${provider.enabled ? 'bg-green-500/20 text-green-400' : 'bg-white/5 text-white/30'}`}
                      >
                        {provider.enabled ? '활성화됨' : '비활성'}
                      </button>
                    </div>
                    <textarea value={provider.description} onChange={(e) => handleUpdateProvider(provider.id, 'description', e.target.value)} className="w-full bg-black/20 border border-white/5 rounded p-2 text-white/70 text-[11px] resize-none" />
                  </div>
                ))}
              </div>

              {/* Prompt Template Editor */}
              <div className="space-y-4 pt-6 border-t border-white/5 mt-6">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">edit_note</span>
                  <h3 className="text-white font-bold">영상 프롬프트 조합 규칙 (Template)</h3>
                </div>
                <p className="text-xs text-white/50">
                  AI에게 전달될 최종 프롬프트의 형식을 지정합니다. (기본값: <code className="text-primary">{`{motion}. {prompt}`}</code>)<br/>
                  <span className="text-white/30">사용 가능 변수: </span>
                  <code className="text-primary">{`{prompt}`}</code> (이미지 프롬프트), 
                  <code className="text-primary">{`{motion}`}</code> (모션 명령어)
                </p>
                <textarea
                  value={localSettings.video.promptTemplate || '{motion}. {prompt}'}
                  onChange={(e) => setLocalSettings({...localSettings, video: {...localSettings.video, promptTemplate: e.target.value}})}
                  className="w-full h-24 bg-[#0a0618] border border-[#292348] rounded-xl p-4 text-white text-sm focus:border-primary outline-none transition-all resize-none font-mono"
                  placeholder="{motion}. {prompt}, high quality, detailed"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-[#292348] flex justify-end gap-3 bg-[#1a162e]">
          <button onClick={onClose} className="px-6 py-2.5 rounded-xl border border-[#292348] text-white/70 font-bold text-sm hover:bg-white/5 transition-all">취소</button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="px-8 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all flex items-center gap-2"
          >
            {isSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
            관리자 설정 전체 저장 및 즉시 적용
          </button>
        </div>
      </div>
    </div>
  );
};
