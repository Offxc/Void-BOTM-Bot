import type { APIEmbed } from "discord.js";
import type { SecondLevelChatInputCommand } from "..";
import type { ContestDocument } from "../../../database/models/Contest.model";
import config from "../../../config";
import Emojis from "../../../constants/emojis";
import { Contest } from "../../../database/models/Contest.model";

export default {
  name: "list",
  description: "List all contests",
  async execute(interaction) {
    const contests = await Contest.find();
    if (!contests.length) {
      return void interaction.reply({
        content: `${Emojis.ANGER} There are no contests right now.`,
      });
    }

    const embeds = contests.map(contest => contestToEmbed(contest));
    return void interaction.reply({
      content: `${Emojis.SPARKLE} Showing ${contests.length} contests:`,
      embeds,
    });
  },
} satisfies SecondLevelChatInputCommand;

export function contestToEmbed(contest: ContestDocument): APIEmbed {
  const submissionOpen = Math.round(contest.submissionOpenedDate.getTime() / 1000);
  const submissionClose = Math.round(contest.submissionClosedDate.getTime() / 1000);
  const votingOpen = Math.round(contest.votingOpenedDate.getTime() / 1000);
  const votingClose = Math.round(contest.votingClosedDate.getTime() / 1000);
  const adminChannelId = contest.adminChannelId ?? config.adminChannelId;
  const maxSubmissionsPerUser = 1;
  const maxVotesPerUser = 1;

  return {
    title: contest.name,
    fields: [
      { name: "Admin channel", value: adminChannelId ? `<#${adminChannelId}>` : "Not set", inline: true },
      { name: "Voting channel", value: `<#${contest.submissionChannelId}>`, inline: true },
      { name: "Submission open date", value: `<t:${submissionOpen}:R>`, inline: true },
      { name: "Submission close date", value: `<t:${submissionClose}:R>`, inline: true },
      { name: "Submissions per user", value: String(maxSubmissionsPerUser), inline: true },
      { name: "Voting open date", value: `<t:${votingOpen}:R>`, inline: true },
      { name: "Voting close date", value: `<t:${votingClose}:R>`, inline: true },
      { name: "Votes per user", value: String(maxVotesPerUser), inline: true },
    ],
    color: parseInt(contest.contestId, 16),
  };
}
