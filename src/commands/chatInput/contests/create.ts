import { ApplicationCommandOptionType, ButtonStyle, ComponentType } from "discord.js";
import type { ActionRow, FetchMessagesOptions, MessageActionRowComponent, SendableChannels, TextBasedChannel } from "discord.js";
import type { SecondLevelChatInputCommand } from "..";
import dateAutocomplete, { parseContestDate } from "../../../constants/autocompletes/date";
import Emojis from "../../../constants/emojis";
import config from "../../../config";
import { Contest } from "../../../database/models/Contest.model";
import { ContestSubmission } from "../../../database/models/ContestSubmission.model";
import { ContestVoteEntry } from "../../../database/models/ContestVoteEntry.model";
import { clearJobs, setupJobs } from "../../../handlers/contestSubmissions";
import setupContestInteractions from "../../../handlers/contestSubmissions/setupContestInteractions";
import { contestToEmbed } from "./list";

const messageFetchLimit = 100;

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

export default {
  name: "create",
  description: "Create a new contest",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "submission_open_date",
      description: "The date the submissions are opened (so people can submit)",
      autocomplete: dateAutocomplete,
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: "submission_close_date",
      description: "The date the submissions are closed (so people can't submit anymore)",
      autocomplete: dateAutocomplete,
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: "voting_open_date",
      description: "The date the voting is opened (so people can vote)",
      autocomplete: dateAutocomplete,
      required: true,
    },
    {
      type: ApplicationCommandOptionType.String,
      name: "voting_close_date",
      description: "The date the voting is closed (so people can't vote anymore)",
      autocomplete: dateAutocomplete,
      required: true,
    },
  ],
  async execute(interaction) {
    const name = "BOTM";
    const submissionOpenedDate = parseContestDate(interaction.options.getString("submission_open_date", true));
    const submissionClosedDate = parseContestDate(interaction.options.getString("submission_close_date", true));
    const votingOpenedDate = parseContestDate(interaction.options.getString("voting_open_date", true));
    const votingClosedDate = parseContestDate(interaction.options.getString("voting_close_date", true));
    const adminChannelId = config.adminChannelId;
    const submissionChannelId = config.votingChannelId;
    const maxSubmissionsPerUser = 1;
    const maxVotesPerUser = 1;
    const submissionButtonChannelId = config.submissionButtonChannelId;
    const submissionsClosedMessage = "Build of the Month submissions are now closed.";

    if (!submissionOpenedDate || !submissionClosedDate || !votingOpenedDate || !votingClosedDate) {
      return void interaction.reply({
        content: `${Emojis.ANGER} Invalid date`,
        ephemeral: true,
      });
    }

    if (submissionOpenedDate.getTime() > submissionClosedDate.getTime()) {
      return void interaction.reply({
        content: `${Emojis.ANGER} Submission open date must be before submission close date`,
        ephemeral: true,
      });
    }

    if (submissionClosedDate.getTime() > votingOpenedDate.getTime()) {
      return void interaction.reply({
        content: `${Emojis.ANGER} Submission close date must be before voting open date`,
        ephemeral: true,
      });
    }

    if (votingOpenedDate.getTime() > votingClosedDate.getTime()) {
      return void interaction.reply({
        content: `${Emojis.ANGER} Voting open date must be before voting close date`,
        ephemeral: true,
      });
    }

    const buttonChannel = submissionButtonChannelId
      ? interaction.client.channels.resolve(submissionButtonChannelId) as null | (SendableChannels & TextBasedChannel)
      : null;
    const votingChannel = submissionChannelId
      ? interaction.client.channels.resolve(submissionChannelId) as null | (SendableChannels & TextBasedChannel)
      : null;
    if (!submissionChannelId || !submissionButtonChannelId || !buttonChannel || !votingChannel) {
      return void interaction.reply({
        content: `${Emojis.ANGER} The voting or submission button channel is not configured correctly. Please check the bot configuration.`,
        ephemeral: true,
      });
    }

    await interaction.deferReply();

    const botUserId = interaction.client.user?.id;
    const existingContests = await Contest.find();

    const contest = new Contest({ name, submissionOpenedDate, submissionClosedDate, votingOpenedDate, votingClosedDate, adminChannelId, submissionChannelId, maxSubmissionsPerUser, maxVotesPerUser });
    await contest.save();

    const buttonMessage = await buttonChannel.send({
      components: [
        {
          type: ComponentType.ActionRow,
          components: [
            {
              type: ComponentType.Button,
              style: ButtonStyle.Primary,
              customId: `submit-contest-${contest.contestId}`,
              label: "Submit your Build of the Month",
            },
          ],
        },
      ],
    });

    contest.submissionButtonMessageId = buttonMessage.id;
    delete contest.submissionsClosedMessageId;
    await contest.save();

    for (const existingContest of existingContests) {
      const messageIds = [
        existingContest.submissionButtonMessageId,
        existingContest.submissionsClosedMessageId,
      ].filter(Boolean) as string[];

      for (const messageId of messageIds) {
        const message = await buttonChannel.messages.fetch(messageId).catch(() => null);
        if (message) {
          await message.delete().catch(() => null);
        }
      }

      if (botUserId) {
        const recentMessages = await buttonChannel.messages.fetch({ limit: 50 }).catch(() => null);
        if (recentMessages) {
          for (const message of recentMessages.values()) {
            if (message.author?.id !== botUserId) continue;
            const hasSubmitButton = message.components.some(row => {
              if (row.type !== ComponentType.ActionRow) return false;
              const actionRow = row as ActionRow<MessageActionRowComponent>;
              return actionRow.components.some(component =>
                component.type === ComponentType.Button &&
                "customId" in component &&
                component.customId === `submit-contest-${existingContest.contestId}`,
              );
            });
            const isClosedMessage = message.content.trim() === submissionsClosedMessage;
            if (hasSubmitButton || isClosedMessage) {
              await message.delete().catch(() => null);
            }
          }
        }
      }

      clearJobs(existingContest.contestId);
      await ContestSubmission.deleteMany({ contestId: existingContest.contestId });
      await ContestVoteEntry.deleteMany({ contestId: existingContest.contestId });
      await existingContest.deleteOne();
    }

    await clearChannelMessages(votingChannel);

    setupContestInteractions(contest);
    setupJobs(contest, interaction.client);

    return void interaction.editReply({
      content: `${Emojis.TICKYES} Successfully created a new contest.`,
      embeds: [contestToEmbed(contest)],
    });
  },
} satisfies SecondLevelChatInputCommand;
