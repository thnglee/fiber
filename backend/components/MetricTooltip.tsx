'use client';

import { useState } from 'react';

interface MetricTooltipProps {
  title: string;
  description: string;
  children: React.ReactNode;
}

export function MetricTooltip({ title, description, children }: MetricTooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      <div className="cursor-help border-b border-dotted border-gray-400">
        {children}
      </div>
      
      {isVisible && (
        <div className="absolute z-[9999] w-64 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-xl bottom-full left-1/2 transform -translate-x-1/2 mb-2 pointer-events-none">
          <div className="font-semibold mb-1">{title}</div>
          <div className="text-gray-300 text-xs leading-relaxed">{description}</div>
          {/* Arrow pointing down */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
            <div className="w-2 h-2 bg-gray-900 rotate-45"></div>
          </div>
        </div>
      )}
    </div>
  );
}
