import React from 'react';

interface LoadingSpinnerProps {
  message: string;
  progress?: number;
  estimatedTime?: number; // seconds
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ 
  message, 
  progress, 
  estimatedTime 
}) => {
  const formatTime = (seconds: number) => {
    if (seconds < 60) {
      return `약 ${Math.ceil(seconds)}초`;
    } else {
      const minutes = Math.ceil(seconds / 60);
      return `약 ${minutes}분`;
    }
  };

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {/* Spinner */}
      <div className="relative">
        <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        {progress !== undefined && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">{Math.round(progress)}%</span>
          </div>
        )}
      </div>

      {/* Message */}
      <div className="text-center">
        <p className="text-white font-medium mb-1">{message}</p>
        
        {estimatedTime !== undefined && estimatedTime > 0 && (
          <p className="text-xs text-white/50">
            {formatTime(estimatedTime)} 남음
          </p>
        )}
      </div>

      {/* Progress Bar */}
      {progress !== undefined && (
        <div className="w-full max-w-xs h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-purple-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
};
