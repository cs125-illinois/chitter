import React, { useEffect, useState, useCallback, useRef } from "react"
import PropTypes from "prop-types"

import { v4 as uuidv4 } from "uuid"

// Note that we're already wrapped this component with a ChitterProvider in wrapRootElement.tsx
// So all we need here is the context provider and a type
import { RoomID, useChitter, SendChitterMessage, ReceiveChitterMessage, OutgoingChitterMessage } from "@cs125/chitter"
import { useGoogleUser, useBasicGoogleProfile } from "@cs125/react-google-login"

// Various bits of the Material UI framework
// We try to use this style of import since it leads to smaller bundles,
// but this is just an example component so it doesn't really matter that much
import makeStyles from "@material-ui/core/styles/makeStyles"

import { LoginButton } from "@cs125/gatsby-theme-cs125/src/react-google-login"
import { MarkdownMessages } from "./MarkdownMessages"
import { MarkdownTextField } from "./MarkdownTextField"

// Set up styles for the various parts of our little UI
// makeStyles allows us to use the passed theme as needed, which we don't do here (yet)

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const useStyles = makeStyles(_ => ({
  chitterer: {
    width: "100%",
    border: "1px solid grey",
    padding: 8,
    paddingRight: 0,
    position: "relative",
    overflow: "hidden",
    display: "flex",
    justifyContent: "flex-end",
    flexDirection: "column",
    height: 256,
    resize: "vertical",
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
  input: {
    display: "flex",
    flexDirection: "row",
  },
}))

export interface ChittererProps extends React.HTMLAttributes<HTMLDivElement> {
  room: RoomID
  email?: string
  name?: string
}

const gravatarOptions = {
  r: "pg",
  d: encodeURI("https://cs125.cs.illinois.edu/img/logos/cs125-with-border-120x120.png"),
}

export const Chitterer: React.FC<ChittererProps> = ({ room, ...props }) => {
  const { connected, join, leave } = useChitter()
  const { isSignedIn } = useGoogleUser()
  const { email: actualEmail, name: actualName } = useBasicGoogleProfile()
  const classes = useStyles()

  const componentID = useRef<string>(uuidv4())
  const sender = useRef<SendChitterMessage>()

  const email = props.email || actualEmail
  const name = props.name || actualName

  // useEffect hooks run after the initial render and then whenever their dependencies change
  // Here we join the room this component is configured to connect to
  // So far the callback we register just appends new messages to our array, which seems reasonable
  // but is something we may need to update later

  const [messages, setMessages] = useState<OutgoingChitterMessage[]>([])

  useEffect(() => {
    let listener: ReceiveChitterMessage | undefined
    if (connected) {
      listener = (message: OutgoingChitterMessage) => {
        if (message.messageType === "markdown" || message.messageType === "text") {
          setMessages(m => [message, ...m])
        }
      }
      sender.current = join(componentID.current, room, listener)
    }
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      listener && leave(componentID.current, listener)
    }
  }, [connected, join, leave, room, setMessages])

  const onNewMessage = useCallback(
    (contents: string) => sender.current && sender.current("markdown", contents, { email, name }),
    [email, name]
  )

  // Pass props through to the top-level div to allow external styling
  return (
    <div className={classes.chitterer} {...props}>
      {!isSignedIn ? (
        <div className={classes.login}>
          <LoginButton />
        </div>
      ) : (
        <MarkdownMessages messages={messages} email={email as string} gravatarOptions={gravatarOptions} />
      )}
      <MarkdownTextField
        onNewMessage={onNewMessage}
        email={email as string}
        gravatarOptions={gravatarOptions}
        placeholder="Send"
      />
    </div>
  )
}

Chitterer.propTypes = {
  room: PropTypes.string.isRequired,
  style: PropTypes.any,
  email: PropTypes.string,
  name: PropTypes.string,
}
