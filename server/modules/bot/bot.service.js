import flowTaskService from "../flowtask/flowtask.service.js";
import messageService from "../messages/message.service.js";
import channelRepository from "../channels/channel.repository.js";
import userRepository from "../users/user.repository.js";
import logger from "../../utils/logger.js";
import { BOT } from "../../config/constants.js";
import { sendToRasa } from "../../services/rasa.service.js";

/**
 * Bot Service — handles slash commands and automated messages.
 *
 * Slash commands (spec §9):
 *   /flowtask tasks    — List my tasks from FlowTask
 *   /flowtask status   — Show task status for a project channel
 *   /flowtask log      — Log time against a task
 *   /flowtask projects — List my projects
 *   /flowtask help     — Show available commands
 */

class BotService {
  constructor() {
    this.commands = new Map();
    this._registerCommands();
  }

  async processAIMessage(message, context) {
    try {
      const { userId, channelId } = context;

      // 1. Send to Rasa
      const rasaResponses = await sendToRasa(userId, message);

      if (!rasaResponses || rasaResponses.length === 0) {
        return null;
      }

      const botReply = rasaResponses[0].text;

      // 2. Save bot message in chat
      await messageService.sendMessage({
        channelId,
        authorId: userId,
        content: botReply,
        contentType: "bot",
        workspaceId: context.workspaceId,
        isBot: true,
      });

      return botReply;
    } catch (error) {
      logger.error("AI message failed", { error: error.message });
      return null;
    }
  }

  /**
   * Process a slash command message.
   * @param {string} commandText — Full text after /flowtask (e.g., "tasks", "status")
   * @param {object} context — { userId, channelId, flowTaskToken }
   * @returns {Promise<string>} Bot response message
   */
  async processCommand(commandText, context) {
    const parts = commandText.trim().split(/\s+/);
    const command = parts[0]?.toLowerCase();
    const args = parts.slice(1);

    const handler = this.commands.get(command);
    if (!handler) {
      return this._unknownCommand(command);
    }

    try {
      return await handler(args, context);
    } catch (error) {
      logger.error("Bot command failed", {
        command,
        error: error.message,
        userId: context.userId,
      });
      return `❌ Command failed: ${error.message}`;
    }
  }

  /**
   * Check if a message is a slash command.
   */
  isSlashCommand(content) {
    return content?.trim().startsWith("/flowtask");
  }

  /**
   * Extract command text from a slash command message.
   */
  extractCommand(content) {
    return content.trim().replace(/^\/flowtask\s*/i, "");
  }

  // ─── Command Registration ─────────────────────────────────────────────

  _registerCommands() {
    this.commands.set("tasks", this._tasksCommand.bind(this));
    this.commands.set("status", this._statusCommand.bind(this));
    this.commands.set("log", this._logCommand.bind(this));
    this.commands.set("projects", this._projectsCommand.bind(this));
    this.commands.set("help", this._helpCommand.bind(this));
  }

  // ─── /flowtask tasks ──────────────────────────────────────────────────

  async _tasksCommand(args, { flowTaskToken, userId }) {
    const user = await userRepository.findById(userId);
    if (!user) return "❌ User not found";

    // Fetch tasks from FlowTask API
    let boards;
    try {
      boards = await flowTaskService.getUserBoards(flowTaskToken);
    } catch {
      return "❌ Could not fetch your tasks from FlowTask. Try again later.";
    }

    if (!boards || boards.length === 0) {
      return "📋 You have no projects assigned in FlowTask.";
    }

    let response = `📋 **Your Tasks** (${user.name})\n\n`;

    for (const board of boards.slice(0, 5)) {
      response += `**${board.title}**\n`;

      if (board.cards?.length) {
        for (const card of board.cards.slice(0, 5)) {
          const status = card.status || "unknown";
          const icon =
            status === "done" ? "✅" : status === "in-progress" ? "🔄" : "⬜";
          response += `  ${icon} ${card.title}`;
          if (card.dueDate) {
            const due = new Date(card.dueDate);
            const isOverdue = due < new Date();
            response += ` | Due: ${due.toLocaleDateString()}${isOverdue ? " ⚠️ OVERDUE" : ""}`;
          }
          response += "\n";
        }
        if (board.cards.length > 5) {
          response += `  _...and ${board.cards.length - 5} more tasks_\n`;
        }
      } else {
        response += "  _No tasks_\n";
      }
      response += "\n";
    }

    if (boards.length > 5) {
      response += `_...and ${boards.length - 5} more projects_`;
    }

    return response;
  }

  // ─── /flowtask status ─────────────────────────────────────────────────

  async _statusCommand(args, { channelId, flowTaskToken }) {
    // Get channel to find linked project
    const channel = await channelRepository.findById(channelId);
    if (!channel) return "❌ Channel not found";

    if (channel.type !== "project" || !channel.flowTaskRef?.entityId) {
      return "⚠️ This command only works in project channels.";
    }

    let board;
    try {
      board = await flowTaskService.getBoard(
        channel.flowTaskRef.entityId,
        flowTaskToken,
      );
    } catch {
      return "❌ Could not fetch project status from FlowTask.";
    }

    if (!board) return "❌ Project not found in FlowTask.";

    // Calculate stats
    const allCards = board.lists?.flatMap((l) => l.cards || []) || [];
    const total = allCards.length;
    const done = allCards.filter(
      (c) => c.status === "done" || c.isCompleted,
    ).length;
    const inProgress = allCards.filter(
      (c) => c.status === "in-progress",
    ).length;
    const overdue = allCards.filter((c) => {
      if (!c.dueDate) return false;
      return new Date(c.dueDate) < new Date() && !c.isCompleted;
    }).length;

    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar =
      "█".repeat(Math.floor(progress / 10)) +
      "░".repeat(10 - Math.floor(progress / 10));

    let response = `📊 **Project Status: ${board.title}**\n\n`;
    response += `Progress: ${bar} ${progress}%\n\n`;
    response += `| Metric | Count |\n|--------|-------|\n`;
    response += `| Total Tasks | ${total} |\n`;
    response += `| ✅ Completed | ${done} |\n`;
    response += `| 🔄 In Progress | ${inProgress} |\n`;
    response += `| ⬜ To Do | ${total - done - inProgress} |\n`;
    if (overdue > 0) {
      response += `| ⚠️ Overdue | ${overdue} |\n`;
    }

    return response;
  }

  // ─── /flowtask log ────────────────────────────────────────────────────

  async _logCommand(args, { flowTaskToken, userId }) {
    // Usage: /flowtask log <taskId> <hours> [description]
    if (args.length < 2) {
      return "📝 **Usage:** `/flowtask log <taskId> <hours> [description]`\n\nExample: `/flowtask log 507f1f77bcf86cd799439011 2.5 Working on UI`";
    }

    const taskId = args[0];
    const hours = parseFloat(args[1]);
    const description = args.slice(2).join(" ") || "Time logged via chat";

    if (isNaN(hours) || hours <= 0 || hours > 24) {
      return "❌ Invalid hours. Must be a number between 0 and 24.";
    }

    try {
      await flowTaskService.logTime(
        taskId,
        {
          hours,
          description,
        },
        flowTaskToken,
      );

      return `⏱️ Logged **${hours}h** against task \`${taskId}\`: "${description}"`;
    } catch (error) {
      return `❌ Failed to log time: ${error.message}`;
    }
  }

  // ─── /flowtask projects ───────────────────────────────────────────────

  async _projectsCommand(args, { flowTaskToken }) {
    let boards;
    try {
      boards = await flowTaskService.getUserBoards(flowTaskToken);
    } catch {
      return "❌ Could not fetch projects from FlowTask.";
    }

    if (!boards || boards.length === 0) {
      return "📁 You have no projects in FlowTask.";
    }

    let response = "📁 **Your Projects**\n\n";

    for (const board of boards) {
      const channel = await channelRepository.findByFlowTaskRef(
        "board",
        board._id,
      );
      const channelLink = channel ? ` → #${channel.slug}` : "";
      response += `• **${board.title}**${channelLink}\n`;
    }

    return response;
  }

  // ─── /flowtask help ───────────────────────────────────────────────────

  async _helpCommand() {
    return (
      `🤖 **${BOT.NAME} Commands**\n\n` +
      "| Command | Description |\n" +
      "|---------|-------------|\n" +
      "| `/flowtask tasks` | List your assigned tasks |\n" +
      "| `/flowtask status` | Project status (in project channels) |\n" +
      "| `/flowtask log <taskId> <hours> [desc]` | Log time against a task |\n" +
      "| `/flowtask projects` | List your projects |\n" +
      "| `/flowtask help` | Show this help message |\n"
    );
  }

  // ─── Unknown Command ─────────────────────────────────────────────────

  _unknownCommand(command) {
    return `❓ Unknown command: \`${command}\`. Type \`/flowtask help\` for available commands.`;
  }
}

export default new BotService();
