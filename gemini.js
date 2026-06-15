import { init } from "@heyputer/puter.js/src/init.cjs";

let puter = null;

const initPuter = () => {
  if (!puter) {
    const token = process.env.PUTER_API_TOKEN;
    if (!token) {
      throw new Error("PUTER_API_TOKEN is not defined in .env");
    }
    puter = init(token);
  }
  return puter;
};

const aiResponse = async (prompt) => {
  try {
    if (!prompt) {
      throw new Error("Prompt is required.");
    }

    const p = initPuter();

    const response = await p.ai.chat(prompt, {
      model: "gpt-4o-mini",
    });

    const text =
      response?.message?.content ||
      response?.text ||
      (typeof response === "string" ? response : null) ||
      "No response from AI.";

    return text;
  } catch (error) {
    console.error("Error in Puter AI call:", error);
    let errMsg = "Unknown error";
    if (error) {
      if (typeof error === "string") {
        errMsg = error;
      } else if (error.message) {
        errMsg = error.message;
      } else if (error.error) {
        errMsg = typeof error.error === "object" ? JSON.stringify(error.error) : String(error.error);
      } else {
        try {
          errMsg = JSON.stringify(error);
        } catch (e) {
          errMsg = String(error);
        }
      }
    }
    return `⚠️ AI Error: ${errMsg}`;
  }
};

export default aiResponse;
