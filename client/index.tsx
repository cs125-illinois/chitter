/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { createContext, useContext, ReactNode, useRef, useEffect, useState, useCallback } from "react"
import PropTypes from "prop-types"

import ReconnectingWebSocket from "reconnecting-websocket"
import { PingWS, filterPingPongMessages } from "@cs125/pingpongws"

import { EventEmitter } from "events"

import { v4 as uuidv4 } from "uuid"
import queryString from "query-string"

import {
  ConnectionQuery,
  RoomID,
  ServerMessages,
  JoinRequestMessageType,
  JoinRequestMessage,
  JoinResponseMessage,
  HistoryRequestMessageType,
  HistoryRequestMessage,
  ChitterMessageRequestType,
  ChitterMessageRequest,
  ChitterMessage,
} from "../types"

import { String } from "runtypes"
const VERSION = String.check(process.env.npm_package_version)
const COMMIT = String.check(process.env.GIT_COMMIT)

export type SendOptions = { email?: string; name?: string }
export type OnReceiveCallback = (message: ChitterMessage) => void
export type OnJoinCallback = (joined: boolean, err?: Error) => void
export type JoinRequest = {
  room: RoomID
  onReceive: OnReceiveCallback
  onJoin: OnJoinCallback
  sendOptions?: SendOptions
}

export type SendChitterMessage = (type: string, contents: unknown) => ChitterMessageRequest | undefined
export type RequestChitterMessages = (end: Date, count: number) => void
export type JoinResponse = {
  send: SendChitterMessage
  request: RequestChitterMessages
  leave: () => void
}

// Type and create our context that will be passed to consumers lower in the component tree
export interface ChitterContext {
  available: boolean
  connected: boolean
  join: (request: JoinRequest) => JoinResponse
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
  const [connected, setConnected] = useState(false)

  const client = useRef<string>((typeof window !== "undefined" && sessionStorage.getItem("chitter:id")) || uuidv4())
  const connection = useRef<ReconnectingWebSocket | undefined>(undefined)
  const messager = useRef(new EventEmitter())
  const joinRequests = useRef<Record<string, JoinRequest & { status: boolean }>>({})

  useEffect(() => {
    sessionStorage.setItem("chitter:id", client.current)
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      messager.current?.removeAllListeners()
    }
  }, [])

  useEffect(() => {
    connection.current?.close()

    if (!googleToken) {
      return
    }

    const connectionQuery = ConnectionQuery.check({
      googleToken,
      client: client.current,
      version: VERSION,
      commit: COMMIT,
    })
    connection.current = PingWS(
      new ReconnectingWebSocket(`${server}?${queryString.stringify(connectionQuery)}`, [], { startClosed: true })
    )

    connection.current.addEventListener("open", () => setConnected(true))
    connection.current.addEventListener("close", () => setConnected(false))

    connection.current.addEventListener(
      "message",
      filterPingPongMessages(({ data }) => {
        const response = JSON.parse(data)
        if (!ServerMessages.guard(response)) {
          console.error(`Bad message: ${JSON.stringify(response, null, 2)}`)
          return
        }
        if (ChitterMessage.guard(response)) {
          messager.current.emit(response.room, response)
        } else if (JoinResponseMessage.guard(response)) {
          const { id, room } = response
          const request = joinRequests.current[id]
          if (!request) {
            console.error(`Mismatched join response`)
            return
          }
          const succeeded = room !== false
          request.status = succeeded
          request.onJoin(succeeded, succeeded ? undefined : new Error("Join request rejected"))
          succeeded && messager.current.addListener(room as string, request.onReceive)
        }
      })
    )

    connection.current.reconnect()
    return (): void => {
      connection.current?.close()
    }
  }, [server, googleToken])

  const join = useCallback((request: JoinRequest) => {
    const view = uuidv4()
    joinRequests.current[view] = { ...request, status: false }

    const { room, sendOptions } = request
    connection.current?.send(JSON.stringify(JoinRequestMessage.check({ type: JoinRequestMessageType, id: view, room })))

    const send = (type: string, contents: unknown): ChitterMessageRequest | undefined => {
      if (joinRequests.current[view].status !== true) {
        console.error("Can't send messages to room before joining")
        return undefined
      }
      const id = uuidv4()
      const message = ChitterMessageRequest.check({
        type: ChitterMessageRequestType,
        id,
        view,
        room,
        messageType: type,
        contents,
        ...sendOptions,
      })
      connection.current?.send(JSON.stringify(message))
      return message
    }
    const requestMessages = (end: Date, count: number) => {
      if (joinRequests.current[view].status !== true) {
        console.error("Can't request room history before joining")
        return
      }
      const message = HistoryRequestMessage.check({
        type: HistoryRequestMessageType,
        id: uuidv4(),
        room,
        end: end.toISOString(),
        count,
      })
      connection.current?.send(JSON.stringify(message))
    }
    const leave = () => {
      try {
        messager.current.removeListener(room, joinRequests.current[view].onReceive)
      } catch (err) {}
      delete joinRequests.current[view]
    }
    return { send, request: requestMessages, leave }
  }, [])

  return <ChitterContext.Provider value={{ available: true, connected, join }}>{children}</ChitterContext.Provider>
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
  available: false,
  connected: false,
  join: () => {
    throw new Error("ChitterProvider not set")
  },
})

export { ChitterMessageRequest as ChitterMessage }
