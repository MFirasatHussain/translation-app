import { useState, useEffect, useCallback, useRef } from 'react';

export default function useTranslation(sourceLanguage, targetLanguage) {
  const [translation, setTranslation] = useState('');
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  const translateAndPlay = useCallback(async (text) => {
    if (!text || !sourceLanguage || !targetLanguage) return;

    try {
      // First, get the translation
      const translationResponse = await fetch('/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          sourceLanguage,
          targetLanguage,
        }),
      });

      if (!translationResponse.ok) {
        throw new Error('Translation failed');
      }

      const translationData = await translationResponse.json();
      setTranslation(translationData.translatedText);

      // Then, get the audio for the translated text
      const audioResponse = await fetch('/api/text-to-speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: translationData.translatedText,
          language: targetLanguage,
        }),
      });

      if (!audioResponse.ok) {
        throw new Error('Audio generation failed');
      }

      const audioBlob = await audioResponse.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create and play the audio
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }

      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
      audioRef.current.onplay = () => setIsPlaying(true);
      audioRef.current.onpause = () => setIsPlaying(false);
      
      await audioRef.current.play();
      setError(null);
    } catch (err) {
      console.error('Translation/audio error:', err);
      setError(err.message);
    }
  }, [sourceLanguage, targetLanguage]);

  // Cleanup audio resources
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        URL.revokeObjectURL(audioRef.current.src);
      }
    };
  }, []);

  return {
    translation,
    error,
    isPlaying,
    translateAndPlay,
  };
} 