import type { MessageCreateOptions } from "discord.js";
import type { ContestSubmissionDocument } from "../../../database/models/ContestSubmission.model";
import Emojis from "../../../constants/emojis";
import { generateSubmissionEmbeds } from ".";

export default function generateWinnerMessage(placement: string, submission: ContestSubmissionDocument): MessageCreateOptions {
  const coordinates = submission.buildCoordinates?.trim();
  const lines = [
    `${Emojis.TADA} ${placement} place - <@${submission.authorId}>.`,
  ];

  if (coordinates) {
    lines.push(`Coordinates: ${coordinates}`);
  }

  return {
    content: lines.join("\n"),
    embeds: generateSubmissionEmbeds(submission),
    allowedMentions: { users: [submission.authorId] },
  };
}
