import botService from "./bot.service.js";
import asyncHandler from "../../middleware/asyncHandler.js";

/**
 * Bot Controller — handles slash command HTTP endpoint.
 */

/**
 * POST /api/chat/bot/command
 * Process a slash command.
 */

export const processCommand = asyncHandler(async (req, res) => {
  const { command, channelId } = req.body;

  if (!command) {
    return res.status(400).json({
      success: false,
      error: { message: "command is required" },
    });
  }

  const response = await botService.processCommand(command, {
    userId: req.user._id,
    channelId,
    flowTaskToken: req.flowTaskToken,
  });

  res.json({
    success: true,
    data: { response },
  });
});
