/**
 * A bot says PASS when the message it just read needs nothing from it. Rooms have honored this from the start; direct
 * messages did not, so every acknowledgement a bot wrote was posted back and woke the other bot for another turn.
 */
export const isSilentReply = (text: string) => /^\s*PASS\.?\s*$/i.test(text)
