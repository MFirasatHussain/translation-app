import { useState, useEffect, useCallback } from 'react';

export default function useTranslation(targetLanguage) {
  const [transcript, setTranscript] = useState('');
  const [translation, setTranslation] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState(null);

  // Initialize speech recognition
  const recognition = typeof window !== 'undefined' 
    ? new (window.SpeechRecognition || window.webkitSpeechRecognition)() 
    : null;

  useEffect(() => {
    if (!recognition) return;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const result = event.results[current];
      const transcriptText = result[0].transcript;
      
      setTranscript(transcriptText);
      
      // Only translate final results
      if (result.isFinal) {
        translateText(transcriptText);
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      if (isListening) {
        recognition.start();
      }
    };

    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, [recognition, targetLanguage]);

  const translateText = async (text) => {
    try {
      // Using Google Cloud Translate API
      // Note: You'll need to set up a Google Cloud project and get an API key
      const response = await fetch(`/api/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          targetLanguage,
        }),
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      const data = await response.json();
      setTranslation(data.translatedText);
    } catch (err) {
      console.error('Translation error:', err);
      setError(err.message);
    }
  };

  const startListening = useCallback(() => {
    if (!recognition) return;
    
    try {
      recognition.start();
      setIsListening(true);
      setError(null);
    } catch (err) {
      console.error('Failed to start listening:', err);
      setError(err.message);
    }
  }, [recognition]);

  const stopListening = useCallback(() => {
    if (!recognition) return;
    
    recognition.stop();
    setIsListening(false);
  }, [recognition]);

  return {
    transcript,
    translation,
    isListening,
    error,
    startListening,
    stopListening,
  };
} 