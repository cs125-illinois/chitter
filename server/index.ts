/* eslint-disable @typescript-eslint/no-unused-vars */

import Koa from "koa"
import Router from "koa-router"
import bodyParser from "koa-bodyparser"
import websocket from "koa-easy-ws"

import { MongoClient as mongo } from "mongodb"
import mongodbUri from "mongodb-uri"

import { OAuth2Client } from "google-auth-library"

import WebSocket from "ws"
import { PongWS, filterPingPongMessages } from "@cs125/pingpongws"

import { EventEmitter } from "events"

import { ConnectionQuery, Versions, JoinMessage, RoomsMessage, ChitterMessage, ReceiveChitterMessage } from "../types"

import { String, Array } from "runtypes"
const VERSIONS = {
  commit: String.check(process.env.GIT_COMMIT),
  server: String.check(process.env.npm_package_version),
}

// Set up Koa instance and router
const app = new Koa()
const router = new Router<Record<string, unknown>, { ws: () => Promise<WebSocket> }>()

const googleClientIDs = Array(String).check(process.env.GOOGLE_CLIENT_IDS?.split(",").map((s) => s.trim()))
const googleClient = new OAuth2Client(googleClientIDs[0])

const { database } = mongodbUri.parse(process.env.MONGODB as string)
const client = mongo.connect(process.env.MONGODB as string, { useNewUrlParser: true, useUnifiedTopology: true })
// Unfortunately node still doesn't allow await at the top level, meaning that this either has to be a promise
// or be passed around throughout our app
// We've chosen this approach but it creates an additional promise chain you need to follow each time you want to use
// the collection, like this:
// await (await chitterCollection).insert(...
// Gross, but it works
const chitterCollection = client.then((c) => c.db(database).collection(process.env.MONGODB_COLLECTION || "chitter"))

// Possible useful type aliases, just to make our mappings and function declarations more clear
type ClientID = string
type RoomID = string

// We use a single event emitter to distribute messages between connected clients
const messager = new EventEmitter()

router.get("/", async (ctx) => {
  const connectionQuery = ConnectionQuery.check(ctx.request.query)
  const { version, commit, googleToken } = connectionQuery

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

  // Fail if we can't obtain an email address
  // Eventually add CS 125 membership check here as well
  let email
  try {
    email = (await googleClient.verifyIdToken({ idToken: googleToken, audience: googleClientIDs || [] })).getPayload()
      ?.email
  } catch (err) {}
  ctx.assert(email !== undefined, 400, "Login required")
  console.log(email)

  const ws = PongWS(await ctx.ws())
  const roomListeners: Record<RoomID, ReceiveChitterMessage> = {}

  ws.addEventListener(
    "message",
    filterPingPongMessages(async ({ data }) => {
      // Handle incoming messages here
      const message = JSON.parse(data.toString())
      if (JoinMessage.guard(message)) {
        if (!roomListeners[message.roomID]) {
          const listener = (message: ChitterMessage) => {
            ws.send(JSON.stringify(message))
          }
          messager.addListener(message.roomID, listener)
          roomListeners[message.roomID] = listener
        }

        const roomsMessage = RoomsMessage.check({ type: "rooms", rooms: Object.keys(roomListeners) })
        ws.send(JSON.stringify(roomsMessage))
      } else if (ChitterMessage.guard(message)) {
        messager.emit(message.room, message)
      } else {
        // As long as the if-else above is exhaustive over all possible messages we expect to receive from the client
        // this is a good sanity check
        console.error(`Bad message: ${JSON.stringify(message, null, 2)}`)
      }
    })
  )
  ws.addEventListener("close", () => {
    try {
      ws.terminate()
    } catch (err) {}

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

  const port = process.env.BACKEND_PORT ? parseInt(process.env.BACKEND_PORT) : 8888
  app.use(bodyParser()).use(websocket()).use(router.routes()).use(router.allowedMethods()).listen(port)
})

process.on("uncaughtException", (err) => {
  console.error(err)
})
