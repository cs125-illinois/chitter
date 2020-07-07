const path = require("path")
const webpack = require("webpack")

module.exports = {
  mode: "production",
  optimization: {
    minimize: false,
  },
  entry: "./server/index.ts",
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "server/dist"),
  },
  target: "node",
  resolve: {
    extensions: [".wasm", ".mjs", ".js", ".json", ".ts"],
    alias: {
      "chitter-types": path.resolve(__dirname, "types/"),
    },
  },
  externals: {
    bufferutil: "__client_only___",
    "mongodb-client-encryption": "__client_only___",
    "utf-8-validate": "__client_only__",
  },
  plugins: [new webpack.EnvironmentPlugin(["GIT_COMMIT", "npm_package_version"])],
}
