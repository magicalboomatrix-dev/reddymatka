'use client';

import { io } from 'socket.io-client';

let socket = null;

/**
 * Returns a connected Socket.IO instance, creating one if needed.
 * Pass a JWT token to authenticate the connection.
 *
 * @param {string} token  JWT from localStorage
 * @returns {import('socket.io-client').Socket}
 */
export function getSocket(token) {
  if (socket) return socket;

  const url = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
  socket = io(url, {
    auth: token ? { token } : undefined, // pass explicit token if available
    withCredentials: true,               // also send HttpOnly cookie
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
  });

  socket.on('connect_error', (err) => {
    // Silent — the app works normally without real-time updates
    console.debug('[socket] connect error:', err.message);
  });

  return socket;
}

/** Disconnect and discard the shared socket instance. */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Subscribe to game result events for a specific game. */
export function subscribeToGame(socket, gameId) {
  socket.emit('subscribe_game', gameId);
}

/** Unsubscribe from a game room. */
export function unsubscribeFromGame(socket, gameId) {
  socket.emit('unsubscribe_game', gameId);
}
