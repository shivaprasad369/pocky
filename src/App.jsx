import React, { useState, useEffect, useRef, useCallback } from 'react';
import Peer from 'peerjs';
import { v4 as uuidv4 } from 'uuid';
import styled from 'styled-components';

const VideoChat = () => {
  // State management
  const [peerId, setPeerId] = useState('');
  const [remotePeerId, setRemotePeerId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isCallActive, setIsCallActive] = useState(false);

  // Refs
  const peerInstance = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const dataConnectionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const callRef = useRef(null);

  // ICE Servers configuration
  const iceServers = [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:65.109.123.45:3478",
      username: "peeruser",
      credential: "peeruser123"
    },
  ];

  // Media constraints
  const constraints = {
    audio: {
      channelCount: 2,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      sampleRate: 48000
    },
    video: {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 24 }
    }
  };

  // Initialize PeerJS connection
  const initializePeer = useCallback(() => {
    const id = uuidv4().substring(0, 8);
    setPeerId(id);

    const peer = new Peer(id, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      config: { 
        iceServers,
        iceTransportPolicy: 'all'
      },
      debug: 3
    });

    peer.on('open', () => {
      console.log('Peer connection established with ID:', id);
      setConnectionStatus('Ready to connect');
    });

    peer.on('error', (err) => {
      console.error('Peer error:', err);
      setConnectionStatus(`Error: ${err.type}`);
      
      // Reinitialize on critical errors
      if (['peer-unavailable', 'network', 'socket-error'].includes(err.type)) {
        setTimeout(initializePeer, 2000);
      }
    });

    peer.on('call', async (call) => {
      console.log('Incoming call from:', call.peer);
      setConnectionStatus(`Incoming call from ${call.peer}...`);
      callRef.current = call;

      try {
        if (!localStream) {
          await startLocalStream();
        }
        
        call.answer(localStream);
        setConnectionStatus(`Call answered with ${call.peer}`);
        setIsCallActive(true);

        setupCallHandlers(call);
      } catch (err) {
        console.error('Error answering call:', err);
        setConnectionStatus(`Answer error: ${err.message}`);
        endCall();
      }
    });

    peer.on('connection', (conn) => {
      console.log('Data connection established');
      dataConnectionRef.current = conn;
      
      conn.on('data', (data) => {
        setMessages(prev => [...prev, { text: data, sender: 'remote' }]);
      });
      
      conn.on('close', () => {
        console.log('Data connection closed');
        dataConnectionRef.current = null;
      });
    });

    peerInstance.current = peer;
    return peer;
  }, [localStream]);

  // Set up call event handlers
  const setupCallHandlers = (call) => {
    call.on('stream', (remoteStream) => {
      console.log('Received remote stream');
      setRemoteStream(remoteStream);
      setIsCallActive(true);
      
      // Handle stream attachment with retry logic
      const attachStream = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.play().catch(e => {
            console.log('Video play error:', e);
            setTimeout(attachStream, 100);
          });
        } else {
          setTimeout(attachStream, 100);
        }
      };
      attachStream();
      
      setConnectionStatus('Connected - Video streaming');
    });

    call.on('close', () => {
      console.log('Call ended');
      endCall();
    });

    call.on('error', (err) => {
      console.error('Call error:', err);
      setConnectionStatus(`Call error: ${err.message}`);
      endCall();
    });
  };

  // Start local media stream
  const startLocalStream = async () => {
    try {
      setConnectionStatus('Starting local stream...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.log('Local video play error:', e));
      }
      
      setConnectionStatus('Local stream ready');
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setConnectionStatus(`Media error: ${error.message}`);
      throw error;
    }
  };

  // Call a remote peer
  const callRemotePeer = async () => {
    if (!remotePeerId.trim()) {
      alert('Please enter a valid remote peer ID');
      return;
    }

    try {
      setConnectionStatus(`Calling ${remotePeerId}...`);
      
      if (!localStream) {
        await startLocalStream();
      }

      if (!peerInstance.current) {
        throw new Error('Peer connection not ready');
      }

      const call = peerInstance.current.call(remotePeerId, localStream);
      callRef.current = call;
      
      if (!call) {
        throw new Error('Failed to initiate call');
      }

      setupCallHandlers(call);
      setIsCallActive(true);

      // Set up data channel
      const conn = peerInstance.current.connect(remotePeerId, {
        reliable: true,
        serialization: 'json'
      });

      conn.on('open', () => {
        console.log('Data channel opened');
        dataConnectionRef.current = conn;
      });

      conn.on('error', (err) => {
        console.error('Data channel error:', err);
      });

    } catch (err) {
      console.error('Call failed:', err);
      setConnectionStatus(`Call failed: ${err.message}`);
      endCall();
    }
  };

  // End current call
  const endCall = () => {
    if (callRef.current) {
      callRef.current.close();
      callRef.current = null;
    }
    
    if (dataConnectionRef.current) {
      dataConnectionRef.current.close();
      dataConnectionRef.current = null;
    }
    
    setRemoteStream(null);
    setIsCallActive(false);
    setConnectionStatus('Disconnected');
    
    // Reinitialize peer for new connections
    initializePeer();
  };

  // Clean up media streams and connections
  const cleanupMedia = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }
  };

  // Send chat message
  const sendMessage = () => {
    if (!messageInput.trim() || !dataConnectionRef.current) return;
    
    try {
      dataConnectionRef.current.send(messageInput);
      setMessages(prev => [...prev, { text: messageInput, sender: 'local' }]);
      setMessageInput('');
    } catch (err) {
      console.error('Error sending message:', err);
    }
  };

  // Copy peer ID to clipboard
  const copyToClipboard = () => {
    navigator.clipboard.writeText(peerId);
    alert('Copied to clipboard!');
  };

  // Initialize component
  useEffect(() => {
    initializePeer();

    return () => {
      if (peerInstance.current && !peerInstance.current.destroyed) {
        peerInstance.current.destroy();
      }
      cleanupMedia();
    };
  }, [initializePeer]);

  // Scroll to bottom of messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <Container>
      <Header>Video Chat Application</Header>
      <Status>Status: {connectionStatus}</Status>

      <VideoContainer>
        <VideoBox>
          <VideoLabel>Your Video</VideoLabel>
          <Video 
            ref={localVideoRef} 
            autoPlay 
            muted 
            playsInline
            onError={(e) => console.error('Local video error:', e)}
          />
        </VideoBox>
        <VideoBox>
          <VideoLabel>Remote Video</VideoLabel>
          <Video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline
            onError={(e) => console.error('Remote video error:', e)}
          />
          {!remoteStream && (
            <EmptyState>Waiting for remote connection...</EmptyState>
          )}
        </VideoBox>
      </VideoContainer>

      <ChatContainer>
        <Messages>
          {messages.map((msg, index) => (
            <Message key={index} isLocal={msg.sender === 'local'}>
              {msg.text}
            </Message>
          ))}
          <div ref={messagesEndRef} />
        </Messages>
        <MessageInput
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          placeholder="Type a message..."
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          disabled={!isCallActive}
        />
        <SendButton 
          onClick={sendMessage} 
          disabled={!isCallActive}
        >
          Send
        </SendButton>
      </ChatContainer>

      <Controls>
        <Button 
          onClick={startLocalStream} 
          disabled={!!localStream}
        >
          {localStream ? 'Camera Active' : 'Start Camera'}
        </Button>
        <PeerId>
          Your ID: <strong>{peerId}</strong>
          <CopyButton onClick={copyToClipboard}>Copy</CopyButton>
        </PeerId>
        <Input
          type="text"
          value={remotePeerId}
          onChange={(e) => setRemotePeerId(e.target.value)}
          placeholder="Enter remote peer ID"
          disabled={isCallActive}
        />
        <Button 
          onClick={callRemotePeer} 
          disabled={!remotePeerId.trim() || isCallActive}
        >
          Call
        </Button>
        <Button 
          onClick={endCall} 
          disabled={!isCallActive}
          danger
        >
          End Call
        </Button>
      </Controls>
    </Container>
  );
};

// Styled components
const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
`;

const Header = styled.h1`
  text-align: center;
  color: #2c3e50;
  margin-bottom: 20px;
`;

const Status = styled.div`
  text-align: center;
  margin: 10px 0;
  font-weight: bold;
  color: #7f8c8d;
  padding: 8px;
  background: #f5f5f5;
  border-radius: 4px;
`;

const VideoContainer = styled.div`
  display: flex;
  justify-content: space-between;
  margin: 20px 0;
  gap: 20px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const VideoBox = styled.div`
  flex: 1;
  border: 2px solid #3498db;
  border-radius: 8px;
  padding: 10px;
  background: #ecf0f1;
  position: relative;
  min-height: 300px;
`;

const VideoLabel = styled.h3`
  margin-top: 0;
  color: #2c3e50;
  text-align: center;
`;

const Video = styled.video`
  width: 100%;
  height: auto;
  border-radius: 4px;
  background: #000;
  transform: rotateY(180deg); /* Fixes mirror effect */
`;

const EmptyState = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #7f8c8d;
  font-size: 1.2rem;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0;
  justify-content: center;
  align-items: center;
`;

const Button = styled.button`
  padding: 10px 15px;
  background: ${props => props.danger ? '#e74c3c' : '#3498db'};
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  min-width: 120px;

  &:hover {
    background: ${props => props.danger ? '#c0392b' : '#2980b9'};
  }

  &:disabled {
    background: #bdc3c7;
    cursor: not-allowed;
  }
`;

const PeerId = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #ecf0f1;
  border-radius: 4px;
`;

const CopyButton = styled.button`
  padding: 5px 10px;
  background: #2ecc71;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: #27ae60;
  }
`;

const Input = styled.input`
  padding: 10px;
  border: 1px solid #bdc3c7;
  border-radius: 4px;
  min-width: 200px;

  &:disabled {
    background: #ecf0f1;
  }
`;

const ChatContainer = styled.div`
  border: 2px solid #3498db;
  border-radius: 8px;
  padding: 15px;
  margin: 20px 0;
  background: #ecf0f1;
`;

const Messages = styled.div`
  height: 200px;
  overflow-y: auto;
  margin-bottom: 10px;
  padding: 10px;
  background: white;
  border-radius: 4px;
`;

const Message = styled.div`
  padding: 8px 12px;
  margin: 5px 0;
  border-radius: 18px;
  max-width: 70%;
  word-wrap: break-word;
  background: ${props => props.isLocal ? '#3498db' : '#bdc3c7'};
  color: ${props => props.isLocal ? 'white' : 'black'};
  align-self: ${props => props.isLocal ? 'flex-end' : 'flex-start'};
  margin-left: ${props => props.isLocal ? 'auto' : '0'};
`;

const MessageInput = styled.input`
  flex: 1;
  padding: 10px;
  border: 1px solid #bdc3c7;
  border-radius: 4px;
  margin-right: 10px;
`;

const SendButton = styled.button`
  padding: 10px 15px;
  background: #2ecc71;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    background: #27ae60;
  }

  &:disabled {
    background: #bdc3c7;
    cursor: not-allowed;
  }
`;

export default VideoChat;