import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import GameScene from './game/GameScene';
import { socketService } from './services/socket';
import { webRTCService } from './services/webrtc';
import { VideoOverlay } from './components/VideoOverlay';
import { EVENTS } from '@proximity/common';

function App() {
    const gameRef = useRef(null);
    const [localStream, setLocalStream] = useState(null);
    const [remoteStreams, setRemoteStreams] = useState({}); // { peerId: stream }

    useEffect(() => {
        const init = async () => {
            // Connect socket
            const socket = socketService.connect();

            // Init WebRTC
            const stream = await webRTCService.initLocalStream();
            setLocalStream(stream);

            webRTCService.setOnStream((peerId, stream) => {
                setRemoteStreams(prev => ({
                    ...prev,
                    [peerId]: stream
                }));
            });

            // Handle incoming signals
            socket.on(EVENTS.WEBRTC_SIGNAL, ({ senderId, signal }) => {
                webRTCService.handleSignal(senderId, signal);
            });

            // Init Phaser
            const config = {
                type: Phaser.AUTO,
                width: window.innerWidth,
                height: window.innerHeight,
                parent: 'game-container',
                physics: {
                    default: 'arcade',
                    arcade: {
                        gravity: { y: 0 },
                        debug: false
                    }
                },
                scene: [GameScene]
            };

            gameRef.current = new Phaser.Game(config);

            // Handle proximity
            gameRef.current.events.on('proximityUpdate', (closePlayers) => {
                // Connect to new close players
                closePlayers.forEach(peerId => {
                    if (!webRTCService.peers[peerId]) {
                        // We are initiator if our ID is 'smaller' (simple tie-breaker) 
                        // or just let one side initiate. 
                        // Better: The one who detects proximity first? No, race condition.
                        // Tie-breaker: socket.id comparison.
                        if (socket.id < peerId) {
                            console.log('Initiating connection to', peerId);
                            webRTCService.createPeer(peerId, true);
                        }
                    }
                });

                // Disconnect from far players
                Object.keys(webRTCService.peers).forEach(peerId => {
                    if (!closePlayers.includes(peerId)) {
                        console.log('Disconnecting from', peerId);
                        webRTCService.removePeer(peerId);
                        setRemoteStreams(prev => {
                            const newStreams = { ...prev };
                            delete newStreams[peerId];
                            return newStreams;
                        });
                    }
                });
            });

            // Handle resize
            const handleResize = () => {
                if (gameRef.current) {
                    gameRef.current.scale.resize(window.innerWidth, window.innerHeight);
                }
            };
            window.addEventListener('resize', handleResize);
        };

        init();

        // Cleanup
        return () => {
            socketService.disconnect();
            if (gameRef.current) {
                gameRef.current.destroy(true);
            }
        };
    }, []);

    return (
        <>
            <div id="game-container" />
            <VideoOverlay localStream={localStream} remoteStreams={remoteStreams} />
        </>
    );
}

export default App;
