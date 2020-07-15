import React, { useEffect, useState, useCallback, useRef } from "react"
import PropTypes from "prop-types"

import { v4 as uuidv4 } from "uuid"

// Note that we're already wrapped this component with a ChitterProvider in wrapRootElement.tsx
// So all we need here is the context provider and a type
import { RoomID, useChitter, SendChitterMessage, ChitterMessage, ReceiveChitterMessage } from "@cs125/chitter"
import { useGoogleUser } from "@cs125/react-google-login"

// Various bits of the Material UI framework
// We try to use this style of import since it leads to smaller bundles,
// but this is just an example component so it doesn't really matter that much
import makeStyles from "@material-ui/core/styles/makeStyles"
import { P } from "@cs125/gatsby-theme-cs125/src/material-ui"
import TextField from "@material-ui/core/TextField"
import { CSSProperties } from "@material-ui/core/styles/withStyles"

import { LoginButton } from "@cs125/gatsby-theme-cs125/src/react-google-login"

// Set up styles for the various parts of our little UI
// makeStyles allows us to use the passed theme as needed, which we don't do here (yet)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const useStyles = makeStyles(_ => ({
  chitterer: {
    width: "100%",
    border: "1px solid grey",
    padding: 8,
    position: "relative",
  },
  login: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4);",
    display: "flex",
    zIndex: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  messages: {
    display: "flex",
    flexDirection: "column-reverse",
    maxHeight: 128,
    overflowY: "scroll",
  },
  message: {
    flex: 1,
  },
  input: {
    width: "100%",
  },
}))

export interface ChittererProps {
  room: RoomID
  style: CSSProperties
}
export const Chitterer: React.FC<ChittererProps> = ({ room, ...props }) => {
  const componentID = useRef<string>(uuidv4())

  const { connected, join, leave } = useChitter()
  const { isSignedIn } = useGoogleUser()

  const classes = useStyles()

  const [messages, setMessages] = useState<ChitterMessage[]>([])

  // useEffect hooks run after the initial render and then whenever their dependencies change
  // Here we join the room this component is configured to connect to
  // So far the callback we register just appends new messages to our array, which seems reasonable
  // but is something we may need to update later
  const sender = useRef<SendChitterMessage>()

  useEffect(() => {
    let listener: ReceiveChitterMessage | undefined
    if (connected) {
      listener = (message: ChitterMessage) => {
        setMessages(m => [message, ...m])
      }
      sender.current = join(componentID.current, room, listener)
    }
    return () => {
      listener && leave(room, listener)
    }
  }, [connected, join, leave, room, setMessages])

  // Callbacks for our input element below
  // You can define these right on the element itself, but then they are recreated on every render
  // So using the useCallback hook is slightly more efficient, and maybe a bit clearer
  const [input, setInput] = useState("")

  // We control the value of the input box, so each time it changes we need to update our copy
  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setInput(event.target.value)
  }, [])

  // We want enter to trigger sending the message, but also want to allow Control-Enter to advance
  // to the next line
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>, contents: string) => {
      if (event.key == "Enter") {
        if (!event.ctrlKey) {
          // Eventually we'll want the context provider to assemble the message, since it maintains the client ID
          // For now we'll mock out something so that we can insert it into our array
          const newMessage = ChitterMessage.check({
            type: "message",
            id: uuidv4(),
            clientID: "",
            room,
            messageType: "text",
            contents,
          })
          // TODO: Actually send the message
          // For now, just add it to our message list
          sender.current && sender.current(newMessage)
          setInput("")
        } else {
          setInput(i => i + "\n")
        }
        // Prevent the default event from bubbling upward
        event.preventDefault()
      }
    },
    [room]
  )

  return (
    <div className={classes.chitterer} {...props}>
      {!isSignedIn ? (
        <div className={classes.login}>
          <LoginButton />
        </div>
      ) : (
        <div className={classes.messages}>
          {messages.map((message, i) => (
            <div key={i} className={classes.message}>
              <P>{message.contents}</P>
            </div>
          ))}
        </div>
      )}
      <TextField
        value={input}
        className={classes.input}
        placeholder="Send"
        multiline
        onChange={onChange}
        onKeyDown={e => onKeyDown(e, input)}
      />
    </div>
  )
}

Chitterer.propTypes = {
  room: PropTypes.string.isRequired,
}
