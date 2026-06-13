import User from "../Models/user.model.js";

export const getUserData = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.log("Get user data error:", error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

export const customizeAssistant = async (req, res) => {
  try {
    const userId = req.userId;
    const { assistantName, assistantImageUrl } = req.body;

    if (!assistantName) {
      return res.status(400).json({
        message: "Assistant name is required",
      });
    }

    let assistantImage = assistantImageUrl;

    if (req.file) {
      assistantImage = `/public/${req.file.filename}`;
    }

    if (!assistantImage) {
      return res.status(400).json({
        message: "Assistant image is required",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      {
        assistantName,
        assistantImage,
      },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "Assistant customized successfully",
      user,
    });
  } catch (error) {
    console.log("Customize assistant error:", error);

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const clearChatHistory = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findByIdAndUpdate(
      userId,
      { history: [] },
      { new: true }
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    return res.status(200).json({
      message: "Chat history cleared successfully",
      user,
    });
  } catch (error) {
    console.log("Clear chat history error:", error);

    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};