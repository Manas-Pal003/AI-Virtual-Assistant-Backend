import aiResponse from "../gemini.js";
import YT from "youtube-sr";
import User from "../Models/user.model.js";
import { exec } from "child_process";
import os from "os";
const YouTube = YT.YouTube;

const openUrl = (url) => {
  // Try to open in Google Chrome first (since the user's project runs there).
  // Fall back to the system default browser if Chrome is not available.
  exec(`start chrome "${url}"`, (error) => {
    if (error) {
      exec(`start "" "${url}"`, (fallbackError) => {
        if (fallbackError) {
          console.error("Failed to open URL in fallback:", fallbackError);
        }
      });
    }
  });
};

const runShellCommand = (cmd) => {
  return new Promise((resolve) => {
    exec(cmd, (error, stdout) => {
      if (error) {
        resolve("");
      } else {
        resolve(stdout.trim());
      }
    });
  });
};

const saveToHistory = async (userId, userMessage, assistantReply, url = null) => {
  try {
    const messagesToPush = [
      { role: "user", text: userMessage },
      { role: "assistant", text: assistantReply }
    ];
    if (url) {
      messagesToPush[1].url = url;
    }
    await User.findByIdAndUpdate(userId, {
      $push: {
        history: {
          $each: messagesToPush
        }
      }
    }, { bufferCommands: false });
  } catch (err) {
    console.error("Failed to save to history:", err);
  }
};

export const askAssistant = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    const lowerMessage = message.toLowerCase();


    // --- OPEN WEBSITE COMMANDS ---
    if (lowerMessage.includes("open")) {
      const websites = {
        google: "https://www.google.com",
        youtube: "https://www.youtube.com",
        chatgpt: "https://chat.openai.com",
        "chat gpt": "https://chat.openai.com",
        gmail: "https://mail.google.com",
        github: "https://github.com",
        instagram: "https://www.instagram.com",
        facebook: "https://www.facebook.com",
        twitter: "https://x.com",
        x: "https://x.com",
        linkedin: "https://www.linkedin.com",
        whatsapp: "https://web.whatsapp.com",
        reddit: "https://www.reddit.com",
        amazon: "https://www.amazon.in",
        flipkart: "https://www.flipkart.com",
        netflix: "https://www.netflix.com",
        spotify: "https://open.spotify.com",
        wikipedia: "https://www.wikipedia.org",
        stackoverflow: "https://stackoverflow.com",
        "stack overflow": "https://stackoverflow.com",
        discord: "https://discord.com",
        telegram: "https://web.telegram.org",
        pinterest: "https://www.pinterest.com",
        canva: "https://www.canva.com",
        figma: "https://www.figma.com",
        notion: "https://www.notion.so",
        drive: "https://drive.google.com",
        "google drive": "https://drive.google.com",
        maps: "https://maps.google.com",
        "google maps": "https://maps.google.com",
        calendar: "https://calendar.google.com",
        puter: "https://puter.com",
      };

      // Try to match a known website
      for (const [name, url] of Object.entries(websites)) {
        if (lowerMessage.includes(name)) {
          const reply = `Opening ${name.charAt(0).toUpperCase() + name.slice(1)} for you.`;
          await saveToHistory(req.userId, message, reply, url);
          openUrl(url);
          return res.status(200).json({
            type: "command",
            url: url,
            reply: reply,
          });
        }
      }

      // Fallback: extract the site name and try to open it as a .com URL
      const siteName = message
        .replace(/open/gi, "")
        .replace(/please/gi, "")
        .replace(/for me/gi, "")
        .trim();

      if (siteName) {
        const cleanName = siteName.toLowerCase().replace(/\s+/g, "");
        const reply = `Opening ${siteName} for you.`;
        const url = `https://www.${cleanName}.com`;
        await saveToHistory(req.userId, message, reply, url);
        openUrl(url);
        return res.status(200).json({
          type: "command",
          url: url,
          reply: reply,
        });
      }
    }


    // --- PLAY SONG / VIDEO / SEARCH ON YOUTUBE ---
    if (
      lowerMessage.includes("play") ||
      (lowerMessage.includes("youtube") && lowerMessage.includes("search")) ||
      (lowerMessage.includes("song") && !lowerMessage.includes("search")) ||
      (lowerMessage.includes("music") && !lowerMessage.includes("search"))
    ) {
      const songQuery = message
        .replace(/play/gi, "")
        .replace(/search/gi, "")
        .replace(/a song for me/gi, "")
        .replace(/on youtube/gi, "")
        .replace(/youtube/gi, "")
        .replace(/please/gi, "")
        .replace(/for me/gi, "")
        .trim();

      if (songQuery) {
        // If explicitly asked to search, go to YouTube search results directly
        if (lowerMessage.includes("search")) {
          const reply = `Searching YouTube for "${songQuery}".`;
          const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
          await saveToHistory(req.userId, message, reply, url);
          openUrl(url);
          return res.status(200).json({
            type: "command",
            url: url,
            reply: reply,
          });
        }

        try {
          const results = await YouTube.search(songQuery, { limit: 1, type: "video" });

          if (results && results.length > 0) {
            const video = results[0];
            const watchUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
            const reply = `Playing "${video.title}" on YouTube for you.`;
            await saveToHistory(req.userId, message, reply, watchUrl);
            openUrl(watchUrl);
            return res.status(200).json({
              type: "command",
              url: watchUrl,
              reply: reply,
            });
          }
        } catch (ytError) {
          console.error("YouTube search error:", ytError.message);
        }

        // Fallback: open YouTube search results if direct search fails
        const reply = `Searching YouTube for "${songQuery}".`;
        const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
        await saveToHistory(req.userId, message, reply, url);
        openUrl(url);
        return res.status(200).json({
          type: "command",
          url: url,
          reply: reply,
        });
      }
    }

    if (
      lowerMessage.startsWith("search ") ||
      lowerMessage.includes("google search") ||
      lowerMessage.includes("search google") ||
      lowerMessage.includes("search on google")
    ) {
      const query = message
        .replace(/google search/gi, "")
        .replace(/search google/gi, "")
        .replace(/search on google/gi, "")
        .replace(/search for/gi, "")
        .replace(/search/gi, "")
        .replace(/google/gi, "")
        .trim();
      const reply = `Opening Google search for "${query}" right away.`;
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      await saveToHistory(req.userId, message, reply, url);
      openUrl(url);
      return res.status(200).json({
        type: "command",
        url: url,
        reply: reply,
      });
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "Asia/Kolkata",
    });
    const timeStr = now.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    });

    const assistantName = req.body.assistantName || "JARVIS";

    // Fetch user history for context
    let user = null;
    try {
      user = await User.findById(req.userId).setOptions({ bufferCommands: false });
    } catch (dbError) {
      console.warn("Database lookup failed (using offline fallback mode):", dbError.message);
    }
    let historyStr = "";
    if (user && user.history && user.history.length > 0) {
      const recentHistory = user.history.slice(-15);
      historyStr = recentHistory
        .map((msg) => `${msg.role === "user" ? "User" : assistantName}: ${msg.text}`)
        .join("\n");
    }

    const userName = user?.name ? user.name.split(" ")[0] : "Manas";

    // --- SYSTEM INFO COMMANDS (MEMORY/RAM) ---
    if (
      lowerMessage.includes("how much ram") ||
      lowerMessage.includes("check ram") ||
      lowerMessage.includes("check memory") ||
      (
        (lowerMessage.includes("ram") || lowerMessage.includes("memory")) &&
        (lowerMessage.includes("laptop") || lowerMessage.includes("computer") || lowerMessage.includes("system") || lowerMessage.includes("pc") || lowerMessage.includes("device"))
      )
    ) {
      const totalGb = Math.ceil(os.totalmem() / (1024 * 1024 * 1024));
      const freeGb = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);

      const reply = `${userName}, your laptop has a total of ${totalGb} GB of RAM, with ${freeGb} GB currently free and available. I am ready and happy to help!`;

      await saveToHistory(req.userId, message, reply);
      return res.status(200).json({
        type: "ai",
        reply: reply,
      });
    }

    // --- SYSTEM INFO COMMANDS (SPECIFICATIONS/SPEC) ---
    if (
      (
        (lowerMessage.includes("laptop") || lowerMessage.includes("computer") || lowerMessage.includes("system") || lowerMessage.includes("pc") || lowerMessage.includes("device")) &&
        (lowerMessage.includes("spec") || lowerMessage.includes("config") || lowerMessage.includes("detail") || lowerMessage.includes("hardware") || lowerMessage.includes("info") || lowerMessage.includes("properties"))
      ) ||
      lowerMessage.includes("system info") ||
      lowerMessage.includes("system details") ||
      lowerMessage.includes("system configuration") ||
      lowerMessage.includes("device info") ||
      lowerMessage.includes("device details")
    ) {
      const cpu = os.cpus()[0]?.model?.trim() || "Unknown Processor";
      const totalGb = Math.ceil(os.totalmem() / (1024 * 1024 * 1024));
      const freeGb = (os.freemem() / (1024 * 1024 * 1024)).toFixed(1);

      let osName = "Windows Operating System";
      if (os.platform() === "win32") {
        const osCaption = await runShellCommand("wmic os get Caption /Value");
        if (osCaption) {
          const match = osCaption.match(/Caption=(.+)/i);
          if (match) {
            osName = match[1].trim();
          }
        }
      } else if (os.platform() === "darwin") {
        osName = "macOS " + (await runShellCommand("sw_vers -productVersion"));
      } else {
        osName = "Linux " + (await runShellCommand("uname -r"));
      }

      // Storage
      let diskInfo = "";
      if (os.platform() === "win32") {
        const diskOutput = await runShellCommand("wmic logicaldisk where \"DeviceID='C:'\" get FreeSpace,Size /Value");
        if (diskOutput) {
          const sizeMatch = diskOutput.match(/Size=(\d+)/i);
          const freeMatch = diskOutput.match(/FreeSpace=(\d+)/i);
          if (sizeMatch && freeMatch) {
            const totalDisk = (parseInt(sizeMatch[1], 10) / (1024 * 1024 * 1024)).toFixed(1);
            const freeDisk = (parseInt(freeMatch[1], 10) / (1024 * 1024 * 1024)).toFixed(1);
            diskInfo = `• Storage (Drive C): ${totalDisk} GB total, with ${freeDisk} GB free.`;
          }
        }
      } else {
        const dfOutput = await runShellCommand("df -h / | tail -1");
        if (dfOutput) {
          const parts = dfOutput.split(/\s+/);
          if (parts.length >= 4) {
            diskInfo = `• Storage: ${parts[1]} total, with ${parts[3]} free.`;
          }
        }
      }

      let reply = `${userName}, here are the specifications of your laptop:\n`;
      reply += `• Operating System: ${osName}\n`;
      reply += `• Processor: ${cpu}\n`;
      reply += `• Installed Memory: ${totalGb} GB of RAM (${freeGb} GB free)\n`;
      if (diskInfo) {
        reply += `${diskInfo}\n`;
      }
      reply += `\nI am ready and happy to help!`;

      await saveToHistory(req.userId, message, reply);
      return res.status(200).json({
        type: "ai",
        reply: reply,
      });
    }

    // --- SYSTEM CANCEL SHUTDOWN COMMANDS ---
    if (
      lowerMessage === "cancel shutdown" ||
      lowerMessage === "abort shutdown" ||
      lowerMessage.includes("cancel the shutdown") ||
      lowerMessage.includes("abort the shutdown") ||
      lowerMessage.includes("stop the shutdown")
    ) {
      let cancelCmd = "";
      if (os.platform() === "win32") {
        cancelCmd = "shutdown /a";
      } else if (os.platform() === "darwin") {
        cancelCmd = "killall shutdown";
      } else {
        cancelCmd = "shutdown -c";
      }

      console.log(`Executing cancel shutdown command locally: ${cancelCmd}`);
      return new Promise((resolve) => {
        exec(cancelCmd, async (err) => {
          let reply = "";
          if (err) {
            console.error("Cancel shutdown command execution failed:", err);
            reply = `${userName}, I was unable to abort the shutdown. Perhaps no shutdown sequence was active.`;
          } else {
            reply = `${userName}, I have successfully aborted the system shutdown sequence. You are safe! I am ready and happy to help!`;
          }
          await saveToHistory(req.userId, message, reply);
          res.status(200).json({
            type: "cancel-shutdown",
            reply: reply,
          });
          resolve();
        });
      });
    }

    // --- SYSTEM SHUTDOWN COMMANDS ---
    if (
      lowerMessage === "shutdown" ||
      lowerMessage === "shut down" ||
      lowerMessage.includes("shutdown my") ||
      lowerMessage.includes("shut down my") ||
      lowerMessage.includes("turn off my laptop") ||
      lowerMessage.includes("turn off my computer") ||
      lowerMessage.includes("turn off my system") ||
      lowerMessage.includes("power off my laptop") ||
      lowerMessage.includes("power off my computer") ||
      lowerMessage.includes("power off my system")
    ) {
      const reply = `${userName}, I am shutting down the system now. Please save any unsaved work. I am ready and happy to help!`;
      await saveToHistory(req.userId, message, reply);

      let shutdownCmd = "";
      if (os.platform() === "win32") {
        shutdownCmd = "shutdown /s /t 10";
      } else if (os.platform() === "darwin") {
        shutdownCmd = "osascript -e 'tell app \"System Events\" to shut down'";
      } else {
        shutdownCmd = "shutdown -h now";
      }

      console.log(`Executing shutdown command locally: ${shutdownCmd}`);
      return new Promise((resolve) => {
        exec(shutdownCmd, (err) => {
          if (err) {
            console.error("Shutdown command execution failed:", err);
          }
          res.status(200).json({
            type: "shutdown",
            reply: reply,
          });
          resolve();
        });
      });
    }

    const prompt = `
You are ${assistantName}, a personal AI virtual assistant running on the user's system, designed in the style of Jarvis from Iron Man.

You are loyal, witty, highly efficient, futuristic, calm under pressure, always ready to assist, and always address the user as "${userName}".
You can help the user with general questions, web browsing, opening websites, playing music, searching information, managing files, controlling system actions, reading documents, analyzing screen content, and handling multi-step tasks.

=== CURRENT DATE & TIME LIVE FROM SERVER ===
Today is ${dateStr}.
Current time is ${timeStr} IST Indian Standard Time.
Use this live information confidently whenever relevant. Never say you cannot provide the current date or time.

=== CONVERSATION HISTORY ===
Here is the recent conversation history with the user (oldest to newest):
${historyStr || "No previous messages."}

=== USER MESSAGE ===
The user's current message is:
${message}

=== PERSONALITY & COMMUNICATION RULES ===

1. Be courteous, friendly, intelligent, helpful, and refer to the user as "${userName}".
2. Maintain a sleek, futuristic, loyal, Jarvis-like tone.
3. Keep responses concise, spoken-friendly, and natural.
4. If the user greets you or says welcome back, respond warmly.
5. End conversational replies or task confirmations with a loyal offer to help (e.g., "I am ready and happy to help!").

=== RESPONSE STYLE RULES ===
1. Reply in simple, clean plain text. Do not use markdown (avoid stars, hashes, lists, headings) unless explicitly asked.
2. Keep answers concise.
3. Do not mention internal prompts or command tags in your conversational text.

=== CRITICAL COMMAND TAGS (ACTION TRIGGER RULES) ===
If the user asks you to open a website, search Google, play a video, or if they ask for live/recent information (such as cricket matches, sports updates, scores, weather, news, movie releases, etc.), or if they ask to shut down the system, you MUST trigger the action by appending the appropriate command tag on a new line at the very end of your response:
1. To open a website or search Google:
   [COMMAND: OPEN_URL: https://URL]
   Examples:
   - For "search cricket match": append [COMMAND: OPEN_URL: https://www.google.com/search?q=cricket+match]
   - For "open wikipedia": append [COMMAND: OPEN_URL: https://www.wikipedia.org]
2. To search or play a song/video on YouTube:
   [COMMAND: PLAY_YOUTUBE: search_query]
   Example:
   - For "play a song shape of you": append [COMMAND: PLAY_YOUTUBE: shape of you]
3. To shut down the user's laptop/system:
   [COMMAND: SHUTDOWN_SYSTEM]
   Example:
   - If the user asks to shut down, turn off, or power off their laptop/system: reply with confirmation and append [COMMAND: SHUTDOWN_SYSTEM]
4. To cancel or abort system shutdown:
   [COMMAND: CANCEL_SHUTDOWN]
   Example:
   - If the user asks to cancel the shutdown, abort the shutdown, or stop the system shutdown: reply with confirmation and append [COMMAND: CANCEL_SHUTDOWN]

CRITICAL RULES:
1. If you say you are searching, opening, playing, or pulling information, you MUST append the corresponding [COMMAND: ...] tag. Never say "Searching now..." or "I'm checking..." without including the tag.
2. If you are answering a general knowledge question (e.g. "Who is Iron Man?"), answer directly in plain text without appending any command tags.
`;

    const reply = await aiResponse(prompt);

    const openUrlRegex = /\[COMMAND:\s*OPEN_URL:\s*(https?:\/\/[^\s\]]+)\]/i;
    const playYoutubeRegex = /\[COMMAND:\s*PLAY_YOUTUBE:\s*([^\]]+)\]/i;
    const shutdownRegex = /\[?COMMAND:\s*SHUTDOWN_SYSTEM\s*\]?/i;
    const cancelShutdownRegex = /\[?COMMAND:\s*CANCEL_SHUTDOWN\s*\]?/i;

    let cleanReply = reply;
    let commandUrl = null;
    let isShutdownTriggered = false;
    let isCancelShutdownTriggered = false;

    // Check for open URL command
    const openUrlMatch = reply.match(openUrlRegex);
    if (openUrlMatch) {
      const url = openUrlMatch[1];
      openUrl(url);
      commandUrl = url;
      cleanReply = cleanReply.replace(openUrlRegex, "").trim();
    }

    // Check for play YouTube command
    const playYoutubeMatch = reply.match(playYoutubeRegex);
    if (playYoutubeMatch) {
      const songQuery = playYoutubeMatch[1].trim();
      cleanReply = cleanReply.replace(playYoutubeRegex, "").trim();

      try {
        const results = await YouTube.search(songQuery, { limit: 1, type: "video" });
        if (results && results.length > 0) {
          const video = results[0];
          const watchUrl = video.url || `https://www.youtube.com/watch?v=${video.id}`;
          openUrl(watchUrl);
          commandUrl = watchUrl;
        } else {
          const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
          openUrl(searchUrl);
          commandUrl = searchUrl;
        }
      } catch (err) {
        console.error("YouTube search error inside command parsing:", err.message);
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
        openUrl(searchUrl);
        commandUrl = searchUrl;
      }
    }

    // Check for shutdown command
    const shutdownMatch = reply.match(shutdownRegex);
    if (shutdownMatch) {
      isShutdownTriggered = true;
      cleanReply = cleanReply.replace(shutdownRegex, "").trim();

      let shutdownCmd = "";
      if (os.platform() === "win32") {
        shutdownCmd = "shutdown /s /t 10";
      } else if (os.platform() === "darwin") {
        shutdownCmd = "osascript -e 'tell app \"System Events\" to shut down'";
      } else {
        shutdownCmd = "shutdown -h now";
      }

      console.log(`Executing shutdown command: ${shutdownCmd}`);
      await new Promise((resolve) => {
        exec(shutdownCmd, (err) => {
          if (err) {
            console.error("Shutdown command execution failed:", err);
          }
          resolve();
        });
      });
    }

    // Check for cancel shutdown command
    const cancelShutdownMatch = reply.match(cancelShutdownRegex);
    if (cancelShutdownMatch) {
      isCancelShutdownTriggered = true;
      cleanReply = cleanReply.replace(cancelShutdownRegex, "").trim();

      let cancelCmd = "";
      if (os.platform() === "win32") {
        cancelCmd = "shutdown /a";
      } else if (os.platform() === "darwin") {
        cancelCmd = "killall shutdown";
      } else {
        cancelCmd = "shutdown -c";
      }

      console.log(`Executing cancel shutdown command: ${cancelCmd}`);
      await new Promise((resolve) => {
        exec(cancelCmd, (err) => {
          if (err) {
            console.error("Cancel shutdown command execution failed:", err);
          }
          resolve();
        });
      });
    }

    await saveToHistory(req.userId, message, cleanReply, commandUrl);

    return res.status(200).json({
      type: isShutdownTriggered ? "shutdown" : (isCancelShutdownTriggered ? "cancel-shutdown" : (commandUrl ? "command" : "ai")),
      url: commandUrl,
      reply: cleanReply,
    });
  } catch (error) {
    console.error("Assistant controller error:", error);

    return res.status(500).json({
      message: "Assistant response failed",
      error: error.message,
    });
  }
};

export const cancelShutdown = async (req, res) => {
  try {
    let cancelCmd = "";
    if (os.platform() === "win32") {
      cancelCmd = "shutdown /a";
    } else if (os.platform() === "darwin") {
      cancelCmd = "killall shutdown";
    } else {
      cancelCmd = "shutdown -c";
    }

    console.log(`Executing cancel shutdown via API: ${cancelCmd}`);
    exec(cancelCmd, async (err) => {
      let userName = "Manas";
      try {
        const user = await User.findById(req.userId);
        if (user && user.name) {
          userName = user.name.split(" ")[0];
        }
      } catch (dbError) {
        console.warn("Database lookup failed during cancel shutdown:", dbError.message);
      }

      let reply = "";
      if (err) {
        console.warn("Cancel shutdown failed or no shutdown active:", err.message);
        reply = `${userName}, no active shutdown sequence was found to abort.`;
        return res.status(400).json({
          message: "No active shutdown sequence was found to abort.",
          reply: reply
        });
      }

      reply = `${userName}, I have successfully aborted the system shutdown sequence. You are safe!`;
      await saveToHistory(req.userId, "cancel shutdown", reply);

      return res.status(200).json({
        type: "cancel-shutdown",
        reply: reply,
      });
    });
  } catch (error) {
    console.error("Cancel shutdown error:", error);
    return res.status(500).json({
      message: "Internal server error while aborting shutdown",
      error: error.message,
    });
  }
};

