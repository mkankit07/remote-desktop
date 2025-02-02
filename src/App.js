// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import 'bootstrap/dist/css/bootstrap.min.css';

const SOCKET_SERVER = 'https://powder-intermediate-films-testing.trycloudflare.com';

const RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

export default function RemoteDesktop() {
  const [socket, setSocket] = useState(null);
  const [connectionId, setConnectionId] = useState('');
  const [connectTo, setConnectTo] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const peerConnection = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);

  useEffect(() => {
    const newSocket = io(SOCKET_SERVER);
    setSocket(newSocket);

    return () => {
      stopAllStreams();
      if (peerConnection.current) {
        peerConnection.current.close();
      }
      newSocket.disconnect();
    };
  }, []);

  const stopAllStreams = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
  };

  useEffect(() => {
    if (!socket) return;

    socket.on('connectionEstablished', async ({ connectionId }) => {
      console.log('Connection established as host');
      setConnectionId(connectionId);
      setIsHost(true);
      await startScreenShare();
    });

    socket.on('joinedRoom', async ({ hostId }) => {
      console.log('Joined room, creating peer connection');
      await setupPeerConnection(hostId, false);
      setStatus('Connected to host, establishing connection...');
    });

    socket.on('viewerJoined', async ({ viewerId }) => {
      console.log('Viewer joined, sending stream');
      if (isHost && localStream) {
        await setupPeerConnection(viewerId, true);
      }
    });

    socket.on('offer', async ({ offer, from }) => {
      console.log('Received offer from:', from);
      try {
        if (!peerConnection.current) {
          await setupPeerConnection(from, false);
        }
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        socket.emit('answer', { answer, to: from });
      } catch (err) {
        console.error('Error handling offer:', err);
        setError('Failed to handle offer: ' + err.message);
      }
    });

    socket.on('answer', async ({ answer }) => {
      console.log('Received answer');
      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Error handling answer:', err);
        setError('Failed to handle answer: ' + err.message);
      }
    });

    socket.on('iceCandidate', async ({ candidate }) => {
      try {
        if (candidate && peerConnection.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
        setError('Failed to add ICE candidate: ' + err.message);
      }
    });

    socket.on('error', ({ message }) => {
      setError(message);
    });
  }, [socket, isHost, localStream]);

  const setupPeerConnection = async (peerId, isInitiator) => {
    try {
      console.log('Setting up peer connection, isInitiator:', isInitiator);
      if (peerConnection.current) {
        peerConnection.current.close();
      }

      const pc = new RTCPeerConnection(RTCConfiguration);
      peerConnection.current = pc;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          console.log('Sending ICE candidate');
          socket.emit('iceCandidate', { candidate, to: peerId });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log('ICE Connection State:', pc.iceConnectionState);
        setStatus(`Connection state: ${pc.iceConnectionState}`);
      };

      pc.ontrack = (event) => {
        console.log('Received remote track');
        if (remoteVideoRef.current && event.streams[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
          setStatus('Receiving remote stream');
        }
      };

      if (isInitiator && localStream) {
        console.log('Adding local stream tracks');
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
        
        console.log('Creating offer');
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: true
        });
        await pc.setLocalDescription(offer);
        socket.emit('offer', { offer, to: peerId });
      }

      return pc;
    } catch (err) {
      console.error('Error in setupPeerConnection:', err);
      setError('Failed to setup connection: ' + err.message);
      throw err;
    }
  };

  const startScreenShare = async () => {
    try {
      console.log('Starting screen share');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: "always",
          displaySurface: "monitor"
        },
        audio: false
      });

      setLocalStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      setStatus('Screen sharing started');

      stream.getVideoTracks()[0].onended = () => {
        console.log('Screen sharing stopped by user');
        setStatus('Screen sharing stopped');
        stopAllStreams();
      };

    } catch (err) {
      console.error('Error in startScreenShare:', err);
      setError('Failed to start screen sharing: ' + err.message);
    }
  };

  const startHosting = () => {
    setError('');
    socket.emit('requestConnection');
  };

  const connectToRemote = () => {
    if (!connectTo.trim()) {
      setError('Please enter a connection ID');
      return;
    }
    setError('');
    socket.emit('joinConnection', { connectionId: connectTo });
    setIsConnected(true);
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-8">
          <div className="card">
            <div className="card-header bg-primary text-white">
              <h2 className="mb-0">Remote Desktop Connection</h2>
            </div>
            <div className="card-body">
              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}
              
              {status && (
                <div className="alert alert-info" role="alert">
                  {status}
                </div>
              )}
              
              {!isConnected ? (
                <div>
                  <div className="mb-4">
                    <button 
                      className="btn btn-primary btn-lg w-100" 
                      onClick={startHosting}
                    >
                      Start Hosting
                    </button>
                    {connectionId && (
                      <div className="alert alert-success mt-3">
                        <strong>Your Connection ID:</strong> 
                        <span className="ms-2">{connectionId}</span>
                        <button 
                          className="btn btn-sm btn-outline-secondary ms-2"
                          onClick={() => navigator.clipboard.writeText(connectionId)}
                        >
                          Copy
                        </button>
                      </div>
                    )}
                  </div>

                  {localStream && (
                    <div className="mb-4">
                      <h5>Your Screen Share Preview:</h5>
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-100 rounded"
                      />
                    </div>
                  )}

                  <div className="mt-4">
                    <div className="form-group">
                      <label className="form-label">Connect to Remote Session:</label>
                      <div className="input-group mb-3">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Enter connection ID"
                          value={connectTo}
                          onChange={(e) => setConnectTo(e.target.value)}
                        />
                        <button 
                          className="btn btn-success" 
                          onClick={connectToRemote}
                        >
                          Connect
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="ratio ratio-16x9">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="rounded"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}