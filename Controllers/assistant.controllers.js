import geminiResponse from "../gemini.js";

export const askAssistant = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        message: "Message is required",
      });
    }

    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("open youtube")) {
      return res.status(200).json({
        type: "command",
        url: "https://www.youtube.com",
        reply: "Opening YouTube.",
      });
    }

    if (lowerMessage.includes("open google")) {
      return res.status(200).json({
        type: "command",
        url: "https://www.google.com",
        reply: "Opening Google.",
      });
    }

    if (lowerMessage.startsWith("search")) {
      const query = message.replace(/search/gi, "").trim();

      return res.status(200).json({
        type: "command",
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        reply: `Searching Google for ${query}.`,
      });
    }

    const reply = await geminiResponse(message);

    return res.status(200).json({
      type: "ai",
      reply,
    });
  } catch (error) {
    console.error("Assistant controller error:", error);

    return res.status(500).json({
      message: "Assistant response failed",
      error: error.message,
    });
  }
};