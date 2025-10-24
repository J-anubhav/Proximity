# Pixel Office Backend Blueprint (V1.0)

This document outlines the complete plan for the **Version 1.0** backend of our "Pixel Office" project. The goal is simplicity, speed, and testing core features without a database.

## V1: Scope & Features

Our V1 is focused on these features:

1.  **Single Fixed Map:** A single office map (`main-office.json`) created with the `Tiled` editor and hosted by the server.
2.  **Simple Login:** No database. A user just enters a `username` and a cosmetic `role` (like "Developer") to join.
3.  **Cosmetic Roles:** Roles (e.g., "Intern", "Team Lead") will only be displayed under the user's name. They will have *no* special permission logic in V1.
4.  **In-Memory State:** The server will store the current position and info of all connected players in RAM (within a JavaScript object).
5.  **Proximity Video/Audio:** Using WebRTC. When two users' avatars get close, their video/audio connection will be established.
6.  **Chat System:**
    * **Global Text Chat:** A common chatroom where everyone can talk.
    * **Private DMs:** Users can select another user to send private text messages.
7.  **No Persistence:** If the server restarts, all state (who was where) will be reset.

## Technology Stack

* **Runtime:** Node.js
* **Server Framework:** Express.js
* **Real-time Layer:** Socket.io
* **Database:** **None** (State will be managed entirely In-Memory)

## Folder Structure

```
/pixel-office-backend
├── /node_modules
├── /public
│   ├── /maps
│   │   └── main-office.json   <-- (Your Tiled map file)
│   └── index.html             <-- (Simple test file)
├── /src
│   ├── /api
│   │   └── routes.js          <-- (Express API routes)
│   ├── /core
│   │   └── state.js           <-- (In-memory "database")
│   ├── /socket
│   │   ├── chatHandler.js     <-- (Global/DM chat logic)
│   │   ├── playerHandler.js   <-- (Join, Move, Leave logic)
│   │   └── webrtcHandler.js   <-- (Video signal logic)
│   └── mainSocketHandler.js   <-- (Main socket event manager)
├── .gitignore                 <-- (Git ignore file)
├── server.js                  <-- (Server entry point)
└── package.json
```

## Core Concept: In-Memory State

File: `/src/core/state.js`

This is our V1 "database." It's a simple JavaScript object that lives in the server's RAM and holds the live info of all connected players.

```javascript
// Example structure of the players object:
let players = {
  "socket-id-123": {
    userId: "socket-id-123",
    username: "Jinen",
    role: "Team Lead",
    x: 150,
    y: 200,
    direction: 'down'
  },
  "socket-id-456": {
    userId: "socket-id-456",
    username: "Brad",
    role: "Intern",
    x: 160,
    y: 210,
    direction: 'up'
  }
};

// Helper functions (addPlayer, removePlayer, etc.) will manipulate this object.
```

## API Endpoints (Express.js)

File: `/src/api/routes.js`

Our REST API is very simple and only serves to provide map info.

* **`GET /api/room-info`**
    * **Purpose:** Tells the frontend client which map file to load.
    * **Response:**
        ```json
        {
          "roomName": "V1 Main Office",
          "mapUrl": "/maps/main-office.json"
        }
        ```

* **Static Files:** Express serves the `public` folder, so a `GET /maps/main-office.json` request will automatically return the map file.

## WebSocket Events (Socket.io)

This is the heart of our application. All real-time communication happens via these events (defined in `/src/socket/*` files).

### Player Events (`playerHandler.js`)

* **`join-room`** (Client to Server)
    * **Data:** `{ username: "Jinen", role: "Team Lead" }`
    * **Logic:**
        1.  Adds the user to the `players` object in `state.js`.
        2.  Sends the `current-users` event to the new user (so they know who is already in the room).
        3.  Broadcasts the `new-user-joined` event to all other users.

* **`player-move`** (Client to Server)
    * **Data:** `{ x: 120, y: 300, direction: 'left' }`
    * **Logic:**
        1.  Updates the user's position in the `players` object.
        2.  Broadcasts this new position to everyone else with the `player-moved` event.

* **`disconnect`** (Automatic)
    * **Logic:** (Handled in `mainSocketHandler.js`)
        1.  Removes the user from the `players` object.
        2.  Broadcasts the `user-left` event to everyone so the frontend can remove that player from the map.

### Chat Events (`chatHandler.js`)

* **`send-global-chat`** (Client to Server)
    * **Data:** `{ message: "Hello team!" }`
    * **Logic:**
        1.  Gets the user's info (username, role) from the state.
        2.  `io.emit`s the message to *all* connected clients (including the sender) with the `receive-global-chat` event.

* **`send-private-dm`** (Client to Server)
    * **Data:** `{ targetSocketId: "socket-id-456", message: "Is the report ready?" }`
    * **Logic:**
        1.  Sends the message *only* to the target user with the `receive-private-dm` event using `io.to(targetSocketId).emit(...)`.

### WebRTC Events (`webrtcHandler.js`)

The server here acts only as a **Signaling Server** (a postman). It does *not* see the video data.

* **`send-signal`** (Client to Server)
    * **Data:** `{ targetSocketId: "socket-id-456", signal: { ...WebRTC Offer/Answer/ICE... } }`
    * **Logic:**
        1.  Forwards this signal data directly to the `targetSocketId` user with the `receive-signal` event.

* **`close-peer`** (Client to Server)
    * **Data:** `{ targetSocketId: "socket-id-456" }`
    * **Logic:**
        1.  The frontend indicates it has moved away from this user.
        2.  The server sends this message to the target user with the `close-peer` event, so their frontend can close that video connection.

## Persistence: Server Restarts

This is a V1 design choice:
* **State is in RAM:** The `players` object lives in the server's RAM.
* **What happens on Restart:** If the server crashes or we deploy new code (restarting it), the `players` object will be **reset** (emptied).
* **Result:** All users will be disconnected, and the room will be empty. They will have to rejoin.
* **Why?** This is perfect for V1 because it removes the overhead of database management.

## .gitignore

This file ensures we don't commit unnecessary files to Git.

```gitignore
# Dependencies
/node_modules

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment Variables
# NEVER commit these!
.env
.env.local

# Operating System files
.DS_Store
Thumbs.db

# IDE & Editor specific files
.vscode/
.idea/
```