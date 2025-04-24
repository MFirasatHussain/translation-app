// frontend/pages/room/[roomId].js
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import useSocket from "@/hooks/useSocket";
import setupPeer from "@/hooks/peer";
import useSpeechRecognition from "@/hooks/useSpeechRecognition";
import useTranslation from "@/hooks/useTranslation";
import LanguageSelector from "@/components/LanguageSelector";
import { languages } from "@/utils/languages";
import { v4 as uuidv4 } from "uuid";

export default function Room() {
  const router = useRouter();
  const { roomId } = router.query;

  const [userId] = useState(() => uuidv4());
  const [remoteStream, setRemoteStream] = useState(null);
  const [localStreamReady, setLocalStreamReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [debugInfo, setDebugInfo] = useState({
    peerId: "",
    socketConnected: false,
    iceState: "unknown",
    lastError: ""
  });
  
  // Language selection states
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('es');
  
  // Media control states
  const [isLocalAudioEnabled, setIsLocalAudioEnabled] = useState(false);
  const [isLocalVideoEnabled, setIsLocalVideoEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isRemoteRecording, setIsRemoteRecording] = useState(false);
  const [receivedAudioUrl, setReceivedAudioUrl] = useState(null);
  const [localRecordings, setLocalRecordings] = useState([]);
  const [isTranslating, setIsTranslating] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [remotePeerId, setRemotePeerId] = useState(null);

  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);

  const socketRef = useSocket(roomId, userId);

  const [remoteTranscript, setRemoteTranscript] = useState('');
  
  const {
    transcript,
    isListening,
    error: speechError,
    startListening,
    stopListening,
  } = useSpeechRecognition();

  const {
    translation,
    error: translationError,
    isPlaying,
    translateAndPlay,
  } = useTranslation(sourceLanguage, targetLanguage);

  // Add state for remote user's language preferences
  const [remoteUserLanguages, setRemoteUserLanguages] = useState({
    speaks: '',
    wantsToHear: ''
  });

  const [translatedAudioUrl, setTranslatedAudioUrl] = useState(null);
  const [translationData, setTranslationData] = useState(null);
  const [receivedAudios, setReceivedAudios] = useState([]);

  useEffect(() => {
    console.log("🧠 RoomID:", roomId);
    console.log("👤 UserID:", userId);
  }, [roomId, userId]);

  // Get local media with error handling
  useEffect(() => {
    const setupLocalStream = async () => {
      try {
        console.log("🎥 Requesting media permissions...");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user"
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        
        console.log("✅ Media permissions granted");
        localStreamRef.current = stream;
        setLocalStreamReady(true);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("❌ Error accessing media devices:", err);
        setConnectionStatus("error");
        setDebugInfo(prev => ({ ...prev, lastError: `Media error: ${err.message}` }));
      }
    };

    setupLocalStream();

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Function to send language preferences to remote peer
  const sendLanguagePreferences = () => {
    if (remotePeerId && peerRef.current) {
      const preferences = {
        speaks: sourceLanguage,
        wantsToHear: targetLanguage
      };
      peerRef.current.send(remotePeerId, 'language-preferences', { preferences });
      console.log('Sent language preferences:', preferences);
    } else {
      console.warn('Cannot send preferences - no peer connection');
    }
  };

  // Send language preferences whenever peer connection is established
  useEffect(() => {
    if (remotePeerId && peerRef.current) {
      sendLanguagePreferences();
    }
  }, [remotePeerId]);

  // Setup peer connection with transcript and language preferences handling
  useEffect(() => {
    if (roomId && socketRef.current && userId && localStreamReady) {
      console.log('Setting up peer connection with:', {
        roomId,
        userId,
        socketConnected: socketRef.current.connected,
        hasLocalStream: !!localStreamRef.current
      });
      
      const peer = setupPeer(
        roomId, 
        socketRef, 
        userId, 
        localStreamRef, 
        (stream) => {
          console.log('Received remote stream:', {
            hasAudio: stream.getAudioTracks().length > 0,
            hasVideo: stream.getVideoTracks().length > 0
          });
          setRemoteStream(stream);
        },
        (text) => {
          console.log('Received transcript:', text);
          setRemoteTranscript(text);
        },
        (preferences) => {
          console.log('Received language preferences:', preferences);
          setRemoteUserLanguages(preferences);
        },
        (message) => {
          console.log('Received audio message:', {
            fromLanguage: message.fromLanguage,
            toLanguage: message.toLanguage,
            hasAudioBlob: !!message.audioBlob
          });
          
          const url = URL.createObjectURL(message.audioBlob);
          const timestamp = new Date().toLocaleTimeString();
          
          setReceivedAudios(prev => [...prev, {
            url,
            timestamp,
            fromLanguage: message.fromLanguage,
            toLanguage: message.toLanguage,
            sourceText: message.sourceText,
            translatedText: message.translatedText
          }]);
        }
      );

      peerRef.current = peer;

      // Update debug info when peer ID is available
      if (peer) {
        peer.on("open", (id) => {
          console.log("Peer opened with ID:", id);
          setDebugInfo(prev => ({ ...prev, peerId: id }));
        });

        // Handle peer connection
        peer.on("connection", (conn) => {
          console.log("New peer connection:", conn.peer);
          setRemotePeerId(conn.peer);
          // Send our preferences when we get a new connection
          setTimeout(sendLanguagePreferences, 1000); // Small delay to ensure connection is ready
        });
      }

      // Update debug info when socket connects
      if (socketRef.current.connected) {
        setDebugInfo(prev => ({ ...prev, socketConnected: true }));
      }

      socketRef.current.on("connect", () => {
        setDebugInfo(prev => ({ ...prev, socketConnected: true }));
      });

      socketRef.current.on("disconnect", () => {
        setDebugInfo(prev => ({ ...prev, socketConnected: false }));
      });

      // Cleanup function
      return () => {
        if (peerRef.current) {
          peerRef.current.destroy();
        }
        if (remoteStream) {
          remoteStream.getTracks().forEach(track => track.stop());
        }
      };
    }
  }, [roomId, socketRef, userId, localStreamReady]);

  // Display remote stream with error handling
  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      try {
        console.log("📺 Setting remote stream to video element");
        remoteVideoRef.current.srcObject = remoteStream;
        setConnectionStatus("connected");
        
        // Log stream tracks for debugging
        console.log("🎥 Remote stream tracks:", remoteStream.getTracks().map(t => ({
          kind: t.kind,
          enabled: t.enabled,
          muted: t.muted,
          readyState: t.readyState
        })));
      } catch (err) {
        console.error("❌ Error setting remote stream:", err);
        setConnectionStatus("error");
        setDebugInfo(prev => ({ ...prev, lastError: `Stream error: ${err.message}` }));
      }
    }
  }, [remoteStream]);

  // Ensure audio is muted by default
  useEffect(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
      }
    }
  }, [localStreamRef.current]);

  // Combined function to handle audio toggle and recording
  const toggleAudio = async () => {
    if (isRemoteRecording) return;

    if (isLocalAudioEnabled) {
      // Stop recording and disable audio
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsLocalAudioEnabled(false);
      setIsRecording(false);
      if (remotePeerId && peerRef.current) {
        peerRef.current.send(remotePeerId, 'recording-stopped', {});
      }
    } else {
      try {
        // Start recording and enable audio
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        audioChunksRef.current = [];

        mediaRecorderRef.current.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        mediaRecorderRef.current.onstop = async () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
          // Save locally
          const timestamp = new Date().toLocaleTimeString();
          const url = URL.createObjectURL(audioBlob);
          setLocalRecordings(prev => [...prev, { url, timestamp }]);
          
          // Send to remote peer
          if (remotePeerId && peerRef.current) {
            peerRef.current.send(remotePeerId, 'audio-message', { audioBlob });
          }
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorderRef.current.start();
        setIsLocalAudioEnabled(true);
        setIsRecording(true);
        if (remotePeerId && peerRef.current) {
          peerRef.current.send(remotePeerId, 'recording-started', {});
        }
      } catch (err) {
        console.error('Error starting recording:', err);
      }
    }
  };

  // Simplified video toggle
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isLocalVideoEnabled;
        setIsLocalVideoEnabled(!isLocalVideoEnabled);
      }
    }
  };

  // Update remote peer ID when connection is established
  useEffect(() => {
    if (peerRef.current && remoteStream) {
      // Find the peer ID from connections
      const connections = peerRef.current.connections;
      for (const peerId in connections) {
        if (connections[peerId] && connections[peerId].length > 0) {
          setRemotePeerId(peerId);
          break;
        }
      }
    }
  }, [remoteStream]);

  // Update the transcript handling to include audio translation
  useEffect(() => {
    if (transcript && remotePeerId && peerRef.current) {
      peerRef.current.sendTranscript(remotePeerId, transcript);
      translateAndPlay(transcript);
    }
  }, [transcript, remotePeerId, translateAndPlay]);

  // Handle remote transcript with audio translation
  useEffect(() => {
    if (remoteTranscript) {
      translateAndPlay(remoteTranscript);
    }
  }, [remoteTranscript, translateAndPlay]);

  // Toggle speech recognition
  const toggleSpeechRecognition = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // Handle receiving language preferences
  useEffect(() => {
    if (peerRef.current) {
      peerRef.current.on('language-preferences', (preferences) => {
        console.log('Received language preferences:', preferences);
        setRemoteUserLanguages(preferences);
      });
    }
  }, [peerRef.current]);

  // Handle incoming recording state changes and audio messages
  useEffect(() => {
    if (peerRef.current) {
      peerRef.current.on('recording-started', () => {
        setIsRemoteRecording(true);
      });

      peerRef.current.on('recording-stopped', () => {
        setIsRemoteRecording(false);
      });

      peerRef.current.on('audio-message', ({ audioBlob, fromLanguage, toLanguage }) => {
        const url = URL.createObjectURL(audioBlob);
        setReceivedAudioUrl(url);
        console.log(`Received audio translated from ${fromLanguage} to ${toLanguage}`);
      });
    }
  }, [peerRef.current]);

  // Handle incoming audio messages
  useEffect(() => {
    if (peerRef.current) {
      console.log('Setting up audio message listener');
      
      peerRef.current.on('audio-message', (data) => {
        console.log('📥 Received audio message data:', {
          fromLanguage: data.fromLanguage,
          toLanguage: data.toLanguage,
          sourceText: data.sourceText,
          translatedText: data.translatedText,
          audioBlobSize: data.audioBlob?.size,
          audioBlobType: data.audioBlob?.type
        });

        // Create URL from the blob
        const url = URL.createObjectURL(data.audioBlob);
        console.log('🔗 Created URL for audio:', url);

        // Verify the blob is valid
        const testAudio = new Audio(url);
        testAudio.onloadedmetadata = () => {
          console.log('✅ Audio blob is valid:', {
            duration: testAudio.duration,
            readyState: testAudio.readyState
          });
        };
        testAudio.onerror = (e) => {
          console.error('❌ Audio blob is invalid:', e);
        };

        const timestamp = new Date().toLocaleTimeString();
        
        setReceivedAudios(prev => {
          console.log('📝 Updating received audios. Current count:', prev.length);
          return [...prev, {
            url,
            timestamp,
            fromLanguage: data.fromLanguage,
            toLanguage: data.toLanguage,
            sourceText: data.sourceText,
            translatedText: data.translatedText
          }];
        });
      });

      // Add connection status logging
      peerRef.current.on('connect', (peerId) => {
        console.log('🔌 Peer connected:', peerId);
      });

      peerRef.current.on('disconnect', (peerId) => {
        console.log('🔌 Peer disconnected:', peerId);
      });

      peerRef.current.on('error', (error) => {
        console.error('❌ Peer connection error:', error);
      });
    }
  }, [peerRef.current]);

  // Log when remote peer ID changes
  useEffect(() => {
    console.log('Remote peer ID updated:', remotePeerId);
  }, [remotePeerId]);

  // Clean up audio URLs when component unmounts
  useEffect(() => {
    return () => {
      if (receivedAudioUrl) {
        URL.revokeObjectURL(receivedAudioUrl);
      }
      if (translatedAudioUrl) {
        URL.revokeObjectURL(translatedAudioUrl);
      }
      localRecordings.forEach(recording => {
        URL.revokeObjectURL(recording.url);
      });
      receivedAudios.forEach(audio => {
        URL.revokeObjectURL(audio.url);
      });
    };
  }, [receivedAudioUrl, translatedAudioUrl, localRecordings, receivedAudios]);

  // Function to translate audio
  const translateAudio = async (audioBlob) => {
    setIsTranslating(true);
    try {
      // Create form data
      const formData = new FormData();
      formData.append('audio', audioBlob);
      formData.append('source_language', sourceLanguage);
      formData.append('target_language', remoteUserLanguages.wantsToHear);

      // Send to our Python translation server
      const response = await fetch('http://localhost:8000/translate-audio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Translation failed');
      }

      // Get the translated audio blob
      const translatedAudioBlob = await response.blob();
      
      // Create URL for the translated audio
      const url = URL.createObjectURL(translatedAudioBlob);
      
      // Get the base64 encoded transcription and translation from headers
      const sourceTextB64 = response.headers.get('source-text-base64');
      const translatedTextB64 = response.headers.get('translated-text-base64');
      
      // Decode the base64 strings
      const sourceText = sourceTextB64 ? new TextDecoder().decode(base64ToUint8Array(sourceTextB64)) : '';
      const translatedText = translatedTextB64 ? new TextDecoder().decode(base64ToUint8Array(translatedTextB64)) : '';
      
      console.log('Transcription:', sourceText);
      console.log('Translation:', translatedText);
      
      // Save translation data for later sending
      setTranslationData({
        audioBlob: translatedAudioBlob,
        fromLanguage: sourceLanguage,
        toLanguage: remoteUserLanguages.wantsToHear,
        sourceText,
        translatedText
      });

      // Set the translated audio URL for local playback
      setTranslatedAudioUrl(url);

      return url;
    } catch (error) {
      console.error('Translation error:', error);
      throw error;
    } finally {
      setIsTranslating(false);
    }
  };

  // Helper function to convert base64 to Uint8Array
  const base64ToUint8Array = (base64) => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  };

  // Function to chunk array into smaller pieces
  const chunkArray = (array, chunkSize) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  };

  const sendTranslatedAudio = () => {
    if (remotePeerId && peerRef.current && translationData) {
      console.log('🎯 Attempting to send audio message to peer:', remotePeerId);
      console.log('📦 Translation data being sent:', {
        fromLanguage: translationData.fromLanguage,
        toLanguage: translationData.toLanguage,
        sourceText: translationData.sourceText,
        translatedText: translationData.translatedText,
        audioBlobSize: translationData.audioBlob.size,
        audioBlobType: translationData.audioBlob.type
      });

      try {
        // First verify the blob is valid
        const testUrl = URL.createObjectURL(translationData.audioBlob);
        const testAudio = new Audio(testUrl);
        
        testAudio.onloadedmetadata = () => {
          console.log('✅ Source audio blob is valid:', {
            duration: testAudio.duration,
            readyState: testAudio.readyState,
            size: translationData.audioBlob.size
          });
          URL.revokeObjectURL(testUrl);

          // Convert Blob to ArrayBuffer for sending
          translationData.audioBlob.arrayBuffer().then(buffer => {
            console.log('🔄 Converting to ArrayBuffer:', {
              originalSize: translationData.audioBlob.size,
              bufferSize: buffer.byteLength
            });

            // Convert ArrayBuffer to Uint8Array and then to regular array
            const uint8Array = new Uint8Array(buffer);
            const regularArray = Array.from(uint8Array);

            // Split the array into chunks (16KB chunks)
            const chunks = chunkArray(regularArray, 16 * 1024);
            const totalChunks = chunks.length;

            console.log('🔄 Splitting audio into chunks:', {
              totalChunks,
              chunkSize: chunks[0].length,
              totalSize: regularArray.length
            });

            // Send audio info first
            const audioInfo = {
              type: 'audio-info',
              messageId: Date.now().toString(),
              totalChunks,
              fromLanguage: translationData.fromLanguage,
              toLanguage: translationData.toLanguage,
              sourceText: translationData.sourceText,
              translatedText: translationData.translatedText,
              totalSize: regularArray.length
            };

            peerRef.current.send(remotePeerId, 'audio-info', audioInfo);

            // Send chunks with slight delay to prevent overwhelming the connection
            chunks.forEach((chunk, index) => {
              setTimeout(() => {
                const chunkData = {
                  type: 'audio-chunk',
                  messageId: audioInfo.messageId,
                  chunkIndex: index,
                  totalChunks,
                  data: chunk
                };

                peerRef.current.send(remotePeerId, 'audio-chunk', chunkData);
                console.log(`✅ Sent chunk ${index + 1}/${totalChunks}`);

                // Show completion alert after sending last chunk
                if (index === totalChunks - 1) {
                  alert('Audio sent successfully!');
                }
              }, index * 100); // 100ms delay between chunks
            });

          }).catch(error => {
            console.error('❌ Error converting blob to buffer:', error);
            alert('Failed to send audio. Please try again.');
          });
        };

        testAudio.onerror = (e) => {
          console.error('❌ Source audio blob is invalid:', e);
          alert('Invalid audio data. Please try again.');
        };
      } catch (error) {
        console.error('❌ Error sending audio message:', error);
        alert('Failed to send audio. Please try again.');
      }
    } else {
      console.warn('⚠️ Cannot send audio:', {
        hasRemotePeerId: !!remotePeerId,
        hasPeerRef: !!peerRef.current,
        hasTranslationData: !!translationData
      });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white space-y-4 p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">Room: {roomId || "loading..."}</h1>
        
        {/* Language Selection Section */}
        <div className="mb-6 p-4 bg-gray-800 rounded-lg">
          <div className="mb-4">
            <LanguageSelector
              sourceLanguage={sourceLanguage}
              targetLanguage={targetLanguage}
              onSourceLanguageChange={setSourceLanguage}
              onTargetLanguageChange={setTargetLanguage}
            />
          </div>
          
          {/* Set Language Button */}
          <div className="flex justify-center mt-4">
            <button
              onClick={sendLanguagePreferences}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md text-white font-medium"
            >
              Set Languages
            </button>
          </div>

          {/* Show Remote User's Language Preferences */}
          {remoteUserLanguages.speaks && (
            <div className="mt-4 p-3 bg-gray-700 rounded-md">
              <h3 className="text-sm font-medium mb-2">Other person's languages:</h3>
              <p className="text-sm">Speaks: {languages.find(l => l.code === remoteUserLanguages.speaks)?.name || remoteUserLanguages.speaks}</p>
              <p className="text-sm">Wants to hear: {languages.find(l => l.code === remoteUserLanguages.wantsToHear)?.name || remoteUserLanguages.wantsToHear}</p>
            </div>
          )}
        </div>

        {/* Recordings Section */}
        <div className="mb-6 p-4 bg-gray-800 rounded-lg">
          <h3 className="text-lg font-medium mb-3">Your Recordings</h3>
          {localRecordings.length === 0 ? (
            <p className="text-gray-400 text-sm">No recordings yet. Click the microphone icon to start recording.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {localRecordings.map((recording, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                  <span className="text-sm text-gray-300">Recording {index + 1} - {recording.timestamp}</span>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        const audio = new Audio(recording.url);
                        audio.play();
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center text-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                      </svg>
                      Play
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          if (!remoteUserLanguages.wantsToHear) {
                            alert("Please wait for the other person's language preferences");
                            return;
                          }
                          // Convert the URL back to a blob
                          const response = await fetch(recording.url);
                          const blob = await response.blob();
                          
                          // Translate the audio
                          await translateAudio(blob);
                        } catch (error) {
                          console.error('Translation failed:', error);
                          alert('Translation failed. Please try again.');
                        }
                      }}
                      disabled={isTranslating || !remoteUserLanguages.wantsToHear}
                      className={`bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-full flex items-center text-sm ${
                        isTranslating || !remoteUserLanguages.wantsToHear ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                      title={!remoteUserLanguages.wantsToHear ? "Waiting for other person's language preferences" : "Translate"}
                    >
                      {isTranslating ? (
                        <span className="flex items-center">
                          <svg className="animate-spin h-4 w-4 mr-1" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Translating...
                        </span>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7 2a1 1 0 011 1v1h3a1 1 0 110 2H9.578a18.87 18.87 0 01-1.724 4.78c.29.354.596.696.914 1.026a1 1 0 11-1.44 1.389c-.188-.196-.373-.396-.554-.6a19.098 19.098 0 01-3.107 3.567 1 1 0 01-1.334-1.49 17.087 17.087 0 003.13-3.733 18.992 18.992 0 01-1.487-2.494 1 1 0 111.79-.89c.234.47.489.928.764 1.372.417-.934.752-1.913.997-2.927H3a1 1 0 110-2h3V3a1 1 0 011-1zm6 6a1 1 0 01.894.553l2.991 5.982a.869.869 0 01.02.037l.99 1.98a1 1 0 11-1.79.895L15.383 16h-4.764l-.724 1.447a1 1 0 11-1.788-.894l.99-1.98.019-.038 2.99-5.982A1 1 0 0113 8zm-1.382 6h2.764L13 11.236 11.618 14z" />
                          </svg>
                          Translate
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Translated Audio Section */}
        {translatedAudioUrl && (
          <div className="mb-6 p-4 bg-gray-800 rounded-lg">
            <h3 className="text-lg font-medium mb-3">Translated Audio</h3>
            <div className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
              <div className="flex-1">
                <p className="text-sm text-gray-300 mb-2">
                  From: {languages.find(l => l.code === sourceLanguage)?.name || sourceLanguage}
                  {' → '}
                  {languages.find(l => l.code === remoteUserLanguages.wantsToHear)?.name || remoteUserLanguages.wantsToHear}
                </p>
                {translationData?.sourceText && (
                  <p className="text-xs text-gray-400">Original: {translationData.sourceText}</p>
                )}
                {translationData?.translatedText && (
                  <p className="text-xs text-gray-400">Translated: {translationData.translatedText}</p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => {
                    const audio = new Audio(translatedAudioUrl);
                    audio.play();
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center text-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Play
                </button>
                <button
                  onClick={sendTranslatedAudio}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-full flex items-center text-sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                  </svg>
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Received Audios Section */}
        <div className="mb-6 p-4 bg-gray-800 rounded-lg">
          <h3 className="text-lg font-medium mb-3">Received Audios</h3>
          {receivedAudios.length === 0 ? (
            <p className="text-gray-400 text-sm">No received audios yet.</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {receivedAudios.map((audio, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-700 p-3 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm text-gray-300 mb-2">
                      Received at {audio.timestamp}
                      <br />
                      From: {languages.find(l => l.code === audio.fromLanguage)?.name || audio.fromLanguage}
                      {' → '}
                      {languages.find(l => l.code === audio.toLanguage)?.name || audio.toLanguage}
                    </p>
                    {audio.sourceText && (
                      <p className="text-xs text-gray-400">Original: {audio.sourceText}</p>
                    )}
                    {audio.translatedText && (
                      <p className="text-xs text-gray-400">Translated: {audio.translatedText}</p>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      console.log("🎵 Playing audio:", {
                        url: audio.url,
                        timestamp: audio.timestamp,
                        fromLanguage: audio.fromLanguage,
                        toLanguage: audio.toLanguage
                      });
                      const audioElement = new Audio(audio.url);
                      audioElement.onerror = (e) => {
                        console.error("❌ Audio playback error:", e);
                      };
                      audioElement.onloadedmetadata = () => {
                        console.log("✅ Audio metadata loaded:", {
                          duration: audioElement.duration,
                          readyState: audioElement.readyState
                        });
                      };
                      audioElement.play().catch(error => {
                        console.error("❌ Audio play error:", error);
                      });
                    }}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full flex items-center text-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    Play
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col md:flex-row gap-4 justify-center">
          {/* Local video container */}
          <div className="relative">
            <div className="flex justify-between items-center mb-1">
              <p className="text-center">You</p>
              <span className="text-xs bg-black bg-opacity-50 px-2 py-1 rounded">
                {localStreamReady ? "✅ Local stream ready" : "⏳ Loading..."}
              </span>
            </div>
            <div className="relative">
              <div className="transform -scale-x-100">
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full md:w-64 h-48 bg-black rounded-lg"
                />
              </div>
              {isRecording && (
                <div className="absolute top-2 right-2 flex items-center bg-red-600 px-2 py-1 rounded-full text-xs animate-pulse">
                  <span className="mr-1">●</span> Recording
                </div>
              )}
            </div>
            
            {/* Local transcript */}
            {transcript && (
              <div className="absolute bottom-16 left-0 right-0 mx-auto w-max max-w-[80%] px-4 py-2 bg-blue-900 bg-opacity-70 rounded-md">
                <p className="text-white text-sm">{transcript}</p>
              </div>
            )}
            
            {/* Local media controls */}
            <div className="flex justify-center space-x-4 mt-2">
              <button 
                onClick={toggleAudio}
                disabled={isRemoteRecording}
                className={`p-3 rounded-full ${
                  isRemoteRecording ? 'bg-gray-600 opacity-50 cursor-not-allowed' :
                  isLocalAudioEnabled ? 'bg-blue-600' : 'bg-red-600'
                }`}
                title={
                  isRemoteRecording ? "Other person is recording" :
                  isLocalAudioEnabled ? "Stop recording" : "Start recording"
                }
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              </button>
              <button 
                onClick={toggleVideo}
                className={`p-3 rounded-full ${isLocalVideoEnabled ? 'bg-blue-600' : 'bg-red-600'}`}
                title={isLocalVideoEnabled ? "Turn off video" : "Turn on video"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Remote video container */}
          <div className="relative">
            <div className="flex justify-between items-center mb-1">
              <p className="text-center">Other Person</p>
              <span className="text-xs bg-black bg-opacity-50 px-2 py-1 rounded">
                {connectionStatus === "connected" ? "✅ Connected" : 
                 connectionStatus === "error" ? "❌ Connection error" : 
                 "⏳ Waiting for peer..."}
              </span>
            </div>
            <div className="relative">
              <div className="transform -scale-x-100">
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full md:w-64 h-48 bg-black rounded-lg"
                />
              </div>
              {isRemoteRecording && (
                <div className="absolute top-2 right-2 flex items-center bg-red-600 px-2 py-1 rounded-full text-xs animate-pulse">
                  <span className="mr-1">●</span> Recording
                </div>
              )}
            </div>
            
            {/* Remote transcript */}
            {remoteTranscript && (
              <div className="absolute bottom-16 left-0 right-0 mx-auto w-max max-w-[80%] px-4 py-2 bg-green-900 bg-opacity-70 rounded-md">
                <p className="text-white text-sm">{remoteTranscript}</p>
              </div>
            )}

            {/* Received audio player */}
            {receivedAudioUrl && (
              <div className="mt-2 flex justify-center">
                <button
                  onClick={() => {
                    const audio = new Audio(receivedAudioUrl);
                    audio.play();
                  }}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-full flex items-center"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                  </svg>
                  Play Message
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* Translation status */}
        <div className="mt-4 text-center">
          {isPlaying && (
            <p className="text-green-400">Playing translated audio...</p>
          )}
          {(speechError || translationError) && (
            <p className="text-red-400">Error: {speechError || translationError}</p>
          )}
        </div>
        
        {/* Debug information */}
        <div className="mt-4 p-4 bg-gray-800 rounded-lg">
          <h2 className="text-lg font-semibold mb-2">Debug Info</h2>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
