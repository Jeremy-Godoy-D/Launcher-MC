declare module '*.yaml' {
  const messages: import('./store').Messages
  export default messages
}
