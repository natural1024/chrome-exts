// Tiny promise wrapper for chrome.runtime.sendMessage.
// Both popup and options page import this to talk to the service worker.

import { AnyRequest, ErrResponse } from './constants';

/**
 * Send an RPC message to the service worker. Resolves with the parsed
 * response (guaranteed `ok: true`), or rejects with an Error whose message
 * carries either `chrome.runtime.lastError.message` or the server's
 * `{ ok: false, error }` payload.
 *
 * The response payload varies by request type — callers should cast the
 * return value to the specific response interface they expect.
 */
export function send<TResponse extends { ok: true } = { ok: true }>(
  msg: AnyRequest
): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, (res: TResponse | ErrResponse | undefined) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!res || !res.ok) {
        const err = (res && (res as ErrResponse).error) || 'Unknown error';
        return reject(new Error(err));
      }
      resolve(res);
    });
  });
}
