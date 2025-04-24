// frontend/hooks/peer.js
import Peer from "peerjs";

export default function setupPeer(roomId, socketRef, userId, localStreamRef, setRemoteStream, onTranscriptReceived, onLanguagePreferencesReceived, onAudioMessageReceived) {
  console.log("🔧 Setting up peer with ID:", userId);
  
  // Get the current host IP address for better cross-device connectivity
  const host = window.location.hostname === "localhost" ? "192.168.1.12" : window.location.hostname;
  console.log("🌐 Using host:", host);
  
  const peer = new Peer(userId, {
    host: host,
    port: 9000,
    path: "/myapp",
    secure: false,
    debug: 3,
    config: {
      iceServers: [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
            "stun:stun3.l.google.com:19302",
            "stun:stun4.l.google.com:19302"
          ]
        },
        {
          urls: "turn:numb.viagenie.ca",
          credential: "muazkh",
          username: "webrtc@live.com"
        }
      ],
      iceCandidatePoolSize: 10
    }
  });

  // Store data connections
  const dataConnections = new Map();

  // Store for audio chunks
  const audioChunks = new Map();

  // Function to ensure data connection exists
  const ensureDataConnection = (peerId) => {
    if (!dataConnections.has(peerId)) {
      console.log("Creating new data connection to:", peerId);
      const conn = peer.connect(peerId, {
        reliable: true,
        serialization: 'json'
      });
      
      setupDataConnectionHandlers(conn);
      dataConnections.set(peerId, conn);
    }
    return dataConnections.get(peerId);
  };

  // Setup handlers for data connections
  const setupDataConnectionHandlers = (conn) => {
    const peerId = conn.peer;
    
    conn.on('open', () => {
      console.log("📡 Data connection opened with peer:", peerId);
      dataConnections.set(peerId, conn);
    });
    
    conn.on('data', (data) => {
      console.log("Received data from peer:", peerId, {
        type: data.type,
        messageId: data.messageId,
        chunkIndex: data.chunkIndex,
        totalChunks: data.totalChunks
      });

      if (data.type === 'transcript') {
        onTranscriptReceived(data.text);
      } else if (data.type === 'language-preferences') {
        console.log("📢 Received language preferences:", data.preferences);
        onLanguagePreferencesReceived(data.preferences);
      } else if (data.type === 'audio-info') {
        // Initialize storage for this audio message
        audioChunks.set(data.messageId, {
          chunks: new Array(data.totalChunks),
          info: data,
          receivedChunks: 0
        });
        console.log("📝 Initialized audio chunks storage for message:", data.messageId);
      } else if (data.type === 'audio-chunk') {
        const messageStore = audioChunks.get(data.messageId);
        if (!messageStore) {
          console.error("❌ Received chunk for unknown message:", data.messageId);
          return;
        }

        // Store the chunk
        messageStore.chunks[data.chunkIndex] = data.data;
        messageStore.receivedChunks++;

        console.log(`📦 Received chunk ${data.chunkIndex + 1}/${data.totalChunks} for message ${data.messageId}`);

        // Check if we have all chunks
        if (messageStore.receivedChunks === data.totalChunks) {
          console.log("✅ All chunks received, reconstructing audio");
          
          try {
            // Concatenate all chunks
            const completeArray = [].concat(...messageStore.chunks);
            const arrayBuffer = new Uint8Array(completeArray).buffer;

            // Create a new Blob from the ArrayBuffer
            const audioBlob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
            console.log("✅ Created audio blob:", {
              size: audioBlob.size,
              type: audioBlob.type
            });

            // Verify the blob is valid
            const testUrl = URL.createObjectURL(audioBlob);
            const testAudio = new Audio(testUrl);
            
            testAudio.onloadedmetadata = () => {
              console.log("✅ Audio blob verified:", {
                duration: testAudio.duration,
                readyState: testAudio.readyState
              });
              URL.revokeObjectURL(testUrl);

              // Create the complete message
              const message = {
                audioBlob,
                fromLanguage: messageStore.info.fromLanguage,
                toLanguage: messageStore.info.toLanguage,
                sourceText: messageStore.info.sourceText,
                translatedText: messageStore.info.translatedText
              };

              // Clean up the chunks
              audioChunks.delete(data.messageId);

              // Deliver the complete message
              onAudioMessageReceived(message);
            };

            testAudio.onerror = (e) => {
              console.error("❌ Audio blob verification failed:", e);
              URL.revokeObjectURL(testUrl);
              audioChunks.delete(data.messageId);
            };

          } catch (error) {
            console.error("❌ Error reconstructing audio:", error);
            audioChunks.delete(data.messageId);
          }
        }
      }
    });
    
    conn.on('error', (err) => {
      console.error("❌ Data connection error:", err);
    });
    
    conn.on('close', () => {
      console.log("🚫 Data connection closed with peer:", peerId);
      dataConnections.delete(peerId);
    });
  };

  // Handle incoming data connections
  peer.on('connection', (conn) => {
    const peerId = conn.peer;
    console.log("📥 Incoming data connection from:", peerId);
    setupDataConnectionHandlers(conn);
  });

  // Connection state logging
  peer.on("open", (id) => {
    console.log("🔑 PeerJS open with ID:", id);
    // Emit ready signal to notify other peers
    socketRef.current.emit("ready", { userId: id, roomId });
  });

  peer.on("disconnected", () => {
    console.log("❌ PeerJS disconnected, attempting to reconnect...");
    peer.reconnect();
  });

  peer.on("close", () => {
    console.log("🚫 PeerJS connection closed");
  });

  peer.on("error", (err) => {
    console.error("💥 PeerJS error:", err);
  });

  // Enhanced call handling
  peer.on("call", (call) => {
    console.log("📞 Incoming call from:", call.peer);

    if (!localStreamRef.current) {
      console.warn("⚠️ Cannot answer call, local stream not ready yet.");
      return;
    }

    // Log ICE candidates
    call.on("ice-candidate", (candidate) => {
      console.log("🧊 ICE candidate:", candidate);
    });

    call.on("connection-state-change", (state) => {
      console.log("🔄 Call connection state:", state);
    });

    // Answer the call with local stream
    console.log("📤 Answering call with local stream");
    call.answer(localStreamRef.current);

    call.on("stream", (remoteStream) => {
      console.log("📺 Got remote stream from:", call.peer);
      setRemoteStream(remoteStream);
    });
  });

  // Enhanced socket event handling
  socketRef.current.on("user-connected", (remoteUserId) => {
    console.log("📡 New user joined:", remoteUserId);

    if (!localStreamRef.current) {
      console.warn("⚠️ Skipping call, local stream not ready.");
      return;
    }

    // Only call if we don't already have a connection to this peer
    if (!peer.connections[remoteUserId] || peer.connections[remoteUserId].length === 0) {
      console.log("🔄 Initiating call to new user:", remoteUserId);
      const call = peer.call(remoteUserId, localStreamRef.current);

      if (!call) {
        console.warn("🚫 Call to remoteUserId failed:", remoteUserId);
        return;
      }

      // Log ICE candidates
      call.on("ice-candidate", (candidate) => {
        console.log("🧊 ICE candidate:", candidate);
      });

      call.on("connection-state-change", (state) => {
        console.log("🔄 Call connection state:", state);
      });

      call.on("stream", (remoteStream) => {
        console.log("📺 Received stream from new user:", remoteUserId);
        setRemoteStream(remoteStream);
      });
    } else {
      console.log("ℹ️ Already connected to peer:", remoteUserId);
    }
  });

  // Handle ready signal from other peer
  socketRef.current.on("ready", ({ userId: remoteUserId }) => {
    console.log("✅ Remote peer ready:", remoteUserId);
    
    if (!localStreamRef.current) {
      console.warn("⚠️ Local stream not ready for ready signal.");
      return;
    }

    // Only initiate call if we haven't already
    if (!peer.connections[remoteUserId] || peer.connections[remoteUserId].length === 0) {
      console.log("🔄 Initiating call to ready peer:", remoteUserId);
      const call = peer.call(remoteUserId, localStreamRef.current);
      
      call.on("ice-candidate", (candidate) => {
        console.log("🧊 ICE candidate:", candidate);
      });

      call.on("connection-state-change", (state) => {
        console.log("🔄 Call connection state:", state);
      });

      call.on("stream", (remoteStream) => {
        console.log("📺 Received stream from ready peer:", remoteUserId);
        setRemoteStream(remoteStream);
      });
    } else {
      console.log("ℹ️ Already connected to ready peer:", remoteUserId);
    }
  });

  // Function to send media control to peer
  const sendMediaControl = (peerId, action, enabled) => {
    const conn = ensureDataConnection(peerId);
    if (conn && conn.open) {
      const message = {
        type: "media-control",
        action,
        enabled
      };
      conn.send(message);
      console.log(`📤 Sent media control to peer ${peerId}:`, message);
    } else {
      console.warn("⚠️ Data connection not open to peer:", peerId);
    }
  };

  // Function to send transcript to remote peer
  const sendTranscript = (peerId, text) => {
    const conn = ensureDataConnection(peerId);
    if (conn && conn.open) {
      const message = {
        type: 'transcript',
        text
      };
      conn.send(message);
      console.log(`📤 Sent transcript to peer ${peerId}:`, text);
    } else {
      console.warn("⚠️ Data connection not open to peer:", peerId);
    }
  };

  // Add function to send data
  const send = (peerId, type, data) => {
    console.log(`Sending ${type} to peer:`, peerId, data);
    const conn = ensureDataConnection(peerId);
    if (conn && conn.open) {
      conn.send({ type, ...data });
    } else {
      console.warn("⚠️ Cannot send data, connection not open:", peerId);
    }
  };

  // Add methods to peer instance
  peer.sendMediaControl = sendMediaControl;
  peer.sendTranscript = sendTranscript;
  peer.send = send;

  return peer;
}
