// frontend/hooks/peer.js
import Peer from "peerjs";

export default function setupPeer(roomId, socketRef, userId, localStreamRef, setRemoteStream) {
  console.log("🔧 Setting up peer with ID:", userId);
  
  // Get the current host IP address for better cross-device connectivity
  const host = window.location.hostname === "localhost" ? "192.168.1.12" : window.location.hostname;
  console.log("🌐 Using host:", host);
  
  const peer = new Peer(userId, {
    host: host, // Use dynamic host based on environment
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
    
    // Handle data channel for media control
    call.on("data", (data) => {
      console.log("📨 Received data from peer:", data);
      handlePeerData(data, call);
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
      
      // Handle data channel for media control
      call.on("data", (data) => {
        console.log("📨 Received data from peer:", data);
        handlePeerData(data, call);
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
      
      // Handle data channel for media control
      call.on("data", (data) => {
        console.log("📨 Received data from peer:", data);
        handlePeerData(data, call);
      });
    } else {
      console.log("ℹ️ Already connected to ready peer:", remoteUserId);
    }
  });
  
  // Function to handle data received from peer
  const handlePeerData = (data, call) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === "media-control") {
        console.log("🎮 Received media control:", message);
        
        if (message.action === "toggle-audio") {
          const audioTrack = localStreamRef.current.getAudioTracks()[0];
          if (audioTrack) {
            audioTrack.enabled = message.enabled;
            console.log(`🎤 Local audio ${audioTrack.enabled ? 'unmuted' : 'muted'} by remote peer`);
          }
        } else if (message.action === "toggle-video") {
          const videoTrack = localStreamRef.current.getVideoTracks()[0];
          if (videoTrack) {
            videoTrack.enabled = message.enabled;
            console.log(`📹 Local video ${videoTrack.enabled ? 'enabled' : 'disabled'} by remote peer`);
          }
        }
      }
    } catch (err) {
      console.error("❌ Error handling peer data:", err);
    }
  };
  
  // Function to send media control to peer
  const sendMediaControl = (peerId, action, enabled) => {
    if (!peer.connections[peerId] || peer.connections[peerId].length === 0) {
      console.warn("⚠️ Cannot send media control, no connection to peer:", peerId);
      return;
    }
    
    const dataConnection = peer.connections[peerId][0];
    if (dataConnection && dataConnection.open) {
      const message = JSON.stringify({
        type: "media-control",
        action,
        enabled
      });
      
      dataConnection.send(message);
      console.log(`📤 Sent media control to peer ${peerId}:`, message);
    } else {
      console.warn("⚠️ Data connection not open to peer:", peerId);
    }
  };
  
  // Expose the sendMediaControl function
  peer.sendMediaControl = sendMediaControl;

  return peer;
}
