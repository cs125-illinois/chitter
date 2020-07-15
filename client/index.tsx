/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { createContext, useContext, ReactNode, useRef, useEffect, useState, useCallback } from "react"
import PropTypes from "prop-types"

import ReconnectingWebSocket, { Event } from "reconnecting-websocket"
import { PingWS, filterPingPongMessages } from "@cs125/pingpongws"

import { EventEmitter } from "events"

import { v4 as uuidv4 } from "uuid"
import queryString from "query-string"

import {
  ConnectionQuery,
  RoomsMessage,
  RoomID,
  ChitterMessage,
  JoinMessage,
  SendChitterMessage,
  ReceiveChitterMessage,
} from "../types"

import { String } from "runtypes"
const VERSION = String.check(process.env.npm_package_version)
const COMMIT = String.check(process.env.GIT_COMMIT)

// Type and create our context that will be passed to consumers lower in the component tree
// TODO: Add things here as needed, including callbacks allowing components to send messagse
export interface ChitterContext {
  connected: boolean
  rooms: RoomID[]
  join: (requestID: string, room: RoomID, onReceive: ReceiveChitterMessage) => SendChitterMessage
  leave: (room: RoomID, onReceive: ReceiveChitterMessage) => void
}

interface RoomRequest {
  room: RoomID
  onReceive: ReceiveChitterMessage
}

// Context provider component that will wrap the entire app.
// Responsible for establishing the websocket connection and providing ways for
// context subscribers to join rooms and send and receive messages
export interface ChitterProviderProps {
  server: string
  googleToken: string | undefined
  children: ReactNode
}
export const ChitterProvider: React.FC<ChitterProviderProps> = ({ server, googleToken, children }) => {
  // UniqueID that identifies this client. Saved in sessionStorage to be stable across refreshes,
  // but not in localStorage to allow different rooms for each tab
  // Need to make sure that we don't fetch this during SSR...
  const clientID = useRef<string>((typeof window !== "undefined" && sessionStorage.getItem("chitter:id")) || uuidv4())

  // State that we will pass to context subscribers
  // Usually there is a one-to-one mapping between parts of the context object and state
  // on the context provider
  const [connected, setConnected] = useState(false)
  const [rooms, setRooms] = useState<RoomID[]>([])

  const messager = useRef(new EventEmitter())

  const connection = useRef<ReconnectingWebSocket | undefined>(undefined)
  useEffect(() => {
    sessionStorage.setItem("chitter:id", clientID.current)
  }, [])

  // Set up the websocket connection
  useEffect(() => {
    // useEffect runs after the initial render, and (in this case) any time the server configuration changes
    connection.current?.close()

    // We now require authentication, so simply return if this prop isn't set
    if (!googleToken) {
      return
    }

    const connectionQuery = ConnectionQuery.check({
      googleToken,
      clientID: clientID.current,
      version: VERSION,
      commit: COMMIT,
    })
    connection.current = PingWS(
      new ReconnectingWebSocket(`${server}?${queryString.stringify(connectionQuery)}`, [], { startClosed: true })
    )

    // Set up listeners to pass the connection state to context subscribers
    // Note that the ReconnectingWebsocket and our PingPong wrapper will
    // send keep-alive messages and attempt to reconnect across disconnections
    // That keeps our code fairly simple
    connection.current.addEventListener("open", () => {
      setConnected(true)
    })
    connection.current.addEventListener("close", () => {
      setConnected(false)
    })

    connection.current.addEventListener(
      "message",
      filterPingPongMessages(({ data }) => {
        // Very similar to the server-side code.
        // Handle any incoming messages that we could receive from the server.
        const message = JSON.parse(data)
        if (RoomsMessage.guard(message)) {
          setRooms(message.rooms)
        } else if (ChitterMessage.guard(message)) {
          messager.current.emit(message.room, message)
        }
      })
    )

    connection.current.reconnect()
    return (): void => {
      connection.current?.close()
    }
  }, [server, googleToken])

  const roomRequests = useRef<Record<string, RoomRequest>>({})

  const join = useCallback((requestID: string, room: RoomID, onReceive: ReceiveChitterMessage) => {
    roomRequests.current[requestID] = { room, onReceive }

    connection.current?.send(JSON.stringify(JoinMessage.check({ type: "join", roomID: room })))

    messager.current.addListener(room, onReceive)

    return (message: ChitterMessage) => {
      connection.current?.send(JSON.stringify(message))
    }
  }, [])

  const leave = useCallback((requestID: string) => {
    if (!roomRequests.current[requestID]) {
      console.warn(`Ignoring invalid requestID: ${requestID}`)
      return
    }
    const { room, onReceive } = roomRequests.current[requestID]
    messager.current.removeListener(room, onReceive)
    delete roomRequests.current[requestID]
  }, [])

  return <ChitterContext.Provider value={{ connected, rooms, join, leave }}>{children}</ChitterContext.Provider>
}

ChitterProvider.propTypes = {
  server: PropTypes.string.isRequired,
  googleToken: PropTypes.string,
  children: PropTypes.node.isRequired,
}

export const useChitter = (): ChitterContext => {
  return useContext(ChitterContext)
}

// This is a default context object that we need to provide for some reason
// It should never be used by an actual subscriber
// Just set default values for fields and functions that throw for callbacks
export const ChitterContext = createContext<ChitterContext>({
  connected: false,
  rooms: [],
  join: () => {
    throw new Error("ChitterProvider not set")
  },
  leave: () => {
    throw new Error("ChitterProvider not set")
  },
})

export { ChitterMessage }
