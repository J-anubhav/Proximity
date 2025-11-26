import SimplePeer from 'simple-peer';
import { socketService } from './socket';
import { EVENTS } from '@proximity/common';

class WebRTCService {
    constructor() {
        this.peers = {}; // { peerId: SimplePeerInstance }
        this.stream = null;
        this.onStreamCallback = null;
    }

    async initLocalStream() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            return this.stream;
        } catch (err) {
            console.error('Error accessing media devices:', err);
            return null;
        }
    }

    createPeer(targetId, initiator = false) {
        const peer = new SimplePeer({
            initiator,
            stream: this.stream,
            trickle: false
        });

        peer.on('signal', (signal) => {
            socketService.getSocket().emit(EVENTS.WEBRTC_SIGNAL, {
                targetId,
                signal
            });
        });

        peer.on('stream', (stream) => {
            if (this.onStreamCallback) {
                this.onStreamCallback(targetId, stream);
            }
        });

        this.peers[targetId] = peer;
        return peer;
    }

    handleSignal(senderId, signal) {
        if (!this.peers[senderId]) {
            this.createPeer(senderId, false);
        }
        this.peers[senderId].signal(signal);
    }

    removePeer(peerId) {
        if (this.peers[peerId]) {
            this.peers[peerId].destroy();
            delete this.peers[peerId];
        }
    }

    setOnStream(callback) {
        this.onStreamCallback = callback;
    }
}

export const webRTCService = new WebRTCService();
