import { ApplicationCommandOptionType, ChannelType } from "discord.js";
import type { SecondLevelChatInputCommand } from "..";
import dateAutocomplete, { parseContestDate } from "../../../constants/autocompletes/date";
import Emojis from "../../../constants/emojis";
import config from "../../../config";
import { Contest } from "../../../database/models/Contest.model";
import { setupJobs } from "../../../handlers/contestSubmissions";
import setupContestInteractions from "../../../handlers/contestSubmissions/setupContestInteractions";
import { contestToEmbed } from "./list";

export default {
  name: "create",
  description: "Create a new contest",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "name",
      description: "The name of the contest",
      required: true,
    },
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
    {
      type: ApplicationCommandOptionType.Channel,
      name: "voting_channel",
      description: "The channel to post contest entries for voting",
      channelTypes: [
        ChannelType.PrivateThread,
        ChannelType.PublicThread,
        ChannelType.GuildText,
      ],
      required: true,
    },
  ],
  async execute(interaction) {
    const name = interaction.options.getString("name", true);
    const submissionOpenedDate = parseContestDate(interaction.options.getString("submission_open_date", true));
    const submissionClosedDate = parseContestDate(interaction.options.getString("submission_close_date", true));
    const votingOpenedDate = parseContestDate(interaction.options.getString("voting_open_date", true));
    const votingClosedDate = parseContestDate(interaction.options.getString("voting_close_date", true));
    const adminChannelId = config.adminChannelId;
    const submissionChannelId = interaction.options.getChannel("voting_channel", true).id;
    const maxSubmissionsPerUser = 1;
    const maxVotesPerUser = 1;

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

    const contest = new Contest({ name, submissionOpenedDate, submissionClosedDate, votingOpenedDate, votingClosedDate, adminChannelId, submissionChannelId, maxSubmissionsPerUser, maxVotesPerUser });
    await contest.save();

    setupContestInteractions(contest);
    setupJobs(contest, interaction.client);

    return void interaction.reply({
      content: `${Emojis.TICKYES} Successfully created a new contest.`,
      embeds: [contestToEmbed(contest)],
    });
  },
} satisfies SecondLevelChatInputCommand;
