const SERVER_URL = "http://localhost:49152/download";

// Send URL to Desktop App
async function sendUrlToDesktop(url) {
  try {
    const response = await fetch(SERVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: url, autoDownload: true })
    });
    
    if (response.ok) {
      console.log("URL sent successfully!");
    } else {
      console.error("Failed to send URL to desktop app.");
    }
  } catch (error) {
    console.error("Network error. Is the GrabCut app running?", error);
  }
}

// Setup Context Menu on Install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "send-to-airdrop",
    title: "Send Video Link to GrabCut",
    contexts: ["page", "video", "link"]
  });
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send-to-airdrop") {
    const targetUrl = info.linkUrl || info.srcUrl || info.pageUrl;
    if (targetUrl) {
      sendUrlToDesktop(targetUrl);
    }
  }
});
