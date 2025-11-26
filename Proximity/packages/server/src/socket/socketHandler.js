import { EVENTS } from '@proximity/common';

export const setupSocketHandler = (io) => {
    const players = {};

    io.on(EVENTS.CONNECT, (socket) => {
        console.log('Player connected:', socket.id);

        // Initialize player
        players[socket.id] = {
            id: socket.id,
            x: 400,
            y: 300,
            anim: 'idle'
        };

        // Send current players to new player
        socket.emit(EVENTS.PLAYERS_SYNC, players);

        // Broadcast new player to others
        socket.broadcast.emit(EVENTS.PLAYER_JOIN, players[socket.id]);

        socket.on(EVENTS.PLAYER_MOVE, (movementData) => {
            if (players[socket.id]) {
                players[socket.id].x = movementData.x;
                players[socket.id].y = movementData.y;
                players[socket.id].anim = movementData.anim;

                // Broadcast movement to others
                socket.broadcast.emit(EVENTS.PLAYER_MOVE, {
                    id: socket.id,
                    ...movementData
                });
            }
        });

        socket.on(EVENTS.WEBRTC_SIGNAL, (data) => {
            if (!data.targetId || !data.signal) {
                console.warn('Invalid signal data received from', socket.id);
                return;
            }
            // Relay signal to specific target
            io.to(data.targetId).emit(EVENTS.WEBRTC_SIGNAL, {
                senderId: socket.id,
                signal: data.signal
            });
        });

        socket.on(EVENTS.DISCONNECT, () => {
            console.log('Player disconnected:', socket.id);
            delete players[socket.id];
            io.emit(EVENTS.PLAYER_LEAVE, socket.id);
        });
    });
};
