import type { PlasmoMessaging } from "@plasmohq/messaging"

/**
 * Background service worker for Fiber
 * Handles extension lifecycle and messaging
 */

// Listen for extension installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("Fiber installed")
  }
})

// Optional: Handle messages from content scripts or popup
export const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  // Handle any background tasks here
  res.send({
    success: true
  })
}

