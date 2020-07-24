import { Record, Static, String, Literal, Union, InstanceOf, Unknown, Number, Boolean, Partial, Array } from "runtypes"

// Anything that goes over the wire should be typed here.
// These type definitions are shared by the client and the server, since one end will
// validate before send and the other will validate on receive.
// Each message needs two statements: one declaring the runtypes object that will validate
// the message, and a second that defines the TypeScript type using during development
// and compilation

// Useful type aliases
export type RoomID = string

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
  client: String,
  version: String,
  commit: String,
  googleToken: String,
})
export type ConnectionQuery = Static<typeof ConnectionQuery>

// Message types: all must have a distinct type field
// It's usually best to keep client -> server messages distinct from
// server -> messages, even if they have the same data shape.

const ChitterContents = Record({
  id: String, // Let the client set this ID so that it can detect its own messages
  view: String, // Identifies the specific chat box that send this message
  room: String,
  messageType: String,
  contents: Unknown,
})

// client -> server: message to send to a room
export const ChitterMessageRequestType = "messagerequest"
export const ChitterMessageRequest = ChitterContents.And(
  Record({
    type: Literal(ChitterMessageRequestType),
  })
).And(
  // Only set by the client during development
  Partial({
    email: String,
    name: String,
  })
)
export type ChitterMessageRequest = Static<typeof ChitterMessageRequest>

// server -> client: original message with some fields added
export const ChitterMessageType = "message"
export const ChitterMessage = ChitterContents.And(
  Record({
    type: Literal(ChitterMessageType),
    new: Boolean,
    timestamp: Union(String, InstanceOf(Date)),
    unixtime: Number,
    email: String,
    name: String,
  })
)
export type ChitterMessage = Static<typeof ChitterMessage>

// server -> database: add clientID field and override type
export const SavedChitterMessage = ChitterMessage.And(
  Record({
    _id: String,
    client: String,
    versions: Versions,
  })
)
export type SavedChitterMessage = Static<typeof SavedChitterMessage>

// client -> server: Request to join a room
export const JoinRequestMessageType = "joinrequest"
export const JoinRequestMessage = Record({
  type: Literal(JoinRequestMessageType),
  id: String,
  room: String,
})
export type JoinMessageMessage = Static<typeof JoinRequestMessage>

// server -> client: room request response
export const JoinResponseMessageType = "join"
export const JoinResponseMessage = Record({
  type: Literal(JoinResponseMessageType),
  id: String,
  room: Union(String, Literal(false)),
})
export type JoinResponseMessage = Static<typeof JoinResponseMessage>

// client -> server: Request for room history
// Server responds with 0 or more ReceivedChitterMessages, and then a history response
export const HistoryRequestMessageType = "historyrequest"
export const HistoryRequestMessage = Record({
  type: Literal(HistoryRequestMessageType),
  id: String,
  room: String,
  end: String,
  count: Number,
})
export type HistoryRequestMessage = Static<typeof HistoryRequestMessage>

// server -> client: Final response to close room history request
// Server responds with 0 or more ReceivedChitterMessages, and then a history response
export const HistoryResponseMessageType = "history"
export const HistoryResponseMessage = Record({
  type: Literal(HistoryResponseMessageType),
  id: String,
  start: String,
  end: String,
  count: Number,
})
export type HistoryResponseMessage = Static<typeof HistoryResponseMessage>

// All messages that can be sent by the client
export const ClientMessages = Union(ChitterMessageRequest, JoinRequestMessage, HistoryRequestMessage)
// All messages that can be sent by the server
export const ServerMessages = Union(ChitterMessage, JoinResponseMessage, HistoryResponseMessage)

export const ServerStatus = Record({
  started: String.withConstraint((s) => Date.parse(s) !== NaN),
  version: String,
  commit: String,
  counts: Record({
    client: Number,
    send: Number,
    request: Number,
    join: Number,
  }),
  googleClientIDs: Array(String),
})
export type ServerStatus = Static<typeof ServerStatus>
