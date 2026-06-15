import aiResponse from "../gemini.js";
import YT from "youtube-sr";
import User from "../Models/user.model.js";
import { exec } from "child_process";
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
If the user asks you to open a website, search Google, play a video, or if they ask for live/recent information (such as cricket matches, sports updates, scores, weather, news, movie releases, etc.), you MUST trigger the action by appending the appropriate command tag on a new line at the very end of your response:
1. To open a website or search Google:
   [COMMAND: OPEN_URL: https://URL]
   Examples:
   - For "search cricket match": append [COMMAND: OPEN_URL: https://www.google.com/search?q=cricket+match]
   - For "open wikipedia": append [COMMAND: OPEN_URL: https://www.wikipedia.org]
2. To search or play a song/video on YouTube:
   [COMMAND: PLAY_YOUTUBE: search_query]
   Example:
   - For "play a song shape of you": append [COMMAND: PLAY_YOUTUBE: shape of you]

CRITICAL RULES:
1. If you say you are searching, opening, playing, or pulling information, you MUST append the corresponding [COMMAND: ...] tag. Never say "Searching now..." or "I'm checking..." without including the tag.
2. If you are answering a general knowledge question (e.g. "Who is Iron Man?"), answer directly in plain text without appending any command tags.
`;

    const reply = await aiResponse(prompt);

    const openUrlRegex = /\[COMMAND:\s*OPEN_URL:\s*(https?:\/\/[^\s\]]+)\]/i;
    const playYoutubeRegex = /\[COMMAND:\s*PLAY_YOUTUBE:\s*([^\]]+)\]/i;

    let cleanReply = reply;
    let commandUrl = null;

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

    await saveToHistory(req.userId, message, cleanReply, commandUrl);

    return res.status(200).json({
      type: commandUrl ? "command" : "ai",
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

