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
      <div className="cursor-help">
        {children}
      </div>
      
      {isVisible && (
        <div className="absolute z-50 w-72 p-3 bg-gray-900 text-white text-sm rounded-lg shadow-lg -top-2 left-full ml-2 transform -translate-y-full">
          <div className="font-semibold mb-1">{title}</div>
          <div className="text-gray-300 text-xs leading-relaxed">{description}</div>
          {/* Arrow pointing to the left */}
          <div className="absolute top-1/2 -left-1 transform -translate-y-1/2">
            <div className="w-2 h-2 bg-gray-900 rotate-45"></div>
          </div>
        </div>
      )}
    </div>
  );
}
