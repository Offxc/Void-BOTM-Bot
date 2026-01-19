import { ApplicationCommandOptionType, ComponentType } from "discord.js";
import type { ActionRow, FetchMessagesOptions, MessageActionRowComponent, SendableChannels, TextBasedChannel } from "discord.js";
import type { SecondLevelChatInputCommand } from "..";
import contestAutocomplete from "../../../constants/autocompletes/contest";
import Emojis from "../../../constants/emojis";
import config from "../../../config";
import { Contest } from "../../../database/models/Contest.model";
import { ContestSubmission } from "../../../database/models/ContestSubmission.model";
import { ContestVoteEntry } from "../../../database/models/ContestVoteEntry.model";
import { clearJobs } from "../../../handlers/contestSubmissions";

const messageFetchLimit = 100;
const submissionsClosedMessage = "Build of the Month submissions are now closed.";

async function clearChannelMessages(channel: SendableChannels & TextBasedChannel): Promise<void> {
  let before: string | undefined;
  while (true) {
    const options: FetchMessagesOptions = { limit: messageFetchLimit };
    if (before) options.before = before;
    const messages = await channel.messages.fetch(options).catch(() => null);
    if (!messages || messages.size === 0) break;
    for (const message of messages.values()) {
      await message.delete().catch(() => null);
    }
    before = messages.last()?.id;
    if (!before) break;
  }
}

async function clearSubmissionButtonMessages(
  channel: SendableChannels & TextBasedChannel,
  contestId: string,
  messageIds: string[],
  botUserId?: string,
): Promise<void> {
  for (const messageId of messageIds) {
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (message) {
      await message.delete().catch(() => null);
    }
  }

  if (!botUserId) return;

  const recentMessages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (!recentMessages) return;

  for (const message of recentMessages.values()) {
    if (message.author?.id !== botUserId) continue;
    const isClosedMessage = message.content.trim() === submissionsClosedMessage;
    const hasSubmitButton = message.components.some(row => {
      if (row.type !== ComponentType.ActionRow) return false;
      const actionRow = row as ActionRow<MessageActionRowComponent>;
      return actionRow.components.some(component =>
        component.type === ComponentType.Button &&
        "customId" in component &&
        component.customId === `submit-contest-${contestId}`,
      );
    });
    if (hasSubmitButton || isClosedMessage) {
      await message.delete().catch(() => null);
    }
  }
}

export default {
  name: "remove",
  description: "Remove a contest",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "contest",
      description: "The name of the contest you want to edit",
      autocomplete: contestAutocomplete,
      required: true,
    },
  ],
  async execute(interaction) {
    const contest = await Contest.findOne({ contestId: interaction.options.getString("contest", true) });
    if (!contest) {
      return void interaction.reply({
        content: `${Emojis.ANGER} Contest not found, try again.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const adminChannelId = contest.adminChannelId ?? config.adminChannelId;
    const adminChannel = adminChannelId
      ? interaction.client.channels.resolve(adminChannelId) as null | (SendableChannels & TextBasedChannel)
      : null;
    const votingChannelId = config.votingChannelId || contest.submissionChannelId;
    const votingChannel = votingChannelId
      ? interaction.client.channels.resolve(votingChannelId) as null | (SendableChannels & TextBasedChannel)
      : null;
    const buttonChannelId = config.submissionButtonChannelId;
    const buttonChannel = buttonChannelId
      ? interaction.client.channels.resolve(buttonChannelId) as null | (SendableChannels & TextBasedChannel)
      : null;

    if (buttonChannel) {
      const messageIds = [
        contest.submissionButtonMessageId,
        contest.submissionsClosedMessageId,
      ].filter(Boolean) as string[];
      await clearSubmissionButtonMessages(buttonChannel, contest.contestId, messageIds, interaction.client.user?.id);
    }

    if (votingChannel) {
      await clearChannelMessages(votingChannel);
    }

    if (adminChannel) {
      await clearChannelMessages(adminChannel);
    }

    clearJobs(contest.contestId);
    await ContestSubmission.deleteMany({ contestId: contest.contestId });
    await ContestVoteEntry.deleteMany({ contestId: contest.contestId });
    await contest.deleteOne();

    return void interaction.editReply({
      content: `${Emojis.THUMBSUP} Contest removed.`,
    });
  },
} satisfies SecondLevelChatInputCommand;
