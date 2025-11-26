import Phaser from 'phaser';
import { socketService } from '../services/socket';
import { EVENTS } from '@proximity/common';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.players = {};
        this.myPlayerId = null;
        this.cursors = null;
        this.speed = 200;
        this.loadingText = null;
    }

    preload() {
        this.cameras.main.setBackgroundColor('#24252A');

        // Generate a simple texture for the player
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0x3498db);
        graphics.fillRect(0, 0, 32, 32);
        graphics.generateTexture('player', 32, 32);

        const otherGraphics = this.make.graphics({ x: 0, y: 0, add: false });
        otherGraphics.fillStyle(0xe74c3c);
        otherGraphics.fillRect(0, 0, 32, 32);
        otherGraphics.generateTexture('otherPlayer', 32, 32);
    }

    create() {
        console.log('GameScene: create started');
        this.loadingText = this.add.text(window.innerWidth / 2, window.innerHeight / 2, 'Connecting to server...', {
            fontSize: '32px',
            fill: '#ffffff'
        }).setOrigin(0.5);

        this.socket = socketService.getSocket();

        if (!this.socket) {
            console.error('GameScene: Socket is null! Reconnecting...');
            this.socket = socketService.connect();
        }

        this.myPlayerId = this.socket.id;
        console.log('GameScene: Socket ID:', this.myPlayerId);

        // Setup keys
        this.cursors = this.input.keyboard.createCursorKeys();

        // Socket listeners
        this.socket.on(EVENTS.PLAYERS_SYNC, (players) => {
            Object.values(players).forEach(player => {
                if (player.id === this.myPlayerId) {
                    this.createMyPlayer(player);
                } else {
                    this.addOtherPlayer(player);
                }
            });
        });

        this.socket.on(EVENTS.PLAYER_JOIN, (player) => {
            this.addOtherPlayer(player);
        });

        this.socket.on(EVENTS.PLAYER_LEAVE, (playerId) => {
            this.removePlayer(playerId);
        });

        this.socket.on(EVENTS.PLAYER_MOVE, (player) => {
            this.updateOtherPlayer(player);
        });
    }

    createMyPlayer(playerInfo) {
        console.log('GameScene: Creating my player', playerInfo);
        if (this.loadingText) {
            this.loadingText.destroy();
            this.loadingText = null;
        }

        this.player = this.physics.add.sprite(playerInfo.x, playerInfo.y, 'player');
        this.player.setCollideWorldBounds(true);

        // Camera follow
        this.cameras.main.startFollow(this.player);
        this.cameras.main.setZoom(1);
    }

    addOtherPlayer(playerInfo) {
        const otherPlayer = this.add.sprite(playerInfo.x, playerInfo.y, 'otherPlayer');
        this.players[playerInfo.id] = otherPlayer;
    }

    removePlayer(playerId) {
        if (this.players[playerId]) {
            this.players[playerId].destroy();
            delete this.players[playerId];
        }
    }

    updateOtherPlayer(playerInfo) {
        const otherPlayer = this.players[playerInfo.id];
        if (otherPlayer) {
            otherPlayer.setPosition(playerInfo.x, playerInfo.y);
        }
    }

    update() {
        if (!this.player) return;

        const prevX = this.player.x;
        const prevY = this.player.y;

        this.player.setVelocity(0);

        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-this.speed);
        } else if (this.cursors.right.isDown) {
            this.player.setVelocityX(this.speed);
        }

        if (this.cursors.up.isDown) {
            this.player.setVelocityY(-this.speed);
        } else if (this.cursors.down.isDown) {
            this.player.setVelocityY(this.speed);
        }

        // Emit movement if changed
        if (this.player.x !== prevX || this.player.y !== prevY) {
            this.socket.emit(EVENTS.PLAYER_MOVE, {
                x: this.player.x,
                y: this.player.y,
                anim: 'walk' // Placeholder
            });
        }

        this.checkProximity();
    }

    checkProximity() {
        const threshold = 150;
        const closePlayers = [];

        if (!this.player) return;

        Object.keys(this.players).forEach(id => {
            const otherPlayer = this.players[id];
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, otherPlayer.x, otherPlayer.y);
            if (dist < threshold) {
                closePlayers.push(id);
            }
        });

        this.game.events.emit('proximityUpdate', closePlayers);
    }
}
