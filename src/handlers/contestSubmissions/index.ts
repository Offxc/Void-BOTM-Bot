import type { Client, SendableChannels, TextBasedChannel } from "discord.js";
import type { ContestDocument } from "../../database/models/Contest.model";
import config from "../../config";
import Emojis from "../../constants/emojis";
import { Contest } from "../../database/models/Contest.model";
import { ContestSubmission, ContestSubmissionStatus } from "../../database/models/ContestSubmission.model";
import { ContestVoteEntry } from "../../database/models/ContestVoteEntry.model";
import mainLogger from "../../utils/logger/main";
import { testLink } from "../../utils/links";
import { generateSubmittedMessage, generateWinnerMessage } from "./messageGenerators";
import setupContestInteractions from "./setupContestInteractions";

export default function handleContestSubmissions(client: Client<true>): void {
  void Contest.find().then(contests => contests.forEach(contest => {
    setupContestInteractions(contest);
    setupJobs(contest, client);
  }));
}

const jobMap = new Map<string, NodeJS.Timeout[]>();
const timeoutOverflow = 2 ** 31 - 1;

export function setupJobs(contest: ContestDocument, client: Client): void {
  let jobs = jobMap.get(contest.contestId) ?? [];
  jobs.forEach(clearTimeout);
  jobs = [];

  const now = Date.now();

  const submissionEndRemaining = contest.submissionClosedDate.getTime() - now;
  if (submissionEndRemaining > 0) {
    if (submissionEndRemaining > timeoutOverflow) {
      mainLogger.warn(`Contest ${contest.contestId}'s submission ending time remaining is more than 32 bits; will try to set up jobs again in 24 hours.`);
      jobs.push(setTimeout(() => setupJobs(contest, client), 24 * 60 * 60 * 1000));
    } else jobs.push(setTimeout(() => onSubmissionEnd(contest, client), submissionEndRemaining));
  }

  const voteStartRemaining = contest.votingOpenedDate.getTime() - now;
  if (voteStartRemaining > 0) {
    if (voteStartRemaining > timeoutOverflow) {
      mainLogger.warn(`Contest ${contest.contestId}'s vote starting time remaining is more than 32 bits; will try to set up jobs again in 24 hours.`);
      jobs.push(setTimeout(() => setupJobs(contest, client), 24 * 60 * 60 * 1000));
    } else jobs.push(setTimeout(() => onVoteStart(contest, client), voteStartRemaining));
  }

  const voteEndRemaining = contest.votingClosedDate.getTime() - now;
  if (voteEndRemaining > 0) {
    if (voteEndRemaining >= timeoutOverflow) {
      mainLogger.warn(`Contest ${contest.contestId}'s vote ending time remaining is more than 32 bits; will try to set up jobs again in 24 hours.`);
      jobs.push(setTimeout(() => setupJobs(contest, client), 24 * 60 * 60 * 1000));
    } else jobs.push(setTimeout(() => onVoteEnd(contest, client), voteEndRemaining));
  }

  jobMap.set(contest.contestId, jobs);
}

function onSubmissionEnd(contest: ContestDocument, client: Client): void {
  const channel = client.channels.resolve(contest.submissionChannelId) as null | (SendableChannels & TextBasedChannel);
  if (!channel) return void mainLogger.warn(`Could not find channel ${contest.submissionChannelId} when trying to update voting results`);

  return void channel.send({
    content: `${Emojis.SPARKLE} The submission phase has ended for this contest.`,
  });
}

function onVoteStart(contest: ContestDocument, client: Client): void {
  const channel = client.channels.resolve(contest.submissionChannelId) as null | (SendableChannels & TextBasedChannel);
  if (!channel) return void mainLogger.warn(`Could not find channel ${contest.submissionChannelId} when trying to update voting results`);

  return void ContestSubmission.find({ contestId: contest.contestId }).then(async submissions => {
    const eligibleSubmissions = submissions.filter(submission => submission.status !== ContestSubmissionStatus.REJECTED);
    const pendingSubmissions = eligibleSubmissions
      .filter(submission => !testLink(submission.messageLink))
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());

    await channel.send({
      content: `${Emojis.SPARKLE} The voting phase has started for this contest, you can now go submit your votes.`,
    });

    for (const submission of pendingSubmissions) {
      const message = await channel.send(generateSubmittedMessage(submission));
      submission.messageLink = message.url;
      submission.status = ContestSubmissionStatus.APPROVED;
      await submission.save();
    }
  });
}

function onVoteEnd(contest: ContestDocument, client: Client): void {
  const channel = client.channels.resolve(contest.submissionChannelId) as null | (SendableChannels & TextBasedChannel);
  if (!channel) return void mainLogger.warn(`Could not find channel ${contest.submissionChannelId} when trying to update voting results`);
  const resolvedAdminChannelId = contest.adminChannelId ?? config.adminChannelId;
  const adminChannel = resolvedAdminChannelId
    ? client.channels.resolve(resolvedAdminChannelId) as null | (SendableChannels & TextBasedChannel)
    : null;
  if (resolvedAdminChannelId && !adminChannel) {
    mainLogger.warn(`Could not find channel ${resolvedAdminChannelId} when trying to post contest results`);
  }

  return void ContestSubmission.find({ contestId: contest.contestId }).then(async submissions => {
    mainLogger.info(`Updating voting results for contest ${contest.contestId} with ${submissions.length} submissions.`);
    const start = Date.now();
    await channel.send({
      content: `${Emojis.SPARKLE} Voting has ended for this contest, the results will be revealed in a moment.`,
    });
    const approvedSubmissions = submissions.filter(submission => submission.status === ContestSubmissionStatus.APPROVED);
    await Promise.all(approvedSubmissions.map(async submission => {
      const messageId = submission.messageLink.split("/").pop() ?? "";
      const message = await channel.messages.fetch(messageId).catch(() => null);
      if (!message) return void mainLogger.warn(`Could not find message ${submission.messageLink} when trying to update voting results`);

      return message.edit(generateSubmittedMessage(submission, true));
    }));

    if (adminChannel) {
      await adminChannel.send({
        content: `${Emojis.SPARKLE} Voting has ended for **${contest.name}**.`,
      });

      const voteEntries = await ContestVoteEntry.find({ contestId: contest.contestId });
      const voteCounts = new Map<string, number>();
      for (const entry of voteEntries) {
        voteCounts.set(entry.submissionId, (voteCounts.get(entry.submissionId) ?? 0) + 1);
      }

      const rankedSubmissions = approvedSubmissions
        .map(submission => ({ submission, votes: voteCounts.get(submission.submissionId) ?? 0 }))
        .sort((a, b) => {
          if (b.votes !== a.votes) return b.votes - a.votes;
          const timeDiff = a.submission.submittedAt.getTime() - b.submission.submittedAt.getTime();
          if (timeDiff !== 0) return timeDiff;
          return a.submission.submissionId.localeCompare(b.submission.submissionId);
        })
        .slice(0, 3);

      if (rankedSubmissions.length) {
        await adminChannel.send({
          content: `${Emojis.SPARKLE} Results for **${contest.name}**:`,
        });
        const placements = ["1st", "2nd", "3rd"];
        for (const [index, entry] of rankedSubmissions.entries()) {
          const placement = placements[index] ?? `${index + 1}th`;
          await adminChannel.send(generateWinnerMessage(placement, entry.submission));
        }
      }
    }
    mainLogger.info(`Updated voting results for contest ${contest.contestId} in ${Date.now() - start}ms.`);
  });
}
