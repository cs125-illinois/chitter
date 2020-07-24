import Koa from "koa"
import Router from "koa-router"
import bodyParser from "koa-bodyparser"
import cors from "@koa/cors"
import websocket from "koa-easy-ws"

import moment from "moment"

import { MongoClient as mongo } from "mongodb"
import mongodbUri from "mongodb-uri"

import { OAuth2Client } from "google-auth-library"

import WebSocket from "ws"
import { PongWS, filterPingPongMessages } from "@cs125/pingpongws"

import { EventEmitter } from "events"

import {
  ConnectionQuery,
  Versions,
  JoinRequestMessage,
  JoinResponseMessage,
  ChitterMessageRequest,
  ChitterMessage,
  SavedChitterMessage,
  ChitterMessageType,
  RoomID,
  ClientMessages,
  HistoryRequestMessage,
  JoinResponseMessageType,
  ServerStatus,
} from "../types"

import { String, Array } from "runtypes"
const VERSIONS = {
  commit: String.check(process.env.GIT_COMMIT),
  server: String.check(process.env.npm_package_version),
}

const DEVELOPMENT = process.env.CHITTER_DEVELOPMENT
if (DEVELOPMENT) {
  console.warn("Warning: running Chitter in development mode")
}

const allowedRooms = Array(String).check(process.env.CHITTER_ALLOWED_ROOMS?.split(",") || [])
if (!DEVELOPMENT && allowedRooms.length === 0) {
  console.error("No rooms configured. Exiting.")
  process.exit(-1)
}
// Allow all rooms in development
!DEVELOPMENT && console.log(`Allowed rooms: ${allowedRooms.join(", ")}`)

const validDomains = process.env.VALID_DOMAINS && process.env.VALID_DOMAINS.split(",").map((s) => s.trim())
const port = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT) : 8888

// Set up Koa instance and router
const app = new Koa()
const router = new Router<Record<string, unknown>, { ws: () => Promise<WebSocket> }>()

const googleClientIDs = Array(String).check(process.env.GOOGLE_CLIENT_IDS?.split(",").map((s) => s.trim()))
const googleClient = new OAuth2Client(googleClientIDs[0])

const { database } = mongodbUri.parse(process.env.MONGODB as string)
const client = mongo.connect(process.env.MONGODB as string, { useNewUrlParser: true, useUnifiedTopology: true })
const chitterCollection = client.then((c) => c.db(database).collection(process.env.MONGODB_COLLECTION || "chitter"))

const serverStatus: ServerStatus = ServerStatus.check({
  started: new Date().toISOString(),
  version: process.env.npm_package_version,
  commit: process.env.GIT_COMMIT,
  counts: {
    client: 0,
    send: 0,
    request: 0,
    join: 0,
  },
  googleClientIDs,
})
if (!DEVELOPMENT) {
  serverStatus.rooms = allowedRooms
}
if (validDomains) {
  serverStatus.domains = validDomains
}

// We use a single event emitter to distribute messages between connected clients
const messager = new EventEmitter()

router.get("/", async (ctx) => {
  if (!ctx.ws) {
    ctx.body = serverStatus
    return
  }
  // Need to finalize the promise chain, but this is a no-op after the first connection
  const collection = await chitterCollection

  const connectionQuery = ConnectionQuery.check(ctx.request.query)
  const { version, commit, googleToken, client } = connectionQuery

  // Should be saved with messages for auditing purposes
  const versions = Versions.check({
    version: {
      server: VERSIONS.server,
      client: version,
    },
    commit: {
      server: VERSIONS.commit,
      client: commit,
    },
  })

  // Check for a valid login token and reject otherwise
  let clientEmail: string | undefined
  let clientName: string | undefined
  try {
    const payload = (
      await googleClient.verifyIdToken({ idToken: googleToken, audience: googleClientIDs || [] })
    ).getPayload()
    clientEmail = payload?.email
    clientName = payload?.name
  } catch (err) {}
  if (clientEmail === undefined || clientName === undefined) {
    console.error(`Unauthorized connection request`)
    return ctx.throw(400, "Login required")
  }

  const ws = PongWS(await ctx.ws())
  const roomListeners: Record<RoomID, (message: ChitterMessage) => void> = {}
  serverStatus.counts.client++

  ws.addEventListener(
    "message",
    filterPingPongMessages(async ({ data }) => {
      // Handle incoming messages here
      const request = JSON.parse(data.toString())
      if (!ClientMessages.guard(request)) {
        console.error(`Bad message: ${data}`)
        return
      }
      if (JoinRequestMessage.guard(request)) {
        const { id, room } = request
        if (!DEVELOPMENT && !allowedRooms.includes(room)) {
          console.warn(`Not allowed to join room ${room}`)
          ws.send(JSON.stringify(JoinResponseMessage.check({ type: JoinResponseMessageType, id, room: undefined })))
          return
        }
        if (!roomListeners[room]) {
          const listener = (message: ChitterMessage) => ws.send(JSON.stringify(message))
          messager.addListener(room, listener)
          roomListeners[room] = listener
        }
        const response = JoinResponseMessage.check({ type: JoinResponseMessageType, id, room })
        ws.send(JSON.stringify(response))
        serverStatus.counts.join++
      } else if (ChitterMessageRequest.guard(request)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { email, name, type, ...outgoing } = request
        if (!DEVELOPMENT && (email || name)) {
          console.warn("Client tried to set email address or name")
          return
        }

        const now = new Date()
        const receivedMessage = ChitterMessage.check({
          ...outgoing,
          type: ChitterMessageType,
          email: (DEVELOPMENT && request.email) || clientEmail,
          name: (DEVELOPMENT && request.name) || clientName,
          new: true,
          timestamp: now,
          unixtime: now.valueOf(),
        })
        // setTimeout(() => messager.emit(receivedMessage.room, receivedMessage), 8000)
        messager.emit(receivedMessage.room, receivedMessage)
        serverStatus.counts.send++

        const savingMessage = SavedChitterMessage.check({ ...receivedMessage, _id: outgoing.id, client, versions })
        collection.insertOne({ ...savingMessage }).catch((err) => console.debug(err))
      } else if (HistoryRequestMessage.guard(request)) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, room, count } = request
        if (!roomListeners[room]) {
          console.error("Can't request history for a room that the client hasn't joined")
          return
        }
        const end = moment(request.end)
        if (!end.isValid) {
          console.error("Invalid date in history request")
          return
        }
        serverStatus.counts.request++
        // TODO: Check limit to make sure its appropriate
        const messages = await collection
          .find({ room, timestamp: { $lte: end.toDate() } })
          .limit(count)
          .sort({ timestamp: -1 })
          .toArray()
        messages.forEach((saved) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { _id, clientID, versions, ...m } = saved
          const message = ChitterMessage.check({ ...m, new: false })
          ws.send(JSON.stringify(message))
        })
      }
    })
  )
  ws.addEventListener("close", () => {
    try {
      ws.terminate()
    } catch (err) {}
    serverStatus.counts.client--
    Object.keys(roomListeners).forEach((room) => {
      messager.removeListener(room, roomListeners[room])
    })
  })
})

// Connect to our MongoDB instance on startup before starting the webserver
chitterCollection.then(async (c) => {
  console.log("Connected")

  // Set up some indices on our collection to make queries faster
  // Update as needed
  await c.createIndex({ room: 1, timestamp: 1 })

  app
    .use(
      cors({
        origin: (ctx) => {
          if (validDomains && validDomains.includes(ctx.headers.origin)) {
            return false
          }
          return ctx.headers.origin
        },
      })
    )
    .use(bodyParser())
    .use(websocket())
    .use(router.routes())
    .use(router.allowedMethods())
    .listen(port)
})

process.on("uncaughtException", (err) => {
  console.error(err)
})
