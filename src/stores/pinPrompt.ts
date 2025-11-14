import { writable } from 'svelte/store'

export interface PinPromptRequest {
  message: string
  allowCancel: boolean
  resolve: (value: string | null) => void
}

const pinPromptStore = writable<PinPromptRequest | null>(null)

export const pinPrompt = {
  subscribe: pinPromptStore.subscribe,
}

export function requestPinModal(message: string, allowCancel: boolean): Promise<string | null> {
  return new Promise(resolve => {
    pinPromptStore.set({
      message,
      allowCancel,
      resolve: value => {
        resolve(value)
        pinPromptStore.set(null)
      },
    })
  })
}

export function closePinPrompt(value: string | null): void {
  pinPromptStore.update(current => {
    if (current) {
      current.resolve(value)
    }
    return null
  })
}
