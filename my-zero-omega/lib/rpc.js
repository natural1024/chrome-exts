// Tiny promise wrapper for chrome.runtime.sendMessage.
// Both popup and options page import this to talk to the service worker.

export function send(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, res => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      if (!res || !res.ok) {
        return reject(new Error((res && res.error) || 'Unknown error'));
      }
      resolve(res);
    });
  });
}
