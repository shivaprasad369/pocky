import React, { useState, useEffect, useRef } from 'react';
import Peer from 'peerjs';
import { v4 as uuidv4 } from 'uuid';
import styled from 'styled-components';

const VideoChat = () => {
  const [peerId, setPeerId] = useState('');
  const [remotePeerId, setRemotePeerId] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('Disconnected');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const peerInstance = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const dataConnectionRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Open source STUN/TURN servers
  const iceServers = [
    // iceTransportPolicy: "relay",
    {
      urls: "turn:65.109.123.45:3478",
      username: "peeruser",
      credential: "peeruser123"
    },
   
  ];

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

  useEffect(() => {
    const initializePeer = () => {
      const id = uuidv4().substring(0, 8); // Shorter ID for easier sharing
      setPeerId(id);
      console.log(id)

      // Using PeerJS with our own signaling server would be better for production
      const peer = new Peer(id, {
        host: '0.peerjs.com',   // ✅ Using hosted PeerJS signaling server
        port: 443,              // ✅ Secure port
        secure: true,           // ✅ HTTPS
        config: {
          iceTransportPolicy: "relay",   // ✅ Forces TURN usage only
          iceServers: [
            {
              urls: "turn:65.109.123.45:3478",  // ✅ Your Coturn public IP
              username: "peeruser",
              credential: "peeruser123"
            }
          ]
        },
        debug: 3                // ✅ Useful logs
      });
      

      peer.on('open', () => {
        console.log('Peer connection open');
        setConnectionStatus('Ready');
      });

      peer.on('error', (err) => {
        console.error('Peer error:', err);
        setConnectionStatus(`Error: ${err.type}`);
      });

      peer.on('call', async (call) => {
        setConnectionStatus('Incoming call...');
        try {
          if (!localStream) {
            await startLocalStream();
          }
          call.answer(localStream);
          setConnectionStatus('Call answered');

          call.on('stream', (remoteStream) => {
            setRemoteStream(remoteStream);
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = remoteStream;
            }
            setConnectionStatus('Connected');
          });

          call.on('close', () => {
            setConnectionStatus('Call ended');
            setRemoteStream(null);
          });

          call.on('error', (err) => {
            console.error('Call error:', err);
            setConnectionStatus(`Call error: ${err.message}`);
          });
        } catch (err) {
          console.error('Error answering call:', err);
          setConnectionStatus(`Error answering call: ${err.message}`);
        }
      });

      peer.on('connection', (conn) => {
        dataConnectionRef.current = conn;
        conn.on('open', () => {
          console.log('Data connection opened');
        });
        conn.on('data', (data) => {
          setMessages(prev => [...prev, { text: data, sender: 'remote' }]);
        });
        conn.on('close', () => {
          console.log('Data connection closed');
        });
      });

      peerInstance.current = peer;
    };

    initializePeer();

    return () => {
      if (peerInstance.current && !peerInstance.current.destroyed) {
        peerInstance.current.destroy();
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [localStream]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startLocalStream = async () => {
    try {
      setConnectionStatus('Starting local stream...');
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log(peerId)
      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setConnectionStatus('Local stream ready');
      return stream;
    } catch (error) {
      console.error('Error accessing media devices:', error);
      setConnectionStatus(`Media error: ${error.message}`);
      throw error;
    }
  };

  const callRemotePeer = async () => {
    if (!remotePeerId.trim()) {
      alert('Enter a valid remote peer ID');
      return;
    }

    try {
      setConnectionStatus('Calling...');
      if (!localStream) {
        await startLocalStream();
      }

      const call = peerInstance.current.call(remotePeerId, localStream);
      call.on('stream', (remoteStream) => {
        setRemoteStream(remoteStream);
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setConnectionStatus('Connected');
      });

      call.on('close', () => {
        setConnectionStatus('Call ended');
        setRemoteStream(null);
      });

      call.on('error', (err) => {
        console.error('Call error:', err);
        setConnectionStatus(`Call error: ${err.message}`);
      });

      // Set up data channel
      const conn = peerInstance.current.connect(remotePeerId, {
        reliable: true,
        serialization: 'json'
      });

      dataConnectionRef.current = conn;
      conn.on('open', () => {
        console.log('Data channel opened');
      });
    } catch (err) {
      console.error('Error calling peer:', err);
      setConnectionStatus(`Call failed: ${err.message}`);
    }
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !dataConnectionRef.current) return;
    
    dataConnectionRef.current.send(messageInput);
    setMessages(prev => [...prev, { text: messageInput, sender: 'local' }]);
    setMessageInput('');
  };

  const endCall = () => {
    if (peerInstance.current) {
      peerInstance.current.destroy();
      setConnectionStatus('Disconnected');
      setRemoteStream(null);
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
      // Reinitialize peer
      const id = uuidv4().substring(0, 8);
      setPeerId(id);
      peerInstance.current = new Peer(id, {
        host: '0.peerjs.com',
        port: 443,
        secure: true,
        config: { iceServers }
      });
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(peerId);
    alert('Copied to clipboard!');
  };

  return (
    <Container>
      <Header>Open Source Video Chat</Header>
      <Status>Status: {connectionStatus}</Status>

      <VideoContainer>
        <VideoBox>
          <VideoLabel>Your Video</VideoLabel>
          <Video ref={localVideoRef} autoPlay muted playsInline />
        </VideoBox>
        <VideoBox>
          <VideoLabel>Remote Video</VideoLabel>
          <Video ref={remoteVideoRef} autoPlay playsInline />
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
        />
        <SendButton onClick={sendMessage}>Send</SendButton>
      </ChatContainer>

      <Controls>
        <Button onClick={startLocalStream}>Start Video</Button>
        <PeerId>
          Your ID: <strong>{peerId}</strong>
          <CopyButton onClick={copyToClipboard}>Copy</CopyButton>
        </PeerId>
        <Input
          type="text"
          value={remotePeerId}
          onChange={(e) => setRemotePeerId(e.target.value)}
          placeholder="Enter remote peer ID"
        />
        <Button onClick={callRemotePeer}>Call</Button>
        <Button onClick={endCall}>End Call</Button>
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
`;

const Status = styled.div`
  text-align: center;
  margin: 10px 0;
  font-weight: bold;
  color: #7f8c8d;
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
`;

const VideoLabel = styled.h3`
  margin-top: 0;
  color: #2c3e50;
`;

const Video = styled.video`
  width: 100%;
  border-radius: 4px;
  background: #000;
`;

const Controls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0;
  justify-content: center;
`;

const Button = styled.button`
  padding: 10px 15px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;

  &:hover {
    background: #2980b9;
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
  width: 70%;
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
`;

export default VideoChat;