import React from "react"
import { GatsbyBrowser, WrapPageElementBrowserArgs } from "gatsby"

import { WithGoogleTokens } from "@cs125/react-google-login"
import { ChitterProvider } from "@cs125/chitter"

import { String } from "runtypes"
const CHITTER_SERVER = String.check(process.env.CHITTER_SERVER)

console.log(`CHITTER_SERVER: ${CHITTER_SERVER}`)

export const wrapPageElement: GatsbyBrowser["wrapPageElement"] = ({ element }: WrapPageElementBrowserArgs) => (
  <WithGoogleTokens>
    {({ idToken }) => {
      return (
        <ChitterProvider server={CHITTER_SERVER} googleToken={idToken}>
          {element}
        </ChitterProvider>
      )
    }}
  </WithGoogleTokens>
)
