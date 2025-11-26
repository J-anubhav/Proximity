import React, { useEffect, useRef } from 'react';

const VideoFeed = ({ stream, isLocal = false }) => {
    const videoRef = useRef(null);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    return (
        <div className="video-feed">
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isLocal}
            />
        </div>
    );
};

export const VideoOverlay = ({ localStream, remoteStreams }) => {
    return (
        <div className="ui-overlay">
            <div className="video-container">
                {localStream && <VideoFeed stream={localStream} isLocal={true} />}
                {Object.entries(remoteStreams).map(([peerId, stream]) => (
                    <VideoFeed key={peerId} stream={stream} />
                ))}
            </div>
        </div>
    );
};
