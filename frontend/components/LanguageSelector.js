import { useState } from 'react';

const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'zh', name: 'Chinese (Simplified)' },
  { code: 'ar', name: 'Arabic' },
  { code: 'hi', name: 'Hindi' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pl', name: 'Polish' },
  { code: 'tr', name: 'Turkish' },
  { code: 'vi', name: 'Vietnamese' },
];

export default function LanguageSelector({ 
  sourceLanguage, 
  targetLanguage, 
  onSourceLanguageChange, 
  onTargetLanguageChange 
}) {
  return (
    <div className="flex flex-col md:flex-row items-center justify-center space-y-2 md:space-y-0 md:space-x-4">
      <div className="flex items-center space-x-2">
        <label htmlFor="source-language-select" className="text-sm font-medium text-white">
          I speak:
        </label>
        <select
          id="source-language-select"
          value={sourceLanguage}
          onChange={(e) => onSourceLanguageChange(e.target.value)}
          className="bg-gray-700 text-white rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>
      
      <div className="flex items-center space-x-2">
        <label htmlFor="target-language-select" className="text-sm font-medium text-white">
          Show subtitles in:
        </label>
        <select
          id="target-language-select"
          value={targetLanguage}
          onChange={(e) => onTargetLanguageChange(e.target.value)}
          className="bg-gray-700 text-white rounded-md px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {languages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
} 