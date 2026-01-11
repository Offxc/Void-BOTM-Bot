import { ApplicationCommandOptionType } from "discord.js";
import type { SecondLevelChatInputCommand } from "..";
import contestAutocomplete from "../../../constants/autocompletes/contest";
import { parseContestDate } from "../../../constants/autocompletes/date";
import Emojis from "../../../constants/emojis";
import config from "../../../config";
import { Contest } from "../../../database/models/Contest.model";
import { setupJobs } from "../../../handlers/contestSubmissions";
import setupContestInteractions from "../../../handlers/contestSubmissions/setupContestInteractions";
import createCommand from "./create";
import { contestToEmbed } from "./list";

export default {
  name: "edit",
  description: "Edit a contest (use optional options)",
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: "contest",
      description: "The name of the contest you want to edit",
      autocomplete: contestAutocomplete,
      required: true,
    },
    ...createCommand.options.map(option => ({ ...option, required: false })),
  ],
  // eslint-disable-next-line complexity
  async execute(interaction) {
    const contest = await Contest.findOne({ contestId: interaction.options.getString("contest", true) });
    if (!contest) {
      return void interaction.reply({
        content: `${Emojis.ANGER} Contest not found, try again.`,
        ephemeral: true,
      });
    }

    const name = interaction.options.getString("name") ?? contest.name;
    const submissionType = contest.submissionType;
    const submissionOpenedDateInput = interaction.options.getString("submission_open_date");
    const submissionClosedDateInput = interaction.options.getString("submission_close_date");
    const votingOpenedDateInput = interaction.options.getString("voting_open_date");
    const votingClosedDateInput = interaction.options.getString("voting_close_date");
    const submissionOpenedDate = submissionOpenedDateInput ? parseContestDate(submissionOpenedDateInput) : contest.submissionOpenedDate;
    const submissionClosedDate = submissionClosedDateInput ? parseContestDate(submissionClosedDateInput) : contest.submissionClosedDate;
    const votingOpenedDate = votingOpenedDateInput ? parseContestDate(votingOpenedDateInput) : contest.votingOpenedDate;
    const votingClosedDate = votingClosedDateInput ? parseContestDate(votingClosedDateInput) : contest.votingClosedDate;
    const reviewChannelId = interaction.options.getChannel("review_channel")?.id ?? contest.reviewChannelId;
    const adminChannelId = config.adminChannelId || contest.adminChannelId;
    const submissionChannelId = interaction.options.getChannel("submission_channel")?.id ?? contest.submissionChannelId;
    const maxSubmissionsPerUser = interaction.options.getInteger("max_submissions_per_user") ?? contest.maxSubmissionsPerUser;
    const maxVotesPerUser = interaction.options.getInteger("max_votes_per_user") ?? contest.maxVotesPerUser;

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

    Object.assign(contest, { name, submissionType, submissionOpenedDate, submissionClosedDate, votingOpenedDate, votingClosedDate, reviewChannelId, adminChannelId, submissionChannelId, maxSubmissionsPerUser, maxVotesPerUser });
    await contest.save();

    setupContestInteractions(contest);
    setupJobs(contest, interaction.client);

    return void interaction.reply({
      content: `${Emojis.TICKYES} Successfully edited contest.`,
      embeds: [contestToEmbed(contest)],
    });
  },
} satisfies SecondLevelChatInputCommand;
