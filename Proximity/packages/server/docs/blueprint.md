# Pixel Office - Backend & Infrastructure Blueprint (V2.0)

This document outlines the complete server-side architecture for the Pixel Office project. It is designed as a **Modular Monolith**, balancing scalability and ease of management for a personal project.

## 1. 🏛️ Core Architecture: The "Modular Monolith"

We are *not* building complex microservices. We are building a **single, powerful Node.js server** that is *organized* internally like microservices.

* **Why?:**
    * **Easy to Host:** You only deploy one application.
    * **Easy to Develop:** No complex network communication between services.
    * **Organized:** Code is cleanly separated by concern (e.g., `chatHandler`, `videoHandler`), making it easy to maintain.

## 2. 🥞 Technology Stack

| Category | Technology | Purpose |
| :--- | :--- | :--- |
| **Language** | **TypeScript** | Strict type-safety. Essential for a complex app with shared types. |
| **Runtime** | **Node.js** | The server environment. |
| **Framework** | **Express.js** | Handles basic API routes (like `/api/room-info`) and static file serving. |
| **Real-time** | **Socket.io** | The core of our project. Manages all real-time communication. |
| **Database (State)** | **Redis** | In-memory database. Used to store all volatile states (player positions, room lists). This allows our server to be "stateless" and easily restartable. |
| **Map Engine** | **Tiled** | We will parse Tiled `.json` maps on the server to identify special zones. |
| **Video** | **Jitsi Meet** | We will *not* handle WebRTC. We will use Jitsi's public servers (`meet.jit.si`) for free, robust video conferencing. |

## 3. 📂 Project Structure (`/packages/server`)
```
/packages/server
├── package.json
├── server.ts # Entry point: starts Express, HTTP server, Socket.io, and loads map
├── tsconfig.json
├── /public
│ └── /maps
│ └── main-office.json # Your map exported from Tiled (JSON format)
├── /src
│ ├── /api
│ │ └── routes.ts # Express routes (e.g., GET /api/room-info)
│ │
│ ├── /core
│ │ ├── mapParser.ts # Loads Tiled map and finds Jitsi zones (CRITICAL)
│ │ └── stateManager.ts # All Redis logic (CRITICAL: add/get/update/remove players)
│ │
│ ├── /socket
│ │ ├── mainSocketHandler.ts # Attaches socket event listeners and imports handlers
│ │ ├── playerHandler.ts # Handles 'join-room', 'player-move', disconnects
│ │ ├── chatHandler.ts # Handles 'send-global-chat' / chat broadcasts
│ │ └── videoHandler.ts # Handles Jitsi zone logic, emits join/leave events (CRITICAL)
│ │
│ ├── /types
│ │ └── index.ts # Shared TypeScript types (Player, Room, etc.)
│ │
│ └── /utils
│ └── logger.ts # Logging (pino/winston wrapper)
└── /scripts # Optional: dev scripts, migrations, etc.
```


## 4. 🗄️ Database (Redis) - Detailed Plan

Our server's code will be stateless. All state lives in Redis. This is our "single source of truth." We will use Redis's **Hash** data type to store player objects.

**Key Naming Strategy:**

* **Player Data (Hash):** `player:{socketId}`
    * `username`: "Brad"
    * `role`: "Developer"
    * `x`: 10
    * `y`: 20
    * `direction`: "down"
    * `currentRoom`: "main_office"
    * `currentJitsiRoom`: "null" | "conference_room_1"

* **Room Occupancy (Set):** `room:{roomId}:players`
    * This is a Set containing all `socketId`s in a specific room (e.g., "main_office").
    * This lets us easily get all players in a room: `SMEMBERS room:main_office:players`

**Why this structure?**
* It's incredibly fast (O(1) lookups).
* By storing `currentJitsiRoom` on the player hash, we can instantly check if a player is already in a call.

## 5. 🧩 Core Components: Deep Dive

This is the "how it works" in detail.

### `server.ts` (Entry Point)

* **Purpose:** To initialize and connect everything.
* **Actions:**
    1.  Initialize Express app.
    2.  Create `http.Server` from the Express app.
    3.  Create `Socket.io` Server attached to the `http.Server`.
    4.  **Connect to Redis:** Create a global Redis client instance.
    5.  **Load Map:** Call `MapParser.load('main-office.json')` to load all Jitsi zones into memory.
    6.  Attach the `mainSocketHandler` to the `io.on('connection', ...)` event.
    7.  Start listening on the port.

### `core/stateManager.ts` (The Redis Brain)

This file will contain functions to abstract all Redis commands. No other file should talk to Redis directly.

```typescript
// Example: src/core/stateManager.ts
import { createClient } from 'redis';
import { Player } from '../types'; // (or from /common/types)

const redisClient = createClient(); // (connects on init)

// Stores data for a new player
export async function addPlayer(socketId: string, data: { username: string, role: string }): Promise<Player> {
  const newPlayer = {
    id: socketId,
    username: data.username,
    role: data.role,
    x: 100, // Default spawn X
    y: 100, // Default spawn Y
    direction: 'down',
    currentRoom: 'main_office',
    currentJitsiRoom: 'null',
  };
  
  // Create a Hash in Redis
  await redisClient.hSet(`player:${socketId}`, newPlayer);
  
  // Add player to the room's Set
  await redisClient.sAdd(`room:main_office:players`, socketId);
  
  return newPlayer;
}

// Gets a player's data
export async function getPlayer(socketId: string): Promise<Player | null> {
  return await redisClient.hGetAll(`player:${socketId}`) as Player;
}

// Updates just the position
export async function updatePlayerPosition(socketId: string, data: { x: number, y: number, direction: string }) {
  await redisClient.hSet(`player:${socketId}`, {
    x: data.x,
    y: data.y,
    direction: data.direction
  });
}

// Sets the player's Jitsi room
export async function setPlayerJitsiRoom(socketId: string, jitsiRoom: string | null) {
  await redisClient.hSet(`player:${socketId}`, 'currentJitsiRoom', jitsiRoom || 'null');
}

// Removes a player on disconnect
export async function removePlayer(socketId: string) {
  // 1. Get player data to see what room they were in
  const room = await redisClient.hGet(`player:${socketId}`, 'currentRoom');
  
  // 2. Remove player from room Set
  if (room) {
    await redisClient.sRem(`room:${room}:players`, socketId);
  }
  
  // 3. Delete the player's Hash
  await redisClient.del(`player:${socketId}`);
}

// Gets all players in a room
export async function getPlayersInRoom(roomId: string): Promise<Player[]> {
  const playerIds = await redisClient.sMembers(`room:${roomId}:players`);
  const players: Player[] = [];
  
  // This is fast, but for many players, a Redis pipeline (MULTI) is even better
  for (const id of playerIds) {
    const player = await getPlayer(id);
    if (player) players.push(player);
  }
  return players;
}

core/mapParser.ts (The Tiled Logic)

    Purpose: To load the Tiled JSON and find the "trigger" zones for Jitsi.

    How: In Tiled, you will:

        Create an Object Layer named Triggers.

        Draw a rectangle over your conference room.

        Give this rectangle a Custom Property (string) named jitsiRoom with a value of conference_room_1.

TypeScript

// Example: src/core/mapParser.ts

// A simple in-memory cache for our zones
const jitsiZones = new Map<string, { x: number, y: number, width: number, height: number }>();

export function loadMap(mapName: string) {
  // 1. Read the file (e.g., /public/maps/main-office.json)
  const mapData = JSON.parse(fs.readFileSync(`.../${mapName}`, 'utf-8'));

  // 2. Find the "Triggers" layer
  const triggerLayer = mapData.layers.find((layer: any) => layer.name === 'Triggers');
  
  if (triggerLayer && triggerLayer.objects) {
    // 3. Loop through all objects in that layer
    for (const obj of triggerLayer.objects) {
      // 4. Find objects that have a "jitsiRoom" property
      const jitsiProp = obj.properties?.find((prop: any) => prop.name === 'jitsiRoom');
      
      if (jitsiProp) {
        const roomName = jitsiProp.value; // "conference_room_1"
        const zone = {
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height
        };
        // 5. Store it in our cache
        jitsiZones.set(roomName, zone);
        console.log(`Loaded Jitsi Zone: ${roomName} at [${zone.x}, ${zone.y}]`);
      }
    }
  }
}

// This function checks a player's (x, y) against all loaded zones
export function getJitsiRoomForPosition(x: number, y: number): string | null {
  for (const [roomName, zone] of jitsiZones.entries()) {
    // Simple AABB (Axis-Aligned Bounding Box) collision check
    if (x >= zone.x && x <= zone.x + zone.width &&
        y >= zone.y && y <= zone.y + zone.height) {
      return roomName; // Found! Player is in this Jitsi room
    }
  }
  return null; // Player is in no Jitsi room
}

socket/videoHandler.ts (The Jitsi Magic)

This is the most important part of V2. It replaces your old webrtcHandler. It does not send any WebRTC signals.

    Purpose: To check a player's position, see if they entered/left a Jitsi zone, and tell the client.

TypeScript

// Example: src/socket/videoHandler.ts
import { Socket } from 'socket.io';
import * as State from '../core/stateManager';
import * as MapParser from '../core/mapParser';

// This function is CALLED by playerHandler every time a player moves
export async function checkJitsiZone(socket: Socket, newX: number, newY: number) {
  // 1. Get the player's current state from Redis
  const player = await State.getPlayer(socket.id);
  if (!player) return;

  const currentJitsiRoom = player.currentJitsiRoom;

  // 2. Check Tiled map data: What zone is the player in *now*?
  const newJitsiRoom = MapParser.getJitsiRoomForPosition(newX, newY); // e.g., "conference_room_1" or null

  // 3. Compare old state vs. new state
  if (currentJitsiRoom === newJitsiRoom) {
    // No change, do nothing.
    return;
  }

  // --- A CHANGE OCCURRED! ---

  if (newJitsiRoom) {
    // 4. A. Player ENTERED a zone
    // Update Redis
    await State.setPlayerJitsiRoom(socket.id, newJitsiRoom);
    // Tell the client to join
    socket.emit('join-jitsi', { roomName: newJitsiRoom });

  } else {
    // 4. B. Player LEFT a zone (newJitsiRoom is null)
    // Update Redis
    await State.setPlayerJitsiRoom(socket.id, null);
    // Tell the client to leave
    socket.emit('leave-jitsi', { roomName: currentJitsiRoom }); // Tell them which room they left
  }
}

socket/playerHandler.ts

    Purpose: Manage the player lifecycle and movement.

    Events:

        join-room:

            Calls State.addPlayer() to create the player in Redis.

            Gets all other players from State.getPlayersInRoom().

            Emits 'current-users' to the new player (with the list).

            Broadcasts 'new-user-joined' to everyone else (with the new player's data).

        player-move:

            Calls State.updatePlayerPosition() to save new (x, y) to Redis.

            Broadcasts 'player-moved' to all other players.

            Crucially: After this, it calls VideoHandler.checkJitsiZone() with the new (x, y).

6. 💡 Code Quality & Best Practices

    TypeScript (Strict): Use tsconfig.json with "strict": true. This forces good, null-safe code.

    Separation of Concerns: This is the point of the Modular Monolith.

        Handlers (/socket): Should only handle socket.on events. They parse data and call core logic.

        Core (/core): Should have zero Socket.io code. stateManager knows nothing about sockets, it just talks to Redis. This makes your code testable.

    Error Handling: All async functions (especially Redis calls) must be wrapped in try...catch blocks to prevent the server from crashing.

    Logging: Use a simple logger (like pino or winston) instead of console.log for better production-level logging.

7. 🚀 Phased Development Plan (Place of Action)

Follow this order. Do not skip to Jitsi.

    Phase 1: Basic Server & Socket

        Setup Node.js + TS + Express + Socket.io.

        Create a basic server.ts.

        Make a client connect and console.log("user connected").

    Phase 2: Tiled Map & In-Memory State (No Redis yet)

        Create mapParser.ts. Write the loadMap function. On server start, log the zones you find.

        Create a simple in-memory Map object (e.g., const players = new Map<string, Player>()) to act as your database.

        Implement join-room and player-move. Make players appear and move on-screen.

    Phase 3: Redis Integration (The "Real" Database)

        Install redis.

        Create stateManager.ts.

        Write all the functions (addPlayer, getPlayer, etc.).

        Go back to playerHandler.ts and replace your in-memory Map calls with await State.addPlayer(), etc.

        Test: Your app should work exactly as it did in Phase 2. This proves your abstraction is good.

    Phase 4: Jitsi Integration (The V2 Magic)

        Create videoHandler.ts.

        Write the checkJitsiZone logic.

        In playerHandler.ts (inside the player-move event), add the call to await VideoHandler.checkJitsiZone().

        Test by emitting console.logs to the client: 'Client should join jitsi'

    Phase 5: Chat & Polish

        Implement chatHandler.ts. This is easy now, as it's just like playerHandler: it gets data and tells the server to broadcast.

        Add error handling and logging.
