// src/App.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import 'bootstrap/dist/css/bootstrap.min.css';

const SOCKET_SERVER = 'http://localhost:3000';

export default function RemoteDesktop() {
  const [socket, setSocket] = useState(null);
  const [connectionId, setConnectionId] = useState('');
  const [connectTo, setConnectTo] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState('');
  const peerConnection = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    const newSocket = io(SOCKET_SERVER);
    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on(' ', ({ connectionId }) => {
      console.log(connectionId)
      setConnectionId(connectionId);
    });

    socket.on('remoteConnectionRequest', async ({ fromSocket }) => {
      setupPeerConnection(fromSocket, true);
    });

    socket.on('offer', async ({ offer, from }) => {
      if (!peerConnection.current) {
        await setupPeerConnection(from, false);
      }
      await peerConnection.current.setRemoteDescription(offer);
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);
      socket.emit('answer', { answer, to: from });
    });

    socket.on('answer', async ({ answer }) => {
      await peerConnection.current.setRemoteDescription(answer);
    });

    socket.on('iceCandidate', async ({ candidate }) => {
      if (candidate) {
        await peerConnection.current.addIceCandidate(candidate);
      }
    });
  }, [socket]);

  const setupPeerConnection = async (remoteSocketId, isHost) => {
    try {
      peerConnection.current = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      peerConnection.current.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit('iceCandidate', { candidate, to: remoteSocketId });
        }
      };

      peerConnection.current.ontrack = (event) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      if (isHost) {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        
        stream.getTracks().forEach(track => {
          peerConnection.current.addTrack(track, stream);
        });

        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit('offer', { offer, to: remoteSocketId });
      }
    } catch (error) {
      setError('Error setting up connection: ' + error.message);
      console.error('Connection setup error:', error);
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
                  <div className="alert alert-info mb-3">
                    Connected to remote session
                  </div>
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