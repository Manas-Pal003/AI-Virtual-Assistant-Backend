const geminiResponse = async (prompt) => {
  try {
    const apiUrl = process.env.GEMINI_API_URL;

    if (!apiUrl) {
      throw new Error("GEMINI_API_URL is not defined in environment variables.");
    }

    if (!prompt) {
      throw new Error("Prompt is required.");
    }

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || "Failed to get response from Gemini.");
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from Gemini.";

    return text;
  } catch (error) {
    console.error("Error in Gemini API call:", error.message);
    return "Sorry, something went wrong while getting AI response.";
  }
};

export default geminiResponse;