// frontend/pages/room/[roomId].js
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import useSocket from "@/hooks/useSocket";
import setupPeer from "@/hooks/peer";
import useSpeechRecognition from "@/hooks/useSpeechRecognition";
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
  
  // Media control states
  const [isLocalAudioMuted, setIsLocalAudioMuted] = useState(false);
  const [isLocalVideoOff, setIsLocalVideoOff] = useState(false);
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

  // Setup peer connection with transcript handling
  useEffect(() => {
    if (roomId && socketRef.current && userId && localStreamReady) {
      console.log("🧠 setupPeer conditions met, setting up...");
      const peer = setupPeer(
        roomId, 
        socketRef, 
        userId, 
        localStreamRef, 
        setRemoteStream,
        // Add transcript handler
        (text) => {
          setRemoteTranscript(text);
        }
      );
      peerRef.current = peer;

      // Update debug info when peer ID is available
      peer.on("open", (id) => {
        setDebugInfo(prev => ({ ...prev, peerId: id }));
      });

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

  // Toggle local audio mute
  const toggleLocalAudio = () => {
    if (!localStreamRef.current) return;
    
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsLocalAudioMuted(!audioTrack.enabled);
      console.log(`🎤 Local audio ${audioTrack.enabled ? 'unmuted' : 'muted'}`);
      
      // Send control to remote peer if connected
      if (remotePeerId && peerRef.current && peerRef.current.sendMediaControl) {
        peerRef.current.sendMediaControl(remotePeerId, "toggle-audio", audioTrack.enabled);
      }
    }
  };

  // Toggle local video
  const toggleLocalVideo = () => {
    if (!localStreamRef.current) return;
    
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsLocalVideoOff(!videoTrack.enabled);
      console.log(`📹 Local video ${videoTrack.enabled ? 'on' : 'off'}`);
      
      // Send control to remote peer if connected
      if (remotePeerId && peerRef.current && peerRef.current.sendMediaControl) {
        peerRef.current.sendMediaControl(remotePeerId, "toggle-video", videoTrack.enabled);
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

  // Send transcript to remote peer
  useEffect(() => {
    if (transcript && remotePeerId && peerRef.current) {
      peerRef.current.sendTranscript(remotePeerId, transcript);
    }
  }, [transcript, remotePeerId]);

  // Toggle speech recognition
  const toggleSpeechRecognition = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white space-y-4 p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-2xl font-bold mb-4">Room: {roomId || "loading..."}</h1>
        
        <div className="flex flex-col md:flex-row gap-4 justify-center">
          {/* Local video container */}
          <div className="relative">
            <div className="flex justify-between items-center mb-1">
              <p className="text-center">You</p>
              <span className="text-xs bg-black bg-opacity-50 px-2 py-1 rounded">
                {localStreamReady ? "✅ Local stream ready" : "⏳ Loading..."}
              </span>
            </div>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full md:w-64 h-48 bg-black rounded-lg transform -scale-x-100"
            />
            
            {/* Local media controls */}
            <div className="flex justify-center mt-2 space-x-2">
              <button 
                onClick={toggleLocalAudio}
                className={`p-2 rounded-full ${isLocalAudioMuted ? 'bg-red-600' : 'bg-blue-600'}`}
                title={isLocalAudioMuted ? "Unmute" : "Mute"}
              >
                {isLocalAudioMuted ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <button 
                onClick={toggleLocalVideo}
                className={`p-2 rounded-full ${isLocalVideoOff ? 'bg-red-600' : 'bg-blue-600'}`}
                title={isLocalVideoOff ? "Turn on video" : "Turn off video"}
              >
                {isLocalVideoOff ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                  </svg>
                )}
              </button>
              <button 
                onClick={toggleSpeechRecognition}
                className={`p-2 rounded-full ${isListening ? 'bg-green-600' : 'bg-gray-600'}`}
                title={isListening ? "Stop transcription" : "Start transcription"}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Only show error if there is one */}
            {speechError && (
              <div className="mt-2 text-center text-sm text-red-400">
                Error: {speechError}
              </div>
            )}
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
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full md:w-64 h-48 bg-black rounded-lg"
            />
            
            {/* Remote transcript */}
            {remoteTranscript && (
              <div className="absolute bottom-4 left-0 right-0 mx-auto w-max max-w-[80%] px-4 py-2 bg-black bg-opacity-70 rounded-md">
                <p className="text-white text-sm">{remoteTranscript}</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Debug information */}
        <div className="mt-8 p-4 bg-gray-800 rounded-lg text-xs font-mono overflow-auto">
          <h3 className="text-sm font-bold mb-2">Debug Information</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>User ID: {userId}</div>
            <div>Peer ID: {debugInfo.peerId || "Not connected"}</div>
            <div>Socket: {debugInfo.socketConnected ? "✅ Connected" : "❌ Disconnected"}</div>
            <div>ICE State: {debugInfo.iceState}</div>
            <div className="col-span-2">Last Error: {debugInfo.lastError || "None"}</div>
            <div className="col-span-2">
              <button 
                onClick={() => {
                  if (peerRef.current) {
                    console.log("🔄 Reconnecting peer...");
                    peerRef.current.reconnect();
                  }
                }}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm mt-2"
              >
                Reconnect Peer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
