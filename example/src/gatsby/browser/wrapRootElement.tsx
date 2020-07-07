import React from "react"
import { GatsbyBrowser, WrapRootElementBrowserArgs } from "gatsby"

import { ChitterProvider } from "@cs125/chitter"

import { String } from "runtypes"
const CHITTER_SERVER = String.check(process.env.CHITTER_SERVER)

console.log(`CHITTER_SERVER: ${CHITTER_SERVER}`)

export const wrapRootElement: GatsbyBrowser["wrapRootElement"] = ({ element }: WrapRootElementBrowserArgs) => {
  return <ChitterProvider server={CHITTER_SERVER}>{element}</ChitterProvider>
}
