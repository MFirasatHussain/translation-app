// frontend/hooks/peer.js
import Peer from "peerjs";

export default function setupPeer(roomId, socketRef, userId, localStreamRef, setRemoteStream, onTranscriptReceived) {
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

  // Function to ensure data connection exists
  const ensureDataConnection = (peerId) => {
    if (!dataConnections.has(peerId)) {
      const conn = peer.connect(peerId, {
        reliable: true,
        serialization: 'json'
      });
      
      conn.on('open', () => {
        console.log("📡 Data connection opened with peer:", peerId);
      });
      
      conn.on('error', (err) => {
        console.error("❌ Data connection error:", err);
      });
      
      conn.on('close', () => {
        console.log("🚫 Data connection closed with peer:", peerId);
        dataConnections.delete(peerId);
      });
      
      dataConnections.set(peerId, conn);
    }
    return dataConnections.get(peerId);
  };

  // Handle incoming data connections
  peer.on('connection', (conn) => {
    const peerId = conn.peer;
    console.log("📥 Incoming data connection from:", peerId);
    
    conn.on('open', () => {
      dataConnections.set(peerId, conn);
    });

    conn.on('data', (data) => {
      if (data.type === 'transcript') {
        onTranscriptReceived(data.text);
      }
    });
    
    conn.on('close', () => {
      dataConnections.delete(peerId);
    });
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

  // Expose functions on peer instance
  peer.sendMediaControl = sendMediaControl;
  peer.sendTranscript = sendTranscript;

  return peer;
}
