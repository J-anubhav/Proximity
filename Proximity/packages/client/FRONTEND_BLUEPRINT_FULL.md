# Pixel Office - Frontend Blueprint (V2.0)

This document outlines the client-side architecture for the Pixel Office project. It details the powerful combination of **React (for UI)** and **Phaser (for Game)**.

## 1. 🏛️ Core Architecture: The React-Phaser Bridge

This is the most crucial concept. React and Phaser work *together*, each doing what it's best at.

* **React's Job (`/src/ui`):**
    * Render all HTML UI (Login forms, chat boxes, user lists).
    * Manage the **Socket.io connection**.
    * Manage global UI state (e.g., list of chat messages, current user).
    * **Crucially:** Render the `<JitsiPopup />` component when the server tells it to.

* **Phaser's Job (`/src/game`):**
    * Render the `<canvas>` element.
    * Load and render the **Tiled Map** (`main-office.json`).
    * Handle **Collision** (player vs. "Walls" layer).
    * Handle **Keyboard Input** (Arrow keys) for local player movement.
    * Render all other player sprites and move them based on server events.

* **How They Talk:**
    1.  **React to Phaser:** React components can call functions inside the running Phaser game (e.g., `phaserGame.changePlayerAvatar('new-hat')`).
    2.  **Phaser to React:** Phaser can emit events that React listens for (e.g., `phaserGame.events.emit('player-died')`). **We will not use this much.** We will rely on Socket.io as the *main* bridge.

## 2. 🥞 Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Language** | **TypeScript** | Type-safety for components, state, and game logic. |
| **Bundler** | **Vite** | Extremely fast development server and build tool. |
| **UI Library** | **React** | Manages all UI components and application state. |
| **Game Engine** | **Phaser 3** | Renders the 2D game world, sprites, and map. |
| **Real-time** | **Socket.io-client** | Connects to the backend server and handles all events. |
| **State** | **Zustand / Redux** (Optional) | Good for managing chat messages or user lists. For V1, React Context is fine. |
| **Video** | **Jitsi IFrame API** | The official Jitsi library for embedding a video call in a webpage. |

## 3. 📂 Project Structure (`/packages/client`)

    /client
    ├── /public
    │   ├── /assets/sprites
    │   │   └── player_spritesheet.png
    │   └── /assets/tilesets
    │       └── office_tiles.png
    ├── /src
    │   ├── /game
    │   │   ├── scenes/
    │   │   │   └── MainScene.ts
    │   │   ├── prefabs/
    │   │   │   └── Player.ts
    │   │   └── init.ts
    │   ├── /ui
    │   │   ├── /components
    │   │   │   ├── ChatBox.tsx
    │   │   │   ├── Login.tsx
    │   │   │   └── JitsiPopup.tsx
    │   │   └── GameContainer.tsx
    │   ├── /hooks
    │   │   └── useSocket.ts
    │   ├── socket.ts
    │   ├── main.tsx
    │   └── styles.css
    ├── package.json
    └── vite.config.ts


## 4. 🧩 Core Components: Deep Dive

### `socket.ts` (The Connection)

This file *only* creates and exports the socket instance. This ensures there is only **one connection** for the entire app.

```typescript
// Example: src/socket.ts
import { io } from 'socket.io-client';

const URL = 'http://localhost:3000'; // Your server URL
export const socket = io(URL, {
  autoConnect: false // We will connect manually after login
});
```

ui/Login.tsx

    Purpose: Asks for username/role.

    Action:

        User clicks "Login".

        It calls socket.connect().

        Once connected, it socket.emit('join-room', { username, role }).

        It sets a global state (e.g., setIsLoggedIn(true)), which hides the Login component and shows the GameContainer.

ui/GameContainer.tsx (The Bridge)

This is the most important React component. It initializes the Phaser game.

```typescript
// Example: src/ui/GameContainer.tsx
import React, { useEffect, useRef } from 'react';
import { startGame } from '../game/init'; // This function creates the Phaser.Game

export const GameContainer = () => {
  const gameRef = useRef(null); // Ref to the div where Phaser will live

  useEffect(() => {
    if (gameRef.current) {
      const phaserGame = startGame(gameRef.current);
    }
    return () => {
      phaserGame?.destroy(true);
    };
  }, []);

  return <div id="phaser-container" ref={gameRef} />;
}
```

game/scenes/MainScene.ts (The Game)

```typescript
// Example: src/game/scenes/MainScene.ts
import Phaser from 'phaser';
import { socket } from '../../socket';
import { Player } from '../prefabs/Player';

export class MainScene extends Phaser.Scene {
  private localPlayer: Player;
  private otherPlayers: Map<string, Player>;
  private collisionLayer: Phaser.Tilemaps.TilemapLayer;

  constructor() {
    super('MainScene');
    this.otherPlayers = new Map();
  }

  preload() {
    this.load.image('tiles', '/assets/tilesets/office_tiles.png');
    this.load.tilemapTiledJSON('map', '/maps/main-office.json');
    this.load.spritesheet('player', '/assets/sprites/player_spritesheet.png', {
      frameWidth: 32, frameHeight: 32
    });
  }

  create() {
    const map = this.make.tilemap({ key: 'map' });
    const tileset = map.addTilesetImage('office_tiles', 'tiles');
    map.createLayer('Floor', tileset);
    this.collisionLayer = map.createLayer('Walls', tileset);
    this.collisionLayer.setCollisionByProperty({ collides: true });
    this.registerSocketEvents();
  }

  update() {
    if (this.localPlayer) {
      this.localPlayer.handleInput();
      this.physics.collide(this.localPlayer, this.collisionLayer);
    }
  }

  registerSocketEvents() {
    socket.on('current-users', (players) => {
      for (const player of players) {
        if (player.id === socket.id) {
          this.localPlayer = new Player(this, player.x, player.y, 'player', player.username);
          this.cameras.main.startFollow(this.localPlayer);
          this.physics.add.collider(this.localPlayer, this.collisionLayer);
        } else {
          const otherPlayer = new Player(this, player.x, player.y, 'player', player.username);
          this.otherPlayers.set(player.id, otherPlayer);
        }
      }
    });

    socket.on('new-user-joined', (player) => {
      if (!this.otherPlayers.has(player.id)) {
        const otherPlayer = new Player(this, player.x, player.y, 'player', player.username);
        this.otherPlayers.set(player.id, otherPlayer);
      }
    });

    socket.on('player-moved', (player) => {
      const otherPlayer = this.otherPlayers.get(player.id);
      if (otherPlayer) {
        otherPlayer.setPosition(player.x, player.y);
        otherPlayer.playAnimation(player.direction);
      }
    });

    socket.on('user-left', (socketId) => {
      const otherPlayer = this.otherPlayers.get(socketId);
      if (otherPlayer) {
        otherPlayer.destroy();
        this.otherPlayers.delete(socketId);
      }
    });
  }
}
```

ui/JitsiPopup.tsx (The V2 Magic)

```typescript
import React from 'react';
import { JitsiMeeting } from '@jitsi/react-sdk';

interface JitsiPopupProps {
  roomName: string;
}

export const JitsiPopup = ({ roomName }: JitsiPopupProps) => {
  return (
    <div style={{
      position: 'absolute', top: 20, right: 20,
      width: 350, height: 400,
      border: '2px solid black',
      background: 'white'
    }}>
      <h4>Video Call: {roomName}</h4>
      <JitsiMeeting
        roomName={roomName}
        domain="meet.jit.si"
        configOverwrite={{
          startWithAudioMuted: true,
          startWithVideoMuted: true,
          prejoinPageEnabled: false,
          toolbarButtons: [ 'microphone', 'camera', 'hangup' ],
        }}
        getIFrameRef={(iframeRef) => { 
          iframeRef.style.height = '300px'; 
        }}
      />
    </div>
  );
};
```

## 5. 🚀 Phased Development Plan (Place of Action)

    Phase 1: React + Vite Setup
    Phase 2: Phaser Integration
    Phase 3: Tiled Map & Local Player
    Phase 4: Socket.io & Multi-user
    Phase 5: Jitsi UI Integration
