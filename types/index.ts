import { Record, Static, String, Literal, Array, Union } from "runtypes"

// Anything that goes over the wire should be typed here.
// These type definitions are shared by the client and the server, since one end will
// validate before send and the other will validate on receive.
// Each message needs two statements: one declaring the runtypes object that will validate
// the message, and a second that defines the TypeScript type using during development
// and compilation

// Useful type aliases
export type RoomID = string
export type SendChitterMessage = (message: ChitterMessage) => void
export type ReceiveChitterMessage = (message: ChitterMessage) => void

// Combined versions and commits, assembled on the server
export const Versions = Record({
  commit: Record({
    client: String,
    server: String,
  }),
  version: Record({
    client: String,
    server: String,
  }),
})
export type Versions = Static<typeof Versions>

// Type for the query parameters included in the initial websocket connection
// TODO: require googleToken, since we don't need to support anonymous connections
// (even if we support anonymous messaging...)
export const ConnectionQuery = Record({
  clientID: String,
  version: String,
  commit: String,
  googleToken: String,
})
export type ConnectionQuery = Static<typeof ConnectionQuery>

// Message types: all must have a distinct type field
// It's usually best to keep client -> server messages distinct from
// server -> messages, even if they have the same data shape.

// But... in this case, we have one message type that clearly needs to move
// in both directions
// TODO: Add things here as needed
export const ChitterMessage = Record({
  type: Literal("message"),
  id: String,
  clientID: String,
  room: String,
  messageType: String,
  contents: String,
})
export type ChitterMessage = Static<typeof ChitterMessage>

// client -> server: Request to join a room
export const JoinMessage = Record({
  type: Literal("join"),
  roomID: String,
})
export type JoinMessage = Static<typeof JoinMessage>

// All messages that can be sent by the client
export const ClientMessages = Union(JoinMessage)

// server -> client: List rooms that the client has joined
export const RoomsMessage = Record({
  type: Literal("rooms"),
  rooms: Array(String),
})
export type RoomsMessage = Static<typeof RoomsMessage>

// All messages that can be sent by the server
export const ServerMessages = Union(RoomsMessage)
