import React from 'react';
import { CreationStep } from './types';

interface ProgressBarProps {
  currentStep: CreationStep;
  onStepClick?: (step: CreationStep) => void;
}

const STEP_INFO = [
  { step: CreationStep.TOPIC, label: '기획', icon: 'edit_note' },
  { step: CreationStep.SCRIPT, label: '구성', icon: 'view_timeline' },
  { step: CreationStep.CUT_SELECTION, label: '이미지', icon: 'image' },
  { step: CreationStep.MOTION, label: '영상', icon: 'movie_filter' },
  { step: CreationStep.AUDIO_STYLE, label: '오디오', icon: 'graphic_eq' },
  { step: CreationStep.SUBTITLE, label: '자막편집', icon: 'subtitles' },
  { step: CreationStep.FINAL, label: '완료', icon: 'movie' },
];

export const ProgressBar: React.FC<ProgressBarProps> = ({ currentStep, onStepClick }) => {
  const currentIndex = STEP_INFO.findIndex(s => s.step === currentStep);
  const progress = ((currentIndex + 1) / STEP_INFO.length) * 100;

  return (
    <div className="w-full z-50 bg-[#0a0618] border-b border-white/10 shadow-lg flex-shrink-0">
      <div className="max-w-7xl mx-auto px-4 py-3">
        {/* Progress Bar */}
        <div className="relative h-2 bg-white/5 rounded-full overflow-hidden mb-3">
          <div 
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-purple-500 transition-all duration-500 shadow-[0_0_15px_rgba(55,19,236,0.5)]"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Steps */}
        <div className="flex items-center justify-between">
          {STEP_INFO.map((stepInfo, index) => {
            const isActive = stepInfo.step === currentStep;
            const isCompleted = index < currentIndex;
            
            return (
              <div
                key={stepInfo.step}
                className="flex flex-col items-center gap-1 flex-1 cursor-pointer group"
                onClick={() => onStepClick?.(stepInfo.step)}
              >
                <div className="flex items-center w-full">
                  {index > 0 && (
                    <div className={`h-0.5 flex-1 transition-colors ${
                      isCompleted ? 'bg-primary' : 'bg-white/10'
                    }`} />
                  )}

                  <div className={`flex items-center justify-center w-8 h-8 rounded-full transition-all group-hover:scale-110 group-hover:shadow-lg ${
                    isActive
                      ? 'bg-primary text-white scale-110 shadow-lg'
                      : isCompleted
                      ? 'bg-primary/30 text-primary group-hover:bg-primary/50'
                      : 'bg-white/5 text-white/30 group-hover:bg-white/10 group-hover:text-white/60'
                  }`}>
                    {isCompleted ? (
                      <span className="material-symbols-outlined text-[16px]">check</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">{stepInfo.icon}</span>
                    )}
                  </div>

                  {index < STEP_INFO.length - 1 && (
                    <div className={`h-0.5 flex-1 transition-colors ${
                      isCompleted ? 'bg-primary' : 'bg-white/10'
                    }`} />
                  )}
                </div>

                <span className={`text-[10px] font-bold transition-colors hidden md:block ${
                  isActive ? 'text-primary' : isCompleted ? 'text-white/70' : 'text-white/30 group-hover:text-white/60'
                }`}>
                  {stepInfo.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Current Step Name (Mobile) */}
        <div className="md:hidden text-center mt-2">
          <span className="text-sm font-bold text-primary">
            {STEP_INFO[currentIndex]?.label}
          </span>
          <span className="text-xs text-white/50 ml-2">
            {currentIndex + 1}/{STEP_INFO.length}
          </span>
        </div>
      </div>
    </div>
  );
};
