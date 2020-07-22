import { Record, Static, String, Literal, Array, Union, InstanceOf, Unknown, Number, Boolean, Partial } from "runtypes"

// Anything that goes over the wire should be typed here.
// These type definitions are shared by the client and the server, since one end will
// validate before send and the other will validate on receive.
// Each message needs two statements: one declaring the runtypes object that will validate
// the message, and a second that defines the TypeScript type using during development
// and compilation

// Useful type aliases
export type RoomID = string
export type SendOptions = { email?: string; name?: string }
export type SendChitterMessage = (type: string, contents: unknown, options?: SendOptions) => void
export type ReceiveChitterMessage = (message: OutgoingChitterMessage) => void

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

const ChitterMessage = Record({
  id: String, // Let the client set this ID so that it can detect its own messages
  room: String,
  messageType: String,
  contents: Unknown,
})

// client -> server: message to send to a room
export const IncomingChitterMessageType = "incomingmessage"
export const IncomingChitterMessage = ChitterMessage.And(
  Record({
    type: Literal(IncomingChitterMessageType),
  })
).And(
  // Only set by the client during development
  Partial({
    email: String,
    name: String,
  })
)
export type IncomingChitterMessage = Static<typeof IncomingChitterMessage>

// server -> client: original message with some fields added
export const OutgoingChitterMessageType = "outgoingmessage"
export const OutgoingChitterMessage = ChitterMessage.And(
  Record({
    type: Literal(OutgoingChitterMessageType),
    new: Boolean,
    timestamp: Union(String, InstanceOf(Date)),
    email: String,
    name: String,
  })
)
export type OutgoingChitterMessage = Static<typeof OutgoingChitterMessage>

// server -> database: add clientID field and override type
export const SavedChitterMessage = OutgoingChitterMessage.And(
  Record({
    _id: String,
    clientID: String,
    versions: Versions,
  })
)
export type SavedChitterMessage = Static<typeof SavedChitterMessage>

// client -> server: Request to join a room
export const JoinMessage = Record({
  type: Literal("join"),
  roomID: String,
})
export type JoinMessage = Static<typeof JoinMessage>

// client -> server: Request for room history
// Server responds with 0 or more ReceivedChitterMessages, and then a history response
export const HistoryRequestMessage = Record({
  type: Literal("historyrequest"),
  id: String,
  room: String,
  start: String,
  count: Number,
})
export type HistoryRequestMessage = Static<typeof HistoryRequestMessage>

// All messages that can be sent by the client
export const ClientMessages = Union(IncomingChitterMessage, JoinMessage, HistoryRequestMessage)

// server -> client: List rooms that the client has joined
export const RoomsMessage = Record({
  type: Literal("rooms"),
  rooms: Array(String),
})
export type RoomsMessage = Static<typeof RoomsMessage>

// server -> client: Final response to close room history request
// Server responds with 0 or more ReceivedChitterMessages, and then a history response
export const HistoryResponseMessage = Record({
  type: Literal("historyresponse"),
  id: String,
  start: String,
  end: String,
  count: Number,
})
export type HistoryResponseMessage = Static<typeof HistoryResponseMessage>

// All messages that can be sent by the server
export const ServerMessages = Union(OutgoingChitterMessage, RoomsMessage)
